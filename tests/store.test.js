import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanCart,verifyStripeSignature,purchasedSkus} from '../lib/commerce.js';
import {onRequestPost as checkout} from '../functions/api/checkout.js';
import {onRequestGet as download} from '../functions/api/download.js';

const request=(url,body,headers={})=>new Request(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
const env={SHOP_ENABLED:'true',SITE_URL:'https://chrisdeanbooks.com',STRIPE_SECRET_KEY:'sk_test_dummy',STRIPE_WEBHOOK_SECRET:'whsec_dummy',RESEND_API_KEY:'re_dummy',RESEND_FROM_ADDRESS:'orders@example.com',SHOP_OWNER_EMAIL:'author@example.com',ORDERS:{},EBOOKS:{head:async()=>({})},STRIPE_PRICE_WILDBORN_PAPERBACK:'price_paper',STRIPE_PRICE_WILDBORN_EBOOK:'price_ebook',STRIPE_SHIPPING_RATE_AU:'shr_test'};

test('cart rejects price tampering and unknown products',()=>{
  assert.throws(()=>cleanCart({items:[{sku:'freebie',quantity:1}]}),/Invalid cart item/);
  assert.throws(()=>cleanCart({items:[{sku:'wildborn-ebook',quantity:2}]}),/Maximum quantity/);
  assert.deepEqual(cleanCart({items:[{sku:'wildborn-ebook',quantity:1,price:0}]}).map(i=>i.quantity),[1]);
});
test('checkout remains disabled before account setup',async()=>{
 const res=await checkout({request:request('https://chrisdeanbooks.com/api/checkout',{items:[{sku:'wildborn-paperback',quantity:1}]}),env:{...env,SHOP_ENABLED:'false'}});
 assert.equal(res.status,503);
});
test('checkout creates AUD shipping session with server-authorized price',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
   assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');
   const f=new URLSearchParams(options.body);
   assert.equal(f.get('line_items[0][price]'),'price_paper');
   assert.equal(f.get('line_items[0][quantity]'),'1');
   assert.equal(f.get('shipping_address_collection[allowed_countries][0]'),'AU');
   assert.equal(f.get('shipping_options[0][shipping_rate]'),'shr_test');
   assert.equal(f.get('success_url'),'https://chrisdeanbooks.com/success/?session_id={CHECKOUT_SESSION_ID}');
   return new Response(JSON.stringify({url:'https://checkout.stripe.com/c/pay/test'}),{status:200});
 };
 try{const res=await checkout({request:request('https://chrisdeanbooks.com/api/checkout',{items:[{sku:'wildborn-paperback',quantity:1,price:0}]},{Origin:'https://chrisdeanbooks.com'}),env});assert.equal(res.status,200);assert.equal((await res.json()).url,'https://checkout.stripe.com/c/pay/test');}
 finally{globalThis.fetch=original;}
});
test('checkout rejects requests from other origins',async()=>{
 const res=await checkout({request:request('https://chrisdeanbooks.com/api/checkout',{items:[{sku:'wildborn-ebook',quantity:1}]},{Origin:'https://fraud.invalid'}),env});
 assert.equal(res.status,403);
});
test('stripe signature checks real HMAC and timestamp',async()=>{
 const body='{"hello":"world"}',timestamp=Math.floor(Date.now()/1000);
 const k=await crypto.subtle.importKey('raw',new TextEncoder().encode('whsec_dummy'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const buffer=await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(`${timestamp}.${body}`));
 const signature=Buffer.from(buffer).toString('hex');
 assert.equal(await verifyStripeSignature(body,`t=${timestamp},v1=${signature}`,'whsec_dummy'),true);
 assert.equal(await verifyStripeSignature(body,`t=${timestamp},v1=${'0'.repeat(64)}`,'whsec_dummy'),false);
 assert.equal(await verifyStripeSignature(body,`t=${timestamp-700},v1=${signature}`,'whsec_dummy'),false);
});
test('download refuses a session without a purchased ebook',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  if(url.includes('/line_items'))return new Response(JSON.stringify({data:[{price:{id:'price_paper'},quantity:1}]}));
  return new Response(JSON.stringify({id:'cs_test_abcdefghijk',mode:'payment',payment_status:'paid',metadata:{store:'chris-dean-books'}}));
 };
 try{const res=await download({request:new Request('https://chrisdeanbooks.com/api/download?session_id=cs_test_abcdefghijk&sku=wildborn-ebook'),env});assert.equal(res.status,403);}
 finally{globalThis.fetch=original;}
});
test('download serves only the purchased private R2 ebook',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  if(url.includes('/line_items'))return new Response(JSON.stringify({data:[{price:{id:'price_ebook'},quantity:1}]}));
  return new Response(JSON.stringify({id:'cs_test_abcdefghijk',mode:'payment',payment_status:'paid',metadata:{store:'chris-dean-books'}}));
 };
 try{const res=await download({request:new Request('https://chrisdeanbooks.com/api/download?session_id=cs_test_abcdefghijk&sku=wildborn-ebook'),env:{...env,EBOOKS:{get:async()=>({body:new Blob(['ebook content'])})}}});assert.equal(res.status,200);assert.equal(await res.text(),'ebook content');assert.match(res.headers.get('Content-Disposition'),/Wildborn.epub/);}
 finally{globalThis.fetch=original;}
});
