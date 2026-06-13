/**
 * Tests for qaCheckService — number-consistency, EN-residue, pluggable spelling.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const qa = require('../services/qaCheckService');

describe('checkNumbers', () => {
  it('flags an EN number missing from IS', () => {
    const f = qa.checkNumbers('The pH is 7 and volume 250 mL.', 'Sýrustigið er 7.');
    expect(f).toHaveLength(1);
    expect(f[0].type).toBe('number-mismatch');
    expect(f[0].value).toBe('250');
  });

  it('tolerates decimal-comma conversion (3.5 → 3,5)', () => {
    expect(qa.checkNumbers('It is 3.5 mol.', 'Það eru 3,5 mól.')).toHaveLength(0);
  });

  it('tolerates thousands separators', () => {
    expect(qa.checkNumbers('about 1,000 atoms', 'um 1.000 frumeindir')).toHaveLength(0);
    expect(qa.checkNumbers('about 1,000 atoms', 'um 1 000 frumeindir')).toHaveLength(0);
  });

  it('ignores [[MATH:N]] placeholder indices', () => {
    // The "9" is a placeholder index, not a value — must not be required in IS.
    expect(qa.checkNumbers('See [[MATH:9]] here.', 'Sjá [[MATH:9]] hér.')).toHaveLength(0);
  });

  it('handles subscript numbers in formulas (H2O)', () => {
    expect(qa.checkNumbers('Water is H[[sub:2]]O.', 'Vatn er H[[sub:2]]O.')).toHaveLength(0);
  });

  it('passes when all EN numbers appear in IS', () => {
    expect(qa.checkNumbers('7 and 250', 'Eitthvað 250 og 7')).toHaveLength(0);
  });
});

describe('checkEnResidue', () => {
  it('flags IS prose carrying English function words', () => {
    const f = qa.checkEnResidue('This is the reaction sem á sér stað.');
    expect(f).toHaveLength(1);
    expect(f[0].type).toBe('en-residue');
    expect(f[0].words.length).toBeGreaterThanOrEqual(2);
  });

  it('does not flag clean Icelandic prose', () => {
    expect(qa.checkEnResidue('Vatn er flókin efnablanda í sundlauginni.')).toHaveLength(0);
  });

  it('does not flag a lone loanword (needs ≥2 function words)', () => {
    expect(qa.checkEnResidue('Notum hugtakið buffer í þessu tilviki.')).toHaveLength(0);
  });

  it('ignores English inside xref/link markers and math', () => {
    const text = 'Sjá [[xref:CNX_Chem_The_Atom]] og [[MATH:3]] fyrir the reaction.';
    // Only "the" survives stripping → < 2 distinct function words → no flag
    expect(qa.checkEnResidue(text)).toHaveLength(0);
  });
});

describe('runChecks', () => {
  it('combines number and residue findings', () => {
    const findings = qa.runChecks(
      'The value is 42 and that is final.',
      'This is the value sem er lokagildi.'
    );
    const types = findings.map((f) => f.type).sort();
    expect(types).toContain('number-mismatch');
    expect(types).toContain('en-residue');
  });

  it('uses an injected spelling engine when provided', () => {
    const spellEngine = (text) =>
      text.includes('villuorð') ? [{ word: 'villuorð', suggestions: ['villuorð'] }] : [];
    const findings = qa.runChecks('text', 'þetta er villuorð', { spellEngine });
    expect(findings.find((f) => f.type === 'spelling')).toBeTruthy();
  });

  it('never throws when the spelling engine misbehaves', () => {
    const spellEngine = () => {
      throw new Error('engine crashed');
    };
    expect(() => qa.runChecks('a 5', 'b 5', { spellEngine })).not.toThrow();
  });

  it('produces no findings for a clean, faithful translation', () => {
    expect(qa.runChecks('Water is 100% pure.', 'Vatn er 100% hreint.')).toHaveLength(0);
  });
});
