import { describe, it, expect } from 'vitest';
import {
  normalizeForComparison,
  countAlphaTokens,
  tokenOverlapRatio,
  detectResidue,
  upsertResidueModule,
} from '../lib/residue-check.js';

describe('normalizeForComparison', () => {
  it('strips bracket-marker delimiters but keeps inner content', () => {
    expect(normalizeForComparison('These [[i:solids]] settle')).toBe('these solids settle');
  });

  it('keeps the visible text of a link/xref and drops the url/id tail', () => {
    expect(normalizeForComparison('see [[link:click here|http://x.com]] now')).toBe(
      'see click here now'
    );
    expect(normalizeForComparison('in [[xref:Figure 5.2|CNX_Chem_05_02]] above')).toBe(
      'in figure above'
    );
  });

  it('drops MATH/MEDIA placeholders, digits, and symbols', () => {
    expect(normalizeForComparison('value [[MATH:3]] is 42% high!')).toBe('value is high');
  });

  it('strips legacy {{term}} delimiters but keeps the term', () => {
    expect(normalizeForComparison('a {{term}}colloid{{/term}} here')).toBe('a colloid here');
  });

  it('preserves Icelandic letters as alphabetic', () => {
    expect(normalizeForComparison('Þétt lausn í vatni')).toBe('þétt lausn í vatni');
  });
});

describe('countAlphaTokens', () => {
  it('counts space-separated word tokens', () => {
    expect(countAlphaTokens('these solids settle')).toBe(3);
  });
  it('returns 0 for empty input', () => {
    expect(countAlphaTokens('')).toBe(0);
  });
});

describe('tokenOverlapRatio', () => {
  it('is 1 when one token set is contained in the other', () => {
    expect(tokenOverlapRatio('the cat sat', 'the cat sat on mat')).toBe(1);
  });
  it('is 0 when there is no overlap', () => {
    expect(tokenOverlapRatio('alpha beta', 'gamma delta')).toBe(0);
  });
  it('is 0 when either side is empty', () => {
    expect(tokenOverlapRatio('', 'gamma delta')).toBe(0);
  });
});

describe('detectResidue', () => {
  it('flags an exactly-untranslated segment (gates)', () => {
    const en = 'Describe the composition and properties of colloidal dispersions';
    const r = detectResidue(en, en);
    expect(r.exact).toBe(true);
    expect(r.warn).toBe(false);
  });

  it('does not flag a properly translated segment', () => {
    const en = 'Describe the composition and properties of colloidal dispersions';
    const is = 'Lýstu samsetningu og eiginleikum kvoðudreifna';
    const r = detectResidue(en, is);
    expect(r.exact).toBe(false);
    expect(r.warn).toBe(false);
  });

  it('does not flag short shared-vocabulary segments below minTokens', () => {
    // "Colloids" is one alpha token -> below the floor, never flagged
    const r = detectResidue('Colloids', 'Colloids');
    expect(r.exact).toBe(false);
    expect(r.warn).toBe(false);
  });

  it('warns (non-gating) on mostly-English partial residue', () => {
    const en = 'The particles in a colloid are large enough to scatter light';
    const is = 'The particles in a colloid are large enough to dreifa ljósi';
    const r = detectResidue(en, is);
    expect(r.exact).toBe(false);
    expect(r.warn).toBe(true);
    expect(r.ratio).toBeGreaterThanOrEqual(0.7);
  });
});

describe('upsertResidueModule', () => {
  it('adds a module entry and computes the summary', () => {
    const r = upsertResidueModule({ track: 'faithful' }, 'm68784', {
      exact: ['m68784:para:p1'],
      warnings: [{ segmentId: 'm68784:caption:c1', ratio: 0.82 }],
    });
    expect(r.track).toBe('faithful');
    expect(r.modules.m68784.exact).toEqual(['m68784:para:p1']);
    expect(r.summary).toEqual({ modulesWithResidue: 1, exactResidues: 1, ratioWarnings: 1 });
  });

  it('removes a module entry when it becomes clean (preserve-on-reinject)', () => {
    const seeded = upsertResidueModule({ track: 'faithful' }, 'm1', { exact: ['m1:p1'] });
    const cleaned = upsertResidueModule(seeded, 'm1', { exact: [], warnings: [] });
    expect(cleaned.modules.m1).toBeUndefined();
    expect(cleaned.summary.modulesWithResidue).toBe(0);
  });
});
