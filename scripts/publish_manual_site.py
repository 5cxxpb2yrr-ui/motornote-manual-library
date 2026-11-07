#!/usr/bin/env python3
"""Publish the private manual website to Cloudflare R2 using GitHub OIDC."""
from __future__ import annotations

import concurrent.futures
import hashlib
import html
import json
import mimetypes
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANUALS = ROOT / "manuals"
INDEX = ROOT / "index"
PUBLISH_URL = os.environ.get("MOTORNOTE_PUBLISH_URL", "").rstrip("/")
AUDIENCE = "motornote-manual-publisher"
TOKEN_URL = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", "")
TOKEN_REQUEST_SECRET = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "")
TOKEN_LOCK = threading.Lock()
TOKEN_VALUE = ""
TOKEN_EXPIRY = 0


def decode_token_expiry(token: str) -> int:
    try:
        payload = token.split(".")[1]
        payload += "=" * ((4 - len(payload) % 4) % 4)
        import base64
        claims = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")))
        return int(claims.get("exp", 0))
    except (ValueError, IndexError, TypeError, json.JSONDecodeError):
        return 0


def oidc_token() -> str:
    global TOKEN_VALUE, TOKEN_EXPIRY
    with TOKEN_LOCK:
        if TOKEN_VALUE and TOKEN_EXPIRY > int(time.time()) + 90:
            return TOKEN_VALUE
        if not TOKEN_URL or not TOKEN_REQUEST_SECRET:
            raise RuntimeError("GitHub OIDC is unavailable; ensure the publishing job has id-token: write permission.")
        separator = "&" if "?" in TOKEN_URL else "?"
        url = TOKEN_URL + separator + urllib.parse.urlencode({"audience": AUDIENCE})
        request = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {TOKEN_REQUEST_SECRET}", "Accept": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
        TOKEN_VALUE = payload["value"]
        TOKEN_EXPIRY = decode_token_expiry(TOKEN_VALUE)
        if not TOKEN_VALUE:
            raise RuntimeError("GitHub returned an empty OIDC token.")
        return TOKEN_VALUE


def site_index() -> str:
    if not MANUALS.is_dir():
        raise RuntimeError("The manuals directory does not exist.")
    entries = []
    for folder in sorted((p for p in MANUALS.iterdir() if p.is_dir()), key=lambda p: p.name.lower()):
        files = sorted((p for p in folder.rglob("*") if p.is_file()), key=lambda p: p.as_posix().lower())
        if not files:
            continue
        html_files = [p for p in files if p.suffix.lower() in {".html", ".htm"}]
        preferred = next((p for p in html_files if p.name.lower() in {"index.html", "index.htm"}), None)
        target = preferred or (html_files[0] if html_files else files[0])
        relative = target.relative_to(ROOT).as_posix()
        href = urllib.parse.quote(relative, safe="/")
        label = folder.name.replace("-", " ").replace("_", " ").title()
        entries.append(
            f'<li><a href="/{html.escape(href, quote=True)}">{html.escape(label)}</a>'
            f'<span>{len(files):,} files</span></li>'
        )
    if not entries:
        raise RuntimeError("No extracted manual folders were found.")
    return """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>MotorNote · Private Manual Library</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#08111f;color:#e8f0fb}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 50% -15%,#17345a 0,transparent 55%),#08111f}
main{width:min(760px,calc(100% - 32px));margin:0 auto;padding:56px 0}
.eyebrow{color:#64b5ff;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
h1{font-size:clamp(32px,7vw,52px);line-height:1.02;margin:12px 0}
p{color:#9fb1c9;line-height:1.6}
ul{list-style:none;padding:0;margin:32px 0;display:grid;gap:12px}
li{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px;border:1px solid #263c59;border-radius:14px;background:#0e1c2e}
a{color:#e8f4ff;text-decoration:none;font-weight:700}a:hover{color:#64b5ff}
li span{color:#8296b1;font-size:12px;white-space:nowrap}
footer{border-top:1px solid #263c59;padding-top:18px;color:#6e829e;font-size:12px}
</style></head>
<body><main><div class="eyebrow">MotorNote / Technical Reference</div>
<h1>Private Manual Library</h1>
<p>Select a factory manual. Navigation, diagrams, and local page assets are served from the private library.</p>
<ul>""" + "".join(entries) + """</ul>
<footer>Authenticated access · Private service-manual corpus</footer>
</main></body></html>"""


def content_type(path: Path) -> str:
    guessed, _ = mimetypes.guess_type(path.name)
    if path.suffix.lower() in {".html", ".htm"}:
        return "text/html; charset=utf-8"
    if path.suffix.lower() in {".js", ".mjs"}:
        return "text/javascript; charset=utf-8"
    if path.suffix.lower() == ".css":
        return "text/css; charset=utf-8"
    if path.suffix.lower() in {".json", ".jsonl"}:
        return "application/json; charset=utf-8"
    if path.suffix.lower() in {".txt", ".md"}:
        return "text/plain; charset=utf-8"
    return guessed or "application/octet-stream"


def upload_one(path: Path) -> tuple[bool, str]:
    key = path.relative_to(ROOT).as_posix()
    url = PUBLISH_URL + "/_publish/" + urllib.parse.quote(key, safe="/")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    for attempt in range(4):
        request = urllib.request.Request(
            url,
            data=path.read_bytes(),
            headers={
                "Authorization": f"Bearer {oidc_token()}",
                "Content-Type": content_type(path),
                "X-Content-SHA256": digest,
            },
            method="PUT",
        )
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return True, key
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:300]
            if error.code == 401:
                global TOKEN_EXPIRY
                TOKEN_EXPIRY = 0
                if attempt < 3:
                    continue
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                return False, f"{key}: HTTP {error.code}: {detail}"
            time.sleep(2 ** attempt)
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            if attempt == 3:
                return False, f"{key}: {error}"
            time.sleep(2 ** attempt)
    return False, f"{key}: upload failed"


def publish_manifest(keys: list[str]) -> None:
    body = json.dumps({"keys": keys}, separators=(",", ":")).encode("utf-8")
    for attempt in range(4):
        request = urllib.request.Request(
            PUBLISH_URL + "/_publish/manifest",
            data=body,
            headers={"Authorization": f"Bearer {oidc_token()}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                result = json.load(response)
                print(f"R2 manifest reconciled: {result.get('files')} files; removed {result.get('stale_objects_deleted', 0)} stale objects.")
                return
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:500]
            if error.code == 401:
                global TOKEN_EXPIRY
                TOKEN_EXPIRY = 0
                if attempt < 3:
                    continue
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise RuntimeError(f"Manifest reconciliation failed: HTTP {error.code}: {detail}") from error
            time.sleep(2 ** attempt)


def main() -> int:
    if not PUBLISH_URL.startswith("https://"):
        print("MOTORNOTE_PUBLISH_URL must be an HTTPS publisher Worker URL.", file=sys.stderr)
        return 2
    if not TOKEN_URL or not TOKEN_REQUEST_SECRET:
        print("GitHub OIDC environment is missing; grant id-token: write to the job.", file=sys.stderr)
        return 2

    generated = ROOT / "index.html"
    generated.write_text(site_index(), encoding="utf-8")
    paths = []
    for base in (MANUALS, INDEX):
        if base.is_dir():
            for path in base.rglob("*"):
                if not path.is_file():
                    continue
                relative_parts = path.relative_to(ROOT).parts
                if any(part.startswith(".") or part == "__MACOSX" for part in relative_parts):
                    continue
                paths.append(path)
    paths.append(generated)
    paths = sorted(set(paths), key=lambda p: p.relative_to(ROOT).as_posix().lower())
    keys = [path.relative_to(ROOT).as_posix() for path in paths]
    print(f"Publishing {len(paths):,} files ({sum(p.stat().st_size for p in paths) / (1024 * 1024):,.1f} MiB) to the private MotorNote site.")

    succeeded = failed = 0
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(upload_one, path) for path in paths]
        for completed, future in enumerate(concurrent.futures.as_completed(futures), 1):
            ok, result = future.result()
            if ok:
                succeeded += 1
            else:
                failed += 1
                failures.append(result)
                print(result, file=sys.stderr)
            if completed % 250 == 0 or completed == len(futures):
                print(f"Progress {completed:,}/{len(futures):,} · uploaded={succeeded:,} · failed={failed:,}")

    if failed:
        print(f"Publishing stopped: {failed} file(s) failed; existing site manifest was not changed.", file=sys.stderr)
        return 1
    publish_manifest(keys)
    print(f"Private MotorNote site published successfully: {succeeded:,} files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
