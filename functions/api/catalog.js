import {ITEMS,json,priceId,stripeGet} from '../../lib/commerce.js';
export async function onRequestGet({env}){
  if(env.SHOP_ENABLED!=='true'||!env.STRIPE_SECRET_KEY||!env.ORDERS?.prepare)return json({error:'The store is in preview mode'},503);
  try{
    const products={};
    for(const [sku,item] of Object.entries(ITEMS)){
      const id=priceId(env,sku);if(!id)throw Error('Missing Stripe price for '+sku);
      const price=await stripeGet(env,'/prices/'+encodeURIComponent(id));
      if(price.currency!=='aud'||price.type!=='one_time'||!price.active||
         !Number.isInteger(price.unit_amount)||price.unit_amount!==item.expectedCents)
        throw Error('Stripe Price does not match approved AUD price for '+sku);
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
