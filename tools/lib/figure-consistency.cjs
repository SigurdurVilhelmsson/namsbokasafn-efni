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
 * Emitted only while the block still holds the MT's KEPT wording (`mtBlocks[key]`): once an editor
 * has changed it — including by applying the suggestion — the warning has done its job. Compared
 * against the sidecar's MT text, never another segment (CLAUDE.md: never decide by comparing two
 * editable strings; the MT side here is the machine's own record, not an editable segment).
 *
 * ⚠️ `suggested` only for a disagreement with a NON-EMPTY per-label wording. A formula or empty
 * fallback is a note: the joined wording was rejected, and offering it would invite the damage.
 */
function mtAlternativeWarnings(blocks, mtBlocks, mtAlternatives) {
  const out = [];
  if (!mtAlternatives || typeof mtAlternatives !== 'object') return out;
  for (const [blockKey, alt] of Object.entries(mtAlternatives)) {
    if (!alt || typeof alt !== 'object') continue;
    const current = blocks[blockKey];
    if (typeof current !== 'string' || current !== (mtBlocks || {})[blockKey]) continue;
    const w = { blockKey, current, reason: alt.reason };
    if (alt.reason === 'disagree' && typeof alt.other === 'string' && alt.other.trim() !== '') {
      w.suggested = alt.other;
    }
    out.push(w);
  }
  return out;
}

/** A figure-level note when NO label on the figure had the joined arm's context. */
function mtFigureWarning(mtJoined) {
  if (!mtJoined || typeof mtJoined !== 'object') return null;
  if (mtJoined.status === 'split-failed') {
    return `Samhengisþýðing féll á skiptingu (${mtJoined.lines} línur fyrir ${mtJoined.labels} merkingar) — allar merkingar eru stakar vélþýðingar.`;
  }
  if (mtJoined.status === 'skipped-newline') {
    return 'Samhengisþýðing var ekki send — allar merkingar eru stakar vélþýðingar.';
  }
  return null;
}

module.exports = {
  decimalSeparatorWarnings,
  captionDivergence,
  mtAlternativeWarnings,
  mtFigureWarning,
};
