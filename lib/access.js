/* Email-only, time-limited ebook entitlement links.
   Checkout session IDs alone NEVER authorise access to paid ebooks. */
const encode=new TextEncoder();
const SESSION=/^cs_[A-Za-z0-9_]{8,240}$/;
const TOKEN=/^(cs_[A-Za-z0-9_]{8,240})\.([0-9]{10})\.([a-f0-9]{64})$/;
const DAY=86400;
async function mac(secret,payload){
  if(typeof secret!=='string'||secret.length<32)throw Error('Ebook access signing secret is missing');
  const key=await crypto.subtle.importKey('raw',encode.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encode.encode('chris-dean-books/ebook-access/v1:'+payload)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function constantTimeEqual(a,b){
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
export async function createEbookAccess(env,session){
  if(!SESSION.test(session?.id||''))throw Error('Invalid order ID');
  const created=Number(session.created);
  if(!Number.isInteger(created)||created<1000000000)throw Error('Invalid order timestamp');
  const expiry=created+7*DAY;
  const payload=session.id+'.'+expiry;
  return payload+'.'+await mac(env.DOWNLOAD_TOKEN_SECRET,payload);
}
export async function verifyEbookAccess(env,token){
  if(typeof token!=='string'||token.length>400)return null;
  const m=TOKEN.exec(token);if(!m)return null;
  const expiry=Number(m[2]),now=Math.floor(Date.now()/1000);
  if(expiry<now||expiry>now+7*DAY)return null;
  const wanted=await mac(env.DOWNLOAD_TOKEN_SECRET,m[1]+'.'+m[2]);
  return constantTimeEqual(wanted,m[3])?m[1]:null;
}
