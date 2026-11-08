interface Env { MANUALS: R2Bucket; }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  if (!key.startsWith("manuals/") || !key.endsWith(".html") || key.includes("..") || key.length > 700) {
    return Response.json({ error: "Invalid manual page key" }, { status: 400 });
  }
  try {
    const object = await env.MANUALS.get(key);
    if (!object) return Response.json({ error: "Manual page not found" }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src https://motornote-manual-library.phillipstg.workers.dev data:; style-src 'unsafe-inline';"
      }
    });
  } catch (error) {
    return Response.json({ error: "Unable to read manual page", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 503 });
  }
};
