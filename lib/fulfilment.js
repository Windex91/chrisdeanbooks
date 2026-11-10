import {stripeGet,stripeMode,sendResend} from './commerce.js';

export async function paymentClear(env,session){
  if(!session.payment_intent||session.livemode!==stripeMode(env))return false;
  const revoked=await env.ORDERS.prepare('SELECT payment_intent FROM revoked_payments WHERE payment_intent=?').bind(session.payment_intent).first();
  if(revoked)return false;
  const payment=await stripeGet(env,'/payment_intents/'+encodeURIComponent(session.payment_intent)+'?expand[]=latest_charge');
  const charge=payment.latest_charge;
  return payment.status==='succeeded'&&payment.livemode===session.livemode&&charge&&typeof charge==='object'&&charge.paid===true&&!charge.disputed&&!charge.refunded&&charge.amount_refunded===0;
}

// Persist the exact request body before sending. Concurrent deliveries and retries
// use the same Resend idempotency key and body. Stop uncertain retries before
// Resend's 24-hour deduplication window ends; reconcile in Resend before retrying.
export async function deliverOrderEmail(env,id,to,subject,html){
  const now=Math.floor(Date.now()/1000);
  const payload=JSON.stringify({to,subject,html,replyTo:env.SHOP_OWNER_EMAIL});
  await env.ORDERS.prepare('INSERT OR IGNORE INTO email_outbox (id,payload_json,first_attempt) VALUES (?,?,?)').bind(id,payload,now).run();
  const row=await env.ORDERS.prepare('SELECT payload_json,first_attempt,sent_id FROM email_outbox WHERE id=?').bind(id).first();
  if(row.sent_id)return;
  if(now-row.first_attempt>=23*3600)throw Error('Email requires provider reconciliation');
  const saved=JSON.parse(row.payload_json);
  const result=await sendResend(env,saved.to,saved.subject,saved.html,saved.replyTo,id);
  await env.ORDERS.prepare('UPDATE email_outbox SET sent_id=?,sent_at=? WHERE id=?').bind(result.id,now,id).run();
}
