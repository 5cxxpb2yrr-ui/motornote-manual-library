#!/usr/bin/env python3
"""Safely extract uploaded service-manual ZIPs and build a page-level search index.

Drop ZIPs into incoming/ and push to main. Archive names should begin with
"subaru-" or "scion-" (for example, subaru-service-manual.zip).
"""
from __future__ import annotations

import hashlib
import json
import os
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
TEXT_EXTENSIONS = {".txt", ".html", ".htm", ".xml", ".csv", ".md"}
SKIP_PARTS = {"__MACOSX", ".DS_Store"}


def slugify(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return value[:80] or "manual"


def archive_identity(path: Path) -> tuple[str, str]:
    stem = path.stem.lower()
    for make in ("subaru", "scion"):
        if stem == make or stem.startswith(make + "-") or stem.startswith(make + "_"):
            return make, slugify(path.stem)
    raise ValueError(
        f"{path.name}: name must begin with 'subaru-' or 'scion-' "
        "so the archive is assigned to the correct make."
    )


def safe_member_path(name: str) -> PurePosixPath:
    normalized = name.replace("\\", "/")
    p = PurePosixPath(normalized)
    if p.is_absolute() or not p.parts or any(part in ("", ".", "..") for part in p.parts):
        raise ValueError(f"Unsafe archive path: {name!r}")
    if any(part in SKIP_PARTS for part in p.parts):
        raise ValueError(f"Skipped metadata path: {name!r}")
    if ":" in p.parts[0]:
        raise ValueError(f"Unsafe archive path: {name!r}")
    return p


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(CHUNK), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_archive(archive: Path) -> tuple[str, Path, list[Path]]:
    make, slug = archive_identity(archive)
    destination = MANUALS / slug
    staging = MANUALS / (".staging-" + slug)
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True, exist_ok=True)

    extracted: list[Path] = []
    total = 0
    try:
        with zipfile.ZipFile(archive) as zf:
            members = [m for m in zf.infolist() if not m.is_dir()]
            if len(members) > MAX_FILES:
                raise ValueError(f"{archive.name}: too many files ({len(members)}).")
            seen: set[str] = set()
            for member in members:
                rel = safe_member_path(member.filename)
                key = str(rel).casefold()
                if key in seen:
                    raise ValueError(f"{archive.name}: duplicate path {member.filename!r}.")
                seen.add(key)

                # Reject symlinks and other non-regular Unix file types.
                mode = (member.external_attr >> 16) & 0xFFFF
                kind = mode & 0o170000
                if kind not in (0, 0o100000):
                    raise ValueError(f"{archive.name}: unsupported link/special file {member.filename!r}.")
                if member.file_size > MAX_MEMBER_BYTES:
                    raise ValueError(f"{archive.name}: member too large: {member.filename!r}.")
                total += member.file_size
                if total > MAX_TOTAL_BYTES:
                    raise ValueError(f"{archive.name}: expanded archive exceeds 20 GiB safety limit.")
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

        # Replace a previous extraction atomically at the directory level.
        backup = MANUALS / (".previous-" + slug)
        if backup.exists():
            shutil.rmtree(backup)
        if destination.exists():
            destination.rename(backup)
        staging.rename(destination)
        if backup.exists():
            shutil.rmtree(backup)
        final_files = [destination / p.relative_to(staging) for p in extracted]
        return make, destination, final_files
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise


def extract_pdf_pages(path: Path, manual_root: Path) -> list[dict]:
    try:
        import fitz
    except ImportError:
        return []
    records = []
    try:
        with fitz.open(path) as doc:
            for page_no, page in enumerate(doc, start=1):
                text = page.get_text("text", sort=True).strip()
                if text:
                    records.append({
                        "manual": manual_root.name,
                        "file": path.relative_to(ROOT).as_posix(),
                        "page": page_no,
                        "text": re.sub(r"\s+", " ", text),
                    })
    except Exception as exc:
        print(f"WARNING: could not extract text from {path}: {exc}", file=sys.stderr)
    return records


def main() -> int:
    INCOMING.mkdir(exist_ok=True)
    MANUALS.mkdir(exist_ok=True)
    INDEX.mkdir(exist_ok=True)
    archives = sorted(INCOMING.rglob("*.zip")) + sorted(INCOMING.rglob("*.ZIP"))
    # Deduplicate paths if case-sensitive patterns overlap.
    archives = sorted(set(archives))
    if not archives:
        print("No ZIP archives found under incoming/.")
        return 0

    catalog = []
    page_records = []
    for archive in archives:
        print(f"Ingesting {archive.relative_to(ROOT)}")
        make, manual_root, files = extract_archive(archive)
        file_records = []
        for path in sorted(files):
            rel = path.relative_to(ROOT).as_posix()
            stat = path.stat()
            record = {
                "path": rel,
                "name": path.name,
                "extension": path.suffix.lower(),
                "bytes": stat.st_size,
                "sha256": sha256_file(path),
            }
            file_records.append(record)
            if path.suffix.lower() == ".pdf":
                page_records.extend(extract_pdf_pages(path, manual_root))
        catalog.append({
            "id": manual_root.name,
            "make": make,
            "source_archive": archive.name,
            "file_count": len(file_records),
            "files": file_records,
        })
        # The source ZIP is intentionally removed from the working tree.
        archive.unlink()

    stamp = datetime.now(timezone.utc).isoformat()
    (INDEX / "catalog.json").write_text(
        json.dumps({"generated_at": stamp, "manuals": catalog}, indent=2) + "\n",
        encoding="utf-8",
    )
    with (INDEX / "pages.jsonl").open("w", encoding="utf-8") as out:
        for row in page_records:
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
    summary = {
        "generated_at": stamp,
        "manual_count": len(catalog),
        "file_count": sum(item["file_count"] for item in catalog),
        "indexed_pdf_pages_with_text": len(page_records),
        "manuals": [{"id": item["id"], "make": item["make"], "file_count": item["file_count"]} for item in catalog],
    }
    (INDEX / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
