#!/usr/bin/env python3
"""Convert a nested HTML manual index into a tree.json with exact leaf filenames.

Usage:
    python tools/build_tree.py 2.html "Repair and Diagnosis" > tree.json

A leaf's file value is copied from the final filename in its source href. It is
never generated from the page title or a numeric page identifier.
"""
from __future__ import annotations

import argparse
from html.parser import HTMLParser
import json
from pathlib import PurePosixPath
import re
import sys
from urllib.parse import unquote, urlsplit

SUPPORTED = {".html", ".htm", ".md", ".txt", ".pdf", ".png", ".svg"}


def clean_label(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def exact_filename(href: str) -> str | None:
    if not href or href.startswith(("#", "javascript:", "mailto:", "data:")):
        return None
    path = unquote(urlsplit(href).path)
    if not path or "\\" in path:
        return None
    filename = PurePosixPath(path).name
    if PurePosixPath(filename).suffix.lower() not in SUPPORTED:
        return None
    return filename


class IndexTreeParser(HTMLParser):
    def __init__(self, title: str) -> None:
        super().__init__(convert_charrefs=True)
        self.root = {"title": title, "c": []}
        self.list_stack: list[list[dict]] = [self.root["c"]]
        self.item_stack: list[dict] = []
        self.link_href: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attributes = {name.lower(): value or "" for name, value in attrs}
        if tag in {"ul", "ol"}:
            if self.item_stack:
                children = self.item_stack[-1].setdefault("c", [])
                self.list_stack.append(children)
            else:
                self.list_stack.append(self.root["c"])
        elif tag == "li":
            node = {"n": ""}
            self.list_stack[-1].append(node)
            self.item_stack.append(node)
        elif tag == "a" and self.item_stack:
            self.link_href = attributes.get("href")

    def handle_data(self, data: str) -> None:
        if self.item_stack:
            self.item_stack[-1]["n"] += data

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "a":
            if self.item_stack and self.link_href:
                filename = exact_filename(self.link_href)
                if filename:
                    self.item_stack[-1]["file"] = filename
            self.link_href = None
        elif tag == "li":
            if self.item_stack:
                self.item_stack.pop()
        elif tag in {"ul", "ol"} and len(self.list_stack) > 1:
            self.list_stack.pop()


def finalize(nodes: list[dict]) -> list[dict]:
    output = []
    for raw in nodes:
        label = clean_label(raw.get("n", "")) or "Untitled section"
        node = {"n": label}
        filename = raw.get("file")
        if filename:
            node["file"] = filename
        children = finalize(raw.get("c", []))
        if children:
            node["c"] = children
        output.append(node)
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("index_html", help="HTML index page with nested ul/ol navigation")
    parser.add_argument("title", help="Manual title written to the tree root")
    args = parser.parse_args()

    try:
        with open(args.index_html, "r", encoding="utf-8", errors="replace") as source:
            html = source.read()
    except OSError as error:
        print(f"Could not read {args.index_html}: {error}", file=sys.stderr)
        return 2

    tree_parser = IndexTreeParser(args.title)
    tree_parser.feed(html)
    tree_parser.close()
    tree = {"title": args.title, "c": finalize(tree_parser.root["c"])}
    if not tree["c"]:
        print("No nested list navigation was found in the index page.", file=sys.stderr)
        return 1

    leaf_count = 0

    def count_files(nodes: list[dict]) -> None:
        nonlocal leaf_count
        for node in nodes:
            if node.get("file"):
                leaf_count += 1
            count_files(node.get("c", []))

    count_files(tree["c"])
    if not leaf_count:
        print(
            "No exact file links were found. Ensure index links point to the section-based filenames "
            "(for example, EM-01 Engine Removal.md); numeric page IDs are not converted.",
            file=sys.stderr,
        )
        return 1

    json.dump(tree, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    print(f"Wrote {leaf_count:,} exact file references.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
