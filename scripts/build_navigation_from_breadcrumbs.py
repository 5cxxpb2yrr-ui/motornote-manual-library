#!/usr/bin/env python3
"""Build MotorNote navigation trees from the breadcrumbs in the published manual HTML.

The manual HTML is authoritative for page identity and hierarchy. Numeric page IDs
are never inferred from a separate, independently maintained catalog.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANUALS = {
    "scion-service-manual": {
        "folder": "2006 Scion xB Standard",
        "prefix": "scion",
    },
    "subaru-service-manual": {
        "folder": "2019 Subaru Crosstrek Limited",
        "prefix": "subaru",
    },
}


class BreadcrumbParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.active_tag: str | None = None
        self.depth = 0
        self.buffer: list[str] = []
        self.h1_depth: int | None = None
        self.h1_buffer: list[str] = []
        self.h1_values: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = dict(attrs)
        classes = (attrs_map.get("class") or "").split()
        if self.active_tag is None and "breadcrumb-part" in classes:
            self.active_tag = tag
            self.depth = 0
            self.buffer = []
        elif self.active_tag is not None:
            self.depth += 1
        if tag.lower() == "h1" and self.h1_depth is None:
            self.h1_depth = 0
            self.h1_buffer = []
        elif self.h1_depth is not None:
            self.h1_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if self.active_tag is not None:
            if tag.lower() == self.active_tag.lower() and self.depth == 0:
                value = " ".join("".join(self.buffer).split())
                if value:
                    self.parts.append(value)
                self.active_tag = None
                self.buffer = []
            else:
                self.depth = max(0, self.depth - 1)
        if self.h1_depth is not None:
            if tag.lower() == "h1" and self.h1_depth == 0:
                value = " ".join("".join(self.h1_buffer).split())
                if value:
                    self.h1_values.append(value)
                self.h1_depth = None
                self.h1_buffer = []
            else:
                self.h1_depth = max(0, self.h1_depth - 1)

    def handle_data(self, data: str) -> None:
        if self.active_tag is not None:
            self.buffer.append(data)
        if self.h1_depth is not None:
            self.h1_buffer.append(data)


def parse_html(path: Path) -> tuple[list[str], str]:
    parser = BreadcrumbParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return parser.parts, (parser.h1_values[0] if parser.h1_values else "")


def guide_for_root(root_label: str) -> str:
    return "labor" if re.search(r"labor|parts\s+and\s+labor", root_label, re.I) else "repair"


def insert_page(tree: dict, categories: list[str], title: str, page_id: int) -> None:
    node = tree
    for label in categories:
        child = next(
            (item for item in node["c"] if "p" not in item and item["n"] == label),
            None,
        )
        if child is None:
            child = {"n": label, "c": []}
            node["c"].append(child)
        node = child
    if any(item.get("p") == page_id for item in node["c"]):
        raise ValueError(f"Duplicate page ID {page_id} under {' / '.join(categories)}")
    node["c"].append({"n": title, "p": page_id})


def build_manual(manual_id: str, config: dict, root: Path) -> dict:
    pages_dir = root / "manuals" / manual_id / config["folder"] / "pages"
    if not pages_dir.is_dir():
        raise SystemExit(f"ERROR: missing manual pages directory: {pages_dir}")

    trees = {"repair": {"c": []}, "labor": {"c": []}}
    counts: Counter[str] = Counter()
    skipped: list[str] = []
    mismatches: list[dict] = []
    seen_ids: set[int] = set()

    page_files = sorted(
        (p for p in pages_dir.iterdir() if p.is_file() and re.fullmatch(r"\d+\.html?", p.name, re.I)),
        key=lambda p: int(re.match(r"\d+", p.name).group()),
    )
    if not page_files:
        raise SystemExit(f"ERROR: no numbered HTML pages found in {pages_dir}")

    for path in page_files:
        page_id = int(re.match(r"\d+", path.name).group())
        if page_id in seen_ids:
            raise SystemExit(f"ERROR: duplicate page ID {page_id} in {pages_dir}")
        seen_ids.add(page_id)

        crumbs, h1 = parse_html(path)
        # The first four crumbs identify Home, make, year, and vehicle.
        # Page 1 is the vehicle landing page and intentionally has no guide root.
        if len(crumbs) <= 4:
            skipped.append(path.name)
            continue
        guide_root = crumbs[4]
        guide = guide_for_root(guide_root)
        categories = crumbs[5:-1]
        title = h1 or (crumbs[-1] if crumbs else "")
        if not title:
            raise SystemExit(f"ERROR: page {page_id} has no breadcrumb title or h1")
        if crumbs[-1] and " ".join(crumbs[-1].split()) != " ".join(title.split()):
            mismatches.append({
                "page_id": page_id,
                "breadcrumb_title": crumbs[-1],
                "h1_title": title,
            })
        insert_page(trees[guide], categories, title, page_id)
        counts[guide] += 1

    if not counts["repair"] or not counts["labor"]:
        raise SystemExit(
            f"ERROR: expected both Repair and Labor navigation trees for {manual_id}; "
            f"found {dict(counts)}"
        )
    return {
        "trees": trees,
        "summary": {
            "manual_id": manual_id,
            "page_files": len(page_files),
            "repair_pages": counts["repair"],
            "labor_pages": counts["labor"],
            "landing_pages_skipped": len(skipped),
            "title_mismatch_count": len(mismatches),
            "title_mismatch_sample": mismatches[:50],
            "skipped_sample": skipped[:20],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, default=ROOT / "index" / "navigation")
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    summaries = []
    for manual_id, config in MANUALS.items():
        result = build_manual(manual_id, config, args.root)
        prefix = config["prefix"]
        for guide, tree in result["trees"].items():
            output_name = "parts" if prefix == "scion" and guide == "labor" else guide
            target = args.output / f"{prefix}-{output_name}.json"
            target.write_text(json.dumps(tree, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        summaries.append(result["summary"])

    report = {"manuals": summaries}
    (args.output / "summary.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("Navigation trees were generated from source HTML breadcrumbs and h1 titles.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
