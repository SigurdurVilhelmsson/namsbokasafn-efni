/**
 * mtFindings — surface the MT findings the pipeline ALREADY computed.
 *
 * §C124. `cnxml-inject.js` writes `books/<book>/residue-report.<track>.json`,
 * naming the exact segments whose translation still looks like English. That
 * file has been committed to git for months and, until this module, ZERO lines
 * under server/ read it — so an editor could only find an MT error by already
 * knowing which segment to open. This is the delivery half; the detection half
 * was always done.
 *
 * 🔴 FAIL-SOFT BY DESIGN, AND THE DIRECTION IS DELIBERATE. A missing, malformed
 * or half-written report yields "no findings", never a throw. The report is an
 * ADVISORY overlay on the editor; an editor being unable to open a module
 * because a derived artifact is absent would be a far worse failure than a
 * badge that does not appear. The one thing that DOES throw is an unknown
 * track — that is a caller bug and it also keeps the value out of the path.
 *
 * ⚠️ THE REPORT IS A SNAPSHOT FROM INJECT TIME, NOT A LIVE CHECK. A segment an
 * editor has since fixed can still carry a flag. That is accepted ([USER],
 * 2026-09-05): the vintage is carried in `generatedAt` and shown, and nothing
 * is filtered. Suppressing a flag because the segment was edited would hide it
 * whenever someone edited the segment WITHOUT fixing the flagged problem.
 */

const fs = require('fs');
const path = require('path');
const { VALID_TRACKS } = require('../constants');

// Resolved against this file, never process.cwd() — the server runs with
// cwd=server/, so a books/-relative path resolved against cwd silently points
// at the wrong tree. This has shipped three times in tools/lib.
let BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

/** @internal Test-only: override the books directory (null restores). */
function _setTestBooksDir(dir) {
  BOOKS_DIR = dir || path.join(__dirname, '..', '..', 'books');
}

/** The empty result. Shaped identically to a populated one so callers never branch on shape. */
function empty(available = false) {
  return { available, generatedAt: null, bySegment: new Map(), byModule: new Map() };
}

/**
 * Read a book's residue report for one track.
 *
 * @param {string} book - Book slug
 * @param {string} track - Publication track; must be one of VALID_TRACKS
 * @returns {{available: boolean, generatedAt: string|null,
 *            bySegment: Map<string, {kind: 'exact'|'ratio', ratio?: number}>,
 *            byModule: Map<string, number>}}
 */
function read(book, track) {
  if (!VALID_TRACKS.includes(track)) {
    throw new TypeError(`mtFindings.read: unknown track ${JSON.stringify(track)}`);
  }

  const reportPath = path.join(BOOKS_DIR, book, `residue-report.${track}.json`);

  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {
    // Absent, unreadable or malformed — all the same to a consumer, and none
    // of them is a reason to fail the editor.
    return empty(false);
  }
  if (!report || typeof report !== 'object') return empty(false);

  const bySegment = new Map();
  const byModule = new Map();

  // Read `modules`, NEVER `summary`. In the real reports the two disagree:
  // summary.modulesWithResidue counts only modules carrying `exact` entries,
  // so trusting it makes every ratio-only module invisible.
  const modules = report.modules && typeof report.modules === 'object' ? report.modules : {};

  for (const [moduleId, buckets] of Object.entries(modules)) {
    if (!buckets || typeof buckets !== 'object') continue;
    let count = 0;

    for (const segmentId of Array.isArray(buckets.exact) ? buckets.exact : []) {
      if (typeof segmentId !== 'string') continue;
      bySegment.set(segmentId, { kind: 'exact' });
      count++;
    }

    for (const w of Array.isArray(buckets.warnings) ? buckets.warnings : []) {
      if (!w || typeof w.segmentId !== 'string') continue;
      bySegment.set(w.segmentId, { kind: 'ratio', ratio: w.ratio });
      count++;
    }

    // `tolerated` is deliberately NOT counted: those are entries an allowlist
    // has already dispositioned, so showing them would train editors to ignore
    // the badge.
    if (count > 0) byModule.set(moduleId, count);
  }

  return {
    available: true,
    // Reports written before §C124 carry no timestamp. Return null rather than
    // falling back to file mtime, which a fresh clone or a depth-1 CI checkout
    // rewrites — a wrong date is worse than an absent one.
    generatedAt: typeof report.generatedAt === 'string' ? report.generatedAt : null,
    bySegment,
    byModule,
  };
}

module.exports = { read, _setTestBooksDir };
