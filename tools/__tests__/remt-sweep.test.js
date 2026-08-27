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
import {
  BLOCKING_RATE_BAR,
  TIER_INPUT_REGENERATED,
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

  it('intentionalImageDropsFor is PER CHAPTER, never the book total', () => {
    // 🔴 BOTH DIRECTIONS ARE LIVE DEFECTS. The book total handed to every chapter
    // MASKS a real one-image drop as PASS on a blocking check (§C82 L96①); zero
    // handed to the chapter that really holds the special module manufactures the
    // chemistry appendices false positive that moves K2's rate 3.8% -> 7.7%,
    // across the ~5% blocking bar (§C82 L88).
    expect(intentionalImageDropsFor(CHEM, 'appendices')).toBe(1); // m68859, the periodic table
    expect(intentionalImageDropsFor(CHEM, '01')).toBe(0);
    expect(intentionalImageDropsFor(CHEM, '04')).toBe(0);
    expect(intentionalImageDropsFor(ORG, '03')).toBe(0); // organic's specialModules is {}
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

  it('a ctx builder that throws SKIPs the unit but keeps it in the denominator', async () => {
    // Dropping it instead would shrink the base silently — the class of defect
    // this whole file exists for.
    const broken = TIER_SPECS.find((s) => s.tier === 1);
    const original = broken.ctx;
    try {
      broken.ctx = () => {
        throw new Error('synthetic ctx failure');
      };
      const report = await sweep({ books: [CHEM], tiers: [1], limit: 3 });
      for (const r of report.rows) {
        expect(r.population).toBe(3);
        expect(r.SKIPPED).toBe(3);
        expect(r.rate).toBeNull();
      }
    } finally {
      broken.ctx = original;
    }
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
    // 🔴 DO NOT "FIX" THIS BY MAKING K3 ADVISORY OR BY LETTING IT PASS ON AN
    // ABSENT SNAPSHOT (§C82 L92③). A snapshot taken late flips K3 to a clean PASS
    // with a plausible non-zero `examined`, which is strictly WORSE than the halt.
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
    const report = await sweep({ books: SWEEP_BOOKS, tiers: [0] });
    const text = formatReport(report);
    // G1 and G3 are BLOCKING and FAIL on both books today: real term competitions
    // and English function-word headwords in the committed glossaries. Tier 0's
    // input is not regenerated, so this is a PRECONDITION on the run.
    expect(text).toContain('BLOCKING CHECKS OVER');
    expect(text).toMatch(/G1\s+tier 0/);
    expect(text).toMatch(/G3\s+tier 0/);
    expect(text).toContain('DATA THE RUN WILL CONSUME');
    expect(text).not.toContain('committed VINTAGE'); // tier 0 must not get tier 1-4's reading
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
