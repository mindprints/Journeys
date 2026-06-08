'use strict';

const Database = require('better-sqlite3');
const crypto   = require('crypto');
const path     = require('path');
const fs       = require('fs');

let db = null;

// Virtual path prefix used in API responses so the frontend's path-based
// references keep working after the switch to SQLite.
const VIRTUAL_PATH_PREFIX = 'JSON_Posters/Posters/';
const FALLBACK_CATEGORY   = 'No-Category';

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function open(dbPath) {
  if (db) db.close();
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema();
  console.log(`[db] opened ${path.basename(dbPath)}`);
  return db;
}

function isOpen() { return db !== null; }

function close() {
  if (db) { db.close(); db = null; }
}

function raw() {
  if (!db) throw new Error('[db] No database open. Call db.open(path) first.');
  return db;
}

// ── Schema ────────────────────────────────────────────────────────────────────

function initSchema() {
  raw().exec(`
    CREATE TABLE IF NOT EXISTS posters (
      uid         TEXT PRIMARY KEY,
      filename    TEXT UNIQUE NOT NULL,
      title       TEXT,
      type        TEXT NOT NULL DEFAULT 'poster-v2',
      front_json  TEXT NOT NULL DEFAULT '{}',
      back_json   TEXT NOT NULL DEFAULT '{}',
      meta_json   TEXT NOT NULL DEFAULT '{}',
      created     TEXT,
      modified    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_posters_title    ON posters(title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_posters_modified ON posters(modified);

    CREATE TABLE IF NOT EXISTS categories (
      slug         TEXT PRIMARY KEY,
      name         TEXT,
      description  TEXT,
      color        TEXT,
      target_count INTEGER,
      source       TEXT,
      topics_json  TEXT
    );

    CREATE TABLE IF NOT EXISTS journeys (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      filename    TEXT UNIQUE NOT NULL,
      name        TEXT,
      description TEXT,
      created     TEXT,
      modified    TEXT
    );

    CREATE TABLE IF NOT EXISTS journey_posters (
      journey_id       INTEGER NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
      position         INTEGER NOT NULL,
      poster_filename  TEXT,
      poster_uid       TEXT,
      poster_title     TEXT,
      poster_type      TEXT,
      poster_thumbnail TEXT,
      PRIMARY KEY (journey_id, position)
    );

    CREATE TABLE IF NOT EXISTS assets (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      filename  TEXT NOT NULL,
      mime      TEXT NOT NULL DEFAULT 'application/octet-stream',
      data      BLOB NOT NULL,
      created   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_assets_filename ON assets(filename);

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function safeJson(text, fallback) {
  try { return text ? JSON.parse(text) : fallback; }
  catch (_) { return fallback; }
}

function generateUid() {
  return 'poster-' + crypto.randomBytes(8).toString('hex');
}

function filenameFrom(posterPath) {
  return posterPath.includes('/') ? posterPath.split('/').pop() : posterPath;
}

function rowToPoster(row) {
  if (!row) return null;
  const front = safeJson(row.front_json, {});
  const back  = safeJson(row.back_json,  {});
  const meta  = safeJson(row.meta_json,  {});
  return {
    path:       VIRTUAL_PATH_PREFIX + row.filename,
    filename:   row.filename,
    uid:        row.uid,
    title:      row.title,
    type:       row.type || 'poster-v2',
    data:       { version: 2, uid: row.uid, type: row.type || 'poster-v2', front, back, meta },
    front,
    back,
    meta,
    categories: Array.isArray(meta.categories) ? meta.categories : [],
    thumbnail:  front.thumbnail || back?.image?.src || null,
  };
}

// ── Poster CRUD ───────────────────────────────────────────────────────────────

function postersAll() {
  return raw().prepare(`SELECT * FROM posters ORDER BY title COLLATE NOCASE`).all()
    .map(rowToPoster);
}

function searchPosters(q, byPath) {
  if (byPath) {
    const filename = filenameFrom(byPath);
    const row = raw().prepare(`SELECT * FROM posters WHERE filename = ?`).get(filename);
    return row ? [rowToPoster(row)] : [];
  }
  if (!q) return [];
  const like = `%${q}%`;
  return raw().prepare(`
    SELECT * FROM posters
    WHERE title LIKE ? COLLATE NOCASE
       OR front_json LIKE ? COLLATE NOCASE
    LIMIT 10
  `).all(like, like).map(rowToPoster);
}

function postersByFilenames(filenames) {
  if (!filenames.length) return [];
  return filenames
    .map(fname => {
      const filename = filenameFrom(fname);
      return raw().prepare(`SELECT * FROM posters WHERE filename = ?`).get(filename);
    })
    .filter(Boolean)
    .map(rowToPoster);
}

function postersInCategory(category) {
  const needle = category.trim().toLowerCase();
  return postersAll().filter(p =>
    Array.isArray(p.categories) &&
    p.categories.some(c => typeof c === 'string' && c.trim().toLowerCase() === needle)
  );
}

function savePoster(posterPath, data) {
  const filename = filenameFrom(posterPath);
  const front    = data.front || {};
  const back     = data.back  || {};
  const meta     = data.meta  || {};
  const title    = front.title || filename.replace(/\.json$/, '');
  const now      = new Date().toISOString();

  const existing = raw().prepare(`SELECT uid FROM posters WHERE filename = ?`).get(filename);
  const uid      = data.uid || existing?.uid || generateUid();

  if (existing) {
    raw().prepare(`
      UPDATE posters
      SET uid=?, title=?, type=?, front_json=?, back_json=?, meta_json=?, modified=?
      WHERE filename=?
    `).run(uid, title, data.type || 'poster-v2',
           JSON.stringify(front), JSON.stringify(back), JSON.stringify(meta),
           now, filename);
  } else {
    raw().prepare(`
      INSERT INTO posters (uid, filename, title, type, front_json, back_json, meta_json, created, modified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uid, filename, title, data.type || 'poster-v2',
           JSON.stringify(front), JSON.stringify(back), JSON.stringify(meta),
           meta.created || now, now);
  }
  return { uid, filename, path: VIRTUAL_PATH_PREFIX + filename };
}

function deletePoster(posterPath) {
  const filename = filenameFrom(posterPath);
  const result   = raw().prepare(`DELETE FROM posters WHERE filename = ?`).run(filename);
  return result.changes > 0;
}

// ── Category Config ───────────────────────────────────────────────────────────

function getCategories() {
  const rows = raw().prepare(`SELECT meta_json FROM posters`).all();
  const map  = new Map();
  for (const row of rows) {
    const meta = safeJson(row.meta_json, {});
    for (const cat of (Array.isArray(meta.categories) ? meta.categories : [])) {
      if (typeof cat === 'string' && cat.trim()) {
        const key = cat.trim().toLowerCase();
        if (!map.has(key)) map.set(key, cat.trim());
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

function getCategoryConfig() {
  const row = raw().prepare(`SELECT value FROM meta WHERE key='category_config'`).get();
  if (!row) return { updated: null, categories: [] };
  return safeJson(row.value, { updated: null, categories: [] });
}

function saveCategoryConfig(config) {
  const payload = {
    updated:    new Date().toISOString(),
    categories: Array.isArray(config.categories) ? config.categories : []
  };
  raw().prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('category_config', ?)`)
    .run(JSON.stringify(payload));
  return payload;
}

function deleteCategory(categoryName) {
  const needle = categoryName.trim().toLowerCase();

  // 1. Remove from category config
  const config   = getCategoryConfig();
  const filtered = (Array.isArray(config.categories) ? config.categories : []).filter(item => {
    const value = String(item?.name || item?.slug || '').trim().toLowerCase();
    return value !== needle;
  });
  const removedFromConfig = (config.categories?.length || 0) - filtered.length;
  saveCategoryConfig({ categories: filtered });

  // 2. Strip category from every poster that uses it
  const allRows = raw().prepare(`SELECT uid, meta_json FROM posters`).all();
  let postersUpdated      = 0;
  let categoryRefsRemoved = 0;
  const now = new Date().toISOString();

  raw().transaction(() => {
    for (const row of allRows) {
      const meta = safeJson(row.meta_json, {});
      if (!Array.isArray(meta.categories)) continue;
      const before   = meta.categories;
      const after    = before.filter(c => typeof c !== 'string' || c.trim().toLowerCase() !== needle);
      const removed  = before.length - after.length;
      if (!removed) continue;
      meta.categories = after.length > 0 ? after : [FALLBACK_CATEGORY];
      raw().prepare(`UPDATE posters SET meta_json=?, modified=? WHERE uid=?`)
        .run(JSON.stringify(meta), now, row.uid);
      postersUpdated++;
      categoryRefsRemoved += removed;
    }
  })();

  return { removedFromConfig, postersUpdated, categoryRefsRemoved };
}

// ── Journey CRUD ──────────────────────────────────────────────────────────────

function journeysList() {
  return raw().prepare(`SELECT * FROM journeys ORDER BY name COLLATE NOCASE`).all()
    .map(row => ({
      filename:     row.filename,
      name:         row.name || 'Unnamed',
      description:  row.description || '',
      posterCount:  raw().prepare(`SELECT COUNT(*) as cnt FROM journey_posters WHERE journey_id=?`).get(row.id)?.cnt || 0,
      dateModified: row.modified || '',
    }));
}

function getJourney(filename) {
  const row = raw().prepare(`SELECT * FROM journeys WHERE filename=?`).get(filename);
  if (!row) return null;
  const posters = raw().prepare(`
    SELECT poster_filename, poster_uid, poster_title, poster_type, poster_thumbnail
    FROM journey_posters WHERE journey_id=? ORDER BY position
  `).all(row.id).map(p => ({
    filename:  p.poster_filename,
    uid:       p.poster_uid,
    title:     p.poster_title,
    type:      p.poster_type,
    thumbnail: p.poster_thumbnail,
  }));
  return {
    name:         row.name,
    description:  row.description || '',
    posters,
    dateCreated:  row.created,
    dateModified: row.modified,
  };
}

function saveJourney(filename, data) {
  const now     = new Date().toISOString();
  const created = data.dateCreated || now;
  const existing = raw().prepare(`SELECT id FROM journeys WHERE filename=?`).get(filename);

  raw().transaction(() => {
    let journeyId;
    if (existing) {
      raw().prepare(`
        UPDATE journeys SET name=?, description=?, created=?, modified=? WHERE filename=?
      `).run(data.name, data.description || '', created, now, filename);
      journeyId = existing.id;
      raw().prepare(`DELETE FROM journey_posters WHERE journey_id=?`).run(journeyId);
    } else {
      const result = raw().prepare(`
        INSERT INTO journeys (filename, name, description, created, modified) VALUES (?,?,?,?,?)
      `).run(filename, data.name, data.description || '', created, now);
      journeyId = result.lastInsertRowid;
    }

    (data.posters || []).forEach((poster, position) => {
      raw().prepare(`
        INSERT INTO journey_posters (journey_id, position, poster_filename, poster_uid, poster_title, poster_type, poster_thumbnail)
        VALUES (?,?,?,?,?,?,?)
      `).run(journeyId, position,
             poster.filename || null, poster.uid || null,
             poster.title    || null, poster.type || null, poster.thumbnail || null);
    });
  })();
}

function deleteJourney(filename) {
  return raw().prepare(`DELETE FROM journeys WHERE filename=?`).run(filename).changes > 0;
}

// ── Asset BLOB CRUD ───────────────────────────────────────────────────────────

function saveAsset(filename, mime, buffer) {
  const now      = new Date().toISOString();
  const existing = raw().prepare(`SELECT id FROM assets WHERE filename=?`).get(filename);
  if (existing) {
    raw().prepare(`UPDATE assets SET mime=?, data=?, created=? WHERE id=?`)
      .run(mime, buffer, now, existing.id);
    return existing.id;
  }
  return raw().prepare(`INSERT INTO assets (filename, mime, data, created) VALUES (?,?,?,?)`)
    .run(filename, mime, buffer, now).lastInsertRowid;
}

function getAsset(id) {
  return raw().prepare(`SELECT filename, mime, data FROM assets WHERE id=?`).get(id) || null;
}

function listAssets() {
  return raw().prepare(`SELECT id, filename, mime FROM assets ORDER BY filename`).all();
}

function deleteAsset(id) {
  return raw().prepare(`DELETE FROM assets WHERE id=?`).run(id).changes > 0;
}

// Scan all posters for `images/originals/` references, import those files as
// BLOBs, rewrite the JSON to use `api/asset/<id>`, then set a migration flag.
function migrateAssetsFromDisk(appRoot) {
  const already = raw().prepare(`SELECT value FROM meta WHERE key='assets_migrated'`).get();
  if (already?.value === 'true') return;

  const imagesDir = path.join(appRoot, 'images', 'originals');
  if (!fs.existsSync(imagesDir)) {
    raw().prepare(`INSERT OR REPLACE INTO meta(key,value) VALUES('assets_migrated','true')`).run();
    return;
  }

  const allRows = raw().prepare(`SELECT uid, front_json, back_json FROM posters`).all();
  const PATTERN = /images\/originals\/([^"'\s\\]+)/g;
  const allFilenames = new Set();
  for (const row of allRows) {
    for (const m of ((row.front_json || '') + (row.back_json || '')).matchAll(PATTERN)) {
      allFilenames.add(m[1]);
    }
  }

  const filenameToSrc = new Map();
  for (const filename of allFilenames) {
    const diskPath = path.join(imagesDir, filename);
    if (!fs.existsSync(diskPath)) continue;
    try {
      const buffer = fs.readFileSync(diskPath);
      const ext    = path.extname(filename).toLowerCase().slice(1);
      const mime   = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      const id     = saveAsset(filename, mime, buffer);
      filenameToSrc.set(filename, `api/asset/${id}`);
    } catch (_) {}
  }

  if (filenameToSrc.size > 0) {
    const now = new Date().toISOString();
    raw().transaction(() => {
      for (const row of allRows) {
        let fj = row.front_json || '{}';
        let bj = row.back_json  || '{}';
        let changed = false;
        for (const [filename, src] of filenameToSrc) {
          const old = `images/originals/${filename}`;
          if (fj.includes(old)) { fj = fj.split(old).join(src); changed = true; }
          if (bj.includes(old)) { bj = bj.split(old).join(src); changed = true; }
        }
        if (changed) {
          raw().prepare(`UPDATE posters SET front_json=?, back_json=?, modified=? WHERE uid=?`)
            .run(fj, bj, now, row.uid);
        }
      }
    })();
    console.log(`[db] migrated ${filenameToSrc.size} assets from disk to SQLite`);
  }

  raw().prepare(`INSERT OR REPLACE INTO meta(key,value) VALUES('assets_migrated','true')`).run();
}

// ── Bulk import (used by importer script and run-grab auto-ingest) ────────────

function importPosterJson(filename, jsonData) {
  const front = jsonData.front || {};
  const back  = jsonData.back  || {};
  const meta  = jsonData.meta  || {};

  const uid   = jsonData.uid  || generateUid();
  const title = jsonData.front?.title || filename.replace(/\.json$/, '');
  const type  = jsonData.type || (jsonData.version === 2 ? 'poster-v2' : 'json');
  const now   = new Date().toISOString();

  const existing = raw().prepare(`SELECT uid FROM posters WHERE filename=?`).get(filename);
  if (existing) {
    raw().prepare(`
      UPDATE posters SET uid=?, title=?, type=?, front_json=?, back_json=?, meta_json=?, modified=?
      WHERE filename=?
    `).run(uid, title, type, JSON.stringify(front), JSON.stringify(back), JSON.stringify(meta), now, filename);
  } else {
    raw().prepare(`
      INSERT INTO posters (uid, filename, title, type, front_json, back_json, meta_json, created, modified)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(uid, filename, title, type,
           JSON.stringify(front), JSON.stringify(back), JSON.stringify(meta),
           meta.created || now, now);
  }
}

function importCategoryConfig(configData) {
  // configData is the raw category-config.json content: { updated, categories: [...] }
  const payload = {
    updated:    configData.updated || new Date().toISOString(),
    categories: Array.isArray(configData.categories) ? configData.categories : []
  };
  raw().prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('category_config', ?)`)
    .run(JSON.stringify(payload));
}

module.exports = {
  open, isOpen, close, raw,
  // Posters
  postersAll, searchPosters, postersByFilenames, postersInCategory,
  savePoster, deletePoster,
  // Categories
  getCategories, getCategoryConfig, saveCategoryConfig, deleteCategory,
  // Journeys
  journeysList, getJourney, saveJourney, deleteJourney,
  // Assets
  saveAsset, getAsset, listAssets, deleteAsset, migrateAssetsFromDisk,
  // Import helpers
  importPosterJson, importCategoryConfig,
};
