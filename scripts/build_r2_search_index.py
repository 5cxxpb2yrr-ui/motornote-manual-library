#!/usr/bin/env python3
"""Build a separate, text-only search index from HTML pages already stored in R2.

This reads the existing private manual corpus. It never downloads or republishes
manual assets, and writes only under search-index/v1/.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html
from html.parser import HTMLParser
import json
import os
import re
import sys
from typing import Any

import boto3
from botocore.config import Config

BUCKET = os.environ.get("R2_BUCKET", "motornote-manual-site")
ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
PREFIX = "search-index/v1/"
SKIP_TAGS = {"script", "style", "noscript", "svg", "nav", "footer", "header"}
SKIP_CLASSES = {
    "breadcrumb-part", "mn-header", "mn-footer", "phoenix-header",
    "phoenix-footer", "navigation", "nav", "menu",
}


class PageText(HTMLParser):
    """Extract page title and readable body text, excluding executable/chrome UI."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []
        self.skip_depth = 0
        self.in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attr = {k.lower(): (v or "") for k, v in attrs}
        classes = set(attr.get("class", "").lower().split())
        hidden = "hidden" in attr or attr.get("aria-hidden", "").lower() == "true"
        if self.skip_depth:
            if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "wbr"}:
                self.skip_depth += 1
            return
        if tag in SKIP_TAGS or classes.intersection(SKIP_CLASSES) or hidden:
            self.skip_depth = 1
            return
        if tag == "title":
            self.in_title = True
        if tag in {"p", "div", "section", "article", "h1", "h2", "h3", "h4", "li", "tr", "br"}:
            self.text_parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self.skip_depth:
            if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "wbr"}:
                self.skip_depth -= 1
            return
        if tag == "title":
            self.in_title = False
        if tag in {"p", "div", "section", "article", "h1", "h2", "h3", "h4", "li", "tr"}:
            self.text_parts.append(" ")

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        if self.in_title:
            self.title_parts.append(data)
        self.text_parts.append(data)


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def make_s3():
    if len(ACCOUNT_ID) != 32:
        raise RuntimeError("R2_ACCOUNT_ID must be the 32-character Cloudflare account ID.")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com",
        region_name="auto",
        config=Config(retries={"max_attempts": 8, "mode": "adaptive"}),
    )


def parse_page(s3, key: str) -> dict[str, Any] | None:
    response = s3.get_object(Bucket=BUCKET, Key=key)
    raw = response["Body"].read()
    if not raw:
        return None
    encoding = "utf-8"
    try:
        source = raw.decode(encoding)
    except UnicodeDecodeError:
        source = raw.decode("utf-8", errors="replace")
    parser = PageText()
    try:
        parser.feed(source)
        parser.close()
    except Exception:
        return None
    title = clean(" ".join(parser.title_parts))
    text = clean(" ".join(parser.text_parts))
    if not text:
        return None
    manual_id = key.split("/", 2)[1] if key.count("/") >= 2 else "unknown"
    return {
        "id": hashlib.sha1(key.encode("utf-8")).hexdigest(),
        "manualId": manual_id,
        "path": key,
        "title": title or key.rsplit("/", 1)[-1],
        "text": text,
        "bytes": len(raw),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Index at most N pages (0 = all).")
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--shard-size", type=int, default=500)
    args = parser.parse_args()
    if args.limit < 0 or args.workers < 1 or args.shard_size < 1:
        parser.error("limit must be >= 0; workers and shard-size must be positive")

    s3 = make_s3()
    paginator = s3.get_paginator("list_objects_v2")
    keys: list[str] = []
    for page in paginator.paginate(Bucket=BUCKET, Prefix="manuals/"):
        for item in page.get("Contents", []):
            key = item["Key"]
            if "/pages/" in key and key.lower().endswith((".html", ".htm")):
                keys.append(key)
                if args.limit and len(keys) >= args.limit:
                    break
        if args.limit and len(keys) >= args.limit:
            break

    print(f"Found {len(keys):,} HTML procedure pages in R2.", flush=True)
    records: list[dict[str, Any]] = []
    failures = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(parse_page, s3, key): key for key in keys}
        for future in concurrent.futures.as_completed(futures):
            try:
                record = future.result()
                if record:
                    records.append(record)
            except Exception as exc:
                failures += 1
                print(f"Could not index {futures[future]}: {exc}", file=sys.stderr)

    records.sort(key=lambda item: item["path"])
    shards = []
    for offset in range(0, len(records), args.shard_size):
        batch = records[offset:offset + args.shard_size]
        shard_number = offset // args.shard_size
        key = f"{PREFIX}shard-{shard_number:04d}.json"
        body = json.dumps(batch, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        s3.put_object(
            Bucket=BUCKET,
            Key=key,
            Body=body,
            ContentType="application/json; charset=utf-8",
            CacheControl="public, max-age=300",
        )
        shards.append({"key": key, "documents": len(batch), "bytes": len(body)})
        print(f"Published {key} ({len(batch):,} pages, {len(body):,} bytes)", flush=True)

    manifest = {
        "version": 1,
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "source": "R2 manuals/*/pages/*.html",
        "documentCount": len(records),
        "failedPages": failures,
        "shardCount": len(shards),
        "shards": shards,
    }
    # Publish manifest last so readers never see an incomplete new index.
    s3.put_object(
        Bucket=BUCKET,
        Key=f"{PREFIX}manifest.json",
        Body=json.dumps(manifest, indent=2).encode("utf-8"),
        ContentType="application/json",
        CacheControl="public, max-age=60",
    )
    print(json.dumps(manifest, indent=2))
    if failures:
        print(f"Completed with {failures} page retrieval/parsing failures.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
