/**
 * §C140 ㉔ — the joined figure-label arm ([USER] ruling 2026-09-15, spec
 * docs/superpowers/specs/2026-09-18-c140-c24-joined-label-mt-design.md).
 *
 * ⚠️ NO NETWORK, EVER — `main` takes its API pair as a parameter and every test injects a stub.
 * ⚠️ Lives in `tools/__tests__/` though the module is in `experiments/`, for the reason
 * `figure-mt-glossary.test.js` states.
 */
import { describe, it, expect } from 'vitest';
import {
  formulaGuard,
  splitJoined,
  selectWording,
  joinable,
  wireChars,
} from '../../experiments/figure-text-translation/translate-blocks.mjs';

describe('formulaGuard — measured 0/501 on the 2026-09-15 answers', () => {
  it('passes the decimal comma: separators are ignored, digits are not', () => {
    expect(
      formulaGuard('formed by the reaction of 12.85 g of', 'myndað við hvarf 12,85 g af')
    ).toEqual([]);
  });
  it('passes the ruled mol → mól localisation (not a formula token)', () => {
    expect(
      formulaGuard("Multiply by Avogadro's number (mol–1)", 'Margfaldið með tölu Avogadros (mól–1)')
    ).toEqual([]);
  });
  it('passes a formula kept verbatim', () => {
    expect(formulaGuard('required to react with H2O', 'sem þarf til að hvarfast við H2O')).toEqual(
      []
    );
  });
  it('fires on a transposed digit', () => {
    expect(formulaGuard('12.85 g', '12,58 g')).toContain('digits');
  });
  it('fires on a dropped digit', () => {
    expect(formulaGuard('9.55 g of', '9,5 g af')).toContain('digits');
  });
  it('fires on a new subscript — the alt-probe damage — and a subscript is NOT the digit 2', () => {
    const why = formulaGuard('H2O', 'H₂O');
    expect(why).toContain('subsup');
    expect(why).toContain('digits'); // `\d` is ASCII-only in JS: ₂ does not count as 2
    expect(why).toContain('formula:H2O');
  });
  it('fires on a formula token that did not survive verbatim', () => {
    expect(formulaGuard('NaCl solution', 'Natríumklóríðlausn')).toContain('formula:NaCl');
  });
  it('does not treat an ordinary capitalised word as a formula', () => {
    expect(formulaGuard('Element', 'Frumefni')).toEqual([]);
  });
  it('allows a sub/superscript the English already carried', () => {
    expect(formulaGuard('cm³', 'cm³')).toEqual([]);
  });
});

describe('splitJoined', () => {
  it('splits into exactly n trimmed lines', () => {
    expect(splitJoined('Frumefni\n Fjöldi \n', 2)).toEqual({
      ok: true,
      lines: ['Frumefni', 'Fjöldi'],
    });
  });
  it('tolerates CRLF', () => {
    expect(splitJoined('A\r\nB', 2)).toEqual({ ok: true, lines: ['A', 'B'] });
  });
  it('refuses one line too few', () => {
    expect(splitJoined('A B', 2)).toEqual({ ok: false, got: 1 });
  });
  it('refuses one line too many', () => {
    expect(splitJoined('A\nB\nC', 2)).toEqual({ ok: false, got: 3 });
  });
  it('refuses an empty reply without throwing', () => {
    expect(splitJoined('', 2)).toEqual({ ok: false, got: 1 });
    expect(splitJoined(undefined, 2)).toEqual({ ok: false, got: 1 });
  });
});

describe('selectWording', () => {
  it('agreement: keeps the wording, records nothing', () => {
    expect(selectWording('Quantity', 'Fjöldi', 'Fjöldi')).toEqual({ text: 'Fjöldi', alt: null });
  });
  it('disagreement: keeps JOINED and offers per-label', () => {
    expect(selectWording('Element', 'Þáttur', 'Frumefni')).toEqual({
      text: 'Frumefni',
      alt: { kept: 'joined', other: 'Þáttur', reason: 'disagree' },
    });
  });
  it('formula damage: keeps PER-LABEL, offers nothing, records the rejected text', () => {
    const r = selectWording('H2O', 'H2O', 'H₂O');
    expect(r.text).toBe('H2O');
    expect(r.alt).toEqual({ kept: 'per-label', reason: 'formula' });
    expect(r.alt.other).toBeUndefined();
    expect(r.rejected.text).toBe('H₂O');
  });
  it('empty joined line: falls back to per-label with reason empty', () => {
    expect(selectWording('Element', 'Þáttur', '')).toEqual({
      text: 'Þáttur',
      alt: { kept: 'per-label', reason: 'empty' },
    });
  });
  it('empty per-label: keeps joined and never offers an empty suggestion', () => {
    expect(selectWording('Element', '', 'Frumefni')).toEqual({ text: 'Frumefni', alt: null });
  });
  it('both empty: empty text, no alternative (the dropped path handles it)', () => {
    expect(selectWording('Element', '', '')).toEqual({ text: '', alt: null });
  });
});

describe('joinable and wireChars — the one owner of what a figure is billed for', () => {
  const b = (english) => ({ key: english, english });
  it('a single label is not joinable and buys no joined request', () => {
    expect(joinable([b('Water')])).toBe(false);
    expect(wireChars([b('Water')])).toEqual({ perLabel: 5, joined: 0, total: 5 });
  });
  it('two labels: joined = both + one newline', () => {
    expect(joinable([b('Oxygen gas'), b('Water')])).toBe(true);
    expect(wireChars([b('Oxygen gas'), b('Water')])).toEqual({
      perLabel: 15,
      joined: 16,
      total: 31,
    });
  });
  it('a label containing a newline makes the figure unjoinable — nothing billed for it', () => {
    const send = [b('A\nB'), b('C')];
    expect(joinable(send)).toBe(false);
    expect(wireChars(send).joined).toBe(0);
  });
  it('an empty plan is zero, without throwing', () => {
    expect(wireChars([])).toEqual({ perLabel: 0, joined: 0, total: 0 });
  });
});
