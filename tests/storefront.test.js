import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const catalogue=readFileSync(new URL('../public/assets/catalog.js',import.meta.url),'utf8');
async function storefront(ok, incomplete=false, hash=""){
  let scrolled=false;
  const classes=new Set();
  const elements=new Map();
  for(const key of ['#cart-items','#cart-subtotal','#checkout-button','#checkout-note'])elements.set(key,{style:{},addEventListener(){}});
  const context={location:{hash},requestAnimationFrame:fn=>fn(),window:{},Intl,URLSearchParams,console:{error(){}},localStorage:{getItem:()=>JSON.stringify({'wildborn-paperback':1})},document:{getElementById:id=>id==='purchase'?{scrollIntoView(){scrolled=true;}}:null,body:{dataset:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},querySelector:s=>elements.get(s)||null,querySelectorAll:()=>[],addEventListener(){}}};
  vm.createContext(context);vm.runInContext(catalogue,context);
  let requests=0;
  context.fetch=async()=>{requests++;return {ok,json:async()=>({products:incomplete?{}:Object.fromEntries(Object.entries(context.window.CD_STORE.products).map(([sku,p])=>[sku,{price:p.price}]))})};};
  vm.runInContext(app,context);
  await new Promise(resolve=>setImmediate(resolve));
  return {classes,elements,requests,scrolled};
}
test('storefront discovers enabled checkout from server despite static catalogue default',async()=>{
  const state=await storefront(true);assert.equal(state.requests,1);assert.ok(state.classes.has('commerce-ready'));assert.equal(state.elements.get('#checkout-button').disabled,false);
});
test('storefront hides purchasing when server disables checkout or prices are incomplete',async()=>{
  for(const args of [[false,false],[true,true]]){const state=await storefront(...args);assert.ok(!state.classes.has('commerce-ready'));assert.equal(state.elements.get('#checkout-button').disabled,true);}
});

test("purchase deep link scrolls after prices are ready",async()=>{
  assert.equal((await storefront(true,false,"#purchase")).scrolled,true);
  assert.equal((await storefront(true)).scrolled,false);
  assert.equal((await storefront(false,false,"#purchase")).scrolled,false);
});
