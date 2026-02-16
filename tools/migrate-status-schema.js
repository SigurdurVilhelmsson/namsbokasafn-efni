#!/usr/bin/env node
/**
 * migrate-status-schema.js
 *
 * One-time migration: rename legacy stage names to canonical 8-stage pipeline.
 * Idempotent — safe to run multiple times.
 *
 * Usage: node tools/migrate-status-schema.js [--dry-run] [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOOKS_DIR = path.join(__dirname, '..', 'books');
const BOOK = 'efnafraedi';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

// Legacy → canonical mapping
const STAGE_RENAME = {
  source: 'extraction',
  enMarkdown: 'extraction',
  editorialPass1: 'linguisticReview',
  matecat: 'tmCreated',
  tmUpdated: 'tmCreated',
};

// Stages to remove entirely
const STAGES_TO_REMOVE = ['editorialPass2'];

// Canonical stage order (for consistent JSON output)
const CANONICAL_STAGES = [
  'extraction',
  'mtReady',
  'mtOutput',
  'linguisticReview',
  'tmCreated',
  'injection',
  'rendering',
  'publication',
];

function migrateStatusFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const oldStatus = data.status || {};
  const newStatus = {};
  const changes = [];

  // 1. Migrate renamed stages (prefer first match if multiple legacy names map to same target)
  for (const [oldName, newName] of Object.entries(STAGE_RENAME)) {
    if (oldStatus[oldName] && !newStatus[newName]) {
      newStatus[newName] = { ...oldStatus[oldName] };
      // Clean up extra fields from legacy shapes
      delete newStatus[newName].status;
      delete newStatus[newName].inProgress;
      delete newStatus[newName].pending;
      changes.push(`${oldName} → ${newName}`);
    }
  }

  // 2. Copy stages that already have canonical names
  for (const stage of CANONICAL_STAGES) {
    if (oldStatus[stage] && !newStatus[stage]) {
      if (stage === 'publication') {
        // Detect flat publication (e.g. { complete: false }) vs sub-tracked
        const pub = oldStatus[stage];
        if (pub.mtPreview || pub.faithful || pub.localized) {
          // Already sub-tracked — copy as-is
          newStatus[stage] = { ...pub };
        } else {
          // Flat shape — convert to default sub-tracks
          newStatus[stage] = {
            mtPreview: { complete: false },
            faithful: { complete: false },
            localized: { complete: false },
          };
          changes.push(`publication (flat → sub-tracks)`);
        }
      } else {
        newStatus[stage] = { ...oldStatus[stage] };
        delete newStatus[stage].status;
        delete newStatus[stage].inProgress;
        delete newStatus[stage].pending;
      }
    }
  }

  // 3. Add missing stages with defaults
  for (const stage of CANONICAL_STAGES) {
    if (!newStatus[stage]) {
      if (stage === 'publication') {
        newStatus[stage] = {
          mtPreview: { complete: false },
          faithful: { complete: false },
          localized: { complete: false },
        };
        changes.push(`+ ${stage} (default sub-tracks)`);
      } else {
        newStatus[stage] = { complete: false };
        changes.push(`+ ${stage} (default)`);
      }
    }
  }

  // 4. Ensure publication has all three sub-tracks
  if (newStatus.publication) {
    if (!newStatus.publication.mtPreview) {
      newStatus.publication.mtPreview = { complete: false };
    }
    if (!newStatus.publication.faithful) {
      newStatus.publication.faithful = { complete: false };
    }
    if (!newStatus.publication.localized) {
      newStatus.publication.localized = { complete: false };
    }
    // Remove flat 'complete' key if sub-tracks are present
    delete newStatus.publication.complete;
  }

  // Note removed stages
  for (const stage of STAGES_TO_REMOVE) {
    if (oldStatus[stage]) {
      changes.push(`- ${stage} (removed)`);
    }
  }

  // Build final status in canonical order
  const orderedStatus = {};
  for (const stage of CANONICAL_STAGES) {
    orderedStatus[stage] = newStatus[stage];
  }

  data.status = orderedStatus;

  return { data, changes };
}

// Main
const chaptersDir = path.join(BOOKS_DIR, BOOK, 'chapters');
const dirs = fs
  .readdirSync(chaptersDir)
  .filter((d) => {
    const stat = fs.statSync(path.join(chaptersDir, d));
    return stat.isDirectory();
  })
  .sort();

let totalMigrated = 0;
let totalUnchanged = 0;

for (const dir of dirs) {
  const statusPath = path.join(chaptersDir, dir, 'status.json');
  if (!fs.existsSync(statusPath)) {
    if (verbose) console.log(`  SKIP ${dir} (no status.json)`);
    continue;
  }

  const { data, changes } = migrateStatusFile(statusPath);

  if (changes.length === 0) {
    totalUnchanged++;
    if (verbose) console.log(`  OK   ${dir} (no changes needed)`);
    continue;
  }

  totalMigrated++;

  if (dryRun) {
    console.log(`  DRY  ${dir}:`);
    for (const change of changes) {
      console.log(`       ${change}`);
    }
  } else {
    fs.writeFileSync(statusPath, JSON.stringify(data, null, 2) + '\n');
    console.log(`  MIGRATED ${dir}:`);
    for (const change of changes) {
      console.log(`           ${change}`);
    }
  }
}

console.log(
  `\n${dryRun ? 'DRY RUN — ' : ''}${totalMigrated} migrated, ${totalUnchanged} unchanged`
);
