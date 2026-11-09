import {json,sendResend,escapeHtml} from '../../lib/commerce.js';
export async function onRequestPost({request,env}){
 try{
   if(!env.TURNSTILE_SECRET_KEY||!env.RESEND_API_KEY||!env.RESEND_FROM_ADDRESS||!env.SHOP_OWNER_EMAIL)return json({error:'The contact form is not configured yet.'},503);
   if(Number(request.headers.get('content-length')||0)>10000)return json({error:'Message too large'},413);
   const {name,email,message,website,turnstileToken}=await request.json();if(website)return json({sent:true});
   if(typeof name!=='string'||name.trim().length<2||name.length>120||typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>180||typeof message!=='string'||message.trim().length<10||message.length>4000||typeof turnstileToken!=='string')return json({error:'Please check your name, email and message.'},400);
   const form=new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:turnstileToken});const checked=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form});const result=await checked.json();if(!result.success)return json({error:'Please complete the anti-spam check.'},400);
   const content=`<h2>Author site enquiry</h2><p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p><pre style="font:15px/1.5 sans-serif;white-space:pre-wrap">${escapeHtml(message)}</pre>`;
   await sendResend(env,env.SHOP_OWNER_EMAIL,'Website enquiry from '+name.trim(),content);return json({sent:true});
 }catch(e){console.error('Contact:',e.message);return json({error:'Message delivery is temporarily unavailable.'},502);}
}
