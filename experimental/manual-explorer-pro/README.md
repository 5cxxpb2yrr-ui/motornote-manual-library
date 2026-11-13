# LifeOS Manual Explorer Pro — Experimental

This is the isolated preview of Manual Explorer Pro. Keep this work on the experimental repair branch until explicitly promoted; it does not replace the Phoenix production site.

## Current implementation

- Mobile-first equipment and manual selection; vehicles are the first supported equipment category.
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

The current catalog discovers vehicle/manual folders from R2 and publishes a category-neutral top-level `equipment[]` collection while retaining `manuals[].vehicles[]` for older clients. Equipment records carry `id`, `name`, `href`, `manualId`, `make`, `category`, `equipmentType`, and `fileCount`. Future appliance owner manuals and other equipment types can join the same collection without requiring a vehicle-specific home screen. The file API is read-only, validates manual-rooted keys, and serves supported extensions plus extensionless factory objects using the MIME type stored in R2.

## Search index

Run scripts/build_r2_search_index.py with the R2 credentials already used for the manual bucket. It indexes section-based HTML, Markdown, text, PDF, PNG, and SVG files and publishes only to search-index/v1/. HTML, Markdown, and text are indexed by content; binary formats are searchable by their exact filename.

## Cloudflare preview

The Cloudflare Pages project is lifeos-manual-explorer-pro. Its root is this directory, and its R2 binding is MANUALS to motornote-manual-site. Production deployments remain disabled; preview deployments are limited to feat/manual-explorer-pro.

No manual files are copied or migrated by the application changes. The bucket must contain the section folders, each manual's tree.json, and the exact file objects referenced by its leaves before end-to-end reader testing can pass.


## Build exact-filename navigation trees

From a manual's extracted index page, run:

    python tools/build_tree.py 2.html "Repair and Diagnosis" > tree.json

The builder copies the final filename from each supported local link into the leaf's file field. It does not convert numeric page IDs into guessed filenames. If the index still links to numbered legacy pages, update the source links to the real section-based filenames before generating the tree. Upload the resulting tree.json to Vehicle Name/Manual Name/tree.json.


## Equipment library direction

The home screen is an equipment library, not a vehicle-only garage. Its equipment collection can contain vehicles, appliances, tools, and other maintained assets. The current R2 catalog remains backward compatible with vehicle records; when appliance manuals are introduced, publish them through the top-level `equipment[]` collection using this shape:

    {
      "id": "manuals/appliance-manuals/kitchenaid-dishwasher",
      "name": "KitchenAid Dishwasher",
      "href": "manuals/appliance-manuals/kitchenaid-dishwasher/",
      "manualId": "appliance-manuals",
      "make": "KitchenAid",
      "category": "appliance",
      "equipmentType": "appliance",
      "fileCount": 240
    }

The same reader and search flow can then open the equipment's `index.html` or its registered `treeFiles`. Keep the equipment picker on Home; do not add a separate Vehicles navigation tab.
