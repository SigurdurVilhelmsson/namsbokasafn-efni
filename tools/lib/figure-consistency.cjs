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

module.exports = { decimalSeparatorWarnings, captionDivergence };
