#!/usr/bin/env python3
"""Build and sync the private MotorNote manual site directly to Cloudflare R2."""
from __future__ import annotations
import html, os, shutil, subprocess, sys, tempfile, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANUALS = ROOT / "manuals"
INDEX = ROOT / "index"
BUCKET = os.environ.get("R2_BUCKET", "motornote-manual-site")
ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
ENDPOINT = f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com"

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
        href = "/" + urllib.parse.quote(target.relative_to(ROOT).as_posix(), safe="/")
        label = folder.name.replace("-", " ").replace("_", " ").title()
        icon = "◉" if "scion" in folder.name.lower() else "✦" if "subaru" in folder.name.lower() else "▤"
        entries.append(
            f'<a class="mn-manual-card" href="{html.escape(href, quote=True)}">'
            f'<span class="mn-make-icon" aria-hidden="true">{icon}</span>'
            f'<span><strong>{html.escape(label)}</strong><small>Factory service information · diagrams · procedures</small></span>'
            f'<span class="mn-count">{len(files):,} files</span></a>'
        )
    if not entries:
        raise RuntimeError("No extracted manual folders were found.")
    return """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#050b18"><meta name="robots" content="noindex,nofollow">
<meta name="description" content="Private MotorNote factory service manual library.">
<link rel="stylesheet" href="/assets/phoenix.css"><title>MotorNote · Phoenix Manual Library</title>
</head><body><main class="mn-page-shell">
<section class="mn-hero"><div class="mn-kicker">PHOENIX SYSTEMS · TECHNICAL REFERENCE</div>
<h1>Factory knowledge.<br>At your fingertips.</h1>
<p>Search across your factory manuals, open the exact procedure, and get straight to the diagram or specification you need.</p>
</section><section aria-label="Available factory manuals"><div class="mn-kicker">YOUR MANUAL LIBRARY</div>
<div class="mn-manual-grid">""" + "".join(entries) + """</div></section>
<footer style="margin:26px 4px 0;color:#7892b5;font-size:12px">Authenticated access · Private service-manual corpus · Drive · Diagnose · Repair</footer>
</main><script src="/assets/phoenix.js" defer></script></body></html>"""


def decorate_manual_pages(stage: Path) -> int:
    """Add the shared mobile shell without rewriting the original manual content."""
    import re
    head_assets = (
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="theme-color" content="#050b18">'
        '<link rel="stylesheet" href="/assets/phoenix.css">'
    )
    script = '<script src="/assets/phoenix.js" defer></script>'
    count = 0
    for page in (stage / "manuals").rglob("*"):
        if not page.is_file() or page.suffix.lower() not in {".html", ".htm"}:
            continue
        try:
            source = page.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if "phoenix.css" in source:
            continue
        if re.search(r"</head\s*>", source, flags=re.I):
            source = re.sub(r"</head\s*>", head_assets + "</head>", source, count=1, flags=re.I)
        else:
            source = head_assets + source
        if re.search(r"</body\s*>", source, flags=re.I):
            source = re.sub(r"</body\s*>", script + "</body>", source, count=1, flags=re.I)
        else:
            source += script
        page.write_text(source, encoding="utf-8")
        count += 1
    return count

def main() -> int:
    if len(ACCOUNT_ID) != 32:
        print("R2_ACCOUNT_ID must be the 32-character Cloudflare account ID.", file=sys.stderr); return 2
    if not os.environ.get("AWS_ACCESS_KEY_ID") or not os.environ.get("AWS_SECRET_ACCESS_KEY"):
        print("Missing R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY GitHub Actions secrets.", file=sys.stderr); return 2
    if not MANUALS.is_dir():
        print("No manuals directory found.", file=sys.stderr); return 2
    with tempfile.TemporaryDirectory(prefix="motornote-site-") as temp:
        stage = Path(temp) / "site"; stage.mkdir()
        shutil.copytree(MANUALS, stage / "manuals", dirs_exist_ok=True)
        if INDEX.is_dir(): shutil.copytree(INDEX, stage / "index", dirs_exist_ok=True)
        (stage / "index.html").write_text(site_index(), encoding="utf-8")
        files = [p for p in stage.rglob("*") if p.is_file()]
        count = len(files); total = sum(p.stat().st_size for p in files)
        print(f"Syncing {count:,} files ({total / (1024 * 1024):,.1f} MiB) directly to R2 bucket {BUCKET}.")
        subprocess.run(["aws","s3","sync",str(stage)+"/",f"s3://{BUCKET}/","--delete","--only-show-errors",
                        "--endpoint-url",ENDPOINT,"--no-progress"],check=True)
        print(f"Published {count:,} files to Cloudflare R2.")
    return 0

if __name__ == "__main__":
    try: raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        print(f"R2 sync failed with exit code {error.returncode}.", file=sys.stderr)
        raise SystemExit(error.returncode)
