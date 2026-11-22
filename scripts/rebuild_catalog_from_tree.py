#!/usr/bin/env python3
"""Rebuild search indexes from the already-committed manuals without touching manuals/."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from ingest_manuals import MANUALS, build_catalog, load_previous_catalog, write_indexes


def main() -> int:
    if not MANUALS.is_dir():
        raise SystemExit("ERROR: manuals/ is missing; refusing to rebuild indexes.")

    roots = sorted(
        (path for path in MANUALS.iterdir() if path.is_dir() and not path.name.startswith(".")),
        key=lambda path: path.name.lower(),
    )
    if not roots:
        raise SystemExit("ERROR: no visible manual folders found; refusing to write empty indexes.")

    previous = load_previous_catalog()
    catalog, pages = build_catalog(previous, {})
    actual_counts = {
        root.name: sum(1 for path in root.rglob("*") if path.is_file())
        for root in roots
    }
    rebuilt_counts = {item["id"]: item["file_count"] for item in catalog}
    if rebuilt_counts != actual_counts:
        raise SystemExit(
            "ERROR: rebuilt catalog counts do not match the committed tree: "
            f"catalog={rebuilt_counts!r}, tree={actual_counts!r}"
        )

    stamp = datetime.now(timezone.utc).isoformat()
    write_indexes(catalog, pages, stamp)
    summary = {
        "generated_at": stamp,
        "manual_count": len(catalog),
        "file_count": sum(item["file_count"] for item in catalog),
        "indexed_pdf_pages_with_text": len(pages),
        "manuals": [
            {"id": item["id"], "make": item["make"], "file_count": item["file_count"]}
            for item in catalog
        ],
    }
    print("Rebuilt catalog from committed source tree only:")
    print(json.dumps(summary, indent=2))
    print("No ZIP extraction, manual-page cleanup, Phoenix styling, or R2 operations were performed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
