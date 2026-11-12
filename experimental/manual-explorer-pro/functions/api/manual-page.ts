interface Env { MANUALS: R2Bucket; }

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

function contentType(key: string): string {
  const lower = key.toLowerCase();
  const extension = Object.keys(CONTENT_TYPES).find(ext => lower.endsWith(ext));
  return extension ? CONTENT_TYPES[extension] : "application/octet-stream";
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  const segments = key.split("/");
  const valid =
    key.length > 0 &&
    key.length <= 1200 &&
    !key.startsWith("/") &&
    !key.includes("\\\\") &&
    !/[\\u0000-\\u001f\\u007f]/.test(key) &&
    segments.every(segment => segment.length > 0 && segment !== "." && segment !== "..") &&
    /\\.(html?|md|txt|pdf|png|svg|json)$/i.test(key);

  if (!valid) {
    return Response.json({ error: "Invalid manual file key" }, { status: 400 });
  }

  try {
    const object = await env.MANUALS.get(key);
    if (!object) return Response.json({ error: "Manual file not found", key }, { status: 404 });

    const type = contentType(key);
    const headers = new Headers({
      "Content-Type": type,
      "Cache-Control": key.toLowerCase().endsWith("/tree.json")
        ? "public, max-age=60"
        : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline"
    });

    if (type.startsWith("text/html")) {
      headers.set(
        "Content-Security-Policy",
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline';"
      );
    }

    object.writeHttpMetadata(headers);
    headers.set("Content-Type", type);
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    return Response.json({
      error: "Unable to read manual file",
      detail: error instanceof Error ? error.message : "Unknown error"
    }, { status: 503 });
  }
};
