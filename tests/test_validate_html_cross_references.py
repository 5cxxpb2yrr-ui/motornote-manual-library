import tempfile
import unittest
from pathlib import Path

from scripts.validate_html_cross_references import validate


class HTMLCrossReferenceValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "manuals" / "chapter").mkdir(parents=True)
        (self.root / "assets").mkdir()
        (self.root / "assets" / "diagram.png").write_bytes(b"image")
        self.report = self.root.parent / (self.root.name + "-report.json")

    def tearDown(self):
        self.temp.cleanup()
        self.report.unlink(missing_ok=True)

    def run_validation(self):
        return validate(self.root, self.report)

    def test_valid_relative_root_and_asset_references_pass(self):
        (self.root / "manuals" / "chapter" / "index.html").write_text(
            '<a href="procedure.html#torque">Procedure</a>'
            '<img src="../../assets/diagram.png">'
            '<a href="/manuals/chapter/procedure.html">Root path</a>',
            encoding="utf-8",
        )
        (self.root / "manuals" / "chapter" / "procedure.html").write_text(
            '<h2 id="torque">Torque</h2>', encoding="utf-8"
        )
        report = self.run_validation()
        self.assertEqual(report["status"], "passed")
        self.assertEqual(report["error_count"], 0)

    def test_missing_page_and_anchor_are_reported(self):
        (self.root / "manuals" / "chapter" / "index.html").write_text(
            '<a href="missing.html#nowhere">Broken page</a>'
            '<a href="existing.html#nowhere">Broken anchor</a>', encoding="utf-8"
        )
        (self.root / "manuals" / "chapter" / "existing.html").write_text(
            '<p>No matching anchor</p>', encoding="utf-8"
        )
        report = self.run_validation()
        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["error_counts_by_type"]["missing-target"], 1)
        self.assertEqual(report["error_counts_by_type"]["missing-anchor"], 1)

    def test_duplicate_ids_are_reported(self):
        (self.root / "manuals" / "chapter" / "index.html").write_text(
            '<div id="repeat"></div><section id="repeat"></section>', encoding="utf-8"
        )
        report = self.run_validation()
        self.assertEqual(report["error_counts_by_type"]["duplicate-id"], 1)

    def test_external_links_are_not_checked_as_local_files(self):
        (self.root / "manuals" / "chapter" / "index.html").write_text(
            '<a href="https://example.com/remote">External</a>'
            '<a href="mailto:test@example.com">Email</a>', encoding="utf-8"
        )
        report = self.run_validation()
        self.assertEqual(report["status"], "passed")

    def test_base_href_is_applied_to_relative_links(self):
        (self.root / "manuals" / "chapter" / "index.html").write_text(
            '<base href="/manuals/chapter/"><a href="procedure.html">Procedure</a>',
            encoding="utf-8",
        )
        (self.root / "manuals" / "chapter" / "procedure.html").write_text(
            '<p>Procedure</p>', encoding="utf-8"
        )
        report = self.run_validation()
        self.assertEqual(report["status"], "passed")


if __name__ == "__main__":
    unittest.main()
