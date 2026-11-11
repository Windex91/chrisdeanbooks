import {ITEMS,checkoutAllowed,stripeMode,validatePrice,json,cleanCart,shippingForCart,priceId,ebookKey,siteUrl,checkoutOriginAllowed,reserveInventory,attachCheckoutSession,releaseInventory,StockUnavailableError} from '../../lib/commerce.js';
export async function onRequestPost({request,env}){
  try{
    if(!checkoutAllowed(env))return json({error:'The bookshop is in preview mode. Checkout is not enabled yet.'},503);
    const origin=siteUrl(env);
    if(!checkoutOriginAllowed(env,request.headers.get('Origin')))return json({error:'Origin not allowed'},403);
    if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET||!env.RESEND_API_KEY||!env.RESEND_FROM_ADDRESS||!env.SHOP_OWNER_EMAIL||!env.ORDERS||(!env.DOWNLOAD_TOKEN_SECRET||env.DOWNLOAD_TOKEN_SECRET.length<32))return json({error:'Shop payment and fulfilment services are not completely configured'},503);
    if(Number(request.headers.get('content-length')||0)>8000)return json({error:'Cart request too large'},413);
    const raw=await request.text();if(raw.length>8000)return json({error:'Cart request too large'},413);
    let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid cart'},400);}
    const cart=cleanCart(body);const hasPhysical=cart.some(x=>x.item.physical);
    const shipping=shippingForCart(cart,body.country||'AU');
    if(shipping&&!shipping.allowed)return json({error:shipping.message,quoteRequired:true},422);
    for(const entry of cart){if(!priceId(env,entry.sku))return json({error:`Stripe price missing for ${entry.sku}`},503);if(!entry.item.physical){if(!env.EBOOKS)return json({error:'Ebook storage is not connected'},503);const exists=await env.EBOOKS.head(ebookKey(env,entry.sku));if(!exists)return json({error:'Ebook delivery file has not been uploaded'},503);}}
    await Promise.all(cart.map(entry=>validatePrice(env,entry.sku)));
    if(env.GST_TREATMENT==='registered_inclusive'&&env.TAX_REGISTRATION_VERIFIED!=='true')return json({error:'Tax configuration is incomplete'},503);
    // The reservation holds stock during checkout. Stripe automatically expires
    // unpaid sessions after one hour; the signed expired webhook releases them.
    const expiresAt=Math.floor(Date.now()/1000)+3600;
    const reservationId=await reserveInventory(env.ORDERS,cart,expiresAt);
    const params=new URLSearchParams();params.set('mode','payment');params.set('allow_promotion_codes','true');params.set('success_url',origin+'/success/?session_id={CHECKOUT_SESSION_ID}');params.set('cancel_url',origin+'/cancel/');params.set('customer_creation','always');params.set('integration_identifier','chris_dean_books_qmvbzkrt');params.set('adaptive_pricing[enabled]','false');params.set('metadata[store]','chris-dean-books');params.set('metadata[reservation_id]',reservationId);params.set('expires_at',String(expiresAt));if(env.GST_TREATMENT==='registered_inclusive'){if(env.TAX_REGISTRATION_VERIFIED!=='true')throw Error('Tax registration not verified');params.set('automatic_tax[enabled]','true');}params.set('metadata[gst_treatment]',env.GST_TREATMENT||'sandbox_only');
    cart.forEach((entry,i)=>{params.set(`line_items[${i}][price]`,priceId(env,entry.sku));params.set(`line_items[${i}][quantity]`,String(entry.quantity));});
    if(hasPhysical){
      params.set('shipping_address_collection[allowed_countries][0]',shipping.country);
      params.set('metadata[shipping_version]',shipping.version);params.set('metadata[shipping_country]',shipping.country);params.set('metadata[shipping_grams]',String(shipping.grams));params.set('metadata[shipping_cents]',String(shipping.cents));
      params.set('custom_text[shipping_address][message]','Your shipping price is for the country selected in your bag. To change country, return to your bag. International customs duties, import taxes or clearance fees may apply; any required prepaid arrangements must be confirmed before ordering.');
      // The existing flat Australian shipping charge applies once per physical order.
      params.set('shipping_options[0][shipping_rate_data][type]','fixed_amount');
      params.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]','aud');
      params.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]',String(shipping.cents));
      params.set('shipping_options[0][shipping_rate_data][display_name]',shipping.displayName);
      if(env.GST_TREATMENT==='registered_inclusive')params.set('shipping_options[0][shipping_rate_data][tax_behavior]','inclusive');
    }
    let session;
    try{
      const result=await fetch('https://api.stripe.com/v1/checkout/sessions',{
        method:'POST',
        headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':reservationId,'Stripe-Version':'2026-09-30.endive'},
        body:params.toString()
      });
      session=await result.json();
      if(!result.ok||session.livemode!==stripeMode(env)||!session?.url||!/^cs_[a-zA-Z0-9_]+$/.test(session.id||''))throw Error('Stripe Checkout could not start');
      if(new URL(session.url).hostname!=='checkout.stripe.com')throw Error('Unexpected checkout destination');
    }catch(e){
      // A timeout may occur AFTER Stripe creates a session. Keep the hold
      // until a signed expiry/failure event or manual reconciliation.
      throw e;
    }
    try{await attachCheckoutSession(env.ORDERS,reservationId,session.id);}
    catch(error){
      // Do not hand out a payment URL unless its stock reservation was saved.
      // Ask Stripe to expire the session before releasing inventory. On failure,
      // keep stock reserved for manual investigation or Stripe's expiry event.
      try{
        const expired=await fetch('https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(session.id)+'/expire',{
          method:'POST',headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY}
        });
        if(expired.ok)await releaseInventory(env.ORDERS,reservationId,session.id);
      }catch(e){console.error('Unable to expire orphaned checkout session',e.name);}
      throw error;
    }
    return json({url:session.url});
  }catch(e){console.error('Checkout issue:',e.name);const invalid=/Invalid cart|Maximum quantity/.test(e.message);return json({error:e instanceof StockUnavailableError?e.message:invalid?e.message:'Checkout could not be started. Please try again or contact the author.'},e instanceof StockUnavailableError?409:invalid?400:503);}
}
