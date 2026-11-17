# Parts intelligence and confidence

## Current extraction

- \`src/lib/extraction.ts\` detects known part names in procedure titles and body text.
- Each detection retains source path, exact evidence excerpt, character offsets, confidence, and a relationship only when the surrounding text supports one.
- \`src/lib/oem.ts\` parses tables with Part, Manufacturer, and OEM Part # headers.
- OEM rows preserve the exact source string. They are marked \`unverified\` even when the source table labels the value as OEM.

## Confidence

- Exact part name in a procedure title: 0.97.
- Exact term in body: 0.88, with small increments for repeated evidence.
- Confidence is an extraction score, not a fitment guarantee.

## Relationship detection

\`required\`, \`recommended\`, \`consumable\`, and \`tool\` are inferred only when evidence phrases support the relationship. If the source text does not establish the relationship, it remains unset instead of being guessed.

## Data integrity

Never manufacture torque specifications, OEM numbers, required tools, EyeSight calibration targets, or vehicle fitment. Every extracted value must retain its source page and verification state. Human review is required before publishing curated procedures.
