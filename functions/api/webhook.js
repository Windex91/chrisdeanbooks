import {verifyStripeSignature,json,lineItems,purchasedSkus,siteUrl,sendResend,escapeHtml} from '../../lib/commerce.js';
export async function onRequestPost({request,env}){
  if(!env.STRIPE_WEBHOOK_SECRET||!env.ORDERS)return json({error:'Webhook is not configured'},503);
  const payload=await request.text();if(payload.length>100000)return json({error:'Payload too large'},413);
  if(!(await verifyStripeSignature(payload,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET)))return json({error:'Invalid webhook signature'},400);
  const event=JSON.parse(payload);if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return json({received:true});
  const session=event.data?.object;if(session?.payment_status!=='paid'||session.mode!=='payment')return json({received:true});
  try{
    const lines=await lineItems(env,session.id),items=purchasedSkus(env,lines);if(!items.length)throw Error('Paid session contains no recognised products');
    const email=session.customer_details?.email||session.customer_email;if(!email)throw Error('Missing customer email');
    const address=session.collected_information?.shipping_details||session.shipping_details||null;
    await env.ORDERS.prepare('INSERT OR IGNORE INTO orders (session_id, email, items_json, shipping_json) VALUES (?, ?, ?, ?)').bind(session.id,email,JSON.stringify(items),JSON.stringify(address)).run();
    const row=await env.ORDERS.prepare('SELECT customer_notified, owner_notified FROM orders WHERE session_id = ?').bind(session.id).first();
    const safeName=escapeHtml(session.customer_details?.name||'reader');const orderUrl=siteUrl(env)+'/success/?session_id='+encodeURIComponent(session.id);
    if(!row.customer_notified){
      const message=`<div style="font-family:Georgia,serif;background:#101214;color:#f1ece2;padding:35px;max-width:650px"><h1 style="color:#d5b37a">Thank you, ${safeName}.</h1><p>Your order at Christopher Dean Books has been paid successfully.</p><p>${items.some(x=>x.physical)?'Any physical books in your order will be packed and shipped by the author. ':''}${items.some(x=>!x.physical)?'Your ebook download is available through the secure order page below.':''}</p><p><a style="display:inline-block;background:#d5b37a;color:#111;padding:14px 22px" href="${orderUrl}">View order & downloads</a></p><p style="font-size:12px">Keep this link private. It grants access to your purchased ebook downloads.</p></div>`;
      await sendResend(env,email,'Your Christopher Dean Books order',message);
      await env.ORDERS.prepare('UPDATE orders SET customer_notified=1 WHERE session_id=?').bind(session.id).run();
    }
    if(!row.owner_notified){
      const detail=items.map(x=>escapeHtml(x.title+' — '+x.format)).join('<br>');const shipping=escapeHtml(JSON.stringify(address,null,2)||'No shipping address (digital-only order)');
      await sendResend(env,env.SHOP_OWNER_EMAIL,'New paid book order — '+session.id,`<h2>New paid book order</h2><p>Order: ${escapeHtml(session.id)}</p><p>Customer: ${escapeHtml(email)}</p><p>Books:<br>${detail}</p><pre>${shipping}</pre><p>View the Stripe dashboard for the full order and shipping details.</p>`);
      await env.ORDERS.prepare('UPDATE orders SET owner_notified=1 WHERE session_id=?').bind(session.id).run();
    }
    return json({received:true});
  }catch(e){console.error('Webhook fulfilment:',e.message);return json({error:'Fulfilment failed; retry required'},500);}
}
