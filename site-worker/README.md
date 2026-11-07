# MotorNote private manual website

This Worker serves the extracted factory-manual corpus from the private `motornote-manual-site` R2 bucket. Protect the Worker hostname with a Cloudflare Access self-hosted application; the Worker itself intentionally does not expose a public authentication bypass.

- Site: `https://motornote-manual-library.phillipstg.workers.dev`
- R2 binding: `MANUAL_SITE`
- Deployment configuration: `wrangler.jsonc`

The publishing Worker is separate so GitHub Actions can upload using GitHub OIDC without an Access service token or a long-lived Cloudflare credential. Do not remove the Access policy from the site hostname.
