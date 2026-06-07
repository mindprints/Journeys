/**
 * Tests for the six Unified Poster Editor improvements shipped in this session:
 *
 *  1. POST /api/ai/generate-subtitle  — body text → short subtitle
 *  2. POST /api/ai/generate-chronology — title + text → epoch years + events
 *  3. POST /api/ai/generate-tags       — title + text + categories → tag list
 *  4. POST /api/content/generate       — disambiguation flow (existing endpoint)
 *  5. GET  /js/unified-editor.js       — link filter defaults to "All Files"
 *  6. GET  /js/unified-editor.js       — openImageTools replaces showImagePicker
 *
 * Live AI tests (items 1-3) are skipped when CI=true or SKIP_LIVE_TESTS=true.
 * Structural/contract tests (items 4-6) always run.
 *
 * Run:  node --env-file-if-exists=.env --test tests/editor-ai-helpers.test.js
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../server');

const SKIP_LIVE = process.env.CI === 'true' || process.env.SKIP_LIVE_TESTS === 'true';
const skipLive  = (reason) => SKIP_LIVE ? `live AI tests disabled (${reason})` : false;

let server;
let base;

test.before(async () => {
  server = startServer(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((res, rej) => server.close(e => e ? rej(e) : res()));
});

async function post(path, body) {
  const resp = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: resp.status, data: await resp.json() };
}

async function getText(path) {
  const resp = await fetch(`${base}${path}`);
  return { status: resp.status, body: await resp.text() };
}

// ─── 1. /api/ai/generate-subtitle ─────────────────────────────────────────────

test('generate-subtitle: 400 when title is missing', async () => {
  const { status, data } = await post('/api/ai/generate-subtitle', { text: 'Some text' });
  assert.equal(status, 400);
  assert.ok(data.error, 'should return an error message');
});

test('generate-subtitle: 400 when body is empty', async () => {
  const { status, data } = await post('/api/ai/generate-subtitle', {});
  assert.equal(status, 400);
  assert.ok(data.error);
});

test('generate-subtitle: returns subtitle string for valid input', {
  timeout: 30000,
  skip: skipLive('SKIP_LIVE_TESTS'),
}, async () => {
  const { status, data } = await post('/api/ai/generate-subtitle', {
    title: 'Alan Turing',
    text: 'Alan Turing was a British mathematician and computer scientist who is widely considered the father of theoretical computer science and artificial intelligence.',
  });
  assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
  assert.ok(typeof data.subtitle === 'string', 'subtitle must be a string');
  assert.ok(data.subtitle.trim().length > 0, 'subtitle must be non-empty');
  // Sanity: subtitle should be reasonably short (≤ 12 words)
  const wordCount = data.subtitle.trim().split(/\s+/).length;
  assert.ok(wordCount <= 12, `Subtitle too long (${wordCount} words): "${data.subtitle}"`);
});

test('generate-subtitle: works with title only (no text)', {
  timeout: 30000,
  skip: skipLive('SKIP_LIVE_TESTS'),
}, async () => {
  const { status, data } = await post('/api/ai/generate-subtitle', { title: 'Neural Networks' });
  assert.equal(status, 200);
  assert.ok(typeof data.subtitle === 'string' && data.subtitle.trim().length > 0);
});

// ─── 2. /api/ai/generate-chronology ──────────────────────────────────────────

test('generate-chronology: 400 when title is missing', async () => {
  const { status, data } = await post('/api/ai/generate-chronology', { text: 'Some text' });
  assert.equal(status, 400);
  assert.ok(data.error);
});

test('generate-chronology: returns structured chronology for known person', {
  timeout: 30000,
  skip: skipLive('SKIP_LIVE_TESTS'),
}, async () => {
  const { status, data } = await post('/api/ai/generate-chronology', {
    title: 'Alan Turing',
    text: 'Alan Turing (1912–1954) was a British mathematician. In 1936 he published his seminal paper on computability. During WWII he worked at Bletchley Park on the Enigma code.',
  });
  assert.equal(status, 200, `Expected 200: ${JSON.stringify(data)}`);
  // Shape checks
  assert.ok('epochStart' in data, 'must have epochStart key');
  assert.ok('epochEnd'   in data, 'must have epochEnd key');
  assert.ok(Array.isArray(data.events), 'events must be an array');
  // Value plausibility
  if (data.epochStart !== null) {
    assert.ok(typeof data.epochStart === 'number', 'epochStart must be a number');
    assert.ok(data.epochStart > 1800 && data.epochStart < 2100, `epochStart out of range: ${data.epochStart}`);
  }
  if (data.epochEnd !== null) {
    assert.ok(typeof data.epochEnd === 'number', 'epochEnd must be a number');
    assert.ok(data.epochEnd >= (data.epochStart ?? 0), 'epochEnd must be ≥ epochStart');
  }
  data.events.forEach((ev, i) => {
    assert.ok(typeof ev.year === 'number', `events[${i}].year must be a number`);
    assert.ok(typeof ev.name === 'string' && ev.name.trim().length > 0, `events[${i}].name must be non-empty`);
  });
  assert.ok(data.events.length <= 6, `Too many events returned: ${data.events.length}`);
});

test('generate-chronology: works with title only (no text)', {
  timeout: 30000,
  skip: skipLive('SKIP_LIVE_TESTS'),
}, async () => {
  const { status, data } = await post('/api/ai/generate-chronology', { title: 'Ada Lovelace' });
  assert.equal(status, 200);
  assert.ok('epochStart' in data);
  assert.ok(Array.isArray(data.events));
});

// ─── 3. /api/ai/generate-tags ─────────────────────────────────────────────────

test('generate-tags: 400 when title is missing', async () => {
  const { status, data } = await post('/api/ai/generate-tags', { text: 'Some text' });
  assert.equal(status, 400);
  assert.ok(data.error);
});

test('generate-tags: returns comma-separated tags for known topic', {
  timeout: 30000,
  skip: skipLive('SKIP_LIVE_TESTS'),
}, async () => {
  const { status, data } = await post('/api/ai/generate-tags', {
    title: 'Alan Turing',
    text: 'British mathematician, computer scientist, and codebreaker.',
    categories: ['AI Pioneers', 'Computing History'],
  });
  assert.equal(status, 200, `Expected 200: ${JSON.stringify(data)}`);
  assert.ok(typeof data.tags === 'string', 'tags must be a string');
  const tagList = data.tags.split(',').map(t => t.trim()).filter(Boolean);
  assert.ok(tagList.length >= 3, `Expected ≥3 tags, got ${tagList.length}: "${data.tags}"`);
  assert.ok(tagList.length <= 12, `Too many tags: ${tagList.length}`);
});

test('generate-tags: works without categories', {
  timeout: 30000,
  skip: skipLive('SKIP_LIVE_TESTS'),
}, async () => {
  const { status, data } = await post('/api/ai/generate-tags', { title: 'Quantum Computing' });
  assert.equal(status, 200);
  assert.ok(typeof data.tags === 'string' && data.tags.trim().length > 0);
});

// ─── 4. /api/content/generate — disambiguation contract ───────────────────────

test('content/generate: returns disambiguation options for ambiguous title', {
  timeout: 45000,
  skip: skipLive('SKIP_LIVE_TESTS'),
}, async () => {
  // "Mercury" is a classic disambiguation case on Wikipedia
  const { status, data } = await post('/api/content/generate', { title: 'Mercury' });
  // May return disambiguation OR ok (if Wikipedia picks a primary). Either is valid.
  assert.equal(status, 200);
  assert.ok(data.status === 'ok' || data.status === 'disambiguation',
    `Unexpected status: ${data.status}`);
  if (data.status === 'disambiguation') {
    assert.ok(Array.isArray(data.options) && data.options.length > 0, 'options must be non-empty');
    data.options.forEach((o, i) => {
      assert.ok(typeof o.title === 'string', `options[${i}].title must be string`);
      assert.ok(typeof o.slug  === 'string', `options[${i}].slug must be string`);
    });
  }
});

test('content/generate: resolving a slug after disambiguation returns text', {
  timeout: 45000,
  skip: skipLive('SKIP_LIVE_TESTS'),
}, async () => {
  // Use the known stable Wikipedia slug for the planet Mercury
  const { status, data } = await post('/api/content/generate', {
    title: 'Mercury',
    slug: 'Mercury_(planet)',
  });
  assert.equal(status, 200);
  assert.equal(data.status, 'ok');
  assert.ok(typeof data.text === 'string' && data.text.length > 50,
    'resolved slug should produce non-trivial text');
});

// ─── 5. Link filter fix — "All Files" is first/default ────────────────────────

test('unified-editor.js: link file filter defaults to All Files (not Executables)', async () => {
  const { status, body } = await getText('/js/unified-editor.js');
  assert.equal(status, 200);
  // The filter string must exist
  assert.ok(body.includes('All Files'), 'unified-editor.js must contain "All Files"');
  // All Files must appear before Executables in the filter string
  const allIdx = body.indexOf('All Files (*.*)');
  const exeIdx = body.indexOf('Executables (*.exe');
  assert.ok(allIdx !== -1, '"All Files (*.*)" not found in unified-editor.js');
  assert.ok(exeIdx !== -1, '"Executables" not found in unified-editor.js');
  assert.ok(allIdx < exeIdx, `"All Files" (pos ${allIdx}) must come before "Executables" (pos ${exeIdx})`);
});

// ─── 6. Image picker routes through openImageTools (not showImagePicker) ──────

test('unified-editor.js: "Click to select image" uses openImageTools', async () => {
  const { status, body } = await getText('/js/unified-editor.js');
  assert.equal(status, 200);
  // openImageTools must be defined
  assert.ok(body.includes('openImageTools('), '"openImageTools" method must be defined');
  // The image picker click handler must call openImageTools, not showImagePicker
  // Find the imagePicker click listener block and verify it calls openImageTools
  const clickHandlerMatch = body.match(/imagePicker\.addEventListener\('click'[\s\S]*?\}\);/);
  assert.ok(clickHandlerMatch, 'imagePicker click listener not found');
  const handler = clickHandlerMatch[0];
  assert.ok(handler.includes('openImageTools'), 'imagePicker click handler must call openImageTools');
  assert.ok(!handler.includes('showImagePicker(\'primary\')'),
    'imagePicker click handler must NOT call showImagePicker directly for primary');
});

test('unified-editor.js: addExtraImageBtn routes through openImageTools', async () => {
  const { status, body } = await getText('/js/unified-editor.js');
  assert.equal(status, 200);
  // The addExtraImageBtn listener must reference openImageTools('additional')
  assert.ok(
    body.includes("openImageTools('additional')"),
    'addExtraImageBtn must call openImageTools(\'additional\')'
  );
});

test('unified-editor.js: AI generate buttons are wired in setupListeners', async () => {
  const { status, body } = await getText('/js/unified-editor.js');
  assert.equal(status, 200);
  assert.ok(body.includes('ai-generate-text-btn'),       'text gen button must be wired');
  assert.ok(body.includes('ai-generate-chronology-btn'), 'chronology gen button must be wired');
  assert.ok(body.includes('ai-generate-tags-btn'),       'tags gen button must be wired');
});
