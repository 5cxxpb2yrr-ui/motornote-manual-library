#!/usr/bin/env python3
"""Validate local file references in the published manual HTML corpus.

External URLs and fragment-only links are intentionally ignored. Local href,
src, poster, data, action, and srcset targets must resolve to a file in the
site root. The check reads HTML only; Git LFS pointer files are sufficient for
target existence checks, so CI does not need to download large binary assets.
"""
from __future__ import annotations

import argparse
from html.parser import HTMLParser
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit

HTML_SUFFIXES = {".html", ".htm"}
URL_ATTRIBUTES = {"href", "src", "poster", "data", "action", "xlink:href"}


class ReferenceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.references: list[tuple[int, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._collect(attrs)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._collect(attrs)

    def _collect(self, attrs: list[tuple[str, str | None]]) -> None:
        line = self.getpos()[0]
        for raw_name, raw_value in attrs:
            name = raw_name.lower()
            value = (raw_value or "").strip()
            if not value:
                continue
            if name in URL_ATTRIBUTES:
                self.references.append((line, value))
            elif name == "srcset":
                # Data URLs contain commas, so skip a srcset attribute rather
                # than mis-tokenizing it. Ordinary src attributes are checked.
                if value.lower().startswith("data:") or ",data:" in value.lower():
                    continue
                for candidate in value.split(","):
                    url = candidate.strip().split()
                    if url:
                        self.references.append((line, url[0]))


def html_files(root: Path) -> list[Path]:
    return sorted(
        (p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in HTML_SUFFIXES
         and ".git" not in p.parts and ".github" not in p.parts),
        key=lambda p: p.as_posix().lower(),
    )


def resolve_target(root: Path, source: Path, reference: str) -> Path | None:
    """Return the local target path, or None for a non-local/empty reference."""
    reference = reference.strip()
    if not reference or reference.startswith("#"):
        return None

    parsed = urlsplit(reference)
    if parsed.scheme or parsed.netloc:
        return None
    if not parsed.path:
        return None

    decoded = unquote(parsed.path).replace("\\", "/")
    if decoded.startswith("/"):
        relative = decoded.lstrip("/")
        target = root / relative
        # Source checkouts keep shared assets under site-worker/assets; the
        # published site exposes the same files at /assets.
        if not target.exists() and relative.startswith("assets/"):
            target = root / "site-worker" / relative
    else:
        target = source.parent / decoded

    try:
        target = target.resolve()
        target.relative_to(root.resolve())
    except (OSError, ValueError):
        # A local URL that escapes the published root is still a broken
        # reference, not an external URL to silently ignore.
        return root / "__outside_site_root__" / target.name

    if target.is_dir():
        for index_name in ("index.html", "index.htm"):
            candidate = target / index_name
            if candidate.is_file():
                return candidate
        return target
    return target


def validate(root: Path, max_errors: int = 100) -> tuple[int, int, list[str]]:
    root = root.resolve()
    pages = html_files(root)
    checked = 0
    errors: list[str] = []

    for page in pages:
        try:
            source = page.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            errors.append(f"{page.relative_to(root)}: cannot read HTML: {exc}")
            continue

        parser = ReferenceParser()
        try:
            parser.feed(source)
            parser.close()
        except Exception as exc:  # malformed legacy HTML should still be reported
            errors.append(f"{page.relative_to(root)}: HTML parse error: {exc}")
            continue

        for line, reference in parser.references:
            target = resolve_target(root, page, reference)
            if target is None:
                continue
            checked += 1
            if not target.is_file():
                try:
                    display = target.relative_to(root).as_posix()
                except ValueError:
                    display = str(target)
                errors.append(
                    f"{page.relative_to(root).as_posix()}:{line}: "
                    f"{reference!r} -> missing {display}"
                )
                if len(errors) >= max_errors:
                    return len(pages), checked, errors

    return len(pages), checked, errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1],
                        help="Published site root (defaults to repository root)")
    parser.add_argument("--max-errors", type=int, default=100,
                        help="Maximum missing-reference examples to print")
    args = parser.parse_args()

    if not (args.root / "manuals").is_dir() and not any(
        p.suffix.lower() in HTML_SUFFIXES for p in args.root.glob("*.html")
    ):
        print(f"No manual HTML corpus found under {args.root}", file=sys.stderr)
        return 2

    page_count, checked, errors = validate(args.root, max(1, args.max_errors))
    missing = len(errors)
    print(f"HTML cross-reference audit: {page_count:,} HTML files, "
          f"{checked:,} local references checked, {missing:,} missing/unreadable references.")
    for error in errors:
        print(f"::error::{error}")
    if errors:
        print("Manual publishing blocked: repair the broken local references above.")
        return 1
    print("All local HTML file references resolve.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
