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
});
