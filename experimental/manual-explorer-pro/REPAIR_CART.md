# Repair cart

The MVP repair list is local-first and can be exported as TXT. Cart validation primitives live in \`src/lib/cart.ts\`.

Validation reports:
- Missing required parts.
- Missing required tools.
- OEM numbers that have not been verified.
- Missing vendor price or purchase link.

A missing price is a warning, not a reason to block a repair list. A missing required part or tool is an error.

The GitHub sync endpoint stores user repair data under \`data/users/{login}/manual-explorer.json\`. The client merges by record key with local records taking precedence. More advanced conflict resolution is planned.
