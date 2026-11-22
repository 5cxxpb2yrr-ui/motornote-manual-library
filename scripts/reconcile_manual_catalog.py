#!/usr/bin/env python3
"""Read-only reconciliation of index/catalog.json against the committed manuals tree."""
from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
MANUALS = ROOT / "manuals"
CATALOG = ROOT / "index" / "catalog.json"
REPORT = ROOT / "catalog-reconciliation-report.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def publisher_exclusion(path: str) -> str | None:
    parts = PurePosixPath(path).parts
    if any(part.startswith(".") for part in parts):
        return "hidden_path"
    if PurePosixPath(path).suffix.lower() == ".css":
        return "css"
    return None


def main() -> int:
    catalog_data = json.loads(CATALOG.read_text(encoding="utf-8"))
    catalog_manuals = catalog_data.get("manuals", [])
    catalog_by_path: dict[str, dict] = {}
    duplicate_catalog_paths: list[str] = []
    catalog_by_manual: dict[str, list[dict]] = defaultdict(list)

    for manual in catalog_manuals:
        manual_id = manual.get("id", "<missing-id>")
        for entry in manual.get("files", []):
            path = entry.get("path")
            if not isinstance(path, str):
                duplicate_catalog_paths.append(f"{manual_id}:<entry-without-path>")
                continue
            if path in catalog_by_path:
                duplicate_catalog_paths.append(path)
            catalog_by_path[path] = entry
            catalog_by_manual[manual_id].append(entry)

    actual_by_path: dict[str, Path] = {}
    actual_by_manual: dict[str, list[str]] = defaultdict(list)
    if not MANUALS.is_dir():
        raise SystemExit("ERROR: manuals/ directory is missing.")

    manual_roots = sorted(
        (p for p in MANUALS.iterdir() if p.is_dir() and not p.name.startswith(".")),
        key=lambda p: p.name.lower(),
    )
    for manual_root in manual_roots:
        for path in sorted((p for p in manual_root.rglob("*") if p.is_file()),
                           key=lambda p: p.as_posix().lower()):
            relative = path.relative_to(ROOT).as_posix()
            actual_by_path[relative] = path
            actual_by_manual[manual_root.name].append(relative)

    catalog_paths = set(catalog_by_path)
    actual_paths = set(actual_by_path)
    missing_from_tree = sorted(catalog_paths - actual_paths)
    missing_from_catalog = sorted(actual_paths - catalog_paths)

    metadata_mismatches = []
    lfs_pointers = []
    for relative in sorted(catalog_paths & actual_paths):
        entry = catalog_by_path[relative]
        path = actual_by_path[relative]
        actual_size = path.stat().st_size
        expected_size = entry.get("bytes")
        with path.open("rb") as handle:
            prefix = handle.read(1024)
        is_lfs_pointer = prefix.startswith(b"version https://git-lfs.github.com/spec/v1")
        if not is_lfs_pointer and expected_size is not None and expected_size != actual_size:
            metadata_mismatches.append({
                "path": relative, "field": "bytes",
                "catalog": expected_size, "actual": actual_size,
            })
        expected_hash = entry.get("sha256")
        if prefix.startswith(b"version https://git-lfs.github.com/spec/v1"):
            lfs_pointers.append(relative)
            pointer_text = prefix.decode("ascii", errors="replace")
            oid_match = __import__("re").search(r"^oid sha256:([0-9a-f]{64})$", pointer_text, __import__("re").M)
            size_match = __import__("re").search(r"^size ([0-9]+)$", pointer_text, __import__("re").M)
            pointer_hash = oid_match.group(1) if oid_match else None
            pointer_size = int(size_match.group(1)) if size_match else None
            if expected_hash and pointer_hash != expected_hash.lower():
                metadata_mismatches.append({
                    "path": relative, "field": "sha256_lfs_pointer",
                    "catalog": expected_hash, "actual": pointer_hash,
                })
            if expected_size is not None and pointer_size != expected_size:
                metadata_mismatches.append({
                    "path": relative, "field": "bytes_lfs_pointer",
                    "catalog": expected_size, "actual": pointer_size,
                })
            continue
        if expected_hash:
            actual_hash = sha256_file(path)
            if expected_hash.lower() != actual_hash.lower():
                metadata_mismatches.append({
                    "path": relative, "field": "sha256",
                    "catalog": expected_hash, "actual": actual_hash,
                })

    publisher_excluded = Counter()
    by_manual = {}
    for manual_root in manual_roots:
        manual_id = manual_root.name
        catalog_entries = catalog_by_manual.get(manual_id, [])
        actual_paths_for_manual = actual_by_manual.get(manual_id, [])
        actual_ext = Counter(PurePosixPath(p).suffix.lower() or "<no-extension>"
                             for p in actual_paths_for_manual)
        catalog_ext = Counter(
            entry.get("extension") or "<no-extension>" for entry in catalog_entries
        )
        exclusion_counts = Counter()
        for relative in actual_paths_for_manual:
            reason = publisher_exclusion(relative.removeprefix(f"manuals/{manual_id}/"))
            if reason:
                exclusion_counts[reason] += 1
                publisher_excluded[reason] += 1
        by_manual[manual_id] = {
            "catalog_count": len(catalog_entries),
            "actual_count": len(actual_paths_for_manual),
            "catalog_extensions": dict(sorted(catalog_ext.items())),
            "actual_extensions": dict(sorted(actual_ext.items())),
            "publisher_excluded": dict(sorted(exclusion_counts.items())),
        }

    catalog_ids = {item.get("id") for item in catalog_manuals}
    actual_ids = {p.name for p in manual_roots}
    report = {
        "catalog_generated_at": catalog_data.get("generated_at"),
        "catalog_manual_count": len(catalog_manuals),
        "actual_manual_count": len(manual_roots),
        "catalog_file_count": len(catalog_paths),
        "actual_file_count": len(actual_paths),
        "catalog_entries_missing_from_tree": len(missing_from_tree),
        "tree_files_missing_from_catalog": len(missing_from_catalog),
        "metadata_mismatch_count": len(metadata_mismatches),
        "duplicate_catalog_path_count": len(duplicate_catalog_paths),
        "lfs_pointer_count": len(lfs_pointers),
        "publisher_excluded_counts": dict(sorted(publisher_excluded.items())),
        "catalog_manual_ids_missing_from_tree": sorted(catalog_ids - actual_ids),
        "tree_manual_ids_missing_from_catalog": sorted(actual_ids - catalog_ids),
        "by_manual": by_manual,
        "catalog_entries_missing_from_tree_sample": missing_from_tree[:200],
        "tree_files_missing_from_catalog_sample": missing_from_catalog[:200],
        "metadata_mismatch_sample": metadata_mismatches[:200],
        "duplicate_catalog_paths_sample": duplicate_catalog_paths[:200],
        "lfs_pointer_sample": lfs_pointers[:100],
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print("CATALOG / SOURCE RECONCILIATION")
    print(f"Catalog generated: {report['catalog_generated_at']}")
    print(f"Manual folders: catalog={len(catalog_manuals):,}; tree={len(manual_roots):,}")
    print(f"Unique files: catalog={len(catalog_paths):,}; tree={len(actual_paths):,}")
    print(f"Catalog paths missing from tree: {len(missing_from_tree):,}")
    print(f"Tree files missing from catalog: {len(missing_from_catalog):,}")
    print(f"Size/hash mismatches: {len(metadata_mismatches):,}")
    print(f"Duplicate catalog paths: {len(duplicate_catalog_paths):,}")
    print(f"Unhydrated Git LFS pointers: {len(lfs_pointers):,}")
    print(f"Publisher exclusions in source tree: {dict(publisher_excluded)}")
    for manual_id, values in by_manual.items():
        print(f"\n[{manual_id}]")
        print(json.dumps(values, indent=2))
    for label, rows in (
        ("CATALOG PATHS MISSING FROM TREE", missing_from_tree),
        ("TREE FILES MISSING FROM CATALOG", missing_from_catalog),
    ):
        print(f"\n{label} (first 100)")
        for path in rows[:100]:
            print(path)
    if metadata_mismatches:
        print("\nMETADATA MISMATCHES (first 50)")
        for item in metadata_mismatches[:50]:
            print(json.dumps(item, sort_keys=True))
    print(f"\nFull machine-readable report: {REPORT.name}")
    return 1 if (missing_from_tree or missing_from_catalog or metadata_mismatches
                 or duplicate_catalog_paths or catalog_ids != actual_ids) else 0


if __name__ == "__main__":
    raise SystemExit(main())
