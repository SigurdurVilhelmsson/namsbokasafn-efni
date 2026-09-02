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
import { buildCnxml, parseSegments } from '../cnxml-inject.js';
import { altIdsSourceCanProduce, emittedAltIds } from '../lib/remt-checks-extract.js';
import fs from 'node:fs';
import path from 'node:path';
import { modulesWithSegments, srcText, modCtx, REPO_ROOT } from './helpers/remt-corpus.js';

/**
 * EVERY `01-source` module, not just those with a committed segment file. The orphan
 * sweep must cover the population the PAID RUN will extract (491), not the 166 that
 * happen to carry a pre-re-extract segment file — those are different populations and
 * this file's own header warns about conflating them.
 */
function allSourceModules(book) {
  const root = path.join(REPO_ROOT, 'books', book, '01-source');
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.cnxml')) out.push(p);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

const CHEM = 'efnafraedi-2e';

/** Verdict tally over a book, using the real gate through the real contract. */
async function tallyOver(book) {
  const t = { PASS: 0, FAIL: 0, WARN: 0, SKIPPED: 0, zeroExamined: 0 };
  const passing = [];
  let expected = 0;
  let reached = 0;
  for (const { ch, m } of modulesWithSegments(book)) {
    const r = await runCheck(E5, modCtx(book, ch, m));
    t[r.verdict]++;
    if (r.examined === 0) t.zeroExamined++;
    if (r.verdict === VERDICT.PASS) passing.push(`${ch}/${m}`);
    // 🔴 THE PAYLOAD, AND ITS REASON IS NOT THE OBVIOUS ONE. It does NOT catch a verdict
    // mutation — `expected`/`reached` bypass `ok` entirely. What ONLY these two see is both
    // counters collapsing TOGETHER: 0 === 0 reads PASS on every module, so a verdict tally
    // is structurally blind to it. Verdict-logic mutations are killed by the planted
    // controls, not here.
    const a = r.message.match(/expected (\d+) reachable alt positions, reached (\d+) emitted/);
    if (a) {
      expected += Number(a[1]);
      reached += Number(a[2]);
    }
  }
  return { ...t, passing, expected, reached };
}

describe('E5 — the alt segments the extractor was designed to emit actually got emitted', () => {
  it('📌 L20 PIN, FLIPPED AT THE RE-EXTRACT — the COMMITTED m68663 now carries its one alt', async () => {
    // EXPECTED TO MOVE AT THE RE-EXTRACT. The committed `02-for-mt` predates §C81, so it
    // holds 0 alt SEG markers corpus-wide; after step 2 of the loop this module reads
    // `reached 1` and the verdict flips to PASS. When it does, that is the corpus
    // changing — update this pin in the commit that observes it.
    const r = await runCheck(E5, modCtx(CHEM, 'ch01', 'm68663'));
    expect(r.verdict).toBe(VERDICT.PASS);
    // 🔴 THE VACUITY CONTROL. A FAIL that examined nothing is not evidence.
    expect(r.examined).toBeGreaterThan(0);
    expect(r.message).toMatch(/expected 1 .*reached 1 /);
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

  it('📌 L20 PIN, FLIPPED AT THE RE-EXTRACT — chemistry is 149 PASS / 0 FAIL, all 1,149 alt positions reached', async () => {
    // EXPECTED TO MOVE AT THE RE-EXTRACT: every FAIL here is a module whose alts have
    // not been extracted yet, and all 137 flip to PASS once they are. The pin exists so
    // the flip is *observed* rather than assumed — the loop's own success criterion.
    const t = await tallyOver(CHEM);
    // 🔴 THE VERDICT TALLY ALONE WOULD NOW BE A SATURATED GOLDEN (0 FAIL is what a check
    // that judges nothing also reports), so the PAYLOAD rides with it. Repair, not
    // blindness: the EMITTED side moved 0 -> 1,149 while reachability did not move at all,
    // against a byte-unchanged 01-source.
    expect({ FAIL: t.FAIL, PASS: t.PASS, expected: t.expected, reached: t.reached }).toEqual({
      FAIL: 0,
      PASS: 149,
      expected: 1149,
      reached: 1149,
    });
  });
});

/**
 * 🔴 THESE TWO TESTS EXIST BECAUSE THE MUTATION BATTERY FOUND THEM MISSING, NOT BECAUSE
 * THEY WERE PLANNED. Ten mutations were applied to E5; eight died and two walked:
 *
 *   `verdict: reached >= expected ? PASS : FAIL`   every other test still green
 *   `findings: []`                                 every other test still green
 *
 * ▶ THE FIRST IS THE SHARPER ONE, AND IT IS THIS REPO'S OWN LESSON ABOUT COMMENTS. E5's
 * docstring asserts "EQUALITY, NOT `>=`" and names the reason — a `reached > expected` is
 * the duplicate-alt shape §C81 Task 10 closed, where an alt is emitted twice, translated
 * twice and **PAID FOR twice**. Nothing tested it, because the natural over-emission rate
 * is 0 corpus-wide: the direction is UNFALSIFIABLE without a planted control, exactly as
 * Task 5's E3 row says of raw XML residue. A comment that generalises past its code is how
 * a gap survives review.
 * ▶ THE SECOND matters to Plan C, not to Tier 1's exit code: the driver quarantines and
 * ATTRIBUTES from `findings`, so a FAIL carrying none is a halt nobody can act on.
 */
describe('the equality gate, and the findings a FAIL must carry', () => {
  it('🔴 FAILs when an alt is emitted TWICE — a planted control, because the base rate is 0', async () => {
    const cnxml = srcText(CHEM, 'ch04', 'm68710');
    const fresh = formatSegmentsMarkdown(extractSegments(cnxml).segments);
    const anAlt = fresh.match(/<!--\s*SEG:[^\s]*:alt:[^\s]*\s*-->/);
    expect(anAlt).not.toBeNull(); // control: the fixture really does carry alt markers
    const doubled = fresh.replace(anAlt[0], `${anAlt[0]}\n\ndup\n\n${anAlt[0]}`);
    const r = await runCheck(E5, { cnxml, segText: doubled });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.message).toMatch(/expected 6 .*reached 7 /);
    // Signed, not clamped: the sign IS the direction, and over-emission is the paid one.
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({
      kind: 'alt-coverage',
      expected: 6,
      reached: 7,
      delta: 1,
    });
  });

  it('🔴 an under-emitted alt FAILs with a NEGATIVE delta — a planted control, because the base rate is 0', async () => {
    // NO LONGER VINTAGE-BOUND. The pre-re-extract pin read this off chemistry ch01/m68663,
    // whose committed `02-for-mt` carried 0 alt markers; the re-extract gave that module its
    // one alt and it now PASSes. Measured 2026-09-02: 0 of 491 modules across both kept books
    // produce an under-emission finding, so the direction is UNFALSIFIABLE from the corpus and
    // needs a planted control — the mirror of the over-emission control above.
    const cnxml = srcText(CHEM, 'ch04', 'm68710');
    const fresh = formatSegmentsMarkdown(extractSegments(cnxml).segments);
    // 🔴 THE BASELINE ARM IS THE CONTROL: if this fixture's alt count ever moves off 6, this
    // names it instead of asserting a wrong delta against a shifted baseline.
    const base = await runCheck(E5, { cnxml, segText: fresh });
    expect(base.verdict).toBe(VERDICT.PASS);
    expect(base.message).toMatch(/expected 6 .*reached 6 /);
    expect(base.findings).toHaveLength(0);
    const parts = fresh.split(/(?=<!--\s*SEG:)/);
    const i = parts.findIndex((p) => /<!--\s*SEG:[^\s]*:alt:/.test(p));
    expect(i).toBeGreaterThan(-1); // control: the fixture really carries alt markers
    const r = await runCheck(E5, { cnxml, segText: parts.filter((_, k) => k !== i).join('') });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.message).toMatch(/expected 6 .*reached 5 /);
    // Signed, not clamped: the sign IS the direction. This is the repo's ONLY binding of
    // `delta < 0`; without it a `Math.abs(reached - expected)` mutation escapes the suite.
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({
      kind: 'alt-coverage',
      expected: 6,
      reached: 5,
      delta: -1,
    });
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
    // 🔴 THE INVARIANT IS "JUDGED", NOT ANY PARTICULAR VERDICT — this line used to pin the
    // MECHANISM instead: FAIL was only what the pre-re-extract corpus supplied, and the
    // re-extract moved it to PASS. A closed set states the property and survives the next
    // corpus flip. (`examined > 0` is what excludes a junk verdict: runCheck turns an
    // unrecognised one into FAIL with examined 0.)
    const r = await runCheck(E5, REAL());
    expect([VERDICT.PASS, VERDICT.FAIL]).toContain(r.verdict);
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

/**
 * 🔴 A TRIPWIRE, NOT A TEST OF THE FEATURE — AND THE DIFFERENCE IS WORTH STATING. E5's
 * message carries a parenthesised `unreachableByReason` suffix, and NO INPUT CAN MAKE IT
 * APPEAR: `ALT_BLIND_DIRECT_PARENTS` is `new Set([])` (`extraction-coverage.js:200`),
 * because §C88 added an emitter for all five known blind positions. So `altReachability`
 * never assigns a `reason`, `unreached` is always 0, and the suffix is structurally
 * unreachable rather than merely zero-base-rate.
 * Measured: three mutations against that path — dropping the suffix, hardcoding `unreached`
 * to 0, and joining the reasons with `''` — ALL ESCAPE a green suite, and none of them CAN
 * be caught while the Set is empty. Planting a control would mean editing
 * `extraction-coverage.js`, which is not this task's file.
 * ▶ WHAT THIS TEST BUYS INSTEAD: the day someone re-arms that Set — the one event that
 * makes the sensor live — this goes red and names E5's unverified formatting, instead of
 * the new blind position being reported through a code path nothing ever ran.
 */
describe('the still-blind-position sensor is disarmed, and this is what re-arms it', () => {
  it('📌 TRIPWIRE — `unreached` is 0 and no message carries a reasons suffix, corpus-wide', async () => {
    let withReasons = 0;
    let nonZeroUnreached = 0;
    let n = 0;
    for (const book of [CHEM, 'lifraen-efnafraedi']) {
      for (const { ch, m } of modulesWithSegments(book)) {
        const r = await runCheck(E5, modCtx(book, ch, m));
        n++;
        if (/still-blind position \(/.test(r.message)) withReasons++;
        if (!/ 0 in a still-blind position/.test(r.message)) nonZeroUnreached++;
      }
    }
    expect(n).toBeGreaterThan(100); // control: the walk is not empty
    expect({ withReasons, nonZeroUnreached }).toEqual({ withReasons: 0, nonZeroUnreached: 0 });
  });
});

/**
 * 🔴 THE ORPHAN LEG — IT EXISTS BECAUSE A WHOLE-BRANCH REVIEW FILED THIS AS A BLOCKER,
 * ITS SKEPTIC REFUTED IT, AND THE REFUTATION WAS OVERTURNED BY EXECUTION.
 *
 * The skeptic's ground was that "an orphan-keyed alt does not make readAlt miss". The
 * committed §C89 sentinel harness says otherwise, and this file now runs that harness
 * rather than restating the argument:
 *
 *   control (fresh extract)                E5 PASS  expected 6 reached 6   sentinel 6/6
 *   ONE alt elementId renamed              E5 PASS  expected 6 reached 6   sentinel 5/6   <- before
 *   ONE alt elementId renamed              E5 FAIL  1 orphan-keyed         sentinel 5/6   <- after
 *
 * The injector resolves an alt through `structure.alt.segmentId`, misses, and falls back
 * to `alt.text` — so the UNTRANSLATED ENGLISH alt is published while every count
 * reconciles. That is §C89 reproduced inside the gate built to prevent it.
 * ▶ CLAUDE.md: "A COUNT CANNOT SEE A SUBSTITUTION THAT DID NOT HAPPEN. Prove a translation
 * REACHED the output with a sentinel, never with a tally." → active register §C82 L26.
 */
describe('E5 leg 2 — the orphan key a tally cannot see', () => {
  /** The §C89 sentinel: replace every alt's TEXT with a token the source cannot contain. */
  function sentinelSweep(cnxml, segTextRaw) {
    const { structure, equations, inlineAttrs } = extractSegments(cnxml);
    const parsed = parseSegments(segTextRaw);
    const sent = new Map();
    let n = 0;
    for (const [key] of parsed) {
      if (String(key).split(':')[1] !== 'alt') continue;
      const token = `ZQXALT${n}ZQX`;
      parsed.set(key, token);
      sent.set(key, token);
      n++;
    }
    const out = buildCnxml(structure, parsed, equations, cnxml, {}, inlineAttrs).cnxml;
    let reached = 0;
    for (const token of sent.values()) if (out.includes(token)) reached++;
    return { emitted: n, reached };
  }

  const CNXML = () => srcText(CHEM, 'ch04', 'm68710');

  it('POSITIVE CONTROL: an untouched fresh extract PASSes and all 6 alts reach the output', async () => {
    const cnxml = CNXML();
    const segText = formatSegmentsMarkdown(extractSegments(cnxml).segments);
    const r = await runCheck(E5, { cnxml, segText });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(sentinelSweep(cnxml, segText)).toEqual({ emitted: 6, reached: 6 });
  });

  it('🔴 FAILs an orphan-keyed alt — and the sentinel proves a translation really is dropped', async () => {
    const cnxml = CNXML();
    const fresh = formatSegmentsMarkdown(extractSegments(cnxml).segments);
    const victim = fresh.match(/<!--\s*SEG:([^\s]*:alt:[^\s]*)\s*-->/);
    expect(victim).not.toBeNull(); // control: the fixture carries alt markers
    const mutated = fresh.replace(
      `SEG:${victim[1]}`,
      `SEG:${victim[1].replace(/:alt:.*$/, ':alt:fs-idORPHANNOTHINGHASTHIS')}`
    );
    expect(mutated).not.toBe(fresh); // control: the substitution actually happened

    // The tally is UNMOVED — this is the whole point, and why leg 1 alone cannot see it.
    const r = await runCheck(E5, { cnxml, segText: mutated });
    expect(r.message).toMatch(/expected 6 .*reached 6 /);
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.filter((f) => f.kind === 'alt-orphan-key')).toHaveLength(1);

    // And the defect is REAL, not just detected: one translation does not reach the output.
    expect(sentinelSweep(cnxml, mutated)).toEqual({ emitted: 6, reached: 5 });
  });

  it('🔴 FALSE-HALT CONTROL — 0 orphans over a fresh extract of both kept books', () => {
    // The enumeration is the risk: a first draft collecting only <media> ids and src slugs
    // left 1,901 of organic's 2,162 unresolved (88% of the book), because organic keys most
    // alts on the FIGURE id. A missing shape false-halts a whole book, so this asserts the
    // per-shape breakdown too — a bare "0 unresolved" would also pass over an empty walk.
    const tally = { modules: 0, alts: 0, producible: 0, positional: 0, orphan: 0 };
    for (const book of [CHEM, 'lifraen-efnafraedi']) {
      for (const file of allSourceModules(book)) {
        const cnxml = fs.readFileSync(file, 'utf8');
        const { segments } = extractSegments(cnxml);
        const producible = altIdsSourceCanProduce(parseModuleDoc(cnxml).content);
        tally.modules++;
        for (const id of emittedAltIds(formatSegmentsMarkdown(segments))) {
          tally.alts++;
          if (producible.has(id)) tally.producible++;
          else if (/^(media|standalone)-\d+-alt$/.test(id)) tally.positional++;
          else tally.orphan++;
        }
      }
    }
    // Every count asserted, so the three buckets cannot silently trade against each other:
    // a shape that stopped resolving would move `producible` down and `orphan` up together.
    expect(tally).toEqual({
      modules: 491, // control: chemistry 149 + organic 342
      alts: 3312, // control: chemistry 1149 + organic 2163
      producible: 3295, // figure/media id + src slug
      positional: 17, // media-N-alt / standalone-N-alt, accepted by pattern
      orphan: 0, // the assertion this test exists for
    });
    // 📌 3,311 -> 3,312 when §C85-alt (#412) landed on main: a table entry holding BOTH a
    // <media> and a <para> now emits its alt, which is organic's 245th entry-media. The
    // move was PREDICTED before merging main into this branch and measured after — and
    // `orphan` stayed 0, which is the cross-check that matters: the new alt is keyed by
    // `altElementIdFromSrc`, a shape `altIdsSourceCanProduce` already accepts, so two
    // independently-built pieces agree about what a legitimate alt id looks like.
  });
});

describe('E5 in the contract', () => {
  it('registers at tier 1 as a BLOCKING check, in id order beside its siblings', () => {
    expect(EXTRACT_CHECKS.map((c) => c.id)).toEqual([
      'E1',
      'E2',
      'E3',
      'E4',
      'E5',
      'E6',
      'E7',
      'E9',
    ]);
    expect(REGISTRY.get('E5')).toBe(E5);
    expect(E5.tier).toBe(1);
    // Blocking is the spec's ruling: a module whose paid translation would silently
    // omit its figure alts must not reach the MT. §C89 is what an advisory E5 costs.
    expect(E5.blocking).toBe(true);
  });

  it('stamps version 2 EXACTLY — a silent revert is what decision ① cannot survive', async () => {
    // 🔴 PINNED TO THE EXACT NUMBER, not `>= 1`, and that is deliberate. E5 went to v2 when
    // the orphan leg changed its JUDGEMENT. A mutation reverting it to 1 escaped the whole
    // battery under the loose assertion — and the version's only job is to let decision ①
    // scope a quarantine to "verdicts issued by instrument version N", which a silent
    // revert makes unfalsifiable. Bumping this line is the point: it forces the next
    // judgement change to be deliberate rather than incidental.
    const r = await runCheck(E5, modCtx(CHEM, 'ch01', 'm68663'));
    expect(r.version).toBe(2);
  });
});
