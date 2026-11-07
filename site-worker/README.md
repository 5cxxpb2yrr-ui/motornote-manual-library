# MotorNote private manual website

This Worker serves the extracted factory-manual corpus from the private `motornote-manual-site` R2 bucket. Protect the Worker hostname with a Cloudflare Access self-hosted application; the Worker itself intentionally does not expose a public authentication bypass.

- Site: `https://motornote-manual-library.phillipstg.workers.dev`
- R2 binding: `MANUAL_SITE`
- Deployment configuration: `wrangler.jsonc`

The publishing Worker is separate so GitHub Actions can upload using GitHub OIDC without an Access service token or a long-lived Cloudflare credential. Do not remove the Access policy from the site hostname.


## Phoenix mobile interface

The publishing script copies `site-worker/assets/phoenix.css` and `phoenix.js` into the R2 site and decorates every manual HTML page in the staging copy. The source manuals in Git remain unchanged. The landing page and manual pages share the same Phoenix theme, floating search control, central search panel, and bottom navigation.

The layout is mobile-first and tuned for iPhone-sized touch screens. Search results link directly to the indexed source page. Search requests go to this site Worker, which proxies them server-to-server to the retrieval Worker; the browser never receives the retrieval API token.

### Search proxy configuration

The site Worker expects:

- `MOTORNOTE_API_URL`: configured in `wrangler.jsonc`.
- `MOTORNOTE_API_TOKEN`: a Worker secret containing the same bearer token configured on `motornote-manual-retrieval`.

Set the secret once with Wrangler (use the exact same value as the retrieval Worker secret):

```sh
npx wrangler secret put MOTORNOTE_API_TOKEN --config site-worker/wrangler.jsonc
npx wrangler deploy --config site-worker/wrangler.jsonc
```

Keep Cloudflare Access enabled on the site hostname. The proxy is not intended to be a public search API.
