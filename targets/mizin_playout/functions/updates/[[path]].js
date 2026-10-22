// Serves Mizin Playout update metadata and release files from the playoutmizin-updates R2 bucket
// at https://playoutmizin.pages.dev/updates/... (Pages static files are limited to 25 MiB).
// Read-only: only known key shapes are served; nothing is listed or written here.
const ALLOWED=/^(preview\/latest\.json|releases\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+|history\/[A-Za-z0-9._-]+\.json|sources\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)$/;
export async function onRequest({request,env,params}){
  if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405,headers:{Allow:"GET, HEAD"}});
  const parts=Array.isArray(params.path)?params.path:[params.path];const key=parts.join("/");
  if(!ALLOWED.test(key)||parts.some(p=>p==="."||p===".."))return new Response("Not found",{status:404});
  const object=request.method==="HEAD"?await env.UPDATES.head(key):await env.UPDATES.get(key,{range:request.headers,onlyIf:request.headers});
  if(!object)return new Response("Not found",{status:404});
  const headers=new Headers();object.writeHttpMetadata(headers);headers.set("etag",object.httpEtag);headers.set("x-content-type-options","nosniff");headers.set("accept-ranges","bytes");
  if(!headers.has("cache-control"))headers.set("cache-control",key==="preview/latest.json"?"no-store":"public, max-age=31536000, immutable");
  if(key.endsWith(".exe")||key.endsWith(".zip"))headers.set("content-disposition",'attachment; filename="'+parts[parts.length-1]+'"');
  if(request.method==="HEAD"){headers.set("content-length",String(object.size));return new Response(null,{headers});}
  if(!("body" in object))return new Response(null,{status:304,headers});
  if(object.range&&request.headers.has("range")){const offset=object.range.offset??0;const length=object.range.length??(object.size-offset);
    headers.set("content-range","bytes "+offset+"-"+(offset+length-1)+"/"+object.size);headers.set("content-length",String(length));return new Response(object.body,{status:206,headers});}
  headers.set("content-length",String(object.size));return new Response(object.body,{headers});
}
