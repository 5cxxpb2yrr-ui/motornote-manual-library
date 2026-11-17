interface Env { MANUALS: R2Bucket; }
const ROOTS = [
  "manuals/scion-service-manual/2006 Scion xB L4-1.5L (1NZ-FE)/",
  "manuals/subaru-service-manual/2019 Subaru Crosstrek Limited/"
];
const ALLOWED = /\.(html?|json|md|txt|pdf|png|jpe?g|svg)$/i;
const SITE = "https://motornote-manual-library.phillipstg.workers.dev/";
function cleanHtml(html: string, key: string) {
  const base = SITE + key.slice(0,key.lastIndexOf("/") + 1);
  const safe = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
    .replace(/<(iframe|object|embed|form|button)\b[^>]*>[\s\S]*?<\/\1>/gi,"")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,"")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi,"")
    .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi,"");
  const policy = "<meta http-equiv=\\"Content-Security-Policy\\" content=\\"default-src 'none'; img-src https://motornote-manual-library.phillipstg.workers.dev data:; style-src 'unsafe-inline' https://motornote-manual-library.phillipstg.workers.dev; font-src https://motornote-manual-library.phillipstg.workers.dev data:; base-uri https://motornote-manual-library.phillipstg.workers.dev; form-action 'none'; frame-ancestors 'self'\\">";
  const baseTag = "<base href=\\"" + base + "\\">";
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
    headers.set("Content-Security-Policy","default-src 'none'; img-src https://motornote-manual-library.phillipstg.workers.dev data:; style-src 'unsafe-inline' https://motornote-manual-library.phillipstg.workers.dev; font-src https://motornote-manual-library.phillipstg.workers.dev data:; base-uri https://motornote-manual-library.phillipstg.workers.dev; form-action 'none'; frame-ancestors 'self'; sandbox allow-same-origin");
    return new Response(cleanHtml(await object.text(),key),{headers});
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