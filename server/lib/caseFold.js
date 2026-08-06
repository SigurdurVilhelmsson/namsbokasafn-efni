/**
 * Length-stable, context-free Unicode case folding for the C24 term matcher.
 *
 * THREE PROPERTIES, all load-bearing:
 *  1. LENGTH-STABLE. Folded offsets equal original offsets, so automaton positions
 *     index straight into the original string with no remapping table. U+0130 is the
 *     only code point in Unicode whose toLowerCase changes length; it folds to itself,
 *     which is also what /iu does.
 *  2. CONTEXT-FREE. Per character, never on the whole string — "ΟΣ".toLowerCase() is
 *     "ος" (Final_Sigma), which DISAGREES with /iu. Per-char gives "οσ", which agrees.
 *  3. /iu-EQUIVALENT. toLowerCase is lowercase mapping; /iu uses simple case folding.
 *     The overrides reconcile them. Verified exhaustively in caseFold.test.js.
 *
 * NEVER use toLocaleLowerCase: "I".toLocaleLowerCase("tr") is "ı" (U+0131).
 */
const OVERRIDE_PAIRS = require('./caseFold.data');

const FOLD_OVERRIDES = new Map(OVERRIDE_PAIRS);

function foldChar(ch) {
  const override = FOLD_OVERRIDES.get(ch);
  if (override !== undefined) return override;
  const lower = ch.toLowerCase();
  return lower.length === ch.length ? lower : ch;
}

/** Fold a whole string. Output .length always equals input .length. */
function foldString(str) {
  let out = '';
  for (const ch of str) out += foldChar(ch);
  return out;
}

module.exports = { foldChar, foldString, FOLD_OVERRIDES };
