# Vendor pricing

## Adapter contract

Each adapter implements \`search(partNumber)\` and returns zero or more normalized vendor records. \`PricingAggregator\` provides a TTL cache, bounded concurrent requests, timeout handling, and price sorting.

## Current status

The MVP includes:
- Normalized \`VendorPrice\` model.
- Adapter interface.
- Cache and concurrency limiter.
- Search-link adapters for eBay, Amazon, and PartsGeek.

It does **not** claim live vendor prices. Search-link results contain no price and are explicitly marked \`search-link\`. Live prices require authorized vendor APIs and credentials supplied as server-side environment secrets.

Do not scrape vendor sites or treat undated manual-listed prices as current prices. Affiliate IDs are server-side configuration only.
