import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { bracketMarkerDelta, bracketMarkerDeltaBySegment } from '../api-translate.js';
import { mtOutputSegmentFiles, enCounterpart } from './helpers/remt-corpus.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FIXTURES = path.join(REPO_ROOT, 'tools/__tests__/fixtures/bracket-delta-corpus');

/**
 * 🔴 FROZEN 2026-09-22 ([USER] ruling) — THIS FILE'S EVIDENCE WAS REPAIRED OUT OF THE
 * CORPUS, SO IT NOW READS COMMITTED FIXTURES INSTEAD OF THE LIVE TREE.
 *
 * These three tests exist to prove ONE thing: that `bracketMarkerDeltaBySegment` catches
 * marker damage the module-level `bracketMarkerDelta` misses — by CANCELLATION (a loss and
 * a gain inside one module summing to nothing) and by the six types absent from
 * `BRACKET_MARKER_TYPES` (`MATH TABLE SPACE BR math EQ`). The proof needs modules that
 * ARE damaged. The five it used were repaired by the 2026-09-21 re-MT buys — m68819 in
 * ch16, m68823 ch17, m68832 ch18, m68852 ch21 — and all five now read clean.
 *
 * ▶ RE-PINNING TO TODAY'S VALUES WOULD HAVE TURNED ALL THREE INTO `expect({}).toEqual({})`:
 * the old instrument says nothing, the new one says nothing, and the file would pass
 * forever while proving that the two agree about a module with no damage in it.
 *
 * 🔑 AND THERE IS NO REPLACEMENT EVIDENCE TO RE-POINT AT — MEASURED over every EN/IS pair
 * in the two publishable books (220 pairs), for the two cells this file exists to fill:
 *   missing-types (old `{}` AND a wide-only type present) — **0 of 220. Empty corpus-wide.**
 *   cancellation  (old `{}` AND a real per-segment delta) — **2**, both organic ch12, both
 *                 VINTAGE-SKEWED pairs, and both die the moment organic ch12 is bought,
 *                 which is the next planned work.
 * So the choice was freeze or lose the test. The bytes below are the pre-repair blobs from
 * `34f870ac9^`, and EVERY assertion in this file reproduces against them unchanged — that
 * was verified before the fixtures were committed, not after.
 *
 * ⚠️ THE PRECEDENT IS IN THIS DIRECTORY, not invented here: `remt-checks-glossary.test.js`
 * commits `fixtures/c73-ium-terms.json` for the same reason and uses the git blobs only to
 * prove the committed copy has not drifted. Its header also records why `fetch-depth: 0` is
 * not the answer — `.git` here is 4.2 GB — and that CI checks out SHALLOW, so a test that
 * reads git history is testing the developer's clone. Both are inherited below.
 *
 * ⚠️ WHAT FREEZING COSTS, stated rather than hidden: these three now measure HISTORY. The
 * `describe` at the bottom is the live-corpus leg that keeps "the instrument is wired up and
 * still fires" true without depending on damage that no longer exists.
 */
const PRE_REPAIR = '34f870ac9^';
const BLOB_PATHS = {
  m68823: 'ch17',
  m68791: 'ch12',
  m68819: 'ch16',
  m68832: 'ch18',
  m68852: 'ch21',
};

const blobsResolvable = (() => {
  try {
    for (const [m, ch] of Object.entries(BLOB_PATHS)) {
      execFileSync(
        'git',
        ['cat-file', '-e', `${PRE_REPAIR}:books/efnafraedi-2e/02-for-mt/${ch}/${m}-segments.en.md`],
        { cwd: REPO_ROOT }
      );
    }
    return true;
  } catch {
    return false;
  }
})();

/** Read a frozen EN/IS pair by module id. */
function pair(_book, moduleId) {
  const en = path.join(FIXTURES, `${moduleId}.en.md`);
  const is = path.join(FIXTURES, `${moduleId}.is.md`);
  if (!fs.existsSync(en) || !fs.existsSync(is)) return null;
  return { en: fs.readFileSync(en, 'utf8'), is: fs.readFileSync(is, 'utf8') };
}

describe('A3 acceptance — the widening catches what the 14-type module aggregate misses', () => {
  it('m68823: the old instrument returns {} while MATH markers were lost', () => {
    const p = pair('efnafraedi-2e', 'm68823');
    expect(p, 'm68823 EN/IS pair must exist — it is the acceptance fixture').not.toBeNull();

    // The proven false negative: module-level, 14 types, sees nothing.
    expect(bracketMarkerDelta(p.en, p.is)).toEqual({});

    // The new instrument sees the MATH loss. Measured 2026-08-16: exactly -2,
    // over 2 of 151 RAW segment occurrences (fix round 1: segmentsExamined now
    // counts every raw <!-- SEG: --> occurrence via parseSegmentRecords, not
    // deduped parseSegmentsMap keys — 149 was the deduped-key undercount).
    // Asserting the value, not just the sign, so a widening that over-counts
    // is caught too.
    const r = bracketMarkerDeltaBySegment(p.en, p.is);
    expect(r.segmentsExamined).toBe(151);
    expect(r.total).toEqual({ MATH: -2 });
    expect(r.segmentsWithDelta).toBe(2);
    expect(r.unpairedSegIds).toEqual([]);
  });

  it('m68791: a clean module stays clean — this is what makes the above mean anything', () => {
    const p = pair('efnafraedi-2e', 'm68791');
    expect(p, 'm68791 EN/IS pair must exist — it is the MUST-NOT-TRIP control').not.toBeNull();

    // Measured 2026-08-16: 0 of 380 RAW segment occurrences carry a delta (fix
    // round 1: 373 was the deduped-unique-id count; this module has 7 raw
    // duplicate occurrences that a deduped comparison never even looked at).
    // The largest module in the trio, so a clean result here is not a
    // small-sample artefact.
    // ⚠️ IN THE LIVE TREE THIS MODULE IS NO LONGER CLEAN — the 2026-09-01 re-extract
    // added figure-`alt` segments, and one of them (`fs-idp16234496-alt`) came back
    // `C[[sub:4]]H[[sub:6]]` where OpenStax spells the subscripts out in words for a
    // screen reader. That is §C169's class, repaired at INJECT rather than in
    // `02-mt-output`, so the live file still carries it and would read `{sub: 4}`.
    // The frozen copy predates it, which is precisely why the control still controls.
    const r = bracketMarkerDeltaBySegment(p.en, p.is);
    expect(r.segmentsExamined).toBe(380);
    expect(r.segmentsWithDelta).toBe(0);
    expect(r.total).toEqual({});
    expect(r.unpairedSegIds).toEqual([]);
  });

  it('the three other known-bad modules each gain a MATH loss the old instrument missed', () => {
    // Measured 2026-08-16. Each row: the old instrument's verdict, and the MATH
    // delta only the widened one sees. m68819 and m68832 were NOT silent before —
    // they reported other types — so the point here is the ADDED MATH finding,
    // which is why each assertion names it specifically.
    const expected = {
      m68819: { old: { i: -2 }, math: -1 },
      m68832: { old: { i: -13, sub: 1, sup: 1, xref: -11 }, math: -1 },
      m68852: { old: {}, math: -2 },
    };
    for (const [moduleId, exp] of Object.entries(expected)) {
      const p = pair('efnafraedi-2e', moduleId);
      expect(p, `${moduleId} EN/IS pair must exist`).not.toBeNull();

      expect(bracketMarkerDelta(p.en, p.is), `${moduleId} old instrument`).toEqual(exp.old);

      const r = bracketMarkerDeltaBySegment(p.en, p.is);
      expect(r.total.MATH, `${moduleId} MATH delta`).toBe(exp.math);
      expect(r.unpairedSegIds, `${moduleId} unpaired`).toEqual([]);
    }
  });

  it('the committed fixtures still match the real git blobs (skipped on a shallow clone)', () => {
    // 🔴 THE DRIFT CHECK, inherited from `remt-checks-glossary.test.js`. It is what keeps a
    // frozen fixture honest: without it, "the bytes are from 34f870ac9^" is a claim in a
    // comment rather than a checked property. It runs on a full clone and is SKIPPED —
    // loudly, never silently — where history is absent, because CI checks out at depth 1.
    if (!blobsResolvable) {
      expect(blobsResolvable).toBe(false); // records WHY this assertion did not run
      return;
    }
    for (const [m, ch] of Object.entries(BLOB_PATHS)) {
      for (const [side, dir, ext] of [
        ['en', '02-for-mt', 'en.md'],
        ['is', '02-mt-output', 'is.md'],
      ]) {
        const blob = execFileSync(
          'git',
          ['show', `${PRE_REPAIR}:books/efnafraedi-2e/${dir}/${ch}/${m}-segments.${ext}`],
          { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256e6 }
        );
        const committed = fs.readFileSync(path.join(FIXTURES, `${m}.${side}.md`), 'utf8');
        expect(committed, `${m}.${side} drifted from ${PRE_REPAIR}`).toBe(blob);
      }
    }
  });
});

describe('the instrument still FIRES on the live corpus (non-vacuity, not acceptance)', () => {
  // 🔴 WHY THIS EXISTS. The three tests above are frozen, so on their own they can no longer
  // tell a working `bracketMarkerDeltaBySegment` from one that returns `{}` for everything.
  // This leg asserts nothing about WHAT it finds — the corpus moves every buy, and pinning a
  // finding count here would re-create the staleness the freeze was meant to end. It asserts
  // only that the instrument reaches the corpus and still reports something.
  it('reports at least one per-segment finding across the two publishable books', () => {
    let pairs = 0;
    let withFinding = 0;
    for (const book of ['efnafraedi-2e', 'lifraen-efnafraedi']) {
      for (const f of mtOutputSegmentFiles(book)) {
        const en = enCounterpart(f);
        if (!en) continue;
        pairs++;
        const r = bracketMarkerDeltaBySegment(
          fs.readFileSync(en, 'utf8'),
          fs.readFileSync(f, 'utf8')
        );
        if (r.segmentsWithDelta > 0 || (r.unpairedSegIds || []).length > 0) withFinding++;
      }
    }
    // The POPULATION is the control: a run that examined nothing would report
    // "0 findings" and look identical to a clean corpus.
    expect(pairs).toBeGreaterThan(150);
    expect(withFinding).toBeGreaterThan(0);
  });
});
