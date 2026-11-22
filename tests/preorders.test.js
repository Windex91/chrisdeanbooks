import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {cleanCart,ITEMS,reserveInventory,attachCheckoutSession,settleInventory,releaseInventory} from '../lib/commerce.js';
import {quoteDelivery} from '../lib/preorder-shipping.js';
import {verifyShippingSession,parcelForCart} from '../lib/shipping.js';
import {DRAGON_PAPERBACK as pb,DRAGON_EBOOK as ebook,PAPERBACK_RELEASE,EBOOK_RELEASE,isPending,dragonAvailable} from '../lib/preorders.js';
import {processReleases} from '../lib/ebook-release.js';
import {onRequestPost as releaseEndpoint} from '../functions/api/release-ebooks.js';
import {onRequestGet as download} from '../functions/api/download.js';
import {createEbookAccess,verifyEbookAccess} from '../lib/access.js';
import {customerOrderEmail,ownerOrderEmail} from '../lib/order-emails.js';
const cart=(...skus)=>cleanCart({items:skus.map(sku=>({sku,quantity:1}))});
function database(){const sqlite=new DatabaseSync(':memory:');for(const f of ['db_schema.sql','migrations/20261115_admin.sql','migrations/20261122_preorders.sql'])sqlite.exec(readFileSync(new URL('../'+f,import.meta.url),'utf8'));return {sqlite,db:{prepare(sql){return {args:[],bind(...a){this.args=a;return this;},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async run(){return {meta:{changes:sqlite.prepare(sql).run(...this.args).changes}};}};},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};}
test('Sydney release boundaries, exact prices, no Special Pack and 400g packaged weight',()=>{
 assert.equal(new Date(EBOOK_RELEASE).toISOString(),'2026-12-23T13:01:00.000Z');
 for(const [sku,time] of [[pb,PAPERBACK_RELEASE],[ebook,EBOOK_RELEASE]]){assert.equal(isPending(sku,time-1),true);assert.equal(isPending(sku,time),false);}
 assert.equal(ITEMS[pb].expectedCents,1599);assert.equal(ITEMS[ebook].expectedCents,299);assert.equal(ITEMS['a-dragons-tale-special-pack'],undefined);
 assert.equal(parcelForCart(cart(pb)).grams,400);assert.equal(parcelForCart(cart(pb,ebook)).grams,400);
});
test('mixed physical checkout requires explicit choice; digital does not create a split',()=>{
 const now=PAPERBACK_RELEASE-10000,mixed=cart(pb,'wildborn-paperback');
 assert.equal(quoteDelivery(mixed,'AU',undefined,now).code,'delivery_choice');
 assert.equal(quoteDelivery(mixed,'AU','together',now).cents,1295);
 assert.equal(quoteDelivery(mixed,'AU','split',now).cents,1943);
 assert.equal(quoteDelivery(cart(pb,ebook),'AU','split',now).cents,1295);
 assert.equal(quoteDelivery(cart(ebook),'NZ','split',now),null);
 assert.equal(quoteDelivery(mixed,'AU','split',PAPERBACK_RELEASE).cents,1295);
 assert.equal(quoteDelivery(mixed,'US','split',now).allowed,false);
});
test('fulfilment verifies split amount, eligibility, country and session creation date',()=>{
 const c=cart(pb,'wildborn-paperback'),items=c.map(x=>({sku:x.sku,quantity:x.quantity,physical:true,format:x.item.format}));
 const s={created:PAPERBACK_RELEASE/1000-1,metadata:{shipping_version:'20261111',shipping_plan_version:'1',shipping_plan:'split',shipping_country:'AU',shipping_grams:'640',shipping_cents:'1943'},total_details:{amount_shipping:1943},shipping_details:{address:{country:'AU'}}};
 assert.doesNotThrow(()=>verifyShippingSession(s,items));
 s.total_details.amount_shipping=1295;assert.throws(()=>verifyShippingSession(s,items),/amount/);s.total_details.amount_shipping=1943;
 s.created=PAPERBACK_RELEASE/1000;assert.throws(()=>verifyShippingSession(s,items),/split/);s.created--;
 s.shipping_details.address.country='NZ';assert.throws(()=>verifyShippingSession(s,items),/destination/);
});
test('preorder allocation of 30 holds, settles once and cannot oversell; migration never resets',async()=>{
 const {sqlite,db}=database();const c=cleanCart({items:[{sku:pb,quantity:30}]});const id=await reserveInventory(db,c,2000000000);
 await assert.rejects(reserveInventory(db,cart(pb),2000000000),/out of stock/);
 await attachCheckoutSession(db,id,'cs_test_dragon123');await settleInventory(db,id,'cs_test_dragon123');await settleInventory(db,id,'cs_test_dragon123');
 sqlite.exec(readFileSync(new URL('../migrations/20261122_preorders.sql',import.meta.url),'utf8'));
 assert.deepEqual({...sqlite.prepare('SELECT on_hand,reserved,sold FROM inventory WHERE sku=?').get(pb)},{on_hand:0,reserved:0,sold:30});
 await assert.rejects(reserveInventory(db,cart(pb),2000000000),/out of stock/);
 await assert.doesNotReject(reserveInventory(db,cart(ebook),2000000000));
});
test('release endpoint rejects unauthenticated callers before any database access',async()=>{
 const res=await releaseEndpoint({request:new Request('https://example.com/api/release-ebooks',{method:'POST'}),env:{EBOOK_RELEASE_JOB_SECRET:'x'.repeat(48)}});assert.equal(res.status,401);
});
test('ebook preorder gate requires enabled flags and a recent scheduler heartbeat',async()=>{
 const {db,sqlite}=database(),env={ORDERS:db,DRAGON_PREORDERS_ENABLED:'true',DRAGON_EBOOK_ENABLED:'true'};
 assert.equal(await dragonAvailable(env,pb),true);assert.equal(await dragonAvailable(env,ebook),false);
 sqlite.prepare('INSERT INTO release_job_health VALUES(1,?)').run(Math.floor(Date.now()/1000));assert.equal(await dragonAvailable(env,ebook),true);
 sqlite.exec('UPDATE release_job_health SET last_seen=1');assert.equal(await dragonAvailable(env,ebook),false);
});
test('preorder emails clearly record dispatch choice and do not promise immediate EPUB',()=>{
 const s={id:'cs_test_dragon123',created:PAPERBACK_RELEASE/1000-10000,amount_total:5340,total_details:{amount_shipping:1943},metadata:{shipping_plan:'split'},customer_details:{name:'Reader <script>'}};
 const items=cart(pb,ebook,'wildborn-paperback').map(x=>({...x.item,sku:x.sku,quantity:1}));
 const html=customerOrderEmail(s,items,'https://example.com/success');assert.match(html,/separate email/);assert.match(html,/24 December 2026 at 12:01am/);assert.match(html,/available physical items first/);assert.ok(!html.includes('Your next adventure is ready'));assert.ok(!html.includes('Reader <script>'));
 assert.match(ownerOrderEmail(s,items,'test@example.com',null),/Two dispatches/);
});
test('queued ebook cannot download early; release sends once, grants fresh access and skips refunds',async()=>{
 const {db,sqlite}=database();const originalFetch=global.fetch,originalNow=Date.now;let now=EBOOK_RELEASE-60000,emails=0,html='',reads=0;
 Date.now=()=>now;
 const env={ORDERS:db,EBOOKS:{head:async()=>({size:1}),get:async()=>{reads++;return {body:'epub'};}},STRIPE_MODE:'sandbox',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_A_DRAGONS_TALE_EBOOK:'price_dragon_ebook',DOWNLOAD_TOKEN_SECRET:'x'.repeat(40),SITE_URL:'https://preview.example.com',RESEND_API_KEY:'fixture',RESEND_FROM_ADDRESS:'test@example.com',SHOP_OWNER_EMAIL:'author@example.com'};
 const s={id:'cs_test_dragon123',created:Math.floor((EBOOK_RELEASE-20*86400000)/1000),mode:'payment',status:'complete',payment_status:'paid',currency:'aud',livemode:false,payment_intent:'pi_fixture',amount_total:299,metadata:{store:'chris-dean-books'},customer_details:{email:'reader@example.com',name:'Reader'}};
 sqlite.prepare('INSERT INTO orders(session_id,email,items_json) VALUES(?,?,?)').run(s.id,'reader@example.com','[]');
 sqlite.prepare('INSERT INTO ebook_release_queue(session_id,sku,release_at) VALUES(?,?,?)').run(s.id,ebook,EBOOK_RELEASE/1000);
 global.fetch=async(url,options={})=>{
  if(url==='https://api.resend.com/emails'){emails++;html=JSON.parse(options.body).html;return Response.json({id:'email_123'});}
  if(url.includes('/line_items'))return Response.json({data:[{price:{id:'price_dragon_ebook'},quantity:1}]});
  if(url.includes('/payment_intents/'))return Response.json({status:'succeeded',livemode:false,latest_charge:{paid:true,refunded:false,disputed:false,amount_refunded:0}});
  if(url.includes('/checkout/sessions/'))return Response.json(s);
  throw Error('Unexpected fetch');
 };
 try{
  const token=await createEbookAccess(env,{id:s.id,created:Math.floor(now/1000)});
  const r=await download({request:new Request('https://preview.example.com/api/download?sku='+ebook+'&access='+token),env});assert.equal(r.status,403);assert.equal(reads,0);
  assert.equal((await processReleases(env)).sent,0);assert.equal(emails,0);
  now=EBOOK_RELEASE;assert.equal((await processReleases(env)).sent,1);assert.equal(emails,1);assert.match(html,/release day is here/i);
  const access=decodeURIComponent(/access=([^"<]+)/.exec(html)[1]);assert.equal(await verifyEbookAccess(env,access),s.id);
  assert.equal((await processReleases(env)).sent,0);assert.equal(emails,1);
  const released=await download({request:new Request('https://preview.example.com/api/download?sku='+ebook+'&access='+access),env});assert.equal(released.status,200);assert.equal(reads,1);
  sqlite.exec("UPDATE ebook_release_queue SET status='pending',last_attempt=NULL");sqlite.prepare('INSERT INTO revoked_payments(payment_intent,reason,event_id) VALUES(?,?,?)').run('pi_fixture','refunded','evt_fixture');
  assert.equal((await processReleases(env)).cancelled,1);assert.equal(emails,1);
 }finally{Date.now=originalNow;global.fetch=originalFetch;}
});

test('checkout sends exact Stripe paperback, split and digital-only parameters',async()=>{
 const {onRequestPost:checkout}=await import('../functions/api/checkout.js');
 const original=global.fetch;
 try{for(const [skus,plan,shipping] of [[[pb],'together',1295],[[pb,'wildborn-paperback'],'split',1943],[[ebook],undefined,0]]){
  const {db,sqlite}=database();sqlite.prepare('INSERT INTO release_job_health VALUES(1,?)').run(Math.floor(Date.now()/1000));
  const env={ORDERS:db,EBOOKS:{head:async()=>({size:121180})},SITE_URL:'https://preview.example.com',STRIPE_MODE:'sandbox',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',RESEND_API_KEY:'fixture',RESEND_FROM_ADDRESS:'test@example.com',SHOP_OWNER_EMAIL:'owner@example.com',DOWNLOAD_TOKEN_SECRET:'x'.repeat(40),SHOP_ENABLED:'true',DRAGON_PREORDERS_ENABLED:'true',DRAGON_EBOOK_ENABLED:'true'};
  for(const sku of skus)env[ITEMS[sku].priceVariable]='price_'+sku;
  let sent;
  global.fetch=async(url,options={})=>{
   if(url.includes('/prices/')){const sku=decodeURIComponent(new URL(url).pathname.split('/').pop()).replace('price_','');return Response.json({active:true,currency:'aud',type:'one_time',livemode:false,unit_amount:ITEMS[sku].expectedCents,product:{active:true,metadata:{site_sku:sku}}});}
   if(url.endsWith('/checkout/sessions')){sent=new URLSearchParams(options.body);return Response.json({id:'cs_test_newdragon123',livemode:false,url:'https://checkout.stripe.com/c/pay/test'});}
   throw Error('Unexpected request');
  };
  const r=await checkout({env,request:new Request(env.SITE_URL+'/api/checkout',{method:'POST',headers:{Origin:env.SITE_URL,'Content-Type':'application/json'},body:JSON.stringify({items:skus.map(sku=>({sku,quantity:1})),country:'AU',shippingPlan:plan,shipping:1,weight:1})})});
  assert.equal(r.status,200);assert.equal(sent.get('mode'),'payment');assert.equal(sent.get('allow_promotion_codes'),'true');
  for(const [i,sku] of skus.entries())assert.equal(sent.get(`line_items[${i}][price]`),'price_'+sku);
  if(shipping){assert.equal(sent.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),String(shipping));assert.equal(sent.get('shipping_address_collection[allowed_countries][0]'),'AU');assert.equal(sent.get('metadata[shipping_plan]'),plan);}
  else{assert.equal(sent.get('shipping_address_collection[allowed_countries][0]'),null);assert.equal(sent.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),null);assert.match(sent.get('custom_text[submit][message]'),/24 December 2026/);}
 }}finally{global.fetch=original;}
});
