const INSTANCE_ID = "motornote-manuals";
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["html", "htm", "txt", "md", "pdf", "png", "jpg", "jpeg", "webp", "svg"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) mismatch |= (left[i] || 0) ^ (right[i] || 0);
  return mismatch === 0;
}

function authenticated(request, env) {
  const supplied = request.headers.get("authorization") || "";
  return safeEqual(supplied, `Bearer ${env.MOTORNOTE_API_TOKEN || ""}`);
}

function cleanHeader(value, max = 500) {
  return (value || "").replace(/[\r\n\0]/g, "").trim().slice(0, max);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ service: "motornote-manual-retrieval", status: "ok" });
    }

    if (!env.MOTORNOTE_API_TOKEN) return json({ error: "Service authentication is not configured." }, 503);
    if (!authenticated(request, env)) return json({ error: "Unauthorized" }, 401);

    const instance = env.AI_SEARCH.get(INSTANCE_ID);

    if (request.method === "POST" && url.pathname === "/v1/search") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Expected a JSON body." }, 400); }
      const query = typeof body.query === "string" ? body.query.trim() : "";
      if (!query || query.length > 4000) return json({ error: "query is required (max 4000 characters)." }, 400);
      const topK = Math.max(1, Math.min(20, Number.parseInt(body.topK, 10) || 8));
      try {
        const result = await instance.search({
          messages: [{ role: "user", content: query }],
          ai_search_options: { retrieval: { max_num_results: topK, retrieval_type: "hybrid" } },
        });
        return json({
          query,
          instance: INSTANCE_ID,
          chunks: result.chunks || [],
          errors: result.errors || [],
        });
      } catch (error) {
        return json({ error: "Search failed.", detail: String(error?.message || error) }, 502);
      }
    }

    if ((request.method === "PUT" || request.method === "POST") && url.pathname === "/v1/documents") {
      const sourcePath = cleanHeader(request.headers.get("x-source-path"), 1000);
      const key = cleanHeader(request.headers.get("x-document-key"), 128);
      const make = cleanHeader(request.headers.get("x-make"), 40);
      const model = cleanHeader(request.headers.get("x-model"), 120);
      const documentType = cleanHeader(request.headers.get("x-document-type"), 40);
      const extension = (key.split(".").pop() || "").toLowerCase();
      if (!sourcePath || !key || !ALLOWED_EXTENSIONS.has(extension)) {
        return json({ error: "Valid x-source-path and x-document-key headers are required; unsupported file type." }, 400);
      }
      const declaredLength = Number(request.headers.get("content-length") || 0);
      if (declaredLength > MAX_DOCUMENT_BYTES) return json({ error: "Document exceeds 20 MiB limit." }, 413);
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_DOCUMENT_BYTES) {
        return json({ error: "Document is empty or exceeds 20 MiB limit." }, 413);
      }
      const contentType = cleanHeader(request.headers.get("content-type"), 120) || "application/octet-stream";
      const metadata = { source_path: sourcePath, make, model, document_type: documentType };
      try {
        const blob = new Blob([bytes], { type: contentType });
        const item = await instance.items.upload(key, blob, { metadata });
        return json({ accepted: true, key, source_path: sourcePath, status: item?.status || "queued" }, 202);
      } catch (error) {
        return json({ error: "Document indexing request failed.", detail: String(error?.message || error) }, 502);
      }
    }

    if (request.method === "GET" && url.pathname === "/v1/status") {
      try {
        const info = await instance.info();
        return json({ instance: INSTANCE_ID, status: info.status, type: info.type, source: info.source });
      } catch (error) {
        return json({ error: "Could not read search index status.", detail: String(error?.message || error) }, 502);
      }
    }

    return json({ error: "Not found" }, 404);
  },
};
