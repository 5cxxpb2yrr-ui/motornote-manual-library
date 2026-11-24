#!/usr/bin/env python3
"""Safely ingest Subaru/Scion ZIPs and rebuild a persistent search catalog.

Archives belong in incoming/ and must start with subaru- or scion-.
Existing manuals remain in place when another archive is ingested.
"""
from __future__ import annotations

import hashlib
from html import unescape
from html.parser import HTMLParser

import json
import re
import shutil
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
INCOMING = ROOT / "incoming"
MANUALS = ROOT / "manuals"
INDEX = ROOT / "index"
MAX_FILES = 100_000
MAX_TOTAL_BYTES = 20 * 1024**3
MAX_MEMBER_BYTES = 2 * 1024**3
CHUNK = 1024 * 1024
SKIP_PARTS = {"__MACOSX", ".DS_Store"}
INDEX_NAMES = ("catalog.json", "pages.jsonl", "summary.json")


def slugify(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")[:80] or "manual"


def archive_identity(path: Path) -> tuple[str, str]:
    stem = path.stem.lower()
    for make in ("subaru", "scion"):
        if stem == make or stem.startswith(make + "-") or stem.startswith(make + "_"):
            return make, slugify(path.stem)
    raise ValueError(
        f"{path.name}: name must begin with 'subaru-' or 'scion-' "
        "so it is assigned to the correct make."
    )


def safe_member_path(name: str) -> PurePosixPath:
    normalized = name.replace("\\", "/")
    p = PurePosixPath(normalized)
    if p.is_absolute() or not p.parts or any(part in ("", ".", "..") for part in p.parts):
        raise ValueError(f"Unsafe archive path: {name!r}")
    if any(part in SKIP_PARTS for part in p.parts) or ":" in p.parts[0]:
        raise ValueError(f"Unsafe or metadata archive path: {name!r}")
    return p


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(CHUNK), b""):
            digest.update(block)
    return digest.hexdigest()


class ManualHTMLCleaner(HTMLParser):
    """Remove mirror chrome while preserving manual content and navigation."""

    REMOVED_CLASSES = {"branding", "other-announcement", "footer"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.output: list[str] = []
        self.skip_depth = 0
        self.span_depth = 0
        self.drop_link_depth = 0

    @staticmethod
    def classes(attrs: list[tuple[str, str | None]]) -> set[str]:
        value = next((v for k, v in attrs if k.lower() == "class"), "") or ""
        return set(value.split())

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        raw = self.get_starttag_text()
        if self.skip_depth:
            if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
                self.skip_depth += 1
            return

        classes = self.classes(attrs)
        # Keep the mirror's breadcrumb/header container: it contains the
        # manual's actual Home -> Make -> Year -> Model and chapter navigation.
        # Publisher-owned Phoenix styling replaces the archive presentation,
        # so retaining this markup does not import the archive's visual theme.
        if classes & self.REMOVED_CLASSES:
            self.skip_depth = 1
            return

        attr_map = {k.lower(): v for k, v in attrs}
        href = (attr_map.get("href") or "").strip().lower()
        is_breadcrumb = "breadcrumb-part" in classes

        if tag.lower() == "a" and is_breadcrumb and href.endswith("404.html"):
            span_tag = re.sub(
                r"""\s+href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)""",
                "",
                raw,
                count=1,
                flags=re.IGNORECASE,
            )
            self.output.append(re.sub(r"^<a\b", "<span", span_tag, count=1, flags=re.IGNORECASE))
            self.span_depth += 1
            return

        if tag.lower() == "a" and href.endswith("404.html"):
            self.drop_link_depth = 1
            return

        self.output.append(raw)

    def handle_endtag(self, tag: str) -> None:
        if self.skip_depth:
            if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
                self.skip_depth -= 1
            return
        if self.drop_link_depth:
            if tag.lower() == "a":
                self.drop_link_depth = 0
            return
        if self.span_depth and tag.lower() == "a":
            self.output.append("</span>")
            self.span_depth -= 1
            return
        self.output.append(f"</{tag}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if not self.skip_depth:
            self.output.append(self.get_starttag_text())

    def handle_data(self, data: str) -> None:
        if not self.skip_depth and not self.drop_link_depth:
            self.output.append(data)

    def handle_entityref(self, name: str) -> None:
        if not self.skip_depth and not self.drop_link_depth:
            self.output.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if not self.skip_depth and not self.drop_link_depth:
            self.output.append(f"&#{name};")

    def handle_comment(self, data: str) -> None:
        if not self.skip_depth and not self.drop_link_depth:
            self.output.append(f"<!--{data}-->")

    def handle_decl(self, decl: str) -> None:
        if not self.skip_depth:
            self.output.append(f"<!{decl}>")

    def unknown_decl(self, data: str) -> None:
        if not self.skip_depth:
            self.output.append(f"<![{data}]>")


def clean_manual_html(path: Path) -> bool:
    """Strip third-party mirror chrome without changing manual assets or scripts."""
    try:
        source = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return False

    parser = ManualHTMLCleaner()
    parser.feed(source)
    parser.close()
    cleaned = "".join(parser.output)
    # Remove mirror attribution retained in document titles and discard list
    # wrappers left empty after dead mirror-only links are removed.
    cleaned = re.sub(r"\s*~\s*Dogeware Lemon Mirror", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"<li\b[^>]*>\s*</li>", "", cleaned, flags=re.IGNORECASE)
    # Mirror HTML often omits closing </li> tags. Remove the orphaned download
    # icon whether or not its list item has an explicit closing tag.
    cleaned = re.sub(
        r"""<li\b[^>]*>\s*<img\b(?=[^>]*\bsrc\s*=\s*['"][^'"]*download\.svg)[^>]*>\s*(?:</li>)?""",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    # Browsers implicitly close an empty final list item immediately before </ul>.
    cleaned = re.sub(r"<li\b[^>]*>\s*(?=</ul>)", "", cleaned, flags=re.IGNORECASE)
    if cleaned == source:
        return False

    temp = path.with_name(path.name + ".cleaning")
    temp.write_text(cleaned, encoding="utf-8")
    temp.replace(path)
    return True


def wrap_flat_archive_in_vehicle_folder(staging: Path) -> str | None:
    """Place flat ZIP contents under the vehicle folder named by its root index.

    Some archives already contain a vehicle directory; those are left untouched.
    Flat archives with a root index.html are wrapped so R2 keeps the same
    manuals/<manual-id>/<vehicle>/... layout used by the viewer.
    """
    root_index = staging / "index.html"
    if not root_index.is_file():
        return None

    if any(
        child.is_dir() and any((child / name).is_file() for name in ("index.html", "index.htm"))
        for child in staging.iterdir()
    ):
        return None

    try:
        source = root_index.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ValueError(f"Cannot read root manual index {root_index}: {exc}") from exc

    title_match = re.search(r"<title\b[^>]*>([\s\S]*?)</title\s*>", source, flags=re.IGNORECASE)
    if not title_match:
        raise ValueError("Flat manual archive has index.html but no title identifying its vehicle.")

    title = unescape(re.sub(r"<[^>]+>", " ", title_match.group(1)))
    title = re.sub(r"\s+", " ", title).strip()
    vehicle_match = re.search(
        r"\bfor\s+(?:the\s+)?(.+?)(?:\s*[~|–—]\s*|$)",
        title,
        flags=re.IGNORECASE,
    )
    if not vehicle_match:
        raise ValueError(f"Cannot infer the vehicle folder from manual title: {title!r}")

    vehicle_folder = re.sub(r"\s+", " ", vehicle_match.group(1)).strip()
    if (
        not re.match(r"^\d{4}\s+", vehicle_folder)
        or not re.search(r"\b(?:Scion|Subaru)\b", vehicle_folder, flags=re.IGNORECASE)
        or len(PurePosixPath(vehicle_folder).parts) != 1
        or vehicle_folder in {"", ".", ".."}
    ):
        raise ValueError(f"Unsafe or unrecognized vehicle folder inferred from title: {vehicle_folder!r}")

    destination = staging / vehicle_folder
    if destination.exists():
        raise ValueError(f"Vehicle folder already exists in flat archive: {vehicle_folder!r}")

    destination.mkdir()
    for child in list(staging.iterdir()):
        if child == destination:
            continue
        shutil.move(str(child), str(destination / child.name))

    print(f"Wrapped flat manual archive under vehicle folder: {vehicle_folder}")
    return vehicle_folder


def extract_to_staging(archive: Path, staging: Path) -> list[Path]:
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    extracted: list[Path] = []
    total = 0

    with zipfile.ZipFile(archive) as zf:
        members = [m for m in zf.infolist() if not m.is_dir()]
        if len(members) > MAX_FILES:
            raise ValueError(f"{archive.name}: too many files ({len(members)}).")
        seen: set[str] = set()
        metadata_skipped = 0

        for member in members:
            raw_parts = PurePosixPath(member.filename.replace("\\", "/")).parts
            if any(part in SKIP_PARTS for part in raw_parts):
                metadata_skipped += 1
                continue
            rel = safe_member_path(member.filename)
            key = str(rel).casefold()
            if key in seen:
                raise ValueError(f"{archive.name}: duplicate path {member.filename!r}.")
            seen.add(key)

            mode = (member.external_attr >> 16) & 0xFFFF
            kind = mode & 0o170000
            if kind not in (0, 0o100000):
                raise ValueError(f"{archive.name}: unsupported link/special file {member.filename!r}.")
            if member.file_size > MAX_MEMBER_BYTES:
                raise ValueError(f"{archive.name}: member too large: {member.filename!r}.")
            total += member.file_size
            if total > MAX_TOTAL_BYTES:
                raise ValueError(f"{archive.name}: expanded archive exceeds 20 GiB limit.")
            if member.file_size and member.compress_size == 0:
                raise ValueError(f"{archive.name}: invalid compressed size for {member.filename!r}.")
            if member.compress_size and member.file_size / member.compress_size > 1000:
                raise ValueError(f"{archive.name}: suspicious compression ratio: {member.filename!r}.")

            target = staging.joinpath(*rel.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            written = 0
            with zf.open(member, "r") as src, target.open("wb") as dst:
                while True:
                    block = src.read(CHUNK)
                    if not block:
                        break
                    written += len(block)
                    if written > member.file_size or written > MAX_MEMBER_BYTES:
                        raise ValueError(f"Unexpected expanded size: {member.filename!r}.")
                    dst.write(block)
            if written != member.file_size:
                raise ValueError(f"Truncated archive member: {member.filename!r}.")
            extracted.append(target)

    if metadata_skipped:
        print(f"{archive.name}: skipped {metadata_skipped:,} macOS/archive metadata file(s).")

    # Flat archives (such as the replacement Scion xB Standard ZIP) have
    # pages/, images/, and index.html at their root. Wrap those files under the
    # vehicle folder identified by index.html before cataloging or publishing.
    wrap_flat_archive_in_vehicle_folder(staging)
    extracted = [path for path in staging.rglob("*") if path.is_file()]

    # Clean mirror chrome in HTML while the archive is still staged. The original
    # archive remains untouched if extraction or cleanup fails.
    cleaned_html = 0
    for html_path in extracted:
        if html_path.suffix.lower() in {".html", ".htm"}:
            cleaned_html += int(clean_manual_html(html_path))
    if cleaned_html:
        print(f"{archive.name}: cleaned mirror branding/navigation in {cleaned_html} HTML files.")

    return extracted


def extract_pdf_pages(path: Path, manual_id: str) -> list[dict]:
    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError("PyMuPDF is required to build the PDF page index.") from exc

    records = []
    with fitz.open(path) as doc:
        for page_no, page in enumerate(doc, start=1):
            text = page.get_text("text", sort=True).strip()
            if text:
                records.append({
                    "manual": manual_id,
                    "file": path.relative_to(ROOT).as_posix(),
                    "page": page_no,
                    "text": re.sub(r"\s+", " ", text),
                })
    return records


def load_previous_catalog() -> dict[str, dict]:
    path = INDEX / "catalog.json"
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {item["id"]: item for item in data.get("manuals", []) if "id" in item}
    except (OSError, ValueError, TypeError) as exc:
        raise RuntimeError(f"Cannot read existing catalog safely: {exc}") from exc


def build_catalog(previous: dict[str, dict], replacements: dict[str, tuple[str, str]]) -> tuple[list[dict], list[dict]]:
    catalog = []
    pages = []

    for manual_root in sorted(p for p in MANUALS.iterdir() if p.is_dir() and not p.name.startswith(".")):
        old = previous.get(manual_root.name, {})
        make, source_archive = replacements.get(
            manual_root.name,
            (old.get("make", "unknown"), old.get("source_archive", "")),
        )
        files = []
        for path in sorted(p for p in manual_root.rglob("*") if p.is_file()):
            stat = path.stat()
            files.append({
                "path": path.relative_to(ROOT).as_posix(),
                "name": path.name,
                "extension": path.suffix.lower(),
                "bytes": stat.st_size,
                "sha256": sha256_file(path),
            })
            if path.suffix.lower() == ".pdf":
                pages.extend(extract_pdf_pages(path, manual_root.name))

        catalog.append({
            "id": manual_root.name,
            "make": make,
            "source_archive": source_archive,
            "file_count": len(files),
            "files": files,
        })

    return catalog, pages


def write_indexes(catalog: list[dict], pages: list[dict], stamp: str) -> None:
    INDEX.mkdir(parents=True, exist_ok=True)
    summary = {
        "generated_at": stamp,
        "manual_count": len(catalog),
        "file_count": sum(item["file_count"] for item in catalog),
        "indexed_pdf_pages_with_text": len(pages),
        "manuals": [
            {"id": item["id"], "make": item["make"], "file_count": item["file_count"]}
            for item in catalog
        ],
    }
    outputs = {
        "catalog.json": json.dumps({"generated_at": stamp, "manuals": catalog}, indent=2) + "\n",
        "pages.jsonl": "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in pages),
        "summary.json": json.dumps(summary, indent=2) + "\n",
    }

    temp_paths = {}
    backups = {}
    try:
        for name, content in outputs.items():
            temp = INDEX / (name + ".tmp")
            temp.write_text(content, encoding="utf-8")
            temp_paths[name] = temp
            target = INDEX / name
            if target.exists():
                backup = INDEX / (name + ".bak")
                shutil.copy2(target, backup)
                backups[name] = backup
        for name, temp in temp_paths.items():
            temp.replace(INDEX / name)
    except Exception:
        for name, backup in backups.items():
            if backup.exists():
                backup.replace(INDEX / name)
        for name in outputs:
            target = INDEX / name
            if name not in backups and target.exists() and not temp_paths[name].exists():
                target.unlink()
        raise
    finally:
        for path in list(temp_paths.values()) + list(backups.values()):
            if path.exists():
                path.unlink()


def main() -> int:
    INCOMING.mkdir(exist_ok=True)
    MANUALS.mkdir(exist_ok=True)
    INDEX.mkdir(exist_ok=True)
    archives = sorted({
        *INCOMING.rglob("*.zip"),
        *INCOMING.rglob("*.ZIP"),
    })
    if not archives:
        if "--clean-existing" not in sys.argv:
            print("No ZIP archives found under incoming/.")
            return 0

        cleaned = 0
        for manual_root in sorted(p for p in MANUALS.iterdir() if p.is_dir() and not p.name.startswith(".")):
            for html_path in manual_root.rglob("*"):
                if html_path.is_file() and html_path.suffix.lower() in {".html", ".htm"}:
                    cleaned += int(clean_manual_html(html_path))

        previous = load_previous_catalog()
        catalog, pages = build_catalog(previous, {})
        stamp = datetime.now(timezone.utc).isoformat()
        write_indexes(catalog, pages, stamp)
        print(f"Cleaned {cleaned} existing HTML files and rebuilt the catalog.")
        return 0

    previous = load_previous_catalog()
    planned = []
    slugs = set()
    for archive in archives:
        make, slug = archive_identity(archive)
        if slug in slugs:
            raise ValueError(f"Multiple incoming archives target the same manual '{slug}'.")
        slugs.add(slug)
        planned.append((archive, make, slug))

    stamp = datetime.now(timezone.utc).isoformat()
    staged = {}
    replacements = {}
    backups = {}
    committed_dirs = []

    try:
        # Extract and validate every archive before replacing any existing manual.
        for archive, make, slug in planned:
            staging = MANUALS / (".staging-" + slug)
            extracted = extract_to_staging(archive, staging)
            staged[slug] = (archive, make, staging, extracted)
            replacements[slug] = (make, archive.name)

        # Swap directories, retaining rollback copies until indexes are written.
        for slug, (archive, make, staging, extracted) in staged.items():
            destination = MANUALS / slug
            backup = MANUALS / (".previous-" + slug)
            if backup.exists():
                shutil.rmtree(backup)
            if destination.exists():
                destination.rename(backup)
                backups[slug] = backup
            staging.rename(destination)
            committed_dirs.append(slug)

        catalog, pages = build_catalog(previous, replacements)
        write_indexes(catalog, pages, stamp)

        # Source archives are removed only after all extraction and indexing succeeds.
        for archive, _, _ in planned:
            archive.unlink()

        for backup in backups.values():
            if backup.exists():
                shutil.rmtree(backup)

        summary = {
            "generated_at": stamp,
            "manual_count": len(catalog),
            "file_count": sum(item["file_count"] for item in catalog),
            "indexed_pdf_pages_with_text": len(pages),
            "manuals": [
                {"id": item["id"], "make": item["make"], "file_count": item["file_count"]}
                for item in catalog
            ],
        }
        print(json.dumps(summary, indent=2))
        return 0

    except Exception:
        # Restore prior manual directories; incoming ZIPs remain available for retry.
        for slug in reversed(committed_dirs):
            destination = MANUALS / slug
            if destination.exists():
                shutil.rmtree(destination)
            backup = backups.get(slug)
            if backup and backup.exists():
                backup.rename(destination)
        for _, _, staging, _ in staged.values():
            if staging.exists():
                shutil.rmtree(staging)
        raise


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
