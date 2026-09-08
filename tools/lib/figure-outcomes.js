/**
 * The closed outcome vocabulary for a figure run, and the run's exit verdict.
 *
 * Two disjoint groups. A figure lands in EXACTLY ONE bucket, which is what makes the
 * partition check meaningful: the tally must sum to the number of figures enumerated.
 *
 * ⚠️ "Outcome" names TWO different things in this campaign, one directory apart, and they are
 * different AXES rather than two spellings of one thing. `experiments/figure-text-translation/
 * read_layer_accept.py` and `readlayer.py` return a READ outcome — `'reads' | 'empty' | 'raises'`,
 * about one call to the reader. Everything in this file is a RUN outcome, about what became of one
 * figure end to end. There is no mapping between them here on purpose: classification (Task 3)
 * decides a run outcome from prepare's output, and a read that succeeded says nothing yet about
 * whether the figure was translated, copied, or skipped.
 */

/** What the figure IS. */
export const CLASSIFICATION_OUTCOMES = [
  'translated',
  'copied-photo',
  'copied-textless',
  'unresolved',
  // 🔴 The figure HAS text and the read layer could not decode it. NOT copied-*: a count of zero
  // and an inability to count are different facts, and filing an unreadable figure as textless
  // ships English to a reader under a green verdict — the defect this outcome exists to prevent.
  // It is kept as the REGRESSION SENTINEL for a read-layer failure; Task 3 keys it onto a
  // decodability signal rather than the shape of any one PDF construct.
  // ⚠️ NO population count belongs in this comment. What the current reader can and cannot read is
  // owned by `experiments/figure-text-translation/READ-LAYER-ACCEPTANCE.md` (CLAUDE.md § One
  // source of truth) — an earlier draft of this file restated a number that a merged PR had
  // already falsified.
  // Non-fatal, like `unresolved` (R9): named in every verdict, never on its own an exit 1.
  'unreadable-text',
];

/** What HAPPENED to it. A translate-able figure that failed lands here, never in `translated`. */
export const PROCESS_OUTCOMES = [
  'failed-prepare',
  'failed-mt',
  'failed-compose',
  'failed-publish',
  // 🔴 THE SIDECAR FILE IS PRESENT AND COULD NOT BE READ — WHICH IS NOT "NO SIDECAR".
  // `readSidecar` answers null for absent AND for malformed (the renderer's reason: one bad
  // file must not kill a whole chapter's render), so the spend gate could not tell a figure
  // nobody has bought from a figure whose committed Icelandic is a git conflict. It bought the
  // second one and overwrote the file. This bucket is what makes the two states different
  // facts: it is a FAILURE (the run needs a human), never spendable, and never overwritten.
  // ⚠️ Deliberately NOT in TRANSLATE_PATH_FAILURES: a photograph's sidecar can be conflicted
  // too, and counting this as an attempted translation would print "zero translated although
  // translate-able figures were found" about a chapter of photographs.
  'failed-sidecar',
  'skipped-current',
];

export const ALL_OUTCOMES = [...CLASSIFICATION_OUTCOMES, ...PROCESS_OUTCOMES];

/** Every failure. Each one pushes its own fatal reason, so any of them makes the run not-ok. */
const FAILED = [
  'failed-prepare',
  'failed-mt',
  'failed-compose',
  'failed-publish',
  'failed-sidecar',
];

/**
 * The failures reachable ONLY by a figure that was going to be translated.
 * `failed-prepare` and `failed-publish` are deliberately ABSENT: prepare runs BEFORE anything is
 * classified, and publish runs for copies too, so a photograph can reach either. Only the MT and
 * compose stages are downstream of "this figure is a vector with text".
 */
const TRANSLATE_PATH_FAILURES = ['failed-mt', 'failed-compose'];

export function emptyTally() {
  const t = {};
  for (const k of ALL_OUTCOMES) t[k] = 0;
  return t;
}

/**
 * 🔴 THE ONLY WAY A FIGURE MAY BE COUNTED. A bare `tally[outcome] += 1` mints a new key
 * holding NaN for an unknown or undefined outcome — the tally then stops summing to the
 * figure count and the run still reports ok. Refuse instead: a figure that falls out of
 * the partition is a figure nobody knows was missed.
 */
export function tallyOutcome(tally, outcome) {
  if (!ALL_OUTCOMES.includes(outcome)) {
    throw new Error(
      `Outcome ${JSON.stringify(outcome)} is not in the closed vocabulary: ${ALL_OUTCOMES.join(', ')}`
    );
  }
  // 🔴 Guard the TALLY as well as the OUTCOME, or this function reintroduces the very failure it
  // exists to prevent, one level up: `translated` is a perfectly valid outcome, so a
  // vocabulary-only check lets `tallyOutcome({}, 'translated')` compute `undefined + 1` and mint
  // `{translated: NaN}`. Downstream that surfaces only as `partition broken: outcomes sum to NaN`
  // — not a false green, but a message that describes the wrong defect.
  if (!Object.hasOwn(tally, outcome)) {
    throw new Error(
      `Tally has no slot for ${JSON.stringify(outcome)} — build it with emptyTally(), never {}`
    );
  }
  tally[outcome] += 1;
  return tally;
}

/**
 * Decide the run's verdict. NOT "did it finish" — "does a human need to look?".
 * A reason beginning `NOTE` is reported but never fatal; that prefix is part of the interface.
 *
 * 🔴 THE THIRD ARGUMENT EXISTS BECAUSE A TALLY CANNOT CARRY IT. A tally counts BUCKETS, and
 * the fact below is a property of a figure INSIDE the `translated` bucket — see the NOTE. It
 * is optional so the two-argument call stays exactly what it was.
 *
 * @param {Record<string, number>} tally
 * @param {number} enumeratedCount figures enumerated; the partition must sum to it
 * @param {{undecodedFigures?: number, undecodedLabels?: number}} [extra] counted over the
 *   records, not derivable from the tally
 * @returns {{ok: boolean, reasons: string[]}}
 */
export function verdict(tally, enumeratedCount, extra = {}) {
  const reasons = [];
  for (const k of FAILED) if (tally[k] > 0) reasons.push(`${tally[k]} figure(s) ${k}`);

  // 🔴 R9 ([USER] 2026-09-06): unresolved is REPORTED, never fatal. A large share of chemistry's
  // figures are unresolved in the artwork delivery today, so failing on it made every chapter run
  // exit 1 — the always-red exit code the spec argues against. The count is owned by
  // `experiments/figure-text-translation/TEXT-COVERAGE.md`; do not restate it here.
  // ⚠️ THE MESSAGE NAMES BOTH CAUSES BECAUSE A TALLY CANNOT TELL THEM APART. `unresolved` now
  // also carries the figures the driver REFUSED to resolve — two or more enumerated figures
  // that would have been handed one artwork file. Calling that "a hole in the delivery" sends
  // the operator to fix the wrong thing, three lines below a report line saying otherwise.
  if (tally.unresolved > 0) {
    reasons.push(
      `NOTE (not a failure): ${tally.unresolved} figure(s) unresolved — the artwork delivery has ` +
        `a hole here, or two figures would have shared one file and the run refused to guess ` +
        `(the report names which)`
    );
  }
  // 🔴 Same shape, different cause: the artwork is present and carries text we could not decode.
  // It MUST be named, because the alternative — filing it copied-* — ships English to a reader
  // under a green verdict.
  if (tally['unreadable-text'] > 0) {
    reasons.push(
      `NOTE (not a failure): ${tally['unreadable-text']} figure(s) carry text we cannot read — see experiments/figure-text-translation/READ-LAYER-ACCEPTANCE.md`
    );
  }

  // 🔴 A FIGURE CAN BE `translated` AND STILL CARRY LABELS THE READ LAYER COULD NOT DECODE,
  // AND NO BUCKET CAN SAY SO. `classifyFigure` tests `sendable > 0` FIRST — correctly: the
  // corpus case is a figure with both, and reversing it would file a mostly-translatable
  // figure as unreadable. So the `unreadable-text` NOTE above structurally cannot fire for
  // one, and the fact reached nobody. Measured 2026-09-07 on CNX_Chem_05_02_FoodLabel
  // (47 blocks, 28 sendable, 2 undecoded): the composed SVG carried two live `<text>`
  // elements reading `(cid:127) 5% or less`, published under VERDICT ok.
  // ⚠️ NOT FATAL, and not a downgrade of the bucket. The figure IS translated — 28 of its
  // labels are Icelandic — and failing the run would be the always-red exit code R9 rejects.
  // ⚠️ COUNTED OVER `translated` ONLY, so this never doubles the NOTE above: an
  // `unreadable-text` figure is never composed or published, so no reader sees anything.
  const undecodedFigures = extra.undecodedFigures || 0;
  if (undecodedFigures > 0) {
    reasons.push(
      `NOTE (not a failure): ${undecodedFigures} translated figure(s) carry ` +
        `${extra.undecodedLabels || 0} label(s) the read layer could not decode. They were ` +
        `never bought and ship in whatever English DID decode — compose strips the ` +
        `(cid:N) placeholder rather than drawing it. The report names them.`
    );
  }

  // The predicate is deliberately NOT `translated === 0 && figures > 0`: a chapter whose
  // figures are legitimately ALL photographs translates zero and is correct.
  // ⚠️ And `attempted` counts only TRANSLATE_PATH_FAILURES, not every `failed-*`. Counting
  // `failed-publish` here made a photo-only chapter with one publish failure print "zero
  // translated although translate-able figures were found" — false, and it smuggled back exactly
  // the false positive the paragraph above exists to avoid.
  // 🔴 That narrowing changes only the MESSAGE, never `ok`: every `failed-*` has already pushed
  // its own fatal reason above, so such a run is not-ok either way. Do not "simplify" this back
  // to FAILED on the reasoning that the run fails regardless — the wrong reason is the defect.
  const attempted = tally.translated + TRANSLATE_PATH_FAILURES.reduce((n, k) => n + tally[k], 0);
  if (attempted > 0 && tally.translated === 0) {
    reasons.push('zero translated although translate-able figures were found');
  }

  const summed = ALL_OUTCOMES.reduce((n, k) => n + tally[k], 0);
  const partitionOk = summed === enumeratedCount;
  if (!partitionOk) {
    reasons.push(
      `partition broken: outcomes sum to ${summed} but ${enumeratedCount} figure(s) were enumerated`
    );
  }

  // A NOTE must not fail the run; everything else must.
  const fatal = reasons.filter((r) => !r.startsWith('NOTE'));
  return { ok: fatal.length === 0, reasons };
}
