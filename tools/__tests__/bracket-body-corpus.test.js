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
    expect(r.examined).toBe(292);
    // 🔴 RE-BASELINED 2026-09-02 — REPAIRED IN THE DATA, NOT HIDDEN. The swallow
    // was real. 43bf77cd (§C58, 2026-08-12) fixed the extractor, but this module's
    // 02-for-mt had not been regenerated since 2026-03-22, so E2 went on firing on
    // a ~5-month-stale vintage; 34f870ac's full-corpus re-extraction flushed it.
    // Today the segment reads `Sn([[i:s]])is the reductant, HCl([[i:g]])` — correct.
    expect(r.findings).toEqual([]);
    // 🔴 THE MECHANISM'S POSITIVE CONTROL — DO NOT DELETE IT WITH THE `[]` ABOVE.
    // Re-plant the exact swallow in today's bytes. The check must still report it,
    // and report it TWICE: seg-id `fs-idm50940704` occurs twice in this file and
    // this check iterates RAW occurrences rather than parseSegmentsMap's deduped
    // first-wins. That doubling is the file's ONLY assertion of the raw-iteration
    // property, so re-baselining alone would retire it. Measured 2026-09-02.
    const SWALLOW_ANCHOR = 'Sn([[i:s]])is the reductant, HCl([[i:g]]) is the oxidant.';
    expect(m.seg.split(SWALLOW_ANCHOR).length - 1).toBe(2); // the mutation must actually apply
    const replanted = checkBracketBodies(
      m.cnxml,
      m.seg.split(SWALLOW_ANCHOR).join('Sn([[i:s]])[[i:is the reductant, HCl(g]]) is the oxidant.')
    );
    expect(replanted.findings).toEqual([
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
    expect(r.examined).toBe(366);
    // 🔴 RE-BASELINED 2026-09-02 — same root cause as m68710 and likewise REPAIRED
    // IN THE DATA. Today the segment reads `(a) 3[[i:d;]] (b) 1[[i:s;]] (c) 4[[i:f]]`.
    expect(r.findings).toEqual([]);
    // 🔴 THE MECHANISM'S POSITIVE CONTROL — DO NOT DELETE IT WITH THE `[]` ABOVE.
    // Re-create exactly what the pre-C58 extractor emitted when it read the
    // self-closing `<emphasis effect="italics"/>` at m68733.cnxml:343 as an opener.
    // Measured 2026-09-02 on today's bytes: 1 finding, `m68733:solution:fs-idm21203088`.
    const SELF_CLOSING_ANCHOR = '(a) 3[[i:d;]]';
    expect(m.seg.split(SELF_CLOSING_ANCHOR).length - 1).toBe(1); // unique anchor; applies once
    const replanted = checkBracketBodies(
      m.cnxml,
      m.seg.split(SELF_CLOSING_ANCHOR).join('(a)[[i: 3d;]]')
    );
    expect(replanted.findings).toEqual([expect.objectContaining({ type: 'i', body: ' 3d;' })]);
    // Review round 1, finding 1: m68733 loses 40 of its own 330 raw `i`-opens
    // to nested `[[i:…[[sub:…]]…]]` shapes — measured 2026-08-16, independently
    // by the reviewer (raw 330 / matched 290) and reproduced here. UNCHANGED by
    // round 2's payload fix: m68733's gap is 100% nesting, 0% term/em payload,
    // and nesting is still (deliberately) not fixed — see finding ① in
    // task-7-report.md's "Fix round 2".
    expect(r.skippedUnmatchable).toBe(45);
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
    expect(r.examined).toBe(143);
    expect(r.findings).toEqual([]);
    // Review round 1, finding 1: m68768 has no nested-marker shapes either —
    // zero gap, measured 2026-08-16, unaffected by round 2's payload fix.
    expect(r.skippedUnmatchable).toBe(0);
  });

  it('fires on NO chemistry module corpus-wide — 0 of 149, down from a 1.3% base rate', () => {
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
    const results = chemistryPairs().map((m) => ({
      id: m.id,
      r: checkBracketBodies(m.cnxml, m.seg),
    }));
    const firing = results.filter((x) => !x.r.ok);

    // 🔴 NON-VACUITY GUARD, AND IT MUST BE SUMMED OVER `results`, NOT `firing`.
    // An empty firing set is only evidence if the check actually looked at
    // something. The old form summed `examined` over the FIRING set, so with the
    // set empty it read `0 > 0` — the guard would have died with the thing it
    // guards. Measured 2026-09-02: 149 pairs, 17,846 markers examined.
    // ⚠️ 0.0% is a SATURATED rate — a category, not a result — so Plan B's
    // blocking-eligibility call can no longer cite the 1.3% base rate: it must be
    // re-recorded in §C82 against this population.
    expect(results.reduce((s, x) => s + x.r.examined, 0)).toBeGreaterThan(0);
    expect(firing.map((x) => x.id).sort()).toEqual([]);
    expect(firing.reduce((s, x) => s + x.r.findings.length, 0)).toBe(0);
  }, 120_000);

  it('skippedUnmatchable totals 454 markers corpus-wide, up from 385 — the nesting blind spot widened with the term dialect migration', () => {
    // Review round 1, finding 1 measured 319 (i-type nested markers only) then
    // 445 once term/em's payload-truncation cause was also measured (17,436 raw
    // opens - 16,991 examined), across ALL of BODY_SOURCE_ELEMENTS's types.
    // Review round 2, finding ①: the body regex now consumes a trailing
    // `|payload` (uncaptured) instead of failing to match at all, so every
    // id-bearing `term` (59/61 — CORRECTED 2026-08-16 from "61/61"; two nested
    // term markers in m68791/m68793 remain unmatchable) and every `em` (1/1) — 60 markers, one module's
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
    expect(totalExamined).toBe(17846);
    expect(totalSkipped).toBe(454);
    // 🔴 RE-BASELINED 2026-09-02, AND THE WORD "INVARIANT" IS DELIBERATELY GONE.
    // This was 3 because two chemistry modules were being checked against a
    // pre-C58 stale 02-for-mt vintage; 34f870ac regenerated it and both defects
    // are genuinely repaired (01-source byte-identical, instrument byte-identical
    // since 5895a25b — only the data moved). 0 here is a SATURATED rate, i.e. a
    // category not a result, so it is NOT self-evidencing: the file's proof-of-fire
    // now lives in the two re-planted-swallow controls in the m68710 and m68733
    // tests above. Do not delete them and leave this line at 0.
    expect(totalFindings).toBe(0);
  }, 120_000);
});
