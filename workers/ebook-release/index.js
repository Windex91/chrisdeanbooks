// Deploy separately from Pages. Secrets stay in Cloudflare, never in this file.
export default {
 async scheduled(controller,env,ctx){
  const url=new URL('/api/release-ebooks',env.SITE_URL);
  if(url.protocol!=='https:')throw Error('HTTPS required');
  const response=await fetch(url,{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+env.EBOOK_RELEASE_JOB_SECRET}});
  if(!response.ok)throw Error('Release endpoint unavailable');
  const result=await response.json();if(result.failed)throw Error('Ebook delivery requires attention');
 }
};
