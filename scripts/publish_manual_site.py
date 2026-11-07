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
        entries.append(f'<li><a href="{html.escape(href, quote=True)}">{html.escape(label)}</a><span>{len(files):,} files</span></li>')
    if not entries:
        raise RuntimeError("No extracted manual folders were found.")
    return """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>MotorNote · Private Manual Library</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#08111f;color:#e8f0fb}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 50% -15%,#17345a 0,transparent 55%),#08111f}
main{width:min(760px,calc(100% - 32px));margin:0 auto;padding:56px 0}.eyebrow{color:#64b5ff;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
h1{font-size:clamp(32px,7vw,52px);line-height:1.02;margin:12px 0}p{color:#9fb1c9;line-height:1.6}
ul{list-style:none;padding:0;margin:32px 0;display:grid;gap:12px}li{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px;border:1px solid #263c59;border-radius:14px;background:#0e1c2e}
a{color:#e8f4ff;text-decoration:none;font-weight:700}a:hover{color:#64b5ff}li span{color:#8296b1;font-size:12px;white-space:nowrap}
footer{border-top:1px solid #263c59;padding-top:18px;color:#6e829e;font-size:12px}
</style></head><body><main><div class="eyebrow">MotorNote / Technical Reference</div><h1>Private Manual Library</h1>
<p>Select a factory manual. Navigation, diagrams, and local page assets are served from the private library.</p><ul>""" + "".join(entries) + """</ul>
<footer>Authenticated access · Private service-manual corpus</footer></main></body></html>"""

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
