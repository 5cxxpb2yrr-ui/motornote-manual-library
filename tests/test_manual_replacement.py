import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from ingest_manuals import extract_to_staging, wrap_flat_archive_in_vehicle_folder
from publish_manual_site import decorate_manual_pages, remove_manual_css_files


class ManualReplacementTests(unittest.TestCase):
    def test_flat_zip_is_wrapped_under_vehicle_folder_from_root_title(self):
        with tempfile.TemporaryDirectory() as temp:
            staging = Path(temp)
            (staging / "index.html").write_text(
                "<html><head><title>Free Service Manual for the 2006 Scion xB Standard ~ LEMON Manuals</title></head></html>",
                encoding="utf-8",
            )
            (staging / "pages").mkdir()
            (staging / "pages" / "1.html").write_text("<h1>Vehicle index</h1>", encoding="utf-8")
            (staging / "images").mkdir()
            (staging / "images" / "diagram.gif").write_bytes(b"GIF89a")
            (staging / "style.css").write_text("body { color: red; }", encoding="utf-8")

            folder = wrap_flat_archive_in_vehicle_folder(staging)

            self.assertEqual(folder, "2006 Scion xB Standard")
            vehicle = staging / "2006 Scion xB Standard"
            self.assertTrue((vehicle / "index.html").is_file())
            self.assertTrue((vehicle / "pages" / "1.html").is_file())
            self.assertTrue((vehicle / "images" / "diagram.gif").is_file())
            self.assertTrue((vehicle / "style.css").is_file())
            self.assertFalse((staging / "pages").exists())

    def test_extraction_skips_macos_metadata_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive = root / "scion-service-manual.zip"
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr(
                    "index.html",
                    "<html><head><title>Free Service Manual for the 2006 Scion xB Standard ~ LEMON Manuals</title></head></html>",
                )
                bundle.writestr("pages/1.html", "<html><body><h1>Manual page</h1></body></html>")
                bundle.writestr("__MACOSX/._style.css", "AppleDouble metadata")
            staging = root / "staging"

            extracted = extract_to_staging(archive, staging)

            self.assertTrue((staging / "2006 Scion xB Standard" / "pages" / "1.html").is_file())
            self.assertFalse((staging / "__MACOSX").exists())
            self.assertEqual(len(extracted), 2)

    def test_archive_with_existing_vehicle_folder_is_not_wrapped_again(self):
        with tempfile.TemporaryDirectory() as temp:
            staging = Path(temp)
            vehicle = staging / "2006 Scion xB L4-1.5L (1NZ-FE)"
            vehicle.mkdir()
            (vehicle / "index.html").write_text("<title>Existing vehicle root</title>", encoding="utf-8")
            (vehicle / "pages").mkdir()

            self.assertIsNone(wrap_flat_archive_in_vehicle_folder(staging))
            self.assertTrue((vehicle / "pages").is_dir())

    def test_publisher_uses_phoenix_and_strips_archive_css(self):
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp)
            page = stage / "manuals" / "scion-service-manual" / "2006 Scion xB Standard" / "pages" / "1.html"
            page.parent.mkdir(parents=True)
            page.write_text(
                '<html><head><link rel="stylesheet" href="../style.css">'
                '<style>body { color: red; }</style></head>'
                '<body><main class="main" style="color:red"><h1>Procedure</h1></main></body></html>',
                encoding="utf-8",
            )

            self.assertEqual(decorate_manual_pages(stage), 1)
            result = page.read_text(encoding="utf-8")
            self.assertIn("/assets/phoenix.css", result)
            self.assertIn("/assets/phoenix.js", result)
            self.assertNotIn("style.css", result)
            self.assertNotIn("<style", result.lower())
            self.assertNotIn("style=", result.lower())

    def test_publisher_removes_manual_css_but_keeps_shared_phoenix_asset(self):
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp)
            manual_css = stage / "manuals" / "subaru-service-manual" / "style.css"
            phoenix_css = stage / "assets" / "phoenix.css"
            manual_css.parent.mkdir(parents=True)
            phoenix_css.parent.mkdir(parents=True)
            manual_css.write_text("body { color: red; }", encoding="utf-8")
            phoenix_css.write_text("body { color: blue; }", encoding="utf-8")

            self.assertEqual(remove_manual_css_files(stage), 1)
            self.assertFalse(manual_css.exists())
            self.assertTrue(phoenix_css.is_file())


if __name__ == "__main__":
    unittest.main()
