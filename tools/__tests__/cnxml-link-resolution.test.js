import { describe, it, expect } from 'vitest';
import {
  resolveCrossModuleHref,
  processInlineContent,
  buildCrossModuleHref,
} from '../lib/cnxml-elements.js';

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

describe('buildCrossModuleHref (chapter-outline + xref links)', () => {
  it('builds an absolute reader URL with zero-padded chapter', () => {
    // The intro chapter-outline links rely on this: a relative href would
    // resolve as a subpage of the trailing-slash intro URL in vefur.
    const href = buildCrossModuleHref('1-1-efnafraedi-i-samhengi.html', null, {
      bookSlug: 'efnafraedi-2e',
    });
    expect(href).toBe('/efnafraedi-2e/kafli/01/1-1-efnafraedi-i-samhengi');
  });

  it('preserves a target anchor when present', () => {
    const href = buildCrossModuleHref('5-2-varmamaelingar.html', 'fs-id1', {
      bookSlug: 'efnafraedi-2e',
    });
    expect(href).toBe('/efnafraedi-2e/kafli/05/5-2-varmamaelingar#fs-id1');
  });

  it('falls back to the bare filename when bookSlug is absent', () => {
    expect(buildCrossModuleHref('1-1-foo.html', null, {})).toBe('1-1-foo.html');
  });
});

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

  describe('relocated end-of-chapter ids (#3)', () => {
    it('reference from a module page to a relocated exercise id links to the compiled page', () => {
      // Exercise content is stripped from its source section page and rendered
      // onto N-exercises, so a section-page reference must point there.
      const ctx = makeContext({
        relocatedIds: new Map([['fs-relocated-1', '5-exercises']]),
      });
      const result = resolveCrossModuleHref(null, 'fs-relocated-1', ctx);
      expect(result.href).toBe('5-exercises.html#fs-relocated-1');
      expect(result.sameModule).toBe(false);
    });

    it('reference to a relocated id while rendering the compiled page itself stays same-page', () => {
      const ctx = makeContext({
        currentPageBasename: '5-exercises',
        relocatedIds: new Map([['fs-relocated-1', '5-exercises']]),
      });
      const result = resolveCrossModuleHref(null, 'fs-relocated-1', ctx);
      expect(result.href).toBe('#fs-relocated-1');
      expect(result.sameModule).toBe(true);
    });

    it('on a compiled page, a body figure owned by the source module resolves cross-page', () => {
      // currentPageBasename is the compiled page; moduleId stays the source
      // module (for numbering), so a same-module body ref must NOT collapse to a
      // same-page anchor — the figure lives on the section page, not here.
      const ctx = makeContext({
        moduleId: 'm68724',
        currentPageBasename: '5-exercises',
      });
      const result = resolveCrossModuleHref(null, 'CNX_Chem_05_02_Calorim', ctx);
      expect(result.href).toBe('5-2-varmamaelingar.html#CNX_Chem_05_02_Calorim');
      expect(result.sameModule).toBe(false);
    });

    it('relocatedIds present but target not relocated keeps normal same-module behavior', () => {
      const ctx = makeContext({
        relocatedIds: new Map([['some-other-id', '5-exercises']]),
      });
      const result = resolveCrossModuleHref(null, 'fs-idp12345', ctx);
      expect(result.href).toBe('#fs-idp12345');
      expect(result.sameModule).toBe(true);
    });
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

  describe('URL-scheme sanitization (F19)', () => {
    it('neutralizes a javascript: url to #', () => {
      const cnxml = '<link url="javascript:alert(1)">smella</link>';
      const out = processInlineContent(cnxml, makeContext());
      expect(out).toContain('href="#"');
      expect(out).not.toContain('javascript:');
    });

    it('neutralizes a javascript: url split by a tab', () => {
      const cnxml = '<link url="java\tscript:alert(1)">smella</link>';
      const out = processInlineContent(cnxml, makeContext());
      expect(out).not.toMatch(/href="java/);
      expect(out).toContain('href="#"');
    });

    it('keeps a normal https url', () => {
      const cnxml = '<link url="https://openstax.org">smella</link>';
      const out = processInlineContent(cnxml, makeContext());
      expect(out).toContain('href="https://openstax.org"');
    });
  });
});
