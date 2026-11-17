# LifeOS Manual Explorer Pro

A mobile-first automotive repair knowledge workspace built around the two owned vehicles only:

- **2006 Scion xB** — 1NZ-FE
- **2019 Subaru Crosstrek Limited** — FB20D, AWD, EyeSight

The experimental app lives in this directory and on branch \`feat/lifeos-manual-explorer-pro-mvp\`. It does not modify the production Phoenix manual experience. R2 remains the read-only source for factory manual content.

## Implemented MVP

- React + TypeScript + Vite PWA shell.
- Strict two-vehicle allowlist and regression tests.
- R2 catalog and manual-page APIs for Scion numbered HTML and Subaru JSON section trees.
- Manual viewer with same-reader internal page navigation.
- Search against the live R2 index: 45,768 documents across 92 shards, filtered to the two owned vehicle roots.
- IndexedDB schema for manuals, pages, vehicles, parts, relationships, favorites, bookmarks, notes, recents, settings, searches, viewer/TOC state, carts, pricing cache, GitHub state, and search records.
- Service-worker caching for the app shell, manual API responses, catalog, and search shards.
- Source-linked procedure library for both vehicles, including Subaru EyeSight camera removal, adjustment, shim adjustment, and initialization references.
- Evidence extraction for procedure steps, warnings, torque specifications, tools, consumables, part mentions, and OEM table rows.
- Explicit Subaru trim mismatch warnings; extracted OEM rows remain marked unverified.
- Local favorites and repair list with TXT export.
- Nomie 6 plugin adapter, widget registration, launch event, tracker selection, and repair-note capture.
- GitHub App OAuth with PKCE/state, encrypted HttpOnly sessions, PAT validation, installation discovery/token minting, user-data sync, and HMAC-verified webhook receiver.
- Vendor adapter contract, bounded concurrency, timeout handling, cache, and search-link adapters.

## Deliberate MVP boundaries

- GitHub credentials and vendor keys must be configured as Cloudflare secrets before those integrations can be exercised. No secrets are committed.
- Live vendor price APIs are not connected. Vendor search links are not live prices.
- Manual-listed prices are shown as undated source data, never as current quotes.
- The full search corpus is persisted in IndexedDB after the first online search. Manual HTML pages and their proxied diagrams/styles are cached as the user opens them. The MVP does not automatically download every page in a manual; pages not previously opened still require a connection.
- Procedure references point into the factory corpus. Extracted facts retain source paths; they are not presented as independently validated repair instructions.
- GitHub sync merges by record key with local values taking precedence. A full conflict-resolution UI remains future work.

## Local setup

\`\`\`sh
npm install
npm run dev
npm test
npm run typecheck
npm run build
\`\`\`

Copy \`.dev.vars.example\` to \`.dev.vars\` for local server-side GitHub configuration. Never commit the copied file. Bind the existing \`motornote-manual-site\` R2 bucket as \`MANUALS\`.

## Key source files

- \`src/data/vehicles.ts\`: only the two owned vehicles.
- \`src/data/procedures.ts\`: source-linked procedure references.
- \`src/lib/db.ts\`: IndexedDB schema and persistence.
- \`src/lib/search.ts\`: query parsing, all-term matching, and ranking.
- \`src/lib/procedure-extractor.ts\`: source-backed procedure fact extraction.
- \`src/lib/extraction.ts\` and \`src/lib/oem.ts\`: part and OEM table extraction.
- \`src/lib/cart.ts\`: repair-cart validation.
- \`src/lib/pricing.ts\`: vendor adapter and aggregation primitives.
- \`src/lib/nomie.ts\`: Nomie 6 plugin adapter and export/import/sync.
- \`functions/api/\`: R2, GitHub auth, sync, and webhook endpoints.
- \`docs/\`: setup, deployment, plugin, auth, parts, cart, and pricing guidance.

## Security and data integrity

GitHub App private keys, OAuth client secrets, session encryption secret, installation tokens, PATs, webhook secrets, and vendor API keys remain server-side. The browser receives only connection status. Manual routes are allowlisted to the two owned-vehicle prefixes.

Do not invent OEM numbers, torque values, EyeSight calibration targets, tool requirements, or live prices. Keep evidence, source page, confidence, and verification status with every extracted fact.
