const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../server');

let server;
let baseUrl;

const PRIMARY_MODEL = process.env.INTEGRATION_TOPIC_MODEL || 'google/gemini-3-flash-preview';
const SECONDARY_MODEL = process.env.INTEGRATION_TOPIC_MODEL_2 || 'openai/gpt-4o-mini';

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
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
});

test('ai topic suggestions works with primary model', { timeout: 60000 }, async () => {
  const { response, payload } = await postJson('/api/ai/topic-suggestions', {
    categoryName: 'AI Agents',
    existingTopics: ['AutoGPT'],
    limit: 8,
    model: PRIMARY_MODEL,
  });

  assert.equal(response.status, 200, `Expected 200 from ${PRIMARY_MODEL}`);
  assert.equal(payload.source, 'openrouter');
  assert.equal(payload.model, PRIMARY_MODEL);
  assert.ok(Array.isArray(payload.topics));
  assert.ok(payload.topics.length > 0);
});

test('ai topic suggestions works with secondary model', { timeout: 60000 }, async () => {
  const { response, payload } = await postJson('/api/ai/topic-suggestions', {
    categoryName: 'AI Agents',
    existingTopics: ['AutoGPT'],
    limit: 8,
    model: SECONDARY_MODEL,
  });

  assert.equal(response.status, 200, `Expected 200 from ${SECONDARY_MODEL}`);
  assert.equal(payload.source, 'openrouter');
  assert.equal(payload.model, SECONDARY_MODEL);
  assert.ok(Array.isArray(payload.topics));
  assert.ok(payload.topics.length > 0);
});

test('normalize-openrouter returns 400 with details on invalid payload', async () => {
  const { response, payload } = await postJson('/api/model-intel/normalize-openrouter', {
    model: { id: 'anthropic/claude-haiku-4.5' },
  });

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'Invalid request body');
  assert.ok(Array.isArray(payload.details));
  assert.ok(payload.details.includes('model.name is required'));
});

test('capabilities returns 400 with details on invalid supportedParams', async () => {
  const { response, payload } = await postJson('/api/model-intel/capabilities', {
    modelId: 'perplexity/sonar-pro',
    modelName: 'Sonar Pro',
    supportedParams: 'tools',
  });

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'Invalid request body');
  assert.ok(Array.isArray(payload.details));
  assert.ok(payload.details.includes('supportedParams must be an array of strings'));
});

test('parse-match returns 400 with details when rawBenchmarks missing', async () => {
  const { response, payload } = await postJson('/api/model-intel/benchmarks/parse-match', {
    modelId: 'anthropic/claude-haiku-4.5',
    modelName: 'Claude Haiku 4.5',
  });

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'Invalid request body');
  assert.ok(Array.isArray(payload.details));
  assert.ok(payload.details.includes('rawBenchmarks is required'));
});
