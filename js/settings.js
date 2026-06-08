'use strict';

const elById = (id) => document.getElementById(id);

const FIELD_MAP = [
  ['key-openrouter',       'OPENROUTER_API_KEY'],
  ['key-content-model',    'OPENROUTER_CONTENT_MODEL'],
  ['key-image-model',      'OPENROUTER_IMAGE_MODEL'],
  ['key-topic-model',      'OPENROUTER_TOPIC_MODEL'],
  ['key-brave',            'BRAVE_API_KEY'],
  ['key-openverse-id',     'OPENVERSE_CLIENT_ID'],
  ['key-openverse-secret', 'OPENVERSE_CLIENT_SECRET'],
];

function setStatus(msg, type) {
  const el = elById('status');
  el.textContent = msg;
  el.className = type;
}

async function loadGrabStatus() {
  try {
    const data = await fetch('/api/grab-status').then(r => r.json());
    const bar = elById('grab-status-bar');
    bar.style.display = 'block';
    if (data.mode === 'bundled') {
      bar.className = 'grab-status bundled';
      bar.textContent = 'Grab: bundled grab.exe found';
    } else if (data.mode === 'python') {
      bar.className = 'grab-status python';
      bar.textContent = 'Grab: running via system Python';
    } else {
      bar.className = 'grab-status unavailable';
      bar.textContent = 'Grab: unavailable — install Python or run npm run build:grab';
    }
  } catch (_) {}
}

async function load() {
  if (!window.electronAPI) {
    setStatus('Not running in Electron — settings are read-only here', 'err');
    return;
  }
  try {
    const keys = await window.electronAPI.getApiKeys();
    for (const [fieldId, envKey] of FIELD_MAP) {
      const el = elById(fieldId);
      if (el && keys[envKey]) el.value = keys[envKey];
    }
  } catch (err) {
    setStatus('Failed to load settings: ' + err.message, 'err');
  }
}

async function save() {
  if (!window.electronAPI) return;
  const keys = {};
  for (const [fieldId, envKey] of FIELD_MAP) {
    const el = elById(fieldId);
    if (el) keys[envKey] = el.value.trim();
  }
  try {
    await window.electronAPI.saveApiKeys(keys);
    setStatus('Saved', 'ok');
    setTimeout(() => { elById('status').className = ''; }, 2500);
  } catch (err) {
    setStatus('Save failed: ' + err.message, 'err');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  loadGrabStatus();

  elById('btn-save').addEventListener('click', save);
  elById('btn-close').addEventListener('click', () => window.close());

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    if (e.key === 'Escape') window.close();
  });
});
