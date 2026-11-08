#!/usr/bin/env python3
"""Publish only changed MotorNote site objects to Cloudflare R2."""
from __future__ import annotations

import html
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANUALS = ROOT / "manuals"
BUCKET = os.environ.get("R2_BUCKET", "motornote-manual-site")
ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
ENDPOINT = f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com"
ASSETS = ROOT / "site-worker" / "assets"

def run(args: list[str]) -> None:
    subprocess.run(args, check=True)

def changed_paths() -> tuple[list[str], list[str]]:
    before = os.environ.get("GITHUB_EVENT_BEFORE", "")
    after = os.environ.get("GITHUB_SHA", "HEAD")
    if not before or set(before) == {"0"}:
        raise RuntimeError("This incremental publisher requires a normal push with a valid before SHA.")
    result = subprocess.run(
        ["git", "diff", "--name-status", "--find-renames", before, after],
        check=True, text=True, capture_output=True,
    )
    changed: list[str] = []
    deleted: list[str] = []
    for line in result.stdout.splitlines():
        fields = line.split("\t")
        status = fields[0]
        paths = fields[1:]
        if status.startswith("R") or status.startswith("C"):
            if len(paths) == 2:
                deleted.append(paths[0])
                changed.append(paths[1])
        elif status.startswith("D"):
            deleted.extend(paths)
        elif status.startswith(("A", "M", "T")):
            changed.extend(paths)
    return changed, deleted

def decorate_html(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    if "phoenix.css" in source:
        return
    assets = (
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="theme-color" content="#050b18">'
        '<link rel="stylesheet" href="/assets/phoenix.css">'
    )
    script = '<script src="/assets/phoenix.js" defer></script>'
    if re.search(r"</head\s*>", source, flags=re.I):
        source = re.sub(r"</head\s*>", assets + "</head>", source, count=1, flags=re.I)
    else:
        source = assets + source
    if re.search(r"</body\s*>", source, flags=re.I):
        source = re.sub(r"</body\s*>", script + "</body>", source, count=1, flags=re.I)
    else:
        source += script
    path.write_text(source, encoding="utf-8")

def make_folder_landing(folder: Path) -> Path | None:
    if any((folder / name).is_file() for name in ("index.html", "index.htm")):
        return None
    pages = sorted(
        (p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in {".html", ".htm"}),
        key=lambda p: p.as_posix().lower(),
    )
    if not pages:
        return None
    target = "/" + urllib.parse.quote(pages[0].relative_to(ROOT).as_posix(), safe="/")
    label = folder.name.replace("-", " ").replace("_", " ").title()
    content = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#050b18"><link rel="stylesheet" href="/assets/phoenix.css"><title>{html.escape(label)} · MotorNote</title></head>
<body><main class="mn-page-shell"><section class="mn-hero"><div class="mn-kicker">PHOENIX SYSTEMS · FACTORY REFERENCE</div>
<h1>{html.escape(label)}</h1><p>Open the factory manual or search across the indexed service information.</p>
<a class="mn-manual-card" href="{html.escape(target, quote=True)}"><span class="mn-make-icon" aria-hidden="true">▤</span><span><strong>Open manual</strong><small>Continue to the original chapter navigation</small></span><span class="mn-count">→</span></a></section></main>
<script src="/assets/phoenix.js" defer></script></body></html>"""
    landing = folder / "index.html"
    landing.write_text(content, encoding="utf-8")
    return landing

def main() -> int:
    if len(ACCOUNT_ID) != 32:
        raise RuntimeError("R2_ACCOUNT_ID must be the 32-character Cloudflare account ID.")
    if not os.environ.get("AWS_ACCESS_KEY_ID") or not os.environ.get("AWS_SECRET_ACCESS_KEY"):
        raise RuntimeError("Missing R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY GitHub Actions secrets.")
    changed, deleted = changed_paths()
    allowed = lambda p: p.startswith(("manuals/", "index/", "site-worker/assets/"))
    changed = [p for p in changed if allowed(p)]
    deleted = [p for p in deleted if allowed(p)]
    if not changed and not deleted:
        print("No publishable site files changed; nothing to upload.")
        return 0

    # Download Git LFS payloads only for changed manual/index files, never the whole corpus.
    lfs_paths = [p for p in changed if p.startswith(("manuals/", "index/"))]
    if lfs_paths:
        include = ",".join(lfs_paths)
        run(["git", "lfs", "pull", "--include", include, "--exclude", ""])

    from publish_manual_site import site_index

    with tempfile.TemporaryDirectory(prefix="motornote-delta-") as temp:
        stage = Path(temp)
        uploads: set[str] = set()
        manual_folders: set[Path] = set()
        manual_changed = False

        for relative in changed:
            source = ROOT / relative
            if not source.is_file():
                continue
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.read_bytes())
            if relative.startswith("manuals/"):
                manual_changed = True
                manual_folders.add(source.parent)
                if target.suffix.lower() in {".html", ".htm"}:
                    decorate_html(target)
            elif relative.startswith("index/"):
                pass
            elif relative.startswith("site-worker/assets/"):
                # R2 stores shared assets under /assets/, not /site-worker/assets/.
                relative_key = relative.removeprefix("site-worker/")
                uploads.add(relative_key)
                continue
            uploads.add(relative)

        for folder in sorted(manual_folders):
            landing = make_folder_landing(folder)
            if landing:
                rel = landing.relative_to(ROOT).as_posix()
                target = stage / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(landing.read_bytes())
                uploads.add(rel)

        for relative in deleted:
            # A deleted native landing page may need a generated replacement.
            if relative.startswith("manuals/"):
                manual_changed = True
                folder = (ROOT / relative).parent
                if folder.is_dir():
                    landing = make_folder_landing(folder)
                    if landing:
                        rel = landing.relative_to(ROOT).as_posix()
                        target = stage / rel
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(landing.read_bytes())
                        uploads.add(rel)

        if manual_changed:
            (stage / "index.html").write_text(site_index(), encoding="utf-8")
            uploads.add("index.html")

        # Delete removed objects first, then upload only the changed/re-generated keys.
        for relative in sorted(set(deleted)):
            key = relative.removeprefix("site-worker/")
            run(["aws", "s3", "rm", f"s3://{BUCKET}/{key}", "--endpoint-url", ENDPOINT])

        for key in sorted(uploads):
            source = stage / key
            if not source.is_file():
                continue
            run(["aws", "s3", "cp", str(source), f"s3://{BUCKET}/{key}",
                 "--endpoint-url", ENDPOINT, "--only-show-errors"])
        print(f"Incremental publish complete: {len(uploads)} object(s) uploaded, {len(set(deleted))} object(s) deleted.")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        print(f"Incremental R2 publish failed with exit code {error.returncode}.", file=sys.stderr)
        raise SystemExit(error.returncode)
    except Exception as error:
        print(f"Incremental R2 publish failed: {error}", file=sys.stderr)
        raise SystemExit(2)
