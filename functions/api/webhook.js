import {verifyStripeSignature,json,lineItems,purchasedSkus,siteUrl,escapeHtml,settleInventory,releaseInventory,stripeMode,ITEMS,isNoCostOrder} from '../../lib/commerce.js';
import {createEbookAccess} from '../../lib/access.js';
import {deliverOrderEmail,paymentClear} from '../../lib/fulfilment.js';
export async function onRequestPost({request,env}){
  if(!env.STRIPE_WEBHOOK_SECRET||!env.ORDERS)return json({error:'Webhook is not configured'},503);
  const payload=await request.text();if(payload.length>100000)return json({error:'Payload too large'},413);
  if(!(await verifyStripeSignature(payload,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET)))return json({error:'Invalid webhook signature'},400);
  let event;try{event=JSON.parse(payload);}catch{return json({error:'Invalid event JSON'},400);}
  try{
    if(event.livemode!==stripeMode(env))return json({error:'Wrong event mode'},400);
    const session=event.data?.object;
    if(['charge.refunded','charge.dispute.created'].includes(event.type)){
      if(session?.payment_intent)await env.ORDERS.prepare('INSERT OR REPLACE INTO revoked_payments (payment_intent,reason,event_id) VALUES (?,?,?)').bind(session.payment_intent,event.type,event.id).run();
      return json({received:true});
    }
    if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type))return json({received:true});
    if(session?.metadata?.store!=='chris-dean-books')return json({received:true});
    if(!session.id||!session.metadata.reservation_id||session.livemode!==stripeMode(env))return json({error:'Invalid store session'},400);
    if(['checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type)){
      await releaseInventory(env.ORDERS,session.metadata.reservation_id,session.id);return json({received:true});
    }
    if((session.payment_status!=='paid'&&!isNoCostOrder(session))||session.mode!=='payment')return json({received:true});
    if(!await paymentClear(env,session))return json({received:true});
    const lines=await lineItems(env,session.id),items=purchasedSkus(env,lines);
    if(!items.length||items.length!==lines.length||session.currency!=='aud')throw Error('Unrecognised paid order');
    for(const item of items){if(item.quantity>ITEMS[item.sku].maxQuantity)throw Error('Invalid paid quantity');}
    const email=session.customer_details?.email||session.customer_email;if(!email)throw Error('Missing customer email');
    const address=session.collected_information?.shipping_details||session.shipping_details||null;
    if(items.some(x=>x.physical)&&(!address?.address||address.address.country!=='AU'))throw Error('Missing Australian shipping address');
    await settleInventory(env.ORDERS,session.metadata.reservation_id,session.id);
    await env.ORDERS.batch([
      env.ORDERS.prepare('INSERT OR IGNORE INTO orders (session_id,email,items_json,shipping_json) VALUES (?,?,?,?)').bind(session.id,email,JSON.stringify(items),JSON.stringify(address)),
      env.ORDERS.prepare('INSERT OR IGNORE INTO order_payments (session_id,payment_intent,amount_total,shipping_total,tax_total,currency,livemode) VALUES (?,?,?,?,?,?,?)').bind(session.id,session.payment_intent||'',session.amount_total,session.total_details?.amount_shipping||0,session.total_details?.amount_tax||0,session.currency,Number(session.livemode))
    ]);
    const row=await env.ORDERS.prepare('SELECT customer_notified,owner_notified FROM orders WHERE session_id=?').bind(session.id).first();
    const claim=await createEbookAccess(env,session),orderUrl=siteUrl(env)+'/success/?access='+encodeURIComponent(claim);
    const detail=items.map(x=>escapeHtml(x.title+' — '+x.format+' × '+x.quantity)).join('<br>');
    const amount=n=>'A$'+(n/100).toFixed(2);
    const taxNote=session.metadata?.gst_treatment==='not_registered'?'GST not charged — seller is not registered for GST.':`Tax included: ${amount(session.total_details?.amount_tax||0)}`;
    const discount=session.total_details?.amount_discount||0;
    const totals=`<p>${discount?'Discount: '+amount(discount)+' AUD<br>':''}Total paid: ${amount(session.amount_total)} AUD<br>Shipping: ${amount(session.total_details?.amount_shipping||0)}<br>${taxNote}</p>`;
    const prefix=session.livemode?'':'[SANDBOX — NO REAL ORDER] ';
    if(!row.customer_notified){
      await deliverOrderEmail(env,session.id+'/customer/v1',email,prefix+'Your Christopher Dean Books order',`<h1>Thank you, ${escapeHtml(session.customer_details?.name||'reader')}.</h1><p>Order: ${escapeHtml(session.id)}</p><p>${detail}</p>${totals}<p>${items.some(x=>x.physical)?'Your paperback order will be packed and posted by the author.':''}</p><p><a href="${orderUrl}">View order and EPUB downloads</a></p><p>Keep this link private. Download access expires seven days after checkout was started. Reply to this email for help or renewed access.</p>`);
      await env.ORDERS.prepare('UPDATE orders SET customer_notified=1 WHERE session_id=?').bind(session.id).run();
    }
    if(!row.owner_notified){
      await deliverOrderEmail(env,session.id+'/owner/v1',env.SHOP_OWNER_EMAIL,prefix+'New paid book order',`<h2>Paid order ${escapeHtml(session.id)}</h2><p>Customer: ${escapeHtml(email)}</p><p>${detail}</p>${totals}<pre>${escapeHtml(address?JSON.stringify(address,null,2):'Digital-only order; no postage')}</pre>`);
      await env.ORDERS.prepare('UPDATE orders SET owner_notified=1 WHERE session_id=?').bind(session.id).run();
    }
    return json({received:true});
  }catch(e){console.error('Order fulfilment failed:',e.name);return json({error:'Fulfilment failed; retry required'},500);}
}
