const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".gif": "image/gif",
  ".htm": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

function contentType(key, stored) {
  if (stored) return stored;
  const dot = key.lastIndexOf(".");
  return dot >= 0 ? MIME_TYPES[key.slice(dot).toLowerCase()] || "application/octet-stream" : "application/octet-stream";
}

function safeObjectKey(pathname) {
  let decoded;
  try {
    decoded = pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
  if (decoded.some((part) => !part || part === "." || part === ".." || part.includes("/") || part.includes("\\") || part.includes("\0"))) return null;
  const key = decoded.join("/");
  if (!key || key.startsWith(".") || key.split("/").some((part) => part.startsWith("."))) return null;
  return key;
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }

    const url = new URL(request.url);
    let key = safeObjectKey(url.pathname);
    if (key === null) return new Response("Bad path", { status: 400 });
    if (url.pathname === "/") key = "index.html";
    else if (url.pathname.endsWith("/")) key += "/index.html";

    const object = await env.MANUAL_SITE.get(key);
    if (!object) {
      return new Response("Manual page not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", contentType(key, object.httpMetadata?.contentType));
    headers.set("etag", object.httpEtag);
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "same-origin");
    headers.set("x-frame-options", "SAMEORIGIN");
    headers.set("cache-control", /\\.html?$/i.test(key) ? "no-cache" : "public, max-age=300");

    return new Response(request.method === "HEAD" ? null : object.body, {
      status: 200,
      headers,
    });
  },
};
