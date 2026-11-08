interface Env {
  MANUALS: R2Bucket;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const requested = url.searchParams.get("file") || "manifest.json";

  // Only expose the versioned search index, never arbitrary R2 keys.
  if (
    requested !== "manifest.json" &&
    !/^shard-\d{4}\.json$/.test(requested)
  ) {
    return new Response("Not found", { status: 404 });
  }

  const key = `search-index/v1/${requested}`;
  const object = await env.MANUALS.get(key);
  if (!object) return new Response("Search index not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": requested === "manifest.json"
      ? "public, max-age=60"
      : "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "same-origin"
  });
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(object.body, { headers });
};
