import { describe, it, expect } from 'vitest';
import { extractTermText } from '../lib/glossary-term.js';

/**
 * Regression guard for the bug where symbol-annotated glossary terms were
 * silently dropped: <term> elements containing inline markup must still yield
 * a clean headword (65 such terms in efnafraedi-2e were being lost).
 */
describe('extractTermText', () => {
  it('extracts plain-text term unchanged', () => {
    expect(extractTermText('<term>orka (e. energy)</term>')).toBe('orka (e. energy)');
  });

  it('strips <emphasis> around a quantity symbol', () => {
    expect(
      extractTermText('<term>varmi (<emphasis effect="italics">q</emphasis>) (e. heat (q))</term>')
    ).toBe('varmi (q) (e. heat (q))');
  });

  it('keeps the renamed enthalpy headword (entalpía, not vermi)', () => {
    expect(
      extractTermText(
        '<term>entalpía (<emphasis effect="italics">H</emphasis>) (e. enthalpy (h))</term>'
      )
    ).toBe('entalpía (H) (e. enthalpy (h))');
  });

  it('removes <m:math> blocks (with their inner text) and [[math:N]] placeholders', () => {
    const raw =
      '<term>staðalbrunaentalpía (ΔHc°) <m:math><m:mrow><m:mtext>(</m:mtext><m:mtext>Δ</m:mtext></m:mrow></m:math> (e. standard enthalpy of combustion [[math:132]])</term>';
    expect(extractTermText(raw)).toBe(
      'staðalbrunaentalpía (ΔHc°) (e. standard enthalpy of combustion )'
    );
  });

  it('strips <sub>/<sup> without inserting spaces (cm3, not cm 3)', () => {
    expect(
      extractTermText(
        '<term>rúmsentimetri (cm<sup>3</sup> eða cc) (e. cubic centimeter (cm3 or cc))</term>'
      )
    ).toBe('rúmsentimetri (cm3 eða cc) (e. cubic centimeter (cm3 or cc))');
  });

  it('returns null when there is no <term>', () => {
    expect(extractTermText('<meaning>just a definition</meaning>')).toBeNull();
  });

  it('returns null for an empty/markup-only term', () => {
    expect(extractTermText('<term><m:math><m:mi>x</m:mi></m:math></term>')).toBeNull();
  });
});
