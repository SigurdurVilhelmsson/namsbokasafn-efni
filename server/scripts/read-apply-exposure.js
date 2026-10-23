#!/usr/bin/env node
/**
 * READ-ONLY: what one click of 'Vista í skrár' / 'Vista + Birta' would write, per module, for
 * one book (register §C203, 2026-10-23).
 *
 * For every module with approved segment_edits it reports which path applyApprovedEdits would
 * take and classifies the edit each segment would receive against the text the editor sees
 * today. It mirrors server/services/segmentEditorService.js applyApprovedEdits:
 *   - the winner per segment is pickLatest() over ALL the segment's approved rows (the same
 *     server/lib/editRecency.js rule the apply path uses);
 *   - the SELF-HEAL path runs when no approved row is unapplied, no active acceptance is
 *     unapplied, and the module's faithful file is missing. It resets applied_at on every
 *     approved row and re-applies them all, so every winner is written;
 *   - otherwise only winners with applied_at NULL are overlaid; an already-applied winner's
 *     segment gets the base text.
 * The base is server/services/segmentParser.js loadModuleForEditing's `is` (faithful file if
 * present, else 02-mt-output, after its marker normalisation), which is what the editor saw and
 * what the apply path writes for unedited segments.
 *
 * Classes for a written winner, compared after trimming both sides:
 *   already-present  the base already equals the edit;
 *   clean            the base equals the text the editor started from (original_content);
 *   base-changed     neither: the edit was made on an older text and would replace today's;
 *   segment-gone     the segment is no longer in the extraction (apply skips it but still stamps it).
 * A winner the click would not write is counted as not-written.
 *
 * Modules with an active unapplied acceptance but no approved row are listed too: the click
 * writes them (the whole module, §C202) although they hold no edit.
 *
 * The database is opened `readonly: true, fileMustExist: true`. The output carries ids and
 * counts only: no names and no segment text.
 *
 * Usage (prints one JSON object on stdout):
 *   node server/scripts/read-apply-exposure.js <book>
 * On a box where this file is not deployed, send it on stdin from server/scripts, so `../lib`
 * and better-sqlite3 resolve:
 *   ssh <prod> "cd <repo>/server/scripts && node - efnafraedi-2e" \
 *     < server/scripts/read-apply-exposure.js > exposure.json
 */
const { pickLatest } = require('../lib/editRecency');

const USAGE = 'usage: read-apply-exposure.js <book>';

/**
 * @param {import('better-sqlite3').Database} db an open database (read-only is enough)
 * @param {string} book
 * @param {(book: string, chapter: number|string, moduleId: string) => {isSource: string|null,
 *   segments: Array<{segmentId: string, is: string}>}} loadModule segmentParser.loadModuleForEditing
 * @returns {{book: string, modules: object[], acceptanceOnly: object[], totals: object}}
 */
function measureApplyExposure(db, book, loadModule) {
  const approved = db
    .prepare(
      `SELECT id, chapter, module_id, segment_id, original_content, edited_content, created_at, applied_at
         FROM segment_edits WHERE book = ? AND status = 'approved'`
    )
    .all(book);
  const acceptances = db
    .prepare(
      `SELECT chapter, module_id, COUNT(*) AS n FROM segment_acceptances
        WHERE book = ? AND status = 'active' AND applied_at IS NULL GROUP BY module_id, chapter`
    )
    .all(book);
  const unappliedAcc = new Map(acceptances.map((a) => [a.module_id, a.n]));

  const byModule = new Map();
  for (const r of approved) {
    if (!byModule.has(r.module_id)) byModule.set(r.module_id, []);
    byModule.get(r.module_id).push(r);
  }

  const totals = {
    'already-present': 0,
    clean: 0,
    'base-changed': 0,
    'segment-gone': 0,
    'not-written': 0,
  };
  const modules = [];
  for (const [moduleId, rows] of [...byModule].sort(([a], [b]) => a.localeCompare(b))) {
    const chapters = [...new Set(rows.map((r) => r.chapter))];
    const chapter = chapters[0];
    const mod = loadModule(book, chapter, moduleId);
    const base = new Map(mod.segments.map((s) => [s.segmentId, s.is]));
    const unapplied = rows.filter((r) => r.applied_at === null).length;
    const acc = unappliedAcc.get(moduleId) || 0;
    const faithfulExists = mod.isSource === 'faithful';
    const selfHeal = unapplied === 0 && acc === 0 && !faithfulExists;

    const bySegment = new Map();
    for (const r of rows) {
      if (!bySegment.has(r.segment_id)) bySegment.set(r.segment_id, []);
      bySegment.get(r.segment_id).push(r);
    }
    const winners = {
      'already-present': 0,
      clean: 0,
      'base-changed': 0,
      'segment-gone': 0,
      'not-written': 0,
    };
    const baseChangedIds = [];
    for (const list of bySegment.values()) {
      const w = pickLatest(list);
      if (!(selfHeal || w.applied_at === null)) {
        winners['not-written']++;
        continue;
      }
      const cur = base.get(w.segment_id);
      const edited = (w.edited_content || '').trim();
      const original = (w.original_content || '').trim();
      let cls;
      if (cur === undefined) cls = 'segment-gone';
      else if (cur.trim() === edited) cls = 'already-present';
      else if (cur.trim() === original) cls = 'clean';
      else cls = 'base-changed';
      winners[cls]++;
      if (cls === 'base-changed') baseChangedIds.push(w.id);
    }
    for (const k of Object.keys(totals)) totals[k] += winners[k];
    modules.push({
      module: moduleId,
      chapter,
      chaptersSeen: chapters.length,
      approved: rows.length,
      unapplied,
      activeUnappliedAcceptances: acc,
      faithfulExists,
      path: selfHeal ? 'self-heal' : 'normal',
      segmentsWithApproved: bySegment.size,
      winners,
      baseChangedEditIds: baseChangedIds.sort((a, b) => a - b),
    });
  }
  const acceptanceOnly = acceptances
    .filter((a) => !byModule.has(a.module_id))
    .map((a) => ({ module: a.module_id, chapter: a.chapter, activeUnappliedAcceptances: a.n }));
  return { book, modules, acceptanceOnly, totals };
}

/** @returns {0|1|2} */
function main(argv) {
  const args = argv.slice(2);
  if (args.length !== 1 || !/^[a-z0-9-]+$/.test(args[0])) {
    console.error(USAGE);
    return 2;
  }
  const Database = require('better-sqlite3');
  const resolveDbPath = require('../lib/dbPath');
  const { loadModuleForEditing } = require('../services/segmentParser');
  const db = new Database(resolveDbPath(), { readonly: true, fileMustExist: true });
  let report;
  try {
    report = measureApplyExposure(db, args[0], loadModuleForEditing);
  } finally {
    db.close();
  }
  process.stdout.write(
    JSON.stringify({ readAt: new Date().toISOString(), ...report }, null, 1) + '\n'
  );
  return 0;
}

// A file run sets require.main; a stdin run (`node -`) does not, and must still execute.
const runDirectly = require.main === module || (module.id === '[stdin]' && process.argv[1] === '-');
if (runDirectly) {
  process.exitCode = 1; // a failure default: a run that dies before main() returns is never 0
  process.exitCode = main(process.argv);
}

module.exports = { measureApplyExposure };
