import { describe, it, expect } from 'vitest';
import { resolveCrossModuleHref, processInlineContent } from '../lib/cnxml-elements.js';

const moduleSections = {
  m68720: { section: '1', slug: 'varmi', titleIs: 'Varmi' },
  m68724: { section: '2', slug: 'varmamaelingar', titleIs: 'Varmamælingar' },
  m68726: { section: '3', slug: 'vermi', titleIs: 'Vermi' },
};

function makeContext(overrides = {}) {
  return {
    chapter: 5,
    moduleId: 'm68726',
    moduleSections,
    chapterIdToModule: new Map([
      ['fs-idm68801008', ['m68724']],
      ['CNX_Chem_05_02_Calorim', ['m68724']],
      ['fs-idp12345', ['m68726']], // same module
      ['dup-id', ['m68724', 'm68726']], // multi-owner (lifraen-efnafraedi pattern)
    ]),
    chapterFigureNumbers: new Map([['m68724:fs-idm68801008', '5.1']]),
    chapterTableNumbers: new Map(),
    chapterExampleNumbers: new Map(),
    chapterExerciseNumbers: new Map(),
    chapterEquationNumbers: new Map(),
    chapterSectionTitles: new Map(),
    figureNumbers: new Map(),
    tableNumbers: new Map(),
    equationNumbers: new Map(),
    verbose: false,
    ...overrides,
  };
}

describe('resolveCrossModuleHref', () => {
  it('same-module link with target-id returns same-page anchor', () => {
    const result = resolveCrossModuleHref(null, 'fs-idp12345', makeContext());
    expect(result.href).toBe('#fs-idp12345');
    expect(result.sameModule).toBe(true);
  });

  it('cross-module link via document attribute resolves to filename', () => {
    const result = resolveCrossModuleHref('m68724', 'fs-idm68801008', makeContext());
    expect(result.href).toBe('5-2-varmamaelingar.html#fs-idm68801008');
    expect(result.sameModule).toBe(false);
  });

  it('cross-module link via document attribute with no target-id', () => {
    const result = resolveCrossModuleHref('m68724', null, makeContext());
    expect(result.href).toBe('5-2-varmamaelingar.html');
  });

  it('cross-module link via registry (no document attribute) is rewritten', () => {
    const result = resolveCrossModuleHref(null, 'fs-idm68801008', makeContext());
    expect(result.href).toBe('5-2-varmamaelingar.html#fs-idm68801008');
    expect(result.sameModule).toBe(false);
    expect(result.ownerModule).toBe('m68724');
  });

  it('unknown document returns null href (drop link, keep text)', () => {
    const result = resolveCrossModuleHref('m99999', 'x', makeContext());
    expect(result.href).toBe(null);
  });

  it('duplicate id shared with current module prefers same-page', () => {
    const result = resolveCrossModuleHref(null, 'dup-id', makeContext());
    expect(result.href).toBe('#dup-id');
    expect(result.sameModule).toBe(true);
  });

  it('duplicate id not owned by current module picks first owner', () => {
    const ctx = makeContext({ moduleId: 'm68720' });
    const result = resolveCrossModuleHref(null, 'dup-id', ctx);
    expect(result.href).toBe('5-2-varmamaelingar.html#dup-id');
    expect(result.ownerModule).toBe('m68724');
  });

  it('unknown target-id without document falls back to same-page anchor', () => {
    const result = resolveCrossModuleHref(null, 'nonexistent-id', makeContext());
    expect(result.href).toBe('#nonexistent-id');
    expect(result.sameModule).toBe(true);
  });

  it('falls back to crossModuleSections when moduleSections is empty (answer-key case)', () => {
    const ctx = makeContext({ moduleSections: {}, crossModuleSections: moduleSections });
    const result = resolveCrossModuleHref('m68724', 'x', ctx);
    expect(result.href).toBe('5-2-varmamaelingar.html#x');
  });
});

describe('processInlineContent — link handling', () => {
  it('rewrites <link document="m68724" target-id="..."/> to full href', () => {
    const cnxml = '<link document="m68724" target-id="fs-idm68801008">table</link>';
    const out = processInlineContent(cnxml, makeContext());
    expect(out).toContain('href="5-2-varmamaelingar.html#fs-idm68801008"');
    expect(out).toContain('>table</a>');
  });

  it('drops <a> when document is unknown, keeps visible text', () => {
    const cnxml = '<link document="m99999" target-id="x">see other book</link>';
    const out = processInlineContent(cnxml, makeContext());
    expect(out).not.toContain('<a');
    expect(out).toContain('see other book');
  });

  it('rewrites self-closing <link target-id="..."/> to cross-page href via registry', () => {
    const cnxml = '<link target-id="CNX_Chem_05_02_Calorim"/>';
    const out = processInlineContent(cnxml, makeContext());
    expect(out).toContain('href="5-2-varmamaelingar.html#CNX_Chem_05_02_Calorim"');
  });

  it('keeps same-module self-closing link as #anchor', () => {
    const cnxml = '<link target-id="fs-idp12345"/>';
    const out = processInlineContent(cnxml, makeContext());
    expect(out).toContain('href="#fs-idp12345"');
    expect(out).not.toContain('.html#');
  });

  it('emits "Mynd 5.1" label for cross-module figure reference', () => {
    const cnxml = '<link target-id="fs-idm68801008"/>';
    const out = processInlineContent(cnxml, makeContext());
    expect(out).toContain('>Mynd 5.1</a>');
    expect(out).toContain('href="5-2-varmamaelingar.html#fs-idm68801008"');
  });

  it('does NOT emit href="m68724" literal for bare <link document="m68724"/>', () => {
    const cnxml = '<link document="m68724"/>';
    const out = processInlineContent(cnxml, makeContext());
    expect(out).not.toMatch(/href="m68\d+"/);
    expect(out).toContain('href="5-2-varmamaelingar.html"');
  });

  it('self-closing <link document="D" target-id="X"/> resolves to cross-page href', () => {
    // This is the most common cross-module reference shape in OpenStax CNXML.
    const cnxml = '<link document="m68724" target-id="fs-idm68801008"/>';
    const out = processInlineContent(cnxml, makeContext());
    expect(out).toContain('href="5-2-varmamaelingar.html#fs-idm68801008"');
    // The label should be the resolved figure number, not the raw id.
    expect(out).toContain('>Mynd 5.1</a>');
  });

  it('self-closing <link document="D" target-id="X"/> to unknown module drops link', () => {
    const cnxml = '<link document="m99999" target-id="x"/>';
    const out = processInlineContent(cnxml, makeContext());
    expect(out).not.toContain('<a');
    // Should contain the target-id as plain text (fallback label)
    expect(out).toContain('x');
  });
});
