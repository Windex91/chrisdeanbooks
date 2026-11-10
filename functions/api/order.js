import {paymentClear} from '../../lib/fulfilment.js';
import {json,getPaidSession,lineItems,purchasedSkus} from '../../lib/commerce.js';
import {verifyEbookAccess} from '../../lib/access.js';
export async function onRequestGet({request,env}){
  try{
    const url=new URL(request.url),access=url.searchParams.get('access');
    if(access&&!await verifyEbookAccess(env,access))return json({error:'Your download link is invalid or expired. Please contact chris@chrisdeanbooks.com.'},403);
    const id=access?await verifyEbookAccess(env,access):url.searchParams.get('session_id');
    const session=await getPaidSession(env,id);
    if(!session||!await paymentClear(env,session))return json({paid:false,downloads:[]});
    if(!access)return json({paid:true,downloads:[],hasPhysical:false,requiresEmailLink:true});
    const lines=await lineItems(env,session.id),items=purchasedSkus(env,lines);
    return json({paid:true,hasPhysical:items.some(p=>p.physical),downloads:items.filter(p=>!p.physical&&p.sku!=='the-glass-tapestry-ebook').map(p=>({sku:p.sku,title:p.title,format:p.format}))});
  }catch(e){console.error('Order lookup:',e.name);return json({error:'Order lookup is unavailable. Please contact the author if you need help.'},502);}
}
