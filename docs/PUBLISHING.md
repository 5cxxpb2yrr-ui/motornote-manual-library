# MotorNote manual-site publishing

## Scope

The publisher writes only to the motornote-manual-site R2 bucket and owns exactly these object roots:

- index.html
- manuals/**
- index/**
- assets/phoenix.css and assets/phoenix.js

It does not use bucket-wide aws s3 sync --delete. Uploads complete before stale-object cleanup begins. Cleanup is limited to stale visible keys inside the owned roots. Hidden paths, including .previous-* backups, are never uploaded or deleted. Objects outside the owned roots are never deleted.

## Styling and navigation

The repository's site-worker/assets/phoenix.css and phoenix.js are the only application styling assets. Manual CSS files, style blocks, and inline style attributes from imported archives are excluded from published manual pages. The HTML content and breadcrumb navigation are retained. Source manual directories and ZIP archives are not modified.

## Local validation

Run:

    python -m unittest discover -s tests -p 'test_manual_site_publisher.py' -v
    python scripts/manual_site_publisher.py --mode dry-run

The dry run builds the complete staging site and runs scripts/validate_html_cross_references.py. Duplicate IDs and missing local targets/anchors in imported factory source HTML are reported as warnings so incomplete source archives do not prevent a build. Unsafe paths and HTML parse failures remain blocking errors. The report retains warning counts and source paths for follow-up repair. The ingestion, validation, and controlled-publish workflows upload this report as a downloadable GitHub Actions artifact. It does not read R2 credentials or contact Cloudflare.

## Controlled production publish

The GitHub Actions workflow "Publish MotorNote manual site (controlled)" is manual-dispatch only and defaults to dry-run. It offers three modes:

1. **dry-run** — validates the full staged site without contacting R2.
2. **delta** — requires `base_sha`, the last successfully published commit SHA. It validates the full site, then uploads only changed visible allowlisted objects and deletes only explicitly deleted keys. Changesets over 1,000 paths fail closed.
3. **publish** — rebuilds and uploads the complete site, then removes stale visible keys inside the managed paths.

Both production modes require the selected ref to be `main` and the exact confirmation `PUBLISH_MOTORNOTE_MANUAL_SITE`. After a successful publish, retain that run's commit SHA as the next delta mode's `base_sha`.

Direct commits to manuals/, index/, or Phoenix assets do not automatically publish. Run the controlled workflow manually: dry-run first, then delta for a small change or publish for a complete rebuild. The "Ingest service manuals" workflow invokes the full publisher automatically after successful ZIP ingestion and catalog rebuild.

## Rollback and backups

The publisher never removes local .previous-* directories or source ZIPs. It also protects hidden backup keys already present in R2 from automated cleanup. To roll back a release, restore the prior repository version of the affected files and run the controlled publish again. Do not use a bucket-wide delete or sync operation.

## Worker deployment

This workflow publishes static site objects only. It does not deploy either Cloudflare Worker, change Worker secrets, or modify AI Search. Worker deployments remain a separate, explicit operation.

The old script names remain only as compatibility shims for existing cleanup tests; executing either legacy publisher entry point exits before any R2 operation.

The publisher explicitly allowlists only phoenix.css and phoenix.js under the R2 assets path. Adding another published asset requires a deliberate allowlist and test change.

Warnings remain visible in the JSON validation report with their source file, reference, and target; they are not silently discarded.

Direct commits to manuals/ or index/ do not automatically start a site publish. Use the controlled workflow's dry-run first, then its confirmed publish mode when the intended corpus is on main.
