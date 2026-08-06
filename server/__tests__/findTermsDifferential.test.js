import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { buildTermAutomaton, findFirstOccurrences } = require('../lib/termAutomaton');

// The reference: exactly what terminologyService.wholeWordRegex builds (:1948-1953),
// used the way findTermsInSegments used it — one exec, first occurrence.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function referenceFirst(english, text) {
  if (!english) return undefined;
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${escapeRegex(english)})(?![\\p{L}\\p{N}_])`,
    'giu'
  );
  re.lastIndex = 0;
  const m = re.exec(text);
  return m ? { index: m.index, length: m[0].length } : undefined;
}

let seed = 20260806;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (a) => a[Math.floor(rnd() * a.length)];

// Alphabet MUST reach beyond ASCII or the differential can never see a fold bug
// (spec §4.4) or the surrogate boundary bug (§4.5).
const ALPHABET = [
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'0123456789',
  ...'áéíóúýþæðöÁÉÍÓÚÝÞÆÐÖ',
  ...'µςσΜΣϕφİi',
  '\u{1D400}',
  '\u{1F600}',
  // Two targeted probes, both written as ESCAPES like the two astral entries
  // above — a literal U+0345 is a lone combining mark that an editor/prettier
  // NFC pass could silently mangle, and a lone surrogate cannot be written
  // literally at all.
  '\u0345', // COMBINING GREEK YPOGEGRAMMENI: the ONE code point admitted to
  //          [\p{L}\p{N}_] by the `i` flag and not by a bare /u (swept all
  //          1,112,064). Reaches the WORD_CHAR flag bug — an OVER-match.
  '\uDC00', // Unpaired LOW SURROGATE: reaches the surrogate step-back bug,
  //          where a lone low surrogate after a word char made the predicate
  //          read the wrong code point — an UNDER-match.
  ' ',
  '-',
  '(',
  ')',
  '.',
];
const word = (n) => Array.from({ length: n }, () => pick(ALPHABET)).join('');

function randomCase(s) {
  return [...s].map((c) => (rnd() < 0.5 ? c.toUpperCase() : c.toLowerCase())).join('');
}

describe('AC vs regex differential (1000 fixtures)', () => {
  it('agrees with the regex on every generated case', () => {
    const mismatches = [];
    // Counts comparisons where the regex reference actually matched something —
    // i.e. the embedding below is doing its job. Asserted below, INSIDE this same
    // test, so the guard is structurally bound to the loop it certifies: if a
    // future edit silently stops embedding (e.g. embedCount forced to 0), this
    // count collapses to 0 and THIS test goes red, not a separate test that
    // builds its own unrelated text and can't see the change.
    let realComparisons = 0;
    for (let i = 0; i < 1000; i++) {
      const terms = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () =>
        word(1 + Math.floor(rnd() * 8))
      ).filter(Boolean);
      if (terms.length === 0) continue;

      // EMBED terms into the text. Purely random text almost never contains a
      // term, so the differential would compare empty against empty — a vacuous
      // pass at scale, which is the most convincing kind.
      let text = word(5 + Math.floor(rnd() * 20));
      const embedCount = Math.floor(rnd() * 4);
      for (let k = 0; k < embedCount; k++) {
        const t = pick(terms);
        const sep = pick([' ', '', '-', '. ', '(']);
        text += sep + (rnd() < 0.5 ? randomCase(t) : t) + pick([' ', '', 'x', '.']);
      }
      text += word(Math.floor(rnd() * 10));

      const automaton = buildTermAutomaton(
        terms.map((english, idx) => ({ headwordId: idx + 1, english }))
      );
      const actual = findFirstOccurrences(automaton, text);

      terms.forEach((english, idx) => {
        const expected = referenceFirst(english, text);
        if (expected !== undefined) realComparisons++;
        const got = actual.get(idx + 1);
        const same =
          (expected === undefined && got === undefined) ||
          (expected && got && expected.index === got.index && expected.length === got.length);
        if (!same) {
          mismatches.push({ english, text, expected, got });
        }
      });
    }
    // Measured against this exact generator (fixed seed, so exactly reproducible):
    // 560 real comparisons out of 2448 term-checks. 200 is a floor clear of that
    // baseline, and it does catch the collapse to 0 that a future embedCount=0
    // (or similar) would cause. Verified: forcing embedCount = 0 above makes
    // this assertion fail (see the fix-round report for the command and real
    // output).
    //
    // ⚠️ ALL THREE numbers below were RE-MEASURED when U+0345 and U+DC00 joined
    // the ALPHABET (they were 552 / 338 / 194 before). Adding two entries changes
    // ALPHABET.length, which rescales every pick() — so every figure here moves,
    // not just the baseline. If you touch the ALPHABET again, re-measure all
    // three; a stale number in THIS comment is the exact failure it warns about.
    //
    // ⚠️ Boundary: the guard is NOT monotone in degradation severity, so "200
    // is a floor well clear of 560" must NOT be read as "survives minor
    // generator tweaks" — this generator is one continuous PRNG stream, so an
    // edit anywhere upstream reshuffles every rnd() call downstream of it, not
    // only the embed step itself. Two measured examples, smaller drop first:
    //   - Skipping the embed step on every other iteration (`const embedCount
    //     = i % 2 === 0 ? Math.floor(rnd() * 4) : 0;`, a real ~39% coverage
    //     loss) yields realComparisons = 331 — the assertion below still
    //     PASSES. This one is MISSED.
    //   - `Math.floor(rnd() * 4)` → `Math.floor(rnd() * 2)` (embedCount max
    //     3 → 1, a real ~65% coverage loss) yields realComparisons = 196 —
    //     the assertion below FAILS. This one IS caught, despite being a
    //     one-character, superficially "smaller" tweak than the bullet above.
    //     ⚠️ Its margin is now 4 (196 vs 200), down from 6; still caught, but
    //     this is the tweak most likely to flip to MISSED on the next change.
    // Do not read a pass here as "embedding is healthy" or "the regression is
    // small," only as "embedding did not collapse to zero" — and do not
    // extrapolate from one tweak's outcome to another's without measuring it.
    expect(realComparisons).toBeGreaterThan(200);
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  });

  it('sanity-checks the primitive helpers in isolation (word/pick/referenceFirst)', () => {
    // This does NOT exercise the main test's embedding logic above — it builds
    // its own unrelated text from the same primitives. It cannot detect the
    // main loop silently failing to embed; that guard is the realComparisons
    // assertion INSIDE the test above, which is structurally coupled to the
    // actual embedding path. This test only confirms the primitives themselves
    // are capable of producing a match, as a narrower, independent sanity check.
    seed = 20260806;
    let found = 0;
    for (let i = 0; i < 200; i++) {
      const t = word(3);
      const text = `${word(4)} ${t} ${word(4)}`;
      if (referenceFirst(t, text)) found++;
    }
    expect(found).toBeGreaterThan(100);
  });
});
