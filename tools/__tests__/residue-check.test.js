import { describe, it, expect } from 'vitest';
import {
  normalizeForComparison,
  countContentWords,
  tokenOverlapRatio,
  detectResidue,
  upsertResidueModule,
  isLanguageNeutral,
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

  // PIN (B4): the generic [[type:content]] rule above already covers the new
  // id-anchored marker types ([[term:]]/[[fn:]]/[[u:]]/[[em:]]) — no code
  // change needed here. Keeps the display text, drops the id after the pipe.
  it('keeps display text and drops the id for B4 id-anchored markers', () => {
    expect(normalizeForComparison('[[term:viscosity|term-1]]')).toBe('viscosity');
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
    expect(r.summary).toEqual({
      modulesWithResidue: 1,
      exactResidues: 1,
      ratioWarnings: 1,
      toleratedResidues: 0,
    });
  });

  it('removes a module entry when it becomes clean (preserve-on-reinject)', () => {
    const seeded = upsertResidueModule({ track: 'faithful' }, 'm1', { exact: ['m1:p1'] });
    const cleaned = upsertResidueModule(seeded, 'm1', { exact: [], warnings: [] });
    expect(cleaned.modules.m1).toBeUndefined();
    expect(cleaned.summary.modulesWithResidue).toBe(0);
  });
});

describe('isLanguageNeutral', () => {
  // positive — pure formula / unit / quantity-symbol cells
  it.each([
    '(a) CrP; (b) HgS; (c) Mn[[sub:3]](PO[[sub:4]])[[sub:2]]',
    '(a) RbBr; (b) MgSe; (h) (NH[[sub:4]])[[sub:2]]SO[[sub:4]]',
    '(a) 123.896 amu; (b) 18.015 amu; (c) 164.086 amu',
    'rem = RBE [[MATH:9]] rad',
    '(a) pH = 3.587; pOH = 10.413; (b) pOH = 0.68; pH = 13.32',
    '8.205784 [[MATH:8]] 10[[sup:−2]] L atm mol[[sup:−1]] K[[sup:−1]] = 8.314510 J mol[[sup:−1]] K[[sup:−1]]',
    '(d) [[MATH:71]] SO[[sub:3]] = 1.00 atm, SO[[sub:2]] = 1.00 atm',
  ])('treats formula/unit/pH cell as language-neutral: %s', (t) => {
    expect(isLanguageNeutral(t)).toBe(true);
  });

  // negative — real English prose (the safety property)
  it.each([
    'Write the two half-reactions and balance them',
    'Dorothy Crowfoot Hodgkin',
    'Measure the pH of each solution carefully', // recognized token amid English → still NOT neutral
    'Report the value in atm units',
  ])('flags real English even when it contains a recognized token: %s', (t) => {
    expect(isLanguageNeutral(t)).toBe(false);
  });

  // negative — homographs are excluded from the predicate (they go on the allowlist)
  it('excludes the English homograph "log"', () => {
    expect(isLanguageNeutral('pH = 14 + log(0.0200) = 12.30')).toBe(false);
  });
  it('excludes the English homograph "bar"', () => {
    expect(isLanguageNeutral('0.974 atm; 740 mm Hg; 98.7 kPa; 0.987 bar')).toBe(false);
  });

  it('is false for empty / marker-only input (no recognized token)', () => {
    expect(isLanguageNeutral('[[MATH:3]]')).toBe(false);
    expect(isLanguageNeutral('')).toBe(false);
  });

  // Membership checks run BEFORE the enumeration-skip, so single-lowercase-
  // letter SI units are recognized in their canonical form (no L-vs-l asymmetry).
  it('recognizes single-lowercase-letter SI units', () => {
    expect(isLanguageNeutral('5 g')).toBe(true);
    expect(isLanguageNeutral('10 m')).toBe(true);
    expect(isLanguageNeutral('2 s')).toBe(true);
  });
  it('still treats a formula cell with enumeration letters as neutral', () => {
    expect(isLanguageNeutral('(a) CrP; (b) HgS')).toBe(true);
  });
  it('is false for a lone non-unit enumeration letter', () => {
    expect(isLanguageNeutral('a')).toBe(false);
  });
});

describe('detectResidue language-neutral demotion', () => {
  it('does NOT flag a language-neutral verbatim-EN segment as exact', () => {
    const t = '(a) CrP; (b) HgS';
    const r = detectResidue(t, t);
    expect(r.exact).toBe(false);
    expect(r.languageNeutral).toBe(true);
  });
  it('still flags a real English verbatim-EN segment as exact', () => {
    const t = 'Write the two half-reactions and balance them';
    const r = detectResidue(t, t);
    expect(r.exact).toBe(true);
  });
});

describe('upsertResidueModule tolerated', () => {
  it('records a tolerated-only module and counts it in the summary', () => {
    const r = upsertResidueModule({ track: 'mt-preview' }, 'm68729', {
      exact: [],
      warnings: [],
      tolerated: [{ segmentId: 'm68729:note-title:x', reason: 'chemist name' }],
    });
    expect(r.modules.m68729.tolerated).toEqual([
      { segmentId: 'm68729:note-title:x', reason: 'chemist name' },
    ]);
    expect(r.modules.m68729.exact).toEqual([]);
    expect(r.summary.toleratedResidues).toBe(1);
    expect(r.summary.exactResidues).toBe(0);
    // A tolerated-only module is non-gating: it must NOT count as with-residue.
    expect(r.summary.modulesWithResidue).toBe(0);
  });
  it('deletes a module only when exact, warnings AND tolerated are all empty', () => {
    const start = upsertResidueModule({ track: 'mt-preview' }, 'm1', { exact: ['m1:s'] });
    const cleared = upsertResidueModule(start, 'm1', { exact: [], warnings: [], tolerated: [] });
    expect(cleared.modules.m1).toBeUndefined();
  });
});

// Regression lock for modulesWithResidue semantics: only modules with ≥1
// EXACT residue count as "with residue". Warnings-only and tolerated-only
// modules are KEPT in the manifest but are non-gating, so they must not
// inflate the headline count. Mirrors scan-residue.js's summary calc.
describe('upsertResidueModule modulesWithResidue semantics', () => {
  it('keeps a warnings-only module but does not count it as with-residue', () => {
    const r = upsertResidueModule({ track: 'mt-preview' }, 'm2', {
      exact: [],
      warnings: [{ segmentId: 'm2:para:p1', ratio: 0.82 }],
    });
    expect(r.modules.m2).toBeDefined();
    expect(r.summary.ratioWarnings).toBe(1);
    expect(r.summary.modulesWithResidue).toBe(0);
  });
  it('counts a module with an exact residue as with-residue', () => {
    const r = upsertResidueModule({ track: 'mt-preview' }, 'm3', { exact: ['m3:para:p1'] });
    expect(r.summary.modulesWithResidue).toBe(1);
  });
});
