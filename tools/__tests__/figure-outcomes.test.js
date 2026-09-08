import { describe, it, expect } from 'vitest';
import {
  CLASSIFICATION_OUTCOMES,
  PROCESS_OUTCOMES,
  ALL_OUTCOMES,
  emptyTally,
  tallyOutcome,
  verdict,
} from '../lib/figure-outcomes.js';

describe('figure outcome vocabulary', () => {
  it('keeps classification and process outcomes disjoint', () => {
    expect(CLASSIFICATION_OUTCOMES.filter((o) => PROCESS_OUTCOMES.includes(o))).toEqual([]);
  });

  // 🔴 The plan's assertion here was
  //     expect(ALL_OUTCOMES.length).toBe(CLASSIFICATION_OUTCOMES.length + PROCESS_OUTCOMES.length)
  // which CANNOT FAIL — `ALL_OUTCOMES` is *defined* as the concatenation of those two arrays, so
  // the identity holds for any pair, duplicates included. Two sides derived from one token. These
  // two replace it with properties that a real edit can break.
  it('has no duplicate anywhere in the vocabulary', () => {
    expect(new Set(ALL_OUTCOMES).size).toBe(ALL_OUTCOMES.length);
  });

  it('carries the specific outcomes later tasks name, each in the right group', () => {
    for (const o of [
      'translated',
      'copied-photo',
      'copied-textless',
      'unresolved',
      'unreadable-text',
    ])
      expect(CLASSIFICATION_OUTCOMES).toContain(o);
    for (const o of [
      'failed-prepare',
      'failed-mt',
      'failed-compose',
      'failed-publish',
      'failed-sidecar',
      'skipped-current',
    ])
      expect(PROCESS_OUTCOMES).toContain(o);
  });

  it('emptyTally has a zero for every outcome and nothing else', () => {
    const t = emptyTally();
    expect(Object.keys(t).sort()).toEqual([...ALL_OUTCOMES].sort());
    expect(Object.values(t).every((v) => v === 0)).toBe(true);
  });
});

// 🔴 N1. Measured on the old plan's `tally[record.outcome] += 1`: an out-of-vocabulary or
// undefined outcome MINTS A NEW KEY HOLDING NaN, so 5 figures with 2 mis-bucketed summed to 3
// and the verdict still returned {ok:true}, exit 0.
describe('tallyOutcome refuses to lose a figure', () => {
  it('counts a known outcome', () => {
    const t = emptyTally();
    tallyOutcome(t, 'translated');
    expect(t.translated).toBe(1);
  });

  it('THROWS on an outcome outside the vocabulary', () => {
    expect(() => tallyOutcome(emptyTally(), 'nearly-translated')).toThrow(/vocabulary/i);
  });

  it('THROWS on undefined rather than minting a NaN key', () => {
    expect(() => tallyOutcome(emptyTally(), undefined)).toThrow();
  });

  // 🔴 Validating the OUTCOME is not enough: `translated` is a perfectly valid outcome, so a
  // vocabulary-only guard lets `{}` through and computes `undefined + 1` — reintroducing the
  // exact NaN this function exists to prevent, one level up.
  it('THROWS on a tally with no slot for the outcome, rather than minting NaN', () => {
    const t = {};
    expect(() => tallyOutcome(t, 'translated')).toThrow(/emptyTally/i);
    expect(Object.keys(t)).toEqual([]); // and it left no NaN key behind
  });

  it('THROWS on a tally missing exactly one outcome key', () => {
    const t = emptyTally();
    delete t['failed-publish'];
    expect(() => tallyOutcome(t, 'failed-publish')).toThrow(/emptyTally/i);
    expect(t['failed-publish']).toBeUndefined();
  });
});

describe('verdict', () => {
  const sum = (t) => Object.values(t).reduce((a, b) => a + b, 0);

  it('is ok when work happened and nothing needs a human', () => {
    const t = { ...emptyTally(), translated: 5, 'copied-photo': 2 };
    expect(verdict(t, sum(t)).ok).toBe(true);
  });

  it('is NOT ok when any figure failed', () => {
    const t = { ...emptyTally(), translated: 5, 'failed-compose': 1 };
    const v = verdict(t, sum(t));
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toContain('failed-compose');
  });

  // 🔴 R9, [USER] 2026-09-06. A large share of chemistry's figures are unresolved in the
  // artwork delivery TODAY, in every chapter — `experiments/figure-text-translation/TEXT-COVERAGE.md`
  // owns that count and it is deliberately not restated here. Failing on it made every run exit 1
  // by design.
  // 🔴 `unreadable-text` has the same shape: named, never fatal. It is the regression sentinel for
  // a READ-LAYER failure — a figure whose text we could not decode must never be bucketed
  // `copied-*`, because that ships English to a reader under a green verdict. What the current
  // reader can and cannot read is owned by
  // `experiments/figure-text-translation/READ-LAYER-ACCEPTANCE.md`.
  it('is ok when figures are unreadable-text — but SAYS SO', () => {
    const t = { ...emptyTally(), translated: 5, 'unreadable-text': 8 };
    const v = verdict(t, sum(t));
    expect(v.ok).toBe(true);
    expect(v.reasons.join(' ')).toMatch(/cannot read/i);
  });

  it('is ok when figures are unresolved — counted and named, never fatal', () => {
    const t = { ...emptyTally(), translated: 5, unresolved: 3 };
    expect(verdict(t, sum(t)).ok).toBe(true);
  });

  it('still REPORTS unresolved so the delivery hole stays visible', () => {
    const t = { ...emptyTally(), translated: 5, unresolved: 3 };
    expect(verdict(t, sum(t)).reasons.join(' ')).toMatch(/unresolved/);
  });

  // The spec's self-review caught this: a chapter of legitimate photographs translates zero
  // and is CORRECT. Failing it would train the operator to ignore the exit code.
  it('is ok when zero translated because nothing was translate-able', () => {
    const t = { ...emptyTally(), 'copied-photo': 9, 'copied-textless': 3 };
    expect(verdict(t, sum(t)).ok).toBe(true);
  });

  // 🔴 THE POSITIVE CONTROL for the two tests below: a failure only a translate-able figure can
  // reach DOES produce the claim. Without this pair, a `verdict` that simply never made the claim
  // would pass the two negatives.
  it('is NOT ok when translate-able figures existed but none translated', () => {
    const t = { ...emptyTally(), 'copied-photo': 9, 'failed-mt': 4 };
    const v = verdict(t, sum(t));
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/none .*translated|zero translated/i);
  });

  // 🔴 THE SECOND MEMBER OF `TRANSLATE_PATH_FAILURES`, WHICH THE CONTROL ABOVE CANNOT SEE.
  // That constant is `['failed-mt', 'failed-compose']` and the control above exercises only
  // the first, so reducing it to `['failed-mt']` left the whole suite green (measured). A chapter
  // whose translate-able figures all die at COMPOSE — an artwork-edition drift across a whole
  // module — then computes `attempted === 0` and the operator is told "4 figure(s)
  // failed-compose" without the fact that the chapter produced no translation at all.
  // ⚠️ `ok` is unaffected either way (every failed-* pushes its own fatal reason), which is
  // exactly why no existing assertion could see the loss: the defect is the REASON, not the
  // verdict — as this module's own docstring says.
  it('is NOT ok, and says zero translated, when the failures were all at COMPOSE', () => {
    const t = { ...emptyTally(), 'copied-photo': 9, 'failed-compose': 4 };
    const v = verdict(t, sum(t));
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toContain('failed-compose');
    expect(v.reasons.join(' ')).toMatch(/none .*translated|zero translated/i);
  });

  // 🔴 `attempted` used to be `translated + EVERY failed-*`. But `failed-publish` and
  // `failed-prepare` are reachable by ANY figure, a photograph included — publish runs for copies
  // too, and prepare runs before anything is classified. So a chapter of legitimate photographs
  // with one publish failure asserted that translate-able figures were found, which is FALSE.
  it('does NOT claim translate-able figures existed when a photo-only chapter fails to PUBLISH', () => {
    const t = { ...emptyTally(), 'copied-photo': 9, 'failed-publish': 1 };
    const v = verdict(t, sum(t));
    expect(v.ok).toBe(false); // the publish failure is real, and still fatal
    expect(v.reasons.join(' ')).toContain('failed-publish');
    expect(v.reasons.join(' ')).not.toMatch(/none .*translated|zero translated/i);
  });

  it('does NOT claim translate-able figures existed when a photo-only chapter fails to PREPARE', () => {
    const t = { ...emptyTally(), 'copied-photo': 9, 'failed-prepare': 1 };
    const v = verdict(t, sum(t));
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toContain('failed-prepare');
    expect(v.reasons.join(' ')).not.toMatch(/none .*translated|zero translated/i);
  });

  // 🔴 money/F1. A sidecar file that is present and unreadable is a FAILURE — the run needs a
  // human — because the figure may already carry an editor's approved Icelandic and the driver
  // cannot tell. It is the bucket that stops the spend gate reading such a file as "no sidecar".
  it('is NOT ok when a sidecar is present and unreadable', () => {
    const t = { ...emptyTally(), translated: 5, 'failed-sidecar': 1 };
    const v = verdict(t, sum(t));
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toContain('failed-sidecar');
  });

  // 🔴 …and it is NOT an attempted translation. A photograph's sidecar can be conflicted too,
  // so counting it in `attempted` would print "zero translated although translate-able figures
  // were found" about a chapter of legitimate photographs — the same false claim `failed-publish`
  // and `failed-prepare` were narrowed out of, for the same reason.
  it('does NOT claim translate-able figures existed when a photo-only chapter has an unreadable sidecar', () => {
    const t = { ...emptyTally(), 'copied-photo': 9, 'failed-sidecar': 1 };
    const v = verdict(t, sum(t));
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toContain('failed-sidecar');
    expect(v.reasons.join(' ')).not.toMatch(/none .*translated|zero translated/i);
  });

  it('is ok on a run where everything was already current', () => {
    const t = { ...emptyTally(), 'skipped-current': 12 };
    expect(verdict(t, sum(t)).ok).toBe(true);
  });

  // 🔴 THE PARTITION IS CHECKED AT RUNTIME, NOT BY HAND AND NOT BY A SOURCE REGEX.
  it('is NOT ok when the tally does not sum to the figures enumerated', () => {
    const t = { ...emptyTally(), translated: 3 };
    const v = verdict(t, 5);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/partition|sum/i);
  });

  it('is ok when the tally sums exactly — the control for the case above', () => {
    const t = { ...emptyTally(), translated: 5 };
    expect(verdict(t, 5).ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// 🔴 dataflow/F3. `classifyFigure` tests `sendable > 0` BEFORE `undecodedBlocks > 0` — which is
// right, the corpus case is a figure with both — so a figure carrying undecodable labels is
// bucketed `translated` and the `unreadable-text` NOTE never fires for it. Measured on real
// artwork: CNX_Chem_05_02_FoodLabel prepares as 47 blocks / 28 sendable / 2 undecoded, composes
// exit 0, and the published SVG carried two live `<text>` elements reading `(cid:127) 5% or
// less` — a pdfminer debug token drawn on a figure, under VERDICT ok. The classifier's ordering
// stays; what is added is that the fact SURVIVES INTO THE REPORT.
describe('verdict NOTEs the labels a TRANSLATED figure could not decode', () => {
  it('names the figure and label counts, and is not fatal', () => {
    const t = { ...emptyTally(), translated: 1 };
    const v = verdict(t, 1, { undecodedFigures: 1, undecodedLabels: 2 });
    expect(v.ok).toBe(true);
    expect(v.reasons.join(' ')).toMatch(/could not decode/i);
    expect(v.reasons.join(' ')).toMatch(/\b1\b.*\b2\b/);
  });

  // The control: without it the assertion above passes against a verdict that says this on
  // every run.
  it('says nothing when no translated figure carries an undecodable label', () => {
    const t = { ...emptyTally(), translated: 1 };
    const v = verdict(t, 1, { undecodedFigures: 0, undecodedLabels: 0 });
    expect(v.reasons.join(' ')).not.toMatch(/could not decode/i);
    expect(v.ok).toBe(true);
  });

  // Back-compat: every existing caller passes two arguments, and the third is optional.
  it('is unchanged when called with two arguments', () => {
    const t = { ...emptyTally(), translated: 1 };
    expect(verdict(t, 1)).toEqual({ ok: true, reasons: [] });
  });

  // 🔴 IT MUST NOT DOUBLE-REPORT `unreadable-text`. That outcome already has its own NOTE and
  // is a different fact — nothing is composed or published for it, so no reader sees anything.
  // This NOTE is about a figure that IS published.
  it('is a different reason from the unreadable-text NOTE', () => {
    const t = { ...emptyTally(), 'unreadable-text': 1 };
    const v = verdict(t, 1, { undecodedFigures: 0, undecodedLabels: 0 });
    expect(v.reasons.length).toBe(1);
    expect(v.reasons[0]).toMatch(/carry text we cannot read/);
  });
});
