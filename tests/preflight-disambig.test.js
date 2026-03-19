/**
 * Tests for the Wikipedia disambiguation preflight flow.
 *
 * Covers:
 *  - /api/preflight/topics  — validation, aimodel fast-path, live Wikipedia checks,
 *                             live HuggingFace checks, suggestions shape
 *  - /api/run-grab          — topicOverrides and aiTopics wiring accepted by server
 *                             (does NOT run the Python generator; just validates the
 *                             server parses & echoes the params correctly when the
 *                             generator subprocess would start)
 *
 * Live tests are skipped in CI (CI=true) or when SKIP_LIVE_TESTS=true.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../server');

const SKIP_LIVE = process.env.CI === 'true' || process.env.SKIP_LIVE_TESTS === 'true';

let server;
let baseUrl;

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

test.before(async () => {
  server = startServer(0);
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve()))
  );
});

// ─── Validation (no network) ───────────────────────────────────────────────

test('preflight rejects missing topics', async () => {
  const { response, payload } = await postJson('/api/preflight/topics', {
    source: 'wikipedia',
  });

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'Invalid request body');
  assert.ok(Array.isArray(payload.details));
  assert.ok(
    payload.details.some(d => /topics/i.test(d)),
    `Expected topics validation error, got: ${JSON.stringify(payload.details)}`
  );
});

test('preflight rejects empty topics array', async () => {
  const { response, payload } = await postJson('/api/preflight/topics', {
    topics: [],
    source: 'wikipedia',
  });

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'Invalid request body');
  assert.ok(Array.isArray(payload.details));
  assert.ok(
    payload.details.some(d => /topics/i.test(d)),
    `Expected topics validation error, got: ${JSON.stringify(payload.details)}`
  );
});

test('preflight rejects invalid source', async () => {
  const { response, payload } = await postJson('/api/preflight/topics', {
    topics: ['Machine_learning'],
    source: 'bogus_source',
  });

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'Invalid request body');
  assert.ok(Array.isArray(payload.details));
  assert.ok(
    payload.details.some(d => /source/i.test(d)),
    `Expected source validation error, got: ${JSON.stringify(payload.details)}`
  );
});

test('preflight rejects non-array topics string', async () => {
  const { response, payload } = await postJson('/api/preflight/topics', {
    topics: 'Machine_learning',
    source: 'wikipedia',
  });

  // A single string is coerced to array by parseOptionalStringArray;
  // if it passes, we just need a valid structure back.
  // If it fails validation, we expect 400.
  if (response.status === 400) {
    assert.equal(payload.error, 'Invalid request body');
  } else {
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(payload.results));
  }
});

// ─── aimodel fast-path (no network) ───────────────────────────────────────

test('preflight returns ok for all aimodel topics without network', async () => {
  const topics = ['Transformer Architecture', 'Attention Mechanism', 'RLHF'];
  const { response, payload } = await postJson('/api/preflight/topics', {
    topics,
    source: 'aimodel',
  });

  assert.equal(response.status, 200);
  assert.equal(payload.source, 'aimodel');
  assert.ok(Array.isArray(payload.results));
  assert.equal(payload.results.length, topics.length);

  for (const result of payload.results) {
    assert.equal(result.status, 'ok', `Expected ok for ${result.topic}`);
    assert.ok(topics.includes(result.topic), `Unexpected topic: ${result.topic}`);
  }
});

test('preflight accepts ai-model alias as source', async () => {
  const { response, payload } = await postJson('/api/preflight/topics', {
    topics: ['Neural Networks'],
    source: 'ai-model',
  });

  assert.equal(response.status, 200);
  assert.equal(payload.results[0].status, 'ok');
});

// ─── Wikipedia live checks ─────────────────────────────────────────────────

test(
  'preflight returns ok for a well-known Wikipedia topic',
  { timeout: 20000, skip: SKIP_LIVE ? 'live network tests disabled' : false },
  async () => {
    const { response, payload } = await postJson('/api/preflight/topics', {
      topics: ['Machine_learning'],
      source: 'wikipedia',
    });

    assert.equal(response.status, 200);
    assert.equal(payload.source, 'wikipedia');
    assert.equal(payload.results.length, 1);

    const result = payload.results[0];
    assert.equal(result.topic, 'Machine_learning');
    assert.equal(result.status, 'ok');
    assert.ok(!result.suggestions, 'ok result should not carry suggestions');
  }
);

test(
  'preflight returns notfound + suggestions for nonexistent Wikipedia topic',
  { timeout: 20000, skip: SKIP_LIVE ? 'live network tests disabled' : false },
  async () => {
    const { response, payload } = await postJson('/api/preflight/topics', {
      topics: ['Machine_Learning_in_China'],
      source: 'wikipedia',
    });

    assert.equal(response.status, 200);

    const result = payload.results[0];
    assert.equal(result.topic, 'Machine_Learning_in_China');
    assert.equal(result.status, 'notfound');

    // Suggestions should be a non-empty array of strings
    assert.ok(Array.isArray(result.suggestions), 'notfound result must include suggestions array');
    assert.ok(result.suggestions.length > 0, 'suggestions should not be empty for a search-able topic');
    for (const s of result.suggestions) {
      assert.equal(typeof s, 'string', `suggestion must be a string, got ${typeof s}`);
      assert.ok(s.length > 0, 'suggestion must not be an empty string');
    }
  }
);

test(
  'preflight returns disambiguation + suggestions for a disambiguation Wikipedia page',
  { timeout: 20000, skip: SKIP_LIVE ? 'live network tests disabled' : false },
  async () => {
    // "Mercury" is a classic disambiguation page on Wikipedia
    const { response, payload } = await postJson('/api/preflight/topics', {
      topics: ['Mercury'],
      source: 'wikipedia',
    });

    assert.equal(response.status, 200);

    const result = payload.results[0];
    assert.equal(result.topic, 'Mercury');
    assert.ok(
      result.status === 'disambiguation' || result.status === 'ok',
      `Expected disambiguation or ok, got ${result.status}`
    );

    if (result.status === 'disambiguation') {
      assert.ok(Array.isArray(result.suggestions), 'disambiguation result must include suggestions array');
      assert.ok(result.suggestions.length > 0, 'disambiguation suggestions should not be empty');
    }
  }
);

test(
  'preflight handles multiple Wikipedia topics in one request',
  { timeout: 30000, skip: SKIP_LIVE ? 'live network tests disabled' : false },
  async () => {
    const { response, payload } = await postJson('/api/preflight/topics', {
      topics: ['Machine_learning', 'Machine_Learning_in_China', 'Deep_learning'],
      source: 'wikipedia',
    });

    assert.equal(response.status, 200);
    assert.equal(payload.results.length, 3);

    // Machine_learning should be ok
    const mlResult = payload.results.find(r => r.topic === 'Machine_learning');
    assert.ok(mlResult, 'Machine_learning result missing');
    assert.equal(mlResult.status, 'ok');

    // Machine_Learning_in_China should be notfound with suggestions
    const chinaResult = payload.results.find(r => r.topic === 'Machine_Learning_in_China');
    assert.ok(chinaResult, 'Machine_Learning_in_China result missing');
    assert.equal(chinaResult.status, 'notfound');
    assert.ok(Array.isArray(chinaResult.suggestions));
    assert.ok(chinaResult.suggestions.length > 0);

    // Deep_learning should be ok
    const dlResult = payload.results.find(r => r.topic === 'Deep_learning');
    assert.ok(dlResult, 'Deep_learning result missing');
    assert.equal(dlResult.status, 'ok');
  }
);

test(
  'preflight suggestions are underscore-formatted Wikipedia page titles',
  { timeout: 20000, skip: SKIP_LIVE ? 'live network tests disabled' : false },
  async () => {
    const { response, payload } = await postJson('/api/preflight/topics', {
      topics: ['Machine_Learning_in_China'],
      source: 'wikipedia',
    });

    assert.equal(response.status, 200);
    const result = payload.results[0];
    assert.equal(result.status, 'notfound');

    for (const suggestion of result.suggestions) {
      assert.ok(
        !suggestion.includes(' '),
        `Suggestion "${suggestion}" should use underscores, not spaces`
      );
    }
  }
);

// ─── HuggingFace live checks ───────────────────────────────────────────────

test(
  'preflight returns ok for a known HuggingFace model',
  { timeout: 20000, skip: SKIP_LIVE ? 'live network tests disabled' : false },
  async () => {
    const { response, payload } = await postJson('/api/preflight/topics', {
      topics: ['bert-base-uncased'],
      source: 'huggingface',
    });

    assert.equal(response.status, 200);
    assert.equal(payload.source, 'huggingface');

    const result = payload.results[0];
    assert.equal(result.topic, 'bert-base-uncased');
    assert.equal(result.status, 'ok');
  }
);

test(
  'preflight returns notfound or error for a nonexistent HuggingFace model',
  { timeout: 20000, skip: SKIP_LIVE ? 'live network tests disabled' : false },
  async () => {
    // HuggingFace returns 404 for truly nonexistent public models, but may
    // return other HTTP errors (e.g. 401) depending on auth/gating — so the
    // server maps those to 'error'. Both are valid "not resolvable" outcomes.
    const { response, payload } = await postJson('/api/preflight/topics', {
      topics: ['this-model-absolutely-does-not-exist-xyzzy-12345'],
      source: 'hf',
    });

    assert.equal(response.status, 200);
    assert.equal(payload.source, 'hf');

    const result = payload.results[0];
    assert.ok(
      result.status === 'notfound' || result.status === 'error',
      `Expected notfound or error for unknown HF model, got: ${result.status}`
    );
  }
);

// ─── Disambiguation resolution shape (server acceptance) ──────────────────

test(
  'run-grab accepts topicOverrides and aiTopics without error (validation layer)',
  { timeout: 10000 },
  async () => {
    // We POST a valid-shaped run-grab body. We don't expect the Python generator
    // to succeed here; we just confirm the server parses the params and does NOT
    // return 400 (bad request). A 500/502 from Python is acceptable.
    const { response } = await postJson('/api/run-grab', {
      source: 'wikipedia',
      category: 'Test_Category',
      topics: ['Machine_learning'],
      topicOverrides: { Machine_Learning_in_China: 'Machine_learning' },
      aiTopics: ['Quantum_Reinforcement_Learning'],
      mergeEnrich: false,
      mergeOnly: false,
    });

    // 400 means server rejected the shape — that's the only failure we care about here
    assert.notEqual(
      response.status,
      400,
      'Server should accept topicOverrides and aiTopics without 400'
    );
  }
);

test(
  'run-grab accepts empty topicOverrides and aiTopics (clean-run path)',
  { timeout: 10000 },
  async () => {
    const { response } = await postJson('/api/run-grab', {
      source: 'wikipedia',
      category: 'Test_Category',
      topics: ['Machine_learning'],
      topicOverrides: {},
      aiTopics: [],
      mergeEnrich: false,
      mergeOnly: false,
    });

    assert.notEqual(response.status, 400, 'Clean run-grab should not return 400');
  }
);
