import {getPaidSession,lineItems,purchasedSkus,ebookKey,siteUrl} from './commerce.js';
import {paymentClear,deliverOrderEmail} from './fulfilment.js';
import {createEbookAccess} from './access.js';
import {ebookReleaseEmail} from './order-emails.js';
import {DRAGON_EBOOK,EBOOK_RELEASE} from './preorders.js';
export async function processReleases(env){
 const now=Math.floor(Date.now()/1000);
 await env.ORDERS.prepare('INSERT INTO release_job_health (id,last_seen) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen').bind(now).run();
 const rows=(await env.ORDERS.prepare("SELECT session_id,sku FROM ebook_release_queue WHERE status='pending' AND release_at<=? AND (last_attempt IS NULL OR last_attempt<=?) ORDER BY release_at,session_id LIMIT 20").bind(now,now-60).all()).results||[];
 let sent=0,failed=0,cancelled=0;
 for(const row of rows){
  try{
   if(row.sku!==DRAGON_EBOOK||Date.now()<EBOOK_RELEASE)continue;
   // Claim a short lease. Resend's persisted outbox additionally deduplicates retries.
   const claim=await env.ORDERS.prepare("UPDATE ebook_release_queue SET last_attempt=?,attempts=attempts+1 WHERE session_id=? AND sku=? AND status='pending' AND (last_attempt IS NULL OR last_attempt<=?)").bind(now,row.session_id,row.sku,now-60).run();
   if(claim.meta.changes!==1)continue;
   const session=await getPaidSession(env,row.session_id);
   if(!session||!await paymentClear(env,session)){
    await env.ORDERS.prepare("UPDATE ebook_release_queue SET status='cancelled',last_error='payment_not_clear' WHERE session_id=? AND sku=?").bind(row.session_id,row.sku).run();cancelled++;continue;
   }
   const items=purchasedSkus(env,await lineItems(env,session.id)).filter(x=>x.sku===row.sku);
   if(items.length!==1||!await env.EBOOKS.head(ebookKey(env,row.sku)))throw Error('release_file_or_entitlement_missing');
   const email=session.customer_details?.email||session.customer_email;if(!email)throw Error('release_email_missing');
   // A new seven-day entitlement starts at delivery, not the preorder date.
   const access=await createEbookAccess(env,{id:session.id,created:now});
   const html=ebookReleaseEmail(session,siteUrl(env)+'/success/?access='+encodeURIComponent(access));
   await deliverOrderEmail(env,session.id+'/ebook-release/dragon/v1',email,(session.livemode?'':'[SANDBOX] ')+'Your A Dragon’s Tale ebook is ready',html);
   await env.ORDERS.prepare("UPDATE ebook_release_queue SET status='sent',sent_at=?,last_error=NULL WHERE session_id=? AND sku=?").bind(now,session.id,row.sku).run();sent++;
  }catch{failed++;await env.ORDERS.prepare("UPDATE ebook_release_queue SET last_error='delivery_requires_retry_or_reconciliation' WHERE session_id=? AND sku=?").bind(row.session_id,row.sku).run();}
 }
 return {sent,failed,cancelled};
}
