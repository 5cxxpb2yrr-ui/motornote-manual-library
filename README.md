# MotorNote Manual Library

Private, version-controlled source library for MotorNote service-manual retrieval.

## Add a manual

1. Put a ZIP in `incoming/` and upload it using Git LFS. The 277 MB Subaru archive exceeds GitHub's 100 MB ordinary Git-file limit.
2. Name it with its make prefix: `subaru-...` or `scion-...` (for example, `subaru-service-manual.zip`).
3. Push the ZIP to `main`.
4. The **Ingest service manuals** workflow extracts it into `manuals/<archive-name>/`, removes the ZIP from the working tree, and rebuilds the indexes under `index/`.

Extracted PDFs and common image formats are tracked with Git LFS. Git LFS storage and bandwidth quotas apply. Removing a ZIP from the working tree does not erase its previous Git LFS object or Git history.

## Search data

- `index/catalog.json`: manual/file inventory, sizes, and SHA-256 hashes.
- `index/pages.jsonl`: one record per PDF page with extractable text, source path, and page number.
- `index/summary.json`: index totals.

Scanned/image-only pages will not yield searchable text yet; OCR and diagram-aware indexing can be added as a separate stage.

## Private browser library

After ingestion, GitHub Actions publishes the extracted manuals, images, scripts, and search index to a private Cloudflare R2 bucket. A Cloudflare Worker serves the site, protected by Cloudflare Access.

- **Manual website:** https://motornote-manual-library.phillipstg.workers.dev
- **Publisher endpoint:** https://motornote-manual-publisher.phillipstg.workers.dev (GitHub Actions OIDC only)
- **Storage:** private R2 bucket `motornote-manual-site`

The publishing workflow requests a short-lived GitHub OIDC token and the publisher verifies its signature, repository, workflow, branch or release tag, and audience before accepting writes. No long-lived Cloudflare API token is stored in GitHub. The website Worker is protected by a separate Cloudflare Access application restricted to the owner's identity.

A browser-based Nomie plugin must never contain a GitHub token or publisher credential. Private manual retrieval should use an authenticated server-side service.

## Ingestion safeguards

The script rejects path traversal, symlinks and special files, duplicate paths, suspicious compression ratios, oversized members, and archives exceeding its expanded-size limit.
