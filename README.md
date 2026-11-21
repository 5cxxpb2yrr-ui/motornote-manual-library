# MotorNote Manual Library

Private, version-controlled source library for MotorNote service-manual retrieval.

## Add a manual

1. Put a ZIP in `incoming/` and upload it using Git LFS. The 277 MB Subaru archive exceeds GitHub's 100 MB ordinary Git-file limit.
2. Name it with its make prefix: `subaru-...` or `scion-...` (for example, `subaru-service-manual.zip`).
3. For a complete replacement, keep the existing manual identity in the filename: use `scion-service-manual.zip` to replace the Scion corpus or `subaru-service-manual.zip` to replace Subaru. A differently named archive creates a separate manual instead of replacing the existing one.
4. Push the ZIP to `main`.
5. The **Ingest service manuals** workflow validates and stages the replacement, rebuilds the catalog across **all** manuals (including the unchanged Subaru HTML), and republishes the complete R2 site.

Extracted PDFs and common image formats are tracked with Git LFS. Git LFS storage and bandwidth quotas apply. Removing a ZIP from the working tree does not erase its previous Git LFS object or Git history.

The publisher preserves the manual's HTML, page, image, and navigation paths. Styling is supplied exclusively by `site-worker/assets/phoenix.css` and `phoenix.js`; CSS files, embedded style blocks, and inline styles from uploaded ZIPs are not used in the published site. A flat ZIP with a root `index.html` is placed under the vehicle folder identified by its title (for example, `2006 Scion xB Standard/`).

## Search data

- `index/catalog.json`: manual/file inventory, sizes, and SHA-256 hashes.
- `index/pages.jsonl`: one record per PDF page with extractable text, source path, and page number.
- `index/summary.json`: index totals.

Scanned/image-only pages will not yield searchable text yet; OCR and diagram-aware indexing can be added as a separate stage.

## Private browser library

After ingestion, GitHub Actions builds and validates a staged site, then publishes it to the private Cloudflare R2 bucket with the repository-owned publisher. A Cloudflare Worker serves the site and Cloudflare Access protects the website.

- **Manual website:** https://motornote-manual-library.phillipstg.workers.dev
- **Storage:** private R2 bucket `motornote-manual-site`
- **Publishing:** GitHub Actions → R2 S3 API (not the Workers.dev publisher endpoint)

### One-time publishing credentials

Create an R2 API token with **Object Read & Write** permission, scoped only to `motornote-manual-site`. Add its Access Key ID and Secret Access Key to this repository under **Settings → Secrets and variables → Actions → New repository secret**:

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

The Cloudflare account ID is already configured in the workflow. The secret key is used only by GitHub Actions and is never written into the repository. The publisher does not use bucket-wide `sync --delete`. Small direct commits to manuals, index, or Phoenix assets use the incremental publisher, which uploads only changed objects and deletes only explicitly deleted allowlisted keys. A controlled full rebuild uploads the staged site first, then removes only stale visible objects inside its explicitly managed paths: `manuals/`, `index/`, `index.html`, and the two Phoenix assets. Hidden backups and unrelated R2 objects are protected. The **Publish MotorNote manual site (controlled)** workflow is manual-dispatch only and defaults to dry-run; production publish requires the `main` branch and an exact confirmation phrase. ZIP ingestion also invokes this same safe publisher after its catalog rebuild.
