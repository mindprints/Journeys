# Session Notes (2026-02-07)

## What Changed
- Implemented a 16:9 v2 back layout using a `.v2-back-frame` wrapper and aligned carousel/editor markup.
- Added a live tuning tool (`v2-back-tuner.html`) that broadcasts CSS variables to the carousel in real time.
- Introduced CSS variables in `css/poster-v2.css` to control v2 back sizing and typography.
- Updated unified editor preview to match carousel styling by loading `css/poster-v2.css` and matching layout markup.
- Created a new category `JSON_Posters/VIPs` and added `Andrej_Karpathy.json` in v2 format.

## Key Files
- `css/carousel.css`: v2 back frame rotation and live header scale hook (`--v2-live-header-scale`).
- `css/poster-v2.css`: v2 back CSS variables and typography defaults.
- `js/loadPosters.js`: v2 back markup includes `.v2-back-frame`.
- `js/unified-editor.js`: preview back markup wrapped in `.poster-v2-header` and `.v2-back-frame`.
- `unified-editor.html`: loads `css/poster-v2.css` and applies carousel-scale font sizing to the preview back.
- `v2-back-tuner.html`: live tuner UI, renders the real poster via API, and broadcasts CSS vars.
- `index.html`: applies tuner CSS vars in real time via BroadcastChannel/localStorage.

## Final Tuning Values Applied
These are set in `css/poster-v2.css`:

```
--v2-live-header-scale: 0.5em;
--v2-back-scale: 1.1;
--v2-back-frame-width: 141%;
--v2-back-frame-height: 65%;
--v2-back-frame-max-height: 100%;
--v2-back-header-font-size: 0.83rem;
--v2-back-title-size: 1.35em;
--v2-back-text-size: 0.77em;
--v2-back-text-line-height: 1.55;
--v2-back-padding: 1.1em;
--v2-back-grid-gap: 0.73em;
--v2-back-panel-title-size: 0.54em;
--v2-back-badge-size: 0.53em;
--v2-back-link-size: 0.6em;
```

## How to Use the Tuner
1. Start the server: `npm run restart:dev`
2. Open the tuner: `http://localhost:3010/v2-back-tuner.html?directory=JSON_Posters/VIPs&poster=Andrej_Karpathy.json`
3. Adjust sliders; the live carousel updates via BroadcastChannel.
4. Copy the CSS vars into `css/poster-v2.css`.

## Issues Resolved
- CORS error when opening tuner via `file://` by forcing server URL usage.
- Live header scale not applying due to missing unit; fixed slider to emit `em`.
- Preview mismatch: editor now loads `css/poster-v2.css` and mirrors carousel markup.

## Next Step (Archived)
- Migration scripting is now in place (`scripts/python/normalize_image_assets.py`, `scripts/python/repair_missing_image_refs.py`) and has been run on existing poster data.

---

## Addendum (2026-02-13)

### Operational + CRUD Improvements
- Added robust API URL handling in Category Editor, including `file://` fallback to `http://localhost:3010`.
- Fixed category CRUD behavior:
  - reliable update/delete matching by normalized category key
  - category delete now cascades across all posters
  - posters left without categories are assigned `No-Category`
- Added `POST /api/delete-category` endpoint for cascade category removal.
- Added `DELETE /api/delete-poster?path=...` endpoint (Unified Editor compatibility).
- Improved Unified Editor delete errors (single, specific message instead of repeated generic text).

### Unified Editor Improvements
- Added multi-select in poster list:
  - `Ctrl/Cmd + click` toggle
  - `Shift + click` range select
- Added bulk toolbar:
  - Select all / clear selection
  - bulk delete selected posters
  - bulk add/remove category (typed value + existing-category dropdown)
- Added fallback-category accessibility:
  - `No-Category` is always filterable in Unified Editor
  - applying a real category removes fallback labels (`No-Category`, `Uncategorized`)
- Added client-side filtering to prevent `.log`/`skip-log` entries from showing as posters.

### Image Normalization + Repair
- Added `scripts/python/normalize_image_assets.py`:
  - converts referenced local images to `.webp`
  - normalizes image fit metadata (`fit`, `maxWidth`, `maxHeight`) by aspect ratio
- Added `scripts/python/repair_missing_image_refs.py`:
  - repairs missing local image refs where possible
  - creates placeholder `.webp` assets for unresolved template/missing cases

### Dev Runtime
- Added `scripts/restart-unified.js` and package scripts:
  - `npm run restart`
  - `npm run restart:dev`
