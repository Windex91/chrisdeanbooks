// Canonicalise page navigations without redirecting POST bodies or webhooks.
// Keep the original path and query (including signed download/session links).
export async function onRequest({request,next}){
  const url=new URL(request.url);
  if(url.hostname==='www.chrisdeanbooks.com' && ['GET','HEAD'].includes(request.method) && !url.pathname.startsWith('/api/')){
    url.protocol='https:';url.hostname='chrisdeanbooks.com';url.port='';
    return Response.redirect(url.toString(),301);
  }
  return next();
}
