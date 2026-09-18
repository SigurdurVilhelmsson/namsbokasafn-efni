import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  decimalSeparatorWarnings,
  captionDivergence,
  mtAlternativeWarnings,
  mtFigureWarning,
} = require('../lib/figure-consistency.cjs');

describe('decimalSeparatorWarnings', () => {
  it('flags a decimal point and suggests the Icelandic comma', () => {
    const w = decimalSeparatorWarnings({ k: '373.15 K' });
    expect(w).toHaveLength(1);
    expect(w[0].suggested).toBe('373,15 K');
  });
  it('does NOT flag a thousands group — the separators invert and a blind swap is wrong', () => {
    expect(decimalSeparatorWarnings({ k: '1,000 g' })).toEqual([]);
  });
  it('does not flag an integer', () => {
    expect(decimalSeparatorWarnings({ k: '212 °F' })).toEqual([]);
  });
  it('does not flag prose containing a full stop', () => {
    expect(decimalSeparatorWarnings({ k: 'Suðumark vatns.' })).toEqual([]);
  });
});

describe('captionDivergence', () => {
  const caption = 'Fahrenheit-, Celsíus- og kelvinhitakvarðarnir eru bornir saman.';
  it('flags a figure word whose near-variant appears in the caption', () => {
    const d = captionDivergence({ c: 'Selsíus' }, caption);
    expect(d).toHaveLength(1);
    expect(d[0].note).toContain('Celsíus');
  });
  it('is silent when the figure agrees with the caption', () => {
    expect(captionDivergence({ c: 'Celsíus' }, caption)).toEqual([]);
  });
  it('is silent — not wrong — when there is no reference text at all', () => {
    expect(captionDivergence({ c: 'Selsíus' }, '')).toEqual([]);
  });
  it('does not flag the same word differing only by sentence-initial capitalisation', () => {
    expect(captionDivergence({ c: 'efni' }, 'Efni er notað í tilraun.')).toEqual([]);
  });
  it('CONTROL: still flags the real divergence once case is normalised', () => {
    const d = captionDivergence({ c: 'Selsíus' }, caption);
    expect(d).toHaveLength(1);
    expect(d[0].note).toContain('Celsíus');
  });
});

describe('mtAlternativeWarnings (§C140 ㉔)', () => {
  const MT = { Element: 'Frumefni', H2O: 'H2O' };
  const ALT = {
    Element: { kept: 'joined', other: 'Þáttur', reason: 'disagree', mt: 'Frumefni' },
    H2O: { kept: 'per-label', reason: 'formula', mt: 'H2O' },
  };
  it('offers the per-label wording on a disagreement', () => {
    expect(mtAlternativeWarnings(MT, MT, ALT)).toContainEqual({
      blockKey: 'Element',
      current: 'Frumefni',
      suggested: 'Þáttur',
      reason: 'disagree',
    });
  });
  it('a formula fallback is a note with NO suggestion', () => {
    const w = mtAlternativeWarnings(MT, MT, ALT).find((x) => x.blockKey === 'H2O');
    expect(w).toEqual({ blockKey: 'H2O', current: 'H2O', reason: 'formula' });
  });
  it('goes silent once the editor has changed the block', () => {
    const edited = { ...MT, Element: 'Frumefni (leiðrétt)' };
    expect(mtAlternativeWarnings(edited, MT, ALT).map((w) => w.blockKey)).toEqual(['H2O']);
  });
  it('goes silent once the alternative has been applied', () => {
    const applied = { ...MT, Element: 'Þáttur' };
    expect(mtAlternativeWarnings(applied, MT, ALT).map((w) => w.blockKey)).toEqual(['H2O']);
  });
  it('is empty for a sidecar with no alternatives (every pre-㉔ figure)', () => {
    expect(mtAlternativeWarnings(MT, MT, undefined)).toEqual([]);
    expect(mtAlternativeWarnings(MT, MT, null)).toEqual([]);
  });
  it('never offers an empty suggestion', () => {
    const alt = { Element: { kept: 'joined', other: '', reason: 'disagree', mt: 'Frumefni' } };
    expect(mtAlternativeWarnings(MT, MT, alt)).toEqual([
      { blockKey: 'Element', current: 'Frumefni', reason: 'disagree' },
    ]);
  });
  // §C140 ㉔ final review (C1/R12): the fixed point this function compares against is `alt.mt`,
  // never `mtBlocks` — because `mtBlocks` (= sidecar.blocks) is REWRITTEN by every approval, which
  // is exactly what made the pre-fix warning return forever. These two are the regression pins.
  it('emits NOTHING when the alternative carries no mt field — never falls back to mtBlocks', () => {
    const alt = { Element: { kept: 'joined', other: 'Þáttur', reason: 'disagree' } };
    expect(mtAlternativeWarnings(MT, MT, alt)).toEqual([]);
  });
  it('emits nothing when the suggested wording already equals the current text', () => {
    const alt = {
      Element: { kept: 'joined', other: 'Frumefni', reason: 'disagree', mt: 'Frumefni' },
    };
    expect(mtAlternativeWarnings(MT, MT, alt)).toEqual([]);
  });
  it('CONTROL — an approval that overwrites mtBlocks with the current text must NOT resurrect the warning', () => {
    // This is exactly the C1/R12 scenario: after approval, mtBlocks (sidecar.blocks) is
    // overwritten to equal the CURRENT (edited) text, yet the warning must still go silent
    // because alt.mt (the ORIGINAL kept MT wording) no longer matches current.
    const editedBlocks = { ...MT, Element: 'Frumefni (leiðrétt)' };
    const mtBlocksAfterApproval = editedBlocks; // applyApprovedFigureEdits writes blocks: fig.blocks
    expect(
      mtAlternativeWarnings(editedBlocks, mtBlocksAfterApproval, ALT).map((w) => w.blockKey)
    ).toEqual(['H2O']);
  });
});

describe('mtFigureWarning (§C140 ㉔)', () => {
  it('names a split failure', () => {
    expect(mtFigureWarning({ status: 'split-failed', labels: 3, lines: 2 })).toMatch(/2.*3/);
  });
  it('names a skipped joined request', () => {
    expect(mtFigureWarning({ status: 'skipped-newline', labels: 2 })).toBeTruthy();
  });
  it('names a failed joined request (§C140 ㉔ I1)', () => {
    expect(mtFigureWarning({ status: 'request-failed', labels: 2, error: 'boom' })).toBeTruthy();
  });
  it('names a misaligned joined reply (§C140 ㉔ I2)', () => {
    expect(mtFigureWarning({ status: 'misaligned', labels: 3 })).toBeTruthy();
  });
  it('is null when the joined arm worked, was not needed, or is unknown', () => {
    expect(mtFigureWarning({ status: 'ok', labels: 2 })).toBeNull();
    expect(mtFigureWarning({ status: 'single-label', labels: 1 })).toBeNull();
    expect(mtFigureWarning(undefined)).toBeNull();
  });
});
