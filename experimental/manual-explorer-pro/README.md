# LifeOS Manual Explorer Pro

MVP-first automotive service-information workspace for two owned vehicles only:
- 2006 Scion xB — 1NZ-FE
- 2019 Subaru Crosstrek Limited — FB20D, AWD, EyeSight

Develop on \`feat/lifeos-manual-explorer-pro-mvp\`. The production Phoenix manual library is not changed. R2 remains the read-only source of factory content.

## MVP foundation

- React + TypeScript application.
- Exact two-vehicle allowlist and regression test.
- R2 catalog, manual-page, and search-index APIs.
- Reader support for legacy Scion numbered pages and Subaru section-tree navigation.
- IndexedDB stores for manuals, pages, vehicles, parts, relationships, favorites, bookmarks, notes, recents, settings, searches, viewer/TOC state, carts, pricing cache, GitHub state, and search records.
- Page cache, local favorites, offline fallback, basic repair shopping-list export.
- Nomie 6 plugin adapter using the documented iframe plugin SDK shape.
- Jest tests for the vehicle allowlist and search matching.

## Run locally

\`\`\`sh
npm install
npm run dev
npm test
npm run typecheck
npm run build
\`\`\`

Bind the existing R2 bucket as \`MANUALS\` in the preview Pages project. Never attach a writable publishing workflow to the application preview.

## Source layout

- \`src/data/vehicles.ts\`: owned vehicle allowlist.
- \`src/lib/db.ts\`: IndexedDB schema and persistence.
- \`src/lib/search.ts\`: offline-capable query parsing and ranking.
- \`src/lib/cart.ts\`: repair-cart validation primitives.
- \`src/lib/nomie.ts\`: Nomie iframe-plugin adapter.
- \`functions/api/\`: read-only R2 endpoints.

## Security and data integrity

GitHub App private keys, OAuth secrets, installation tokens, PATs, and vendor API keys remain server-side. The browser bundle must never receive them. Manual routes are allowlisted to the two owned-vehicle prefixes. No sample vehicle outside the allowlist is seeded.

OEM part numbers, torque values, EyeSight calibration targets, and vendor prices are not fabricated. They must be linked to a source page or returned by an authorized vendor API, with evidence and verification state retained.

## Nomie compatibility

Nomie 6 plugins are hosted iframe pages communicating through the official \`nomie-plugin.js\` postMessage bridge. This adapter uses documented registration, storage, launch, capture/menu, and widget capabilities. It does not invent separate undocumented Dashboard, Tracker, or Context Menu APIs.

## Roadmap

1. MVP: vehicle/manual browsing, reader, search, local cache, favorites, repair-list export.
2. Knowledge layer: source-backed procedures, part relationships, confidence extraction, Subaru EyeSight references.
3. GitHub: OAuth/App installation flow, repo permission checks, server-side sessions, sync.
4. Pricing: compliant vendor adapters, cached quotes, direct purchase links.
5. Hardening: full offline sync controls, JSON/CSV/Markdown exports, import validation, accessibility, E2E and snapshot tests.
