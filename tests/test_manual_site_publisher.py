from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.manual_site_publisher import (
    allowed_delta_path,
    build_site,
    is_managed_key,
    parse_git_name_status,
    plan_deletions,
)


class ManualSitePublisherTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "manuals" / "scion-service-manual").mkdir(parents=True)
        (self.root / "manuals" / ".previous-scion-service-manual").mkdir(parents=True)
        (self.root / "index" / ".previous-20261121").mkdir(parents=True)
        (self.root / "site-worker" / "assets").mkdir(parents=True)

        (self.root / "manuals" / "scion-service-manual" / "index.html").write_text(
            '<!doctype html><html><head><link rel="stylesheet" href="archive.css">'
            '<style>.archive { color:red }</style></head><body>'
            '<nav class="breadcrumb-part">Home → Scion → 2006 → xB</nav>'
            '<div class="chapter" style="color:red">Factory procedure</div>'
            '</body></html>',
            encoding="utf-8",
        )
        (self.root / "manuals" / "scion-service-manual" / "archive.css").write_text(
            ".archive { color:red }", encoding="utf-8"
        )
        (self.root / "manuals" / "scion-service-manual" / "chapter.html").write_text(
            "<html><body>Chapter</body></html>", encoding="utf-8"
        )
        (self.root / "manuals" / ".previous-scion-service-manual" / "backup.html").write_text(
            "<html>Backup</html>", encoding="utf-8"
        )
        (self.root / "index" / ".previous-20261121" / "catalog.json").write_text(
            "{}", encoding="utf-8"
        )
        (self.root / "index" / "catalog.json").write_text("{}", encoding="utf-8")
        (self.root / "site-worker" / "assets" / "phoenix.css").write_text(
            ".mn-page-shell { color: white }", encoding="utf-8"
        )
        (self.root / "site-worker" / "assets" / "phoenix.js").write_text(
            "/* Phoenix behavior */", encoding="utf-8"
        )
        (self.root / "site-worker" / "assets" / "unmanaged.svg").write_text(
            "<svg/>", encoding="utf-8"
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_build_excludes_hidden_backups_and_archive_css(self) -> None:
        stage = self.root / "stage"
        manifest = build_site(self.root, stage, validate=False)
        keys = set(manifest["files"])
        self.assertIn("manuals/scion-service-manual/index.html", keys)
        self.assertNotIn("manuals/.previous-scion-service-manual/backup.html", keys)
        self.assertNotIn("index/.previous-20261121/catalog.json", keys)
        self.assertNotIn("manuals/scion-service-manual/archive.css", keys)
        self.assertIn("assets/phoenix.css", keys)
        self.assertIn("assets/phoenix.js", keys)
        self.assertNotIn("assets/unmanaged.svg", keys)
        self.assertNotIn("Previous Scion", (stage / "index.html").read_text())

    def test_missing_manual_catalog_fails_closed(self) -> None:
        (self.root / "index" / "catalog.json").unlink()
        with self.assertRaisesRegex(RuntimeError, "index/catalog.json is required"):
            build_site(self.root, self.root / "stage", validate=False)

    def test_phoenix_theme_is_applied_and_breadcrumb_is_preserved(self) -> None:
        stage = self.root / "stage"
        build_site(self.root, stage, validate=False)
        page = (stage / "manuals" / "scion-service-manual" / "index.html").read_text()
        self.assertIn('href="/assets/phoenix.css"', page)
        self.assertIn('src="/assets/phoenix.js"', page)
        self.assertIn('class="breadcrumb-part"', page)
        self.assertIn("Home → Scion → 2006 → xB", page)
        self.assertNotIn("archive.css", page)
        self.assertNotIn("<style", page)
        self.assertNotIn('style="color:red"', page)

    def test_managed_key_allowlist_rejects_hidden_and_unowned_paths(self) -> None:
        self.assertTrue(is_managed_key("index.html"))
        self.assertTrue(is_managed_key("manuals/scion/page.html"))
        self.assertTrue(is_managed_key("index/catalog.json"))
        self.assertTrue(is_managed_key("assets/phoenix.css"))
        self.assertFalse(is_managed_key("assets/unmanaged.svg"))
        self.assertFalse(is_managed_key("manuals/.previous-scion/page.html"))
        self.assertFalse(is_managed_key("manuals/scion/.cache/page.html"))
        self.assertFalse(is_managed_key("other-app/data.json"))
        self.assertFalse(is_managed_key("../outside.txt"))
        self.assertFalse(is_managed_key("manuals\\scion\\page.html"))

    def test_delta_path_allowlist_excludes_hidden_and_unowned_assets(self) -> None:
        self.assertTrue(allowed_delta_path("manuals/scion/page.html"))
        self.assertTrue(allowed_delta_path("manuals/scion/archive.css"))
        self.assertTrue(allowed_delta_path("index/catalog.json"))
        self.assertTrue(allowed_delta_path("site-worker/assets/phoenix.css"))
        self.assertTrue(allowed_delta_path("site-worker/assets/phoenix.js"))
        self.assertFalse(allowed_delta_path("manuals/.previous-scion/page.html"))
        self.assertFalse(allowed_delta_path("manuals/scion/.cache/page.html"))
        self.assertFalse(allowed_delta_path("site-worker/assets/unmanaged.svg"))
        self.assertFalse(allowed_delta_path("other-app/data.json"))

    def test_git_name_status_parser_handles_modifications_deletions_and_renames(self) -> None:
        output = (
            "M\tmanuals/scion/page.html\n"
            "D\tindex/old.json\n"
            "R100\tmanuals/scion/old.png\tmanuals/scion/new.png\n"
        )
        changed, deleted = parse_git_name_status(output)
        self.assertEqual(changed, ["manuals/scion/new.png", "manuals/scion/page.html"])
        self.assertEqual(deleted, ["index/old.json", "manuals/scion/old.png"])

    def test_deletion_plan_only_removes_stale_visible_managed_objects(self) -> None:
        local = {
            "index.html",
            "manuals/scion-service-manual/index.html",
            "assets/phoenix.css",
        }
        remote = {
            *local,
            "manuals/old-manual/obsolete.html",
            "manuals/.previous-old-manual/backup.html",
            "other-app/data.json",
            "index/.previous-old/catalog.json",
        }
        self.assertEqual(
            plan_deletions(local, remote),
            ["manuals/old-manual/obsolete.html"],
        )


if __name__ == "__main__":
    unittest.main()
