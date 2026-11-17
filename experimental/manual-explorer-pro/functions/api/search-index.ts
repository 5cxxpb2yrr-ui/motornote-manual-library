interface Env { MANUALS: R2Bucket; }
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const requested = new URL(request.url).searchParams.get("file") || "manifest.json";
  if (requested!=="manifest.json" && !/^shard-\d{4}\.json$/.test(requested)) return new Response("Not found",{status:404});
  const object = await env.MANUALS.get("search-index/v1/"+requested);
  if (!object) return Response.json({error:"Search index is not published"},{status:404});
  const headers = new Headers({
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":requested==="manifest.json"?"public, max-age=60":"public, max-age=300",
    "X-Content-Type-Options":"nosniff"
  });
  object.writeHttpMetadata(headers); headers.set("Content-Type","application/json; charset=utf-8");
  return new Response(object.body,{headers});
};