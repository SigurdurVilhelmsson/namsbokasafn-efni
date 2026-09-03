/**
 * A non-empty per-module bracket-marker delta must HOLD ITS CHAPTER BACK
 * (§C118 ⑲) — it was a stderr Note, and the run exited 0.
 *
 * 🔴 WHAT THIS EXISTS FOR, MEASURED. The 2026-09-02 paid re-buy of organic ch03
 * m00038 came back with 29 INVENTED `[[b:]]` markers across two paragraphs —
 * `bracketMarkerDelta` computed `{b: +29}`, `formatBracketDelta` printed it, and
 * `main()` exited 0 and would have marked the chapter complete under
 * `--update-status`. Inject turns those into `<emphasis effect="bold">`, i.e. a
 * paragraph with half its nouns bold: WORSE than the untranslated English the
 * run was bought to fix. The detector worked perfectly and nothing acted on it.
 *
 * ▶ A DETECTOR THAT FIRES INTO A LOG IS NOT A GATE. The proven mechanism was
 * already right there — an id-reattach mismatch adds its chapter to
 * `mismatchChapters`, which `computeCompleteChapters` excludes and which forces
 * a non-zero exit. This routes the delta through the same path.
 *
 * ✅ BASE RATE MEASURED BEFORE MAKING IT BLOCK, and the denominator is the whole
 * story. Over committed EN/IS pairs the raw rate is 49.4% — which is NOT the
 * rate, it is vintage contamination: 68.2% of pairs whose EN was re-extracted
 * AFTER the MT ran are "dirty" purely because the two sides are different
 * source text (the tell is huge NEGATIVE deltas, `i: -219`). Restricted to
 * SAME-VINTAGE pairs — EN committed at or before the MT's `generatedAt` — the
 * rate is 7 of 61 = 11.5%. ▶ And those 7 are not false alarms: `ch23/exercises
 * {i: +33}` is the same invention class as m00038, and `orverufraedi {b: -2}`
 * is dropped content. **The base rate is an UNDETECTED BACKLOG, not noise**,
 * which is what makes blocking proportionate rather than merely strict.
 *
 * ⚠️ THE GATE IS PER-MODULE ON PURPOSE, AND THE SUMMARY TALLY SHOWS WHY.
 * `results.bracketLoss` ACCUMULATES across modules and then prints only entries
 * where `n !== 0` — so a module that invents 5 italics and another that drops 5
 * sum to zero and the run reports clean. Two real defects, cancelled. A gate
 * built on that tally would be blind to exactly the pair it most needs to see.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  bracketMarkerDelta,
  classifyModuleOutcome,
  computeCompleteChapters,
} from '../api-translate.js';

const API_TRANSLATE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'api-translate.js'
);

describe('classifyModuleOutcome — what holds a chapter back', () => {
  it('holds back on a non-empty bracket delta, and names it', () => {
    const out = classifyModuleOutcome({ mismatches: [], bracketDelta: { b: 29 } });
    expect(out.heldBack).toBe(true);
    expect(out.reasons.join(' ')).toMatch(/bracket/i);
  });

  it('holds back on a NEGATIVE delta too — a dropped marker is content loss', () => {
    // orverufraedi ch01 carries three real instances of this shape.
    expect(classifyModuleOutcome({ bracketDelta: { b: -2 } }).heldBack).toBe(true);
  });

  it('holds back on an id-reattach mismatch — the pre-existing behaviour, unchanged', () => {
    const out = classifyModuleOutcome({
      mismatches: [{ segId: 's', type: 'docref', expected: 2, got: 1 }],
      bracketDelta: {},
    });
    expect(out.heldBack).toBe(true);
    expect(out.reasons.join(' ')).toMatch(/mismatch/i);
  });

  it('reports BOTH reasons when both fire — a fix for one must not read as clean', () => {
    const out = classifyModuleOutcome({
      mismatches: [{ segId: 's', type: 'term', expected: 1, got: 0 }],
      bracketDelta: { i: -3 },
    });
    expect(out.reasons).toHaveLength(2);
  });

  it('does NOT hold back a clean module — the control', () => {
    // Without this, "hold everything back" satisfies every assertion above and
    // the gate would stop every run in the corpus.
    expect(classifyModuleOutcome({ mismatches: [], bracketDelta: {} }).heldBack).toBe(false);
    expect(classifyModuleOutcome({}).heldBack).toBe(false);
    expect(classifyModuleOutcome({ mismatches: undefined, bracketDelta: undefined }).heldBack).toBe(
      false
    );
  });

  it('is PER-MODULE, so two opposite deltas do not cancel', () => {
    // `results.bracketLoss` sums across modules and prints only non-zero
    // entries, so +5 and -5 report clean. Both of these are real defects and
    // both must be held back independently.
    const a = classifyModuleOutcome({ bracketDelta: { i: 5 } });
    const b = classifyModuleOutcome({ bracketDelta: { i: -5 } });
    expect([a.heldBack, b.heldBack]).toEqual([true, true]);
  });
});

describe('computeCompleteChapters accepts any number of held-back sets', () => {
  it('excludes a chapter held back for a bracket delta', () => {
    const succeeded = new Set(['ch01', 'ch02', 'ch03']);
    expect(
      computeCompleteChapters(succeeded, new Set(['ch01']), new Set(['ch02']), new Set(['ch03']))
    ).toEqual([]);
    expect(computeCompleteChapters(succeeded, new Set(), new Set(), new Set(['ch03']))).toEqual([
      'ch01',
      'ch02',
    ]);
  });

  it('is backward compatible with the committed three-argument calls', () => {
    // The two pre-existing cases, verbatim — the variadic change must be a
    // pure widening, not a new contract.
    expect(
      computeCompleteChapters(new Set(['ch01', 'ch02']), new Set(), new Set(['ch02']))
    ).toEqual(['ch01']);
    expect(
      computeCompleteChapters(
        new Set(['ch01', 'ch02', 'ch03']),
        new Set(['ch02']),
        new Set(['ch03'])
      )
    ).toEqual(['ch01']);
  });

  it('tolerates a null/absent set rather than throwing mid-run', () => {
    expect(computeCompleteChapters(new Set(['ch01']), null, undefined)).toEqual(['ch01']);
  });
});

describe('CORPUS ANCHOR — the real run that motivated this gate is held back', () => {
  // Binds the gate to the MEASURED defect rather than to synthetic input, and
  // organic ch03 supplies its own control population: all 8 modules were
  // re-extracted and re-MT'd on the same day, so they are same-vintage by
  // construction and a delta between them cannot be vintage drift.
  // 🔴 THE ANCHOR MOVED, BECAUSE I REPAIRED ITS SUBJECT — THIRD TIME TODAY.
  // This originally pinned m00038 at `{b: 29}`. §C118 ⑲'s bare-wire fix took that
  // to `{}`, and the assertion went red — the same shape as ch23's and ch14's
  // anchors earlier the same afternoon, both of which had already been written up
  // as a lesson. ▶ REPAIRING THE CORPUS STRIPS A CHECK OF ITS PROOF THAT IT WORKS,
  // and noticing that twice does not stop it happening a third time. The fix is
  // structural: pin the HISTORY as a planted fixture, and point the corpus half at
  // a case that still fires.
  //
  // ⚠️ NATURAL MUST-TRIPS ARE NOW DOWN TO 4 — one e2e fixture plus three
  // orverufraedi modules with dropped bolds (§C118 ⑳, a retired book, untouched).
  // ch23, ch14 and m00038 were all repaired today. **If orverufraedi is ever
  // repaired, this gate has NO natural must-trip left and the planted case below
  // becomes its only proof.** Do not delete it then; that is exactly when it
  // matters most.
  const PLANTED_M00038 = { b: 29 }; // the real delta, two paid runs running (+29, +31)

  it('PLANTED: the m00038 delta that motivated this gate is held back', () => {
    const out = classifyModuleOutcome({ bracketDelta: PLANTED_M00038 });
    expect(out.heldBack).toBe(true);
    expect(out.reasons.join(' ')).toMatch(/bracket/i);
  });

  it('a delta-bearing module is held back and a clean sibling is NOT — on live corpus', () => {
    // orverufraedi ch01 still carries dropped bolds; m00038 is now repaired.
    // Both halves matter: the firing case proves the gate works, the clean case
    // proves it is not simply holding everything back.
    const BOOKS = path.join(path.dirname(API_TRANSLATE), '..', 'books');
    const pair = (book, ch, unit) => ({
      en: path.join(BOOKS, book, '02-for-mt', ch, `${unit}-segments.en.md`),
      is: path.join(BOOKS, book, '02-mt-output', ch, `${unit}-segments.is.md`),
    });
    const deltaOf = (p) => {
      expect(fs.existsSync(p.en) && fs.existsSync(p.is)).toBe(true); // never skip silently
      return bracketMarkerDelta(fs.readFileSync(p.en, 'utf8'), fs.readFileSync(p.is, 'utf8'));
    };

    const firing = deltaOf(pair('orverufraedi', 'ch01', 'm58781'));
    expect(firing).toEqual({ b: -2 }); // by VALUE — a dropped bold, not a tally
    expect(classifyModuleOutcome({ bracketDelta: firing }).heldBack).toBe(true);

    const clean = deltaOf(pair('lifraen-efnafraedi', 'ch03', 'm00038'));
    expect(clean).toEqual({}); // ⑲'s bare wire took this from {b:29} to {}
    expect(classifyModuleOutcome({ bracketDelta: clean }).heldBack).toBe(false);
  });
});

describe('the gate is actually CALLED — a gate never called is a gate that does not exist', () => {
  // `main()` cannot be unit-tested (it builds its own API client), so the wiring
  // is pinned at the source level, the way deployPathSingleSource pins the single
  // deploy path. Without this, every assertion above can pass while `main` keeps
  // logging the delta and exiting 0 — which is precisely the defect.
  const src = fs.readFileSync(API_TRANSLATE, 'utf8');
  const mainStart = src.indexOf('async function main(');
  const mainBody = src.slice(mainStart);

  it('precondition: main() is located and its body excludes the helper definition', () => {
    // The control for the slice. If main moved above the helper, the assertion
    // below would pass on the DEFINITION and prove nothing.
    expect(mainStart).toBeGreaterThan(0);
    expect(mainBody).not.toContain('export function classifyModuleOutcome');
  });

  it("main()'s module loop routes outcomes through classifyModuleOutcome", () => {
    expect(mainBody).toContain('classifyModuleOutcome(');
  });

  it('main() feeds a bracket-delta set into computeCompleteChapters', () => {
    // ⚠️ BIND THE ARGUMENT LIST, NOT THE REST OF THE FILE. The first version of
    // this test sliced from the call to EOF, which still contained
    // `deltaChapters` in the held-back filter a few lines below — so removing
    // the argument left the test GREEN. Mutation-testing caught it; the
    // container is not the payload.
    const i = mainBody.indexOf('computeCompleteChapters(');
    const args = mainBody.slice(i, mainBody.indexOf(')', i));
    expect(args).toContain('deltaChapters');
    // The control that keeps the slice honest: it must NOT reach the later code.
    expect(args).not.toContain('heldBack');
  });

  it('a bracket delta contributes to the non-zero exit', () => {
    // The exit line must consider delta-bearing modules, not only failures and
    // reattach mismatches — otherwise the chapter is held back from
    // --update-status while the run still reports success to a human.
    const exitLine = mainBody
      .split('\n')
      .find((l) => l.includes('process.exit(1)') && l.includes('results.'));
    expect(exitLine).toBeTruthy();
    expect(exitLine).toMatch(/bracketDelta|deltaModules/);
  });
});
