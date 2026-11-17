# Architecture

## Runtime

- React + TypeScript PWA hosted by Cloudflare Pages.
- Pages Functions expose read-only R2 manual APIs and server-side GitHub authentication/sync.
- R2 bucket \`motornote-manual-site\` remains the canonical factory manual corpus.
- IndexedDB database \`lifeos_manuals\` stores cached pages, vehicle metadata, favorites, bookmarks, notes, recent pages, carts, pricing cache, and GitHub connection metadata.
- Nomie 6 loads the hosted page in an iframe and communicates through \`nomie-plugin.js\`.

## Source-of-truth boundaries

1. Factory manuals and published search shards: R2.
2. Owned vehicle allowlist: \`src/data/vehicles.ts\` and the matching server allowlist in \`functions/api/catalog.ts\`.
3. User bookmarks, notes, favorites, and repair carts: local IndexedDB first; optional GitHub sync writes a per-user JSON document under \`data/users/{login}/manual-explorer.json\`.
4. Extracted OEM rows: retained with source path, confidence, and an explicit unverified state until checked against an authoritative catalog.
5. Vendor prices: only live API results may be treated as current quotes. Search links are not prices.

## Real manual formats

- Scion xB: root index HTML links into numbered \`pages/*.html\` content.
- Subaru Crosstrek: JSON section-tree files point into numbered \`pages/*.html\` content.
- The catalog allowlist deliberately excludes the separate Scion workflow-test corpus and all other vehicle examples.

## Search

The published R2 manifest currently reports 45,768 documents in 92 shards. The client loads the manifest and shards once, filters records to the two owned-vehicle roots, and applies all-term matching plus \`vehicle:\` and \`section:\` filters. The service worker caches successful manual and search API responses. First full search requires downloading the shards; a future sync screen should make this download explicit and report its storage size.

## GitHub security

- OAuth authorization uses state plus PKCE.
- OAuth and PAT sessions are AES-GCM encrypted in Secure, HttpOnly, SameSite=Lax cookies.
- GitHub App private keys and client secrets are server-side only.
- Installation tokens are minted server-side and are never returned to the browser.
- User data sync is scoped to the authenticated GitHub login and one repository path.
- Webhooks require HMAC-SHA256 verification.

## Known MVP boundaries

- No current live vendor price adapters are wired; vendor search links are not quotes.
- Offline caching covers the application shell, manual API responses, and search shards previously fetched. A complete asset-aware manual download manager is still required for guaranteed offline diagrams/styles.
- Procedure/parts extraction is evidence-backed but not yet a complete curated procedure library.
- GitHub sync currently uses local-wins merge semantics for colliding record keys; a richer conflict UI and per-record timestamps are future hardening.
