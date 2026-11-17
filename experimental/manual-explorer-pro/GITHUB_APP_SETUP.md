# GitHub App setup

Create a GitHub App for the repository \`5cxxpb2yrr-ui/motornote-manual-library\`.

## Repository permissions

- Contents: Read and write (needed for per-user sync JSON).
- Metadata: Read-only.
- No issue, pull-request, organization, or administration permissions are required for the current MVP.

Install the App on the single repository only. Copy the App ID and Client ID separately; they are different identifiers.

## Cloudflare secrets

Set these as Pages environment secrets:

- \`GITHUB_APP_ID\`
- \`GITHUB_CLIENT_ID\`
- \`GITHUB_CLIENT_SECRET\`
- \`GITHUB_PRIVATE_KEY\` — paste the PEM contents as a secret value; Workers cannot read a local private-key file path.
- \`GITHUB_INSTALLATION_ID\` — optional; when omitted, the server discovers the installation for the configured repository.
- \`GITHUB_WEBHOOK_SECRET\`
- \`GITHUB_CALLBACK_URL\`
- \`GITHUB_REPOSITORY_ID\` — optional, used to narrow user authorization to the repository.
- \`SESSION_SECRET\` — at least 32 random characters.

Never put private keys or secrets in the browser, a \`VITE_*\` variable, a committed \`.env\`, or the IndexedDB database.

## Connection test

Open **Connect GitHub** in the app, use **Continue with GitHub App**, and complete authorization. The server validates access to the private repository before setting an encrypted session cookie.

The endpoint \`GET /api/auth/github/installation\` separately validates App installation access and reports granted permissions without returning the installation token.
