import {cleanCart,checkoutAllowed,checkoutOriginAllowed,json} from '../../lib/commerce.js';
import {shippingForCart} from '../../lib/shipping.js';
import {COUNTRIES} from '../../lib/shipping-countries.js';
export function onRequestGet(){return json({countries:[{code:'AU',name:'Australia'},...Object.entries(COUNTRIES).map(([code,c])=>({code,name:c.name})).sort((a,b)=>a.name.localeCompare(b.name))]});}
export async function onRequestPost({request,env}){
 if(!checkoutAllowed(env))return json({error:'Checkout is unavailable'},503);
 if(!checkoutOriginAllowed(env,request.headers.get('Origin')))return json({error:'Origin not allowed'},403);
 try{
  const raw=await request.text();if(raw.length>8000)return json({error:'Cart request too large'},413);
  const body=JSON.parse(raw),cart=cleanCart(body),shipping=shippingForCart(cart,body.country);
  const subtotal=cart.reduce((n,e)=>n+e.item.expectedCents*e.quantity,0);
  return json({currency:'AUD',subtotal,shipping,total:shipping&&!shipping.allowed?null:subtotal+(shipping?.cents||0)});
 }catch{return json({error:'Please check your bag and delivery country.'},400);}
}
