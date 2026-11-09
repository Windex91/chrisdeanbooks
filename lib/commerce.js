/* Server-side catalogue: prices here are Stripe Price IDs from the dashboard,
   never amounts supplied by visitors. Never put your Stripe secret in public/. */
export const ITEMS={
  'beneath-falling-leaves-paperback': {title:'Beneath Falling Leaves',format:'Paperback',physical:true,expectedCents:2499,priceVariable:'STRIPE_PRICE_BENEATH_FALLING_LEAVES_PAPERBACK',maxQuantity:5},
  'beneath-falling-leaves-ebook': {title:'Beneath Falling Leaves',format:'Ebook',physical:false,expectedCents:299,priceVariable:'STRIPE_PRICE_BENEATH_FALLING_LEAVES_EBOOK',maxQuantity:1,r2KeyVariable:'R2_BENEATH_FALLING_LEAVES_EBOOK_KEY',r2DefaultKey:'ebooks/beneath-falling-leaves.epub',downloadName:'Beneath-Falling-Leaves.epub'},
  'wildborn-paperback': {title:'Wildborn',format:'Paperback',physical:true,expectedCents:1599,priceVariable:'STRIPE_PRICE_WILDBORN_PAPERBACK',maxQuantity:5},
  'wildborn-ebook': {title:'Wildborn',format:'Ebook',physical:false,expectedCents:299,priceVariable:'STRIPE_PRICE_WILDBORN_EBOOK',maxQuantity:1,r2KeyVariable:'R2_WILDBORN_EBOOK_KEY',r2DefaultKey:'ebooks/wildborn.epub',downloadName:'Wildborn.epub'},
  'the-glass-tapestry-paperback': {title:'The Glass Tapestry',format:'Paperback',physical:true,expectedCents:1599,priceVariable:'STRIPE_PRICE_THE_GLASS_TAPESTRY_PAPERBACK',maxQuantity:5},
  'the-glass-tapestry-ebook': {title:'The Glass Tapestry',format:'Ebook',physical:false,expectedCents:299,priceVariable:'STRIPE_PRICE_THE_GLASS_TAPESTRY_EBOOK',maxQuantity:1,r2KeyVariable:'R2_THE_GLASS_TAPESTRY_EBOOK_KEY',r2DefaultKey:'ebooks/the-glass-tapestry.epub',downloadName:'The-Glass-Tapestry.epub'}
};
export function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}})}
export function siteUrl(env){const url=new URL(env.SITE_URL||'https://chrisdeanbooks.com');if(url.protocol!=='https:' && url.hostname!=='localhost')throw Error('SITE_URL must be HTTPS');return url.origin;}
export function priceId(env,sku){const item=ITEMS[sku];return item?env[item.priceVariable]:undefined;}
export function ebookKey(env,sku){const item=ITEMS[sku];return item?.r2KeyVariable?(env[item.r2KeyVariable]||item.r2DefaultKey):null;}
export async function stripeGet(env,path){if(!env.STRIPE_SECRET_KEY)throw Error('Stripe is not configured');const res=await fetch('https://api.stripe.com/v1'+path,{headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY},method:'GET'});const data=await res.json();if(!res.ok)throw Error('Stripe request failed: '+(data.error?.message||res.status));return data;}
export async function getPaidSession(env,sessionId){if(typeof sessionId!=='string'||!/^cs_[A-Za-z0-9_]{8,240}$/.test(sessionId))return null;const session=await stripeGet(env,'/checkout/sessions/'+encodeURIComponent(sessionId));if(session.payment_status!=='paid'||session.mode!=='payment'||session.metadata?.store!=='chris-dean-books')return null;return session;}
export async function lineItems(env,sessionId){const result=await stripeGet(env,'/checkout/sessions/'+encodeURIComponent(sessionId)+'/line_items?limit=100');if(result.has_more)throw Error('Order exceeds supported item count');return result.data||[];}
export function purchasedSkus(env,lines){
  const found=[];
  for(const [sku,item] of Object.entries(ITEMS)){
    const id=priceId(env,sku);
    const matching=id&&lines.filter(x=>x.price?.id===id);
    if(!matching?.length)continue;
    const quantity=matching.reduce((total,line)=>total+(Number.isInteger(line.quantity)?line.quantity:0),0);
    if(quantity>0)found.push({sku,title:item.title,format:item.format,physical:item.physical,quantity});
  }
  return found;
}
export function cleanCart(body){
  if(!body||typeof body!=='object'||!Array.isArray(body.items)||body.items.length<1||body.items.length>8)throw Error('Invalid cart');
  const map=new Map();
  for(const entry of body.items){
    if(!entry||typeof entry.sku!=='string'||!(entry.sku in ITEMS)||!Number.isInteger(entry.quantity)||entry.quantity<1)throw Error('Invalid cart item');
    const newQty=(map.get(entry.sku)||0)+entry.quantity;
    if(newQty>ITEMS[entry.sku].maxQuantity)throw Error('Maximum quantity exceeded');
    map.set(entry.sku,newQty);
  }
  const cart=Array.from(map,([sku,quantity])=>({sku,quantity,item:ITEMS[sku]}));
  if(cart.reduce((n,entry)=>n+(entry.item.physical?entry.quantity:0),0)>5)throw Error('Maximum quantity of paperbacks per order is five');
  return cart;
}
/* Provisional Australian Parcel Post charges (AUD cents). Based on Australia Post
   retail prepaid satchel prices effective 1 July 2026; verify physical fit
   and protective packaging before live launch. */
export function shippingForCart(cart){
  const copies=cart.reduce((n,entry)=>n+(entry.item.physical?entry.quantity:0),0);
  if(copies===0)return null;
  if(copies>5)throw Error('Maximum quantity of paperbacks per order is five');
  if(copies===1)return {quantity:copies,cents:1295,displayName:'Australia Post Parcel Post — 1 book'};
  if(copies<=3)return {quantity:copies,cents:1695,displayName:'Australia Post Parcel Post — 2–3 books'};
  return {quantity:copies,cents:2195,displayName:'Australia Post Parcel Post — 4–5 books'};
}
/* INVENTORY SAFEGUARDS
D1.batch() executes the statements as one atomic transaction. The inventory
CHECK constraint rejects simultaneous reservations that exceed available stock.
The same reservation-item state is used to make paid and expired events idempotent.
These helpers REQUIRE a migrated D1 ORDERS binding; they fail closed otherwise. */
export class StockUnavailableError extends Error {
  constructor(){super('A paperback in your bag is out of stock or the requested quantity is unavailable');this.name='StockUnavailableError';}
}
export async function reserveInventory(db,cart,expiresAt){
  if(!db?.prepare||!db?.batch)throw Error('Inventory database is not configured');
  const lines=cart.filter(({item})=>item.physical);
  for(const line of lines){
    const existing=await db.prepare('SELECT on_hand,reserved FROM inventory WHERE sku=?').bind(line.sku).first();
    if(!existing)throw Error('Stock record is not configured for '+line.sku);
    if(existing.on_hand-existing.reserved<line.quantity)throw new StockUnavailableError();
  }
  const id=crypto.randomUUID(),now=Math.floor(Date.now()/1000);
  const statements=[
    db.prepare("INSERT INTO inventory_reservations (id,state,expires_at,created_at) VALUES (?,'open',?,?)").bind(id,expiresAt,now)
  ];
  for(const line of lines){
    statements.push(
      db.prepare('UPDATE inventory SET reserved=reserved+?,updated_at=CURRENT_TIMESTAMP WHERE sku=?').bind(line.quantity,line.sku),
      db.prepare("INSERT INTO inventory_reservation_items (reservation_id,sku,quantity,state) VALUES (?,?,?,'held')").bind(id,line.sku,line.quantity)
    );
  }
  try{await db.batch(statements);}
  catch(error){
    // A concurrency race loses at the database CHECK constraint rather than overselling.
    if(/CHECK constraint failed/i.test(String(error?.message)))throw new StockUnavailableError();
    throw error;
  }
  return id;
}
export async function attachCheckoutSession(db,reservationId,sessionId){
  const result=await db.prepare("UPDATE inventory_reservations SET session_id=? WHERE id=? AND state='open' AND session_id IS NULL")
    .bind(sessionId,reservationId).run();
  if(result?.meta?.changes!==1)throw Error('Failed to link Stripe Checkout with reserved inventory');
}
async function reservationStatus(db,id,sessionId){
  const record=await db.prepare('SELECT session_id,state FROM inventory_reservations WHERE id=?').bind(id).first();
  if(!record||record.session_id!==sessionId)throw Error('Payment reservation ID or session mismatch');
  if(record.state==='expired'||record.state==='failed')throw Error('Reservation has already been released; reconcile before fulfilment');
  return record;
}
export async function settleInventory(db,id,sessionId){
  const record=await reservationStatus(db,id,sessionId);
  if(record.state==='paid')return;
  const items=(await db.prepare("SELECT sku,quantity FROM inventory_reservation_items WHERE reservation_id=? AND state='held'").bind(id).all()).results||[];
  const steps=[];
  for(const item of items){
    steps.push(
      db.prepare("UPDATE inventory SET on_hand=on_hand-?,reserved=reserved-?,sold=sold+?,updated_at=CURRENT_TIMESTAMP WHERE sku=? AND EXISTS (SELECT 1 FROM inventory_reservation_items WHERE reservation_id=? AND sku=? AND state='held')")
        .bind(item.quantity,item.quantity,item.quantity,item.sku,id,item.sku),
      db.prepare("UPDATE inventory_reservation_items SET state='paid' WHERE reservation_id=? AND sku=? AND state='held'").bind(id,item.sku)
    );
  }
  steps.push(db.prepare("UPDATE inventory_reservations SET state='paid' WHERE id=? AND state='open'").bind(id));
  await db.batch(steps);
}
export async function releaseInventory(db,id,sessionId=null){
  if(!id)return;
  const record=await db.prepare('SELECT session_id,state FROM inventory_reservations WHERE id=?').bind(id).first();
  if(!record||record.state==='paid'||record.state==='expired'||record.state==='failed')return;
  if(sessionId&&record.session_id&&record.session_id!==sessionId)throw Error('Expired Checkout session did not match reservation');
  const items=(await db.prepare("SELECT sku,quantity FROM inventory_reservation_items WHERE reservation_id=? AND state='held'").bind(id).all()).results||[];
  const steps=[];
  for(const item of items){
    steps.push(
      db.prepare("UPDATE inventory SET reserved=reserved-?,updated_at=CURRENT_TIMESTAMP WHERE sku=? AND EXISTS (SELECT 1 FROM inventory_reservation_items WHERE reservation_id=? AND sku=? AND state='held')").bind(item.quantity,item.sku,id,item.sku),
      db.prepare("UPDATE inventory_reservation_items SET state='released' WHERE reservation_id=? AND sku=? AND state='held'").bind(id,item.sku)
    );
  }
  steps.push(db.prepare("UPDATE inventory_reservations SET state='expired' WHERE id=? AND state='open'").bind(id));
  await db.batch(steps);
}
// Resend accepts "Name <address@domain>" or just "address@domain".
 // Normalise the original plain-text Cloudflare value if it was entered as
 // "Name address@domain", and never include an unvalidated sender in requests.
export function normalizeSender(raw){
  const sender=String(raw??'').trim();
  const address='[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}';
  if(new RegExp('^'+address+'
  if(replyTo)payload.reply_to=replyTo;
  const res=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  let response;
  try{response=await res.json();}catch{response=null;}
  if(!res.ok||!response?.id){
    // Only pass a numeric status and a short Resend error category to the
    // diagnostic handler. Never expose the provider's raw response or credentials.
    const name=typeof response?.name==='string'?response.name:
      typeof response?.error?.name==='string'?response.error.name:'unknown';
    const error=new Error('Email provider rejected the request');
    error.provider='resend';error.httpStatus=res.status;
    error.providerCode=/^[a-z0-9_-]{1,55}$/i.test(name)?name.toLowerCase():'unknown';
    throw error;
  }
  return response;
}
export function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));}
export async function verifyStripeSignature(body,header,secret){if(!header||!secret)return false;const pairs=header.split(',').map(v=>v.trim().split('='));const time=pairs.find(([k])=>k==='t')?.[1];const sigs=pairs.filter(([k])=>k==='v1').map(([,v])=>v);if(!/^\d+$/.test(time||'')||sigs.length===0||Math.abs(Date.now()/1000-Number(time))>300)return false;const encoder=new TextEncoder();const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`${time}.${body}`)));const expected=Array.from(digest,v=>v.toString(16).padStart(2,'0')).join('');return sigs.some(sig=>{if(!/^[a-f0-9]{64}$/i.test(sig))return false;let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^sig.toLowerCase().charCodeAt(i);return diff===0;});}
,'i').test(sender))return sender;
  if(new RegExp('^[^<>\\r\\n]+\\s+<'+address+'>
  if(replyTo)payload.reply_to=replyTo;
  const res=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  let response;
  try{response=await res.json();}catch{response=null;}
  if(!res.ok||!response?.id){
    // Only pass a numeric status and a short Resend error category to the
    // diagnostic handler. Never expose the provider's raw response or credentials.
    const name=typeof response?.name==='string'?response.name:
      typeof response?.error?.name==='string'?response.error.name:'unknown';
    const error=new Error('Email provider rejected the request');
    error.provider='resend';error.httpStatus=res.status;
    error.providerCode=/^[a-z0-9_-]{1,55}$/i.test(name)?name.toLowerCase():'unknown';
    throw error;
  }
  return response;
}
export function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));}
export async function verifyStripeSignature(body,header,secret){if(!header||!secret)return false;const pairs=header.split(',').map(v=>v.trim().split('='));const time=pairs.find(([k])=>k==='t')?.[1];const sigs=pairs.filter(([k])=>k==='v1').map(([,v])=>v);if(!/^\d+$/.test(time||'')||sigs.length===0||Math.abs(Date.now()/1000-Number(time))>300)return false;const encoder=new TextEncoder();const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`${time}.${body}`)));const expected=Array.from(digest,v=>v.toString(16).padStart(2,'0')).join('');return sigs.some(sig=>{if(!/^[a-f0-9]{64}$/i.test(sig))return false;let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^sig.toLowerCase().charCodeAt(i);return diff===0;});}
,'i').test(sender))return sender;
  const match=sender.match(new RegExp('^(.+?)\\s+('+address+')
  if(replyTo)payload.reply_to=replyTo;
  const res=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  let response;
  try{response=await res.json();}catch{response=null;}
  if(!res.ok||!response?.id){
    // Only pass a numeric status and a short Resend error category to the
    // diagnostic handler. Never expose the provider's raw response or credentials.
    const name=typeof response?.name==='string'?response.name:
      typeof response?.error?.name==='string'?response.error.name:'unknown';
    const error=new Error('Email provider rejected the request');
    error.provider='resend';error.httpStatus=res.status;
    error.providerCode=/^[a-z0-9_-]{1,55}$/i.test(name)?name.toLowerCase():'unknown';
    throw error;
  }
  return response;
}
export function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));}
export async function verifyStripeSignature(body,header,secret){if(!header||!secret)return false;const pairs=header.split(',').map(v=>v.trim().split('='));const time=pairs.find(([k])=>k==='t')?.[1];const sigs=pairs.filter(([k])=>k==='v1').map(([,v])=>v);if(!/^\d+$/.test(time||'')||sigs.length===0||Math.abs(Date.now()/1000-Number(time))>300)return false;const encoder=new TextEncoder();const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`${time}.${body}`)));const expected=Array.from(digest,v=>v.toString(16).padStart(2,'0')).join('');return sigs.some(sig=>{if(!/^[a-f0-9]{64}$/i.test(sig))return false;let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^sig.toLowerCase().charCodeAt(i);return diff===0;});}
,'i'));
  if(match)return match[1].trim()+' <'+match[2]+'>';
  throw Error('Email sender address is not configured correctly');
}
export async function sendResend(env,to,subject,html,replyTo){
  const payload={from:normalizeSender(env.RESEND_FROM_ADDRESS),to:[to],subject,html};
  if(replyTo)payload.reply_to=replyTo;
  const res=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  let response;
  try{response=await res.json();}catch{response=null;}
  if(!res.ok||!response?.id){
    // Only pass a numeric status and a short Resend error category to the
    // diagnostic handler. Never expose the provider's raw response or credentials.
    const name=typeof response?.name==='string'?response.name:
      typeof response?.error?.name==='string'?response.error.name:'unknown';
    const error=new Error('Email provider rejected the request');
    error.provider='resend';error.httpStatus=res.status;
    error.providerCode=/^[a-z0-9_-]{1,55}$/i.test(name)?name.toLowerCase():'unknown';
    throw error;
  }
  return response;
}
export function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));}
export async function verifyStripeSignature(body,header,secret){if(!header||!secret)return false;const pairs=header.split(',').map(v=>v.trim().split('='));const time=pairs.find(([k])=>k==='t')?.[1];const sigs=pairs.filter(([k])=>k==='v1').map(([,v])=>v);if(!/^\d+$/.test(time||'')||sigs.length===0||Math.abs(Date.now()/1000-Number(time))>300)return false;const encoder=new TextEncoder();const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`${time}.${body}`)));const expected=Array.from(digest,v=>v.toString(16).padStart(2,'0')).join('');return sigs.some(sig=>{if(!/^[a-f0-9]{64}$/i.test(sig))return false;let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^sig.toLowerCase().charCodeAt(i);return diff===0;});}
