# MotorNote manual publisher

This Worker accepts site files into the `motornote-manual-site` R2 bucket. It accepts writes only when the bearer token is a valid GitHub Actions OIDC token for:

- Repository: `5cxxpb2yrr-ui/motornote-manual-library`
- Branch: `main`
- Workflow: `.github/workflows/ingest-manuals.yml`
- Audience: `motornote-manual-publisher`

The publisher is intentionally separate from the reader Worker. Do not put this hostname behind an interactive Access login; GitHub Actions authenticates using short-lived OIDC tokens whose signature and claims are verified by the Worker.

Routes:
- `GET /health`
- `PUT /_publish/<key>` — upload `index.html`, `manuals/**`, or `index/**`
- `POST /_publish/manifest` — reconcile the bucket against the complete key manifest and delete stale objects

No GitHub or Cloudflare long-lived secret is required by the publishing workflow.
