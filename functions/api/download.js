import {ITEMS,getPaidSession,lineItems,priceId,ebookKey} from '../../lib/commerce.js';
import {verifyEbookAccess} from '../../lib/access.js';
export async function onRequestGet({request,env}){
  try{
    const url=new URL(request.url),sku=url.searchParams.get('sku'),token=url.searchParams.get('access');
    const item=ITEMS[sku];if(!item||item.physical)return new Response('Invalid download',{status:404});
    const sessionId=await verifyEbookAccess(env,token);
    if(!sessionId)return new Response('Download link is missing, invalid or expired. Please contact the author.',{status:403});
    const session=await getPaidSession(env,sessionId);
    if(!session)return new Response('Payment has not been verified',{status:403});
    const lines=await lineItems(env,session.id);
    if(!priceId(env,sku)||!lines.some(line=>line.price?.id===priceId(env,sku)&&line.quantity>0))
      return new Response('This book was not purchased',{status:403});
    if(!env.EBOOKS)return new Response('Digital files are temporarily unavailable',{status:503});
    const file=await env.EBOOKS.get(ebookKey(env,sku));
    if(!file)return new Response('Digital file unavailable; contact the author',{status:503});
    return new Response(file.body,{headers:{
      'Content-Type':'application/epub+zip','Content-Disposition':`attachment; filename="${item.downloadName}"`,
      'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer',
      'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"
    }});
  }catch(e){console.error('Download:',e.name);return new Response('Unable to verify your download right now',{status:502});}
}
