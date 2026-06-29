import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, existsSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getNoteTypeLabel,
  translateTitle,
  formatChapterDir,
  calculateColspan,
  renderPara,
  renderCnxmlToHtml,
  renderCompiledExercises,
  buildAppendixIdMap,
  rollbackWrittenFiles,
  escapeJsonForScript,
  _loadBookConfigForTest,
} from '../cnxml-render.js';
import {
  getBookRenderConfig,
  generateFallbackLabel,
  getExerciseSectionClasses,
} from '../lib/book-rendering-config.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

// Load Chemistry config by default (matches original hardcoded behavior)
beforeAll(() => {
  _loadBookConfigForTest('efnafraedi-2e');
});

// ─── getNoteTypeLabel ─────────────────────────────────────────────

describe('getNoteTypeLabel', () => {
  it('returns null for null/undefined noteClass', () => {
    expect(getNoteTypeLabel(null)).toBe(null);
    expect(getNoteTypeLabel(undefined)).toBe(null);
  });

  it('returns exact match for known note types (Chemistry)', () => {
    expect(getNoteTypeLabel('link-to-learning')).toBe('Tengill til náms');
    expect(getNoteTypeLabel('sciences-interconnect')).toBe('Hvernig vísindagreinar tengjast');
    expect(getNoteTypeLabel('safety-hazard')).toBe('Öryggisviðvörun');
  });

  it('returns partial match for compound classes', () => {
    // A class like "chemistry everyday-life" should match "everyday-life"
    expect(getNoteTypeLabel('chemistry everyday-life')).toBe('Efnafræði í daglegu lífi');
  });

  it('returns fallback label for unknown note types', () => {
    // Now generates readable labels instead of null
    expect(getNoteTypeLabel('completely-unknown-type')).toBe('Completely Unknown Type');
  });

  it('returns correct labels for Microbiology note types', () => {
    _loadBookConfigForTest('orverufraedi');
    expect(getNoteTypeLabel('microbiology check-your-understanding')).toBe('Prófaðu skilning þinn');
    expect(getNoteTypeLabel('microbiology clinical-focus')).toBe('Klínísk sjónarmið');
    expect(getNoteTypeLabel('microbiology disease-profile')).toBe('Sjúkdómslýsing');
    _loadBookConfigForTest('efnafraedi-2e'); // Restore
  });

  it('returns correct labels for Biology note types', () => {
    _loadBookConfigForTest('liffraedi-2e');
    expect(getNoteTypeLabel('visual-connection')).toBe('Sjónræn tenging');
    expect(getNoteTypeLabel('evolution')).toBe('Þróun');
    expect(getNoteTypeLabel('career')).toBe('Starfsferill');
    _loadBookConfigForTest('efnafraedi-2e'); // Restore
  });
});

// ─── translateTitle ───────────────────────────────────────────────

describe('translateTitle', () => {
  it('translates known English titles to Icelandic', () => {
    expect(translateTitle('Solution')).toBe('Lausn');
    expect(translateTitle('Answer:')).toBe('Svar:');
    expect(translateTitle('Check Your Learning')).toBe('Prófaðu þekkingu þína');
  });

  it('returns original title when no translation exists', () => {
    expect(translateTitle('Unknown Title')).toBe('Unknown Title');
  });

  it('handles whitespace around titles', () => {
    expect(translateTitle('  Solution  ')).toBe('Lausn');
    expect(translateTitle(' Answer: ')).toBe('Svar:');
  });
});

// ─── formatChapterDir ─────────────────────────────────────────────

describe('formatChapterDir', () => {
  it('formats single-digit chapter with zero padding', () => {
    expect(formatChapterDir(1)).toBe('ch01');
    expect(formatChapterDir(9)).toBe('ch09');
  });

  it('formats double-digit chapter without extra padding', () => {
    expect(formatChapterDir(10)).toBe('ch10');
    expect(formatChapterDir(21)).toBe('ch21');
  });

  it('returns "appendices" for appendices chapter', () => {
    expect(formatChapterDir('appendices')).toBe('appendices');
  });
});

// ─── calculateColspan ─────────────────────────────────────────────

describe('calculateColspan', () => {
  it('calculates span from numbered columns', () => {
    expect(calculateColspan('c1', 'c3')).toBe(3);
    expect(calculateColspan('c2', 'c4')).toBe(3);
  });

  it('handles columns without "c" prefix', () => {
    expect(calculateColspan('1', '5')).toBe(5);
  });

  it('returns 1 for same start and end', () => {
    expect(calculateColspan('c1', 'c1')).toBe(1);
  });

  it('returns 1 for non-matching patterns', () => {
    expect(calculateColspan('start', 'end')).toBe(1);
  });
});

// ─── renderPara ───────────────────────────────────────────────────

describe('renderPara', () => {
  // renderPara needs a context object with certain properties
  function makeContext(overrides = {}) {
    return {
      moduleId: 'm00001',
      lang: 'is',
      verbose: false,
      mathJax: null,
      mathSvgCache: new Map(),
      equationCounter: { value: 0 },
      figureCounter: { value: 0 },
      tableCounter: { value: 0 },
      exampleCounter: { value: 0 },
      exerciseCounter: { value: 0 },
      equationTextDictionary: [],
      excludeSections: false,
      renderStats: { equations: 0, success: 0, failures: [] },
      chapterNumber: '01',
      ...overrides,
    };
  }

  it('renders a simple paragraph as <p> tag', () => {
    const para = { id: 'para-01', content: 'Simple text', attributes: {} };
    const html = renderPara(para, makeContext());
    expect(html).toContain('<p');
    expect(html).toContain('Simple text');
    expect(html).toContain('id="para-01"');
  });

  it('preserves paragraph id attribute', () => {
    const para = { id: 'my-para', content: 'Test content', attributes: {} };
    const html = renderPara(para, makeContext());
    expect(html).toContain('id="my-para"');
  });

  it('handles paragraph without id', () => {
    const para = { id: null, content: 'No id paragraph', attributes: {} };
    const html = renderPara(para, makeContext());
    expect(html).toContain('<p>');
    expect(html).toContain('No id paragraph');
  });

  it('processes inline content within paragraph', () => {
    const para = {
      id: 'p1',
      content: 'Text with <emphasis effect="bold">bold</emphasis> word',
      attributes: {},
    };
    const html = renderPara(para, makeContext());
    expect(html).toContain('<strong>bold</strong>');
  });
});

// ─── renderCnxmlToHtml ───────────────────────────────────────────

describe('renderCnxmlToHtml', () => {
  it('renders a minimal CNXML document to HTML', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
      lang: 'is',
    });
    expect(result.html).toContain('Þetta er fyrsta málsgreinin');
  });

  it('renders a standalone <media> inside a note (Check Your Learning answer image)', () => {
    // Regression: renderNote extracted para/figure/list but not bare <media>, so
    // an answer image not wrapped in <figure> (the OpenStax "Check Your Learning"
    // answer pattern: <example><note><media><image/></media></note></example>)
    // was silently dropped from the rendered HTML.
    const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Próf</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00001</md:content-id><md:title>Próf</md:title></metadata>
<content>
<example id="ex-test"><para id="p-q"><title>Athugaðu þekkingu</title>Spurning?</para>
<note id="note-ans"><title>Svar:</title>
<media id="media-ans" alt="svarmynd"><image mime-type="image/jpeg" src="../../media/CNX_Test_07_03_answer_img.jpg"/></media>
</note></example>
</content>
</document>`;
    const result = renderCnxmlToHtml(cnxml, { moduleId: 'm00001', chapter: 7, lang: 'is' });
    expect(result.html).toContain('CNX_Test_07_03_answer_img');
  });

  it('keeps a direct-child example figure inside the example when the intro para xrefs it', () => {
    // Regression: a <figure> that is a direct child of <example> (between the
    // question para and the Solution para) was rendered OUTSIDE the example box
    // whenever a sibling para cross-referenced it with <link target-id="figId"/>.
    // The isInsidePara guard used a bare `id="figId"` substring check, which also
    // matched `target-id="figId"`, so the figure was wrongly treated as already
    // rendered-in-para and skipped — then emitted by the section-level pass after
    // the example closed. (OpenStax "...(Figure X.Y)" pattern; e.g. m68700 copper.)
    const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Próf</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00001</md:content-id><md:title>Próf</md:title></metadata>
<content>
<example id="ex-cu"><para id="p-q"><title>Útreikningur</title>Kopar er notaður í rafmagnsvír (<link target-id="CNX_Test_03_02_copper"/>). Hversu margar frumeindir?</para>
<figure id="CNX_Test_03_02_copper"><media id="m-cu" alt="koparvír"><image mime-type="image/jpeg" src="../../media/CNX_Test_03_02_copper.jpg"/></media><caption>Koparvír.</caption></figure>
<para id="p-sol"><title>Lausn</title>Lausnartexti.</para>
</example>
</content>
</document>`;
    const { html } = renderCnxmlToHtml(cnxml, { moduleId: 'm00001', chapter: 3, lang: 'is' });
    const figIdx = html.indexOf('CNX_Test_03_02_copper.jpg');
    const exampleCloseIdx = html.indexOf('</aside>');
    expect(figIdx).toBeGreaterThan(-1); // figure is rendered at all
    // The figure must appear BEFORE the example <aside> closes — i.e. inside it.
    expect(figIdx).toBeLessThan(exampleCloseIdx);
  });

  it('includes module title in page title', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    expect(result.html).toContain('<title>1.0 Inngangur</title>');
  });

  it('includes page data JSON script in rendered HTML', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    expect(result.html).toContain('id="page-data"');
    expect(result.html).toContain('"moduleId": "m00001"');
  });

  it('renders paragraphs with IDs preserved', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    expect(result.html).toContain('id="para-01"');
    expect(result.html).toContain('id="para-02"');
  });

  it('renders term elements with appropriate markup', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    expect(result.html).toContain('efnafræði');
  });

  it('handles abstract list items', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    // Abstract items should appear in the output somehow
    expect(result.html).toContain('Fyrsta efni');
  });

  it('emits structured learning objectives into page data', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    // Same source as the rendered .learning-objectives block, but exposed
    // structurally so vefur can drive objective tracking without scraping HTML.
    expect(result.pageData.objectives).toEqual(['Fyrsta efni', 'Annað efni']);
    expect(result.html).toContain('"objectives"');
  });

  it('emits an empty objectives array when the module has no abstract', () => {
    const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Engin markmið</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00002</md:content-id><md:title>Engin markmið</md:title><md:uuid>00000000-0000-0000-0000-000000000002</md:uuid></metadata>
<content>
<para id="p-1">Engin námsmarkmið hér.</para>
</content>
</document>`;
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00002',
      chapter: 1,
    });
    expect(result.pageData.objectives).toEqual([]);
  });

  it('includes document class as CSS class on article', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    expect(result.html).toContain('class="cnx-module introduction"');
  });

  it('wraps content in article with data-module-id', () => {
    const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
    const result = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
    });
    expect(result.html).toContain('data-module-id="m00001"');
  });
});

// ─── Footnotes on compiled end-of-chapter pages (deferred fix A2) ──────

describe('footnotes on the compiled exercises page', () => {
  // renderCompiledExercises is chemistry's combined N-exercises page builder.
  // Bug: it slices only the first <section> from each per-section render and
  // discards the separate <section class="footnotes"> that renderCnxmlToHtml
  // appends, so a footnote MARKER (fnref) survives but its BODY (<li id="…">)
  // is dropped — a dead anchor (efnafraedi-2e 7-exercises / 12-exercises).
  const exercisesByType = {
    exercises: [
      {
        moduleId: 'm68741',
        sectionNumber: '7.1',
        sectionTitle: 'Æfingar',
        exercisesContent:
          '<section class="exercises" id="sec-ex"><title>Æfingar</title>' +
          '<exercise id="ex-1"><problem id="prob-1">' +
          '<para id="pa-1">Reiknaðu massann.<footnote id="fs-idp7089072">Miðað við staðalaðstæður.</footnote></para>' +
          '</problem></exercise></section>',
      },
    ],
  };

  function render() {
    return renderCompiledExercises(7, exercisesByType, new Map(), {
      lang: 'is',
      chapter: 7,
      bookSlug: 'efnafraedi-2e',
      moduleSections: {},
      moduleId: '7-exercises',
    });
  }

  it('renders the footnote marker for an exercise footnote', () => {
    expect(render()).toContain('id="fnref-1"');
  });

  it('renders the footnote body so the marker anchor resolves', () => {
    const html = render();
    expect(html).toContain('class="footnotes"');
    expect(html).toContain('id="fs-idp7089072"');
  });

  // Two footnote-bearing exercise sections on ONE compiled page. A full-corpus
  // scan (2026-06-22) found this never occurs in current content — every
  // chapter has at most one such section — so this locks behavior against a
  // future content addition. Forward links stay correct because each <li> uses
  // its CNXML source id; KNOWN LIMITATION: per-section renders restart footnote
  // numbering, so the display number / fnref-N backref can repeat across
  // sections. If this test ever needs the markers distinguished, renumber
  // fnref-N/fn-N page-globally while collecting (see deferred-fixlist A2 note).
  it('keeps both footnote bodies when two exercise sections each carry one', () => {
    const two = {
      exercises: [
        {
          moduleId: 'm-a',
          sectionNumber: '7.1',
          sectionTitle: 'A',
          exercisesContent:
            '<section class="exercises" id="sa"><title>A</title><exercise id="ea">' +
            '<problem id="pa"><para id="qa">Spurning A.<footnote id="fs-idAAA">Skýring A.</footnote></para>' +
            '</problem></exercise></section>',
        },
        {
          moduleId: 'm-b',
          sectionNumber: '7.2',
          sectionTitle: 'B',
          exercisesContent:
            '<section class="exercises" id="sb"><title>B</title><exercise id="eb">' +
            '<problem id="pb"><para id="qb">Spurning B.<footnote id="fs-idBBB">Skýring B.</footnote></para>' +
            '</problem></exercise></section>',
        },
      ],
    };
    const html = renderCompiledExercises(7, two, new Map(), {
      lang: 'is',
      chapter: 7,
      bookSlug: 'efnafraedi-2e',
      moduleSections: {},
      moduleId: '7-exercises',
    });
    expect(html).toContain('id="fs-idAAA"');
    expect(html).toContain('id="fs-idBBB"');
  });
});

// ─── Render rollback-on-failure (QA §0.2) ───────────────────────

describe('rollbackWrittenFiles', () => {
  // The render pass's failure path: each file safeWrite() touched is rolled
  // back — restore its newest .backup.<ts> (the pre-overwrite copy), or delete
  // it if it was brand-new this pass. Guards against a mid-pass crash leaving
  // partial pages while destroying the previously-published ones.
  function tmp() {
    return mkdtempSync(join(tmpdir(), 'rollback-'));
  }

  it('restores a file from its newest backup (previously-published page survives)', () => {
    const dir = tmp();
    try {
      const page = join(dir, 'page.html');
      writeFileSync(page, 'PARTIAL — half-written this pass');
      writeFileSync(
        join(dir, 'page.html.backup.2026-01-01T00-00-00-000Z'),
        'GOOD — prior published'
      );

      const res = rollbackWrittenFiles([page]);

      expect(res).toEqual({ restored: 1, deleted: 0 });
      expect(readFileSync(page, 'utf8')).toBe('GOOD — prior published');
      // backup consumed (renamed onto the file), not left orphaned
      expect(readdirSync(dir).filter((n) => n.includes('.backup.'))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('restores the NEWEST backup when several exist', () => {
    const dir = tmp();
    try {
      const page = join(dir, 'page.html');
      writeFileSync(page, 'PARTIAL');
      writeFileSync(join(dir, 'page.html.backup.2026-01-01T00-00-00-000Z'), 'OLD');
      writeFileSync(join(dir, 'page.html.backup.2026-06-01T00-00-00-000Z'), 'NEWEST');

      rollbackWrittenFiles([page]);

      expect(readFileSync(page, 'utf8')).toBe('NEWEST');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('deletes a brand-new partial that has no backup', () => {
    const dir = tmp();
    try {
      const page = join(dir, 'new.html');
      writeFileSync(page, 'PARTIAL — brand new this pass, no prior version');

      const res = rollbackWrittenFiles([page]);

      expect(res).toEqual({ restored: 0, deleted: 1 });
      expect(existsSync(page)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── Appendix id map (A1) ───────────────────────────────────────

describe('buildAppendixIdMap', () => {
  // Integration test against the real efnafraedi-2e appendix CNXML/structure.
  it('maps an appendix element id to its letter (periodic table = A)', () => {
    const map = buildAppendixIdMap('efnafraedi-2e', 'mt-preview');
    const entry = map.get('fs-idm379479808');
    expect(entry).toBeTruthy();
    expect(entry.letter).toBe('A');
  });

  it('returns an empty map for a book with no appendices', () => {
    const map = buildAppendixIdMap('does-not-exist', 'mt-preview');
    expect(map.size).toBe(0);
  });
});

// ─── Book Rendering Config ──────────────────────────────────────

describe('getBookRenderConfig', () => {
  it('returns Chemistry config for efnafraedi-2e', () => {
    const config = getBookRenderConfig('efnafraedi-2e');
    expect(config.noteTypeLabels['safety-hazard']).toBe('Öryggisviðvörun');
    expect(config.excludedSectionClasses).toContain('key-equations');
    expect(config.specialModules.m68859).toBe('periodic-table');
  });

  it('returns Biology config for liffraedi-2e', () => {
    const config = getBookRenderConfig('liffraedi-2e');
    expect(config.noteTypeLabels['visual-connection']).toBe('Sjónræn tenging');
    expect(config.excludedSectionClasses).toContain('multiple-choice');
    expect(config.excludedSectionClasses).toContain('critical-thinking');
    expect(config.excludedSectionClasses).not.toContain('exercises');
  });

  it('returns Microbiology config for orverufraedi', () => {
    const config = getBookRenderConfig('orverufraedi');
    expect(config.noteTypeLabels['microbiology check-your-understanding']).toBe(
      'Prófaðu skilning þinn'
    );
    expect(config.excludedSectionClasses).toContain('fill-in-the-blank');
    expect(config.excludedSectionClasses).toContain('true-false');
    expect(config.excludedSectionClasses).toContain('matching');
  });

  it('throws for an unknown book with no config file (fail-loud)', () => {
    expect(() => getBookRenderConfig('unknown-book')).toThrow(/unknown-book/);
  });

  it('Chemistry config does not have periodic-table for non-Chemistry modules', () => {
    const bioConfig = getBookRenderConfig('liffraedi-2e');
    expect(bioConfig.specialModules.m68859).toBeUndefined();
    const microConfig = getBookRenderConfig('orverufraedi');
    expect(microConfig.specialModules.m68859).toBeUndefined();
  });
});

describe('generateFallbackLabel', () => {
  it('converts hyphenated class to title case', () => {
    expect(generateFallbackLabel('clinical-focus')).toBe('Clinical Focus');
    expect(generateFallbackLabel('check-your-understanding')).toBe('Check Your Understanding');
  });

  it('strips book prefix from compound class names', () => {
    expect(generateFallbackLabel('microbiology clinical-focus')).toBe('Clinical Focus');
    expect(generateFallbackLabel('chemistry everyday-life')).toBe('Everyday Life');
  });

  it('returns empty string for null/undefined', () => {
    expect(generateFallbackLabel(null)).toBe('');
    expect(generateFallbackLabel(undefined)).toBe('');
  });
});

describe('getExerciseSectionClasses', () => {
  it('returns exercises for Chemistry', () => {
    const classes = getExerciseSectionClasses('efnafraedi-2e');
    expect(classes).toContain('exercises');
    expect(classes).not.toContain('multiple-choice');
  });

  it('returns multiple exercise types for Biology', () => {
    const classes = getExerciseSectionClasses('liffraedi-2e');
    expect(classes).toContain('multiple-choice');
    expect(classes).toContain('critical-thinking');
    expect(classes).toContain('visual-exercise');
    expect(classes).not.toContain('exercises');
  });

  it('returns 6 exercise types for Microbiology', () => {
    const classes = getExerciseSectionClasses('orverufraedi');
    expect(classes).toContain('multiple-choice');
    expect(classes).toContain('fill-in-the-blank');
    expect(classes).toContain('short-answer');
    expect(classes).toContain('critical-thinking');
    expect(classes).toContain('true-false');
    expect(classes).toContain('matching');
    expect(classes).toHaveLength(6);
  });
});

// ─── escapeJsonForScript (page-data </script> breakout guard) ──────

describe('escapeJsonForScript', () => {
  it('escapes < so a </script> in content cannot close the page-data block', () => {
    const json = JSON.stringify({ title: '</script><img src=x onerror=alert(1)>' });
    const out = escapeJsonForScript(json);
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<');
    expect(out).toContain('\\u003c/script>');
  });

  it('keeps the JSON parseable after escaping (\\u003c is valid JSON)', () => {
    const original = { title: 'a < b </script>', chapter: 5 };
    const parsed = JSON.parse(escapeJsonForScript(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it('leaves content without < untouched', () => {
    const json = JSON.stringify({ title: 'Svör við æfingum' });
    expect(escapeJsonForScript(json)).toBe(json);
  });
});

// ─── Check Your Learning answer marking ───────────────────────────

describe('check-knowledge answer note marking', () => {
  const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Mælingar</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00010</md:content-id><md:title>Mælingar</md:title><md:uuid>00000000-0000-0000-0000-000000000010</md:uuid></metadata>
<content>
<example id="ex-1"><title>Dæmi</title>
<para id="p-sol">Reiknuð lausn.</para>
<para id="p-cyl"><title>Check Your Learning</title>Hvert er rúmmálið?</para>
<note id="n-ans"><title>Answer:</title><para id="p-ans">8,844 L</para></note>
<note id="n-l2l" class="link-to-learning"><title>Tengill</title><para id="p-l2l">Lærðu meira.</para></note>
</example>
</content>
</document>`;

  it('adds check-knowledge-answer class to the classless answer note inside an example', () => {
    const { html } = renderCnxmlToHtml(cnxml, { moduleId: 'm00010', chapter: 1, lang: 'is' });
    expect(html).toContain('class="note note-default check-knowledge-answer"');
  });

  it('does not mark a classed note (e.g. link-to-learning) as an answer', () => {
    const { html } = renderCnxmlToHtml(cnxml, { moduleId: 'm00010', chapter: 1, lang: 'is' });
    expect((html.match(/check-knowledge-answer/g) || []).length).toBe(1);
    expect(html).not.toContain('check-knowledge-answer link-to-learning');
    expect(html).not.toContain('link-to-learning check-knowledge-answer');
  });
});

describe('renderCnxmlToHtml honors options.bookConfig (D6)', () => {
  const noteCnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>T</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00001</md:content-id><md:title>T</md:title></metadata>
<content><note id="n1" class="evolution"><para id="p1">Texti.</para></note></content>
</document>`;

  it('resolves a per-book note label from options.bookConfig (full config)', () => {
    // bookConfig is a full render config, as getBookRenderConfig/renderService supply.
    const { html } = renderCnxmlToHtml(noteCnxml, {
      moduleId: 'm00001',
      chapter: 1,
      lang: 'is',
      bookConfig: getBookRenderConfig('liffraedi-2e'), // biology: evolution → Þróun
    });
    expect(html).toContain('Þróun');
  });
});

describe('render: iframe embeds (D4)', () => {
  const embedMap = {
    'https://www.openstax.org/l/diet_detective': {
      resolved: 'https://www.youtube.com/embed/xyz',
      kind: 'youtube',
      status: 'ok',
    },
  };

  it('renders a standalone <media><iframe> as a resolved responsive iframe + fallback', () => {
    const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml"><content>
      <media id="m1" alt="diet_detective"><iframe width="660" height="371.4"
        src="https://www.openstax.org/l/diet_detective"/></media>
    </content></document>`;
    const { html } = renderCnxmlToHtml(cnxml, { bookSlug: 'liffraedi-2e', chapter: 29, embedMap });
    expect(html).toContain('class="embed-responsive"');
    expect(html).toContain('src="https://www.youtube.com/embed/xyz"');
    expect(html).toContain('class="embed-fallback"');
    expect(html).not.toContain('openstax.org/l/');
  });
});
