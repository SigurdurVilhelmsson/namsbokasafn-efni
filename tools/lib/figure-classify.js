/**
 * Decide what ONE figure IS, from `figure-prepare.py`'s output — so the driver knows whether to
 * spend money on it, copy it, or report a hole.
 *
 * 🔴 THE INPUT IS `prepare.json`'s SUMMARY INTEGERS, NOT AN ARRAY OF BLOCKS. The plan this module
 * comes from passed `blocks: []` and expected the classifier to derive sendability itself; Task 3
 * was then moved to run AFTER prepare precisely so it consumes prepare's output instead. The key
 * names here are `figure-prepare.py`'s own, verbatim, so the driver can spread the parsed payload
 * straight in. Extra keys are ignored — a real payload carries 13, of which the predicate reads 6.
 *
 * 🔴 THE `unreadable-text` DISCRIMINATOR IS KEYED ON POSITIVE EVIDENCE OF UNDECODABILITY, NOT ON
 * `formTextXObjects > 0`. The plan tested `formTextXObjects > 0` FIRST, because the OLD extractor
 * could not see text drawn inside a /Form XObject. The pdfplumber adapter that shipped in PR #452
 * descends into forms, so that premise died with it.
 *
 * 🔴 THE NUMBERS BELOW ARE A DATED MEASUREMENT OF ONE CORPUS + ONE READER, NOT A LAW — AND SAYING
 * SO IS THE POINT, BECAUSE INHERITING AN UNDATED MEASUREMENT IS THE EXACT DEFECT THIS PARAGRAPH
 * DESCRIBES. Taken 2026-09-07 by a read-only recon pass, NOT re-derived by the author of this
 * module: over the whole chemistry read population (the 817 figures of
 * `READ-LAYER-ACCEPTANCE.md`'s TOTAL row, which OWNS that denominator), `formTextXObjects > 0`
 * held for 323 figures, all 323 read successfully and none had an undecodable font; the plan's
 * rule would have labelled 216 of them `unreadable-text`, 216 of 216 wrongly, with zero true
 * positives anywhere in the corpus. To re-derive: run `figure-prepare.py` over the resolved
 * chemistry corpus and count `formTextXObjects > 0 && sendable === 0` against `undecodedBlocks`.
 * ▶ A source refresh, a new book, or another read-layer swap can move every one of them; what does
 * NOT move is the reason the discriminator is keyed on positive evidence instead.
 * (`CNX_Chem_20_01_hexane_a_img` is the worked example in the test file, and IS re-measured there.)
 *
 * The predicate, in order:
 *
 *   sendable > 0                          -> translated
 *   undecodedBlocks > 0                   -> unreadable-text   (positive evidence)
 *   chars === 0 && formTextXObjects > 0   -> unreadable-text   (regression sentinel; see below)
 *   imageXObjects > 0 && paintOps === 0   -> copied-photo
 *   otherwise                             -> copied-textless
 *   no vector, but a raster               -> copied-photo
 *   neither                               -> unresolved
 *
 * WHY THE ORDER IS LOAD-BEARING. `sendable > 0` must come first because it outranks both the form
 * test and the photo test on real data: `CNX_Chem_04_04_limiting` sends 4 blocks while reporting
 * `formTextXObjects: 4` and `imageXObjects: 14`. `undecodedBlocks` must come before the two copied
 * buckets because filing an unreadable figure as text-less ships English to a reader under a green
 * verdict — the defect the outcome exists to prevent.
 *
 * WHY `formTextXObjects` SURVIVES AT ALL, AND WHY THAT BRANCH IS NOT DEAD CODE. `chars === 0 &&
 * formTextXObjects > 0` is the sentinel for a READ-LAYER REGRESSION: form-borne text producing no
 * characters is exactly the pre-#452 failure recurring. It has NO exerciser in the corpus today
 * and that is the point — it is dead precisely while the /Form descent works. Both figures that
 * could have exercised it were measured on 2026-09-07 and neither does (`CNX_Chem_06_01_Vibrstring`
 * chars 0 / formTextXObjects 0, `CNX_Chem_01_01_WaterDom` chars 27 / formTextXObjects 0).
 * ⚠️ ITS COVERAGE IS TOTAL-LOSS ONLY: a figure that keeps page-level text while losing its form
 * descent still reports `chars > 0`, and this branch is blind to it. It is a sentinel, not a
 * detector — do not read a quiet run as proof the form descent is healthy.
 *
 * WHAT THIS MODULE DOES NOT DECIDE. `failed-prepare`, `failed-mt`, `failed-compose`,
 * `failed-publish` and `skipped-current` are the driver's: this function is called only on a
 * prepare that EXITED 0, and the outcome it returns is the INTENT, which a later stage may
 * downgrade. `copied-photo` and `unresolved` stay distinct although both end in "copy the
 * artwork": a photograph legitimately has no translatable text, whereas `unresolved` is the only
 * number in the pipeline that looks at the artwork DELIVERY at all.
 *
 * ⚠️ THE PHOTO SPLIT IS CONSERVATIVE AND KNOWN TO BE SO. `figure-prepare.py` measured the plan's
 * "cleanly separable" claim and it did not reproduce — paint-op counts overlap completely between
 * image-bearing and image-free figures. What does hold, over the 79 chemistry figures where
 * poppler finds no words: `imageXObjects > 0 && paintOps === 0` selects 49 of the 71 photographs
 * and never once selects an image-free vector. Every error is in one direction, and it costs
 * nothing: both branches are `copied-*`, neither spends. That stops being true the moment a
 * `copied-*` branch starts buying anything.
 */

import { CLASSIFICATION_OUTCOMES } from './figure-outcomes.js';

/**
 * Take an outcome string FROM Task 1's vocabulary rather than re-typing one.
 * Not positional destructuring of `CLASSIFICATION_OUTCOMES` — that would silently swap two
 * outcomes' meanings if the array is ever reordered, which is a worse failure than a typo.
 * This throws at import time, before any figure is classified.
 */
function fromVocabulary(name) {
  if (!CLASSIFICATION_OUTCOMES.includes(name)) {
    throw new Error(
      `${JSON.stringify(name)} is not a classification outcome: ${CLASSIFICATION_OUTCOMES.join(', ')}`
    );
  }
  return name;
}

const TRANSLATED = fromVocabulary('translated');
const UNREADABLE_TEXT = fromVocabulary('unreadable-text');
const COPIED_PHOTO = fromVocabulary('copied-photo');
const COPIED_TEXTLESS = fromVocabulary('copied-textless');
const UNRESOLVED = fromVocabulary('unresolved');

/**
 * The six `prepare.json` counts the predicate reads. Deliberately NOT every integer prepare
 * writes: `blocks`, `verbatimBlocks` and `missingFontBlocks` are reported for humans and for the
 * run record, and validating a field nobody consumes only adds a way to refuse a good figure.
 */
const REQUIRED_COUNTS = [
  'sendable',
  'undecodedBlocks',
  'chars',
  'imageXObjects',
  'paintOps',
  'formTextXObjects',
];

/**
 * 🔴 A COUNT OF ZERO AND AN INABILITY TO COUNT ARE DIFFERENT FACTS. Without this guard they
 * classify identically and silently: `undefined > 0` is false and `undefined === 0` is false, so
 * a payload missing a field falls through every branch into `copied-textless` — the outcome that
 * spends nothing, says nothing and gets looked at by nobody. Refuse instead, exactly as
 * `tallyOutcome` refuses an outcome it has no slot for.
 */
function assertCounts(input) {
  for (const key of REQUIRED_COUNTS) {
    const value = input[key];
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(
        `figure-classify: ${key} must be a non-negative integer from prepare.json, got ${JSON.stringify(value)}`
      );
    }
  }
}

/**
 * @param {object} figure one figure's resolution plus, if a vector resolved, its prepare.json
 * @param {string|null} figure.vectorPath the artwork prepare was run on, or null
 * @param {string|null} figure.rasterPath a bitmap-only delivery, or null
 * @returns {{outcome: string, sendable: number}} `outcome` is one of CLASSIFICATION_OUTCOMES
 */
export function classifyFigure(figure) {
  const { vectorPath, rasterPath } = figure;

  // The vector wins whenever both resolved: it is the only delivery we can read text out of.
  if (!vectorPath) {
    return { outcome: rasterPath ? COPIED_PHOTO : UNRESOLVED, sendable: 0 };
  }

  assertCounts(figure);
  const { sendable, undecodedBlocks, chars, imageXObjects, paintOps, formTextXObjects } = figure;

  if (sendable > 0) return { outcome: TRANSLATED, sendable };
  if (undecodedBlocks > 0) return { outcome: UNREADABLE_TEXT, sendable: 0 };
  if (chars === 0 && formTextXObjects > 0) return { outcome: UNREADABLE_TEXT, sendable: 0 };
  if (imageXObjects > 0 && paintOps === 0) return { outcome: COPIED_PHOTO, sendable: 0 };
  return { outcome: COPIED_TEXTLESS, sendable: 0 };
}
