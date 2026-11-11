import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanCart,purchasedSkus,priceId,ITEMS} from '../lib/commerce.js';
import {parcelForCart,shippingForCart,verifyShippingSession,RATE_VERSION,REGIONS} from '../lib/shipping.js';
import {COUNTRIES} from '../lib/shipping-countries.js';
import {onRequestPost as quote} from '../functions/api/shipping-quote.js';
import {onRequestPost as checkout} from '../functions/api/checkout.js';
const cart=(...skus)=>cleanCart({items:skus.map(sku=>({sku,quantity:1}))});
const wb='wildborn-paperback',bfl='beneath-falling-leaves-paperback',glass='the-glass-tapestry-paperback',pack='beneath-falling-leaves-special-pack',ebook='wildborn-ebook';
const env={SHOP_ENABLED:'true',STRIPE_MODE:'sandbox',STRIPE_SECRET_KEY:'sk_test_fixture',SITE_URL:'https://sandbox.example.com'};
const req=(body,origin=env.SITE_URL)=>new Request(env.SITE_URL+'/api/shipping-quote',{method:'POST',headers:{Origin:origin},body:JSON.stringify(body)});
function approval(items,country){return {reviewedUntil:'2099-01-01',countries:[country],profiles:[{signature:parcelForCart(items).signature,fitVerified:true,dimensionsMm:[300,250,100],packagingCents:0,costs:{[country]:{feeBps:350,fixedCents:30,customsCents:0}}}]};}
test('measured weights plus order packaging and per-pack extras, never ebooks',()=>{
 for(const [items,weight] of [[cart(wb),340],[cart(bfl),600],[cart(wb,bfl,glass),1170],[cart(pack),700],[cart(pack,ebook),700],[cart('wildborn-special-pack'),440],[cart(ebook),0]])assert.equal(parcelForCart(items).grams,weight);
 assert.equal(parcelForCart(cleanCart({items:[{sku:pack,quantity:2}]})).grams,1300);
});
test('Australian shipping once per order regardless of quantity; digital-only zero',()=>{
 for(const items of [cart(wb),cart(wb,bfl,glass),cart(pack),cleanCart({items:[{sku:wb,quantity:100}]})])assert.equal(shippingForCart(items,'AU').cents,1295);
 assert.equal(shippingForCart(cart(ebook),'US'),null);
});
test('all configured regional brackets match the requested AUD rates',()=>{
 assert.deepEqual(Object.values(REGIONS).map(x=>x.rates),[[2500,3400,4100],[3000,4400,5700],[3400,4900,6300],[4000,5500,7000],[4900,6800,8700]]);
 // Simulated verified packing only: not a claim that actual mailers fit.
 for(const [items,country,cents] of [[cart(wb),'NZ',2500],[cart(bfl),'NZ',3400],[cart(wb,bfl,glass),'NZ',4100],[cart(pack),'GB',5500],[cart(wb,bfl,glass),'DE',7000],[cart(wb),'JP',3000],[cart(wb),'CA',3400],[cart(wb),'MX',4900]])assert.equal(shippingForCart(items,country,approval(items,country)).cents,cents);
});
test('country mapping uses actual parcel zones rather than geography',()=>{
 assert.equal(COUNTRIES.NZ.zone,1);assert.equal(COUNTRIES.CA.zone,3);assert.equal(COUNTRIES.BR.zone,4);assert.equal(COUNTRIES.LV.zone,5);
});
test('unverified packing, unsupported destinations, US customs and >1.5kg fail closed',()=>{
 for(const country of ['NZ','GB','DE','US','RU','ZZ','OTHER'])assert.equal(shippingForCart(cart(wb),country).allowed,false);
 assert.equal(shippingForCart(cart(wb),'US',approval(cart(wb),'US')).code,'destination_review');
 assert.equal(shippingForCart(cleanCart({items:[{sku:bfl,quantity:3}]}),'NZ').code,'overweight');
 const a=approval(cart(wb),'NZ');a.profiles[0].packagingCents=999;assert.equal(shippingForCart(cart(wb),'NZ',a).code,'cost_review');
 a.profiles[0].packagingCents=0;a.reviewedUntil='2020-01-01';assert.equal(shippingForCart(cart(wb),'NZ',a).allowed,false);
});
test('quote ignores visitor amounts, weight, region and approvals; rejects foreign origin',async()=>{
 const body={items:[{sku:wb,quantity:1,price:1,weight:0}],country:'AU',shipping:0,region:1,approvals:approval(cart(wb),'US')};
 const data=await (await quote({request:req(body),env})).json();assert.equal(data.shipping.cents,1295);assert.equal(data.shipping.grams,340);assert.equal(data.total,3094);
 assert.equal((await quote({request:req(body,'https://evil.invalid'),env})).status,403);
 body.country='US';assert.equal((await (await quote({request:req(body),env})).json()).shipping.allowed,false);
 body.items=[{sku:ebook,quantity:1}];const digital=await (await quote({request:req(body),env})).json();assert.equal(digital.shipping,null);assert.equal(digital.total,299);
});
test('signed fulfilment still rejects changed country, shipping amount and weight',()=>{
 const items=[{sku:wb,physical:true,format:'Paperback',quantity:1}];
 const session={metadata:{shipping_version:RATE_VERSION,shipping_country:'AU',shipping_grams:'340',shipping_cents:'1295'},total_details:{amount_shipping:1295},collected_information:{shipping_details:{address:{country:'AU'}}}};
 assert.doesNotThrow(()=>verifyShippingSession(session,items));
 session.collected_information.shipping_details.address.country='NZ';assert.throws(()=>verifyShippingSession(session,items),/destination/);
 session.collected_information.shipping_details.address.country='AU';session.total_details.amount_shipping=0;assert.throws(()=>verifyShippingSession(session,items),/amount/);
 session.total_details.amount_shipping=1295;session.metadata.shipping_grams='0';assert.throws(()=>verifyShippingSession(session,items),/weight/);
});
test('legacy Australian orders remain fulfilable, and old pack prices remain recognisable',()=>{
 assert.doesNotThrow(()=>verifyShippingSession({metadata:{},shipping_details:{address:{country:'AU'}},total_details:{amount_shipping:1300}},[{physical:true}]));
 const e={STRIPE_MODE:'live',STRIPE_PRICE_BENEATH_FALLING_LEAVES_SPECIAL_PACK:'price_old_pack'};
 for(const id of ['price_old_pack',priceId(e,pack)])assert.equal(purchasedSkus(e,[{price:{id},quantity:1}])[0].sku,pack);
});
test('Kindle-exclusive Glass EPUB cannot be sold through stale carts or forged requests',()=>{
 assert.throws(()=>cart('the-glass-tapestry-ebook'),/exclusive to Kindle/);
 assert.equal(ITEMS['the-glass-tapestry-ebook'].saleDisabled,true);
 assert.equal(ITEMS['the-glass-tapestry-special-pack'],undefined);
});
