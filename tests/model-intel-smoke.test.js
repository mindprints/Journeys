const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../server');

let server;
let baseUrl;

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
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

test('normalize-openrouter returns normalized model data', async () => {
  const { response, payload } = await postJson('/api/model-intel/normalize-openrouter', {
    model: {
      id: 'anthropic/claude-haiku-4.5',
      name: 'Claude Haiku 4.5',
      context_length: 200000,
      pricing: { prompt: '0.000001', completion: '0.000005' },
      architecture: { modality: 'Text->Text' },
      supported_parameters: ['tools'],
      capabilities: ['search']
    }
  });

  assert.equal(response.status, 200);
  assert.equal(payload.normalized.id, 'anthropic/claude-haiku-4.5');
  assert.equal(payload.normalized.provider, 'Anthropic');
  assert.equal(payload.normalized.contextWindow, 200000);
  assert.equal(payload.normalized.inputPrice, 1);
  assert.equal(payload.normalized.outputPrice, 5);
});

test('normalize-openrouter rejects invalid model payload', async () => {
  const { response, payload } = await postJson('/api/model-intel/normalize-openrouter', {
    model: { id: 'anthropic/claude-haiku-4.5' }
  });

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'Invalid request body');
  assert.ok(Array.isArray(payload.details));
  assert.ok(payload.details.includes('model.name is required'));
});

test('capabilities returns expected flags', async () => {
  const { response, payload } = await postJson('/api/model-intel/capabilities', {
    modelId: 'perplexity/sonar-pro',
    modelName: 'Sonar Pro',
    modality: 'text->text',
    supportedParams: ['tools'],
    capabilities: ['search']
  });

  assert.equal(response.status, 200);
  assert.equal(payload.supportsTools, true);
  assert.equal(payload.supportsSearchCapability, true);
  assert.equal(payload.supportsVision, false);
});

test('capabilities rejects invalid arrays', async () => {
  const { response, payload } = await postJson('/api/model-intel/capabilities', {
    modelId: 'perplexity/sonar-pro',
    modelName: 'Sonar Pro',
    supportedParams: 'tools'
  });

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'Invalid request body');
  assert.ok(payload.details.includes('supportedParams must be an array of strings'));
});

test('parse-match parses benchmark payload and finds a match', async () => {
  const { response, payload } = await postJson('/api/model-intel/benchmarks/parse-match', {
    modelId: 'anthropic/claude-haiku-4.5',
    modelName: 'Claude Haiku 4.5',
    rawBenchmarks: {
      data: [
        {
          model_name: 'Claude Haiku 4.5',
          model_creator: { name: 'Anthropic' },
          evaluations: { artificial_analysis_intelligence_index: 52.1 }
        }
      ]
    }
  });

  assert.equal(response.status, 200);
  assert.equal(payload.parsedCount, 1);
  assert.equal(payload.match.modelName, 'Claude Haiku 4.5');
});

test('parse-match validates required fields', async () => {
  const { response, payload } = await postJson('/api/model-intel/benchmarks/parse-match', {
    modelId: '',
    modelName: 'Claude Haiku 4.5'
  });

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'Invalid request body');
  assert.ok(payload.details.includes('modelId is required'));
  assert.ok(payload.details.includes('rawBenchmarks is required'));
});
