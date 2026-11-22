// Release dates are Sydney time (AEDT, UTC+11). Never accept dates from clients.
export const DRAGON_PAPERBACK='a-dragons-tale-paperback';
export const DRAGON_EBOOK='a-dragons-tale-ebook';
export const PAPERBACK_RELEASE=Date.parse('2026-12-16T13:00:00Z');
export const EBOOK_RELEASE=Date.parse('2026-12-23T13:01:00Z');
export const EBOOK_RELEASE_LABEL='24 December 2026 at 12:01am (Sydney time)';
export function isPending(sku,now=Date.now()) {return sku===DRAGON_PAPERBACK?now<PAPERBACK_RELEASE:sku===DRAGON_EBOOK?now<EBOOK_RELEASE:false;}
export function mixedPreorder(cart,now=Date.now()) {
 const physical=cart.filter(x=>x.item.physical);
 return physical.some(x=>isPending(x.sku,now))&&physical.some(x=>!isPending(x.sku,now));
}
export function deliveryNote(session,items){
 const date=Number(session.created)*1000;
 if(!items.some(x=>x.sku===DRAGON_PAPERBACK)||!Number.isFinite(date)||date>=PAPERBACK_RELEASE)return '';
 return session.metadata?.shipping_plan==='split'?'Send available physical items first, then A Dragon’s Tale around 17 December 2026. Two dispatches; the agreed 50% shipping supplement is included.':'Ship physical items together when A Dragon’s Tale is ready, around 17 December 2026.';
}
export async function dragonAvailable(env,sku){
 if(![DRAGON_PAPERBACK,DRAGON_EBOOK].includes(sku))return true;
 if(env.DRAGON_PREORDERS_ENABLED!=='true')return false;
 if(sku===DRAGON_EBOOK){
  if(env.DRAGON_EBOOK_ENABLED!=='true')return false;
  if(isPending(sku)){
   try{const row=await env.ORDERS.prepare("SELECT last_seen FROM release_job_health WHERE id=1").first();
    if(!row||Math.floor(Date.now()/1000)-row.last_seen>600)return false;
   }catch{return false;}
  }
 }
 return true;
}
