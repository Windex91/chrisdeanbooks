import {ITEMS,json,cleanCart,priceId,ebookKey,siteUrl} from '../../lib/commerce.js';
export async function onRequestPost({request,env}){
  try{
    if(env.SHOP_ENABLED!=='true')return json({error:'The bookshop is in preview mode. Checkout is not enabled yet.'},503);
    const origin=siteUrl(env);
    if(request.headers.get('Origin')&&request.headers.get('Origin')!==origin)return json({error:'Origin not allowed'},403);
    if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET||!env.RESEND_API_KEY||!env.RESEND_FROM_ADDRESS||!env.SHOP_OWNER_EMAIL||!env.ORDERS)return json({error:'Shop payment and fulfilment services are not completely configured'},503);
    if(Number(request.headers.get('content-length')||0)>8000)return json({error:'Cart request too large'},413);
    const cart=cleanCart(await request.json());const hasPhysical=cart.some(x=>x.item.physical);
    for(const entry of cart){if(!priceId(env,entry.sku))return json({error:`Stripe price missing for ${entry.sku}`},503);if(!entry.item.physical){if(!env.EBOOKS)return json({error:'Ebook storage is not connected'},503);const exists=await env.EBOOKS.head(ebookKey(env,entry.sku));if(!exists)return json({error:'Ebook delivery file has not been uploaded'},503);}}
    if(hasPhysical&&!env.STRIPE_SHIPPING_RATE_AU)return json({error:'Australian shipping rate is not configured'},503);
    const params=new URLSearchParams();params.set('mode','payment');params.set('success_url',origin+'/success/?session_id={CHECKOUT_SESSION_ID}');params.set('cancel_url',origin+'/cancel/');params.set('customer_creation','always');params.set('payment_method_types[0]','card');params.set('metadata[store]','chris-dean-books');
    cart.forEach((entry,i)=>{params.set(`line_items[${i}][price]`,priceId(env,entry.sku));params.set(`line_items[${i}][quantity]`,String(entry.quantity));});
    if(hasPhysical){params.set('shipping_address_collection[allowed_countries][0]','AU');params.set('shipping_options[0][shipping_rate]',env.STRIPE_SHIPPING_RATE_AU);}
    const result=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Content-Type':'application/x-www-form-urlencoded'},body:params.toString()});const data=await result.json();if(!result.ok||!data.url)throw Error(data.error?.message||'Stripe Checkout could not start');
    if(new URL(data.url).hostname!=='checkout.stripe.com')throw Error('Unexpected checkout destination');
    return json({url:data.url});
  }catch(e){console.error('Checkout issue:',e.message);return json({error:/Invalid cart|Maximum quantity/.test(e.message)?e.message:'Checkout could not be started. Please try again or contact the author.'},/Invalid cart|Maximum quantity/.test(e.message)?400:500);}
}
