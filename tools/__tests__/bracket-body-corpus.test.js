import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { checkBracketBodies } from '../lib/bracket-body-check.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Locate a chemistry module's 01-source CNXML and 02-for-mt segments, by id. */
function module_(moduleId) {
  const book = path.join(REPO_ROOT, 'books', 'efnafraedi-2e');
  for (const ch of fs.readdirSync(path.join(book, '01-source'))) {
    const cnxml = path.join(book, '01-source', ch, `${moduleId}.cnxml`);
    const seg = path.join(book, '02-for-mt', ch, `${moduleId}-segments.en.md`);
    if (fs.existsSync(cnxml) && fs.existsSync(seg)) {
      return { cnxml: fs.readFileSync(cnxml, 'utf8'), seg: fs.readFileSync(seg, 'utf8') };
    }
  }
  return null;
}

/** Every chemistry module that has BOTH a source file and an EN segment file. */
function chemistryPairs() {
  const book = path.join(REPO_ROOT, 'books', 'efnafraedi-2e');
  const out = [];
  for (const ch of fs.readdirSync(path.join(book, '01-source'))) {
    const d = path.join(book, '01-source', ch);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.cnxml'))) {
      const id = f.replace('.cnxml', '');
      const seg = path.join(book, '02-for-mt', ch, `${id}-segments.en.md`);
      if (!fs.existsSync(seg)) continue;
      out.push({
        id,
        cnxml: fs.readFileSync(path.join(d, f), 'utf8'),
        seg: fs.readFileSync(seg, 'utf8'),
      });
    }
  }
  return out;
}

describe('E2 on live corpus fixtures', () => {
  it('m68710: catches the no-leading-space swallow the byte pattern is blind to', () => {
    const m = module_('m68710');
    expect(m, 'm68710 must exist — it is the battery SHOULD-TRIP fixture').not.toBeNull();
    // Measured 2026-08-16 with RAW occurrence iteration: 266 markers examined,
    // and the SAME swallow appears TWICE — in two occurrences of a duplicated
    // seg-id. The battery spec's own fixture note says `m68710:716,722`, naming
    // both. A `parseSegmentsMap`-based implementation reports only one of them.
    const r = checkBracketBodies(m.cnxml, m.seg);
    expect(r.examined).toBe(266);
    expect(r.findings).toEqual([
      expect.objectContaining({ type: 'i', body: 'is the reductant, HCl(g' }),
      expect.objectContaining({ type: 'i', body: 'is the reductant, HCl(g' }),
    ]);
    // Review round 1, finding 1: m68710 has no nested-marker shapes, so its
    // skippedNested gap is zero — measured 2026-08-16.
    expect(r.skippedNested).toBe(0);
  });

  it('m68733: catches the self-closing-emphasis swallow', () => {
    const m = module_('m68733');
    expect(m, 'm68733 must exist — it is the second SHOULD-TRIP fixture').not.toBeNull();
    // Measured 2026-08-16 (raw occurrence iteration): 350 markers examined, 1 finding.
    const r = checkBracketBodies(m.cnxml, m.seg);
    expect(r.examined).toBe(350);
    expect(r.findings).toEqual([expect.objectContaining({ type: 'i', body: ' 3d;' })]);
    // Review round 1, finding 1: m68733 loses 40 of its own 330 raw `i`-opens
    // to nested `[[i:…[[sub:…]]…]]` shapes — measured 2026-08-16, independently
    // by the reviewer (raw 330 / matched 290) and reproduced here.
    expect(r.skippedNested).toBe(40);
  });

  it('m68768: does NOT fire — its leading spaces are source-legitimate', () => {
    const m = module_('m68768');
    expect(m, 'm68768 must exist — it is the MUST-NOT-TRIP fixture').not.toBeNull();
    // ⚠️ THIS CASE IS THE GLOSSARY REGRESSION GUARD. Scoping the source scan to
    // <content> instead of the whole document makes it fire twice, on
    // [[i:melting point]] and [[i:freezing point]] — both sourced from <emphasis>
    // inside a <glossary><definition><meaning>, which lives OUTSIDE <content>.
    // Measured 2026-08-16 (raw occurrence iteration): 130 markers examined, 0 findings.
    const r = checkBracketBodies(m.cnxml, m.seg);
    expect(r.examined).toBe(130);
    expect(r.findings).toEqual([]);
    // Review round 1, finding 1: m68768 has no nested-marker shapes either —
    // zero gap, measured 2026-08-16.
    expect(r.skippedNested).toBe(0);
  });

  it('fires on exactly two chemistry modules corpus-wide — a 1.3% base rate', () => {
    // Measured 2026-08-16 across all 149 chemistry modules with RAW occurrence
    // iteration: **3 findings** out of **16,991** markers examined (0.02%), in
    // exactly the two modules above (m68710 twice, m68733 once). 147 clean
    // controls. The module base rate is 1.3% either way — under the battery's
    // "base rate over ~5% cannot be blocking" bar — so E2 is eligible to gate;
    // that call belongs to Plan B.
    const firing = chemistryPairs()
      .map((m) => ({ id: m.id, r: checkBracketBodies(m.cnxml, m.seg) }))
      .filter((x) => !x.r.ok);

    expect(firing.map((x) => x.id).sort()).toEqual(['m68710', 'm68733']);
    expect(firing.reduce((s, x) => s + x.r.findings.length, 0)).toBe(3);
    expect(firing.reduce((s, x) => s + x.r.examined, 0)).toBeGreaterThan(0);
  }, 120_000);

  it('skippedNested totals 445 markers corpus-wide — a real population, wider than nesting alone', () => {
    // Review round 1, finding 1 measured 319 (i-type nested markers only, 25 of
    // 149 modules). Measured here across ALL of BODY_SOURCE_ELEMENTS's types
    // (2026-08-16): 445 markers (17,436 raw opens - 16,991 examined), because
    // the SAME regex blind spot also swallows every id-bearing `term` marker
    // (61 of 61 — `[[term:x|id]]`'s trailing pipe payload, not nesting) and
    // every `em` marker (1 of 1 — always `|class`-bearing; there is no
    // class-less em, cnxml-extract.js falls back to [[i:...]] for that case).
    // `examined`/`findings` are UNCHANGED by this — same 16,991 / 3 / 2-modules
    // as the prior test — this is additive reporting, not a different check.
    const all = chemistryPairs().map((m) => checkBracketBodies(m.cnxml, m.seg));
    const totalExamined = all.reduce((s, r) => s + r.examined, 0);
    const totalSkipped = all.reduce((s, r) => s + r.skippedNested, 0);
    expect(totalExamined).toBe(16991);
    expect(totalSkipped).toBe(445);
  }, 120_000);
});
