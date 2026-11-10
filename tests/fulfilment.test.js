import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {ITEMS,checkoutAllowed,shippingForCart,cleanCart} from '../lib/commerce.js';
import {onRequestPost as checkout} from '../functions/api/checkout.js';
import {onRequestPost as webhook} from '../functions/api/webhook.js';
import {onRequestGet as download} from '../functions/api/download.js';
import {onRequestGet as order} from '../functions/api/order.js';
import {deliverOrderEmail} from '../lib/fulfilment.js';

// Execute the real schema/SQL with SQLite transactions; only external provider
// transports and R2 bytes are simulated. This is NOT a deployed sandbox payment.
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../db_schema.sql',import.meta.url),'utf8'));
 const db={sql,prepare(query){return {args:[],bind(...args){this.args=args;return this;},async first(){return sql.prepare(query).get(...this.args)||null;},async all(){return {results:sql.prepare(query).all(...this.args)};},async run(){return this.execute();},execute(){return {meta:{changes:Number(sql.prepare(query).run(...this.args).changes)}};}};},async batch(stmts){sql.exec('BEGIN');try{const out=stmts.map(s=>s.execute());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};return db;
}
function setup(){
 const db=database();db.sql.exec("UPDATE inventory SET on_hand=5");
 const env={ORDERS:db,SHOP_ENABLED:'true',STRIPE_MODE:'sandbox',GST_TREATMENT:'not_registered',SITE_URL:'https://sandbox.example.com',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',RESEND_API_KEY:'re_fixture',RESEND_FROM_ADDRESS:'orders@example.com',SHOP_OWNER_EMAIL:'author@example.com',DOWNLOAD_TOKEN_SECRET:'fixture-only-012345678901234567890123456789',EBOOKS:{head:async()=>({}),get:async key=>({body:new Blob(['private EPUB '+key])})}};
 for(const [sku,item] of Object.entries(ITEMS))env[item.priceVariable]='price_'+sku;
 const state={emails:new Map(),created:null,refunded:false,failOwner:false};
 const response=data=>new Response(JSON.stringify(data));
 const fetch=async(url,options={})=>{
  if(url.startsWith('https://api.resend.com/')){
   const body=JSON.parse(options.body),key=options.headers['Idempotency-Key'];assert.ok(key);
   if(state.failOwner&&body.to[0]==='author@example.com')return new Response('{}',{status:503});
   if(state.emails.has(key))assert.deepEqual(body,state.emails.get(key));else state.emails.set(key,body);
   return response({id:'email_'+key});
  }
  if(url.includes('/prices/')){
   const id=new URL(url).pathname.split('/').pop(),sku=id.slice(6),item=ITEMS[sku];
   return response({active:true,livemode:false,type:'one_time',currency:'aud',unit_amount:item.expectedCents,product:{active:true,metadata:{site_sku:sku}}});
  }
  if(url.includes('/payment_intents/'))return response({status:'succeeded',livemode:false,latest_charge:{paid:true,refunded:state.refunded,disputed:false,amount_refunded:state.refunded?299:0}});
  if(options.method==='POST'&&url.endsWith('/checkout/sessions')){
   const p=new URLSearchParams(options.body);assert.equal(p.has('payment_method_types[0]'),false);assert.equal(p.has('automatic_tax[enabled]'),false);
   state.params=p;state.created={id:'cs_test_integration123456',livemode:false,created:Math.floor(Date.now()/1000),metadata:{store:p.get('metadata[store]'),gst_treatment:p.get('metadata[gst_treatment]'),reservation_id:p.get('metadata[reservation_id]')},mode:'payment',payment_status:'paid',payment_intent:'pi_test_integration',currency:'aud',amount_total:8397,total_details:{amount_shipping:1300,amount_tax:0},customer_details:{email:'reader@example.com',name:'Test Reader'},collected_information:{shipping_details:{name:'Test Reader',address:{line1:'Sandbox address',country:'AU',postal_code:'2000'}}}};
   return response({...state.created,url:'https://checkout.stripe.com/c/pay/test'});
  }
  if(url.includes('/line_items'))return response({data:[{price:{id:env.STRIPE_PRICE_BENEATH_FALLING_LEAVES_SPECIAL_PACK},quantity:2},{price:{id:env.STRIPE_PRICE_WILDBORN_EBOOK},quantity:1}]});
  if(url.includes('/checkout/sessions/'))return response(state.created);
  throw Error('Unexpected request '+url);
 };
 return {env,state,fetch,db};
}
async function eventRequest(env,event){
 const body=JSON.stringify(event),t=Math.floor(Date.now()/1000),encoder=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,encoder.encode(t+'.'+body))).toString('hex');
 return new Request(env.SITE_URL+'/api/webhook',{method:'POST',headers:{'stripe-signature':`t=${t},v1=${sig}`},body});
}
async function openCheckout(env){return checkout({env,request:new Request(env.SITE_URL+'/api/checkout',{method:'POST',headers:{Origin:env.SITE_URL},body:JSON.stringify({items:[{sku:'beneath-falling-leaves-special-pack',quantity:2},{sku:'wildborn-ebook',quantity:1}]})})});}

test('mixed order: checkout, signed webhook, SQLite stock/order, both emails, private EPUB and refund denial',async()=>{
 const {env,state,fetch,db}=setup(),original=globalThis.fetch;globalThis.fetch=fetch;
 try{
  assert.equal((await openCheckout(env)).status,200);
  assert.equal(state.params.get('line_items[0][price]'),env.STRIPE_PRICE_BENEATH_FALLING_LEAVES_SPECIAL_PACK);
  assert.equal(state.params.get('line_items[0][quantity]'),'2');
  assert.equal(state.params.has('line_items[2][price]'),false);
  assert.equal(state.params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),'1300');
  const event={id:'evt_fixture',type:'checkout.session.completed',livemode:false,data:{object:state.created}};
  // Fail one recipient, then replay; the customer email must not duplicate.
  state.failOwner=true;
  assert.equal((await webhook({env,request:await eventRequest(env,event)})).status,500);
  state.failOwner=false;
  assert.equal((await webhook({env,request:await eventRequest(env,event)})).status,200);
  assert.equal((await webhook({env,request:await eventRequest(env,event)})).status,200);
  assert.equal(state.emails.size,2);
  const stock=db.sql.prepare("SELECT on_hand,reserved,sold FROM inventory WHERE sku='beneath-falling-leaves-paperback'").get();
  assert.deepEqual({...stock},{on_hand:3,reserved:0,sold:2});
  const stored=db.sql.prepare('SELECT * FROM orders').get();assert.equal(stored.customer_notified,1);assert.equal(stored.owner_notified,1);assert.equal(JSON.parse(stored.items_json)[0].quantity,2);
  assert.equal(db.sql.prepare('SELECT amount_total FROM order_payments').get().amount_total,8397);
  const email=state.emails.get(state.created.id+'/customer/v1');assert.match(email.html,/GST not charged/);assert.match(email.html,/Beneath Falling Leaves — Special Pack × 2/);
  const link=new URL(email.html.match(/href="([^"]+)"/)[1]),token=link.searchParams.get('access');
  const req=sku=>new Request(env.SITE_URL+'/api/download?access='+token+'&sku='+sku);
  const downloaded=await download({env,request:req('wildborn-ebook')});assert.equal(downloaded.status,200);assert.match(await downloaded.text(),/private EPUB ebooks\/wildborn.epub/);
  assert.equal((await download({env,request:req('the-glass-tapestry-ebook')})).status,404);
  const summary=await order({env,request:new Request(env.SITE_URL+'/api/order?access='+token)});assert.equal((await summary.json()).hasPhysical,true);
  state.refunded=true;assert.equal((await download({env,request:req('wildborn-ebook')})).status,403);
  const refund={id:'evt_refund',type:'charge.refunded',livemode:false,data:{object:{payment_intent:'pi_test_integration'}}};
  assert.equal((await webhook({env,request:await eventRequest(env,refund)})).status,200);
  state.refunded=false;assert.equal((await download({env,request:req('wildborn-ebook')})).status,403);
 }finally{globalThis.fetch=original;db.sql.close();}
});

test('live checkout fails closed without every approval; sandbox cannot run on production origin',()=>{
 const {env,db}=setup();
 assert.equal(checkoutAllowed({...env,SITE_URL:'https://chrisdeanbooks.com'}),false);
 const live={...env,STRIPE_MODE:'live',STRIPE_SECRET_KEY:'rk_live_fixture',GST_TREATMENT:'not_registered'};
 assert.equal(checkoutAllowed(live),false);
 const approved={...live,LIVE_LAUNCH_APPROVED:'true',SHIPPING_APPROVED:'true',GST_APPROVED:'true',POLICIES_APPROVED:'true',FULFILMENT_TESTS_PASSED:'true'};
 assert.equal(checkoutAllowed(approved),true);
 for(const key of ['LIVE_LAUNCH_APPROVED','SHIPPING_APPROVED','GST_APPROVED','POLICIES_APPROVED','FULFILMENT_TESTS_PASSED'])assert.equal(checkoutAllowed({...approved,[key]:'false'}),false);
 assert.throws(()=>checkoutAllowed({...approved,STRIPE_SECRET_KEY:'rk_test_fixture'}),/mismatch/);
 assert.equal(shippingForCart(cleanCart({items:[{sku:'wildborn-paperback',quantity:1}]}),{SHIPPING_AU_1_CENTS:'1'}).cents,1300);
 db.sql.close();
});

test('uncertain email retries older than deduplication window stop for reconciliation',async()=>{
 const {env,db}=setup();
 db.sql.prepare('INSERT INTO email_outbox (id,payload_json,first_attempt) VALUES (?,?,?)').run('old','{}',Math.floor(Date.now()/1000)-24*3600);
 await assert.rejects(()=>deliverOrderEmail(env,'old','reader@example.com','Subject','Body'),/reconciliation/);db.sql.close();
});

test('invalid signatures and wrong-mode webhooks cannot write orders',async()=>{
 const {env,db}=setup();
 assert.equal((await webhook({env,request:new Request(env.SITE_URL+'/api/webhook',{method:'POST',body:'{}'})})).status,400);
 assert.equal((await webhook({env,request:await eventRequest(env,{livemode:true,type:'checkout.session.completed'})})).status,400);
 assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);db.sql.close();
});

test('confirmed starting stock is seeded once and never resets existing sales',()=>{
 const db=database();
 assert.deepEqual(db.sql.prepare('SELECT sku,on_hand FROM inventory ORDER BY sku').all().map(r=>[r.sku,r.on_hand]),[['beneath-falling-leaves-paperback',10],['the-glass-tapestry-paperback',1],['wildborn-paperback',10]]);
 db.sql.exec("UPDATE inventory SET on_hand=9,sold=1 WHERE sku='wildborn-paperback'");
 db.sql.exec(readFileSync(new URL('../db_schema.sql',import.meta.url),'utf8'));
 assert.equal(db.sql.prepare("SELECT on_hand FROM inventory WHERE sku='wildborn-paperback'").get().on_hand,9);
 db.sql.close();
});
