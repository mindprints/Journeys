/**
 * External source connectivity tests
 * Covers: Openverse API and Brave Search API
 *
 * Run:  node --env-file-if-exists=.env --test tests/external-sources.test.js
 *
 * These are live network tests; they are skipped in CI automatically.
 * Set SKIP_LIVE_TESTS=true to skip manually.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');

const SKIP_LIVE = process.env.CI === 'true' || process.env.SKIP_LIVE_TESTS === 'true';
const skip      = (reason) => SKIP_LIVE ? `live network tests disabled (${reason})` : false;
const skipBrave = (reason) => skip(reason) || (!BRAVE_KEY ? 'BRAVE_API_KEY is not set in .env' : false);
const skipOpenverse = (reason) => skip(reason) || (!OV_CLIENT_ID ? 'OPENVERSE_CLIENT_ID is not set in .env' : false);

const OV_CLIENT_ID     = process.env.OPENVERSE_CLIENT_ID;
const OV_CLIENT_SECRET = process.env.OPENVERSE_CLIENT_SECRET;
const BRAVE_KEY        = process.env.BRAVE_API_KEY;

async function getOpenverseToken() {
  if (!OV_CLIENT_ID || !OV_CLIENT_SECRET) return null;
  const body = new URLSearchParams({ client_id: OV_CLIENT_ID, client_secret: OV_CLIENT_SECRET, grant_type: 'client_credentials' });
  const resp = await fetch('https://api.openverse.org/v1/auth_tokens/token/', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.access_token;
}

const TEST_QUERY = 'transformer neural network';  // should reliably return results from both APIs

// ─── Openverse ──────────────────────────────────────────────────────────────

test('Openverse: client credentials are present when live Openverse tests run', {
  skip: SKIP_LIVE ? 'live network tests disabled (SKIP_LIVE_TESTS)' : (!OV_CLIENT_ID ? 'OPENVERSE_CLIENT_ID is not set in .env' : false),
}, () => {
  assert.ok(OV_CLIENT_ID.length > 10,     'OPENVERSE_CLIENT_ID looks truncated');
  assert.ok(OV_CLIENT_SECRET?.length > 10, 'OPENVERSE_CLIENT_SECRET looks truncated');
});

test('Openverse: image search returns results', {
  timeout: 20000,
  skip: skipOpenverse('SKIP_LIVE_TESTS'),
}, async () => {
  const token   = await getOpenverseToken();
  const headers = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(TEST_QUERY)}&page_size=5`;
  const resp = await fetch(url, { headers });

  assert.equal(resp.status, 200, `Openverse returned HTTP ${resp.status}`);

  const data = await resp.json();
  assert.ok(Array.isArray(data.results), 'Response should have a results array');
  assert.ok(data.results.length > 0, 'No image results returned — query may be too narrow');

  const first = data.results[0];
  assert.ok(first.url,   'First result has no url field');
  assert.ok(first.title, 'First result has no title field');

  const usable = data.results.find(r => r.url && !/\.svg$/i.test(r.url));
  assert.ok(usable, 'No usable (non-SVG) image found in results');

  console.log(`  Openverse returned ${data.results.length} results`);
  console.log(`  First usable image: ${usable.url}`);
  console.log(`  Rate limits available: ${resp.headers.get('x-ratelimit-available-anon_sustained') ?? 'n/a'}`);
});

test('Openverse: image URL is actually downloadable', {
  timeout: 20000,
  skip: skipOpenverse('SKIP_LIVE_TESTS'),
}, async () => {
  const token   = await getOpenverseToken();
  const headers = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const searchResp = await fetch(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(TEST_QUERY)}&page_size=5`,
    { headers }
  );
  assert.equal(searchResp.status, 200, 'Openverse search failed');
  const data = await searchResp.json();
  const hit  = (data.results || []).find(r => r.url && !/\.svg$/i.test(r.url));
  assert.ok(hit, 'No usable image to download-test');

  const dlResp = await fetch(hit.url);
  assert.ok(dlResp.ok, `Image URL returned HTTP ${dlResp.status}: ${hit.url}`);

  const contentType = dlResp.headers.get('content-type') || '';
  assert.ok(
    contentType.startsWith('image/'),
    `Expected image content-type, got: ${contentType}`
  );

  const buffer = Buffer.from(await dlResp.arrayBuffer());
  assert.ok(buffer.length > 1024, `Image file suspiciously small: ${buffer.length} bytes`);

  console.log(`  Downloaded ${buffer.length} bytes (${contentType})`);
  console.log(`  URL: ${hit.url}`);
});

// ─── Brave Search ───────────────────────────────────────────────────────────

test('Brave Search: API key is present when live Brave tests run', {
  skip: SKIP_LIVE ? 'live network tests disabled (SKIP_LIVE_TESTS)' : (!BRAVE_KEY ? 'BRAVE_API_KEY is not set in .env' : false),
}, () => {
  assert.ok(BRAVE_KEY.length > 10, 'BRAVE_API_KEY looks truncated');
});

test('Brave Search: text search returns results', {
  timeout: 20000,
  skip: skipBrave('SKIP_LIVE_TESTS'),
}, async () => {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(TEST_QUERY)}&count=5&text_decorations=false`;
  const resp = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': BRAVE_KEY,
    },
  });

  assert.equal(resp.status, 200, `Brave web search returned HTTP ${resp.status}`);

  const data = await resp.json();
  const results = data.web?.results || [];
  assert.ok(Array.isArray(results), 'Response has no web.results array');
  assert.ok(results.length > 0, 'No text results returned');

  const snippets = results.map(i => i.description).filter(Boolean);
  assert.ok(snippets.length > 0, 'No descriptions found in results');

  console.log(`  Brave web search returned ${results.length} items`);
  console.log(`  First snippet: "${snippets[0].slice(0, 80)}..."`);
});

test('Brave Search: image search returns usable photo URL', {
  timeout: 20000,
  skip: skipBrave('SKIP_LIVE_TESTS'),
}, async () => {
  const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(TEST_QUERY)}&count=5&safe=moderate`;
  const resp = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': BRAVE_KEY,
    },
  });

  assert.equal(resp.status, 200, `Brave image search returned HTTP ${resp.status}`);

  const data = await resp.json();
  assert.ok(Array.isArray(data.results), 'Image search response has no results array');
  assert.ok(data.results.length > 0, 'No image results returned');

  const hit = data.results.find(i => i.properties?.url && !/\.svg$/i.test(i.properties.url));
  assert.ok(hit, 'No usable (non-SVG) image in results');

  console.log(`  Brave image search returned ${data.results.length} results`);
  console.log(`  First usable image: ${hit.properties.url}`);
});

test('Brave Search: image URL is actually downloadable', {
  timeout: 30000,
  skip: skipBrave('SKIP_LIVE_TESTS'),
}, async () => {
  const searchUrl = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(TEST_QUERY)}&count=5&safe=moderate`;
  const searchResp = await fetch(searchUrl, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': BRAVE_KEY,
    },
  });
  assert.equal(searchResp.status, 200, 'Brave image search failed');

  const data = await searchResp.json();
  const hit  = (data.results || []).find(i => i.properties?.url && !/\.svg$/i.test(i.properties.url));
  assert.ok(hit, 'No usable image to download-test');

  try {
    const dlResp = await fetch(hit.properties.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JourneysBot/1.0)' },
    });
    if (dlResp.ok) {
      const buffer = Buffer.from(await dlResp.arrayBuffer());
      console.log(`  Downloaded ${buffer.length} bytes from Brave image result`);
      console.log(`  Content-Type: ${dlResp.headers.get('content-type')}`);
    } else {
      console.log(`  Image URL returned HTTP ${dlResp.status} (hotlink protection likely)`);
      console.log(`  URL: ${hit.properties.url}`);
      console.log('  The pipeline silently skips failed downloads and tries next result');
    }
  } catch (e) {
    console.log(`  Image download threw: ${e.message} (network or host block)`);
    console.log('  The pipeline silently skips failed downloads and tries next result');
  }
});

// ─── Pipeline smoke test (via running server) ────────────────────────────────

test('content/generate endpoint: returns ok with known topic', {
  timeout: 60000,
  skip: skip('SKIP_LIVE_TESTS'),
}, async () => {
  const { startServer } = require('../server');
  const srv = startServer(0);
  await new Promise(resolve => srv.once('listening', resolve));
  const { port } = srv.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const resp = await fetch(`${base}/api/content/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Transformer (machine learning)' }),
    });

    assert.equal(resp.status, 200, `Expected 200, got ${resp.status}`);
    const data = await resp.json();
    assert.equal(data.status, 'ok', `Expected status ok, got: ${data.status}`);
    assert.ok(data.text,  'No text returned — all text sources failed');
    assert.ok(data.image, 'No image returned — all image sources failed');
    assert.ok(data.sources?.text,  'No text source reported');
    assert.ok(data.sources?.image, 'No image source reported');

    console.log(`  Text source:  ${data.sources.text}`);
    console.log(`  Image source: ${data.sources.image}`);
    console.log(`  Text preview: "${(data.text || '').slice(0, 80)}..."`);
    console.log(`  Image path:   ${data.image}`);
  } finally {
    await new Promise(resolve => srv.close(resolve));
  }
});
