# Install and run

## Requirements

- Node.js 22 or newer.
- npm.
- Cloudflare Wrangler for local Pages Functions testing.

## Local setup

1. Enter \`experimental/manual-explorer-pro\`.
2. Run \`npm install\`.
3. Copy \`.dev.vars.example\` to \`.dev.vars\` only if testing GitHub routes; fill secrets locally.
4. Bind the R2 bucket \`motornote-manual-site\` as \`MANUALS\` using the included \`wrangler.toml\`.
5. Run \`npm run dev\` for the Vite UI. For end-to-end Pages Functions testing, use \`npx wrangler pages dev dist\` after \`npm run build\`.

## Validation

\`\`\`sh
npm test
npm run typecheck
npm run build
\`\`\`

Manual browsing does not require GitHub authentication. GitHub is optional and only needed for cross-device repository sync.
