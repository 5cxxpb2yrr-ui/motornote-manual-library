const MIME_TYPES = {
  ".css":"text/css; charset=utf-8",".csv":"text/csv; charset=utf-8",".gif":"image/gif",".htm":"text/html; charset=utf-8",".html":"text/html; charset=utf-8",".ico":"image/x-icon",".jpeg":"image/jpeg",".jpg":"image/jpeg",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".jsonl":"application/x-ndjson; charset=utf-8",".md":"text/markdown; charset=utf-8",".pdf":"application/pdf",".png":"image/png",".svg":"image/svg+xml",".tif":"image/tiff",".tiff":"image/tiff",".txt":"text/plain; charset=utf-8",".webp":"image/webp",".xml":"application/xml; charset=utf-8",
};
function contentType(key,stored){if(stored)return stored;const dot=key.lastIndexOf(".");return dot>=0?MIME_TYPES[key.slice(dot).toLowerCase()]||"application/octet-stream":"application/octet-stream"}
function safeObjectKey(pathname){let decoded;try{decoded=pathname.split("/").filter(Boolean).map(part=>decodeURIComponent(part))}catch{return null}if(decoded.some(part=>!part||part==="."||part===".."||part.includes("/")||part.includes("\\")||part.includes("\0")))return null;const key=decoded.join("/");if(!key||key.startsWith(".")||key.split("/").some(part=>part.startsWith(".")))return null;return key}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==="/api/search"){
   if(request.method!=="POST")return json({error:"Method not allowed"},405);
   if(!env.MOTORNOTE_API_TOKEN||!env.MOTORNOTE_API_URL)return json({error:"Search service is not configured yet."},503);
   let body;try{body=await request.json()}catch{return json({error:"Expected a JSON search request."},400)}
   const query=typeof body.query==="string"?body.query.trim():"";
   if(!query||query.length>4000)return json({error:"Enter a search term (up to 4,000 characters)."},400);
   try{
    const upstream=await fetch(new URL("/v1/search",env.MOTORNOTE_API_URL),{method:"POST",headers:{"authorization":`Bearer ${env.MOTORNOTE_API_TOKEN}`,"content-type":"application/json"},body:JSON.stringify({query,topK:Math.max(1,Math.min(20,Number.parseInt(body.topK,10)||12))})});
    const payload=await upstream.json();
    return json(payload,upstream.status);
   }catch(error){console.error("Manual search upstream request failed:",String(error?.stack||error?.message||error));return json({error:"The manual search service could not be reached."},502)}
  }
  if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405,headers:{allow:"GET, HEAD"}});
  let key;if(url.pathname==="/")key="index.html";else{key=safeObjectKey(url.pathname);if(key===null)return new Response("Bad path",{status:400});if(url.pathname.endsWith("/"))key+="/index.html"}
  const object=await env.MANUAL_SITE.get(key);
  if(!object)return new Response("Manual page not found",{status:404,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}});
  const headers=new Headers();object.writeHttpMetadata(headers);headers.set("content-type",contentType(key,object.httpMetadata?.contentType));headers.set("etag",object.httpEtag);headers.set("x-content-type-options","nosniff");headers.set("referrer-policy","same-origin");headers.set("x-frame-options","SAMEORIGIN");headers.set("cache-control",/\.html?$/i.test(key)?"no-cache":"public, max-age=300");
  return new Response(request.method==="HEAD"?null:object.body,{status:200,headers});
 }
};
