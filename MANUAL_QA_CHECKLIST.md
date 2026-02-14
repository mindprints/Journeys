# Manual QA Checklist

Date: __________
Tester: __________
Environment: `local dev` / `staging` / `other: __________`

Run setup first:

```bash
npm run restart:dev
```

Base URL: `http://localhost:3010`

## 1. Start + Health

- [ ] PASS / [ ] FAIL: Server starts without crash.
- [ ] PASS / [ ] FAIL: `http://localhost:3010` loads gallery.
- Notes:

## 2. Carousel Scroll Behavior

- [ ] PASS / [ ] FAIL: Scroll changes centered poster smoothly.
- [ ] PASS / [ ] FAIL: No stuck/frozen carousel state.
- [ ] PASS / [ ] FAIL: Non-centered posters do not respond to flip/open.
- Notes:

## 3. Centered Poster Interaction Rules

- [ ] PASS / [ ] FAIL: Centered poster click flips correctly.
- [ ] PASS / [ ] FAIL: Shift+click (or Shift+Enter) opens expected article/full view behavior.
- [ ] PASS / [ ] FAIL: Scroll clamp/sync remains stable while interacting.
- Notes:

## 4. Unified Editor Load + Preview Parity

URL: `http://localhost:3010/unified-editor.html`

- [ ] PASS / [ ] FAIL: Editor loads poster list and details.
- [ ] PASS / [ ] FAIL: v2 back preview typography/layout matches carousel style.
- Notes:

## 5. Unified Editor Single-Poster CRUD

- [ ] PASS / [ ] FAIL: Edit title/text/category on one poster and save.
- [ ] PASS / [ ] FAIL: Reload editor and confirm change persisted.
- [ ] PASS / [ ] FAIL: Reload gallery and confirm change reflected.
- Notes:

## 6. Unified Editor Multi-Select + Bulk Actions

- [ ] PASS / [ ] FAIL: `Ctrl/Cmd + click` toggles selection.
- [ ] PASS / [ ] FAIL: `Shift + click` range selection works.
- [ ] PASS / [ ] FAIL: Bulk add category works.
- [ ] PASS / [ ] FAIL: Bulk remove category works.
- [ ] PASS / [ ] FAIL: Bulk delete removes selected posters only.
- Notes:

## 7. Category Fallback Behavior

- [ ] PASS / [ ] FAIL: Removing last real category assigns `No-Category`.
- [ ] PASS / [ ] FAIL: `No-Category` appears as filterable value.
- [ ] PASS / [ ] FAIL: Adding a real category removes fallback labels (`No-Category` / `Uncategorized`).
- Notes:

## 8. Category Editor CRUD + Cascade

URL: `http://localhost:3010/category-editor.html`

- [ ] PASS / [ ] FAIL: Create test category works.
- [ ] PASS / [ ] FAIL: Rename/update category works.
- [ ] PASS / [ ] FAIL: Delete category cascades removal from affected posters.
- Notes:

## 9. AI Topic Suggestions (UI)

Precheck: `OPENROUTER_API_KEY` set in `.env`.

- [ ] PASS / [ ] FAIL: `Suggest Topics (AI)` returns results with `openai/gpt-4o-mini`.
- [ ] PASS / [ ] FAIL: `Suggest Topics (AI)` returns results with `google/gemini-3-flash-preview`.
- [ ] PASS / [ ] FAIL: Error state is clear/user-readable when request fails or key is missing.
- Notes:

## 10. Unified Generator Run + Logs

- [ ] PASS / [ ] FAIL: Generation run works with Wikipedia source.
- [ ] PASS / [ ] FAIL: Generation run works with Hugging Face source.
- [ ] PASS / [ ] FAIL: Run log updates via `/api/grab-log`.
- Notes:

## 11. API Validation Negative Tests

Use malformed payloads for:
- `POST /api/model-intel/normalize-openrouter`
- `POST /api/model-intel/capabilities`
- `POST /api/model-intel/benchmarks/parse-match`

- [ ] PASS / [ ] FAIL: Invalid request returns HTTP `400`.
- [ ] PASS / [ ] FAIL: Response includes consistent validation `details`.
- Notes:

## 12. Regression: Poster List Filtering

- [ ] PASS / [ ] FAIL: `.log` / `skip-log` entries are not shown as posters in Unified Editor.
- Notes:

## Final Signoff

- [ ] PASS / [ ] FAIL: Ready for next dev iteration.
- Blocking issues:
- Follow-up tasks:

