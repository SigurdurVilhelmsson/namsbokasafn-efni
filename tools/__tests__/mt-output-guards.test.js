/**
 * Two paid-run guards on what the MT returns, per segment (2026-09-26 ruling, §C183):
 *   ① Greek-letter conservation — the MT substitutes symbols with every marker intact
 *     (organic m00166 σ → Δ; chemistry m68745, m68846, m68852 — see the corpus test).
 *   ② silent truncation — a one-segment chunk that comes back short still has 1 SEG
 *     marker, so `validateMarkers` (a COUNT) passes it.
 * The thresholds and the fold list are corpus-measured; the corpus test pins them.
 */
import { describe, it, expect } from 'vitest';
import {
  greekLetters,
  greekConservationBySegment,
  segmentIdSetDelta,
  truncationSuspectsBySegment,
  TRUNCATION_MIN_EN_CHARS,
  TRUNCATION_MAX_RATIO,
  UNTERMINATED_MIN_EN_CHARS,
} from '../lib/mt-output-guards.js';

const seg = (id, text) => `<!-- SEG:m1:para:${id} -->\n${text}\n\n`;

describe('greekLetters — what counts as a Greek letter', () => {
  it('collects Greek letters in sorted order', () => {
    expect(greekLetters('a σ bond and a π bond')).toEqual(['π', 'σ']);
  });

  it('keeps multiplicity', () => {
    expect(greekLetters('δ+ … δ−')).toEqual(['δ', 'δ']);
  });

  it('folds U+2206 INCREMENT to Greek Δ', () => {
    expect(greekLetters('∆H')).toEqual(['Δ']);
  });

  it('folds U+01A9 LATIN ESH (a sum sign in the source) to Greek Σ', () => {
    expect(greekLetters('ƩD')).toEqual(['Σ']);
  });

  it('folds U+2211 N-ARY SUMMATION to Greek Σ', () => {
    expect(greekLetters('∑x')).toEqual(['Σ']);
  });

  it('folds U+00B5 MICRO SIGN to Greek μ', () => {
    expect(greekLetters('2 µm')).toEqual(['μ']);
  });

  it('folds U+2126 OHM SIGN to Greek Ω', () => {
    expect(greekLetters('5 Ω')).toEqual(['Ω']);
  });

  it('does NOT fold case — α and Α are different letters', () => {
    expect(greekLetters('α Α')).toEqual(['Α', 'α']);
  });

  it('returns nothing for Latin text', () => {
    expect(greekLetters('A B sigma delta')).toEqual([]);
  });

  it('folds Greek SYMBOL variants to their letter (ϵ → ε, measured in organic)', () => {
    expect(greekLetters('ϵ ϕ ϑ')).toEqual(['θ', 'ε', 'φ'].sort());
  });

  it('folds mathematical-alphanumeric Greek (𝛼) to its letter', () => {
    expect(greekLetters('\u{1D6FC}')).toEqual(['α']);
  });

  it('keeps a proper letter conserved when the IS writes its look-alike (EN ΔG, IS ∆G)', () => {
    expect(greekConservationBySegment(seg('p1', 'ΔG'), seg('p1', '∆G'))).toEqual([]);
  });

  it('counts a LOST look-alike as a loss (EN ∆H, IS H)', () => {
    // Without the fold ∆ is not Script=Greek, so dropping it would go unseen.
    expect(greekConservationBySegment(seg('p1', '∆H'), seg('p1', 'H'))[0].lost).toEqual(['Δ']);
  });
});

describe('greekConservationBySegment — a LOSS is the defect, an addition is reported', () => {
  it('reports a substitution as a loss (organic m00166: σ → Δ)', () => {
    const r = greekConservationBySegment(seg('p1', 'sp–sp σ bond'), seg('p1', 'sp Δ-tengi'));
    expect(r).toEqual([{ segId: 'm1:para:p1', lost: ['σ'], added: ['Δ'] }]);
  });

  it('reports a case change as a loss (chemistry m68852: α → Α)', () => {
    const r = greekConservationBySegment(seg('p1', '(α particle'), seg('p1', '(Α ögn'));
    expect(r[0].lost).toEqual(['α']);
  });

  it('counts multiplicity — one of two σ dropped is a loss', () => {
    const r = greekConservationBySegment(seg('p1', 'σ and σ'), seg('p1', 'σ og'));
    expect(r[0].lost).toEqual(['σ']);
  });

  it('reports a pure addition with an empty loss (m68729: "lambda" → λ)', () => {
    const r = greekConservationBySegment(
      seg('p1', 'wavelength lambda'),
      seg('p1', 'bylgjulengd λ')
    );
    expect(r).toEqual([{ segId: 'm1:para:p1', lost: [], added: ['λ'] }]);
  });

  it('treats a look-alike the MT normalised as conserved (∆ → Δ)', () => {
    expect(greekConservationBySegment(seg('p1', '∆G'), seg('p1', 'ΔG'))).toEqual([]);
  });

  it('returns nothing when every letter is conserved (control)', () => {
    expect(greekConservationBySegment(seg('p1', 'a π bond'), seg('p1', 'π-tengi'))).toEqual([]);
  });

  it('keys each finding on its own segment', () => {
    const en = seg('p1', 'π') + seg('p2', 'σ');
    const is = seg('p1', 'π') + seg('p2', 'Δ');
    expect(greekConservationBySegment(en, is).map((f) => f.segId)).toEqual(['m1:para:p2']);
  });

  it('ignores a segment the IS lacks — a missing id is the SEG-count check’s job', () => {
    expect(greekConservationBySegment(seg('p1', 'σ'), '')).toEqual([]);
  });
});

describe('segmentIdSetDelta — compare id SETS, never counts', () => {
  it('names an EN id the IS lacks', () => {
    expect(segmentIdSetDelta(seg('p1', 'a') + seg('p2', 'b'), seg('p1', 'a'))).toEqual({
      missing: ['m1:para:p2'],
      extra: [],
    });
  });

  it('does not count a marker cut before its closing "-->" as present', () => {
    const is = `${seg('p1', 'a')}<!-- SEG:m1:para:p2`;
    expect(segmentIdSetDelta(seg('p1', 'a') + seg('p2', 'b'), is).missing).toEqual(['m1:para:p2']);
  });

  it('names an IS id the EN never had', () => {
    const is = seg('p1', 'a') + '<!-- SEG:m1:para:zz -->\nb\n';
    expect(segmentIdSetDelta(seg('p1', 'a') + seg('p2', 'b'), is).extra).toEqual(['m1:para:zz']);
  });

  it('returns empty lists for identical id sets (control)', () => {
    expect(segmentIdSetDelta(seg('p1', 'a'), seg('p1', 'x'))).toEqual({ missing: [], extra: [] });
  });
});

describe('truncationSuspectsBySegment — the output/input ratio leg', () => {
  const long = (n) => 'word '.repeat(Math.ceil(n / 5)).slice(0, n - 1) + '.';

  it('flags a long segment that came back at less than the ratio floor', () => {
    const en = long(1000);
    const is = long(Math.floor(1000 * TRUNCATION_MAX_RATIO) - 10);
    const r = truncationSuspectsBySegment(seg('p1', en), seg('p1', is));
    expect(r.map((s) => s.reason)).toContain('ratio');
  });

  it('ignores a SHORT segment even at a tiny ratio — titles legitimately shrink', () => {
    const en = long(TRUNCATION_MIN_EN_CHARS - 1);
    const r = truncationSuspectsBySegment(seg('p1', en), seg('p1', 'Dæmi.'));
    expect(r).toEqual([]);
  });

  it('passes a long segment at a normal ratio (control)', () => {
    const en = long(1000);
    expect(truncationSuspectsBySegment(seg('p1', en), seg('p1', long(1100)))).toEqual([]);
  });

  it('flags a 1,000-char segment returned at 0.45 of its length — an ABSOLUTE pin', () => {
    // Pins the floor itself: the test above is relative to the constant, so any value
    // between 0 and the lowest honest ratio (0.633) used to pass unnoticed.
    const r = truncationSuspectsBySegment(seg('p1', long(1000)), seg('p1', long(450)));
    expect(r.map((s) => s.reason)).toContain('ratio');
  });

  it('carries the evidence: lengths, ratio and the IS tail', () => {
    const r = truncationSuspectsBySegment(seg('p1', long(1000)), seg('p1', 'x'.repeat(300)));
    expect(r[0]).toMatchObject({ segId: 'm1:para:p1', enLen: 1000, isLen: 300, ratio: 0.3 });
    expect(r[0].isTail).toMatch(/x+$/);
  });
});

describe('truncationSuspectsBySegment — the unterminated leg', () => {
  const body = (n) => 'a'.repeat(n);

  it('flags a long IS that stops mid-sentence when its EN ends cleanly', () => {
    const en = body(UNTERMINATED_MIN_EN_CHARS) + '.';
    const is = body(UNTERMINATED_MIN_EN_CHARS) + ' og síð';
    const r = truncationSuspectsBySegment(seg('p1', en), seg('p1', is));
    expect(r.map((s) => s.reason)).toEqual(['unterminated']);
  });

  it('accepts Icelandic closing quotes as a clean ending', () => {
    const en = body(UNTERMINATED_MIN_EN_CHARS) + '."';
    const is = body(UNTERMINATED_MIN_EN_CHARS) + '.“';
    expect(truncationSuspectsBySegment(seg('p1', en), seg('p1', is))).toEqual([]);
  });

  it('accepts a segment ending in a closing marker', () => {
    const en = body(UNTERMINATED_MIN_EN_CHARS) + ' [[i:end.]]';
    const is = body(UNTERMINATED_MIN_EN_CHARS) + ' [[i:endir.]]';
    expect(truncationSuspectsBySegment(seg('p1', en), seg('p1', is))).toEqual([]);
  });

  it('does not judge a segment whose EN itself has no clean ending', () => {
    const en = body(UNTERMINATED_MIN_EN_CHARS) + ' 25 kg';
    const is = body(UNTERMINATED_MIN_EN_CHARS) + ' 25 kg';
    expect(truncationSuspectsBySegment(seg('p1', en), seg('p1', is))).toEqual([]);
  });

  it('does not judge a short segment', () => {
    const en = body(UNTERMINATED_MIN_EN_CHARS - 10) + '.';
    const is = body(UNTERMINATED_MIN_EN_CHARS - 10);
    expect(truncationSuspectsBySegment(seg('p1', en), seg('p1', is))).toEqual([]);
  });

  // Adversarial review 2026-09-28: `)`, `;`, `:` and a closing `]]` are ordinary
  // INTERIOR characters in chemistry prose, so an IS cut right after one used to read as
  // "ended cleanly". Where the EN ends a SENTENCE, the IS must too — measured 0 false
  // positives over 8,087 committed segments of >= 100 chars in every book.
  const sentence = (n) => body(n) + ' endar hér.';

  it('flags an IS cut right after "(aq)" where the EN ends a sentence', () => {
    const r = truncationSuspectsBySegment(
      seg('p1', sentence(150)),
      seg('p1', body(150) + ' Na(aq)')
    );
    expect(r.map((s) => s.reason)).toEqual(['unterminated']);
  });

  it('flags an IS cut right after ";"', () => {
    const r = truncationSuspectsBySegment(
      seg('p1', sentence(150)),
      seg('p1', body(150) + ' jónir;')
    );
    expect(r.map((s) => s.reason)).toEqual(['unterminated']);
  });

  it('flags an IS cut right after a closing marker mid-sentence', () => {
    const is = body(150) + ' myndar Na[[sup:+]]';
    const r = truncationSuspectsBySegment(seg('p1', sentence(150)), seg('p1', is));
    expect(r.map((s) => s.reason)).toEqual(['unterminated']);
  });

  it('judges a 120-char EN sentence — an ABSOLUTE pin on the floor', () => {
    const r = truncationSuspectsBySegment(seg('p1', sentence(110)), seg('p1', body(110) + ' og'));
    expect(r.map((s) => s.reason)).toEqual(['unterminated']);
  });

  it('accepts a sentence end followed by closers — ."  .)  .]]  .“ (controls)', () => {
    for (const end of ['."', '.)', '.]]', '.“', '.)]]']) {
      const is = body(150) + ' endir' + end;
      expect(truncationSuspectsBySegment(seg('p1', sentence(150)), seg('p1', is))).toEqual([]);
    }
  });

  it('keeps the loose leg for a long EN that ends in ")" but not a sentence', () => {
    const en = body(400) + ' (aq)';
    const r = truncationSuspectsBySegment(seg('p1', en), seg('p1', body(400) + ' og'));
    expect(r.map((s) => s.reason)).toEqual(['unterminated']);
  });
});
