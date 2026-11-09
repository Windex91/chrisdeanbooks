import {json,getPaidSession,lineItems,purchasedSkus} from '../../lib/commerce.js';
export async function onRequestGet({request,env}){
  try{const sessionId=new URL(request.url).searchParams.get('session_id');const session=await getPaidSession(env,sessionId);if(!session)return json({paid:false,downloads:[]});const lines=await lineItems(env,session.id);const purchased=purchasedSkus(env,lines);return json({paid:true,hasPhysical:purchased.some(p=>p.physical),downloads:purchased.filter(p=>!p.physical).map(p=>({sku:p.sku,title:p.title,format:p.format}))});}
  catch(e){console.error('Order lookup:',e.message);return json({error:'Order lookup is unavailable. Please use your confirmation email or contact the author.'},502);}
}
