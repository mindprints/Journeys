# Unified Poster System - Current State

**Original plan created:** 2026-02-05  
**Last updated:** 2026-02-13  
**Status:** Active implementation (plan phases archived)

This file replaces the earlier phase-by-phase migration plan, which is now mostly complete and no longer accurate.

---

## Implemented

- Unified v2 poster model is the primary format.
- Unified Editor is the primary poster editor.
- Category Editor supports:
  - category/topic CRUD
  - Wikipedia generation runs
  - cascade category deletion across posters
- Category deletion fallback:
  - posters left without categories are assigned `No-Category`.
- Unified Editor category behavior:
  - `No-Category` is filterable
  - applying a real category removes fallback labels (`No-Category`, `Uncategorized`)
- Unified Editor multi-select:
  - `Ctrl/Cmd + click` toggle
  - `Shift + click` range select
  - bulk delete
  - bulk add/remove category
  - existing-category bulk dropdown + typed category input
- Poster delete compatibility:
  - `DELETE /api/delete-poster?path=...` (preferred)
  - `POST /api/delete-poster` (compatibility)
- Restart tooling:
  - `npm run restart`
  - `npm run restart:dev`
- Image normalization/repair scripts added and executed:
  - `scripts/python/normalize_image_assets.py`
  - `scripts/python/repair_missing_image_refs.py`

---

## Archived Legacy Plan Items

These are no longer actionable as written and are archived:

- phased migration checklist for initial v2 conversion
- old editor deprecation redirects to `poster-editor.html`
- planned file list referencing:
  - `poster-editor.html`
  - `website-editor.html`
  - `js/poster-editor.js`
  - `css/poster-unified.css`
  - `css/poster-back.css`

Current source of truth for runtime/editor/API behavior is:
- `README.md`
- `SESSION_NOTES_2026-02-07.md`
- implementation in `server.js`, `js/unified-editor.js`, `js/category-editor.js`

---

## Open Backlog

- Optional: richer bulk action reporting in Unified Editor (inline result panel instead of alerts).
- Optional: stricter API-side schema validation for bulk poster updates.
- Optional: prune legacy backup artifacts after retention window.

