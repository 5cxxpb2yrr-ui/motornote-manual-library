#!/usr/bin/env python3
"""Compatibility helpers for tests; publishing is retired in this module.

All build and R2 publication logic lives in manual_site_publisher.py.
"""
from pathlib import Path

from manual_site_publisher import decorate_html_page


def decorate_manual_pages(stage: Path) -> int:
    """Keep the tested legacy helper while delegating to the new Phoenix decorator."""
    manuals = stage / "manuals"
    if not manuals.is_dir():
        return 0
    count = 0
    for page in sorted(manuals.rglob("*"), key=lambda item: item.as_posix().lower()):
        relative = page.relative_to(manuals)
        if any(part.startswith(".") for part in relative.parts):
            continue
        if page.is_file() and page.suffix.lower() in {".html", ".htm"}:
            decorate_html_page(page)
            count += 1
    return count


def remove_manual_css_files(stage: Path) -> int:
    """Remove imported manual CSS from a staging tree, never shared Phoenix assets."""
    manuals = stage / "manuals"
    if not manuals.is_dir():
        return 0
    removed = 0
    for path in manuals.rglob("*"):
        relative = path.relative_to(manuals)
        if any(part.startswith(".") for part in relative.parts):
            continue
        if path.is_file() and path.suffix.lower() == ".css":
            path.unlink()
            removed += 1
    return removed


if __name__ == "__main__":
    raise SystemExit(
        "This legacy publisher entry point is retired. "
        "Use scripts/manual_site_publisher.py --mode dry-run or the controlled workflow."
    )
