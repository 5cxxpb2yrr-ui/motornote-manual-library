# LifeOS Manual Explorer Pro — Experimental

This is the isolated preview of Manual Explorer Pro. Work only on branch feat/manual-explorer-pro; it does not replace the Phoenix production site.

## Current implementation

- Mobile-first vehicle and manual selection.
- Single-column section drill-down with Back and breadcrumb navigation.
- R2-backed section tree loading.
- Exact filename resolution from each tree leaf.
- HTML, Markdown, text, PDF, PNG, and SVG reader support.
- Local favorites and bookmarks.
- Universal search index built from the section-based R2 corpus.
- Light/dark theme and accessible navigation controls.

## Canonical R2 layout

The bucket root contains vehicle folders. Each vehicle contains manual folders. Each manual has one tree.json; page objects live inside their section folders.

    2006 Scion xB/
      Repair Manual/
        tree.json
        Engine Mechanical/
          EM-01 Engine Removal.md
          EM-02 Engine Installation.pdf
        Fuel System/
          FS-01 Fuel Pressure Test.html

The tree file is stored at Vehicle Name/Manual Name/tree.json. Folder nodes use n for the displayed folder name and c for child nodes. A file leaf uses n for its display title and file for the exact filename, including its extension:

    {
      "title": "Repair Manual",
      "c": [
        {
          "n": "Engine Mechanical",
          "c": [
            {
              "n": "Engine Removal",
              "file": "EM-01 Engine Removal.md"
            }
          ]
        }
      ]
    }

That leaf resolves to 2006 Scion xB/Repair Manual/Engine Mechanical/EM-01 Engine Removal.md. The reader does not infer a filename from the title or a numeric page ID.

The catalog discovers vehicle/manual folders from R2 and counts file leaves in each tree. The file API validates the vehicle-rooted key and serves only supported file extensions. It is read-only.

## Search index

Run scripts/build_r2_search_index.py with the R2 credentials already used for the manual bucket. It indexes section-based HTML, Markdown, text, PDF, PNG, and SVG files and publishes only to search-index/v1/. HTML, Markdown, and text are indexed by content; binary formats are searchable by their exact filename.

## Cloudflare preview

The Cloudflare Pages project is lifeos-manual-explorer-pro. Its root is this directory, and its R2 binding is MANUALS to motornote-manual-site. Production deployments remain disabled; preview deployments are limited to feat/manual-explorer-pro.

No manual files are copied or migrated by the application changes. The bucket must contain the section folders, each manual's tree.json, and the exact file objects referenced by its leaves before end-to-end reader testing can pass.
