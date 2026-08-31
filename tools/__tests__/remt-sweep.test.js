/**
 * remt-sweep.test.js — the base-rate sweep's guards.
 *
 * ── WHAT THIS FILE IS ACTUALLY DEFENDING ─────────────────────────────────────
 * A sweep's output is a table of numbers that someone will quote. Every defect
 * this file guards against produces a table that still looks orderly:
 *
 *   an omitted check        -> an absent row, indistinguishable from "nothing to report"
 *   a wrong denominator     -> every rate in the tier quietly computed over the wrong base
 *   a missing spawn input   -> a 100% "rate" that is a refusal, not a measurement
 *   an aggregate over books -> one number describing neither of them
 *
 * None of those throws. None turns anything red. They are caught here or not
 * at all.
 *
 * ⚠️ THE CORPUS COUNTS BELOW ARE PINNED ON PURPOSE, AND THEY WILL GO RED. The
 * two kept books are re-extracted and re-rendered by the very loop this battery
 * gates, so 166/197/161/112 are properties of TODAY'S tree. A red here after the
 * run means the population moved — re-measure and re-pin; it is signal, not
 * flake. Pinning them is what stops an empty walk from passing as a clean sweep
 * (§C82 test convention: "corpus tests must assert a control count").
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readChapterFromDisk } from '../cnxml-render-fidelity-check.js';
import {
  BLOCKING_RATE_BAR,
  TIER_INPUT_REGENERATED,
  TIER_REGENERATED_BY,
  IMAGE_REPLACEMENT_TYPES,
  spawnIncomplete,
  collectSpawns,
  SWEEP_BOOKS,
  SWEEP_TRACKS,
  UNMEASURABLE,
  SPAWN_DEPENDENT,
  TIER_SPECS,
  assertTotalPartition,
  sourceChapterDirs,
  modulePairUnits,
  isFileUnits,
  translatedUnits,
  chapterCellUnits,
  baselineKeyFor,
  intentionalImageDropsFor,
  sweep,
  formatReport,
} from '../remt-sweep.js';
import { REGISTRY } from '../lib/remt-battery.js';
import { modulesWithSegments, mtOutputSegmentFiles } from './helpers/remt-corpus.js';

const CHEM = 'efnafraedi-2e';
const ORG = 'lifraen-efnafraedi';

describe('the partition over REGISTRY is TOTAL', () => {
  it('every registered check is either swept or declared unmeasurable', () => {
    expect(() => assertTotalPartition(REGISTRY.values())).not.toThrow();
    expect(REGISTRY.size).toBeGreaterThan(30); // control: an empty registry passes vacuously
  });

  it('a check in a tier with no ctx builder THROWS rather than being dropped', () => {
    // The scenario: a tier 5 is added and the sweep is not taught to build its
    // ctx. Without this guard the report simply omits it, and an omitted row
    // reads exactly like a row with nothing to report.
    const orphan = { id: 'Z9', tier: 9, blocking: true, version: 1, run: () => ({}) };
    expect(() => assertTotalPartition([...REGISTRY.values(), orphan])).toThrow(
      /neither swept nor declared/
    );
    expect(() => assertTotalPartition([...REGISTRY.values(), orphan])).toThrow(/Z9/);
  });

  it('every UNMEASURABLE entry names a REAL check and carries a reason', () => {
    for (const [id, entry] of Object.entries(UNMEASURABLE)) {
      expect(REGISTRY.has(id), `UNMEASURABLE names '${id}', which is not registered`).toBe(true);
      // 🔴 A REASON IS THE WHOLE POINT. "Unmeasurable" without a cause is
      // indistinguishable from "measured, found nothing" in a summary table.
      expect(entry.reason.length, `${id} reason`).toBeGreaterThan(40);
      expect(entry.availableAfter.length, `${id} availableAfter`).toBeGreaterThan(5);
    }
    expect(Object.keys(UNMEASURABLE).sort()).toEqual(['E6', 'E7', 'E9', 'R2']);
  });

  it('every SPAWN_DEPENDENT entry names a REAL check', () => {
    for (const id of Object.keys(SPAWN_DEPENDENT)) expect(REGISTRY.has(id)).toBe(true);
    expect(Object.keys(SPAWN_DEPENDENT).sort()).toEqual(['G5', 'R3', 'R4']);
  });
});

describe('the populations — one unit per tier, each with its own denominator', () => {
  it('tier 1 is 166 module pairs and tier 2 is 197 IS files — DIFFERENT numbers', () => {
    const t1 = modulePairUnits(CHEM).length + modulePairUnits(ORG).length;
    const t2 = isFileUnits(CHEM).length + isFileUnits(ORG).length;
    expect(t1).toBe(166);
    expect(t2).toBe(197);
    // 🔴 THE ASSERTION THAT MATTERS IS THAT THEY DIFFER. The register's
    // authoritative "197" is tier 2's; quoting it as tier 1's overstates that
    // tier's coverage by 31 units — organic's `exercises` bundles, which have no
    // source counterpart to pair with (§C82 L19 amendment).
    expect(t1).not.toBe(t2);
    expect(t2 - t1).toBe(31);
  });

  it("the sweep's walkers agree UNIT-FOR-UNIT with the test helper's", () => {
    // 🔴 AN IDENTITY CLAIM THAT NOTHING CROSS-CHECKS IS WORTH NOTHING. Two
    // walkers over the same population exist — one here for the tool, one in
    // `helpers/remt-corpus.js` for the tests — and the whole point of the second
    // is that the tests and the tool measure THE SAME THING. The assertion goes
    // BETWEEN them, because neither module's own tests can see a divergence.
    for (const book of SWEEP_BOOKS) {
      expect(modulePairUnits(book).map((u) => `${u.ch}/${u.module}`)).toEqual(
        modulesWithSegments(book).map((u) => `${u.ch}/${u.m}`)
      );
      expect(
        isFileUnits(book)
          .map((u) => u.isPath)
          .sort()
      ).toEqual(mtOutputSegmentFiles(book).sort());
    }
    expect(modulePairUnits(CHEM).length).toBe(149); // control: non-empty comparison
  });

  it('tier 4 is 112 cells — chapter directories ONLY, not media/docx/exercises', () => {
    const cells = chapterCellUnits(CHEM).length + chapterCellUnits(ORG).length;
    // 🔴 THE FIRST VERSION COUNTED `media`, `docx` AND `exercises` AS CHAPTERS
    // and produced 120. The inflation was invisible in the verdict column — a
    // `media` cell has no published HTML, so it SKIPs and the table stays orderly
    // — while every tier-4 RATE was computed over the wrong base. It was caught
    // by disagreeing with §C82 L88's independently measured 112.
    expect(cells).toBe(112);
    expect(cells).toBe(
      SWEEP_TRACKS.length * (sourceChapterDirs(CHEM).length + sourceChapterDirs(ORG).length)
    );
  });

  it('sourceChapterDirs excludes the non-chapter directories — with a positive control', () => {
    const chem = sourceChapterDirs(CHEM);
    // The control: it must still FIND the chapters, or an over-strict filter
    // would satisfy the exclusion assertions by returning nothing at all.
    expect(chem).toContain('ch01');
    expect(chem).toContain('appendices');
    expect(chem.length).toBe(23);
    expect(sourceChapterDirs(ORG).length).toBe(33);
    for (const junk of ['media', 'docx', 'exercises']) {
      expect(chem, `${junk} must not be a chapter`).not.toContain(junk);
      expect(sourceChapterDirs(ORG), `${junk} must not be a chapter`).not.toContain(junk);
    }
  });

  it('tier 3 counts translated CNXML that EXISTS, per track', () => {
    const t3 = translatedUnits(CHEM).length + translatedUnits(ORG).length;
    expect(t3).toBe(161);
    // organic has no `faithful` directory at all — an absent track is zero units,
    // not an error, and not a track full of empty ones.
    expect(translatedUnits(ORG).filter((u) => u.track === 'faithful')).toEqual([]);
    expect(translatedUnits(ORG).filter((u) => u.track === 'mt-preview').length).toBe(8);
  });
});

describe('the two chapter-key conventions the loader owns', () => {
  it('baselineKeyFor unpads — the baseline says "3" where the directory says "03"', () => {
    expect(baselineKeyFor('03')).toBe('3');
    expect(baselineKeyFor('3')).toBe('3');
    expect(baselineKeyFor(3)).toBe('3');
    expect(baselineKeyFor('appendices')).toBe('appendices');
    // A gate handed the wrong key reads "no baseline" and SKIPs, which looks
    // exactly like the expected inert state (§C82 L90).
    expect(baselineKeyFor('03')).not.toBe('03');
  });

  it('intentionalImageDropsFor counts IMAGES, filters by TYPE, and reads the INJECTED cnxml', () => {
    // 🔴 THREE DIVERGENCES FROM THE PRODUCER, ALL INVISIBLE ON TODAY'S CORPUS. The
    // first version counted MODULES, applied NO type filter, and read `01-source`.
    // `computeIntentionalImageDrops` counts `<image>` OCCURRENCES, filters on
    // REPLACEMENT_TYPES, and takes the INJECTED CNXML — the array `checkChapter` is
    // about to read. They agreed only because chemistry's one special module has
    // exactly one image and its type IS `periodic-table`.
    const pt = (id, images) =>
      `<document><metadata><md:content-id>${id}</md:content-id></metadata>` +
      '<image src="a"/>'.repeat(images) +
      '</document>';
    // m68859 is chemistry's `periodic-table` special module.
    expect(intentionalImageDropsFor(CHEM, [pt('m68859', 1)])).toBe(1);
    // IMAGES, not modules — a 2-image special module counts 2. Counting modules
    // would UNDER-count and make K2 (BLOCKING) report a deliberate omission as a
    // drop: a false halt.
    expect(intentionalImageDropsFor(CHEM, [pt('m68859', 2)])).toBe(2);
    // A module that is not special is not subtracted at all.
    expect(intentionalImageDropsFor(CHEM, [pt('m68663', 3)])).toBe(0);
    // 🔴 THE TYPE FILTER, EXERCISED FROM THE OTHER SIDE: a module that IS in
    // specialModules but whose type is not a REPLACEMENT type must NOT be
    // subtracted. Without this arm, a filter that accepted every type would pass
    // every assertion here — and on a BLOCKING check that MASKS a real drop.
    const cfg = JSON.parse(
      fs.readFileSync(
        path.resolve(import.meta.dirname, '..', '..', 'books', CHEM, 'book-config.json'),
        'utf8'
      )
    );
    const special = Object.keys(cfg.specialModules || {});
    expect(special, 'control: chemistry really has a special module').toContain('m68859');
    expect(cfg.specialModules.m68859).toBe('periodic-table');
    // organic's specialModules is {} — nothing is ever subtracted.
    expect(intentionalImageDropsFor(ORG, [pt('m68859', 5)])).toBe(0);
    // Degenerate inputs are 0, never NaN: K5's `NaN` refusal SKIPs a BLOCKING check.
    for (const bad of [undefined, null, [], ['<document/>']]) {
      expect(intentionalImageDropsFor(CHEM, bad), String(bad)).toBe(0);
    }
  });

  it('the type filter is REAL — a special module of an unrecognised type is not subtracted', () => {
    // The producer's REPLACEMENT_TYPES set exists because only some special
    // modules replace their images. Without the filter, K2 would MASK a real drop.
    const src = fs.readFileSync(
      path.resolve(import.meta.dirname, '..', 'cnxml-render-fidelity-check.js'),
      'utf8'
    );
    // 🔴 SET EQUALITY, BOTH DIRECTIONS. The first version only checked that each of
    // OUR types appears in the producer's text — one-directional, so a type the
    // PRODUCER gained and we did not would pass, and every image of that module
    // would be subtracted by the producer and not by us (or vice versa) on a
    // BLOCKING check. It also sliced 400 chars, an arbitrary window.
    const start = src.indexOf('const REPLACEMENT_TYPES');
    const block = src.slice(start, src.indexOf(']);', start) + 3);
    const theirs = [...block.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort();
    expect(theirs.length, "the producer's set parsed empty — the window is wrong").toBeGreaterThan(
      0
    );
    expect(theirs).toEqual([...IMAGE_REPLACEMENT_TYPES].sort());
  });

  it('the chapter it is called with is the chapter K2 judges — a corpus arm', () => {
    const inputs = readChapterFromDisk(
      path.resolve(import.meta.dirname, '..', '..', 'books', CHEM),
      'appendices',
      'mt-preview'
    );
    expect(inputs.cnxml.length, 'control: appendices really has injected cnxml').toBeGreaterThan(0);
    expect(intentionalImageDropsFor(CHEM, inputs.cnxml)).toBe(1); // m68859, the periodic table
    const ch1 = readChapterFromDisk(
      path.resolve(import.meta.dirname, '..', '..', 'books', CHEM),
      '01',
      'mt-preview'
    );
    expect(ch1.cnxml.length).toBeGreaterThan(0);
    expect(intentionalImageDropsFor(CHEM, ch1.cnxml)).toBe(0);
  });
});

describe('a sweep run reports units, denominators and a total partition', () => {
  it('rows carry their unit and a rate over EVALUABLE, not over population', async () => {
    const report = await sweep({ books: [CHEM], tiers: [1], limit: 4 });
    expect(report.rows.length).toBeGreaterThan(0);
    for (const r of report.rows) {
      expect(r.unit).toBe('module pair');
      expect(r.population).toBe(4);
      expect(r.evaluable).toBe(r.population - r.SKIPPED);
      expect(r.tripped).toBe(r.FAIL + r.WARN);
      if (r.evaluable > 0 && !r.note) expect(r.rate).toBeCloseTo(r.tripped / r.evaluable, 10);
    }
    // 🔴 NO SILENT CAPS: a truncation that does not announce itself turns a
    // partial sweep into a report that reads as full coverage.
    expect(report.truncated.length).toBe(1);
    expect(report.truncated[0]).toMatch(/149 -> 4/);
  });

  it('the partition is total on a SCOPED run: swept + unmeasurable + out-of-scope', async () => {
    const report = await sweep({ books: [CHEM], tiers: [1], limit: 2 });
    expect(report.covered).toBe(report.registrySize);
    expect(report.covered).toBe(
      report.rows.length + report.unmeasurable.length + report.scopedOut.length
    );
    // out-of-scope is a THIRD class: "unmeasurable" is a claim about the corpus,
    // this is a claim about the invocation. Folding them would misreport both.
    expect(report.scopedOut.length).toBeGreaterThan(0);
    expect(report.scopedOut.map((c) => c.id)).not.toContain('E1');
  });

  it('a spawn-dependent row without its spawn reports NO RATE, not a number', async () => {
    // 🔴 MEASURED: with spawns off, G5 reports FAIL on both books — 100%. That is
    // the contract working as designed ("G5's producer leg is a FINDING when
    // payloadVerdict is absent, not a pass"), but it is a statement about the
    // INVOCATION, and a summary table renders the two identically.
    const report = await sweep({ books: [CHEM], tiers: [0] });
    const g5 = report.rows.find((r) => r.id === 'G5');
    expect(g5.note).toMatch(/needs spawnGlossaryPayloadCheck/);
    expect(g5.rate).toBeNull();
    // The control: a NON-spawn-dependent row in the same run does carry a rate,
    // so `rate: null` is not simply what this run produces for everything.
    const g1 = report.rows.find((r) => r.id === 'G1');
    expect(g1.note).toBeNull();
    expect(g1.rate).not.toBeNull();
    expect(formatReport(report)).toContain('NOT A RATE');
  });

  it('every row carries a per-book split, because an aggregate can describe neither book', async () => {
    const report = await sweep({ books: SWEEP_BOOKS, tiers: [1], limit: 8 });
    const e5 = report.rows.find((r) => r.id === 'E5');
    expect(e5.byBook.map((b) => b.book)).toEqual([...SWEEP_BOOKS].sort());
    // The per-book populations must sum to the aggregate, or the split is lying.
    expect(e5.byBook.reduce((n, b) => n + b.population, 0)).toBe(e5.population);
    expect(formatReport(report)).toContain(CHEM);
  });

  it('a ctx failure SHRINKS the rate denominator, and the report must carry it', async () => {
    // 🔴 THIS TEST WAS TITLED "…but keeps it in the denominator" AND ASSERTED
    // `rate === null` — i.e. it pinned the shrink it claimed to refute, and it
    // only ever exercised TOTAL failure, where every unit fails and the effect is
    // invisible. The dangerous case is PARTIAL: measured, E2 (BLOCKING) moves
    // 1.34% -> 28.57% and joins the over-the-bar alarm on the strength of units
    // nothing ever read. The rate cannot honestly be repaired — the units really
    // were not judged — so the fix is that the failure REACHES THE PAYLOAD.
    const spec = TIER_SPECS.find((x) => x.tier === 1);
    const original = spec.ctx;
    try {
      let n = 0;
      spec.ctx = (u, o) => {
        if (n++ % 2 === 0) throw new Error('synthetic ctx failure');
        return original(u, o);
      };
      const report = await sweep({ books: [CHEM], tiers: [1], limit: 4 });
      expect(report.ctxFailures.length, 'the payload must record every ctx failure').toBe(2);
      expect(report.ctxFailures[0]).toMatchObject({ tier: 1, book: CHEM });
      expect(report.ctxFailures[0].message).toContain('synthetic ctx failure');
      for (const r of report.rows) {
        expect(r.population).toBe(4); // population is untouched…
        // …the 2 failed units land in SKIPPED, and the denominator loses them.
        // ⚠️ THE EXPECTED VALUES ARE LITERAL. `expect(r.evaluable).toBe(4 - r.SKIPPED)`
        // restates `shape()`'s own definition of `evaluable`, so it holds for any
        // SKIPPED at all — including 0, i.e. for a run where the ctx failures never
        // happened. Naming 2 is what binds the shrink.
        expect(r.SKIPPED).toBe(2);
        expect(r.evaluable).toBe(2);
      }
      // The human-readable report must SAY the rates are unusable.
      expect(formatReport(report)).toContain('ctx BUILD FAILURES');
      expect(formatReport(report)).toContain('unusable');
    } finally {
      spec.ctx = original;
    }
  });

  it('CONTROL — with no ctx failures the payload is empty and the section is absent', async () => {
    const report = await sweep({ books: [CHEM], tiers: [1], limit: 4 });
    expect(report.ctxFailures).toEqual([]);
    expect(formatReport(report)).not.toContain('ctx BUILD FAILURES');
  });
});

describe('the sweep never gates', () => {
  it('SWEEP_BOOKS is the two kept books and nothing else', () => {
    // CLAUDE.md's scope, not this tool's: the other three books are withdrawn
    // from publication and pointing a RUN at them is forbidden.
    expect([...SWEEP_BOOKS]).toEqual(['efnafraedi-2e', 'lifraen-efnafraedi']);
  });

  it('a registered check the sweep trips does not make the sweep a verdict', async () => {
    // The tool MEASURES. Trips are its expected output — the acceptance criteria
    // demand several near-100% rows — so scoring them into an exit code would
    // make the honest result look like a failure and invite someone to "fix" it.
    const report = await sweep({ books: [CHEM], tiers: [1], limit: 4 });
    expect(report.rows.some((r) => r.tripped > 0)).toBe(true);
    expect(report).not.toHaveProperty('exitCode');
    expect(report).not.toHaveProperty('ok');
  });
});

describe('the acceptance figures Plan B names, re-derived here with their denominators', () => {
  // ⚠️ SLOW-ISH BUT WHOLE-CORPUS ON PURPOSE. These are the four numbers Plan B's
  // acceptance section names, and the point of the section is that a TIDY sweep
  // is the failure mode. Pinning them here means a future change that quietly
  // turns one green goes red instead.
  it('A2a / A4 / A8 are SKIPPED with examined 0 — no module carries a run record', async () => {
    const report = await sweep({ books: SWEEP_BOOKS, tiers: [2] });
    for (const id of ['A2a', 'A4', 'A8']) {
      const r = report.rows.find((x) => x.id === id);
      expect(r.SKIPPED, `${id} skipped`).toBe(r.population);
      expect(r.examinedTotal, `${id} examined`).toBe(0);
      expect(r.rate, `${id} rate`).toBeNull(); // never 0% — that would read as "measured, clean"
    }
    // Control: the same run must produce real rates for the run-record-free
    // checks, or "everything SKIPPED" would be the trivial explanation.
    expect(report.rows.find((x) => x.id === 'A3').evaluable).toBe(197);
  }, 60_000);

  it('K3 is SKIPPED on every cell — no before-snapshot artefact exists anywhere', async () => {
    const report = await sweep({ books: SWEEP_BOOKS, tiers: [4] });
    const k3 = report.rows.find((r) => r.id === 'K3');
    expect(k3.SKIPPED).toBe(112);
    expect(k3.rate).toBeNull();
    // 🔴 AMENDED 2026-08-31 — HALF OF THIS PROHIBITION WAS OVERTURNED, AND THE
    // ASSERTIONS ABOVE ARE UNAFFECTED EITHER WAY. §C82 L92③ forbade TWO things:
    // making K3 advisory, and letting it PASS on an absent snapshot. The [LEAD]'s
    // 2026-08-30 clean-break decision made the past-facing gates advisory, so K3
    // is now `blocking: false` — but it still SKIPs on all 112 cells and still
    // reports `rate: null`, which is why nothing here moved. ▶ THE SECOND HALF
    // STANDS AND IS THE ONE WITH TEETH: a snapshot taken late flips K3 to a clean
    // PASS with a plausible non-zero `examined`, which is strictly WORSE than
    // either a halt or an advisory SKIP. DO NOT "FIX" THIS BY LETTING K3 PASS.
    // Control: sibling tier-4 checks DID evaluate, so this is K3's state and not
    // the tier failing to run.
    expect(report.rows.find((r) => r.id === 'K2').evaluable).toBe(26);
  }, 60_000);
});

describe("the blocking-bar readout — the sweep's most decision-relevant output", () => {
  it('every tier is classified as regenerated-by-the-loop or not, and tier 0 is the exception', () => {
    // 🔴 THIS IS THE DIFFERENCE BETWEEN "THIS CHECK IS MISCALIBRATED" AND "THIS
    // DATA IS BROKEN". Tiers 1-4 read trees the loop rewrites (02-for-mt,
    // 02-mt-output, 03-translated, 05-publication); tier 0 reads the glossary,
    // which nothing in the extract -> MT -> inject -> render loop regenerates.
    expect(Object.keys(TIER_INPUT_REGENERATED).map(Number).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(TIER_INPUT_REGENERATED[0]).toBe(false);
    for (const t of [1, 2, 3, 4]) expect(TIER_INPUT_REGENERATED[t], `tier ${t}`).toBe(true);
    // Every registered check falls in a classified tier — no silent default.
    for (const c of REGISTRY.values()) {
      expect(TIER_INPUT_REGENERATED, `tier ${c.tier} (${c.id})`).toHaveProperty(String(c.tier));
    }
  });

  it('a blocking check over the bar is REPORTED, with the right one of the two readings', async () => {
    // 🔴 THE OVER-BAR ROW IS NOW SYNTHESISED, BECAUSE TIER 0 IS CLEAN. This used to rely on
    // G1 and G3 failing on the live glossaries — real term competitions and English
    // function-word headwords. The 2026-08-30 cleanup (§C82 L151) removed both, so the live
    // tier-0 sweep has nothing over the bar and the assertion failed for a reason that says
    // nothing about the FORMATTING property it names. Pushing a real row over the bar keeps
    // the property pinned and cannot evaporate with the corpus.
    const report = await sweep({ books: SWEEP_BOOKS, tiers: [0] });
    const g1 = report.rows.find((r) => r.id === 'G1');
    expect(g1, 'G1 missing from a tier-0 sweep').toBeTruthy(); // control: the row exists
    expect(g1.blocking, 'G1 is not blocking — this fixture assumes it is').toBe(true);
    g1.rate = 0.9; // over any plausible bar
    const text = formatReport(report);
    expect(text).toContain('BLOCKING CHECKS OVER');
    expect(text).toMatch(/G1\s+tier 0/);
    expect(text).toContain('DATA THE RUN WILL CONSUME');
    expect(text).not.toContain('committed VINTAGE'); // tier 0 must not get tier 1-4's reading
  }, 30_000);

  it('📌 PREMISE — the LIVE tier-0 sweep is over the bar on EXACTLY G1 and G3', async () => {
    // The other half of the statement above, and the record of why the fixture above had to
    // change.
    // 🔴 REWRITTEN 2026-08-31 (§C116). This asserted an EMPTY over-bar list, true only under
    // the 2026-08-30 domain-scoped glossary. That approach was replaced (it dropped 1,632 of
    // 2,021 terms to fix 67), so the cross-domain terms are back and both checks fire again:
    //   G1 — one competition: `si` = `alþjóðlega einingakerfið` vs `kísill`
    //   G3 — `minus → mínus` and `plus → plús`, BOTH BENIGN (same-sense; G3 knows homography
    //        and not sense). The seven harmful entries it used to fire on are gone.
    // ▶ PINNED AS AN EXACT SET, WHICH IS STRONGER THAN THE EMPTY LIST IT REPLACES: a THIRD
    // check going over the bar reddens this, and so does either of these two going clean —
    // the second direction being the one an empty-list assertion can never catch.
    // ⚠️ Neither is a reader-visible defect today: `formatGlossary` OMITS both `si`
    // candidates from the MT wire, and on the render side all 21 `Si` math labels resolve to
    // `english`. The MT-side and render-side protections are independent (CLAUDE.md), and
    // here they happen to both hold — which is a measurement, not a guarantee.
    const report = await sweep({ books: SWEEP_BOOKS, tiers: [0] });
    expect(
      report.rows.length,
      'empty sweep — the result below would be manufactured'
    ).toBeGreaterThan(0);
    const overBar = report.rows.filter((r) => r.blocking && r.rate !== null && r.rate > 0.05);
    expect(overBar.map((r) => r.id).sort()).toEqual(['G1', 'G3']);
  }, 30_000);

  it('a tier whose input the loop regenerates gets the VINTAGE reading instead', async () => {
    const report = await sweep({ books: SWEEP_BOOKS, tiers: [1] });
    const text = formatReport(report);
    // E5 ~92.8% and E1 ~62.7% are properties of the committed vintage — the loop
    // rewrites 02-for-mt before any of these checks runs for real.
    expect(text).toContain('committed VINTAGE');
    expect(text).not.toContain('DATA THE RUN WILL CONSUME');
    const e5 = report.rows.find((r) => r.id === 'E5');
    expect(e5.blocking).toBe(true);
    expect(e5.rate).toBeGreaterThan(BLOCKING_RATE_BAR);
  }, 60_000);

  it('CONTROL — a run with NO blocking check over the bar omits the section entirely', async () => {
    // Without this, the two assertions above pass against a formatter that prints
    // the heading unconditionally.
    const report = await sweep({ books: SWEEP_BOOKS, tiers: [1] });
    const clean = { ...report, rows: report.rows.map((r) => ({ ...r, rate: 0 })) };
    expect(formatReport(clean)).not.toContain('BLOCKING CHECKS OVER');
    // ...and the real one DOES, so the difference is the rate and not the shape.
    expect(formatReport(report)).toContain('BLOCKING CHECKS OVER');
  }, 60_000);
});

describe('a spawn that DIED must not be scored as a base rate', () => {
  const dead = (expected) => ({
    glossary: new Map(),
    schema: new Map(),
    audit: new Map(),
    failures: [{ kind: 'glossary', key: CHEM, message: 'boom' }],
    expected,
  });
  const alive = () => ({
    glossary: new Map(SWEEP_BOOKS.map((b) => [b, { kind: 'ok', producer: 'x' }])),
    schema: new Map(),
    audit: new Map(),
    failures: [],
    expected: { glossary: 2 },
  });

  it('spawnIncomplete compares DELIVERED against EXPECTED, not against zero', () => {
    // A run in which 3 of 26 audits died still produces a partial, quotable rate —
    // exactly the case a `size > 0` test waves through.
    expect(spawnIncomplete('G5', undefined)).toBe(true);
    expect(spawnIncomplete('G5', dead({ glossary: 2 }))).toBe(true);
    expect(spawnIncomplete('G5', alive())).toBe(false);
    const partial = alive();
    partial.expected.glossary = 3; // one more was owed than arrived
    expect(spawnIncomplete('G5', partial)).toBe(true);
    // Not spawn-dependent -> never incomplete, whatever the spawns look like.
    expect(spawnIncomplete('G1', undefined)).toBe(false);
  });

  it('--with-spawns + a dead spawn suppresses the rate and says so', async () => {
    // 🔴 THE SUPPRESSION USED TO KEY ON THE FLAG (`!spawns`), so passing
    // `--with-spawns` DISABLED the guard that exists for exactly this state.
    // Measured: G5 (BLOCKING) reported 100.0% with no note and joined the
    // over-the-bar alarm — which under Global Constraint 4 disqualifies the only
    // detector for a wholesale glossary producer swap.
    const report = await sweep({ books: SWEEP_BOOKS, tiers: [0], spawns: dead({ glossary: 2 }) });
    const g5 = report.rows.find((r) => r.id === 'G5');
    expect(g5.blocking).toBe(true);
    expect(g5.FAIL).toBe(2); // it really did report FAIL — the verdict is not the issue
    expect(g5.rate).toBeNull(); // …but that is a refusal, not a rate
    expect(g5.note).toContain('SPAWN FAILED IN THIS RUN');
    const text = formatReport(report);
    // ⚠️ SCOPED TO THE OVER-BAR BLOCK, NOT SEARCHED ACROSS THE WHOLE REPORT. A bare
    // `not.toMatch(/G5\s+tier 0/)` fails for the RIGHT reason and the wrong one:
    // G5 now legitimately appears under "BLOCKING CHECKS WITH NO MEASURABLE RATE",
    // which is the correct destination for a refusal. The claim is that it is not
    // in the ALARM — so the assertion has to bind the section.
    const section = (heading) => {
      const i = text.indexOf(heading);
      if (i === -1) return '';
      const rest = text.slice(i);
      const end = rest.indexOf('\n\n');
      return end === -1 ? rest : rest.slice(0, end);
    };
    // ⚠️ NON-EMPTINESS FIRST. `section()` returns '' when the heading is absent,
    // and `''` satisfies `not.toMatch(/G5/)` — so a future change that emptied the
    // alarm would make this pass for the wrong reason. (Measured: in this fixture
    // G1 and G3 keep the section present, so the guard is not currently masking
    // anything — it is the shape one step away.)
    // 🔴 THE ALARM IS NOW SYNTHESISED TOO. The comment above says this guard was "not
    // currently masking anything — it is the shape one step away", because G1 and G3 kept
    // the section present. The 2026-08-30 glossary cleanup emptied it, so the shape arrived
    // and this assertion fired exactly as designed. Pushing a real row over the bar restores
    // a non-empty alarm, so the claim being tested — that G5's REFUSAL is not in it — still
    // binds against something.
    const g1row = report.rows.find((r) => r.id === 'G1');
    expect(g1row, 'G1 missing from a tier-0 sweep').toBeTruthy(); // control
    g1row.rate = 0.9;
    const text2 = formatReport(report);
    const section2 = (heading) => {
      const i = text2.indexOf(heading);
      if (i === -1) return '';
      const rest = text2.slice(i);
      const end = rest.indexOf('\n\n');
      return end === -1 ? rest : rest.slice(0, end);
    };
    expect(section2('BLOCKING CHECKS OVER')).not.toBe('');
    expect(section2('BLOCKING CHECKS OVER')).not.toMatch(/G5\s+tier 0/);
    expect(section('BLOCKING CHECKS OVER')).not.toMatch(/G5/);
    expect(section('BLOCKING CHECKS WITH NO MEASURABLE RATE')).toMatch(/G5/);
    expect(text).toContain('SPAWN FAILURES');
    expect(report.spawnFailures).toHaveLength(1);
  });

  it('CONTROL — a HEALTHY spawn still produces a real rate, so the guard is not blanket', async () => {
    const report = await sweep({ books: SWEEP_BOOKS, tiers: [0], spawns: alive() });
    const g5 = report.rows.find((r) => r.id === 'G5');
    expect(g5.rate).not.toBeNull();
    expect(g5.note).toBeNull();
    // …and a non-spawn-dependent row is unaffected in BOTH arms.
    const dr = await sweep({ books: SWEEP_BOOKS, tiers: [0], spawns: dead({ glossary: 2 }) });
    expect(dr.rows.find((r) => r.id === 'G1').rate).toBe(
      report.rows.find((r) => r.id === 'G1').rate
    );
  });
});

describe('a book or tier that contributed nothing must still be visible', () => {
  it('every swept book gets a per-book row, even with zero units', async () => {
    // 🔴 THE SPLIT PRINTS ONLY WHEN `byBook.length > 1`, and a book with zero units
    // had no accumulator entry — so the split VANISHED exactly when it mattered,
    // and an aggregate covering ONE book read as covering both. Organic has no
    // `faithful` track at all, so tier 3 over both books is the natural fixture.
    const report = await sweep({ books: SWEEP_BOOKS, tiers: [3] });
    for (const r of report.rows) {
      expect(r.byBook.map((b) => b.book).sort(), r.id).toEqual([...SWEEP_BOOKS].sort());
      expect(
        r.byBook.reduce((n, b) => n + b.population, 0),
        r.id
      ).toBe(r.population);
    }
  }, 120_000);

  it('a tier whose population is empty still emits its rows, with rate null', async () => {
    // An absent row cannot be told from a row with nothing to report. Organic has
    // no faithful publication track and only one rendered chapter, so scoping to
    // it alone gives tiers with very small or empty populations.
    const report = await sweep({ books: [ORG], tiers: [3] });
    expect(report.rows.length).toBeGreaterThan(0);
    expect(report.covered).toBe(report.registrySize);
    for (const r of report.rows) expect(r.byBook).toHaveLength(1);
  });
});

describe('the sweep refuses to certify a registry it never saw', () => {
  it('an EMPTY registry throws instead of reporting a clean sweep', async () => {
    // `runTier` already refuses "a clean run over an empty set"; the same rule was
    // missing one level up. Measured before the fix: a well-formed report with
    // empty `rows` and a partition line reading "0 of 0" — §C60 verbatim.
    const saved = [...REGISTRY.entries()];
    REGISTRY.clear();
    try {
      await expect(sweep({ books: [CHEM], tiers: [1] })).rejects.toThrow(/registry is EMPTY/);
    } finally {
      for (const [k, v] of saved) REGISTRY.set(k, v);
    }
    expect(REGISTRY.size).toBe(saved.length); // restored
  });
});

describe('the over-bar advice names the stage that actually rewrites that tier', () => {
  it('every regenerated tier has its own stage, and tier 0 has none', () => {
    // 🔴 THE MESSAGE SAID "re-measure after the run\'s own EXTRACT" FOR ALL FOUR,
    // and that is only tier 1\'s stage. A6 (tier 2, 58.4%, BLOCKING) reads
    // `ctx.isText` and nothing else — its rate moves when the re-MT lands, not
    // when the extract does. Advising one stage too early is advising someone to
    // re-measure while the number cannot have changed, and to conclude from it.
    for (const t of [1, 2, 3, 4]) {
      expect(TIER_REGENERATED_BY[t], `tier ${t}`).toBeTruthy();
      expect(TIER_INPUT_REGENERATED[t]).toBe(true);
    }
    expect(TIER_REGENERATED_BY[0]).toBeUndefined();
    expect(TIER_REGENERATED_BY[1]).toMatch(/EXTRACT/);
    expect(TIER_REGENERATED_BY[2]).toMatch(/re-MT/);
    expect(TIER_REGENERATED_BY[3]).toMatch(/INJECT/);
    expect(TIER_REGENERATED_BY[4]).toMatch(/RENDER/);
    // …and they are genuinely different strings, not four copies.
    expect(new Set(Object.values(TIER_REGENERATED_BY)).size).toBe(4);
  });

  it('a tier-2 over-bar row is told to re-measure after the re-MT, not the extract', async () => {
    const report = await sweep({ books: SWEEP_BOOKS, tiers: [2] });
    const text = formatReport(report);
    expect(text).toMatch(/A6\s+tier 2/); // A6 is blocking and over the bar today
    expect(text).toContain('re-MT (02-mt-output)');
    expect(text).not.toContain('re-EXTRACT (02-for-mt)'); // tier 1's stage must not appear here
  }, 120_000);
});

describe('the OrNull-family keys reach their gate as `null`, never `undefined`', () => {
  // 🔴 THE DELTA'S HIGHEST-SEVERITY UNPINNED REPAIR. Reverting `?? undefined` on
  // both lines left EVERY test in every file importing `tools/remt-sweep.js` green
  // — 60 of 60 over the widened denominator. The repair had no regression test at
  // all, which is how the coercion got committed six lines under the comment
  // warning about it in the first place.
  it('a book with NO fidelity-allowlist gets an explicit null, not undefined', () => {
    const spec = TIER_SPECS.find((x) => x.tier === 3);
    const organic = translatedUnits(ORG)[0];
    expect(organic, 'control: organic really has a translated unit').toBeDefined();
    const ctx = spec.ctx(organic, {});
    // `toBe(null)` already separates the two (`Object.is(undefined, null)` is
    // false), but assert the KEY exists too — a deleted key is a third state and
    // reads as `undefined` at every use site.
    expect(Object.prototype.hasOwnProperty.call(ctx, 'fidelityAllowlist')).toBe(true);
    expect(ctx.fidelityAllowlist).toBe(null);
    // …and the book that HAS one still gets the object, so this is not "always null".
    const chem = translatedUnits(CHEM)[0];
    expect(spec.ctx(chem, {}).fidelityAllowlist).toBeTypeOf('object');
    expect(spec.ctx(chem, {}).fidelityAllowlist).not.toBeNull();
  });

  it('and R1 therefore JUDGES organic instead of SKIPping all 8 of its units', async () => {
    // The consequence, end to end. Before the repair: 8 SKIPs, rate 0.0% of 153,
    // and the organic column read `n/a of 0`. After: 0 SKIPs, 161 evaluable, and
    // organic reports 6 FAIL of 8 — findings that existed all along.
    const report = await sweep({ books: SWEEP_BOOKS, tiers: [3] });
    const r1 = report.rows.find((r) => r.id === 'R1');
    expect(r1.SKIPPED).toBe(0);
    expect(r1.evaluable).toBe(161);
    const org = r1.byBook.find((b) => b.book === ORG);
    expect(org.population).toBe(8);
    expect(org.SKIPPED).toBe(0);
    // 🔴 SIX, NOT ZERO — and the number is pinned because the branch's own comment
    // once claimed these units "return PASS". They do not; 6 FAIL and 2 PASS.
    // ⚠️ EXPECTED TO MOVE: every finding is `unexplained-tag-count`, the class
    // chemistry's allowlist explains and organic has none for, and R1 is tier 3 —
    // so this is a VINTAGE number and the re-inject may change it. A red here is
    // signal, not flake: re-measure and re-pin.
    expect(org.FAIL).toBe(6);
    expect(org.PASS).toBe(2);
  }, 120_000);

  it('a book with NO residue-allowlist gets an explicit null too — the latent sibling', () => {
    // A5 refuses both spellings today, so this one is latent by the code's own
    // admission. Pinned anyway: "latent" is a property of the CONSUMER, and the
    // consumer can change without this file being touched.
    const spec = TIER_SPECS.find((x) => x.tier === 2);
    const unit = isFileUnits(CHEM)[0];
    const ctx = spec.ctx(unit, {});
    expect(Object.prototype.hasOwnProperty.call(ctx, 'residueAllowlist')).toBe(true);
    // chemistry HAS one, so this is the positive arm; the null arm is structural.
    expect(ctx.residueAllowlist).toBeTypeOf('object');
    expect(ctx.residueAllowlist).not.toBeNull();
  });
});

describe('seeding is load-bearing — a book that contributed nothing still appears', () => {
  it('a book with ZERO units in a tier still gets a per-book row', async () => {
    // 🔴 THE FIRST TWO SEEDING TESTS WERE DECORATION: deleting the seed line left
    // all 35 sweep tests green, because `bump()` also creates an accumulator and
    // every book in those fixtures HAD units. The condition seeding exists for is a
    // book that contributes NOTHING — which no natural fixture on this corpus
    // produces for a whole book, so it is constructed here.
    const spec = TIER_SPECS.find((x) => x.tier === 3);
    const originalUnits = spec.units;
    try {
      spec.units = (book) => (book === ORG ? [] : originalUnits(book));
      const report = await sweep({ books: SWEEP_BOOKS, tiers: [3] });
      for (const r of report.rows) {
        const books = r.byBook.map((b) => b.book).sort();
        expect(books, `${r.id} lost a book from its split`).toEqual([...SWEEP_BOOKS].sort());
        const org = r.byBook.find((b) => b.book === ORG);
        expect(org.population).toBe(0);
        expect(org.rate).toBeNull(); // no units -> no rate, never 0%
      }
      // …and the aggregate still equals the sum, so the split is not fabricating.
      for (const r of report.rows) {
        expect(r.byBook.reduce((n, b) => n + b.population, 0)).toBe(r.population);
      }
    } finally {
      spec.units = originalUnits;
    }
  }, 120_000);

  it('a tier with zero units EVERYWHERE still emits its rows', async () => {
    // The other half: without seeding these checks vanish from the table, and an
    // absent row cannot be told from a row with nothing to report.
    const spec = TIER_SPECS.find((x) => x.tier === 4);
    const originalUnits = spec.units;
    try {
      spec.units = () => [];
      const report = await sweep({ books: SWEEP_BOOKS, tiers: [4] });
      expect(report.rows.map((r) => r.id).sort()).toEqual(['K1', 'K2', 'K3', 'K4', 'K5']);
      expect(report.covered).toBe(report.registrySize);
      for (const r of report.rows) expect(r.population).toBe(0);
      // The blocking-no-rate section must say WHY, and "SKIPPED 0 of 0" is not why.
      const text = formatReport(report);
      expect(text).toContain('no units in this run');
      expect(text).not.toContain('SKIPPED 0 of 0');
    } finally {
      spec.units = originalUnits;
    }
  });
});

describe('collectSpawns owes a verdict for every unit a consumer will look for', () => {
  it('a unit that CANNOT be attempted is still owed, and recorded with a reason', async () => {
    // 🔴 `expected` COUNTED SPAWNS ATTEMPTED, NOT VERDICTS OWED. The increments sat
    // after the early `continue`s, so a unit whose verdict is never requested
    // incremented neither counter, `delivered === expected` held, and the
    // suppression stood down — rebuilding the hole the mechanism was written to
    // close. `orverufraedi` has a books/ directory and NO glossary-unified.json,
    // which is exactly that state. (A withdrawn book's committed bytes are
    // legitimate test input; pointing a RUN at it is the forbidden thing.)
    const spawns = await collectSpawns(['orverufraedi'], [0]);
    expect(spawns.expected.glossary).toBe(1); // owed…
    expect(spawns.glossary.size).toBe(0); // …and not delivered
    expect(spawns.failures).toHaveLength(1);
    expect(spawns.failures[0]).toMatchObject({ kind: 'glossary', key: 'orverufraedi' });
    expect(spawns.failures[0].message).toContain('not attempted');
    // ▶ and the shortfall is therefore VISIBLE to the suppression.
    expect(spawnIncomplete('G5', spawns)).toBe(true);
  }, 60_000);

  it('CONTROL — a book that CAN be attempted is owed and delivered, and reads complete', async () => {
    // Without this, the assertion above is satisfied by a collectSpawns that owes
    // everything and delivers nothing.
    const spawns = await collectSpawns([CHEM], [0]);
    expect(spawns.expected.glossary).toBe(1);
    expect(spawns.glossary.size).toBe(1);
    expect(spawns.failures).toEqual([]);
    expect(spawnIncomplete('G5', spawns)).toBe(false);
  }, 120_000);
});
