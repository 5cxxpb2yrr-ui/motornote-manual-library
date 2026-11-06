# MotorNote authenticated manual retrieval

Cloudflare Worker API for MotorNote to search the private service-manual corpus. It uses the managed Cloudflare AI Search instance `motornote-manuals` in the `default` namespace.

## API

All API routes except `GET /health` require:

```http
Authorization: Bearer <MOTORNOTE_API_TOKEN>
```

- `GET /health` — liveness only; no corpus data.
- `GET /v1/status` — authenticated index status.
- `POST /v1/search` — JSON body `{"query":"...","topK":8}`; returns ranked chunks and source metadata.
- `PUT /v1/documents` — authenticated document ingestion. Send raw file bytes and headers:
  - `x-document-key`: stable unique key ending in a supported extension (max 128 chars)
  - `x-source-path`: original relative path inside the manual
  - `x-make`, `x-model`, `x-document-type`: optional metadata
  - `content-type`: actual file MIME type

The ingestion route accepts HTML, text, Markdown, and OCR-enabled PDF files up to 10 MiB; common image files are limited to 4 MiB. Uploads are queued for indexing; a 202 response means accepted, not yet searchable. AI Search currently allows 100,000 files per instance on the Workers Free plan. Monthly included usage is 5 million ingestion tokens, 10 GB-month storage, 1,000 semantic queries, and 1,000 full-text queries; usage beyond those amounts is billed. Current pricing and limits: https://developers.cloudflare.com/ai-search/platform/limits-pricing/.

## Deployment

1. Install/configure Wrangler and deploy this directory.
2. Set the Worker secret `MOTORNOTE_API_TOKEN` to a high-entropy value.
3. Add the same value as a GitHub Actions secret named `MOTORNOTE_API_TOKEN` in this private repository.
4. Run the manual-library sync workflow to upload HTML/text pages and supported diagrams.
5. Configure MotorNote's server-side integration to call `POST /v1/search`. Never put the token in browser code or a public plugin bundle.

## Security

The corpus stays in managed AI Search storage; it is not served as a public static website. Do not add a public endpoint to the AI Search instance. The API token must remain server-side. Rotate it if it is exposed.
