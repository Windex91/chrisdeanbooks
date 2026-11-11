import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutOriginAllowed} from '../lib/commerce.js';
import {onRequest} from '../functions/_middleware.js';
const live={SITE_URL:'https://chrisdeanbooks.com',STRIPE_MODE:'live'};
test('production trusts only canonical and exact owned HTTPS www origin',()=>{
  for(const origin of ['https://chrisdeanbooks.com','https://www.chrisdeanbooks.com'])assert.equal(checkoutOriginAllowed(live,origin),true);
  for(const origin of [null,'null','', 'http://www.chrisdeanbooks.com','https://www.chrisdeanbooks.com:444','https://chrisdeanbooks.com.evil.example','https://evil.example','https://www.chrisdeanbooks.com/'])assert.equal(checkoutOriginAllowed(live,origin),false);
});
test('preview trust is isolated to its configured origin',()=>{
 const env={SITE_URL:'https://special-packs-preview.christopherdeanbooks.pages.dev',STRIPE_MODE:'sandbox'};
 assert.equal(checkoutOriginAllowed(env,env.SITE_URL),true);
 for(const origin of [live.SITE_URL,'https://www.chrisdeanbooks.com','https://other.christopherdeanbooks.pages.dev'])assert.equal(checkoutOriginAllowed(env,origin),false);
});
test('www page navigation redirects preserving path and query without loops',async()=>{
 for(const method of ['GET','HEAD']){
  const response=await onRequest({request:new Request('https://www.chrisdeanbooks.com/books/wildborn/?edition=special-pack',{method}),next(){throw Error('should redirect');}});
  assert.equal(response.status,301);assert.equal(response.headers.get('location'),'https://chrisdeanbooks.com/books/wildborn/?edition=special-pack');
 }
});
test('canonical, preview, API and POST requests pass through untouched',async()=>{
 for(const [url,method] of [['https://chrisdeanbooks.com/books/','GET'],['https://special-packs-preview.christopherdeanbooks.pages.dev/books/','GET'],['https://www.chrisdeanbooks.com/api/download?access=signed','GET'],['https://www.chrisdeanbooks.com/api/webhook','POST'],['https://www.chrisdeanbooks.com/api/checkout','POST']]){
  const sentinel=new Response('unchanged');assert.equal(await onRequest({request:new Request(url,{method}),next:()=>sentinel}),sentinel);
 }
});
