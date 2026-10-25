#!/usr/bin/env node
/**
 * READ-ONLY: one book's `segment_edits` rows with status 'pending', plus the status counts.
 *
 * Written for plan 2026-10-10 Stage 1, item 1.6 (experiments/terminology-consistency/):
 * the pending rows from before the clean break are compared with the current MT by
 * `freeze_pending_edits.py`, which also drops the editors' names before anything is committed.
 *
 * The database is opened `readonly: true, fileMustExist: true`; nothing is written.
 * The output carries editor names, so keep it off the repo (the freeze step redacts them).
 *
 * Usage (prints one JSON object on stdout):
 *   node server/scripts/read-pending-edits.js <book>
 *
 * ⚠️ To run it on a box where this file is not deployed, send the SCRIPT on stdin, from
 * server/scripts so `../lib` and better-sqlite3 in server/node_modules both resolve:
 *   ssh <prod> "cd <repo>/server/scripts && node - efnafraedi-2e" \
 *     < server/scripts/read-pending-edits.js > pending.json
 */
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');

const book = process.argv[2];
if (!book) {
  console.error('usage: read-pending-edits.js <book>');
  process.exitCode = 2;
} else {
  const db = new Database(resolveDbPath(), { readonly: true, fileMustExist: true });
  const counts = db
    .prepare('SELECT status, count(*) AS n FROM segment_edits WHERE book = ? GROUP BY status')
    .all(book);
  const rows = db
    .prepare(
      `SELECT * FROM segment_edits WHERE book = ? AND status = 'pending' ORDER BY created_at, id`
    )
    .all(book);
  // Rows on the same segments with another status: a later approval would supersede a pending row.
  const others = db
    .prepare(
      `SELECT id, segment_id, status, created_at FROM segment_edits
        WHERE book = ? AND status != 'pending'
          AND segment_id IN (SELECT segment_id FROM segment_edits WHERE book = ? AND status = 'pending')`
    )
    .all(book, book);
  db.close();
  process.stdout.write(
    JSON.stringify({ book, readAt: new Date().toISOString(), counts, rows, others }, null, 1)
  );
}
