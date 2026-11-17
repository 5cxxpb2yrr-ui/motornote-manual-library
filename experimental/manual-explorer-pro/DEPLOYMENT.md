# Cloudflare Pages deployment

## Preview project

The existing Pages project is \`lifeos-manual-explorer-pro\`. Its root directory is \`/experimental/manual-explorer-pro\`, build output is \`dist\`, and the R2 binding name is \`MANUALS\`.

The MVP preview branch is \`feat/lifeos-manual-explorer-pro-mvp\`. Production deployments remain disabled while this branch is under validation.

## Build command

\`\`\`sh
npm install --no-audit --no-fund && npm test && npm run build
\`\`\`

## R2 binding

Bind the existing \`motornote-manual-site\` bucket as \`MANUALS\`. The app's Functions use read-only GET access for factory pages, trees, and search shards. Do not add write permissions to manual endpoints.

## Secrets

Set GitHub and vendor credentials as Cloudflare Pages environment secrets, not as source files or \`VITE_*\` variables. Required GitHub values are documented in \`GITHUB_APP_SETUP.md\`.

## Release gate

Do not enable production deployments until:
- CI build and Jest tests pass.
- Both vehicle manuals navigate correctly.
- Search returns relevant pages and opens inside the reader.
- The 92 search shards are available through the Pages API.
- Offline behavior has been tested after a real cache warm-up.
- GitHub OAuth and repository sync have been tested with the actual App installation.
