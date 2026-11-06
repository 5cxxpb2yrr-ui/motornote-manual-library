#!/usr/bin/env python3
"""Preview or upload searchable service-manual files to MotorNote retrieval."""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANUALS = ROOT / "manuals"
BASE_URL = os.environ.get("MOTORNOTE_API_URL", "").rstrip("/")
TOKEN = os.environ.get("MOTORNOTE_API_TOKEN", "")
LIMIT_MIB = {
    ".html": 10, ".htm": 10, ".txt": 10, ".md": 10, ".pdf": 10,
    ".png": 4, ".jpg": 4, ".jpeg": 4, ".webp": 4, ".svg": 4,
}
EXTENSIONS = set(LIMIT_MIB)
TEXT_FIRST_EXTENSIONS = {'.html', '.htm', '.txt', '.md', '.pdf'}
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.svg'}


def document_headers(path: Path) -> dict[str, str]:
    relative = path.relative_to(MANUALS).as_posix()
    digest = hashlib.sha256(relative.encode("utf-8")).hexdigest()[:32]
    suffix = path.suffix.lower()
    make_folder = relative.split("/", 1)[0].lower()
    make = "scion" if make_folder.startswith("scion") else "subaru" if make_folder.startswith("subaru") else "unknown"
    parts = Path(relative).parts
    model = parts[1] if len(parts) > 1 else ""
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": content_type,
        "X-Document-Key": f"{digest}{suffix}",
        "X-Source-Path": f"manuals/{relative}",
        "X-Make": make,
        "X-Model": model,
        "X-Document-Type": suffix.lstrip("."),
    }


def upload(path: Path) -> tuple[bool, str]:
    relative = path.relative_to(MANUALS).as_posix()
    try:
        request = urllib.request.Request(
            f"{BASE_URL}/v1/documents",
            data=path.read_bytes(),
            headers=document_headers(path),
            method="PUT",
        )
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    return True, f"{response.status} {relative}"
            except urllib.error.HTTPError as error:
                detail = error.read().decode("utf-8", "replace")[:500]
                if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                    return False, f"HTTP {error.code} {relative}: {detail}"
                time.sleep(2 ** attempt)
            except (urllib.error.URLError, TimeoutError) as error:
                if attempt == 3:
                    return False, f"network {relative}: {error}"
                time.sleep(2 ** attempt)
    except OSError as error:
        return False, f"file {relative}: {error}"
    return False, f"failed {relative}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="report file counts and sizes without uploading")
    parser.add_argument("--include-images", action="store_true", help="also upload image and SVG assets; excluded by default")
    parser.add_argument("--limit", type=int, default=None, help="process at most this many selected files (useful for a smoke test)")
    args = parser.parse_args()

    if not MANUALS.is_dir():
        print("No manuals directory found.")
        return 1

    files = [p for p in MANUALS.rglob("*") if p.is_file() and p.suffix.lower() in EXTENSIONS]
    counts, sizes, oversized = Counter(), Counter(), Counter()
    eligible = []
    selected_extensions = TEXT_FIRST_EXTENSIONS | (IMAGE_EXTENSIONS if args.include_images else set())
    excluded_count = excluded_bytes = 0
    for path in files:
        ext = path.suffix.lower()
        size = path.stat().st_size
        counts[ext] += 1
        sizes[ext] += size
        if size == 0 or size > LIMIT_MIB[ext] * 1024 * 1024:
            oversized[ext] += 1
        elif ext in selected_extensions:
            eligible.append(path)
        else:
            excluded_count += 1
            excluded_bytes += size

    total_bytes = sum(sizes.values())
    print(f"Supported files: {len(files)} | eligible: {len(eligible)} | oversized/empty: {sum(oversized.values())}")
    print(f"Total supported-file size: {total_bytes / (1024 * 1024):.1f} MiB")
    selected_bytes = sum(path.stat().st_size for path in eligible)
    mode = "text + image" if args.include_images else "text-first"
    print(f"Selected for {mode}: {len(eligible)} files, {selected_bytes / (1024 * 1024):.1f} MiB")
    print(f"Excluded by text-first policy: {excluded_count} files, {excluded_bytes / (1024 * 1024):.1f} MiB")
    print("By extension:")
    for ext in sorted(counts):
        print(f"  {ext}: {counts[ext]} files, {sizes[ext] / (1024 * 1024):.1f} MiB, skipped={oversized[ext]}")
    eligible.sort(key=lambda path: path.relative_to(MANUALS).as_posix().lower())
    if args.limit is not None:
        if args.limit < 1:
            parser.error("--limit must be at least 1")
        original_count = len(eligible)
        eligible = eligible[:args.limit]
        limited_bytes = sum(path.stat().st_size for path in eligible)
        print(f"Batch limit: {len(eligible)} of {original_count} selected files, {limited_bytes / (1024 * 1024):.1f} MiB")
    if args.dry_run:
        print("Dry run only; no documents were uploaded.")
        return 0
    if not BASE_URL or not TOKEN:
        print("Upload requires MOTORNOTE_API_URL and MOTORNOTE_API_TOKEN.", file=sys.stderr)
        return 2

    succeeded = failed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(upload, path) for path in eligible]
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            ok, message = future.result()
            if ok:
                succeeded += 1
            else:
                failed += 1
                print(message, file=sys.stderr)
            if index % 100 == 0 or index == len(futures):
                print(f"Progress {index}/{len(futures)} | accepted={succeeded} | failed={failed}")
    print(f"MotorNote sync complete: accepted={succeeded}, failed={failed}, skipped={sum(oversized.values())}.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
