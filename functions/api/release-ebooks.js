import {json} from '../../lib/commerce.js';
import {processReleases} from '../../lib/ebook-release.js';
export async function onRequestPost({request,env}){
 const expected=env.EBOOK_RELEASE_JOB_SECRET,provided=request.headers.get('Authorization')||'';
 if(typeof expected!=='string'||expected.length<32)return json({error:'Unavailable'},503);
 const enc=new TextEncoder(),digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)));
 const a=await digest('Bearer '+expected),b=await digest(provided);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 if(diff)return json({error:'Unauthorised'},401);
 try{return json(await processReleases(env));}catch{return json({error:'Release job failed'},503);}
}
