// Pages _headers does not apply to Functions responses.
export async function onRequest({next}){
 const response=await next();
 const headers=new Headers(response.headers);
 headers.set('Cache-Control','private, no-store');
 headers.set('Referrer-Policy','no-referrer');
 headers.set('X-Content-Type-Options','nosniff');
 headers.set('X-Robots-Tag','noindex, nofollow');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
