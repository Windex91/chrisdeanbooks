// Fail closed on every hostname, including direct Pages deployment URLs.
let cachedKeys;
export async function authenticateAdmin(request,env){
  const issuer=env.ADMIN_ACCESS_ISSUER,audience=env.ADMIN_ACCESS_AUD,email=env.ADMIN_EMAIL;
  if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer||'')||!audience||!email)throw Error('unconfigured');
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  if(!token||token.length>16000)throw Error('unauthenticated');
  const parts=token.split('.');if(parts.length!==3)throw Error('unauthenticated');
  const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  const now=Math.floor(Date.now()/1000);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==issuer||!Array.isArray(claims.aud)||!claims.aud.includes(audience)||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+30||(claims.nbf&&claims.nbf>now+30)||typeof claims.email!=='string'||claims.email.toLowerCase()!==email.toLowerCase()||!claims.sub)throw Error('unauthenticated');
  if(!cachedKeys||cachedKeys.issuer!==issuer||cachedKeys.until<Date.now()||!cachedKeys.keys.some(k=>k.kid===header.kid)){
    const response=await fetch(issuer+'/cdn-cgi/access/certs',{redirect:'error'});
    if(!response.ok)throw Error('unauthenticated');
    const body=await response.json();if(!Array.isArray(body.keys))throw Error('unauthenticated');
    cachedKeys={issuer,keys:body.keys,until:Date.now()+300000};
  }
  const jwk=cachedKeys.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw Error('unauthenticated');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error('unauthenticated');
  return claims.email.toLowerCase();
}
export function validateAdminMutation(request,env){
  const origin=new URL(env.SITE_URL||'https://chrisdeanbooks.com').origin;
  if(new URL(request.url).origin!==origin||request.headers.get('Origin')!==origin||request.headers.get('X-Admin-Request')!=='1'||!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||'')||['cross-site','same-site'].includes(request.headers.get('Sec-Fetch-Site')))throw Error('Forbidden request');
}
export async function protectAdmin(context){
  let email;try{email=await authenticateAdmin(context.request,context.env);}catch{return new Response('Administrator authentication required.',{status:403,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});}
  context.data.adminEmail=email;
  const response=await context.next();const headers=new Headers(response.headers);
  headers.set('Cache-Control','private, no-store');headers.set('X-Robots-Tag','noindex, nofollow');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');headers.set('X-Content-Type-Options','nosniff');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  return new Response(response.body,{status:response.status,headers});
}
