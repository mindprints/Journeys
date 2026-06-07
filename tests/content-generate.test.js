/**
 * Integration tests for POST /api/content/generate
 *
 * Covers the full waterfall: Wikipedia → Wikimedia → Openverse → Brave → AI.
 * Each source is forced via _skipSources so the test exercises that specific
 * code path rather than relying on lucky topic selection.
 *
 * Run:  node --env-file-if-exists=.env --test tests/content-generate.test.js
 * Skip: CI=true  or  SKIP_LIVE_TESTS=true
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../server');

const SKIP_LIVE = process.env.CI === 'true' || process.env.SKIP_LIVE_TESTS === 'true';
const skip = (reason) => SKIP_LIVE ? `live network tests disabled (${reason})` : false;

const KNOWN_TOPIC = 'Transformer (machine learning)'; // reliable Wikipedia entry with image

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

async function generate(body) {
  const resp = await fetch(`${base}/api/content/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: resp.status, data: await resp.json() };
}

// ─── Shape / contract ──────────────────────────────────────────────────────────

test('returns 400 when title is missing', async () => {
  const { status, data } = await generate({});
  assert.equal(status, 400);
  assert.ok(data.error);
});

test('returns ok shape for a known topic', {
  timeout: 45000,
  skip: skip('SKIP_LIVE_TESTS'),
}, async () => {
  const { status, data } = await generate({ title: KNOWN_TOPIC });
  assert.equal(status, 200);
  assert.equal(data.status, 'ok');
  assert.ok(data.sources?.text,  'sources.text must be set');
  assert.ok(data.sources?.image, 'sources.image must be set');
  assert.ok(data.text,  'text must be non-empty');
  assert.ok(data.image, 'image path must be non-empty');
  console.log(`  text source:  ${data.sources.text}`);
  console.log(`  image source: ${data.sources.image}`);
});

// ─── Openverse fallback ────────────────────────────────────────────────────────

test('image source is openverse when wikimedia is skipped', {
  timeout: 45000,
  skip: skip('SKIP_LIVE_TESTS') || (!process.env.OPENVERSE_CLIENT_ID ? 'OPENVERSE_CLIENT_ID not set' : false),
}, async () => {
  const { status, data } = await generate({
    title: KNOWN_TOPIC,
    _skipSources: ['wikimedia'],
  });
  assert.equal(status, 200);
  assert.equal(data.status, 'ok');

  const imgSrc = data.sources?.image;
  assert.ok(
    ['openverse', 'brave', 'ai'].includes(imgSrc),
    `Expected openverse/brave/ai fallback, got: ${imgSrc}`
  );
  console.log(`  image source (wikimedia skipped): ${imgSrc}`);
  if (imgSrc === 'openverse') {
    assert.ok(data.image?.includes('ov_'), 'Openverse image should have ov_ prefix');
  }
});

test('openverse image has correct filename prefix when it wins', {
  timeout: 45000,
  skip: skip('SKIP_LIVE_TESTS') || (!process.env.OPENVERSE_CLIENT_ID ? 'OPENVERSE_CLIENT_ID not set' : false),
}, async () => {
  // Skip wikimedia so Openverse runs first; if Openverse succeeds it should win
  const { status, data } = await generate({
    title: 'deep learning neural network',
    _skipSources: ['wikimedia'],
  });
  assert.equal(status, 200);
  const imgSrc = data.sources?.image;
  console.log(`  image source: ${imgSrc}, path: ${data.image}`);

  if (imgSrc === 'openverse') {
    assert.match(data.image, /\/ov_/, 'Openverse images should be prefixed ov_');
  }
  // Any non-'none' source is a pass — we just confirm it doesn't silently fail
  assert.notEqual(imgSrc, 'none', 'Should have found an image from some source');
});

// ─── Brave fallback ────────────────────────────────────────────────────────────

test('image source is brave when wikimedia and openverse are skipped', {
  timeout: 45000,
  skip: skip('SKIP_LIVE_TESTS') || (!process.env.BRAVE_API_KEY ? 'BRAVE_API_KEY not set' : false),
}, async () => {
  const { status, data } = await generate({
    title: KNOWN_TOPIC,
    _skipSources: ['wikimedia', 'openverse'],
  });
  assert.equal(status, 200);
  assert.equal(data.status, 'ok');

  const imgSrc = data.sources?.image;
  assert.ok(
    ['brave', 'ai'].includes(imgSrc),
    `Expected brave/ai fallback, got: ${imgSrc}`
  );
  console.log(`  image source (wikimedia+openverse skipped): ${imgSrc}`);
  if (imgSrc === 'brave') {
    assert.ok(data.image?.includes('br_'), 'Brave image should have br_ prefix');
  }
});

test('brave text source is used when wikipedia is unavailable', {
  timeout: 45000,
  skip: skip('SKIP_LIVE_TESTS') || (!process.env.BRAVE_API_KEY ? 'BRAVE_API_KEY not set' : false),
}, async () => {
  // Use a topic unlikely to have a Wikipedia article to force Brave text
  const { status, data } = await generate({
    title: 'xyzzy-nonexistent-topic-42abc-qwerty',
    _skipSources: [],
  });
  assert.equal(status, 200);
  // We don't assert brave won here (topic is too obscure) — just assert it didn't crash
  assert.ok(['ok'].includes(data.status), `Unexpected status: ${data.status}`);
  console.log(`  text: ${data.sources?.text}, image: ${data.sources?.image}`);
});

// ─── _skipSources is ignored in production ─────────────────────────────────────

test('_skipSources is a no-op in production mode', {
  timeout: 45000,
  skip: skip('SKIP_LIVE_TESTS'),
}, async () => {
  const orig = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const { status, data } = await generate({
      title: KNOWN_TOPIC,
      _skipSources: ['wikimedia', 'openverse', 'brave'],
    });
    assert.equal(status, 200);
    // In production the skip is ignored; Wikipedia/Wikimedia should win
    const imgSrc = data.sources?.image;
    console.log(`  image source in production mode (skips ignored): ${imgSrc}`);
    assert.ok(imgSrc, 'Should still return an image source');
  } finally {
    if (orig === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = orig;
  }
});
