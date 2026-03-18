# Session Notes (2026-02-14)

## Scope
- Addressed QA blockers from `MANUAL_QA_CHECKLIST.md` around:
  - unwanted AI-biased topic suggestions
  - poor topic suggestion CRUD flow
  - Wikipedia generation behavior on failed/ambiguous topics

## What Changed
- Category Editor topic suggestion UX now stages suggestions in a separate draft area instead of auto-inserting into active topics.
- Added explicit apply controls:
  - `Add Suggestions` (merge with existing topics)
  - `Replace Topics` (replace active list)
  - `Clear Suggestions`
- AI suggestion request now requires and uses category description as primary context.
- AI suggestion logic is source-aware (`wikipedia` vs `huggingface`) to reduce invalid topic formats.
- Removed default AI framing from topic suggestion prompting.
- Added explicit prompt rule to avoid `AI` / `AI_` prefixes unless requested by description.
- Wikipedia source adapter now creates placeholder posters when:
  - lookup fails (404/network/other request failure)
  - result is ambiguous/disambiguation
- Placeholder posters keep requested topic title/rubric and category classification so users can complete content manually in Unified Editor.
- Ambiguous Wikipedia topics now include clarification candidates (search suggestions) in the placeholder back text.

## Files Updated
- `category-editor.html`
- `js/category-editor.js`
- `server.js`
- `scripts/python/sources/wikipedia.py`
- `MANUAL_QA_CHECKLIST.md` (created earlier in session)

## Behavioral Decisions Captured
1. Category context for suggestions should come from user-entered description, not auto-injected AI framing.
2. AI suggestions must be reviewable/editable before they affect generation topics.
3. Wikipedia generation should not hard-fail category runs due to bad or ambiguous topics; draft placeholders are acceptable and preferred.

## Validation Performed
- JS syntax checks:
  - `node --check server.js`
  - `node --check js/category-editor.js`
- Python syntax check:
  - `python -m py_compile scripts/python/sources/wikipedia.py`
- Wikipedia generator smoke test:
  - `python scripts/python/grab.py --source wikipedia --category "QA Placeholder" --topics "John_Nash,NotARealTopic_12345" --count 2 --merge-enrich false --output-dir ai_posters_tmp_test`
  - Confirmed placeholder posters were created for failed lookups.

## Known Follow-Ups
- Re-run manual QA sections:
  - Section 9 (AI topic suggestions)
  - Section 10 (generator run/log behavior)
- Validate disambiguation path with active network:
  - topic example: `John_Nash`
  - expected: placeholder with clarifying candidates like `John_Nash_(mathematician)` when returned by search API
- Optional UX follow-ups still pending from QA:
  - unified editor save feedback improvement
  - focus retention after category create/update
  - clearer separation of category operations vs poster operations

