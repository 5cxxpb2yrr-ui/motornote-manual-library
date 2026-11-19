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
    """Apply the repository-owned Phoenix theme, never archive-provided CSS."""
    import re

    head_assets = (
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="theme-color" content="#050b18">'
        '<link rel="stylesheet" href="/assets/phoenix.css">'
    )
    script = '<script src="/assets/phoenix.js" defer></script>'
    count = 0

    def strip_stylesheet_tag(match: re.Match[str]) -> str:
        tag = match.group(0)
        rel = re.search(r"""\brel\s*=\s*(['"])(.*?)\1""", tag, flags=re.IGNORECASE)
        href = re.search(r"""\bhref\s*=\s*(['"])(.*?)\1""", tag, flags=re.IGNORECASE)
        rel_value = rel.group(2).lower() if rel else ""
        href_value = href.group(2).lower().split("?", 1)[0] if href else ""
        if "stylesheet" in rel_value.split() or href_value.endswith(".css"):
            return ""
        if href_value == "/assets/phoenix.css":
            return ""
        return tag

    for page in (stage / "manuals").rglob("*"):
        if not page.is_file() or page.suffix.lower() not in {".html", ".htm"}:
            continue
        try:
            source = page.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        # Strip every archive-provided stylesheet source: linked CSS, embedded
        # style blocks, and inline style attributes. Phoenix assets are the
        # single styling authority for both Scion and Subaru manual pages.
        source = re.sub(r"<style\b[^>]*>[\s\S]*?</style\s*>", "", source, flags=re.IGNORECASE)
        source = re.sub(r"<link\b[^>]*>", strip_stylesheet_tag, source, flags=re.IGNORECASE)
        source = re.sub(
            r"""\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)""",
            "",
            source,
            flags=re.IGNORECASE,
        )
        source = re.sub(
            r"""<script\b(?=[^>]*\bsrc\s*=\s*(['"])/assets/phoenix\.js\1)[^>]*>\s*</script\s*>""",
            "",
            source,
            flags=re.IGNORECASE,
        )

        if re.search(r"</head\s*>", source, flags=re.IGNORECASE):
            source = re.sub(r"</head\s*>", head_assets + "</head>", source, count=1, flags=re.IGNORECASE)
        else:
            source = head_assets + source
        if re.search(r"</body\s*>", source, flags=re.IGNORECASE):
            source = re.sub(r"</body\s*>", script + "</body>", source, count=1, flags=re.IGNORECASE)
        else:
            source += script
        page.write_text(source, encoding="utf-8")
        count += 1
    return count


def remove_manual_css_files(stage: Path) -> int:
    """Keep ZIP CSS in source control, but never publish or load it from R2."""
    removed = 0
    manuals_root = stage / "manuals"
    if not manuals_root.is_dir():
        return removed
    for path in manuals_root.rglob("*"):
        if path.is_file() and path.suffix.lower() == ".css":
            path.unlink()
            removed += 1
    return removed

def ensure_manual_landing_pages(stage: Path) -> int:
    """Create lightweight make landing pages only when a manual has no index."""
    created = 0
    for folder in (stage / "manuals").iterdir():
        if not folder.is_dir() or any((folder / name).is_file() for name in ("index.html", "index.htm")):
            continue
        pages = sorted(
            (p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in {".html", ".htm"}),
            key=lambda p: p.as_posix().lower(),
        )
        if not pages:
            continue
        preferred = next((p for p in pages if p.name.lower() in {"index.html", "index.htm"}), None)
        target = "/" + urllib.parse.quote((preferred or pages[0]).relative_to(stage).as_posix(), safe="/")
        label = folder.name.replace("-", " ").replace("_", " ").title()
        page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#050b18"><link rel="stylesheet" href="/assets/phoenix.css"><title>{html.escape(label)} · MotorNote</title></head>
<body><main class="mn-page-shell"><section class="mn-hero"><div class="mn-kicker">PHOENIX SYSTEMS · FACTORY REFERENCE</div>
<h1>{html.escape(label)}</h1><p>Open the factory manual or search across the indexed service information.</p>
<a class="mn-manual-card" href="{html.escape(target, quote=True)}"><span class="mn-make-icon" aria-hidden="true">▤</span><span><strong>Open manual</strong><small>Continue to the original chapter navigation</small></span><span class="mn-count">→</span></a></section></main>
<script src="/assets/phoenix.js" defer></script></body></html>"""
        (folder / "index.html").write_text(page, encoding="utf-8")
        created += 1
    return created

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
        assets = ROOT / "site-worker" / "assets"
        if assets.is_dir(): shutil.copytree(assets, stage / "assets", dirs_exist_ok=True)
        # Create an entry point for manuals whose source corpus has no index page.
        landing_pages = ensure_manual_landing_pages(stage)
        print(f"Created {landing_pages:,} make landing pages where needed.")
        decorated = decorate_manual_pages(stage)
        print(f"Applied the repository-owned Phoenix theme to {decorated:,} manual HTML pages.")
        removed_css = remove_manual_css_files(stage)
        print(f"Excluded {removed_css:,} archive-provided CSS file(s) from the published site.")
        # Validate the exact staged site before any object is uploaded to R2.
        subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "validate_html_cross_references.py"),
             str(stage), "--report", str(ROOT / "html-cross-reference-report.json")],
            check=True,
        )
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
