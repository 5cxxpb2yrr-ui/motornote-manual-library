interface Env { MANUALS: R2Bucket; }
const ROOTS = [
  "manuals/scion-service-manual/2006 Scion xB L4-1.5L (1NZ-FE)/",
  "manuals/subaru-service-manual/2019 Subaru Crosstrek Limited/"
];
const ALLOWED = /\.(html?|css|json|md|txt|pdf|png|jpe?g|svg)$/i;
const SITE = "https://motornote-manual-library.phillipstg.workers.dev/";
function proxiedAssetUrl(source:string,key:string):string|null {
  if(!source || source.startsWith("#") || /^(data:|javascript:|mailto:|tel:)/i.test(source))return null;
  try {
    const target=new URL(source,SITE+key);
    const site=new URL(SITE);
    if(target.origin!==site.origin)return null;
    const targetKey=decodeURIComponent(target.pathname.replace(/^\/+/,""));
    if(!ROOTS.some(root=>targetKey.startsWith(root)) || !ALLOWED.test(targetKey))return null;
    return "/api/manual-page?key="+encodeURIComponent(targetKey);
  } catch { return null; }
}
function rewriteInternalLinks(html:string,key:string) {
  return html.replace(/<a\b([^>]*?)href=(["'])(.*?)\2([^>]*)>/gi,(match,before,quote,href,after)=>{
    const proxied=proxiedAssetUrl(href,key);
    if(!proxied || !/\.(html?|pdf)$/i.test(new URL(href,SITE+key).pathname))return match;
    return `<a${before}href="${proxied}"${after}>`;
  });
}
function rewriteHtmlAssets(html:string,key:string) {
  let output=html.replace(/<(img|source)\b([^>]*?)src=(["'])(.*?)\3([^>]*)>/gi,(match,tag,before,quote,src,after)=>{
    const proxied=proxiedAssetUrl(src,key);
    return proxied?`<${tag}${before}src="${proxied}"${after}>`:match;
  });
  output=output.replace(/<link\b([^>]*?)href=(["'])(.*?)\2([^>]*)>/gi,(match,before,quote,href,after)=>{
    if(!/\.css(?:$|[?#])/i.test(href))return match;
    const proxied=proxiedAssetUrl(href,key);
    return proxied?`<link${before}href="${proxied}"${after}>`:match;
  });
  return output.replace(/url\((["']?)([^)"']+)\1\)/gi,(match,quote,source)=>{
    const proxied=proxiedAssetUrl(source.trim(),key);
    return proxied?`url("${proxied}")`:match;
  });
}
function rewriteCssUrls(css:string,key:string) {
  return css.replace(/url\((["']?)([^)"']+)\1\)/gi,(match,quote,source)=>{
    const proxied=proxiedAssetUrl(source.trim(),key);
    return proxied?`url("${proxied}")`:match;
  });
}
function cleanHtml(html: string, key: string) {
  const base = SITE + key.slice(0,key.lastIndexOf("/") + 1);
  let safe = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
    .replace(/<(iframe|object|embed|form|button)\b[^>]*>[\s\S]*?<\/\1>/gi,"")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,"")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi,"")
    .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi,"");
  safe=rewriteInternalLinks(safe,key);
  safe=rewriteHtmlAssets(safe,key);
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; base-uri 'self' https://motornote-manual-library.phillipstg.workers.dev; form-action 'none'; frame-ancestors 'self'">`;
  const baseTag = `<base href="${base}">`;
  return /<head[^>]*>/i.test(safe) ? safe.replace(/<head[^>]*>/i,match=>match+baseTag+policy) : "<!doctype html><head>"+baseTag+policy+"</head>"+safe;
}
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!ROOTS.some(root=>key.startsWith(root)) || key.includes("..") || !ALLOWED.test(key)) return new Response("Not found",{status:404});
  const object = await env.MANUALS.get(key);
  if (!object) return new Response("Not found",{status:404});
  const ext = key.split(".").pop()?.toLowerCase();
  const headers = new Headers({ "X-Content-Type-Options":"nosniff", "Cache-Control":"public, max-age=300" });
  if (ext==="html" || ext==="htm") {
    headers.set("Content-Type","text/html; charset=utf-8");
    headers.set("Content-Security-Policy","default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; base-uri 'self' https://motornote-manual-library.phillipstg.workers.dev; form-action 'none'; frame-ancestors 'self' https://open-nomie.github.io https://6.nomie.app https://n6.nomie.app https://n6-dev.nomie.app; sandbox allow-same-origin");
    return new Response(cleanHtml(await object.text(),key),{headers});
  }
  if(ext==="css") {
    headers.set("Content-Type","text/css; charset=utf-8");
    return new Response(rewriteCssUrls(await object.text(),key),{headers});
  }
  if (ext==="json") headers.set("Content-Type","application/json; charset=utf-8");
  else if (ext==="pdf") headers.set("Content-Type","application/pdf");
  else if (ext==="png") headers.set("Content-Type","image/png");
  else if (ext==="jpg" || ext==="jpeg") headers.set("Content-Type","image/jpeg");
  else if (ext==="svg") {
    headers.set("Content-Type","image/svg+xml");
    headers.set("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; sandbox");
  } else headers.set("Content-Type","text/plain; charset=utf-8");
  return new Response(object.body,{headers});
};