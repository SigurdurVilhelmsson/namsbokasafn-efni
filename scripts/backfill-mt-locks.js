#!/usr/bin/env node
// Lock every module that has already entered editing, so it can never be
// re-MT'd (even with --force) before its next NEW edit. There are two
// independent signals for "editing has already started", covered by two
// independent modes of this script:
//
//   1. FILE signal (always runs, no flag needed): a
//      03-faithful-translation/{ch}/{module}-segments.is.md file exists —
//      Pass-1 review has produced (and applied) at least one edit for this
//      module.
//   2. DB signal (opt-in via --db): a segment_edits row exists for the
//      module, even though no faithful file exists yet — an edit was SAVED
//      in the editor but never approved+applied. C2's lock-on-first-edit
//      hook (server/services/segmentEditorService.js saveSegmentEdit) can
//      NEVER retroactively fire for these rows: it only writes the marker
//      when its own INSERT is the module's first-ever segment_edits row
//      (`priorCount === 1`), and for a module edited before this feature
//      existed, priorCount is already >1 on every future edit. The file
//      signal can't catch these either, by definition (no faithful file).
//      So a module with only pre-existing segment_edits rows would stay
//      permanently unlocked without this mode.
//
// IMPORTANT — rollout coverage: running this script with NO flags closes
// only the file-signal gap. Closing the DB-signal gap for real requires
// running it with --db exactly ONCE, on the box whose sessions.db is
// AUTHORITATIVE — i.e. production. Editor edits live only in that DB (see
// project CLAUDE.md's Two-Repository/server-features notes); a dev box's
// local pipeline-output/sessions.db is not prod state, so running --db here
// locks nothing that matters and must not be mistaken for having closed the
// gap. This is a one-time deploy-time step, tracked in
// docs/plans/2026-07-11-provenance-durability-remediation-plan.md (Track C).
//
// IDEMPOTENT AND SAFE TO RE-RUN, in either mode: writeMtLock() no-ops when a
// marker already exists (tools/lib/mt-lock.cjs), so re-running only ever
// fills in newly-qualifying modules and never touches an existing marker's
// contents. A module found by both signals in the same run is locked and
// counted exactly once (see `seen` below).
//
// Usage:
//   node scripts/backfill-mt-locks.js          # file signal only
//   node scripts/backfill-mt-locks.js --db     # file signal + DB signal
//                                               # (SESSIONS_DB_PATH-aware —
//                                               # see server/lib/dbPath.js —
//                                               # fails loud if the resolved
//                                               # DB file doesn't exist)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { mtLockPathFor, writeMtLock } from '../tools/lib/mt-lock.cjs';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Test seam: repoint the books/ root at a temp tree, mirroring the
// DB_PATH_OVERRIDE precedent in scripts/backup-db.sh. Test-only — never set
// this in production; the default anchors against this file's own location
// (import.meta.url), never process.cwd().
const BOOKS = process.env.BOOKS_ROOT_OVERRIDE || path.join(REPO_ROOT, 'books');

const USE_DB = process.argv.includes('--db');

let newlyLocked = 0;
let alreadyLocked = 0;
// mtOutput paths already resolved this run, across BOTH signals — without
// this, a module found by both (has a faithful file AND segment_edits rows)
// would be counted twice: once "already locked" by whichever signal runs
// second, on top of being counted by the first. Each module is counted
// exactly once, attributed to whichever signal reaches it first.
const seen = new Set();

/** Idempotently lock one module and count it exactly once for this run. */
function lockModule(mtOutput, meta, label) {
  if (seen.has(mtOutput)) return;
  seen.add(mtOutput);
  const before = fs.existsSync(mtLockPathFor(mtOutput));
  writeMtLock(mtOutput, meta);
  if (before) {
    alreadyLocked++;
  } else {
    newlyLocked++;
    console.log(`locked ${label}`);
  }
}

// ---------------------------------------------------------------------------
// DB signal (opt-in): resolve + validate + query UPFRONT, before the file
// walk below, so a broken --db invocation (missing DB, missing table) fails
// fast and loud before any locking work happens. The resulting rows are
// applied AFTER the file-signal loop (further down), so a module present in
// both signals is attributed to the file signal (the older, primary source
// of truth) — `lockModule`'s `seen` guard makes that safe either way.
// ---------------------------------------------------------------------------
let dbRows = null;
if (USE_DB) {
  // Lazy requires: only touch server/'s CJS libs and the better-sqlite3
  // native addon when --db is actually requested, so a problem loading them
  // (e.g. the addon not built on this box) can never break the default
  // file-only signal, which must stay byte-identical to today regardless.
  const require = createRequire(path.join(REPO_ROOT, 'server/'));
  const resolveDbPath = require(path.join(REPO_ROOT, 'server', 'lib', 'dbPath.js'));
  // Bare specifier, resolved starting from the server/ anchor above — finds
  // server/node_modules/better-sqlite3 regardless of this script's cwd
  // (never process.cwd(); matches tools/migrate-pipeline-status.js).
  const Database = require('better-sqlite3');

  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error(`ERROR: --db was passed but no database exists at ${dbPath}.`);
    console.error(
      'Refusing to silently skip the DB-aware signal: it exists specifically to lock ' +
        'modules with saved-but-never-applied edits that the file-only signal cannot see.'
    );
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const hasTable = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='segment_edits'`)
      .get();
    if (!hasTable) {
      console.error(`ERROR: --db was passed but ${dbPath} has no segment_edits table.`);
      process.exit(1);
    }
    // No status filter: C2's lock-on-first-edit hook counts ALL rows for a
    // module regardless of status (pending/approved/rejected/discuss) — any
    // row at all means "editing has started". This scan must match that
    // semantic exactly, or it would under- or over-lock relative to what C2
    // would have done had it been live since the row was created.
    dbRows = db.prepare(`SELECT DISTINCT book, chapter, module_id FROM segment_edits`).all();
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// File signal (always runs): modules that already have a faithful-translation
// file.
// ---------------------------------------------------------------------------
for (const book of fs.readdirSync(BOOKS)) {
  const bookDir = path.join(BOOKS, book);
  if (!fs.statSync(bookDir).isDirectory()) continue;
  // Skip test-fixture books (slug starts with "__", e.g. __e2e-fixture__): their
  // 03-faithful-translation/ content is gitignored local E2E state, not real
  // editorial output, so a marker committed from it would be wrong on a fresh
  // clone (the fixture's faithful file wouldn't exist there, but a committed
  // .locked marker derived from it would still ship).
  if (book.startsWith('__')) continue;
  const faithfulRoot = path.join(bookDir, '03-faithful-translation');
  const mtRoot = path.join(bookDir, '02-mt-output');
  if (!fs.existsSync(faithfulRoot) || !fs.existsSync(mtRoot)) continue;
  for (const ch of fs.readdirSync(faithfulRoot)) {
    const chDir = path.join(faithfulRoot, ch);
    if (!fs.statSync(chDir).isDirectory()) continue;
    for (const f of fs.readdirSync(chDir)) {
      if (!f.endsWith('-segments.is.md')) continue;
      const mtOutput = path.join(mtRoot, ch, f); // sibling MT path
      if (!fs.existsSync(mtOutput)) continue;
      lockModule(mtOutput, { reason: 'backfill-already-edited' }, `${book}/${ch}/${f}`);
    }
  }
}

// ---------------------------------------------------------------------------
// DB signal (opt-in): apply the rows fetched above, if --db was passed.
// ---------------------------------------------------------------------------
if (dbRows) {
  // Reuse the server's own chapter-dir convention rather than re-deriving it:
  // chapter -1 is 'appendices', not 'ch-1' — a hand-rolled zero-pad would get
  // that case wrong. Node caches the module, so this is a cheap re-resolve of
  // the same segmentParser.js instance the DB-validation block above already
  // loaded, not a second disk read.
  const require = createRequire(path.join(REPO_ROOT, 'server/'));
  const { chapterDir } = require(path.join(REPO_ROOT, 'server', 'services', 'segmentParser.js'));

  for (const row of dbRows) {
    const book = row.book;
    const moduleId = row.module_id;
    // Same test-fixture skip as the file signal above (Correction 5), applied
    // to DB rows too: a marker derived from a dev/E2E book's segment_edits
    // rows would be just as wrong on a fresh clone as one derived from its
    // gitignored faithful file.
    if (book.startsWith('__')) continue;
    const chDir = chapterDir(row.chapter);
    const mtOutput = path.join(BOOKS, book, '02-mt-output', chDir, `${moduleId}-segments.is.md`);
    if (!fs.existsSync(mtOutput)) continue; // DB row with no matching MT file on disk — nothing to lock
    lockModule(
      mtOutput,
      { reason: 'backfill-db-segment-edits' },
      `${book}/${chDir}/${moduleId}-segments.is.md (via segment_edits)`
    );
  }
}

console.log(`Backfill complete: ${newlyLocked} module(s) newly locked.`);
console.log(`Already locked: ${alreadyLocked} module(s) (verified this run, no change).`);
