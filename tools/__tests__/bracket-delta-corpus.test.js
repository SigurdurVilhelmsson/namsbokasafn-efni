import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { bracketMarkerDelta, bracketMarkerDeltaBySegment } from '../api-translate.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * Read a committed EN/IS pair by module id, DISCOVERING the chapter.
 * Do not hardcode a chapter — these five modules span ch12/ch16/ch17/ch18/ch21,
 * and an earlier draft of this plan guessed ch20 for all of them.
 */
function pair(book, moduleId) {
  const forMt = path.join(REPO_ROOT, 'books', book, '02-for-mt');
  for (const ch of fs.readdirSync(forMt)) {
    const en = path.join(forMt, ch, `${moduleId}-segments.en.md`);
    const is = path.join(
      REPO_ROOT,
      'books',
      book,
      '02-mt-output',
      ch,
      `${moduleId}-segments.is.md`
    );
    if (fs.existsSync(en) && fs.existsSync(is)) {
      return { en: fs.readFileSync(en, 'utf8'), is: fs.readFileSync(is, 'utf8'), ch };
    }
  }
  return null;
}

describe('A3 acceptance — the widening catches what the 14-type module aggregate misses', () => {
  it('m68823: the old instrument returns {} while MATH markers were lost', () => {
    const p = pair('efnafraedi-2e', 'm68823');
    expect(p, 'm68823 EN/IS pair must exist — it is the acceptance fixture').not.toBeNull();

    // The proven false negative: module-level, 14 types, sees nothing.
    expect(bracketMarkerDelta(p.en, p.is)).toEqual({});

    // The new instrument sees the MATH loss. Measured 2026-08-16: exactly -2,
    // over 2 of 149 segments. Asserting the value, not just the sign, so a
    // widening that over-counts is caught too.
    const r = bracketMarkerDeltaBySegment(p.en, p.is);
    expect(r.segmentsExamined).toBe(149);
    expect(r.total).toEqual({ MATH: -2 });
    expect(r.segmentsWithDelta).toBe(2);
    expect(r.unpairedSegIds).toEqual([]);
  });

  it('m68791: a clean module stays clean — this is what makes the above mean anything', () => {
    const p = pair('efnafraedi-2e', 'm68791');
    expect(p, 'm68791 EN/IS pair must exist — it is the MUST-NOT-TRIP control').not.toBeNull();

    // Measured 2026-08-16: 0 of 373 segments carry a delta. The largest module
    // in the trio, so a clean result here is not a small-sample artefact.
    const r = bracketMarkerDeltaBySegment(p.en, p.is);
    expect(r.segmentsExamined).toBe(373);
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
});
