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
    // skippedUnmatchable gap is zero — measured 2026-08-16, unaffected by
    // round 2's payload fix (m68710 has no term/em markers either).
    expect(r.skippedUnmatchable).toBe(0);
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
    // by the reviewer (raw 330 / matched 290) and reproduced here. UNCHANGED by
    // round 2's payload fix: m68733's gap is 100% nesting, 0% term/em payload,
    // and nesting is still (deliberately) not fixed — see finding ① in
    // task-7-report.md's "Fix round 2".
    expect(r.skippedUnmatchable).toBe(40);
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
    // zero gap, measured 2026-08-16, unaffected by round 2's payload fix.
    expect(r.skippedUnmatchable).toBe(0);
  });

  it('fires on exactly two chemistry modules corpus-wide — a 1.3% base rate', () => {
    // Measured 2026-08-16 across all 149 chemistry modules with RAW occurrence
    // iteration: **3 findings** out of **17,051** markers examined (0.02%), in
    // exactly the two modules above (m68710 twice, m68733 once). 147 clean
    // controls. The module base rate is 1.3% either way — under the battery's
    // "base rate over ~5% cannot be blocking" bar — so E2 is eligible to gate;
    // that call belongs to Plan B.
    // ⚠️ Review round 2, finding ①: examined moved 16,991 -> 17,051 (+60) when
    // the body regex was widened to reach payload-tailed term/em markers.
    // findings and the firing set are UNCHANGED — verified as the round's
    // explicit invariant (see task-7-report.md "Fix round 2").
    const firing = chemistryPairs()
      .map((m) => ({ id: m.id, r: checkBracketBodies(m.cnxml, m.seg) }))
      .filter((x) => !x.r.ok);

    expect(firing.map((x) => x.id).sort()).toEqual(['m68710', 'm68733']);
    expect(firing.reduce((s, x) => s + x.r.findings.length, 0)).toBe(3);
    expect(firing.reduce((s, x) => s + x.r.examined, 0)).toBeGreaterThan(0);
  }, 120_000);

  it('skippedUnmatchable totals 385 markers corpus-wide, down from 445 — the payload half of the gap is now examined instead', () => {
    // Review round 1, finding 1 measured 319 (i-type nested markers only) then
    // 445 once term/em's payload-truncation cause was also measured (17,436 raw
    // opens - 16,991 examined), across ALL of BODY_SOURCE_ELEMENTS's types.
    // Review round 2, finding ①: the body regex now consumes a trailing
    // `|payload` (uncaptured) instead of failing to match at all, so every
    // id-bearing `term` (61/61) and every `em` (1/1) — 60 markers, one module's
    // (m68733's) marker count unaffected since its gap is 100% nesting — moves
    // from "skipped" to "examined". Nesting itself is UNCHANGED and still not
    // fixed (see the docstring in bracket-body-check.js for why). Measured
    // 2026-08-16: totalExamined 16,991 -> 17,051 (+60), totalSkipped
    // 445 -> 385 (-60). `findings` and the firing set are UNCHANGED — the
    // invariant this round was ruled on: no new findings, no base-rate
    // movement, verified below and in the two tests above.
    const all = chemistryPairs().map((m) => checkBracketBodies(m.cnxml, m.seg));
    const totalExamined = all.reduce((s, r) => s + r.examined, 0);
    const totalSkipped = all.reduce((s, r) => s + r.skippedUnmatchable, 0);
    const totalFindings = all.reduce((s, r) => s + r.findings.length, 0);
    expect(totalExamined).toBe(17051);
    expect(totalSkipped).toBe(385);
    expect(totalFindings).toBe(3); // the invariant: unchanged by this round's fix
  }, 120_000);
});
