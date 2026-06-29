import { describe, it, expect } from 'vitest';
import {
  normalizeForComparison,
  countContentWords,
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

describe('countContentWords', () => {
  it('counts tokens of length >= 3 (real words)', () => {
    expect(countContentWords('these solids settle')).toBe(3);
  });
  it('excludes single-letter units and short function words', () => {
    // "neon g l" -> only "neon" is a content word; unit letters g/l excluded
    expect(countContentWords('neon g l')).toBe(1);
    // enumeration letters a/b/c are not content words
    expect(countContentWords('a b c d e f')).toBe(0);
  });
  it('returns 0 for empty input', () => {
    expect(countContentWords('')).toBe(0);
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
    // "Colloids" is one content word -> below the floor, never flagged
    const r = detectResidue('Colloids', 'Colloids');
    expect(r.exact).toBe(false);
    expect(r.warn).toBe(false);
  });

  // Regression lock: real chemistry-domain cells captured from efnafraedi-2e
  // mt-output that the first detector over-flagged. These are number/unit/
  // formula/answer-key cells whose surviving word-tokens are language-invariant
  // (element names, unit abbreviations, enumeration letters). They must NEVER
  // flag, even though EN and IS are near-identical (numbers localized to commas).
  describe('does not flag language-invariant numeric/unit cells (regression)', () => {
    const cells = [
      ['neon 0.83 g/L', 'neon 0,83 g/L'],
      ['radon 9.1 g/L', 'radon 9,1 g/L'],
      ['1 (troy) oz = 31.103 g', '1 (troy) oz = 31,103 g'],
      [
        '3 megahertz (MHz) = 3 [[MATH:11]] 10[[sup:6]] Hz',
        '3 megahertz (MHz) = 3 [[MATH:11]] 10^6^ Hz',
      ],
      [
        '(a) 0.44; (b) 9.0; (c) 27; (d) 140; (e) 1.5; (f) 0.44',
        '(a) 0,44; (b) 9,0; (c) 27; (d) 140; (e) 1,5; (f) 0,44',
      ],
      ['(d) 9.740 [[MATH:20]] 10[[sup:4]] m/s', '(d) 9,740 [[MATH:20]] 10^4^ m/s'],
      ['(a) 0.599 cm[[sup:3]]; (b) 8.91 g/cm[[sup:3]]', '(a) 0,599 cm^3^; (b) 8,91 g/cm^3^'],
    ];
    for (const [en, is] of cells) {
      it(`does not flag: ${en}`, () => {
        const r = detectResidue(en, is);
        expect(r.exact).toBe(false);
        expect(r.warn).toBe(false);
      });
    }
  });

  it('still flags a fully-untranslated paragraph even when numbers are localized', () => {
    // A genuine residue: real English prose. Number-stripping must not hide it.
    const en = 'The sample contains 5 grams of sodium chloride dissolved in water';
    const is = 'The sample contains 5 grams of sodium chloride dissolved in water';
    const r = detectResidue(en, is);
    expect(r.exact).toBe(true);
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
