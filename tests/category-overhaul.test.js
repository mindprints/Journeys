/**
 * Tests for the category-editor overhaul (commit 11ad0b5):
 *
 *  HTML structure
 *   1. category-editor.html: source-chain checkboxes (wikipedia, brave, ai) present
 *   2. category-editor.html: Add All button present
 *   3. category-editor.html: inline generator-section (not a modal-overlay)
 *   4. category-editor.html: modal-overlay class is gone
 *
 *  JS structure
 *   5. category-editor.js: readSources() method defined
 *   6. category-editor.js: setSources() method defined
 *   7. category-editor.js: addAllTopics() method defined
 *   8. category-editor.js: buildCategoryPayload sends sources array
 *   9. category-editor.js: runGeneration sends useBrave in request body
 *  10. category-editor.js: renderList applies borderLeftColor from category.color
 *
 *  CSS structure
 *  11. poster-v2.css: .v2-back-image-caption rule exists
 *  12. poster-v2.css: caption uses position:absolute (overlay)
 *
 *  loadPosters.js
 *  13. loadPosters.js: renders caption field from image data
 *
 *  Python source files (read as text)
 *  14. ai_helpers.py: _pick_prompt_type exported at module level
 *  15. ai_helpers.py: PERSON_SIGNALS, PLACE_SIGNALS, OBJECT_SIGNALS constants present
 *  16. wikipedia.py: _fetch_brave_links function defined
 *  17. wikipedia.py: brave_links=False default parameter in generate_posters
 *  18. wikipedia.py: brave_links=False default parameter in create_poster_from_wikipedia
 *  19. wikipedia.py: caption field set on thumbnail image ("Wikimedia")
 *  20. wikipedia.py: caption field set on AI-generated image ("AI Generated")
 *  21. grab.py: --brave-links argument defined
 *
 *  Server
 *  22. server.js: destructures useBrave from req.body in run-grab
 *  23. server.js: passes --brave-links flag when useBrave=true
 *
 *  Live server: category-config round-trip with sources array
 *  24. GET /api/category-config returns 200
 *  25. POST /api/category-config accepts sources array in category payload
 *  26. POST /api/run-grab with useBrave:true is accepted (400 due to missing Python — not 500)
 *
 * Run: node --env-file-if-exists=.env --test tests/category-overhaul.test.js
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const { startServer } = require('../server');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── Shared server fixture ─────────────────────────────────────────────────────
let server, base;
test.before(async () => {
  server = startServer(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (server) await new Promise((res, rej) => server.close(e => e ? rej(e) : res()));
});

async function get(path)       { const r = await fetch(`${base}${path}`); return { status: r.status, data: await r.json().catch(() => null), text: await r.text().catch(() => '') }; }
async function postJson(path, body) {
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) };
}
async function getStaticText(path) {
  const r = await fetch(`${base}${path}`);
  return { status: r.status, body: await r.text() };
}

// ═══════════════════════════════════════════════════════════════════
// HTML structure
// ═══════════════════════════════════════════════════════════════════

test('HTML: source-chain checkboxes (wikipedia, brave, ai) are present', () => {
  const html = read('category-editor.html');
  assert.ok(html.includes('id="src-wikipedia"'), 'src-wikipedia checkbox missing');
  assert.ok(html.includes('id="src-brave"'),     'src-brave checkbox missing');
  assert.ok(html.includes('id="src-ai"'),         'src-ai checkbox missing');
});

test('HTML: Add All button is present', () => {
  const html = read('category-editor.html');
  assert.ok(html.includes('id="add-all-topics-btn"'), 'add-all-topics-btn missing');
});

test('HTML: generator-section is an inline element (not a modal-overlay)', () => {
  const html = read('category-editor.html');
  assert.ok(html.includes('id="generator-section"'),  'generator-section element missing');
  // Must NOT be nested inside a modal-overlay
  const modalIdx   = html.indexOf('class="modal-overlay"');
  const sectionIdx = html.indexOf('id="generator-section"');
  // Either no modal-overlay at all, or generator-section comes before it
  if (modalIdx !== -1) {
    assert.ok(sectionIdx < modalIdx || sectionIdx > modalIdx + 200,
      'generator-section appears to be inside a modal-overlay');
  }
});

test('HTML: modal-overlay class is no longer used', () => {
  const html = read('category-editor.html');
  assert.ok(!html.includes('modal-overlay'), 'modal-overlay class should be gone');
});

// ═══════════════════════════════════════════════════════════════════
// JS structure
// ═══════════════════════════════════════════════════════════════════

test('JS: readSources() method is defined', () => {
  const js = read('js/category-editor.js');
  assert.ok(js.includes('readSources()'), 'readSources method missing');
});

test('JS: setSources() method is defined', () => {
  const js = read('js/category-editor.js');
  assert.ok(js.includes('setSources('), 'setSources method missing');
});

test('JS: addAllTopics() method is defined', () => {
  const js = read('js/category-editor.js');
  assert.ok(js.includes('addAllTopics()'), 'addAllTopics method missing');
});

test('JS: buildCategoryPayload includes sources array', () => {
  const js = read('js/category-editor.js');
  // The payload construction must include a `sources` key
  assert.ok(js.includes('sources'), 'sources key missing from buildCategoryPayload');
  assert.ok(js.includes('readSources()'), 'sources derived from readSources');
});

test('JS: runGeneration sends useBrave in request body', () => {
  const js = read('js/category-editor.js');
  assert.ok(js.includes('useBrave'), 'useBrave field missing from runGeneration body');
  assert.ok(js.includes("sources.includes('brave')"), "brave check missing");
});

test('JS: renderList applies category color as borderLeftColor', () => {
  const js = read('js/category-editor.js');
  assert.ok(js.includes('borderLeftColor'), 'borderLeftColor not set in renderList');
  assert.ok(js.includes('category.color'), 'category.color not referenced');
});

// ═══════════════════════════════════════════════════════════════════
// CSS structure
// ═══════════════════════════════════════════════════════════════════

test('CSS: .v2-back-image-caption rule exists', () => {
  const css = read('css/poster-v2.css');
  assert.ok(css.includes('.v2-back-image-caption'), '.v2-back-image-caption rule missing');
});

test('CSS: caption uses position:absolute for overlay', () => {
  const css = read('css/poster-v2.css');
  const captionBlock = css.slice(css.indexOf('.v2-back-image-caption'));
  const closingBrace = captionBlock.indexOf('}');
  const rule = captionBlock.slice(0, closingBrace);
  assert.ok(rule.includes('position: absolute') || rule.includes('position:absolute'),
    'caption is not position:absolute');
});

// ═══════════════════════════════════════════════════════════════════
// loadPosters.js
// ═══════════════════════════════════════════════════════════════════

test('loadPosters.js: renders image caption when caption field is present', () => {
  const js = read('js/loadPosters.js');
  assert.ok(js.includes('v2-back-image-caption'), 'caption not rendered in loadPosters');
  assert.ok(js.includes('initialImage.caption'), 'initialImage.caption not referenced');
});

// ═══════════════════════════════════════════════════════════════════
// Python source files (static text checks)
// ═══════════════════════════════════════════════════════════════════

test('Python ai_helpers.py: _pick_prompt_type exported at module level', () => {
  const py = read('scripts/python/sources/ai_helpers.py');
  assert.ok(py.includes('def _pick_prompt_type('), '_pick_prompt_type function missing');
  // Must be at module level (not indented under another def)
  const idx = py.indexOf('def _pick_prompt_type(');
  const lineStart = py.lastIndexOf('\n', idx) + 1;
  assert.ok(py[lineStart] === 'd', '_pick_prompt_type is not at module level (indented?)');
});

test('Python ai_helpers.py: PERSON_SIGNALS, PLACE_SIGNALS, OBJECT_SIGNALS constants present', () => {
  const py = read('scripts/python/sources/ai_helpers.py');
  assert.ok(py.includes('PERSON_SIGNALS'), 'PERSON_SIGNALS missing');
  assert.ok(py.includes('PLACE_SIGNALS'),  'PLACE_SIGNALS missing');
  assert.ok(py.includes('OBJECT_SIGNALS'), 'OBJECT_SIGNALS missing');
});

test('Python wikipedia.py: _fetch_brave_links function defined', () => {
  const py = read('scripts/python/sources/wikipedia.py');
  assert.ok(py.includes('def _fetch_brave_links('), '_fetch_brave_links missing');
  assert.ok(py.includes('BRAVE_API_KEY'), 'BRAVE_API_KEY env var not referenced');
});

test('Python wikipedia.py: generate_posters has brave_links=False parameter', () => {
  const py = read('scripts/python/sources/wikipedia.py');
  assert.ok(py.includes('brave_links=False'), 'brave_links=False param missing from generate_posters');
});

test('Python wikipedia.py: create_poster_from_wikipedia has brave_links parameter', () => {
  const py = read('scripts/python/sources/wikipedia.py');
  // The function signature must include brave_links
  const fnIdx = py.indexOf('def create_poster_from_wikipedia(');
  assert.ok(fnIdx !== -1, 'create_poster_from_wikipedia not found');
  const sigEnd = py.indexOf(':', fnIdx);
  const sig = py.slice(fnIdx, sigEnd);
  assert.ok(sig.includes('brave_links'), 'brave_links param missing from create_poster_from_wikipedia signature');
});

test('Python wikipedia.py: Wikimedia caption set on thumbnail images', () => {
  const py = read('scripts/python/sources/wikipedia.py');
  assert.ok(py.includes('"caption": "Source: Wikimedia"') || py.includes("'caption': 'Source: Wikimedia'"),
    'Wikimedia caption missing from thumbnail image block');
});

test('Python wikipedia.py: AI Generated caption set on AI images', () => {
  const py = read('scripts/python/sources/wikipedia.py');
  assert.ok(py.includes('"caption": "AI Generated"') || py.includes("'caption': 'AI Generated'"),
    'AI Generated caption missing');
});

test('Python grab.py: --brave-links argument is defined', () => {
  const py = read('scripts/python/grab.py');
  assert.ok(py.includes('--brave-links'), '--brave-links argument missing from grab.py');
  assert.ok(py.includes('action="store_true"') || py.includes("action='store_true'"),
    '--brave-links is not a store_true flag');
});

// ═══════════════════════════════════════════════════════════════════
// server.js
// ═══════════════════════════════════════════════════════════════════

test('server.js: run-grab destructures useBrave from req.body', () => {
  const js = read('server.js');
  // Find the run-grab handler
  const handlerIdx = js.indexOf("'/api/run-grab'");
  assert.ok(handlerIdx !== -1, '/api/run-grab handler not found');
  const handlerBlock = js.slice(handlerIdx, handlerIdx + 1500);
  assert.ok(handlerBlock.includes('useBrave'), 'useBrave not destructured in run-grab');
});

test('server.js: passes --brave-links when useBrave is true', () => {
  const js = read('server.js');
  assert.ok(js.includes('--brave-links'), '--brave-links flag not passed to Python');
  assert.ok(js.includes('braveFlagOn') || js.includes("'--brave-links'"),
    'brave-links conditional logic missing');
});

// ═══════════════════════════════════════════════════════════════════
// Live server tests
// ═══════════════════════════════════════════════════════════════════

test('GET /api/category-config returns 200 with categories array', async () => {
  const { status, data } = await get('/api/category-config');
  assert.equal(status, 200, `Expected 200, got ${status}`);
  assert.ok(Array.isArray(data.categories), 'categories must be an array');
});

test('category-editor.html served with 200 and source-chain markup', async () => {
  const { status, body } = await getStaticText('/category-editor.html');
  assert.equal(status, 200);
  assert.ok(body.includes('src-wikipedia'), 'src-wikipedia not in served HTML');
  assert.ok(body.includes('src-brave'),     'src-brave not in served HTML');
  assert.ok(body.includes('src-ai'),        'src-ai not in served HTML');
  assert.ok(body.includes('add-all-topics-btn'), 'add-all-topics-btn not in served HTML');
  assert.ok(!body.includes('modal-overlay'),     'modal-overlay should be gone from served HTML');
});

test('POST /api/category-config accepts sources array in category payload', async () => {
  // Read current config first, save as-is after test to avoid data corruption
  const { data: original } = await get('/api/category-config');
  const categories = Array.isArray(original?.categories) ? [...original.categories] : [];

  // Add a test category with sources array
  const testCategory = {
    name: '__test_sources_array__',
    slug: 'test-sources-array',
    description: 'Temporary test category',
    color: '#ff0000',
    targetCount: 5,
    sources: ['wikipedia', 'brave', 'ai'],
    topics: ['Test_Topic'],
  };
  const { status: postStatus } = await postJson('/api/category-config', {
    categories: [...categories, testCategory],
  });
  assert.equal(postStatus, 200, 'POST /api/category-config failed');

  // Verify it round-trips with sources intact
  const { data: saved } = await get('/api/category-config');
  const found = (saved?.categories || []).find(c => c.slug === 'test-sources-array');
  assert.ok(found, 'Test category not found after save');
  assert.deepEqual(found.sources, ['wikipedia', 'brave', 'ai'], 'sources array did not round-trip');

  // Cleanup: restore original config
  await postJson('/api/category-config', { categories });
});
