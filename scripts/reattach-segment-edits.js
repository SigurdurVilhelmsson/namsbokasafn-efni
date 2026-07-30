#!/usr/bin/env node
/**
 * C16 clean break, step 2 of 2 (spec §7).
 *
 * Restores the snapshot's LIVE editorial work as PENDING edits against the
 * re-extracted, re-translated tree.
 *
 * Matching is exact (module_id, segment_id). There is no fallback and no
 * heuristic: 56 of 62 edits key on a CNXML source element id, which comes
 * from read-only 01-source and cannot drift. An edit attached to the WRONG
 * segment is far worse than one not attached, so a miss is reported and
 * skipped, never guessed.
 *
 *   node scripts/reattach-segment-edits.js --snapshot <path> [--db]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { unescapeMtMarkers } from '../tools/lib/mt-normalize.cjs';
import {
  classifyByStatus,
  detectRetiredMarkers,
  composeEditorNote,
  reconcile,
  findDuplicateRestoreKeys,
  decideExitCode,
} from './lib/segment-edit-reattach-rules.js';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Canonical chapter-dir idiom (CLAUDE.md § Directory Structure) — the same
// import export-segment-edits.js uses, so the snapshot and the re-attach
// agree on where to look.
const { chapterDir } = require(path.join(REPO_ROOT, 'server', 'lib', 'chapterLabel.js'));

function readNewMt(booksDir, book, chapter, moduleId) {
  const file = path.join(
    booksDir,
    book,
    '02-mt-output',
    chapterDir(chapter),
    `${moduleId}-segments.is.md`
  );
  if (!fs.existsSync(file)) return null;
  const { parseSegments } = require(path.join(REPO_ROOT, 'server', 'services', 'segmentParser.js'));
  const map = new Map();
  for (const seg of parseSegments(fs.readFileSync(file, 'utf8'))) {
    // The segment editor's view (and thus originalContent submitted by a
    // human save) is always post-unescape — loadModuleForEditing runs this
    // same normalization. Comparing raw file content would show spurious
    // backslashes and could never converge on an escaped segment.
    map.set(seg.segmentId, unescapeMtMarkers(seg.content));
  }
  return map;
}

export function planReattach({ snapshot, booksDir }) {
  const plan = {
    restore: [],
    converged: [],
    skippedByStatus: [],
    unmatched: [],
    missingModules: [],
  };
  const mtCache = new Map();

  for (const row of snapshot.edits) {
    if (classifyByStatus(row.status) === 'skip-status') {
      plan.skippedByStatus.push(row);
      continue;
    }
    const key = `${row.chapter}/${row.module_id}`;
    if (!mtCache.has(key)) {
      mtCache.set(key, readNewMt(booksDir, snapshot.book, row.chapter, row.module_id));
    }
    const mt = mtCache.get(key);
    if (mt === null) {
      if (!plan.missingModules.includes(row.module_id)) plan.missingModules.push(row.module_id);
      plan.unmatched.push(row);
      continue;
    }
    if (!mt.has(row.segment_id)) {
      plan.unmatched.push(row);
      continue;
    }
    const newMt = mt.get(row.segment_id);
    // saveSegmentEdit treats edited === original as a withdraw and writes no
    // row. After a re-MT that is a real and CORRECT outcome — the new draft
    // already says what the editor wrote — but it must be counted, or the
    // totals would not reconcile and the gap would look like a loss.
    if (newMt === row.edited_content) {
      plan.converged.push(row);
      continue;
    }
    const flags = detectRetiredMarkers(row.edited_content);
    plan.restore.push({
      row,
      newMt,
      flags,
      editorNote: composeEditorNote({
        flags,
        oldMt: row.context?.mtAtSnapshot || row.original_content,
        editorNote: row.editor_note,
        reviewerNote: row.reviewer_note,
      }),
    });
  }

  // Row-level metadata, deliberately NOT summed into reconcile() — the same
  // treatment missingModules gets. A collision does not move rows between
  // buckets: both rows really are restorable, and both really are in
  // plan.restore. What is wrong is that they cannot BOTH be written. Adding
  // them to the reconciliation arithmetic would double-count them.
  plan.duplicateKeys = findDuplicateRestoreKeys(plan.restore.map((item) => item.row));

  plan.reconciliation = reconcile({
    total: snapshot.edits.length,
    restored: plan.restore.length,
    converged: plan.converged.length,
    skippedByStatus: plan.skippedByStatus.length,
    unmatched: plan.unmatched.length,
  });
  return plan;
}

export function formatReport(plan) {
  const lines = [];
  lines.push('=== C16 segment-edit re-attach ===');
  lines.push(`restored          : ${plan.restore.length}`);
  lines.push(`converged         : ${plan.converged.length}  (new MT already matched the edit)`);
  lines.push(`skipped by status : ${plan.skippedByStatus.length}  (rejected / superseded)`);
  lines.push(`unmatched         : ${plan.unmatched.length}`);
  if (plan.unmatched.length) {
    lines.push('', '--- UNMATCHED (place these by hand) ---');
    for (const r of plan.unmatched) {
      lines.push(`  ${r.module_id}  ${r.segment_id}`);
      lines.push(`    EN : ${r.context?.en || '(no EN captured)'}`);
      lines.push(`    IS : ${r.edited_content}`);
    }
  }
  const flagged = plan.restore.filter((r) => r.flags.length);
  if (flagged.length) {
    lines.push('', '--- FLAGGED: retired markers, editor must fix during review ---');
    for (const r of flagged) lines.push(`  ${r.row.segment_id}  [${r.flags.join(', ')}]`);
  }
  if (plan.missingModules.length) {
    lines.push(
      '',
      `FATAL: modules absent from the new extraction: ${plan.missingModules.join(', ')}`
    );
  }
  if (plan.duplicateKeys?.length) {
    lines.push(
      '',
      'FATAL: more than one restorable row on a single editor+segment key.',
      'The apply will REFUSE. Decide which row wins in the snapshot, then re-run.'
    );
    for (const d of plan.duplicateKeys) lines.push(`  ${d.key}  (${d.count} rows)`);
  }
  lines.push('', plan.reconciliation.message);
  return lines.join('\n');
}

/**
 * Write the plan's restorable edits as PENDING rows.
 *
 * Goes through saveSegmentEdit rather than a raw INSERT on purpose: that path
 * carries the supersede and acceptance invariants a parallel INSERT would have
 * to reimplement and then keep in sync. One real code path.
 *
 * @param {{plan: object, saveSegmentEdit: Function}} args
 * @returns {{inserted: number, updated: number, reverted: number}}
 */
export function applyReattach({ plan, saveSegmentEdit }) {
  // Pre-flight, before a single write: two restorable rows on one
  // saveSegmentEdit key would collapse into one row — the second call takes the
  // UPDATE branch and overwrites the first row's text. Refuse the whole run.
  //
  // Re-derived here from plan.restore rather than read off plan.duplicateKeys:
  // applyReattach is exported and must not depend on a caller having populated
  // a field. Same pure function as planReattach uses, so the dry run's
  // prediction and this enforcement cannot disagree.
  //
  // Refusing, not merging: which of the two rows should win is an editorial
  // question, and this is a one-way migration over ~62 rows where a wrong
  // silent answer costs an editor's work and a loud stop costs a minute.
  const dupes = findDuplicateRestoreKeys(plan.restore.map((item) => item.row));
  if (dupes.length) {
    throw new Error(
      `REFUSING TO WRITE — ${dupes.length} snapshot key(s) carry more than one restorable row:\n` +
        dupes.map((d) => `  ${d.key}  (${d.count} rows)`).join('\n') +
        `\nsaveSegmentEdit resolves a save by (book, module_id, segment_id, editor_id), so the` +
        `\nsecond row would UPDATE the first and an editor's text would be lost silently —` +
        `\nreconciliation counts plan buckets, not DB rows, so it would still report success.` +
        `\nResolve which row wins in the snapshot, then re-run.`
    );
  }
  // This does NOT re-establish the MT edit-lock, and cannot: saveSegmentEdit's
  // lock hook fires only when its own INSERT is the module's first-ever
  // segment_edits row (priorCount === 1), and every module here still holds its
  // pre-break rows. scripts/backfill-mt-locks.js's header documents that
  // impossibility for exactly this row shape. The markers are re-established by
  // a separate runbook step after this script: `node scripts/backfill-mt-locks.js --db`
  // on the box whose sessions.db is authoritative.
  //
  // No outer transaction is opened. Per-row atomicity already comes from
  // saveSegmentEdit's own transaction (supersede sweep + INSERT commit
  // together), and run-level safety comes from repeatability: a re-run after a
  // partial failure finds the pending row it already wrote and updates it in
  // place, so it converges instead of duplicating. Wrapping the loop would
  // need a second connection — segmentEditorService exposes no accessor for
  // the one it uses — which would not cover these writes and could lock
  // against them.
  // Counted apart because they mean different things to an operator: `inserted`
  // is restored work, `updated` means the row was already there — the normal
  // shape of a re-run, and a surprise on a first run. A single "written" total
  // reported a repeat as fresh work.
  // `updatedKeys` carries identity, not just a count: an UPDATE-branch write is
  // exactly where spec §7's "originalContent = the new MT" silently fails, and
  // the runbook has the operator warn those editors. A bare counter leaves them
  // writing sqlite3 by hand, mid-migration, on the page that warns a mistyped
  // sqlite3 path creates a database.
  const tally = { inserted: 0, updated: 0, reverted: 0, updatedKeys: [] };
  try {
    for (const item of plan.restore) {
      const { row, newMt, editorNote } = item;
      // originalContent MUST be the new MT (spec §7). On the INSERT branch it
      // is. It is NOT on saveSegmentEdit's UPDATE branch, which never writes
      // original_content — so this depends on no pending row existing for the
      // key when the run starts. Runbook Step 4a is what guarantees that (it
      // supersedes the pre-break rows first); the dependency lives there, not
      // here. Running this script outside the runbook, against a DB that still
      // holds pending rows for these keys, silently keeps the OLD MT.
      const res = saveSegmentEdit({
        book: row.book,
        chapter: row.chapter,
        moduleId: row.module_id,
        segmentId: row.segment_id,
        originalContent: newMt,
        editedContent: row.edited_content,
        category: row.category,
        editorNote,
        editorId: row.editor_id,
        editorUsername: row.editor_username,
      });
      if (res && res.reverted) tally.reverted += 1;
      else if (res && res.updated) {
        tally.updated += 1;
        tally.updatedKeys.push(`${row.book}/${row.module_id}/${row.segment_id}/${row.editor_id}`);
      } else tally.inserted += 1;
    }
  } catch (err) {
    // A mid-loop throw must not swallow the partial tally: without it the
    // operator gets a stack trace and no idea how far the run got, mid-migration.
    // Re-thrown unchanged otherwise — this is diagnostics, never recovery.
    err.tally = { ...tally };
    throw err;
  }
  return tally;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--snapshot');
  const snapshotPath = i >= 0 ? argv[i + 1] : null;
  if (!snapshotPath) {
    console.error('Usage: node scripts/reattach-segment-edits.js --snapshot <path> [--db]');
    process.exit(1);
  }
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  // Same seam, same name as scripts/backfill-mt-locks.js:57 — the sibling
  // migration script — so the CLI's exit codes can be driven from a temp tree
  // instead of the committed one. Production never sets it.
  const booksDir = process.env.BOOKS_ROOT_OVERRIDE || path.join(REPO_ROOT, 'books');
  const plan = planReattach({ snapshot, booksDir });
  console.log(formatReport(plan));

  // A fatal code stops the run in BOTH modes: a dry run that reported success
  // where the apply refuses would be a rehearsal that lies.
  const code = decideExitCode(plan);
  if (code === 2 || code === 3 || code === 4) process.exit(code);
  if (!argv.includes('--db')) {
    console.log('\nDRY RUN — nothing written. Re-run with --db to apply.');
    process.exit(code);
  }
  const { saveSegmentEdit } = require(
    path.join(REPO_ROOT, 'server', 'services', 'segmentEditorService.js')
  );
  let res;
  try {
    res = applyReattach({ plan, saveSegmentEdit });
  } catch (err) {
    // Print the partial tally before dying: mid-migration, how far the run got
    // is the first thing the operator needs.
    if (err.tally) {
      console.error(
        `\nABORTED after inserted=${err.tally.inserted} updated=${err.tally.updated} ` +
          `withdrawn=${err.tally.reverted}.`
      );
    }
    console.error(err.stack || String(err));
    // Exit 5, NOT a bare re-throw. An uncaught throw exits 1 — the same code
    // decideExitCode gives the survivable "unmatched rows exist" outcome, which
    // the runbook's gate table reads as "Expected. Proceed." A half-applied
    // one-way migration must never wear the proceed code: the operator would
    // restart the server and tell editors their work is back, with rows
    // missing and the DB in a mixed state.
    process.exit(5);
  }
  console.log(
    `\nInserted ${res.inserted} pending edits · updated ${res.updated} already present · ` +
      `${res.reverted} withdrew as identical.`
  );
  if (res.updatedKeys.length) {
    console.log(
      '\n⚠️  These keys already had a pending row, so they took the UPDATE branch and',
      '\n    KEPT their old original_content. Their diff view is against a stale draft —',
      '\n    tell the editor. (Expected count on a first run: 0.)'
    );
    for (const k of res.updatedKeys) console.log(`      ${k}`);
  }
  process.exit(code);
}
