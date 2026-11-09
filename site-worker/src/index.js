const MIME_TYPES = {
  ".avif": "image/avif",
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
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

function contentType(key, stored) {
  const dot = key.lastIndexOf(".");
  const extensionType = dot >= 0 ? MIME_TYPES[key.slice(dot).toLowerCase()] : null;
  // The key is authoritative for the published site. In particular, always
  // serve HTML as HTML even if an upload tool supplied a generic MIME type.
  return extensionType || stored || "application/octet-stream";
}

function safeObjectKey(pathname) {
  let parts;
  try {
    parts = pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
  if (parts.some((part) => !part || part === "." || part === ".." || /[\\/\0]/.test(part) || part.includes(":"))) {
    return null;
  }
  return parts.join("/");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function errorResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/search") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.MOTORNOTE_API_TOKEN || !env.MOTORNOTE_API_URL) {
        return json({ error: "Search service is not configured yet." }, 503);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Expected a JSON search request." }, 400);
      }
      const query = typeof body.query === "string" ? body.query.trim() : "";
      if (!query || query.length > 4000) {
        return json({ error: "Enter a search term (up to 4,000 characters)." }, 400);
      }

      try {
        const upstream = await fetch(new URL("/v1/search", env.MOTORNOTE_API_URL), {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.MOTORNOTE_API_TOKEN}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ query, topK: body.topK }),
        });
        const payload = await upstream.json();
        return json(payload, upstream.status);
      } catch (error) {
        console.error("Manual search upstream request failed:", String(error?.stack || error?.message || error));
        return json({ error: "The manual search service could not be reached." }, 502);
      }
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: "GET, HEAD", "cache-control": "private, no-store" },
      });
    }

    let key;
    if (url.pathname === "/") {
      key = "index.html";
    } else {
      key = safeObjectKey(url.pathname);
      if (key === null) return errorResponse("Bad path", 400);
      if (url.pathname.endsWith("/")) key += "/index.html";
    }

    // All pages and their relative assets are served through this same-origin
    // Worker route. Cloudflare Access protects the request before it reaches
    // R2; do not add CORS headers or redirect clients to the private bucket.
    const object = await env.MANUAL_SITE.get(key);
    if (!object) return errorResponse("Manual resource not found", 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", contentType(key, object.httpMetadata?.contentType));
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    // Published resources are meant to render in the browser, not download
    // because of stale or incorrect object metadata.
    headers.delete("content-disposition");

    return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
  },
};
