import {ITEMS,json,checkoutAllowed,validatePrice} from '../../lib/commerce.js';
export async function onRequestGet({env}){
  if(!checkoutAllowed(env)||!env.STRIPE_SECRET_KEY||!env.ORDERS?.prepare)return json({error:'The store is in preview mode'},503);
  try{
    const products={};
    for(const [sku,item] of Object.entries(ITEMS)){
      const price=await validatePrice(env,sku);
      let available=null;
      if(item.physical){
        const stock=await env.ORDERS.prepare('SELECT on_hand,reserved FROM inventory WHERE sku=?').bind(sku).first();
        if(!stock)throw Error('Missing inventory for '+sku);
        available=Math.max(0,stock.on_hand-stock.reserved);
      }
      products[sku]={price:price.unit_amount,available};
    }
    return json({currency:'AUD',products});
  }catch(e){console.error('Catalogue sync:',e.message);return json({error:'Store prices are temporarily unavailable'},503);}
}
