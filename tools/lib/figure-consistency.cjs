/**
 * Advisory checks shown beside a figure in the editor. Neither blocks anything.
 */

// A number with ONE decimal group: digits, a single '.', one or more digits, end of token.
// Deliberately narrow. Icelandic INVERTS both separators, so 1,000 (one thousand)
// becomes 1.000 — a blind '.' -> ',' swap silently changes numbers in a chemistry
// textbook, which is the worst available failure.
const DECIMAL = /^(\d+)\.(\d+)$/;

function decimalSeparatorWarnings(blocks) {
  const out = [];
  for (const [blockKey, text] of Object.entries(blocks)) {
    if (typeof text !== 'string') continue;
    const tokens = text.split(/\s+/);
    const fixed = tokens.map((t) => {
      const m = t.match(DECIMAL);
      return m ? `${m[1]},${m[2]}` : t;
    });
    const suggested = fixed.join(' ');
    if (suggested !== text) out.push({ blockKey, current: text, suggested });
  }
  return out;
}

/**
 * Words differing only in their first letter once case is normalised, e.g.
 * Selsíus vs Celsíus. Case-insensitive so a word appearing sentence-initial
 * in the caption (capitalised) and lowercase in the figure — the ordinary
 * case — is not reported as a divergence from itself.
 */
function nearVariant(a, b) {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la.length === lb.length && la.length > 3 && la.slice(1) === lb.slice(1) && la[0] !== lb[0];
}

function captionDivergence(blocks, referenceText) {
  if (!referenceText) return []; // no reference => silent, NEVER a false all-clear
  const refWords = referenceText.split(/[^\p{L}]+/u).filter((w) => w.length > 3);
  const out = [];
  for (const [blockKey, text] of Object.entries(blocks)) {
    if (typeof text !== 'string') continue;
    for (const w of text.split(/[^\p{L}]+/u).filter((x) => x.length > 3)) {
      const hit = refWords.find((r) => nearVariant(w, r));
      if (hit) {
        out.push({ blockKey, figureText: w, note: `the module's caption/alt uses "${hit}"` });
      }
    }
  }
  return out;
}

/**
 * §C140 ㉔ — the joined-vs-per-label verdicts, as review-panel warnings.
 *
 * Emitted only while the block still holds the MT's KEPT wording — compared against
 * `alt.mt`, the exact text `selectWording` kept at translate time, never against `mtBlocks`
 * (= the sidecar's `blocks`). Once an editor has changed the block — including by applying the
 * suggestion — the warning has done its job and disappears.
 *
 * 🔴 CORRECTED 2026-09-18 (§C140 ㉔ final review, C1/R12) — THIS USED TO COMPARE AGAINST
 * `mtBlocks[blockKey]` AND THAT WAS THE WRONG SIDE, PERMANENTLY. `mtBlocks` is
 * `resolveFigure`'s `sidecar.blocks`, and `applyApprovedFigureEdits` REWRITES `sidecar.blocks`
 * with the editor's current (possibly corrected) text on every approval, while carrying
 * `mtAlternatives` forward unchanged. So after ANY approval, `current === mtBlocks[blockKey]`
 * held BY CONSTRUCTION — both sides were the same freshly-written value — and the warning, with
 * an enabled "replace with the per-label wording" button, returned forever, ready to overwrite a
 * reviewed correction with the machine's own rejected alternative. `alt.mt` is written once, in
 * `selectWording`, and nothing downstream ever mutates it, so it is the fixed point this function
 * needs; the `mtBlocks` parameter is consequently unused now — kept, deliberately, because
 * dropping it would also mean pulling it out of `buildFigurePayload`'s call for no functional
 * gain (see that call site's own note).
 *
 * ⚠️ `suggested` only for a disagreement with a NON-EMPTY per-label wording that actually differs
 * from the current text. A formula or empty fallback is a note: the joined wording was rejected,
 * and offering it would invite the damage. And a `suggested` equal to `current` is never emitted
 * either — there is nothing to apply.
 */
function mtAlternativeWarnings(blocks, mtBlocks, mtAlternatives) {
  const out = [];
  if (!mtAlternatives || typeof mtAlternatives !== 'object') return out;
  for (const [blockKey, alt] of Object.entries(mtAlternatives)) {
    if (!alt || typeof alt !== 'object') continue;
    if (typeof alt.mt !== 'string') continue; // no recorded kept wording: nothing to compare against
    const current = blocks[blockKey];
    if (typeof current !== 'string' || current !== alt.mt) continue;
    const w = { blockKey, current, reason: alt.reason };
    if (alt.reason === 'disagree' && typeof alt.other === 'string' && alt.other.trim() !== '') {
      if (alt.other === current) continue; // the suggestion IS the current text — nothing to apply
      w.suggested = alt.other;
    }
    out.push(w);
  }
  return out;
}

/**
 * A figure-level note when NO label on the figure had the joined arm's context.
 *
 * §C140 ㉔ FINAL REVIEW I1/I2 (2026-09-18) added `'request-failed'` (the joined request itself
 * threw — every label kept its per-label wording rather than losing the whole figure's purchase)
 * and `'misaligned'` (the reply split into the right count but an exact swap between two labels'
 * lines was detected — every label again kept per-label wording, because a swapped reply cannot
 * be trusted to say which line belongs to which label).
 */
function mtFigureWarning(mtJoined) {
  if (!mtJoined || typeof mtJoined !== 'object') return null;
  if (mtJoined.status === 'split-failed') {
    return `Samhengisþýðing féll á skiptingu (${mtJoined.lines} línur fyrir ${mtJoined.labels} merkingar) — allar merkingar eru stakar vélþýðingar.`;
  }
  if (mtJoined.status === 'skipped-newline') {
    return 'Samhengisþýðing var ekki send — allar merkingar eru stakar vélþýðingar.';
  }
  if (mtJoined.status === 'request-failed') {
    return 'Samhengisþýðing mistókst — allar merkingar eru stakar vélþýðingar.';
  }
  if (mtJoined.status === 'misaligned') {
    return 'Samhengisþýðing skilaði merkingum í rangri röð — allar merkingar eru stakar vélþýðingar.';
  }
  return null;
}

module.exports = {
  decimalSeparatorWarnings,
  captionDivergence,
  mtAlternativeWarnings,
  mtFigureWarning,
};
