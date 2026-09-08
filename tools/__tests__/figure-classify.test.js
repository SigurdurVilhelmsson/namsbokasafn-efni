import { describe, it, expect } from 'vitest';
import { classifyFigure } from '../lib/figure-classify.js';
import { CLASSIFICATION_OUTCOMES, PROCESS_OUTCOMES } from '../lib/figure-outcomes.js';

/**
 * 🔴 EVERY `MEASURED_*` FIXTURE BELOW IS A REAL `prepare.json`, PRODUCED ON 2026-09-07 BY RUNNING
 *
 *     python3 experiments/figure-text-translation/figure-prepare.py \
 *         "$(python3 sources.py efnafraedi-2e <basename>)" --basename <basename> --out <scratch>
 *
 * against the real chemistry artwork delivery, into a scratch directory outside the repo. They are
 * not copied out of any prose document, and two of them contradict the numbers the plan and the
 * recon carried: hexane's `chars` is 20, not the recon sketch's 214 (a placeholder), and limiting's
 * `imageXObjects` is 14, not the plan's 20 — prepare counts DISTINCT REACHABLE XObjects keyed on
 * objgen, the census counted page-level ones, so that is a different unit and not drift.
 */

/**
 * 🔴 THE REAL NEGATIVE CONTROL, AND THE CASE THE PLAN GOT WRONG.
 * `CNX_Chem_20_01_hexane_a_img` — a skeletal structure diagram. Its 20 text blocks live inside
 * /Form XObjects, they READ perfectly (chars 20, undecodedBlocks 0), and all 20 are held by
 * `figtext.looks_verbatim` because they are chemical formulas, identical in Icelandic.
 * The plan's discriminator tested `formTextXObjects > 0` FIRST and would call this
 * `unreadable-text`. The recon measured that rule firing on 216 of the 817 read-population
 * chemistry figures with 216 of 216 wrong and zero true positives anywhere in the corpus, because
 * the pdfplumber adapter that shipped in PR #452 descends into /Form. This figure is one of them.
 */
const MEASURED_HEXANE = {
  blocks: 20,
  sendable: 0,
  undecodedBlocks: 0,
  verbatimBlocks: 20,
  missingFontBlocks: 0,
  chars: 20,
  imageXObjects: 0,
  paintOps: 19,
  formTextXObjects: 20,
};

/**
 * `CNX_Chem_04_04_limiting` — the plan's own named "unreadable" figure, which at HEAD reads four
 * clean English blocks and sends all four. It is the ORDERING case in real data: `sendable > 0`
 * has to outrank BOTH `formTextXObjects > 0` (4) and the photo rule (imageXObjects 14, and had its
 * paintOps been 0 rather than 2 the photo rule would have claimed a translate-able figure).
 */
const MEASURED_LIMITING = {
  blocks: 4,
  sendable: 4,
  undecodedBlocks: 0,
  verbatimBlocks: 0,
  missingFontBlocks: 0,
  chars: 57,
  imageXObjects: 14,
  paintOps: 2,
  formTextXObjects: 4,
};

/**
 * `CNX_Chem_05_02_FoodLabel` — the ONE chemistry figure carrying a font the reader cannot decode
 * (`PAGE/TT1`), measured here as `undecodedBlocks: 2` of 47. It is the positive control that the
 * `undecodedBlocks` FIELD is reachable on real artwork rather than structurally always 0.
 * It classifies `translated`, which is correct — 28 blocks are sendable — and is also the
 * vocabulary gap logged in this task's openConcerns: two prose blocks ship in English under a
 * green verdict, and a single per-figure outcome cannot say "partially undecodable".
 * The complete 13-key payload is used further down as the over-strict-validation control.
 * ⚠️ ONE FIELD IS ABBREVIATED AND EVERY OTHER IS VERBATIM: `artworkSvgPath` held the
 * machine-specific scratch directory the measurement ran in. The predicate never reads it, and it
 * is the only place this file departs from what prepare actually wrote.
 */
const MEASURED_FOODLABEL = {
  basename: 'CNX_Chem_05_02_FoodLabel',
  source:
    '/home/siggi/dev/repos/Myndir/chemistry-2e/base/Ch_05/Source_File/CNX_Chem_05_02_FoodLabel.pdf',
  blocks: 47,
  sendable: 28,
  undecodedBlocks: 2,
  verbatimBlocks: 17,
  missingFontBlocks: 0,
  chars: 788,
  artworkSvgPath: '/tmp/scratch/CNX_Chem_05_02_FoodLabel/artwork.svg',
  imageXObjects: 1,
  paintOps: 38,
  formTextXObjects: 0,
  warnings: [
    'subset font PAGE/TT0',
    'subset font PAGE/TT1',
    'subset font PAGE/TT2',
    'undecodable font PAGE/TT1',
  ],
};

/** `CNX_Chem_01_00_DailyChem` — a photograph delivered as a PDF: one image XObject, nothing painted. */
const MEASURED_DAILYCHEM = {
  blocks: 0,
  sendable: 0,
  undecodedBlocks: 0,
  verbatimBlocks: 0,
  missingFontBlocks: 0,
  chars: 0,
  imageXObjects: 1,
  paintOps: 0,
  formTextXObjects: 0,
};

/**
 * `CNX_Chem_04_03_iodine` — ALSO a photograph, and the rule calls it `copied-textless` because a
 * leader line is drawn over it (paintOps 4). This test pins the KNOWN CONSERVATIVE MISS rather
 * than pretending the split is clean: `figure-prepare.py`'s own measurement over the 79 chemistry
 * figures where poppler finds no words is that `imageXObjects > 0 && paintOps === 0` selects 49 of
 * the 71 image-bearing ones and never once selects an image-free vector. Every error is in this
 * direction, and it costs nothing — both branches are `copied-*`, neither spends money.
 */
const MEASURED_IODINE = {
  blocks: 0,
  sendable: 0,
  undecodedBlocks: 0,
  verbatimBlocks: 0,
  missingFontBlocks: 0,
  chars: 0,
  imageXObjects: 1,
  paintOps: 4,
  formTextXObjects: 0,
};

/**
 * `CNX_Chem_06_01_Vibrstring` — the ONE figure in the 817-strong acceptance population that the
 * reader returns `empty` for, i.e. the only real candidate for the regression sentinel below.
 * MEASURED, not inferred: `chars: 0` but `formTextXObjects: 0`, so the sentinel does NOT fire on
 * it. That matters, because `READ-LAYER-ACCEPTANCE.md` names this figure as genuinely textless —
 * had it carried form-text XObjects, the sentinel would have had a day-one false positive on the
 * one leg that has no true positives at all.
 */
const MEASURED_VIBRSTRING = {
  blocks: 0,
  sendable: 0,
  undecodedBlocks: 0,
  verbatimBlocks: 0,
  missingFontBlocks: 0,
  chars: 0,
  imageXObjects: 0,
  paintOps: 42,
  formTextXObjects: 0,
};

/**
 * SYNTHETIC, and deliberately so. This task's recon pass measured all 895 resolved chemistry
 * figures and found ZERO with `sendable === 0` AND an undecoded block; `test_sendable.py`'s own
 * comment corroborates the half that lives in the repo ("exactly ONE figure carrying a
 * decodable:False font — CNX_Chem_05_02_FoodLabel, font PAGE/TT1"), and FoodLabel above was
 * re-measured today: it sends 28 blocks. So no real figure can exercise this branch, and the tree has
 * already made exactly this call once — `READ-LAYER-ACCEPTANCE.md:137` tests the `(cid:` detector
 * against a synthetic fixture "because the real corpus no longer exercises it".
 * The classifier is a pure function over literal parameters, so a synthetic input is the honest
 * instrument here. What is NOT synthetic is the field: see FoodLabel's measured 2.
 */
const SYNTHETIC_UNDECODED = {
  blocks: 6,
  sendable: 0,
  undecodedBlocks: 3,
  verbatimBlocks: 3,
  missingFontBlocks: 0,
  chars: 214,
  imageXObjects: 0,
  paintOps: 11,
  formTextXObjects: 0,
};

/**
 * SYNTHETIC, and it has NO corpus exerciser today — that is the point, not an oversight.
 * This is the read-layer REGRESSION SENTINEL: form-borne text producing zero characters is the
 * pre-PR-#452 failure recurring. Both figures that could have exercised it were measured above
 * (Vibrstring, and `CNX_Chem_01_01_WaterDom`: chars 27, formTextXObjects 0) and neither does.
 * Do not delete this branch as dead code; it is dead exactly while the /Form descent works.
 */
const SYNTHETIC_FORM_REGRESSION = {
  blocks: 0,
  sendable: 0,
  undecodedBlocks: 0,
  verbatimBlocks: 0,
  missingFontBlocks: 0,
  chars: 0,
  imageXObjects: 0,
  paintOps: 12,
  formTextXObjects: 5,
};

const vector = (counts) => ({ vectorPath: '/art/x.pdf', rasterPath: null, ...counts });

describe('classifyFigure — the corrected discriminator', () => {
  it('calls a figure whose text lives in Form XObjects and READS copied-textless, not unreadable', () => {
    expect(classifyFigure(vector(MEASURED_HEXANE)).outcome).toBe('copied-textless');
  });

  it('sends a vector with sendable blocks to translation even though its text is form-borne', () => {
    expect(classifyFigure(vector(MEASURED_LIMITING)).outcome).toBe('translated');
  });

  it('classifies a partially-undecodable figure that still has sendable blocks as translated', () => {
    expect(classifyFigure(vector(MEASURED_FOODLABEL)).outcome).toBe('translated');
  });

  it('calls a figure with NO sendable block and an undecoded one unreadable-text', () => {
    expect(classifyFigure(vector(SYNTHETIC_UNDECODED)).outcome).toBe('unreadable-text');
  });

  it('fires the regression sentinel when form-text produced zero characters', () => {
    expect(classifyFigure(vector(SYNTHETIC_FORM_REGRESSION)).outcome).toBe('unreadable-text');
  });

  it('does NOT fire the sentinel on the one genuinely empty figure in the corpus', () => {
    expect(classifyFigure(vector(MEASURED_VIBRSTRING)).outcome).toBe('copied-textless');
  });

  it('calls a wrapped bitmap with nothing painted over it a photo', () => {
    expect(classifyFigure(vector(MEASURED_DAILYCHEM)).outcome).toBe('copied-photo');
  });

  it('calls a photograph with a leader line drawn over it copied-textless (the measured miss)', () => {
    expect(classifyFigure(vector(MEASURED_IODINE)).outcome).toBe('copied-textless');
  });
});

describe('classifyFigure — the delivery, not the content', () => {
  it('calls a figure delivered only as a bitmap a photo', () => {
    const r = classifyFigure({ vectorPath: null, rasterPath: '/art/x.jpg' });
    expect(r.outcome).toBe('copied-photo');
  });

  // 🔴 `unresolved` is the ONLY number in the pipeline that looks at the artwork DELIVERY, so it
  // must stay distinct from `copied-photo` even though both end in "copy the artwork": a
  // photograph legitimately has no translatable text, a missing file is a hole we should see.
  it('calls a figure with no artwork at all unresolved, never copied-photo', () => {
    expect(classifyFigure({ vectorPath: null, rasterPath: null }).outcome).toBe('unresolved');
  });

  it('prefers the vector when both a vector and a raster resolved', () => {
    const r = classifyFigure({
      ...MEASURED_LIMITING,
      vectorPath: '/art/x.pdf',
      rasterPath: '/art/x.jpg',
    });
    expect(r.outcome).toBe('translated');
  });
});

describe('classifyFigure — the returned sendable count', () => {
  it('carries the sendable count through on a translated figure', () => {
    expect(classifyFigure(vector(MEASURED_FOODLABEL)).sendable).toBe(28);
  });

  it('reports zero sendable on every non-translated outcome', () => {
    for (const counts of [MEASURED_HEXANE, MEASURED_DAILYCHEM, SYNTHETIC_UNDECODED])
      expect(classifyFigure(vector(counts)).sendable).toBe(0);
    expect(classifyFigure({ vectorPath: null, rasterPath: null }).sendable).toBe(0);
  });
});

/**
 * 🔴 A COUNT OF ZERO AND AN INABILITY TO COUNT ARE DIFFERENT FACTS, AND WITHOUT THIS GUARD THEY
 * CLASSIFY IDENTICALLY. `undefined > 0` is false and `undefined === 0` is false, so a prepare
 * payload missing a field falls all the way through to `copied-textless` — the classifier's most
 * silent outcome, on a figure nobody looked at. Refuse instead, exactly as `tallyOutcome` does.
 */
describe('classifyFigure refuses a count it cannot read', () => {
  it('throws when a count the predicate reads is missing', () => {
    const { sendable, ...withoutSendable } = MEASURED_HEXANE;
    expect(sendable).toBe(0); // the field really was there to remove
    expect(() => classifyFigure(vector(withoutSendable))).toThrow(/sendable/);
  });

  it('throws on a non-integer count', () => {
    expect(() => classifyFigure(vector({ ...MEASURED_HEXANE, chars: null }))).toThrow(/chars/);
    expect(() => classifyFigure(vector({ ...MEASURED_HEXANE, paintOps: 1.5 }))).toThrow(/paintOps/);
    expect(() => classifyFigure(vector({ ...MEASURED_HEXANE, imageXObjects: -1 }))).toThrow(
      /imageXObjects/
    );
  });

  // 🔴 THE CONTROL FOR THE THREE ABOVE, and it is the one that fails if the guard is over-strict:
  // the driver spreads prepare.json WHOLE, so all 13 keys arrive — including four the predicate
  // never reads. A validator that rejected unknown keys would refuse every real figure while the
  // three tests above stayed green.
  it('accepts a complete real prepare.json payload, extra keys and all', () => {
    expect(Object.keys(MEASURED_FOODLABEL)).toHaveLength(13);
    expect(() => classifyFigure(vector(MEASURED_FOODLABEL))).not.toThrow();
  });

  it('does not demand prepare counts from a figure that has no vector', () => {
    expect(() => classifyFigure({ vectorPath: null, rasterPath: '/art/x.jpg' })).not.toThrow();
  });
});

/**
 * 🔴 THE VOCABULARY IS TASK 1'S, AND THIS ASSERTS REACHABILITY IN BOTH DIRECTIONS.
 * Set equality, not `every(o => ALL_OUTCOMES.includes(o))`: that weaker form passes for a stub
 * that returns one outcome for everything. This one fails if the classifier can return something
 * outside the vocabulary AND if any classification outcome has become unreachable.
 */
describe('classifyFigure and the outcome vocabulary', () => {
  const REACHABILITY_CENSUS = [
    vector(MEASURED_LIMITING),
    vector(MEASURED_HEXANE),
    vector(SYNTHETIC_UNDECODED),
    vector(MEASURED_DAILYCHEM),
    { vectorPath: null, rasterPath: null },
  ];

  it('reaches every classification outcome and nothing else', () => {
    const observed = new Set(REACHABILITY_CENSUS.map((i) => classifyFigure(i).outcome));
    expect([...observed].sort()).toEqual([...CLASSIFICATION_OUTCOMES].sort());
  });

  it('never returns a process outcome — those are the driver’s to assign', () => {
    for (const input of REACHABILITY_CENSUS)
      expect(PROCESS_OUTCOMES).not.toContain(classifyFigure(input).outcome);
  });
});
