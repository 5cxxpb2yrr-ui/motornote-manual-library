#!/usr/bin/env python3
"""Build and safely publish the private MotorNote manual site to Cloudflare R2.

The publisher owns only these R2 keys: index.html, manuals/**, index/**,
and assets/**. It never performs bucket-wide deletion. Hidden source paths
(including .previous-* backups) are excluded from builds and protected from
deletion. Manual ZIP stylesheets are never copied or applied; Phoenix assets
are the single visual styling authority.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path, PurePosixPath
from typing import Iterable

MANAGED_PREFIXES = ("manuals/", "index/")
MANAGED_ROOT_FILES = frozenset({"index.html"})
MANAGED_ASSET_KEYS = frozenset({"assets/phoenix.css", "assets/phoenix.js"})
ALLOWED_BUCKET = "motornote-manual-site"
PHOENIX_ASSETS = ("phoenix.css", "phoenix.js")


def hidden_path(relative: str | Path) -> bool:
    return any(part.startswith(".") for part in PurePosixPath(str(relative)).parts)


def safe_relative(relative: str | Path) -> bool:
    value = str(relative)
    if not value or "\\" in value or "\x00" in value:
        return False
    path = PurePosixPath(value)
    return not path.is_absolute() and all(part not in {"", ".", ".."} for part in path.parts)


def is_managed_key(key: str) -> bool:
    if not safe_relative(key) or hidden_path(key):
        return False
    return key in MANAGED_ROOT_FILES or key in MANAGED_ASSET_KEYS or key.startswith(MANAGED_PREFIXES)


def iter_source_files(root: Path, *, skip_css: bool = False) -> Iterable[Path]:
    if not root.exists():
        return
    for path in sorted(root.rglob("*"), key=lambda item: item.as_posix().lower()):
        relative = path.relative_to(root)
        if hidden_path(relative):
            continue
        if path.is_symlink():
            raise RuntimeError(f"Symlinks are not allowed in the publish source: {path}")
        if not path.is_file():
            continue
        if skip_css and path.suffix.lower() == ".css":
            continue
        if not safe_relative(relative.as_posix()):
            raise RuntimeError(f"Unsafe source path: {relative}")
        yield path


def copy_filtered_tree(source: Path, destination: Path, *, skip_css: bool = False) -> int:
    if not source.is_dir():
        return 0
    copied = 0
    for path in iter_source_files(source, skip_css=skip_css):
        target = destination / path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        # Fresh mtimes ensure a full rebuild refreshes existing R2 objects.
        shutil.copyfile(path, target)
        copied += 1
    return copied


def phoenix_head_assets() -> str:
    return (
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="theme-color" content="#050b18">'
        '<link rel="stylesheet" href="/assets/phoenix.css">'
    )


def decorate_html_page(path: Path) -> None:
    """Apply repository-owned Phoenix styling without changing manual navigation."""
    source = path.read_text(encoding="utf-8")

    def keep_non_stylesheet_link(match: re.Match[str]) -> str:
        tag = match.group(0)
        rel = re.search(r"""\brel\s*=\s*(['"])(.*?)\1""", tag, re.IGNORECASE)
        href = re.search(r"""\bhref\s*=\s*(['"])(.*?)\1""", tag, re.IGNORECASE)
        rel_value = rel.group(2).lower().split() if rel else []
        href_value = href.group(2).lower().split("?", 1)[0] if href else ""
        if "stylesheet" in rel_value or href_value.endswith(".css"):
            return ""
        return tag

    source = re.sub(r"<style\b[^>]*>[\s\S]*?</style\s*>", "", source, flags=re.IGNORECASE)
    source = re.sub(r"<link\b[^>]*>", keep_non_stylesheet_link, source, flags=re.IGNORECASE)
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

    head_assets = phoenix_head_assets()
    if re.search(r"</head\s*>", source, flags=re.IGNORECASE):
        source = re.sub(r"</head\s*>", head_assets + "</head>", source, count=1, flags=re.IGNORECASE)
    else:
        source = head_assets + source

    script = '<script src="/assets/phoenix.js" defer></script>'
    if re.search(r"</body\s*>", source, flags=re.IGNORECASE):
        source = re.sub(r"</body\s*>", script + "</body>", source, count=1, flags=re.IGNORECASE)
    else:
        source += script
    path.write_text(source, encoding="utf-8")


def manual_html_pages(folder: Path) -> list[Path]:
    return [
        path for path in iter_source_files(folder)
        if path.suffix.lower() in {".html", ".htm"}
    ]


def make_manual_landing(folder: Path, stage: Path) -> bool:
    if any((folder / name).is_file() for name in ("index.html", "index.htm")):
        return False
    pages = manual_html_pages(folder)
    if not pages:
        return False
    target = "/" + urllib.parse.quote(pages[0].relative_to(stage).as_posix(), safe="/")
    label = folder.name.replace("-", " ").replace("_", " ").title()
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">{phoenix_head_assets()}<title>{html.escape(label)} · MotorNote</title></head>
<body><main class="mn-page-shell"><section class="mn-hero"><div class="mn-kicker">PHOENIX SYSTEMS · FACTORY REFERENCE</div>
<h1>{html.escape(label)}</h1><p>Open the factory manual or search across the indexed service information.</p>
<a class="mn-manual-card" href="{html.escape(target, quote=True)}"><span class="mn-make-icon" aria-hidden="true">▤</span><span><strong>Open manual</strong><small>Continue to the original chapter navigation</small></span><span class="mn-count">→</span></a></section></main>
<script src="/assets/phoenix.js" defer></script></body></html>"""
    (folder / "index.html").write_text(page, encoding="utf-8")
    return True


def render_site_index(manuals_root: Path, stage: Path) -> str:
    entries: list[str] = []
    folders = sorted(
        (item for item in manuals_root.iterdir() if item.is_dir() and not item.name.startswith(".")),
        key=lambda item: item.name.lower(),
    )
    for folder in folders:
        files = list(iter_source_files(folder, skip_css=True))
        if not files:
            continue
        pages = [item for item in files if item.suffix.lower() in {".html", ".htm"}]
        preferred = next((item for item in pages if item.name.lower() in {"index.html", "index.htm"}), None)
        target = preferred or (pages[0] if pages else files[0])
        href = "/" + urllib.parse.quote(target.relative_to(stage).as_posix(), safe="/")
        label = folder.name.replace("-", " ").replace("_", " ").title()
        icon = "◉" if "scion" in folder.name.lower() else "✦" if "subaru" in folder.name.lower() else "▤"
        entries.append(
            f'<a class="mn-manual-card" href="{html.escape(href, quote=True)}">'
            f'<span class="mn-make-icon" aria-hidden="true">{icon}</span>'
            f'<span><strong>{html.escape(label)}</strong><small>Factory service information · diagrams · procedures</small></span>'
            f'<span class="mn-count">{len(files):,} files</span></a>'
        )
    if not entries:
        raise RuntimeError("No visible extracted manual folders were found.")
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


def build_site(root: Path, stage: Path, *, validate: bool = True) -> dict:
    manuals_source = root / "manuals"
    if not manuals_source.is_dir():
        raise RuntimeError("The manuals directory does not exist.")
    visible_manuals = [
        item for item in manuals_source.iterdir()
        if item.is_dir() and not item.name.startswith(".")
    ]
    if not visible_manuals:
        raise RuntimeError("No visible manual folders were found.")

    stage.mkdir(parents=True, exist_ok=True)
    copied_manuals = copy_filtered_tree(manuals_source, stage / "manuals", skip_css=True)
    index_source = root / "index"
    if not index_source.is_dir() or not (index_source / "catalog.json").is_file():
        raise RuntimeError("index/catalog.json is required; refusing to publish a site without its manual catalog.")
    if not any(iter_source_files(index_source)):
        raise RuntimeError("The index directory contains no visible publishable files.")
    copy_filtered_tree(index_source, stage / "index")

    assets_source = root / "site-worker" / "assets"
    for name in PHOENIX_ASSETS:
        source = assets_source / name
        if not source.is_file():
            raise RuntimeError(f"Required repository-owned Phoenix asset is missing: {name}")
        target = stage / "assets" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)

    generated = 0
    for folder in sorted((stage / "manuals").iterdir(), key=lambda item: item.name.lower()):
        if folder.is_dir() and not folder.name.startswith("."):
            generated += int(make_manual_landing(folder, stage))

    decorated = 0
    for folder in sorted((stage / "manuals").iterdir(), key=lambda item: item.name.lower()):
        if not folder.is_dir() or folder.name.startswith("."):
            continue
        for page in manual_html_pages(folder):
            decorate_html_page(page)
            decorated += 1

    (stage / "index.html").write_text(
        render_site_index(stage / "manuals", stage),
        encoding="utf-8",
    )

    if validate:
        validator = root / "scripts" / "validate_html_cross_references.py"
        if not validator.is_file():
            raise RuntimeError("scripts/validate_html_cross_references.py is required for publication.")
        report = stage.parent / "html-cross-reference-report.json"
        subprocess.run(
            [sys.executable, str(validator), str(stage), "--report", str(report), "--duplicate-id-policy", "warn", "--missing-reference-policy", "warn"],
            check=True,
        )

    files = sorted(
        path.relative_to(stage).as_posix()
        for path in stage.rglob("*")
        if path.is_file() and not hidden_path(path.relative_to(stage))
    )
    for key in files:
        if not is_managed_key(key):
            raise RuntimeError(f"Build produced an object outside the managed R2 scope: {key}")
    total_bytes = sum((stage / key).stat().st_size for key in files)
    return {
        "files": files,
        "file_count": len(files),
        "total_bytes": total_bytes,
        "manual_source_files_copied": copied_manuals,
        "generated_manual_landing_pages": generated,
        "decorated_manual_html_pages": decorated,
    }


def aws(args: list[str], *, capture: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(["aws", *args], check=True, text=True, capture_output=capture)


def list_remote_keys(bucket: str, endpoint: str) -> set[str]:
    keys: set[str] = set()
    for prefix in (*MANAGED_PREFIXES, *sorted(MANAGED_ASSET_KEYS), "index.html"):
        result = aws(
            [
                "s3api", "list-objects-v2",
                "--bucket", bucket,
                "--prefix", prefix,
                "--endpoint-url", endpoint,
                "--output", "json",
            ],
            capture=True,
        )
        payload = json.loads(result.stdout or "{}")
        for item in payload.get("Contents") or []:
            key = item.get("Key")
            if isinstance(key, str) and is_managed_key(key):
                keys.add(key)
    return keys


def plan_deletions(local_keys: set[str], remote_keys: set[str]) -> list[str]:
    """Return stale visible managed keys; hidden backup keys are never deleted."""
    return sorted(key for key in remote_keys if is_managed_key(key) and key not in local_keys)


def delete_stale_objects(bucket: str, endpoint: str, stale: list[str]) -> int:
    deleted = 0
    for offset in range(0, len(stale), 1000):
        batch = stale[offset:offset + 1000]
        response = aws(
            [
                "s3api", "delete-objects",
                "--bucket", bucket,
                "--delete", json.dumps(
                    {"Objects": [{"Key": key} for key in batch], "Quiet": True},
                    separators=(",", ":"),
                ),
                "--endpoint-url", endpoint,
                "--output", "json",
            ],
            capture=True,
        )
        payload = json.loads(response.stdout or "{}")
        errors = payload.get("Errors") or []
        if errors:
            raise RuntimeError(f"R2 reported deletion errors: {json.dumps(errors[:10])}")
        deleted += len(batch)
    return deleted


def publish_site(stage: Path, manifest: dict, env: dict[str, str]) -> tuple[int, int]:
    account_id = env.get("R2_ACCOUNT_ID", "")
    bucket = env.get("R2_BUCKET", ALLOWED_BUCKET)
    if not re.fullmatch(r"[0-9a-fA-F]{32}", account_id):
        raise RuntimeError("R2_ACCOUNT_ID must be the 32-character Cloudflare account ID.")
    if bucket != ALLOWED_BUCKET:
        raise RuntimeError(f"Refusing to publish to unexpected bucket {bucket!r}. Expected {ALLOWED_BUCKET!r}.")
    if not env.get("AWS_ACCESS_KEY_ID") or not env.get("AWS_SECRET_ACCESS_KEY"):
        raise RuntimeError("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY credentials are required.")
    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"

    # Upload first, without --delete. A failed upload can never trigger cleanup.
    for directory in ("manuals", "index", "assets"):
        source = stage / directory
        if source.is_dir():
            aws(
                [
                    "s3", "cp", str(source), f"s3://{bucket}/{directory}/",
                    "--recursive", "--only-show-errors", "--no-progress",
                    "--endpoint-url", endpoint,
                ]
            )
    aws(
        [
            "s3", "cp", str(stage / "index.html"), f"s3://{bucket}/index.html",
            "--only-show-errors", "--endpoint-url", endpoint,
        ]
    )

    local_keys = set(manifest["files"])
    remote_keys = list_remote_keys(bucket, endpoint)
    stale = plan_deletions(local_keys, remote_keys)
    deleted = delete_stale_objects(bucket, endpoint, stale)
    return len(local_keys), deleted


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("dry-run", "publish"), default="dry-run")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root.resolve()

    try:
        with tempfile.TemporaryDirectory(prefix="motornote-manual-site-") as temporary:
            stage = Path(temporary) / "site"
            manifest = build_site(root, stage, validate=True)
            print(
                "MotorNote site build passed: "
                f"{manifest['file_count']:,} files, "
                f"{manifest['total_bytes'] / (1024 * 1024):,.1f} MiB, "
                f"{manifest['decorated_manual_html_pages']:,} HTML pages decorated, "
                f"{manifest['generated_manual_landing_pages']:,} landing pages generated."
            )
            print("R2 ownership: index.html, manuals/**, index/**, assets/**")
            print("Hidden paths and archive CSS excluded; Phoenix assets are repository-owned.")
            if args.mode == "dry-run":
                print("Dry run only. No R2 credentials were read and no remote objects were changed.")
                return 0
            uploaded, deleted = publish_site(stage, manifest, dict(os.environ))
            print(f"R2 publish complete: {uploaded:,} objects uploaded; {deleted:,} stale visible objects deleted.")
            print("Hidden backup objects and all objects outside the managed roots were left untouched.")
            return 0
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
