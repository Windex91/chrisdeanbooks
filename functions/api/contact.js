import {json,sendResend,escapeHtml} from '../../lib/commerce.js';

const DESTINATION='chris@chrisdeanbooks.com';

export async function onRequestPost({request,env}){
  try{
    if(!env.TURNSTILE_SECRET_KEY||!env.TURNSTILE_SITE_KEY||!env.RESEND_API_KEY||!env.RESEND_FROM_ADDRESS){
      return json({error:'The contact form is not configured yet. Please email chris@chrisdeanbooks.com directly.'},503);
    }
    const origin=request.headers.get('origin');
    if(origin&&origin!==new URL(request.url).origin)return json({error:'Invalid request origin.'},403);
    if(Number(request.headers.get('content-length')||0)>12000)return json({error:'Message too large.'},413);
    const raw=await request.text();
    if(raw.length>12000)return json({error:'Message too large.'},413);
    const {name,email,message,website,turnstileToken}=JSON.parse(raw);
    if(website)return json({sent:true});
    if(typeof name!=='string'||name.trim().length<2||name.length>120||
       typeof email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>180||
       typeof message!=='string'||message.trim().length<10||message.length>4000||
       typeof turnstileToken!=='string'||turnstileToken.length<10||turnstileToken.length>2048){
      return json({error:'Please check your name, email and message.'},400);
    }
    const verification=new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:turnstileToken});
    const ip=request.headers.get('CF-Connecting-IP');
    if(ip)verification.set('remoteip',ip);
    const checked=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:verification});
    if(!checked.ok)return json({error:'Anti-spam verification is temporarily unavailable.'},502);
    const result=await checked.json();
    if(!result.success||result.hostname!==new URL(request.url).hostname){
      return json({error:'Please complete the anti-spam check.'},400);
    }
    const safeName=name.trim().replace(/[\r\n]+/g,' ').slice(0,120);
    const content='<h2>Christopher Dean Books — website enquiry</h2>'+
      '<p><strong>From:</strong> '+escapeHtml(safeName)+'</p>'+
      '<p><strong>Email:</strong> '+escapeHtml(email)+'</p>'+
      '<p style="white-space:pre-wrap;font:15px/1.6 sans-serif">'+escapeHtml(message.trim())+'</p>';
    await sendResend(env,DESTINATION,'Website enquiry from '+safeName,content,email);
    return json({sent:true});
  }catch(error){
    console.error('Contact delivery:',error.message);
    return json({error:'Message delivery is temporarily unavailable. Please email chris@chrisdeanbooks.com directly.'},502);
  }
}
