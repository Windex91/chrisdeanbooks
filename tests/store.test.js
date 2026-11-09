import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEMS,cleanCart,shippingForCart,verifyStripeSignature,purchasedSkus,ebookKey} from '../lib/commerce.js';
import {onRequestGet as catalog} from '../functions/api/catalog.js';
import {onRequestPost as checkout} from '../functions/api/checkout.js';
import {onRequestGet as download} from '../functions/api/download.js';

const request=(url,body,headers={})=>new Request(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
const env={SHOP_ENABLED:'true',SITE_URL:'https://chrisdeanbooks.com',STRIPE_SECRET_KEY:'sk_test_dummy',STRIPE_WEBHOOK_SECRET:'whsec_dummy',RESEND_API_KEY:'re_dummy',RESEND_FROM_ADDRESS:'orders@example.com',SHOP_OWNER_EMAIL:'author@example.com',ORDERS:{},EBOOKS:{head:async()=>({})},STRIPE_PRICE_WILDBORN_PAPERBACK:'price_paper',STRIPE_PRICE_WILDBORN_EBOOK:'price_ebook',STRIPE_PRICE_BENEATH_FALLING_LEAVES_PAPERBACK:'price_bfl_paper',STRIPE_PRICE_BENEATH_FALLING_LEAVES_EBOOK:'price_bfl_epub',STRIPE_PRICE_THE_GLASS_TAPESTRY_PAPERBACK:'price_glass_paper',STRIPE_PRICE_THE_GLASS_TAPESTRY_EBOOK:'price_glass_epub',STRIPE_SHIPPING_RATE_AU:'shr_test'};

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
   assert.equal(f.get('shipping_options[0][shipping_rate_data][type]'),'fixed_amount');
   assert.equal(f.get('shipping_options[0][shipping_rate_data][fixed_amount][currency]'),'aud');
   assert.equal(f.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),'1295');
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

test('all six author editions have approved prices and correct delivery formats',()=>{
  const approved={
    'beneath-falling-leaves-paperback':2499,'beneath-falling-leaves-ebook':299,
    'wildborn-paperback':1599,'wildborn-ebook':299,
    'the-glass-tapestry-paperback':1599,'the-glass-tapestry-ebook':299
  };
  assert.equal(Object.keys(ITEMS).length,6);
  for(const [sku,amount] of Object.entries(approved)){
    const item=ITEMS[sku];
    assert.equal(item.expectedCents,amount);
    assert.equal(item.physical,sku.endsWith('paperback'));
    assert.ok(env[item.priceVariable]);
    if(!item.physical)assert.ok(ebookKey(env,sku).endsWith('.epub'));
  }
  assert.throws(()=>cleanCart({items:[{sku:'a-dragons-tale-paperback',quantity:1}]}),/Invalid cart item/);
});

test('multi-book quantities survive Stripe fulfilment mapping',()=>{
  const lines=[
    {price:{id:'price_bfl_paper'},quantity:3},
    {price:{id:'price_glass_epub'},quantity:1},
    {price:{id:'price_ebook'},quantity:1}
  ];
  const bought=purchasedSkus(env,lines);
  assert.deepEqual(bought.map(({sku,quantity})=>[sku,quantity]),[
    ['beneath-falling-leaves-paperback',3],['wildborn-ebook',1],['the-glass-tapestry-ebook',1]
  ]);
});

test('checkout supports a mixed physical and digital author-book basket',async()=>{
  const original=globalThis.fetch;let called=false;
  globalThis.fetch=async(url,options)=>{
    called=true;assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');
    const f=new URLSearchParams(options.body);
    assert.equal(f.get('line_items[0][price]'),'price_bfl_paper');
    assert.equal(f.get('line_items[0][quantity]'),'2');
    assert.equal(f.get('line_items[1][price]'),'price_glass_epub');
    assert.equal(f.get('line_items[1][quantity]'),'1');
    assert.equal(f.get('shipping_address_collection[allowed_countries][0]'),'AU');
    assert.equal(f.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),'1695');
    assert.equal(f.has('automatic_tax[enabled]'),false);
    return new Response(JSON.stringify({url:'https://checkout.stripe.com/c/pay/sandbox'}),{status:200});
  };
  try{
    const res=await checkout({request:request('https://chrisdeanbooks.com/api/checkout',{items:[{sku:'beneath-falling-leaves-paperback',quantity:2},{sku:'the-glass-tapestry-ebook',quantity:1}]}),env});
    assert.equal(res.status,200);
    assert.equal(called,true);
  }finally{globalThis.fetch=original;}
});

test('ebook-only checkout does not charge for shipping',async()=>{
  const original=globalThis.fetch;let called=false;
  globalThis.fetch=async(url,options)=>{
    called=true;
    const f=new URLSearchParams(options.body);
    assert.equal(f.get('line_items[0][price]'),'price_bfl_epub');
    assert.equal(f.has('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),false);
    assert.equal(f.has('shipping_address_collection[allowed_countries][0]'),false);
    return new Response(JSON.stringify({url:'https://checkout.stripe.com/c/pay/sandbox'}),{status:200});
  };
  try{
    const res=await checkout({request:request('https://chrisdeanbooks.com/api/checkout',{items:[{sku:'beneath-falling-leaves-ebook',quantity:1}]}),env});
    assert.equal(res.status,200);
    assert.equal(called,true);
  }finally{globalThis.fetch=original;}
});

test('tax collection is controlled by an explicit server-side flag',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    const f=new URLSearchParams(options.body);
    assert.equal(f.get('automatic_tax[enabled]'),'true');
    return new Response(JSON.stringify({url:'https://checkout.stripe.com/c/pay/sandbox'}),{status:200});
  };
  try{
    const res=await checkout({request:request('https://chrisdeanbooks.com/api/checkout',{items:[{sku:'wildborn-paperback',quantity:1}]}),env:{...env,STRIPE_TAX_ENABLED:'true'}});
    assert.equal(res.status,200);
  }finally{globalThis.fetch=original;}
});

test('server-side price catalogue validates all six prices against approved cents',async()=>{
  const original=globalThis.fetch;
  const prices=Object.values(ITEMS).reduce((acc,item)=>{
    acc[env[item.priceVariable]]={currency:'aud',type:'one_time',active:true,unit_amount:item.expectedCents};return acc;
  },{});
  globalThis.fetch=async(url)=>{
    const id=url.substring(url.lastIndexOf('/')+1);
    return new Response(JSON.stringify(prices[id]??{}),{status:prices[id]?200:404});
  };
  try{
    const res=await catalog({env});
    assert.equal(res.status,200);
    const data=await res.json();
    assert.equal(Object.keys(data.products).length,6);
    assert.equal(data.products['beneath-falling-leaves-paperback'].price,2499);
    prices.price_bfl_paper.unit_amount=2500;
    const mismatch=await catalog({env});
    assert.equal(mismatch.status,503);
  }finally{globalThis.fetch=original;}
});

test('Australian Parcel Post tiers use total paperback quantity',()=>{
  const cart=items=>cleanCart({items});
  assert.equal(shippingForCart(cart([{sku:'wildborn-ebook',quantity:1}])),null);
  assert.equal(shippingForCart(cart([{sku:'wildborn-paperback',quantity:1}])).cents,1295);
  assert.equal(shippingForCart(cart([{sku:'wildborn-paperback',quantity:2}])).cents,1695);
  assert.equal(shippingForCart(cart([{sku:'wildborn-paperback',quantity:3},{sku:'the-glass-tapestry-ebook',quantity:1}])).cents,1695);
  assert.equal(shippingForCart(cart([{sku:'wildborn-paperback',quantity:2},{sku:'beneath-falling-leaves-paperback',quantity:2}])).cents,2195);
  assert.equal(shippingForCart(cart([{sku:'wildborn-paperback',quantity:5}])).cents,2195);
  assert.throws(()=>cart([{sku:'wildborn-paperback',quantity:4},{sku:'beneath-falling-leaves-paperback',quantity:2}]),/Maximum quantity/);
});

test('4 paperback Checkout Session uses the large parcel tier',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    const f=new URLSearchParams(options.body);
    assert.equal(f.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),'2195');
    assert.equal(f.get('shipping_address_collection[allowed_countries][0]'),'AU');
    return new Response(JSON.stringify({url:'https://checkout.stripe.com/c/pay/sandbox'}),{status:200});
  };
  try{
    const res=await checkout({request:request('https://chrisdeanbooks.com/api/checkout',{items:[{sku:'wildborn-paperback',quantity:2},{sku:'beneath-falling-leaves-paperback',quantity:2}]}),env});
    assert.equal(res.status,200);
  }finally{globalThis.fetch=original;}
});

test('6 paperbacks are rejected before initiating Stripe checkout',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error('Stripe must not be contacted');};
  try{
    const res=await checkout({request:request('https://chrisdeanbooks.com/api/checkout',{items:[{sku:'wildborn-paperback',quantity:4},{sku:'beneath-falling-leaves-paperback',quantity:2}]}),env});
    assert.equal(res.status,400);
    assert.match((await res.json()).error,/Maximum quantity/);
  }finally{globalThis.fetch=original;}
});
