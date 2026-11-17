# GitHub authorization flow

The callback route is \`/auth/github/callback\`.

1. \`GET /api/auth/github/login\` generates a random state and PKCE verifier.
2. The state and verifier are sealed in a short-lived Secure, HttpOnly cookie.
3. The browser is redirected to GitHub's authorization endpoint with S256 PKCE and \`offline_access\`.
4. The callback compares the returned state with the sealed cookie.
5. The server exchanges the code using the client secret and PKCE verifier.
6. The server retrieves the GitHub user and validates access to \`5cxxpb2yrr-ui/motornote-manual-library\`.
7. The access and refresh tokens are sealed into an AES-GCM encrypted HttpOnly cookie.
8. \`GET /api/auth/github/status\` refreshes expiring GitHub App user tokens server-side.
9. \`POST /api/auth/github/logout\` clears the session.

Register the exact callback URL configured in \`GITHUB_CALLBACK_URL\` in the GitHub App settings. For branch previews, use a stable branch alias; do not register a changing short deployment URL.

Fine-grained and classic PATs are supported as an optional compatibility route through \`POST /api/auth/github/pat\`. PATs are validated server-side and stored only in the encrypted HttpOnly session cookie. Prefer the GitHub App flow.
