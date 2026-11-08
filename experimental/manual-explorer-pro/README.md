# LifeOS Manual Explorer Pro — Experimental

This directory is an isolated interface prototype. It does not replace or modify the Phoenix production site.

## Preview locally

Open `index.html` in a browser, or serve this directory with any static HTTP server. No build step or dependencies are required.

## Current prototype

- Responsive desktop three-pane workspace.
- Mobile-first stacked navigation and reader layout.
- Vehicle selector and manual section navigation.
- Document list filtering and sample search.
- Local browser favorites and bookmarks.
- Light/dark theme toggle.
- Accessible landmarks, labels, focus handling, live announcements, and reduced-motion support.

## Explicit limitations

All vehicle and procedure data in this prototype is illustrative. Search is a local demonstration against four sample entries; it is not connected to AI Search or the live manual corpus. Vehicle creation, GitHub authentication, Nomie integration, synchronization, and offline manual downloads are not implemented.

## Isolation rules

- Develop only on `feat/manual-explorer-pro`.
- Keep `main`, the Phoenix site Worker, the existing R2 bucket, and the production publishing workflows unchanged.
- Do not point experimental publishing at the production R2 bucket.
- Any future deployment must use a separate preview hostname and separate storage/configuration.
- Reuse the existing manual corpus through read-only access until the preview infrastructure is explicitly provisioned.

## Next milestones

1. Validate this visual prototype and interaction model.
2. Connect the existing manual corpus in read-only mode.
3. Add persistent vehicle profiles, favorites, bookmarks, and notes.
4. Integrate search through a secure server-side proxy.
5. Evaluate selective offline caching.
6. Validate Nomie 6 integration against its actual supported APIs.
