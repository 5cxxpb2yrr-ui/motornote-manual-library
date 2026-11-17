from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from validate_manual_links import resolve_target, validate


class ManualLinkValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "manuals" / "demo" / "pages").mkdir(parents=True)
        (self.root / "manuals" / "demo" / "images").mkdir()
        (self.root / "assets").mkdir()
        (self.root / "manuals" / "demo" / "pages" / "1.html").write_text(
            '<a href="../pages/2.html?view=full#spec">Next</a>'
            '<img src="../images/diagram%20one.png">'
            '<a href="https://example.com/external">External</a>'
            '<a href="#local">Local fragment</a>'
            '<script src="/assets/app.js"></script>',
            encoding="utf-8",
        )
        (self.root / "manuals" / "demo" / "pages" / "2.html").write_text(
            "<h1 id='spec'>Target</h1>", encoding="utf-8"
        )
        (self.root / "manuals" / "demo" / "images" / "diagram one.png").write_bytes(b"png")
        (self.root / "assets" / "app.js").write_text("/* test */", encoding="utf-8")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_valid_local_and_external_references_pass(self) -> None:
        page_count, checked, errors = validate(self.root)
        self.assertEqual(page_count, 2)
        self.assertEqual(checked, 3)
        self.assertEqual(errors, [])

    def test_missing_local_reference_fails(self) -> None:
        page = self.root / "manuals" / "demo" / "pages" / "1.html"
        page.write_text('<a href="../pages/404.html">Missing</a>', encoding="utf-8")
        _, checked, errors = validate(self.root)
        self.assertEqual(checked, 1)
        self.assertEqual(len(errors), 1)
        self.assertIn("404.html", errors[0])

    def test_root_asset_falls_back_to_worker_asset_source(self) -> None:
        shutil.rmtree(self.root / "assets")
        (self.root / "site-worker" / "assets").mkdir(parents=True)
        (self.root / "site-worker" / "assets" / "app.js").write_text("", encoding="utf-8")
        source = self.root / "manuals" / "demo" / "pages" / "1.html"
        target = resolve_target(self.root, source, "/assets/app.js")
        self.assertEqual(target, self.root / "site-worker" / "assets" / "app.js")

    def test_srcset_references_are_checked(self) -> None:
        page = self.root / "manuals" / "demo" / "pages" / "1.html"
        page.write_text('<img srcset="../images/missing.png 1x">', encoding="utf-8")
        _, checked, errors = validate(self.root)
        self.assertEqual(checked, 1)
        self.assertEqual(len(errors), 1)


if __name__ == "__main__":
    unittest.main()
