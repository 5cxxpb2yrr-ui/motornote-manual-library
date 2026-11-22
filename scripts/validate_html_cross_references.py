#!/usr/bin/env python3
"""Validate every local reference in the staged MotorNote manual HTML corpus.

The validator runs against the exact directory that will be uploaded to R2.
It checks local href/src/poster/action references, target file existence, HTML
fragment targets, and duplicate IDs. External URLs and non-fetch schemes are
left to their respective services.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

SKIP_SCHEMES = {"http", "https", "mailto", "tel", "javascript", "data", "blob", "ftp"}
REFERENCE_ATTRS = {"href", "src", "poster", "action", "formaction", "cite", "background"}


class References(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.refs: list[tuple[str, str]] = []
        self.ids: list[str] = []
        self.base_href: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        if values.get("id"):
            self.ids.append(values["id"])
        if tag.lower() == "a" and values.get("name"):
            self.ids.append(values["name"])
        if tag.lower() == "base" and values.get("href") and self.base_href is None:
            self.base_href = values["href"]
        for attr in REFERENCE_ATTRS:
            value = values.get(attr, "").strip()
            if value:
                self.refs.append((attr, value))
        srcset = values.get("srcset", "").strip()
        # srcset candidates are comma-separated; data-URI srcsets are left
        # alone because their payload itself may contain commas.
        if srcset and not srcset.lower().startswith("data:"):
            for candidate in srcset.split(","):
                url = candidate.strip().split()
                if url:
                    self.refs.append(("srcset", url[0]))
        if tag.lower() in {"object", "embed"} and values.get("data", "").strip():
            self.refs.append(("data", values["data"].strip()))


def load_html(path: Path) -> References:
    parser = References()
    try:
        parser.feed(path.read_text(encoding="utf-8"))
        parser.close()
    except (OSError, UnicodeError) as exc:
        raise RuntimeError(f"Cannot parse {path}: {exc}") from exc
    return parser


def normalized_target(root: Path, source: Path, raw_url: str, base_href: str | None) -> tuple[Path | None, str, str | None]:
    page_url = "/" + source.relative_to(root).as_posix()
    effective_base = urljoin(page_url, base_href) if base_href else page_url
    resolved_url = urljoin(effective_base, raw_url.strip())
    parsed = urlsplit(resolved_url)
    if parsed.scheme.lower() in SKIP_SCHEMES or parsed.netloc:
        return None, "", None
    if parsed.scheme:
        return None, "", None

    raw_path = unquote(parsed.path)
    target = root / raw_path.lstrip("/") if raw_path else source
    try:
        resolved = target.resolve(strict=False)
        resolved.relative_to(root.resolve())
    except (OSError, ValueError):
        return None, unquote(parsed.fragment), "reference escapes the published site root"
    if resolved.is_dir():
        for index_name in ("index.html", "index.htm"):
            candidate = resolved / index_name
            if candidate.is_file():
                resolved = candidate
                break
    return resolved, unquote(parsed.fragment), None


def validate(
    root: Path,
    report_path: Path,
    *,
    duplicate_id_policy: str = "error",
    missing_reference_policy: str = "error",
) -> dict:
    if duplicate_id_policy not in {"error", "warn", "ignore"}:
        raise ValueError("duplicate_id_policy must be error, warn, or ignore.")
    if missing_reference_policy not in {"error", "warn", "ignore"}:
        raise ValueError("missing_reference_policy must be error, warn, or ignore.")
    root = root.resolve()
    if not root.is_dir():
        raise RuntimeError(f"Site root does not exist: {root}")

    files = {p.resolve() for p in root.rglob("*") if p.is_file()}
    html_files = sorted((p for p in files if p.suffix.lower() in {".html", ".htm"}), key=str)
    parsed_docs: dict[Path, References] = {}
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    checked = 0

    for page in html_files:
        try:
            parsed_docs[page] = load_html(page)
        except RuntimeError as exc:
            errors.append({"type": "html-parse", "source": page.relative_to(root).as_posix(), "message": str(exc)})

    ids_by_page: dict[Path, set[str]] = {}
    for page, doc in parsed_docs.items():
        counts = Counter(doc.ids)
        ids_by_page[page] = set(doc.ids)
        for anchor, count in counts.items():
            if count > 1 and duplicate_id_policy != "ignore":
                finding = {
                    "type": "duplicate-id",
                    "source": page.relative_to(root).as_posix(),
                    "target": anchor,
                    "message": f"ID/name anchor appears {count} times",
                }
                if duplicate_id_policy == "warn":
                    warnings.append(finding)
                else:
                    errors.append(finding)

    for page, doc in parsed_docs.items():
        for attr, raw_url in doc.refs:
            checked += 1
            target, fragment, problem = normalized_target(root, page, raw_url, doc.base_href)
            if target is None:
                if problem:
                    errors.append({
                        "type": "unsafe-reference",
                        "source": page.relative_to(root).as_posix(),
                        "attribute": attr,
                        "reference": raw_url,
                        "message": problem,
                    })
                continue
            if target not in files:
                finding = {
                    "type": "missing-target",
                    "source": page.relative_to(root).as_posix(),
                    "attribute": attr,
                    "reference": raw_url,
                    "target": target.relative_to(root).as_posix() if target.is_relative_to(root) else str(target),
                    "message": "Local reference does not resolve to a published file",
                }
                if missing_reference_policy == "warn":
                    warnings.append(finding)
                elif missing_reference_policy == "error":
                    errors.append(finding)
                continue
            if fragment and target.suffix.lower() in {".html", ".htm"} and target in ids_by_page:
                if fragment not in ids_by_page[target]:
                    finding = {
                        "type": "missing-anchor",
                        "source": page.relative_to(root).as_posix(),
                        "attribute": attr,
                        "reference": raw_url,
                        "target": target.relative_to(root).as_posix(),
                        "fragment": fragment,
                        "message": "Target HTML page does not contain this ID/name anchor",
                    }
                    if missing_reference_policy == "warn":
                        warnings.append(finding)
                    elif missing_reference_policy == "error":
                        errors.append(finding)

    report = {
        "status": "failed" if errors else "passed",
        "site_root": str(root),
        "html_pages": len(html_files),
        "local_references_checked": checked,
        "errors": errors,
        "error_count": len(errors),
        "error_counts_by_type": dict(Counter(item["type"] for item in errors)),
        "warnings": warnings,
        "warning_count": len(warnings),
        "warning_counts_by_type": dict(Counter(item["type"] for item in warnings)),
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        f"HTML cross-reference validation: {report['status']} — "
        f"{len(html_files):,} HTML pages, {checked:,} local references, "
        f"{len(errors):,} errors, {len(warnings):,} warnings."
    )
    print(f"Error counts by type: {report['error_counts_by_type']}")
    print(f"Warning counts by type: {report['warning_counts_by_type']}")
    print(f"Full report: {report_path}")
    for error in errors[:100]:
        location = error.get("source", "<unknown>")
        reference = error.get("reference") or error.get("target", "")
        print(f"::error file={location}::{error['type']}: {reference} — {error['message']}")
    if len(errors) > 100:
        print(f"... {len(errors) - 100:,} additional errors are recorded in the JSON report.")
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("site_root", type=Path, help="Exact staged directory that will be published")
    parser.add_argument("--report", type=Path, default=Path("html-cross-reference-report.json"))
    parser.add_argument(
        "--duplicate-id-policy", choices=("error", "warn", "ignore"), default="error",
        help="How to treat duplicate IDs in source HTML (default: error).",
    )
    parser.add_argument(
        "--missing-reference-policy", choices=("error", "warn", "ignore"), default="error",
        help="How to treat missing local targets and anchors (default: error).",
    )
    args = parser.parse_args()
    try:
        report = validate(
            args.site_root,
            args.report,
            duplicate_id_policy=args.duplicate_id_policy,
            missing_reference_policy=args.missing_reference_policy,
        )
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
