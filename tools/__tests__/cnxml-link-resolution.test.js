import { describe, it, expect } from 'vitest';
import {
  resolveCrossModuleHref,
  processInlineContent,
  buildCrossModuleHref,
  appendixLandingHref,
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

  describe('appendix cross-references (A1)', () => {
    // A chapter-scoped render can't see ids that live in the separately-rendered
    // appendices. appendixIdMap (built once per render) lets a chapter link
    // resolve cross-page to the appendix landing instead of a dead #anchor.
    const appendixIdMap = new Map([
      ['fs-idm379479808', { letter: 'A', basename: 'appendices-1-lotukerfid' }],
    ]);

    it('resolves an appendix id to the absolute /vidauki/{letter} landing URL', () => {
      const ctx = makeContext({ bookSlug: 'efnafraedi-2e', appendixIdMap });
      const result = resolveCrossModuleHref(null, 'fs-idm379479808', ctx);
      // Landing URL, fragment dropped (Appendix A is the interactive periodic
      // table — vefur 307-redirects and drops #fragment).
      expect(result.href).toBe('/efnafraedi-2e/vidauki/A');
      expect(result.sameModule).toBe(false);
    });

    it('leaves a non-appendix unknown id as the existing dead same-page anchor', () => {
      const ctx = makeContext({ bookSlug: 'efnafraedi-2e', appendixIdMap });
      const result = resolveCrossModuleHref(null, 'nonexistent-id', ctx);
      expect(result.href).toBe('#nonexistent-id');
      expect(result.sameModule).toBe(true);
    });

    it('does not override a chapter-local owner that also has the same id', () => {
      // If the id resolves within the chapter, chapter-local resolution wins.
      const ctx = makeContext({
        bookSlug: 'efnafraedi-2e',
        appendixIdMap: new Map([['fs-idm68801008', { letter: 'A', basename: 'appendices-1-x' }]]),
      });
      const result = resolveCrossModuleHref(null, 'fs-idm68801008', ctx);
      // bookSlug is set, so chapter-local resolution emits the absolute URL.
      expect(result.href).toBe('/efnafraedi-2e/kafli/05/5-2-varmamaelingar#fs-idm68801008');
    });
  });
});

describe('document= appendix links resolve to the appendix landing page', () => {
  function apxCtx(overrides = {}) {
    return makeContext({
      bookSlug: 'efnafraedi-2e',
      appendixModuleLetters: new Map([
        ['m68865', 'G'],
        ['m68859', 'A'],
      ]),
      ...overrides,
    });
  }

  it('appendixLandingHref builds the /vidauki/{letter} URL', () => {
    expect(appendixLandingHref('efnafraedi-2e', 'G')).toBe('/efnafraedi-2e/vidauki/G');
  });

  it('resolveCrossModuleHref resolves a document= appendix module to its landing page', () => {
    const r = resolveCrossModuleHref('m68865', null, apxCtx());
    expect(r.href).toBe('/efnafraedi-2e/vidauki/G');
  });

  it('processInlineContent renders a document-only appendix link as a real anchor', () => {
    const out = processInlineContent(
      'Gögn úr <link document="m68865">viðauka G</link> sýna.',
      apxCtx()
    );
    expect(out).toContain('<a href="/efnafraedi-2e/vidauki/G">viðauka G</a>');
    expect(out).not.toContain('<link');
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

  describe('paired document-only <link> (no target-id) does not leak raw CNXML', () => {
    it('renders the text and emits no raw <link> tag', () => {
      const cnxml = 'Gögn úr <link document="m68865">viðauka G</link> sýna.';
      const out = processInlineContent(cnxml, makeContext());
      expect(out).not.toContain('<link');
      expect(out).toContain('viðauka G');
    });
  });
});
