import {shippingForCart} from './shipping.js';
import {mixedPreorder} from './preorders.js';
export function quoteDelivery(cart,country,plan,now=Date.now()){
 const shipping=shippingForCart(cart,country);
 if(!shipping)return null;
 const mixed=mixedPreorder(cart,now);
 if(!mixed)return {...shipping,plan:'together',mixed:false};
 if(!['together','split'].includes(plan))return {...shipping,allowed:false,code:'delivery_choice',mixed:true,message:'Would you like all physical items shipped together when available? Please select Yes or No.'};
 if(!shipping.allowed)return {...shipping,plan,mixed:true};
 // International split parcels each need their own verified packing approval.
 if(plan==='split'&&country!=='AU')return {...shipping,allowed:false,plan,mixed:true,code:'split_quote',message:'Please contact us for a split international delivery quote.'};
 const cents=plan==='split'?Math.round(shipping.cents*1.5):shipping.cents;
 return {...shipping,cents,plan,mixed:true,displayName:plan==='split'?'Australia Post tracked — two dispatches (+50%)':shipping.displayName};
}
