import importlib.util
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "build_navigation_from_breadcrumbs.py"
SPEC = importlib.util.spec_from_file_location("navigation_builder", SCRIPT)
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


def page_html(crumbs, title):
    breadcrumb_html = " &gt;&gt; ".join(
        f'<a class="breadcrumb-part">{label}</a>' for label in crumbs
    )
    return (
        "<!doctype html><html><body>"
        f'<div class="header">{breadcrumb_html}</div>'
        f"<main><h1>{title}</h1></main>"
        "</body></html>"
    )


class BreadcrumbNavigationTests(unittest.TestCase):
    def test_parser_extracts_breadcrumbs_and_h1(self):
        html = page_html(
            ["Home", "Scion", "2006", "xB Standard", "Repair and Diagnosis (Single Page)",
             "Electrical", "Wiring Diagrams", "Noise Filter &amp; Connector"],
            "Noise Filter &amp; Connector",
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "2601.html"
            path.write_text(html, encoding="utf-8")
            crumbs, h1 = builder.parse_html(path)
        self.assertEqual(crumbs[-1], "Noise Filter & Connector")
        self.assertEqual(h1, "Noise Filter & Connector")

    def test_build_manual_preserves_source_breadcrumb_hierarchy(self):
        with tempfile.TemporaryDirectory() as tmp:
            pages = Path(tmp) / "manuals" / "scion-service-manual" / "2006 Scion xB Standard" / "pages"
            pages.mkdir(parents=True)
            (pages / "1.html").write_text(
                page_html(["Home", "Scion", "2006", "xB Standard"], "xB Standard"),
                encoding="utf-8",
            )
            (pages / "3.html").write_text(
                page_html(["Home", "Scion", "2006", "xB Standard",
                           "Repair and Diagnosis (Single Page)"], "Repair and Diagnosis"),
                encoding="utf-8",
            )
            (pages / "2601.html").write_text(
                page_html(["Home", "Scion", "2006", "xB Standard",
                           "Repair and Diagnosis (Single Page)", "Electrical",
                           "Wiring Diagrams", "OEM Connector End Views", "Connector List",
                           "Noise Filter (Ignition) Connector End View (N 1)"],
                          "Noise Filter (Ignition) Connector End View (N 1)"),
                encoding="utf-8",
            )
            (pages / "26.html").write_text(
                page_html(["Home", "Scion", "2006", "xB Standard", "Labor Times",
                           "Other Variant", "Accessories and Equipment", "Exterior Lights",
                           "Stop Light Switch", "Remove &amp; Replace"],
                          "Stop Light Switch: Remove &amp; Replace"),
                encoding="utf-8",
            )
            result = builder.build_manual(
                "scion-service-manual",
                {"folder": "2006 Scion xB Standard", "prefix": "scion"},
                Path(tmp),
            )
        repair = result["trees"]["repair"]
        electrical = next(node for node in repair["c"] if node["n"] == "Electrical")
        wiring = next(node for node in electrical["c"] if node["n"] == "Wiring Diagrams")
        connector = next(node for node in wiring["c"] if node["n"] == "OEM Connector End Views")
        connector_list = next(node for node in connector["c"] if node["n"] == "Connector List")
        leaf = next(node for node in connector_list["c"] if node.get("p") == 2601)
        self.assertEqual(leaf["n"], "Noise Filter (Ignition) Connector End View (N 1)")
        self.assertEqual(result["summary"]["repair_pages"], 2)
        self.assertEqual(result["summary"]["labor_pages"], 1)
        self.assertEqual(result["summary"]["landing_pages_skipped"], 1)

    def test_rejects_duplicate_page_ids(self):
        tree = {"c": []}
        builder.insert_page(tree, ["Electrical"], "First", 2601)
        with self.assertRaises(ValueError):
            builder.insert_page(tree, ["Electrical"], "Duplicate", 2601)


if __name__ == "__main__":
    unittest.main()
