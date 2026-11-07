const EXPECTED_REPOSITORY = "5cxxpb2yrr-ui/motornote-manual-library";
const MAIN_REF = "refs/heads/main";
const WORKFLOW_PREFIX = "5cxxpb2yrr-ui/motornote-manual-library/.github/workflows/ingest-manuals.yml@";
const EXPECTED_AUDIENCE = "motornote-manual-publisher";
const JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";

let jwksCache = null;
let jwksCacheUntil = 0;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

function safeKey(value) {
  if (typeof value !== "string" || !value || value.length > 1024 || value.startsWith("/") || value.includes("\\") || value.includes("\0")) return false;
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith("."))) return false;
  return value === "index.html" || value.startsWith("manuals/") || value.startsWith("index/");
}

async function getJwks() {
  if (jwksCache && Date.now() < jwksCacheUntil) return jwksCache;
  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error("Could not retrieve GitHub signing keys.");
  const data = await response.json();
  if (!Array.isArray(data.keys)) throw new Error("GitHub signing-key response was invalid.");
  jwksCache = data.keys;
  jwksCacheUntil = Date.now() + 5 * 60 * 1000;
  return jwksCache;
}

async function verifyGitHubOidc(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed GitHub OIDC token.");
  const header = decodeJsonPart(parts[0]);
  const claims = decodeJsonPart(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported GitHub OIDC token.");
  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    claims.iss !== "https://token.actions.githubusercontent.com" ||
    !audience.includes(EXPECTED_AUDIENCE) ||
    !Number.isFinite(claims.exp) || claims.exp <= now ||
    (Number.isFinite(claims.nbf) && claims.nbf > now + 60) ||
    claims.repository !== EXPECTED_REPOSITORY ||
    !(claims.ref === MAIN_REF || (typeof claims.ref === "string" && claims.ref.startsWith("refs/tags/") && claims.ref.length > "refs/tags/".length)) ||
    claims.workflow_ref !== WORKFLOW_PREFIX + claims.ref ||
    claims.sub !== `repo:${EXPECTED_REPOSITORY}:ref:${claims.ref}`
  ) {
    throw new Error("GitHub OIDC claims do not authorize this repository workflow.");
  }

  const jwk = (await getJwks()).find((candidate) => candidate.kid === header.kid);
  if (!jwk) {
    jwksCacheUntil = 0;
    throw new Error("GitHub signing key was not found.");
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new Error("GitHub OIDC signature is invalid.");
  return claims;
}

async function authorize(request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return false;
  try {
    await verifyGitHubOidc(header.slice(7));
    return true;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ service: "motornote-manual-publisher", status: "ok" });
    }

    if (!await authorize(request)) return json({ error: "Unauthorized publisher identity." }, 401);

    if (request.method === "PUT" && url.pathname.startsWith("/_publish/")) {
      let key;
      try {
        key = decodeURIComponent(url.pathname.slice("/_publish/".length));
      } catch {
        return json({ error: "Invalid object key." }, 400);
      }
      if (!safeKey(key)) return json({ error: "Object key is outside the permitted site paths." }, 400);
      const contentType = (request.headers.get("content-type") || "application/octet-stream").slice(0, 200);
      const sha256 = (request.headers.get("x-content-sha256") || "").slice(0, 64);
      try {
        await env.MANUAL_SITE.put(key, request.body, {
          httpMetadata: { contentType },
          customMetadata: sha256 ? { sha256 } : undefined,
        });
        return json({ uploaded: true, key }, 201);
      } catch (error) {
        return json({ error: "R2 upload failed.", detail: String(error?.message || error) }, 502);
      }
    }

    if (request.method === "POST" && url.pathname === "/_publish/manifest") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Expected a JSON manifest." }, 400);
      }
      if (!Array.isArray(body.keys) || body.keys.length > 100000 || !body.keys.every(safeKey)) {
        return json({ error: "Manifest contains invalid or excessive object keys." }, 400);
      }

      const keep = new Set(body.keys);
      let cursor;
      let deleted = 0;
      try {
        do {
          const page = await env.MANUAL_SITE.list({ cursor, limit: 1000 });
          const stale = page.objects
            .map((object) => object.key)
            .filter((key) => key !== "_manifest.json" && !keep.has(key));
          for (let offset = 0; offset < stale.length; offset += 100) {
            const batch = stale.slice(offset, offset + 100);
            if (batch.length) {
              await env.MANUAL_SITE.delete(batch);
              deleted += batch.length;
            }
          }
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);

        await env.MANUAL_SITE.put("_manifest.json", JSON.stringify({
          updated_at: new Date().toISOString(),
          files: body.keys.length,
        }), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
        return json({ published: true, files: body.keys.length, stale_objects_deleted: deleted });
      } catch (error) {
        return json({ error: "Site manifest reconciliation failed.", detail: String(error?.message || error) }, 502);
      }
    }

    return json({ error: "Not found." }, 404);
  },
};
