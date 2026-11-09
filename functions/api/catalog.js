import {ITEMS,json,priceId,stripeGet} from '../../lib/commerce.js';
export async function onRequestGet({env}){
  if(env.SHOP_ENABLED!=='true'||!env.STRIPE_SECRET_KEY)return json({error:'The store is in preview mode'},503);
  try{
    const products={};
    for(const [sku,item] of Object.entries(ITEMS)){
      const id=priceId(env,sku);if(!id)throw Error('Missing Stripe price for '+sku);
      const price=await stripeGet(env,'/prices/'+encodeURIComponent(id));
      if(price.currency!=='aud'||price.type!=='one_time'||!price.active||
         !Number.isInteger(price.unit_amount)||price.unit_amount!==item.expectedCents)
        throw Error('Stripe Price does not match approved AUD price for '+sku);
      products[sku]={price:price.unit_amount};
    }
    return json({currency:'AUD',products});
  }catch(e){console.error('Catalogue sync:',e.message);return json({error:'Store prices are temporarily unavailable'},503);}
}
