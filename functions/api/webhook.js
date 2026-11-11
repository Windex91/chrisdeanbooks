import {verifyShippingSession} from '../../lib/shipping.js';
import {customerOrderEmail,ownerOrderEmail} from '../../lib/order-emails.js';
import {verifyStripeSignature,json,lineItems,purchasedSkus,siteUrl,settleInventory,releaseInventory,stripeMode,ITEMS,isNoCostOrder} from '../../lib/commerce.js';
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
    verifyShippingSession(session,items);
    await settleInventory(env.ORDERS,session.metadata.reservation_id,session.id);
    await env.ORDERS.batch([
      env.ORDERS.prepare('INSERT OR IGNORE INTO orders (session_id,email,items_json,shipping_json) VALUES (?,?,?,?)').bind(session.id,email,JSON.stringify(items),JSON.stringify(address)),
      env.ORDERS.prepare('INSERT OR IGNORE INTO order_payments (session_id,payment_intent,amount_total,shipping_total,tax_total,currency,livemode) VALUES (?,?,?,?,?,?,?)').bind(session.id,session.payment_intent||'',session.amount_total,session.total_details?.amount_shipping||0,session.total_details?.amount_tax||0,session.currency,Number(session.livemode))
    ]);
    const row=await env.ORDERS.prepare('SELECT customer_notified,owner_notified FROM orders WHERE session_id=?').bind(session.id).first();
    const claim=await createEbookAccess(env,session),orderUrl=siteUrl(env)+'/success/?access='+encodeURIComponent(claim);
    const prefix=session.livemode?'':'[SANDBOX — NO REAL ORDER] ';
    if(!row.customer_notified){
      await deliverOrderEmail(env,session.id+'/customer/v1',email,prefix+'Your Christopher Dean Books order',customerOrderEmail(session,items,orderUrl));
      await env.ORDERS.prepare('UPDATE orders SET customer_notified=1 WHERE session_id=?').bind(session.id).run();
    }
    if(!row.owner_notified){
      await deliverOrderEmail(env,session.id+'/owner/v1',env.SHOP_OWNER_EMAIL,prefix+'New paid book order',ownerOrderEmail(session,items,email,address));
      await env.ORDERS.prepare('UPDATE orders SET owner_notified=1 WHERE session_id=?').bind(session.id).run();
    }
    return json({received:true});
  }catch(e){console.error('Order fulfilment failed:',e.name);return json({error:'Fulfilment failed; retry required'},500);}
}
