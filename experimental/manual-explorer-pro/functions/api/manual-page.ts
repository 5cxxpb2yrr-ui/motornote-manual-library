interface Env { MANUALS: R2Bucket; }

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function contentType(key: string): string | null {
  const lower = key.toLowerCase();
  const extension = Object.keys(CONTENT_TYPES).find(ext => lower.endsWith(ext));
  return extension ? CONTENT_TYPES[extension] : null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  const segments = key.split("/");
  const finalSegment = segments.at(-1) || "";
  const hasSupportedExtension = /\.(html?|md|txt|pdf|png|jpe?g|gif|webp|svg|css|json)$/i.test(key);
  // Some factory indexes reference numbered objects such as ".../1512"
  // without a filename extension. R2 metadata supplies their real MIME type.
  const isExtensionlessFactoryFile =
    !finalSegment.includes(".") &&
    /^[a-z0-9][a-z0-9 _()&-]*$/i.test(finalSegment);
  const valid =
    key.length > 0 &&
    key.length <= 1200 &&
    !key.startsWith("/") &&
    !key.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(key) &&
    segments.every(segment => segment.length > 0 && segment !== "." && segment !== "..") &&
    segments.length >= 4 &&
    segments[0] === "manuals" &&
    /^[a-z0-9][a-z0-9-]*$/i.test(segments[1]) &&
    segments[2].length > 0 &&
    (hasSupportedExtension || isExtensionlessFactoryFile);

  if (!valid) {
    return Response.json({ error: "Invalid manual file key" }, { status: 400 });
  }

  try {
    const object = await env.MANUALS.get(key);
    if (!object) return Response.json({ error: "Manual file not found", key }, { status: 404 });

    const type = contentType(key);
    const headers = new Headers({
      "Cache-Control": key.toLowerCase().endsWith("/tree.json")
        ? "public, max-age=60"
        : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline"
    });
    if (type) headers.set("Content-Type", type);

    // Preserve the R2 object's stored MIME type for extensionless factory files.
    object.writeHttpMetadata(headers);
    if (type) headers.set("Content-Type", type);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/octet-stream");

    if (headers.get("Content-Type")?.toLowerCase().startsWith("text/html")) {
      headers.set(
        "Content-Security-Policy",
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline';"
      );
    }

    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Disposition", "inline");
    return new Response(object.body, { headers });
  } catch (error) {
    return Response.json({
      error: "Unable to read manual file",
      detail: error instanceof Error ? error.message : "Unknown error"
    }, { status: 503 });
  }
};
