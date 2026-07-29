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
 * @returns {{written: number, reverted: number}}
 */
export function applyReattach({ plan, saveSegmentEdit }) {
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
  let written = 0;
  let reverted = 0;
  for (const item of plan.restore) {
    const { row, newMt, editorNote } = item;
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
    if (res && res.reverted) reverted += 1;
    else written += 1;
  }
  return { written, reverted };
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
  const plan = planReattach({ snapshot, booksDir: path.join(REPO_ROOT, 'books') });
  console.log(formatReport(plan));

  if (plan.missingModules.length) process.exit(2);
  if (!plan.reconciliation.ok) process.exit(3);
  if (!argv.includes('--db')) {
    console.log('\nDRY RUN — nothing written. Re-run with --db to apply.');
    process.exit(plan.unmatched.length ? 1 : 0);
  }
  const { saveSegmentEdit } = require(
    path.join(REPO_ROOT, 'server', 'services', 'segmentEditorService.js')
  );
  const res = applyReattach({ plan, saveSegmentEdit });
  console.log(`\nWrote ${res.written} pending edits (${res.reverted} withdrew as identical).`);
  process.exit(plan.unmatched.length ? 1 : 0);
}
