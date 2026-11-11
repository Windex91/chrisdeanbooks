/* Server-side catalogue: prices here are Stripe Price IDs from the dashboard,
   never amounts supplied by visitors. Never put your Stripe secret in public/. */
export const ITEMS={
  'beneath-falling-leaves-paperback': {title:'Beneath Falling Leaves',format:'Paperback',physical:true,expectedCents:2599,priceVariable:'STRIPE_PRICE_BENEATH_FALLING_LEAVES_PAPERBACK_V2',legacyPriceVariable:'STRIPE_PRICE_BENEATH_FALLING_LEAVES_PAPERBACK',maxQuantity:Number.MAX_SAFE_INTEGER},
  'beneath-falling-leaves-special-pack': {title:'Beneath Falling Leaves',format:'Special Pack',physical:true,stockSku:'beneath-falling-leaves-paperback',expectedCents:3399,priceVariable:'STRIPE_PRICE_BENEATH_FALLING_LEAVES_SPECIAL_PACK',maxQuantity:Number.MAX_SAFE_INTEGER},
  'beneath-falling-leaves-ebook': {title:'Beneath Falling Leaves',format:'Ebook',physical:false,expectedCents:299,priceVariable:'STRIPE_PRICE_BENEATH_FALLING_LEAVES_EBOOK',maxQuantity:1,r2KeyVariable:'R2_BENEATH_FALLING_LEAVES_EBOOK_KEY',r2DefaultKey:'ebooks/beneath-falling-leaves.epub',downloadName:'Beneath-Falling-Leaves.epub'},
  'wildborn-paperback': {title:'Wildborn',format:'Paperback',physical:true,expectedCents:1799,priceVariable:'STRIPE_PRICE_WILDBORN_PAPERBACK_V2',legacyPriceVariable:'STRIPE_PRICE_WILDBORN_PAPERBACK',maxQuantity:Number.MAX_SAFE_INTEGER},
  'wildborn-special-pack': {title:'Wildborn',format:'Special Pack',physical:true,stockSku:'wildborn-paperback',expectedCents:2499,priceVariable:'STRIPE_PRICE_WILDBORN_SPECIAL_PACK',maxQuantity:Number.MAX_SAFE_INTEGER},
  'wildborn-ebook': {title:'Wildborn',format:'Ebook',physical:false,expectedCents:299,priceVariable:'STRIPE_PRICE_WILDBORN_EBOOK',maxQuantity:1,r2KeyVariable:'R2_WILDBORN_EBOOK_KEY',r2DefaultKey:'ebooks/wildborn.epub',downloadName:'Wildborn.epub'},
  'the-glass-tapestry-paperback': {title:'The Glass Tapestry',format:'Paperback',physical:true,expectedCents:1799,priceVariable:'STRIPE_PRICE_THE_GLASS_TAPESTRY_PAPERBACK_V2',legacyPriceVariable:'STRIPE_PRICE_THE_GLASS_TAPESTRY_PAPERBACK',maxQuantity:Number.MAX_SAFE_INTEGER},
  'the-glass-tapestry-ebook': {title:'The Glass Tapestry',format:'Ebook',physical:false,expectedCents:299,priceVariable:'STRIPE_PRICE_THE_GLASS_TAPESTRY_EBOOK',maxQuantity:1,r2KeyVariable:'R2_THE_GLASS_TAPESTRY_EBOOK_KEY',r2DefaultKey:'ebooks/the-glass-tapestry.epub',downloadName:'The-Glass-Tapestry.epub'}
};
export function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}})}
export function siteUrl(env){const url=new URL(env.SITE_URL||'https://chrisdeanbooks.com');if(url.protocol!=='https:' && url.hostname!=='localhost')throw Error('SITE_URL must be HTTPS');return url.origin;}
export function priceId(env,sku){const item=ITEMS[sku];return item?env[item.priceVariable]:undefined;}
export function ebookKey(env,sku){const item=ITEMS[sku];return item?.r2KeyVariable?(env[item.r2KeyVariable]||item.r2DefaultKey):null;}
export async function stripeGet(env,path){if(!env.STRIPE_SECRET_KEY)throw Error('Stripe is not configured');const res=await fetch('https://api.stripe.com/v1'+path,{headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':'2026-09-30.endive'},method:'GET'});const data=await res.json();if(!res.ok)throw Error('Stripe request failed');return data;}
// Stripe-confirmed zero-total Checkout orders have no PaymentIntent.
export function isNoCostOrder(session){return session?.mode==='payment'&&session.status==='complete'&&session.payment_status==='no_payment_required'&&session.amount_total===0&&!session.payment_intent&&session.metadata?.store==='chris-dean-books';}
export async function getPaidSession(env,sessionId){if(typeof sessionId!=='string'||!/^cs_[A-Za-z0-9_]{8,240}$/.test(sessionId))return null;const session=await stripeGet(env,'/checkout/sessions/'+encodeURIComponent(sessionId));if((session.payment_status!=='paid'&&!isNoCostOrder(session))||session.mode!=='payment'||session.metadata?.store!=='chris-dean-books'||session.livemode!==stripeMode(env))return null;return session;}
export async function lineItems(env,sessionId){const result=await stripeGet(env,'/checkout/sessions/'+encodeURIComponent(sessionId)+'/line_items?limit=100');if(result.has_more)throw Error('Order exceeds supported item count');return result.data||[];}
export function purchasedSkus(env,lines){
  const found=[];
  for(const [sku,item] of Object.entries(ITEMS)){
    const ids=[priceId(env,sku),env[item.legacyPriceVariable]].filter(Boolean);
    const matching=lines.filter(x=>ids.includes(x.price?.id));
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
    if(!entry||typeof entry.sku!=='string'||!Object.hasOwn(ITEMS,entry.sku)||!Number.isSafeInteger(entry.quantity)||entry.quantity<1)throw Error('Invalid cart item');
    const newQty=(map.get(entry.sku)||0)+entry.quantity;
    if(!Number.isSafeInteger(newQty)||newQty>ITEMS[entry.sku].maxQuantity)throw Error('Maximum quantity exceeded');
    map.set(entry.sku,newQty);
  }
  const cart=Array.from(map,([sku,quantity])=>({sku,quantity,item:ITEMS[sku]}));
  return cart;
}
// Owner approved 10 November 2026: A$13 once per Australian paperback order.
// Digital-only baskets have no postage; paperback quantities are limited by available stock.
export function shippingForCart(cart){
  const copies=cart.reduce((n,e)=>n+(e.item.physical?e.quantity:0),0);
  if(!copies)return null;
  return {quantity:copies,cents:1300,displayName:'Australian paperback delivery — flat rate'};
}
export function stripeMode(env){
  if(!['sandbox','live'].includes(env.STRIPE_MODE))throw Error('Stripe mode is missing');
  const live=env.STRIPE_MODE==='live';
  if(!new RegExp('^[sr]k_'+(live?'live':'test')+'_').test(env.STRIPE_SECRET_KEY||''))throw Error('Stripe key mode mismatch');
  return live;
}
export function checkoutAllowed(env){
  if(env.SHOP_ENABLED!=='true')return false;
  const live=stripeMode(env);
  if(live)return ['LIVE_LAUNCH_APPROVED','SHIPPING_APPROVED','GST_APPROVED','POLICIES_APPROVED','FULFILMENT_TESTS_PASSED'].every(k=>env[k]==='true')&&['not_registered','registered_inclusive'].includes(env.GST_TREATMENT);
  return !['chrisdeanbooks.com','www.chrisdeanbooks.com','christopherdeanbooks.pages.dev'].includes(new URL(siteUrl(env)).hostname);
}
export async function validatePrice(env,sku){
  const item=ITEMS[sku],id=priceId(env,sku);
  if(!id)throw Error('Price missing');
  const price=await stripeGet(env,'/prices/'+encodeURIComponent(id)+'?expand[]=product');
  if(price.livemode!==stripeMode(env)||price.currency!=='aud'||price.type!=='one_time'||!price.active||price.unit_amount!==item.expectedCents||price.product?.metadata?.site_sku!==sku||!price.product?.active)throw Error('Price does not match approved product');
  if(env.GST_TREATMENT==='registered_inclusive'&&price.tax_behavior!=='inclusive')throw Error('Tax-inclusive price required');
  return price;
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
  const stock = new Map();
  for(const {sku,quantity,item} of cart){
    if(!item.physical)continue;
    const stockSku=item.stockSku||sku;
    stock.set(stockSku,(stock.get(stockSku)||0)+quantity);
  }
  const lines=Array.from(stock,([sku,quantity])=>({sku,quantity}));
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
export async function sendResend(env,to,subject,html,replyTo,idempotencyKey){
  const payload={from:env.RESEND_FROM_ADDRESS,to:[to],subject,html};
  if(replyTo)payload.reply_to=replyTo;
  const res=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
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

// Only the two owned production origins are trusted. Preview environments stay
// isolated. This alias supports bags in tabs opened before the www redirect.
export function checkoutOriginAllowed(env, origin){
  const canonical=siteUrl(env);
  return origin===canonical || (env.STRIPE_MODE==='live' && canonical==='https://chrisdeanbooks.com' && origin==='https://www.chrisdeanbooks.com');
}
