#!/usr/bin/env node

/**
 * migrate-pipeline-status.js
 *
 * Backfill script that reads existing status.json files from all books
 * and populates the chapter_pipeline_status table in the database.
 *
 * Usage:
 *   node tools/migrate-pipeline-status.js [--dry-run]
 *
 * Idempotent: uses INSERT OR IGNORE, safe to run multiple times.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const require = createRequire(join(projectRoot, 'server/'));
const Database = require('better-sqlite3');

const dryRun = process.argv.includes('--dry-run');
const dbPath = join(projectRoot, 'pipeline-output', 'sessions.db');
const booksDir = join(projectRoot, 'books');

// The 7 non-publication stages
const BASE_STAGES = [
  'extraction',
  'mtReady',
  'mtOutput',
  'linguisticReview',
  'tmCreated',
  'injection',
  'rendering',
];

// The 3 publication sub-tracks
const PUB_TRACKS = ['mtPreview', 'faithful', 'localized'];

function parseChapterNum(dirName) {
  if (dirName === 'appendices') return -1;
  const match = dirName.match(/^ch(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

function main() {
  // Validate DB exists
  if (!existsSync(dbPath)) {
    console.error(`ERROR: Database not found at ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);

  // Validate table exists
  const tableCheck = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chapter_pipeline_status'")
    .get();
  if (!tableCheck) {
    console.error('ERROR: Table chapter_pipeline_status does not exist. Run migration 017 first.');
    db.close();
    process.exit(1);
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO chapter_pipeline_status
      (book_slug, chapter_num, stage, status, completed_at, notes)
    VALUES (@book_slug, @chapter_num, @stage, @status, @completed_at, @notes)
  `);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // Find all books with chapters/ subdirectories
  const bookDirs = readdirSync(booksDir, { withFileTypes: true }).filter(
    (d) => d.isDirectory() && existsSync(join(booksDir, d.name, 'chapters'))
  );

  if (dryRun) {
    console.log('=== DRY RUN — no database writes ===\n');
  }

  for (const bookDir of bookDirs) {
    const bookSlug = bookDir.name;
    const chaptersDir = join(booksDir, bookSlug, 'chapters');

    const chapterDirs = readdirSync(chaptersDir, { withFileTypes: true }).filter((d) =>
      d.isDirectory()
    );

    for (const chapterDir of chapterDirs) {
      const chapterName = chapterDir.name;
      const chapterNum = parseChapterNum(chapterName);

      if (chapterNum === null) {
        console.warn(`  WARN: Skipping unrecognized chapter dir: ${bookSlug}/${chapterName}`);
        continue;
      }

      const statusPath = join(chaptersDir, chapterName, 'status.json');
      if (!existsSync(statusPath)) {
        console.warn(`  WARN: No status.json in ${bookSlug}/${chapterName}`);
        continue;
      }

      let statusData;
      try {
        let raw = readFileSync(statusPath, 'utf8');
        // Strip trailing commas (common in hand-edited JSON)
        raw = raw.replace(/,\s*([\]}])/g, '$1');
        statusData = JSON.parse(raw);
      } catch (err) {
        console.error(`  ERROR: Failed to parse ${statusPath}: ${err.message}`);
        errors++;
        continue;
      }

      const status = statusData.status || {};

      // Process 7 base stages
      for (const stage of BASE_STAGES) {
        const stageData = status[stage] || {};
        const row = {
          book_slug: bookSlug,
          chapter_num: chapterNum,
          stage,
          status: stageData.complete ? 'complete' : 'not_started',
          completed_at: stageData.date || null,
          notes: stageData.notes || null,
        };

        if (dryRun) {
          console.log(`  [DRY] ${bookSlug} ch${chapterNum} ${stage} → ${row.status}`);
          inserted++;
        } else {
          const result = insert.run(row);
          if (result.changes > 0) {
            inserted++;
          } else {
            skipped++;
          }
        }
      }

      // Process 3 publication sub-tracks
      const pub = status.publication || {};
      for (const track of PUB_TRACKS) {
        const trackData = pub[track] || {};
        const stage = `publication.${track}`;
        const row = {
          book_slug: bookSlug,
          chapter_num: chapterNum,
          stage,
          status: trackData.complete ? 'complete' : 'not_started',
          completed_at: trackData.date || null,
          notes: trackData.notes || null,
        };

        if (dryRun) {
          console.log(`  [DRY] ${bookSlug} ch${chapterNum} ${stage} → ${row.status}`);
          inserted++;
        } else {
          const result = insert.run(row);
          if (result.changes > 0) {
            inserted++;
          } else {
            skipped++;
          }
        }
      }
    }
  }

  db.close();

  console.log(`\n=== Summary ===`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Errors:   ${errors}`);

  if (dryRun) {
    console.log('\n(Dry run — nothing was written to the database)');
  }
}

main();
