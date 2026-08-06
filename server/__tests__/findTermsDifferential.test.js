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
        const got = actual.get(idx + 1);
        const same =
          (expected === undefined && got === undefined) ||
          (expected && got && expected.index === got.index && expected.length === got.length);
        if (!same) {
          mismatches.push({ english, text, expected, got });
        }
      });
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  });

  it('the generator actually produces matches, or the run above proves nothing', () => {
    // Guards against a silently vacuous differential.
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
