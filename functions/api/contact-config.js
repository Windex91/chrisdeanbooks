import {json} from '../../lib/commerce.js';

const REQUIRED=['RESEND_API_KEY','RESEND_FROM_ADDRESS','TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY'];
export function onRequestGet({env,request}){
  const missing=REQUIRED.filter(key=>typeof env[key]!=='string'||!env[key].trim());
  const enabled=missing.length===0;
  // Only report missing variable NAMES on an explicit diagnostic request.
  // Never return keys, secret values, provider tokens, or sender credentials.
  const diagnostic=new URL(request.url).searchParams.get('diagnostic')==='1';
  return json({enabled,siteKey:enabled?env.TURNSTILE_SITE_KEY:null,...(diagnostic?{missing}:{} )});
}
