// Canonicalise page navigations without redirecting POST bodies or webhooks.
// Keep the original path and query (including signed download/session links).
import {protectAdmin} from '../lib/admin-auth.js';
export async function onRequest(context){
  const {request,next}=context;
  const url=new URL(request.url);
  if(/^\/(?:admin|api\/admin)(?:\/|$)/.test(url.pathname))return protectAdmin(context);
  if(url.hostname==='www.chrisdeanbooks.com' && ['GET','HEAD'].includes(request.method) && !url.pathname.startsWith('/api/')){
    url.protocol='https:';url.hostname='chrisdeanbooks.com';url.port='';
    return Response.redirect(url.toString(),301);
  }
  return next();
}
