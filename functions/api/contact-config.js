import {json} from '../../lib/commerce.js';

export function onRequestGet({env}){
  const ready=Boolean(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY&&env.RESEND_API_KEY&&env.RESEND_FROM_ADDRESS);
  return json({enabled:ready,siteKey:ready?env.TURNSTILE_SITE_KEY:null});
}
