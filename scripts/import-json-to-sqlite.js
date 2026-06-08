#!/usr/bin/env node
'use strict';

/**
 * One-shot importer: reads all poster JSON files from JSON_Posters/Posters/
 * and ai_posters/, plus category-config.json, and inserts them into a
 * SQLite .journey database.
 *
 * Usage:
 *   node scripts/import-json-to-sqlite.js [--db ./library.journey] [--dry-run]
 */

const path = require('path');
const fs   = require('fs');

const ROOT    = path.join(__dirname, '..');
const db      = require('../db');

function parseArgs() {
  const args    = process.argv.slice(2);
  const dbPath  = args[args.indexOf('--db') + 1] || path.join(ROOT, 'library.journey');
  const dryRun  = args.includes('--dry-run');
  return { dbPath, dryRun };
}

function scanDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.json') && !f.endsWith('.log'))
    .map(f => path.join(dirPath, f));
}

function main() {
  const { dbPath, dryRun } = parseArgs();
  console.log(`\nImporting into: ${dbPath}${dryRun ? ' (dry run)' : ''}`);

  if (!dryRun) db.open(dbPath);

  const postersDirs = [
    path.join(ROOT, 'JSON_Posters', 'Posters'),
    path.join(ROOT, 'ai_posters'),
  ];

  let imported = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const dir of postersDirs) {
    const files = scanDir(dir);
    console.log(`\n${path.basename(dir)}: ${files.length} JSON files`);

    for (const filePath of files) {
      const filename = path.basename(filePath);
      try {
        const raw  = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);

        // Skip non-poster JSONs (journey files in wrong dir, etc.)
        if (!data.version && !data.front && !data.figure && !data.title && !data.url) {
          skipped++;
          continue;
        }

        if (!dryRun) {
          db.importPosterJson(filename, data);
        }
        console.log(`  ✓ ${filename}`);
        imported++;
      } catch (err) {
        console.error(`  ✗ ${filename}: ${err.message}`);
        errors++;
      }
    }
  }

  // Import category config
  const configPath = path.join(ROOT, 'JSON_Posters', 'category-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!dryRun) db.importCategoryConfig(config);
      console.log(`\n✓ category-config.json (${(config.categories || []).length} categories)`);
    } catch (err) {
      console.error(`\n✗ category-config.json: ${err.message}`);
    }
  }

  // Import journey JSON files
  const journeysDir = path.join(ROOT, 'JSON_Posters', 'Journeys');
  const journeyFiles = scanDir(journeysDir);
  console.log(`\nJourneys: ${journeyFiles.length} files`);
  for (const filePath of journeyFiles) {
    const filename = path.basename(filePath);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!data.name || !Array.isArray(data.posters)) { skipped++; continue; }
      if (!dryRun) db.saveJourney(filename, data);
      console.log(`  ✓ ${filename}`);
      imported++;
    } catch (err) {
      console.error(`  ✗ ${filename}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n── Summary ──────────────────────────────`);
  console.log(`  Imported : ${imported}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Errors   : ${errors}`);
  if (!dryRun) console.log(`  DB       : ${dbPath}`);
  console.log('');
}

main();
