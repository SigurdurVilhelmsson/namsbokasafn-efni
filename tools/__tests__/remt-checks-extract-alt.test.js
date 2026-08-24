/**
 * Tier 1 — E5, figure-alt coverage.
 *
 * 🔴 WHAT THIS FILE IS REALLY GUARDING. E5 as Plan B Task 4 specifies it — "read
 * `checkAltCoverage(...).ok`", no ctx guard, `examined` keyed to the alt positions the
 * check actually judges — was RUN through the real `runCheck` over all 149 chemistry
 * modules before a line of E5 was written. Two of its results are why this file exists:
 *
 *   plan-literal E5, committed corpus     PASS 0 · FAIL 137 · SKIPPED 12
 *   plan-literal E5, decoy cnxml          SKIPPED 149  (safe — but see below)
 *
 * ▶ THE 12 SKIPPED ARE THE 12 MODULES E5 PASSES. `SKIPPED` on a blocking check is a
 * halt (`runTier` filters it, `exitCodeFor` returns 1), so the plan's unit does not
 * halt 8.1% of chemistry at random: it halts **100% of the modules E5 currently
 * passes**, and nothing else. That is sharper than §C82 L17's "12 of 149" and is the
 * reason the unit moves. → §C82 L17, L22.
 *
 * ▶ AND THE SECOND ROW IS THE TRAP. The plan's unit was accidentally SAFE against a
 * source-side void: a decoy cnxml yields `expected 0`, `ok` reads true, and
 * `runCheck`'s `PASS + examined 0 → SKIPPED` backstop fires. Keying `examined` to
 * segments removes that accident — measured, the same decoys then produce **149 PASS
 * with `examined > 0`**, i.e. the blocking gate erased corpus-wide. **The unit fix and
 * `skipIfCtxUnusable` are a matched pair; shipping the first without the second trades
 * 12 false halts for 137 false passes.** → §C82 L22.
 *
 * ⚠️ TWO ASSERTIONS BELOW ARE §C82 L20 PREMISE PINS — derived from `02-for-mt`, which
 * the loop's own re-extract rewrites. They are LABELLED, because an unlabelled pin is
 * worse than no pin: a future session reads the red as a regression and "fixes" the code.
 */
import { describe, it, expect } from 'vitest';
import { runCheck, VERDICT, REGISTRY } from '../lib/remt-battery.js';
import { E5, EXTRACT_CHECKS } from '../lib/remt-checks-extract.js';
import { parseModuleDoc, altReachability } from '../lib/extraction-coverage.js';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { modulesWithSegments, srcText, modCtx } from './helpers/remt-corpus.js';

const CHEM = 'efnafraedi-2e';

/** Verdict tally over a book, using the real gate through the real contract. */
async function tallyOver(book) {
  const t = { PASS: 0, FAIL: 0, WARN: 0, SKIPPED: 0, zeroExamined: 0 };
  const passing = [];
  for (const { ch, m } of modulesWithSegments(book)) {
    const r = await runCheck(E5, modCtx(book, ch, m));
    t[r.verdict]++;
    if (r.examined === 0) t.zeroExamined++;
    if (r.verdict === VERDICT.PASS) passing.push(`${ch}/${m}`);
  }
  return { ...t, passing };
}

describe('E5 — the alt segments the extractor was designed to emit actually got emitted', () => {
  it('📌 L20 PREMISE PIN — FAILs on the pre-re-extract vintage, and says how many it expected', async () => {
    // EXPECTED TO MOVE AT THE RE-EXTRACT. The committed `02-for-mt` predates §C81, so it
    // holds 0 alt SEG markers corpus-wide; after step 2 of the loop this module reads
    // `reached 1` and the verdict flips to PASS. When it does, that is the corpus
    // changing — update this pin in the commit that observes it.
    const r = await runCheck(E5, modCtx(CHEM, 'ch01', 'm68663'));
    expect(r.verdict).toBe(VERDICT.FAIL);
    // 🔴 THE VACUITY CONTROL. A FAIL that examined nothing is not evidence.
    expect(r.examined).toBeGreaterThan(0);
    expect(r.message).toMatch(/expected \d+ .*reached 0/);
  });

  it('PASSES on a fresh in-process extract — the control that proves it discriminates', async () => {
    // 🔴 WITHOUT THIS, "E5 fails everything" and "E5 works" are the same observation.
    // m68710 carries 6 reachable alt positions, so this distinguishes 6 from 0 rather
    // than 1 from 0 — a fixture swap cannot quietly make it vacuous, because the
    // `expected 6` assertion below would have to be edited to hide it.
    const cnxml = srcText(CHEM, 'ch04', 'm68710');
    const segText = formatSegmentsMarkdown(extractSegments(cnxml).segments);
    const r = await runCheck(E5, { cnxml, segText });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.message).toMatch(/expected 6 /);
    expect(r.message).toMatch(/reached 6 /);
  });

  it('uses the REAL extractor in-process, never the CLI — §C83', () => {
    // `cnxml-extract.js --output-dir` is declared in --help, accepted silently and
    // IGNORED: the run writes into the real tracked `books/` tree and exits 0. A
    // rehearsal that shells out would rewrite the very corpus these pins measure.
    expect(typeof extractSegments).toBe('function');
    expect(typeof formatSegmentsMarkdown).toBe('function');
  });
});

describe("E5's `examined` unit — decided here, not inherited (§C82 L17)", () => {
  it('🔴 never reads SKIPPED on a real module — 0 of 149 chemistry, 0 of 17 organic', async () => {
    // THE DURABLE HALF, and the whole unit decision in one assertion. SKIPPED on a
    // blocking check is a halt. This stays 0 after the re-extract too: `countSegments`
    // is 0 for none of them, before or after.
    for (const book of [CHEM, 'lifraen-efnafraedi']) {
      const t = await tallyOver(book);
      expect({ book, SKIPPED: t.SKIPPED, zeroExamined: t.zeroExamined }).toEqual({
        book,
        SKIPPED: 0,
        zeroExamined: 0,
      });
    }
  });

  it("🔴 the plan's unit would have halted EXACTLY the modules E5 passes — not a random 8.1%", async () => {
    // The measurement that moved the unit, re-derived here so it cannot rot silently.
    // `expected` is the plan's `examined`; a blocking check that examines 0 halts.
    const zeroExpected = [];
    for (const { ch, m } of modulesWithSegments(CHEM)) {
      const { content } = parseModuleDoc(srcText(CHEM, ch, m));
      if (altReachability(content).reachable === 0) zeroExpected.push(`${ch}/${m}`);
    }
    const t = await tallyOver(CHEM);
    expect(zeroExpected.length).toBeGreaterThan(0); // control: the population is not empty
    expect(zeroExpected.sort()).toEqual(t.passing.sort());
  });

  it('📌 L20 PREMISE PIN — chemistry splits 137 FAIL / 12 PASS today', async () => {
    // EXPECTED TO MOVE AT THE RE-EXTRACT: every FAIL here is a module whose alts have
    // not been extracted yet, and all 137 flip to PASS once they are. The pin exists so
    // the flip is *observed* rather than assumed — the loop's own success criterion.
    const t = await tallyOver(CHEM);
    expect({ FAIL: t.FAIL, PASS: t.PASS }).toEqual({ FAIL: 137, PASS: 12 });
  });
});

/**
 * 🔴 E5 IS MORE EXPOSED TO THE SOURCE-SIDE VOID THAN E2 OR E4, NOT LESS — and the
 * reason is already written down in `remt-checks-extract.js`: `checkBracketBodies` and
 * `analyzeModule` THROW on a missing ctx, while `checkAltCoverage` returns a CLEAN
 * EMPTY. For E2/E4 the guard is belt-and-braces over a throw. For E5 it is the only
 * thing between a void and a PASS, because `ok = reached === reachable` is trivially
 * true when both sides are 0.
 * MEASURED, unguarded and keyed to segments: all four decoys take the corpus from
 * `FAIL 137 / PASS 12` to `PASS 149`, every one with `examined > 0`.
 */
describe("E5's ctx guard — the unit fix removed an accidental protection", () => {
  const REAL = () => modCtx(CHEM, 'ch01', 'm68663');

  const CASES = [
    [
      '<content> renamed away',
      (c) => c.replace(/<content([ >])/, '<contentX$1').replace('</content>', '</contentX>'),
    ],
    ['an empty <content/>', (c) => c.replace(/<content[\s\S]*<\/content>/, '<content/>')],
    [
      'a wholly unrelated XML document',
      () => '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    ],
    ["ANOTHER module's cnxml", () => srcText(CHEM, 'ch04', 'm68710')],
    [
      'a three-element decoy that HAS a <content>',
      () =>
        '<document xmlns="http://cnx.rice.edu/cnxml"><title>t</title><content><para id="z">x</para></content></document>',
    ],
  ];

  it('POSITIVE CONTROL: the real pair is still judged, not skipped', async () => {
    // Without this, a guard that refused everything would satisfy every case below.
    const r = await runCheck(E5, REAL());
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.examined).toBeGreaterThan(0);
  });

  for (const [name, mutate] of CASES) {
    it(`SKIPS rather than passing on ${name}`, async () => {
      const { cnxml, segText } = REAL();
      const r = await runCheck(E5, { cnxml: mutate(cnxml), segText });
      expect(r.verdict).toBe(VERDICT.SKIPPED);
      expect(r.examined).toBe(0);
    });
  }

  it('SKIPS with a message naming the missing key when ctx carries no cnxml', async () => {
    const r = await runCheck(E5, { segText: REAL().segText });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toMatch(/missing cnxml/);
  });
});

describe('E5 in the contract', () => {
  it('registers at tier 1 as a BLOCKING check, in id order beside its siblings', () => {
    expect(EXTRACT_CHECKS.map((c) => c.id)).toEqual(['E2', 'E4', 'E5', 'E7']);
    expect(REGISTRY.get('E5')).toBe(E5);
    expect(E5.tier).toBe(1);
    // Blocking is the spec's ruling: a module whose paid translation would silently
    // omit its figure alts must not reach the MT. §C89 is what an advisory E5 costs.
    expect(E5.blocking).toBe(true);
  });

  it('stamps a version, so decision ① can scope a quarantine to it', async () => {
    const r = await runCheck(E5, modCtx(CHEM, 'ch01', 'm68663'));
    expect(Number.isInteger(r.version)).toBe(true);
    expect(r.version).toBeGreaterThanOrEqual(1);
  });
});
