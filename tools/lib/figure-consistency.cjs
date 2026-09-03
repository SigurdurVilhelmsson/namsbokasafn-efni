/**
 * Advisory checks shown beside a figure in the editor. Neither blocks anything.
 */

// A number with ONE decimal group: digits, a single '.', 1-3 digits, end of token.
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

/** Words differing only in their first letter, e.g. Selsíus vs Celsíus. */
function nearVariant(a, b) {
  return a.length === b.length && a.length > 3 && a.slice(1) === b.slice(1) && a[0] !== b[0];
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
        out.push({ blockKey, figureText: w,
                   note: `the module's caption/alt uses "${hit}"` });
      }
    }
  }
  return out;
}

module.exports = { decimalSeparatorWarnings, captionDivergence };
