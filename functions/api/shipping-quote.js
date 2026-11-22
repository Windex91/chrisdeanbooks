import {dragonAvailable,isPending,DRAGON_EBOOK} from '../../lib/preorders.js';
import {quoteDelivery} from '../../lib/preorder-shipping.js';
import {cleanCart,checkoutAllowed,checkoutOriginAllowed,json} from '../../lib/commerce.js';
import {shippingForCart} from '../../lib/shipping.js';
import {COUNTRIES} from '../../lib/shipping-countries.js';
export function onRequestGet(){return json({countries:[{code:'AU',name:'Australia'},...Object.entries(COUNTRIES).map(([code,c])=>({code,name:c.name})).sort((a,b)=>a.name.localeCompare(b.name))]});}
export async function onRequestPost({request,env}){
 if(!checkoutAllowed(env))return json({error:'Checkout is unavailable'},503);
 if(!checkoutOriginAllowed(env,request.headers.get('Origin')))return json({error:'Origin not allowed'},403);
 try{
  const raw=await request.text();if(raw.length>8000)return json({error:'Cart request too large'},413);
  const body=JSON.parse(raw),cart=cleanCart(body),shipping=quoteDelivery(cart,body.country,body.shippingPlan);
  for(const entry of cart)if(!await dragonAvailable(env,entry.sku))return json({error:'This pre-order is not available yet.'},503);
  const subtotal=cart.reduce((n,e)=>n+e.item.expectedCents*e.quantity,0);
  return json({currency:'AUD',subtotal,shipping,total:shipping&&!shipping.allowed?null:subtotal+(shipping?.cents||0)});
 }catch{return json({error:'Please check your bag and delivery country.'},400);}
}
