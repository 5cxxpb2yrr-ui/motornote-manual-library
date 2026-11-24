import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from ingest_manuals import ManualHTMLCleaner


def clean(source: str) -> str:
    parser = ManualHTMLCleaner()
    parser.feed(source)
    parser.close()
    return "".join(parser.output)


class ManualHTMLCleanerTests(unittest.TestCase):
    def test_preserves_mirror_breadcrumb_header_and_manual_content(self):
        source = (
            '<body><div class="theme-colors header">'
            '<span class="breadcrumb-part">Home</span> &gt;&gt; '
            '<a class="breadcrumb-part" href="../pages/1839.html">Basic Inspection</a>'
            '</div><div class="main"><h1>Basic Inspection</h1>'
            '<p>Measure resistance at 20 degrees C.</p>'
            '<img src="../images/diagram.png"></div></body>'
        )
        result = clean(source)
        self.assertIn('class="theme-colors header"', result)
        self.assertIn('<span class="breadcrumb-part">Home</span>', result)
        self.assertIn('href="../pages/1839.html"', result)
        self.assertIn("Basic Inspection</a>", result)
        self.assertIn("<h1>Basic Inspection</h1>", result)
        self.assertIn("Measure resistance at 20 degrees C.", result)
        self.assertIn('../images/diagram.png', result)

    def test_removes_known_branding_but_keeps_manual_body(self):
        source = (
            '<div class="branding">Mirror branding</div>'
            '<main><p>Actual repair procedure</p></main>'
        )
        result = clean(source)
        self.assertNotIn("Mirror branding", result)
        self.assertIn("Actual repair procedure", result)

    def test_does_not_remove_unrelated_header(self):
        source = '<header class="manual-section"><h2>Inspection</h2></header>'
        self.assertIn("Inspection", clean(source))


if __name__ == "__main__":
    unittest.main()
