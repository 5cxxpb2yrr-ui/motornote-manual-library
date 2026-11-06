#!/usr/bin/env python3
"""Upload searchable service-manual files to the authenticated MotorNote API."""
from __future__ import annotations

import concurrent.futures
import hashlib
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANUALS = ROOT / "manuals"
BASE_URL = os.environ.get("MOTORNOTE_API_URL", "").rstrip("/")
TOKEN = os.environ.get("MOTORNOTE_API_TOKEN", "")
MAX_BYTES = 20 * 1024 * 1024
EXTENSIONS = {".html", ".htm", ".txt", ".md", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".svg"}


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
    try:
        size = path.stat().st_size
        if size <= 0 or size > MAX_BYTES:
            return False, f"skipped size={size} path={path.relative_to(MANUALS)}"
        headers = document_headers(path)
        request = urllib.request.Request(
            f"{BASE_URL}/v1/documents",
            data=path.read_bytes(),
            headers=headers,
            method="PUT",
        )
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    return True, f"{response.status} {path.relative_to(MANUALS)}"
            except urllib.error.HTTPError as error:
                detail = error.read().decode("utf-8", "replace")[:500]
                if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                    return False, f"HTTP {error.code} {path.relative_to(MANUALS)}: {detail}"
                time.sleep(2 ** attempt)
            except (urllib.error.URLError, TimeoutError) as error:
                if attempt == 3:
                    return False, f"network {path.relative_to(MANUALS)}: {error}"
                time.sleep(2 ** attempt)
    except OSError as error:
        return False, f"file {path}: {error}"
    return False, f"failed {path}"


def main() -> int:
    if not BASE_URL or not TOKEN:
        print("MotorNote sync skipped: MOTORNOTE_API_URL or MOTORNOTE_API_TOKEN is missing.")
        return 0
    if not MANUALS.is_dir():
        print("No manuals directory found.")
        return 1

    files = [p for p in MANUALS.rglob("*") if p.is_file() and p.suffix.lower() in EXTENSIONS]
    print(f"Queueing {len(files)} searchable manual files.")
    succeeded = failed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(upload, path) for path in files]
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            ok, message = future.result()
            if ok:
                succeeded += 1
            else:
                failed += 1
                print(message, file=sys.stderr)
            if index % 100 == 0 or index == len(files):
                print(f"Progress {index}/{len(files)} | accepted={succeeded} | failed/skipped={failed}")
    print(f"MotorNote sync complete: accepted={succeeded}, failed/skipped={failed}.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
