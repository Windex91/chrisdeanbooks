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
    const requestHost=new URL(request.url).hostname;
    const preview=requestHost.endsWith('.pages.dev');
    // Turnstile's Siteverify API accepts JSON. Never trust the browser's green
    // checkmark without successfully validating its single-use token here.
    const verification={secret:env.TURNSTILE_SECRET_KEY,response:turnstileToken};
    const ip=request.headers.get('CF-Connecting-IP');
    if(ip)verification.remoteip=ip;
    let checked,result;
    try{
      checked=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(verification)
      });
      result=await checked.json();
    }catch(error){
      console.error('Turnstile Siteverify request failed:',error.name);
      return json({error:'Security verification service could not be reached. Please email chris@chrisdeanbooks.com directly.',
        ...(preview?{diagnostic:'turnstile-connection'}:{})},502);
    }
    // Return only a vendor error CODE on preview sites for troubleshooting;
    // never expose submitted tokens, private keys, raw responses, or IPs.
    const codes=Array.isArray(result?.['error-codes'])?result['error-codes']:[];
    const firstCode=typeof codes[0]==='string'&&/^[a-z0-9-]{1,64}$/.test(codes[0])?codes[0]:'unknown';
    if(!checked.ok){
      console.error('Turnstile Siteverify HTTP failure:',checked.status,firstCode);
      return json({error:'Security verification was rejected by Cloudflare. Please email chris@chrisdeanbooks.com directly.',
        ...(preview?{diagnostic:'turnstile-http-'+checked.status+'-'+firstCode}:{})},502);
    }
    if(result?.success!==true){
      console.warn('Turnstile Siteverify token rejected:',firstCode);
      return json({error:'Anti-spam verification failed. Refresh the page and try again.',
        ...(preview?{diagnostic:'turnstile-'+firstCode}:{})},400);
    }
    if(result.hostname!==requestHost){
      console.warn('Turnstile Siteverify hostname mismatch');
      return json({error:'Anti-spam verification could not confirm the website.',
        ...(preview?{diagnostic:'turnstile-hostname-mismatch'}:{})},400);
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
    return json({error:'Message delivery is temporarily unavailable. Please email chris@chrisdeanbooks.com directly.',
      ...(new URL(request.url).hostname.endsWith('.pages.dev')?{diagnostic:'contact-delivery'}:{})},502);
  }
}
