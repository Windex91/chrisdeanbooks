import {isPending,DRAGON_PAPERBACK} from './preorders.js';
import {ITEMS,json,stripeGet} from './commerce.js';
import {validateAdminMutation} from './admin-auth.js';
const physicalSkus=Object.keys(ITEMS).filter(s=>ITEMS[s].physical&&!ITEMS[s].stockSku);
export const REASONS=['in_person_sale','restock','giveaway','complimentary','damaged','manual_correction'];
const STATES=['awaiting_dispatch','dispatched','fulfilled'];
const parse=(s,fallback)=>{try{return JSON.parse(s)||fallback;}catch{return fallback;}};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function adjustment(body){
  if(!physicalSkus.includes(body.sku)||!REASONS.includes(body.reason)||!Number.isSafeInteger(body.expectedStock)||!Number.isSafeInteger(body.expectedReserved)||!Number.isSafeInteger(body.quantity)||body.quantity<0||body.quantity>100000||typeof body.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(body.requestId)||typeof body.note!=='string'||body.note.length>300)throw fail('Invalid stock adjustment.');
  if(body.expectedStock<0||body.expectedReserved<0||body.quantity<body.expectedReserved)throw fail('Stock cannot be lower than the quantity reserved for checkout.');
  const delta=body.quantity-body.expectedStock;
  if(delta===0)throw fail('Stock has not changed.');
  if(body.reason==='restock'&&delta<0)throw fail('Restocking must increase stock.');
  if(['in_person_sale','giveaway','complimentary','damaged'].includes(body.reason)&&delta>0)throw fail('This reason must decrease stock.');
  return body.reason==='in_person_sale'?-delta:0;
}
export async function adjustStock(db,body,actor){
  const sold=adjustment(body);
  if(body.sku===DRAGON_PAPERBACK&&isPending(body.sku)){const stock=await db.prepare('SELECT sold FROM inventory WHERE sku=?').bind(body.sku).first();if(!stock||body.quantity+stock.sold>30)throw fail('Paperback pre-orders are capped at 30 copies.');}
  const existing=await db.prepare('SELECT * FROM inventory_history WHERE id=?').bind(body.requestId).first();
  if(existing){if(existing.sku!==body.sku||existing.new_stock!==body.quantity||existing.reason!==body.reason||existing.actor!==actor)throw fail('Request identifier already used.',409);return;}
  const result=await db.batch([
    db.prepare('INSERT INTO inventory_history (id,sku,previous_stock,new_stock,reason,actor,note) SELECT ?,sku,on_hand,?,?,?,? FROM inventory WHERE sku=? AND on_hand=? AND reserved=? AND reserved<=?').bind(body.requestId,body.quantity,body.reason,actor,body.note,body.sku,body.expectedStock,body.expectedReserved,body.quantity),
    db.prepare('UPDATE inventory SET on_hand=?,sold=sold+?,updated_at=CURRENT_TIMESTAMP WHERE sku=? AND on_hand=? AND reserved=? AND EXISTS (SELECT 1 FROM inventory_history WHERE id=?)').bind(body.quantity,sold,body.sku,body.expectedStock,body.expectedReserved,body.requestId)
  ]);
  if(result[0].meta.changes!==1||result[1].meta.changes!==1)throw fail('Stock changed while you were editing. Refresh and try again.',409);
}
async function fulfilOrder(db,b,actor){
  if(typeof b.sessionId!=='string'||!/^cs_[A-Za-z0-9_]{8,240}$/.test(b.sessionId)||!STATES.includes(b.status)||typeof b.tracking!=='string'||!/^[A-Za-z0-9 -]{0,60}$/.test(b.tracking)||!Number.isSafeInteger(b.version)||b.version<0||typeof b.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(b.requestId))throw fail('Invalid fulfilment update.');
  const order=await db.prepare('SELECT items_json FROM orders WHERE session_id=?').bind(b.sessionId).first();
  if(!order||!parse(order.items_json,[]).some(i=>i.physical))throw fail('Only physical orders require dispatch.');
  const previousRequest=await db.prepare('SELECT * FROM admin_order_history WHERE id=?').bind(b.requestId).first();
  if(previousRequest){if(previousRequest.session_id!==b.sessionId||previousRequest.new_status!==b.status||previousRequest.new_tracking!==b.tracking.trim()||previousRequest.actor!==actor)throw fail('Request identifier already used.',409);return;}
  const old=await db.prepare('SELECT * FROM order_fulfilment WHERE session_id=?').bind(b.sessionId).first();
  if((old?.version||0)!==b.version)throw fail('Order changed. Refresh and try again.',409);
  // The audit INSERT uses the same version predicate as the update. D1.batch is atomic.
  const r=await db.batch([
    db.prepare("INSERT INTO admin_order_history (id,session_id,actor,previous_status,new_status,previous_tracking,new_tracking) SELECT ?,?,?,COALESCE((SELECT status FROM order_fulfilment WHERE session_id=?),'awaiting_dispatch'),?,COALESCE((SELECT tracking FROM order_fulfilment WHERE session_id=?),''),? WHERE COALESCE((SELECT version FROM order_fulfilment WHERE session_id=?),0)=?").bind(b.requestId,b.sessionId,actor,b.sessionId,b.status,b.sessionId,b.tracking.trim(),b.sessionId,b.version),
    db.prepare('INSERT INTO order_fulfilment (session_id,status,tracking) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM admin_order_history WHERE id=?) ON CONFLICT(session_id) DO UPDATE SET status=excluded.status,tracking=excluded.tracking,version=order_fulfilment.version+1,updated_at=CURRENT_TIMESTAMP WHERE order_fulfilment.version=?').bind(b.sessionId,b.status,b.tracking.trim(),b.requestId,b.version)
  ]);
  if(r[0].meta.changes!==1||r[1].meta.changes!==1)throw fail('Order changed. Refresh and try again.',409);
}
export async function adminApi({request,env,data}){
  if(!data?.adminEmail)return json({error:'Authentication required'},403);
  if(!env.ORDERS)return json({error:'Inventory database is not configured'},503);
  const db=env.ORDERS,url=new URL(request.url),route=url.pathname.replace(/\/$/,'').split('/').pop();
  try{
    if(request.method==='POST'){
      try{validateAdminMutation(request,env);}catch{return json({error:'Forbidden request'},403);}
      const text=await request.text();if(text.length>4096)return json({error:'Request too large'},413);
      let body;try{body=JSON.parse(text);}catch{throw fail('Invalid JSON');}if(!body||typeof body!=='object')throw fail('Invalid request');
      if(route==='inventory')await adjustStock(db,body,data.adminEmail);
      else if(route==='orders')await fulfilOrder(db,body,data.adminEmail);
      else return json({error:'Not found'},404);
      return json({saved:true});
    }
    if(request.method!=='GET')return json({error:'Method not allowed'},405);
    if(route==='overview'){
      const stock=(await db.prepare('SELECT sku,on_hand,reserved,sold,updated_at FROM inventory ORDER BY sku').all()).results;
      const outstanding=await db.prepare("SELECT COUNT(*) AS count FROM orders o LEFT JOIN order_fulfilment f ON f.session_id=o.session_id WHERE COALESCE(f.status,'awaiting_dispatch')!='fulfilled' AND EXISTS(SELECT 1 FROM json_each(o.items_json) WHERE json_extract(value,'$.physical')=1) AND NOT EXISTS (SELECT 1 FROM order_payments p JOIN revoked_payments r ON r.payment_intent=p.payment_intent WHERE p.session_id=o.session_id)").first();
      return json({email:data.adminEmail,inventory:stock.filter(r=>physicalSkus.includes(r.sku)).map(r=>({...r,title:ITEMS[r.sku].title,preorder:isPending(r.sku),image:'/assets/img/'+r.sku.replace(/-paperback$/,'')+'-3d.webp',available:Math.max(0,r.on_hand-r.reserved)})),outstanding:outstanding.count});
    }
    const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw fail('Invalid page');
    if(route==='history')return json({rows:(await db.prepare('SELECT * FROM inventory_history ORDER BY created_at DESC,rowid DESC LIMIT 51 OFFSET ?').bind(offset).all()).results});
    if(route==='orders'){
      const rows=(await db.prepare("SELECT o.*,p.amount_total,p.shipping_total,p.currency,p.payment_intent,r.reason AS payment_issue,COALESCE(f.status,'awaiting_dispatch') AS fulfilment,COALESCE(f.tracking,'') AS tracking,COALESCE(f.version,0) AS version FROM orders o LEFT JOIN order_payments p ON p.session_id=o.session_id LEFT JOIN revoked_payments r ON r.payment_intent=p.payment_intent LEFT JOIN order_fulfilment f ON f.session_id=o.session_id ORDER BY o.created_at DESC,o.session_id DESC LIMIT 26 OFFSET ?").bind(offset).all()).results;
      return json({rows:rows.map(o=>({sessionId:o.session_id,number:o.session_id.slice(-10).toUpperCase(),email:o.email,date:o.created_at,items:parse(o.items_json,[]),shipping:parse(o.shipping_json,null),total:o.amount_total,currency:o.currency||'aud',payment:o.payment_issue||(o.amount_total===0?'no_payment_required':o.amount_total!=null?'paid':'not_recorded'),fulfilment:o.fulfilment,tracking:o.tracking,version:o.version}))});
    }
    if(route==='order'){
      const id=url.searchParams.get('id');if(!/^cs_[A-Za-z0-9_]{8,240}$/.test(id||''))throw fail('Invalid order');
      if(!await db.prepare('SELECT session_id FROM orders WHERE session_id=?').bind(id).first())return json({error:'Not found'},404);
      const session=await stripeGet(env,'/checkout/sessions/'+encodeURIComponent(id));
      return json({name:session.customer_details?.name||null,paymentStatus:session.payment_status,history:(await db.prepare('SELECT * FROM admin_order_history WHERE session_id=? ORDER BY created_at DESC').bind(id).all()).results});
    }
    return json({error:'Not found'},404);
  }catch(e){return json({error:e.status?e.message:'Administration data is unavailable. Check the database migration and server configuration.'},e.status||503);}
}
