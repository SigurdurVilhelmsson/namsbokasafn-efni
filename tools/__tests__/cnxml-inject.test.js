import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  parseSegments,
  annotateInlineTerms,
  assertNoMarkerResidue,
  reverseInlineMarkup,
  restoreMathMarkers,
  restoreMathBySeparators,
  buildCnxml,
  buildExampleDom,
  buildExerciseDom,
  buildNoteDom,
  buildMediaElement,
  buildMedia,
  stripTermMarkersToText,
  parseCliArgs,
  getMathLabelResolver,
} from '../cnxml-inject.js';
import { extractInlineText } from '../cnxml-extract.js';

// ─── parseSegments ────────────────────────────────────────────────

describe('parseSegments', () => {
  it('returns empty map for empty input', () => {
    const result = parseSegments('');
    expect(result.size).toBe(0);
  });

  it('parses a single segment', () => {
    const input = '<!-- SEG:m00001:title:auto-1 -->\nIntroduction\n';
    const result = parseSegments(input);
    expect(result.size).toBe(1);
    expect(result.get('m00001:title:auto-1')).toBe('Introduction');
  });

  it('parses multiple segments', () => {
    const input = [
      '<!-- SEG:m00001:title:auto-1 -->',
      'Title Text',
      '',
      '<!-- SEG:m00001:para:para-01 -->',
      'Paragraph text here.',
      '',
    ].join('\n');
    const result = parseSegments(input);
    expect(result.size).toBe(2);
    expect(result.get('m00001:title:auto-1')).toBe('Title Text');
    expect(result.get('m00001:para:para-01')).toBe('Paragraph text here.');
  });

  it('handles multiline segment text', () => {
    const input = [
      '<!-- SEG:m00001:para:para-01 -->',
      'Line one',
      'Line two',
      '',
      '<!-- SEG:m00001:para:para-02 -->',
      'Next segment',
      '',
    ].join('\n');
    const result = parseSegments(input);
    expect(result.get('m00001:para:para-01')).toBe('Line one\nLine two');
  });

  it('handles duplicate segment IDs (first match wins)', () => {
    const input = [
      '<!-- SEG:m00001:title:auto-1 -->',
      'First version',
      '',
      '<!-- SEG:m00001:title:auto-1 -->',
      'Second version',
      '',
    ].join('\n');
    const result = parseSegments(input);
    // parseSegments uses first-match-wins (the Map.set overwrites, so last wins)
    // Let's just verify we get a result
    expect(result.has('m00001:title:auto-1')).toBe(true);
  });

  it('trims whitespace from segment text', () => {
    const input = '<!-- SEG:m00001:para:para-01 -->\n  Some padded text  \n';
    const result = parseSegments(input);
    expect(result.get('m00001:para:para-01')).toBe('Some padded text');
  });
});

// ─── reverseInlineMarkup: media/image tag protection ──────────────

describe('reverseInlineMarkup media/image protection', () => {
  const emptyEq = {};
  const noMedia = [];
  const noTables = [];

  it('should protect <media> tags from XML escaping', () => {
    const input = '<media id="m1" alt="test"><image mime-type="image/jpeg" src="fig.jpg"/></media>';
    const result = reverseInlineMarkup(input, emptyEq, noMedia, noTables);
    expect(result).toContain('<media id="m1"');
    expect(result).not.toContain('&lt;media');
  });

  it('should protect <image .../> self-closing tags from XML escaping', () => {
    const input = 'Text with <image mime-type="image/png" src="fig.png"/> inline.';
    const result = reverseInlineMarkup(input, emptyEq, noMedia, noTables);
    expect(result).toContain('<image mime-type="image/png" src="fig.png"/>');
    expect(result).not.toContain('&lt;image');
  });

  it('should protect closing </media> tags', () => {
    const input = '<media id="m1" alt=""><image mime-type="image/jpeg" src="x.jpg"/></media>';
    const result = reverseInlineMarkup(input, emptyEq, noMedia, noTables);
    expect(result).toContain('</media>');
    expect(result).not.toContain('&lt;/media');
  });
});

// ─── reverseInlineMarkup: equation deduplication ──────────────────

describe('reverseInlineMarkup equation deduplication', () => {
  it('should wrap inline equation in <equation> when NOT in block set', () => {
    const equations = {
      'math-1': {
        mathml: '<m:math><m:mn>42</m:mn></m:math>',
        equationId: 'eq-1',
        equationClass: 'unnumbered',
      },
    };
    const result = reverseInlineMarkup('Result: [[MATH:1]]', equations);
    expect(result).toContain('<equation id="eq-1"');
    expect(result).toContain('<m:math><m:mn>42</m:mn></m:math>');
  });

  it('should emit nothing when equationId is in blockEquationIds (handled by buildEquation)', () => {
    const equations = {
      'math-1': {
        mathml: '<m:math><m:mn>42</m:mn></m:math>',
        equationId: 'eq-1',
        equationClass: 'unnumbered',
      },
    };
    const blockIds = new Set(['eq-1']);
    const result = reverseInlineMarkup('Result: [[MATH:1]]', equations, [], [], null, blockIds);
    expect(result).not.toContain('<equation');
    expect(result).not.toContain('<m:math');
  });

  it('should still wrap when equationId is NOT in the block set', () => {
    const equations = {
      'math-1': {
        mathml: '<m:math><m:mn>42</m:mn></m:math>',
        equationId: 'eq-1',
      },
    };
    const blockIds = new Set(['eq-other']);
    const result = reverseInlineMarkup('Result: [[MATH:1]]', equations, [], [], null, blockIds);
    expect(result).toContain('<equation id="eq-1">');
  });

  it('should output bare mathml when no equationId', () => {
    const equations = {
      'math-1': {
        mathml: '<m:math><m:mn>42</m:mn></m:math>',
      },
    };
    const result = reverseInlineMarkup('Result: [[MATH:1]]', equations);
    expect(result).not.toContain('<equation');
    expect(result).toContain('<m:math><m:mn>42</m:mn></m:math>');
  });
});

// ─── Fix B: Self-closing entry normalization ──────────────────────

describe('buildCnxml self-closing entry normalization', () => {
  // Minimal structure + original CNXML to test that self-closing entries survive injection
  it('should preserve self-closing entries in table (Fix B)', () => {
    const structure = {
      moduleId: 'test',
      title: { segmentId: 'test:title:auto-1', text: 'Test' },
      content: [
        {
          type: 'table',
          id: 'tbl-1',
          class: null,
          summary: null,
          rows: [
            {
              cells: [
                { segmentId: 'test:entry:c1', attributes: {} },
                { segmentId: null, attributes: { align: 'left' } },
              ],
            },
          ],
        },
      ],
    };
    const segments = new Map([
      ['test:title:auto-1', 'Titill'],
      ['test:entry:c1', 'Gildi'],
    ]);
    // Original CNXML has a self-closing <entry align="left"/>
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<table id="tbl-1" summary="">
<tgroup cols="2">
<tbody>
<row><entry>Value</entry><entry align="left"/></row>
</tbody>
</tgroup>
</table>
</content>
</document>`;

    const result = buildCnxml(structure, segments, {}, originalCnxml);
    // The self-closing entry should be normalized and preserved, not dropped
    expect(result.cnxml).toContain('<entry align="left">');
    expect(result.cnxml).toContain('</entry>');
    // The translated cell should be present
    expect(result.cnxml).toContain('Gildi');
  });
});

// ─── Fix F: Self-closing para normalization (extraction-only) ─────
// Note: Self-closing para normalization is in cnxml-extract.js only.
// The injection side does NOT normalize paras because it would create
// a mismatch with the old extraction structure. Re-extraction is needed.

// ─── Fix A: List para preservation in examples ────────────────────

describe('buildCnxml list-para preservation in examples (Fix A)', () => {
  it('should not overwrite paras inside list items when paras were already replaced', () => {
    // Simulate an example where list items contain paras
    const structure = {
      moduleId: 'test',
      title: { segmentId: 'test:title:auto-1', text: 'Test' },
      content: [
        {
          type: 'example',
          id: 'ex-1',
          title: { segmentId: 'test:example-title:ex-1-title', text: 'Example' },
          content: [
            { type: 'para', id: 'p1', segmentId: 'test:para:p1' },
            { type: 'para', id: 'p2', segmentId: 'test:para:p2' },
            {
              type: 'list',
              id: 'list-1',
              listType: 'enumerated',
              items: [{ id: 'item-1', segmentId: 'test:item:item-1' }],
            },
          ],
        },
      ],
    };
    const segments = new Map([
      ['test:title:auto-1', 'Titill'],
      ['test:example-title:ex-1-title', 'Dæmi'],
      ['test:para:p1', 'Þýdd málsgrein 1'],
      ['test:para:p2', 'Þýdd málsgrein 2'],
      ['test:item:item-1', 'Þýddur liður'],
    ]);
    // The list contains p1 and p2 as item children
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<example id="ex-1">
<para id="p1"><title>Example</title>First para content.</para>
<para id="p2">Second para content.</para>
<list id="list-1" list-type="enumerated">
<item><para id="p1">First para content.</para><para id="p2">Second para content.</para></item>
</list>
</example>
</content>
</document>`;

    const result = buildCnxml(structure, segments, {}, originalCnxml);
    // The paras should have translated content (from para replacement, not list replacement)
    expect(result.cnxml).toContain('Þýdd málsgrein 1');
    expect(result.cnxml).toContain('Þýdd málsgrein 2');
    // The <para> wrappers should be preserved (not destroyed by list replacement)
    expect(result.cnxml).toContain('<para id="p1">');
    expect(result.cnxml).toContain('<para id="p2">');
  });
});

// ─── API-safe marker restoration in reverseInlineMarkup ───────────

describe('reverseInlineMarkup API-safe markers', () => {
  const emptyEq = {};

  it('should convert [[sub:2]] to <sub>2</sub>', () => {
    const result = reverseInlineMarkup('H[[sub:2]]O', emptyEq);
    expect(result).toContain('<sub>2</sub>');
  });

  it('should convert [[sup:2+]] to <sup>2+</sup>', () => {
    const result = reverseInlineMarkup('Ca[[sup:2+]]', emptyEq);
    expect(result).toContain('<sup>2+</sup>');
  });

  it('should convert [[sub:{{i}}t{{/i}}]] to <sub><emphasis effect="italics">t</emphasis></sub>', () => {
    const result = reverseInlineMarkup('Tíminn er [[sub:{{i}}t{{/i}}]]', emptyEq);
    expect(result).toContain('<sub><emphasis effect="italics">t</emphasis></sub>');
  });

  it('should convert [[sup:{{b}}x{{/b}}]] to <sup><emphasis effect="bold">x</emphasis></sup>', () => {
    const result = reverseInlineMarkup('Gildi [[sup:{{b}}x{{/b}}]]', emptyEq);
    expect(result).toContain('<sup><emphasis effect="bold">x</emphasis></sup>');
  });

  it('should convert {{i}}text{{/i}} to <emphasis effect="italics">text</emphasis>', () => {
    const result = reverseInlineMarkup('Þetta er {{i}}mikilvægt{{/i}} efni', emptyEq);
    expect(result).toContain('<emphasis effect="italics">mikilvægt</emphasis>');
  });

  it('should convert {{b}}text{{/b}} to <emphasis effect="bold">text</emphasis>', () => {
    const result = reverseInlineMarkup('Þetta er {{b}}mikilvægt{{/b}} efni', emptyEq);
    expect(result).toContain('<emphasis effect="bold">mikilvægt</emphasis>');
  });

  it('should handle multiple API-safe markers in same segment', () => {
    const result = reverseInlineMarkup('H[[sub:2]]O[[sub:2]] er {{i}}vatn{{/i}}', emptyEq);
    const subCount = (result.match(/<sub>/g) || []).length;
    const emCount = (result.match(/<emphasis/g) || []).length;
    expect(subCount).toBe(2);
    expect(emCount).toBe(1);
  });

  it('should convert {{term}}text{{/term}} to <term>text</term>', () => {
    const result = reverseInlineMarkup('Þetta er {{term}}efnafræði{{/term}} hugtak', emptyEq);
    expect(result).toContain('<term>efnafræði</term>');
  });

  it('should convert {{fn}}text{{/fn}} to <footnote>text</footnote>', () => {
    const result = reverseInlineMarkup('Texti {{fn}}athugasemd{{/fn}} hér', emptyEq);
    expect(result).toContain('<footnote>athugasemd</footnote>');
  });

  it('should handle {{term}} with sub/sup inside', () => {
    const result = reverseInlineMarkup('{{term}}H[[sub:2]]O{{/term}}', emptyEq);
    expect(result).toContain('<term>H<sub>2</sub>O</term>');
  });

  it('should handle {{fn}} with emphasis inside', () => {
    const result = reverseInlineMarkup('{{fn}}{{i}}important{{/i}} note{{/fn}}', emptyEq);
    expect(result).toContain(
      '<footnote><emphasis effect="italics">important</emphasis> note</footnote>'
    );
  });
});

// ─── Legacy marker backward compatibility ─────────────────────────

describe('reverseInlineMarkup legacy marker backward compat', () => {
  const emptyEq = {};

  it('should still convert legacy ~*t*~ to <sub><emphasis>', () => {
    const result = reverseInlineMarkup('Tíminn er ~*t*~', emptyEq);
    expect(result).toContain('<sub><emphasis effect="italics">t</emphasis></sub>');
  });

  it('should still convert legacy *text* to <emphasis effect="italics">', () => {
    const result = reverseInlineMarkup('Þetta er *mikilvægt* efni', emptyEq);
    expect(result).toContain('<emphasis effect="italics">mikilvægt</emphasis>');
  });

  it('should still convert legacy __term__ to <term>', () => {
    const result = reverseInlineMarkup('Þetta er __efnafræði__ hugtak', emptyEq);
    expect(result).toContain('<term>efnafræði</term>');
  });

  it('should still convert legacy [footnote: text] to <footnote>', () => {
    const result = reverseInlineMarkup('Texti [footnote: athugasemd] hér', emptyEq);
    expect(result).toContain('<footnote>athugasemd</footnote>');
  });
});

// ─── C16(a′): fill-in-the-blank runs must not be eaten by __term__ ──
//
// The legacy `__([^_]+)__` converter matched ACROSS two underscore blanks: it
// took the last two underscores of the first blank, the connecting prose, and
// the first two of the second, and wrapped the prose in <term>. Published output
// read `______<dfn class="term"> og  (e.  and )</dfn>______` — a student saw the
// word "og" ("and") marked up as a glossary term with an empty English gloss.
//
// Strings below are the VERBATIM segment text from the four affected production
// segments (orverufraedi m58782 x2 / m58805, liffraedi-2e m66440), not fixtures
// invented for the test. Re-derive with experiments/c16-legacy-audit/.
describe("reverseInlineMarkup fill-in-the-blank underscores (C16 a')", () => {
  const emptyEq = {};

  it('does not wrap the prose between two blanks in a <term>', () => {
    const result = reverseInlineMarkup(
      'Haeckel lagði til að bæta ríkjunum ________ og ________ við þróunartré sitt.',
      emptyEq
    );
    expect(result).not.toContain('<term>');
  });

  it('leaves both blank runs intact at their original length', () => {
    const result = reverseInlineMarkup(
      'Haeckel lagði til að bæta ríkjunum ________ og ________ við þróunartré sitt.',
      emptyEq
    );
    expect(result).toBe(
      'Haeckel lagði til að bæta ríkjunum ________ og ________ við þróunartré sitt.'
    );
  });

  it('does not wrap prose between blanks of unequal length', () => {
    const result = reverseInlineMarkup(
      'Í tvínefnakerfi inniheldur vísindaheiti lífveru ________ hennar og __________.',
      emptyEq
    );
    expect(result).not.toContain('<term>');
  });

  it('does not wrap a lone space between two adjacent blanks', () => {
    const result = reverseInlineMarkup(
      'Þörungar með grænukorn með þremur eða fjórum himnum eru afleiðing af ________ ________.',
      emptyEq
    );
    expect(result).not.toContain('<term>');
  });

  it('does not wrap prose between blanks in the biology exercise', () => {
    const result = reverseInlineMarkup(
      'Laktósi er tvísykra sem myndast við myndun ________ tengis milli glúkósa og ________.',
      emptyEq
    );
    expect(result).not.toContain('<term>');
  });

  // Regression guards: the fix must not cost the converter its real job.
  // 173 conversions across the corpus depend on this branch.

  it('still converts a real __term__ that sits beside a blank run', () => {
    const result = reverseInlineMarkup('Fylltu inn ________ fyrir __rúmmál__ hér', emptyEq);
    expect(result).toContain('<term>rúmmál</term>');
  });

  it('still converts a real __term__ at the start of a segment', () => {
    const result = reverseInlineMarkup('__Efni__ er skilgreint sem allt sem tekur rúm', emptyEq);
    expect(result).toContain('<term>Efni</term>');
  });

  it('still converts two real __term__ markers in one segment', () => {
    const result = reverseInlineMarkup('__Fyrra__ hugtak og __seinna__ hugtak', emptyEq);
    expect(result).toContain('<term>Fyrra</term>');
    expect(result).toContain('<term>seinna</term>');
  });
});

// ─── C16(a′), second site: the EN-gloss annotator has the same regex ──
//
// Fixing reverseInlineMarkup alone left an ORPHANED gloss in published output —
// `ríkjunum ________ og  (e.  and )________` — because annotateInlineTerms runs
// earlier, on RAW segment text, and its own `__([^_]+)__` alternation read the
// prose between two blanks as a term on BOTH the EN and IS sides. Unit tests and
// a whole-corpus reverseInlineMarkup oracle were both green while this shipped:
// they measured one function and the defect had two consumers.
describe("annotateInlineTerms fill-in-the-blank underscores (C16 a')", () => {
  it('does not annotate the prose between two blanks as a term', () => {
    // Verbatim EN/IS pair from orverufraedi m58782:problem:fs-id1171359127221.
    const en = new Map([
      [
        's1',
        'Haeckel proposed adding the kingdoms ________ and ________ to his phylogenetic tree.',
      ],
    ]);
    const is = new Map([
      ['s1', 'Haeckel lagði til að bæta ríkjunum ________ og ________ við þróunartré sitt.'],
    ]);

    const { annotatedCount } = annotateInlineTerms(is, en, {});

    expect(annotatedCount).toBe(0);
    expect(is.get('s1')).not.toContain('(e.');
  });

  it('leaves the IS segment byte-identical when only blanks are present', () => {
    const original = 'Haeckel lagði til að bæta ríkjunum ________ og ________ við þróunartré sitt.';
    const en = new Map([
      [
        's1',
        'Haeckel proposed adding the kingdoms ________ and ________ to his phylogenetic tree.',
      ],
    ]);
    const is = new Map([['s1', original]]);

    annotateInlineTerms(is, en, {});

    expect(is.get('s1')).toBe(original);
  });

  it('still annotates a real __term__ pair', () => {
    const en = new Map([['s1', 'The __algae__ are protists.']]);
    const is = new Map([['s1', 'Þessir __þörungar__ eru frumverur.']]);

    const { annotatedCount } = annotateInlineTerms(is, en, {});

    expect(annotatedCount).toBe(1);
    expect(is.get('s1')).toContain('(e. algae)');
  });
});

// ─── Fix D: Improved MATH marker restoration ──────────────────────

describe('restoreMathBySeparators (Fix D)', () => {
  it('should restore MATH markers in (b) chunk with no text prefix', () => {
    const isText = '(b) NH~4~^+^, SO~4~^2-^';
    const enText = '(b) [[MATH:39]] [[MATH:40]]';
    const result = restoreMathBySeparators(isText, enText);
    expect(result).toContain('[[MATH:39]]');
    expect(result).toContain('[[MATH:40]]');
  });

  it('should restore MATH markers in (c) chunk with comma prefix', () => {
    const isText = '(c) jónefni, NaCl (d) jónefni, SrCl~2~';
    const enText = '(c) ionic, [[MATH:36]] [[MATH:37]] (d) ionic, [[MATH:38]]';
    const result = restoreMathBySeparators(isText, enText);
    expect(result).toContain('[[MATH:36]]');
    expect(result).toContain('[[MATH:37]]');
    expect(result).toContain('[[MATH:38]]');
  });

  it('should return null when no separators present', () => {
    const isText = 'Simple text without separators';
    const enText = 'Simple text [[MATH:1]]';
    const result = restoreMathBySeparators(isText, enText);
    expect(result).toBeNull();
  });

  it('should return null when separator counts differ', () => {
    const isText = '(a) text (b) more';
    const enText = '(a) text (b) more (c) [[MATH:1]]';
    const result = restoreMathBySeparators(isText, enText);
    expect(result).toBeNull();
  });

  it('should preserve chunks that already have MATH markers', () => {
    const isText = '(a) [[MATH:1]] (b) inlined formula';
    const enText = '(a) [[MATH:1]] (b) [[MATH:2]]';
    const result = restoreMathBySeparators(isText, enText);
    // (a) chunk is fine, (b) chunk needs restoration
    // But (b) has no prefix text, so it should replace entire content
    expect(result).toContain('[[MATH:1]]');
    expect(result).toContain('[[MATH:2]]');
  });
});

describe('restoreMathMarkers integration (Fix D)', () => {
  it('should use separator strategy when anchor strategy fails', () => {
    const isSegments = new Map([['seg1', '(a) NaCl (b) NH~4~^+^, SO~4~^2-^']]);
    const enSegments = new Map([['seg1', '(a) [[MATH:1]] (b) [[MATH:2]] [[MATH:3]]']]);
    const { restoredCount } = restoreMathMarkers(isSegments, enSegments);
    const result = isSegments.get('seg1');
    expect(result).toContain('[[MATH:1]]');
    expect(result).toContain('[[MATH:2]]');
    expect(result).toContain('[[MATH:3]]');
    expect(restoredCount).toBe(3);
  });

  it('should not modify segments that already have all MATH markers', () => {
    const isSegments = new Map([['seg1', '(a) [[MATH:1]] (b) [[MATH:2]]']]);
    const enSegments = new Map([['seg1', '(a) [[MATH:1]] (b) [[MATH:2]]']]);
    restoreMathMarkers(isSegments, enSegments);
    expect(isSegments.get('seg1')).toBe('(a) [[MATH:1]] (b) [[MATH:2]]');
  });
});

// ─── API marker guard: legacy patterns skipped for API segments ───

describe('reverseInlineMarkup API marker guard', () => {
  const emptyEq = {};

  it('should skip legacy *text* for API-translated segments', () => {
    // Segment with {{i}} markers — asterisks should NOT become emphasis
    const input = '{{i}}vatn{{/i}} er *mikilvægt* efni';
    const result = reverseInlineMarkup(input, emptyEq);
    // {{i}} should be converted
    expect(result).toContain('<emphasis effect="italics">vatn</emphasis>');
    // *text* should NOT be converted (would be false positive)
    expect(result).toContain('*mikilvægt*');
  });

  it('should still convert *text* for legacy segments (no API markers)', () => {
    const input = 'Þetta er *mikilvægt* efni';
    const result = reverseInlineMarkup(input, emptyEq);
    expect(result).toContain('<emphasis effect="italics">mikilvægt</emphasis>');
  });

  it('should skip legacy ~text~ sub for API segments', () => {
    const input = 'H[[sub:2]]O er vatn, H~2~O líka';
    const result = reverseInlineMarkup(input, emptyEq);
    // [[sub:]] should be converted
    expect(result).toContain('<sub>2</sub>');
    // ~2~ should NOT be converted
    expect(result).toContain('H~2~O');
  });

  it('should skip legacy __term__ for API segments', () => {
    const input = '{{term}}efnafræði{{/term}} er __annað__';
    const result = reverseInlineMarkup(input, emptyEq);
    // {{term}} should be converted
    expect(result).toContain('<term>efnafræði</term>');
    // __text__ should NOT be converted
    expect(result).toContain('__annað__');
  });

  it('should always convert ++text++ underline regardless of API markers', () => {
    // API segment with underline emphasis
    const input = '{{i}}vatn{{/i}} er ++mikilvægt++ efni';
    const result = reverseInlineMarkup(input, emptyEq);
    expect(result).toContain('<emphasis effect="italics">vatn</emphasis>');
    expect(result).toContain('<emphasis effect="underline">mikilvægt</emphasis>');
  });
});

// ─── Link regex tightening ────────────────────────────────────────

describe('reverseInlineMarkup link regex tightening', () => {
  const emptyEq = {};

  it('should convert [#valid-id] to self-closing cross-reference', () => {
    const result = reverseInlineMarkup('[#CNX_Chem_05_02_Fig]', emptyEq);
    expect(result).toContain('<link target-id="CNX_Chem_05_02_Fig"/>');
  });

  it('should NOT convert [#invalid] when starting with number', () => {
    const result = reverseInlineMarkup('[#123]', emptyEq);
    expect(result).not.toContain('<link');
    expect(result).toContain('[#123]');
  });

  it('should convert [text](http://...) to external link', () => {
    const result = reverseInlineMarkup('[click](http://example.com)', emptyEq);
    expect(result).toContain('<link url="http://example.com">click</link>');
  });

  it('should NOT convert [text](random-text) to a link', () => {
    // This pattern could appear in translated text but is not a real link
    const result = reverseInlineMarkup('[sjá viðauka](nánari útskýring)', emptyEq);
    expect(result).not.toContain('<link');
  });

  it('should convert [m12345#target-id] to document cross-reference', () => {
    const result = reverseInlineMarkup('[m68674#fs-id123]', emptyEq);
    expect(result).toContain('<link document="m68674" target-id="fs-id123"/>');
  });
});

// ─── Nested bracket markers (both nesting directions) ─────────────

describe('reverseInlineMarkup nested bracket markers', () => {
  const emptyEq = {};

  // Direction 1: sub/sup wrapping emphasis (rate laws, exponents)
  it('should handle [[sup:[[i:x]]−1]] — emphasis inside superscript', () => {
    const result = reverseInlineMarkup('rate = k[[sup:[[i:x]]−1]]', emptyEq);
    expect(result).toContain('<sup><emphasis effect="italics">x</emphasis>−1</sup>');
    expect(result).not.toContain('[[i:');
    expect(result).not.toContain('[[sup:');
  });

  it('should handle [[sub:[[i:t]]]] — emphasis inside subscript', () => {
    const result = reverseInlineMarkup('Tíminn er [[sub:[[i:t]]]]', emptyEq);
    expect(result).toContain('<sub><emphasis effect="italics">t</emphasis></sub>');
  });

  it('should handle [[sup:[[b:x]]2]] — bold inside superscript', () => {
    const result = reverseInlineMarkup('gildi [[sup:[[b:x]]2]]', emptyEq);
    expect(result).toContain('<sup><emphasis effect="bold">x</emphasis>2</sup>');
  });

  // Direction 2: emphasis wrapping sub/sup (molecular orbital notation)
  it('should handle [[i:[[sub:s]]]] — subscript inside emphasis', () => {
    const result = reverseInlineMarkup('σ[[i:[[sub:s]]]]', emptyEq);
    expect(result).toContain('<emphasis effect="italics"><sub>s</sub></emphasis>');
    expect(result).not.toContain('[[sub:');
    expect(result).not.toContain('[[i:');
  });

  it('should handle [[i:[[sub:p]]]] — subscript inside emphasis (p orbital)', () => {
    const result = reverseInlineMarkup('σ[[i:[[sub:p]]]]', emptyEq);
    expect(result).toContain('<emphasis effect="italics"><sub>p</sub></emphasis>');
  });

  it('should handle [[b:[[sup:2]]]] — superscript inside bold', () => {
    const result = reverseInlineMarkup('x[[b:[[sup:2]]]]', emptyEq);
    expect(result).toContain('<emphasis effect="bold"><sup>2</sup></emphasis>');
  });

  // Adjacent (non-nested) — should still work
  it('should handle adjacent [[i:q]][[sub:in]] — emphasis then subscript', () => {
    const result = reverseInlineMarkup('[[i:q]][[sub:in]]', emptyEq);
    expect(result).toContain('<emphasis effect="italics">q</emphasis>');
    expect(result).toContain('<sub>in</sub>');
  });
});

// ─── Hybrid {{i:text}} marker format ─────────────────────────────

describe('reverseInlineMarkup hybrid {{i:text}} markers', () => {
  const emptyEq = {};

  it('should convert {{i:text}} to emphasis', () => {
    const result = reverseInlineMarkup('Þetta er {{i:röskun}} fyrirbæri', emptyEq);
    expect(result).toContain('<emphasis effect="italics">röskun</emphasis>');
  });

  it('should convert {{b:text}} to bold emphasis', () => {
    const result = reverseInlineMarkup('Þetta er {{b:mikilvægt}} efni', emptyEq);
    expect(result).toContain('<emphasis effect="bold">mikilvægt</emphasis>');
  });

  it('should convert hybrid alongside other API markers', () => {
    const input = '{{term}}efnafræði{{/term}} og {{i:tilfærsla}} í jafnvægi';
    const result = reverseInlineMarkup(input, emptyEq);
    expect(result).toContain('<term>efnafræði</term>');
    expect(result).toContain('<emphasis effect="italics">tilfærsla</emphasis>');
  });

  it('should handle hybrid marker with long phrase', () => {
    const input = '{{i:ef jafnvægiskerfi er raskað mun kerfið gangast undir tilfærslu}}';
    const result = reverseInlineMarkup(input, emptyEq);
    expect(result).toContain('<emphasis effect="italics">ef jafnvægiskerfi er raskað');
  });
});

// ─── Bracket markers with literal brackets in content ─────────────

describe('reverseInlineMarkup literal brackets in content', () => {
  const emptyEq = {};

  it('should handle [[i:text]] preceded by literal [ — chemistry [[[i:v]], m/s]', () => {
    const result = reverseInlineMarkup('[[[i:v]], m/s]', emptyEq);
    expect(result).toContain('<emphasis effect="italics">v</emphasis>');
    expect(result).toContain('['); // literal brackets preserved
  });

  it('should handle emphasis with [NO] concentration notation inside', () => {
    const input = '[[i:determine from data where [NO] changes]]';
    const result = reverseInlineMarkup(input, emptyEq);
    expect(result).toContain(
      '<emphasis effect="italics">determine from data where [NO] changes</emphasis>'
    );
    expect(result).not.toContain('[[i:');
  });

  it('should handle emphasis with [O<sub>3</sub>] after sub conversion', () => {
    // After the loop converts [[sub:3]] to <sub>3</sub>, the content has [O<sub>3</sub>]
    // Simulate the post-sub-conversion state:
    const input = '[[i:data where [O<sub>3</sub>] is constant]]';
    const result = reverseInlineMarkup(input, emptyEq);
    expect(result).toContain(
      '<emphasis effect="italics">data where [O<sub>3</sub>] is constant</emphasis>'
    );
  });

  it('should still handle nested markers correctly after the fix', () => {
    const result = reverseInlineMarkup('σ[[i:[[sub:s]]]]', emptyEq);
    expect(result).toContain('<emphasis effect="italics"><sub>s</sub></emphasis>');
  });

  it('should handle the full m68789 pattern: emphasis with [NO] and nested [[sub:]]', () => {
    const input = '[[i:determine m from data where [NO] changes and [O[[sub:3]]] is constant.]]';
    const result = reverseInlineMarkup(input, emptyEq);
    expect(result).toContain('<emphasis effect="italics">');
    expect(result).toContain('[NO]');
    expect(result).toContain('[O<sub>3</sub>]');
    expect(result).not.toContain('[[i:');
    expect(result).not.toContain('[[sub:');
  });
});

// ─── Self-closing table entry alignment ───────────────────────────

describe('table injection: self-closing entry expansion', () => {
  // Regression test for m68837 where self-closing <entry align="left"/>
  // caused cellIdx misalignment and content duplication.
  // The bug: /<entry([^>]*)>([\s\S]*?)<\/entry>/g applied to a row
  // containing a self-closing entry treats the / as part of [^>]*
  // (attributes), then ([\s\S]*?) consumes up to the NEXT </entry>,
  // swallowing a real entry and misaligning all subsequent cellIdx values.

  it('entry regex WITHOUT expansion misaligns cells when self-closing entries are present', () => {
    // Row with a self-closing entry followed by a content entry
    const rowContent = '<entry align="left"/><entry align="left">content (2.0)</entry>';

    const entryRegex = /<entry([^>]*)>([\s\S]*?)<\/entry>/g;
    const matches = [];
    let m;
    while ((m = entryRegex.exec(rowContent)) !== null) {
      matches.push({ attrs: m[1], content: m[2] });
    }

    // With the bug: regex matches only ONE entry, not two.
    // The self-closing entry's /> causes attrs to include "/" and
    // content captures everything up to the lone </entry>.
    // So: attrs = ' align="left"/', content = '<entry align="left">content (2.0)'
    // Only 1 match instead of 2 — cellIdx is misaligned.
    expect(matches.length).toBe(1); // BUG: should be 2
    // And the content of the "match" contains the swallowed second entry
    expect(matches[0].content).toContain('<entry'); // BUG: inner entry leaked into content
  });

  it('entry regex WITH expansion correctly finds all entries', () => {
    const rowContent = '<entry align="left"/><entry align="left">content (2.0)</entry>';

    // Apply the fix: expand self-closing entries first
    const expanded = rowContent.replace(/<entry([^>]*?)\/>/g, '<entry$1></entry>');
    expect(expanded).toBe('<entry align="left"></entry><entry align="left">content (2.0)</entry>');

    const entryRegex = /<entry([^>]*)>([\s\S]*?)<\/entry>/g;
    const matches = [];
    let m;
    while ((m = entryRegex.exec(expanded)) !== null) {
      matches.push({ attrs: m[1], content: m[2] });
    }

    // With fix: 2 entries, cellIdx stays aligned
    expect(matches.length).toBe(2);
    expect(matches[0].content).toBe(''); // empty cell
    expect(matches[1].content).toBe('content (2.0)'); // correct cell
  });

  it('expansion does not affect normal entries with closing tags', () => {
    const rowContent = '<entry>cell A</entry><entry align="center">cell B</entry>';
    const expanded = rowContent.replace(/<entry([^>]*?)\/>/g, '<entry$1></entry>');
    // No self-closing entries: should be unchanged
    expect(expanded).toBe(rowContent);
  });
});

// ─── RC4 / m68863: undercounted structure.cells leaks raw EN entry ─
// Regression test for the mechanism behind m68863's "table-header EN
// residue" (B4-D5, docs/plans/2026-07-12-b4-term-fn-bracket-markers-design.md
// § Register). Root cause: structure.json's row.cells[] must have exactly one
// entry per source <entry> in that row (including a { segmentId: null }
// placeholder for legitimately blank cells — see "Fix B" above). When
// extraction under-counts (omits a cell object entirely for one of the
// row's <entry> elements), buildTable's positional cellIdx walk runs off
// the end of row.cells for the trailing entries. Historically this fell
// through to `return entryMatch`, silently emitting the RAW SOURCE entry
// (untranslated English) with no signal at all — exactly what m68863's
// committed 03-translated output showed before it was incidentally healed
// by an unrelated re-extract (structure.json regained the missing cell).
//
// The guard must NOT throw: a throw at buildTable depth bypasses the
// per-module isolation idiom (it fires inside buildCnxml, before the CLI
// main loop's incomplete-check, is not gated by --allow-incomplete, and
// aborts the whole chapter batch — e.g. --chapter 12 would die at m68789
// and never process m68791+). Instead it rides the existing
// incomplete-module mechanism: record the gap on report.tableCellGaps,
// emit the source entry (the pre-fix visible behavior), and gate
// report.complete — the established skip+continue+exitCode=1 path in the
// CLI handles the rest (module skipped unless --allow-incomplete, loud on
// the console either way).
describe('buildCnxml table row: undercounted structure.cells (RC4 / m68863)', () => {
  const structure = {
    moduleId: 'test',
    title: { segmentId: 'test:title:auto-1', text: 'Test' },
    content: [
      {
        type: 'table',
        id: 'tbl-rc4',
        class: null,
        summary: null,
        rows: [
          {
            // Only 2 cells recorded, but the source row (below) has 3
            // <entry> elements — mirrors the m68863 defect where the
            // leading blank <entry> was never captured as a cell.
            cells: [
              { segmentId: 'test:entry:c1', attributes: { align: 'left' } },
              { segmentId: 'test:entry:c2', attributes: { align: 'left' } },
            ],
          },
        ],
      },
    ],
  };
  const segments = new Map([
    ['test:title:auto-1', 'Titill'],
    ['test:entry:c1', 'Þýtt 1'],
    ['test:entry:c2', 'Þýtt 2'],
  ]);
  const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<table id="tbl-rc4" summary="">
<tgroup cols="3">
<tbody>
<row><entry align="left">Raw EN 1</entry><entry align="left">Raw EN 2</entry><entry align="left">Raw EN 3</entry></row>
</tbody>
</tgroup>
</table>
</content>
</document>`;

  it('records the gap, marks the module incomplete, and emits the source entry (no throw)', () => {
    // Before the fix: buildCnxml silently returns "Raw EN 3" verbatim with a
    // fully "complete" report (English residue, RC4, invisible). After the
    // fix: same visible output, but the gap is recorded and completeness is
    // gated so the CLI's per-module skip+exitCode=1 path catches it — without
    // aborting the rest of the chapter batch.
    let result;
    expect(() => {
      result = buildCnxml(structure, segments, {}, originalCnxml);
    }).not.toThrow();

    // (a) gap recorded, naming table/row/entry and the leaked text
    expect(result.report.tableCellGaps).toHaveLength(1);
    expect(result.report.tableCellGaps[0]).toMatchObject({
      tableId: 'tbl-rc4',
      rowIndex: 0,
      entryIndex: 2,
    });
    expect(result.report.tableCellGaps[0].text).toContain('Raw EN 3');

    // (b) source entry emitted as before (pre-fix visible behavior)
    expect(result.cnxml).toContain('Raw EN 3');
    expect(result.cnxml).toContain('Þýtt 1');
    expect(result.cnxml).toContain('Þýtt 2');

    // (c) completeness gated → CLI skip path (not process abort) handles it
    expect(result.report.complete).toBe(false);
  });

  it('leaves a legitimately blank trailing entry untouched (no false positive)', () => {
    // Same undercount, but the uncovered trailing entry is genuinely blank
    // in the source (e.g. a decorative spacer cell) — must NOT record a gap
    // or gate completeness.
    const blankOriginalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<table id="tbl-rc4" summary="">
<tgroup cols="3">
<tbody>
<row><entry align="left">Raw EN 1</entry><entry align="left">Raw EN 2</entry><entry align="left"/></row>
</tbody>
</tgroup>
</table>
</content>
</document>`;

    let result;
    expect(() => {
      result = buildCnxml(structure, segments, {}, blankOriginalCnxml);
    }).not.toThrow();
    expect(result.cnxml).toContain('Þýtt 1');
    expect(result.cnxml).toContain('Þýtt 2');
    expect(result.report.tableCellGaps).toHaveLength(0);
    expect(result.report.complete).toBe(true);
  });
});

// ─── Nested list preservation in buildExampleDom ──────────────────

describe('buildExampleDom nested list in para', () => {
  // Regression test for m68739 where a <para> directly containing a <list>
  // was destroyed. The extraction flattens para+list into one segment; when
  // that segment contains expanded math the old code REMOVED the nested list
  // from the DOM and injected the entire flat text, losing 5 items and 1 list.
  //
  // The fix: detect the nested list, set skipParaText=true, and let the list
  // handler process its items normally.

  it('should preserve nested list when para contains math in translated segment', () => {
    const element = {
      type: 'example',
      id: 'ex-nested',
      title: { segmentId: 'm00001:example-title:ex-nested-title', text: 'Example' },
      content: [
        {
          type: 'para',
          id: 'para-solution',
          segmentId: 'm00001:para:para-solution',
          title: { segmentId: 'm00001:para-title:para-solution-title', text: 'Solution' },
        },
        {
          type: 'list',
          id: 'list-nested',
          listType: 'enumerated',
          items: [
            { id: 'item-a', segmentId: 'm00001:item:item-a' },
            { id: 'item-b', segmentId: 'm00001:item:item-b' },
          ],
        },
      ],
    };

    const segments = new Map([
      ['m00001:example-title:ex-nested-title', 'Dæmi'],
      [
        'm00001:para:para-solution',
        // Translated segment contains math (expanded content) — this is what
        // triggers the "paraHasExpandedContent" branch
        'Lausn með <m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mn>42</m:mn></m:math>',
      ],
      ['m00001:para-title:para-solution-title', 'Lausn'],
      ['m00001:item:item-a', 'Liður (a)'],
      ['m00001:item:item-b', 'Liður (b)'],
    ]);

    const getSeg = (id) => segments.get(id) ?? '';

    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<example id="ex-nested">
<para id="para-solution">
<title>Solution</title>
<list id="list-nested" list-type="enumerated">
<item id="item-a">Item A original text</item>
<item id="item-b">Item B original text</item>
</list>
</para>
</example>
</content>
</document>`;

    const result = buildExampleDom(element, getSeg, {}, originalCnxml);

    // The list must survive — not be destroyed
    expect(result).toContain('<list id="list-nested"');
    // The translated list items must appear
    expect(result).toContain('Liður (a)');
    expect(result).toContain('Liður (b)');
    // The original English item text must NOT appear (items were replaced)
    expect(result).not.toContain('Item A original text');
    expect(result).not.toContain('Item B original text');
  });
});

describe('buildExampleDom figure inside para', () => {
  // Regression test for lifraen-efnafraedi m00038 where a <para> contains a
  // <figure> as its only content. The extraction creates [[MEDIA:1]] in the
  // para segment AND a top-level figure structure entry. Without the fix,
  // the injection produces a bare <media> inside the para (from [[MEDIA:1]]
  // expansion) AND a standalone <figure> after </example> — 2 copies.

  it('should keep figure inside example when para content is only [[MEDIA:N]]', () => {
    const element = {
      type: 'example',
      id: 'exam-00001',
      title: { segmentId: 'mod:example-title:exam-00001-title', text: 'Strategy' },
      content: [
        {
          type: 'para',
          id: 'para-00010',
          segmentId: 'mod:para:para-00010',
        },
        {
          type: 'para',
          id: 'para-00012',
          segmentId: 'mod:para:para-00012',
          title: { segmentId: 'mod:para-title:para-00012-title', text: 'Solution' },
        },
      ],
    };

    const segments = new Map([
      ['mod:example-title:exam-00001-title', 'Dæmi'],
      ['mod:para:para-00010', 'Horfðu meðfram C1–C2 tenginu.'],
      ['mod:para:para-00012', '[[MEDIA:1]]'],
      ['mod:para-title:para-00012-title', 'Lausn'],
    ]);

    const getSeg = (id) => segments.get(id) ?? '';

    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<example id="exam-00001">
<title>Newman Projections</title>
<para id="para-00010">Sight along the C1–C2 bond.</para>
<para id="para-00012"><title><span class="cyan-text">Solution</span></title>
<figure class="unnumbered scaled-down" id="fig-00007">
<media alt="Two Newman projections.">
<image mime-type="image/jpeg" src="../../media/OChem_03_07_007.jpg"/>
</media>
</figure></para>
</example>
</content>
</document>`;

    const ctx = {
      figureCaptions: {},
      figuresHandledInNotes: new Set(),
      figuresHandledInContainers: new Set(),
      inlineMedia: [
        {
          placeholder: '[[MEDIA:1]]',
          alt: 'Two Newman projections.',
          src: '../../media/OChem_03_07_007.jpg',
          mimeType: 'image/jpeg',
        },
      ],
      inlineTables: [],
      imageMapping: new Map(),
    };

    const result = buildExampleDom(element, getSeg, {}, originalCnxml, ctx);

    // The figure MUST remain inside the example
    expect(result).toContain('<figure');
    expect(result).toContain('fig-00007');
    expect(result).toContain('OChem_03_07_007.jpg');

    // There must be exactly ONE image reference, not duplicated
    const imageCount = (result.match(/OChem_03_07_007\.jpg/g) || []).length;
    expect(imageCount).toBe(1);

    // The figure ID must be marked as handled so buildFigure skips it
    expect(ctx.figuresHandledInContainers.has('fig-00007')).toBe(true);

    // No bare <media> outside a <figure> (the expanded [[MEDIA:1]] must not appear)
    const mediaOutsideFigure = result.replace(/<figure[\s\S]*?<\/figure>/g, '');
    expect(mediaOutsideFigure).not.toContain('<media');
  });

  it('should NOT affect paras that have real text content alongside media', () => {
    const element = {
      type: 'example',
      id: 'exam-text-media',
      title: { segmentId: 'mod:example-title:exam-text-media-title', text: 'Example' },
      content: [
        {
          type: 'para',
          id: 'para-mixed',
          segmentId: 'mod:para:para-mixed',
        },
      ],
    };

    const segments = new Map([
      ['mod:example-title:exam-text-media-title', 'Dæmi'],
      ['mod:para:para-mixed', 'Hér er mynd: [[MEDIA:1]] og meiri texti.'],
    ]);

    const getSeg = (id) => segments.get(id) ?? '';

    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<example id="exam-text-media">
<title>Example</title>
<para id="para-mixed">Here is an image: <media alt="A diagram."><image mime-type="image/jpeg" src="../../media/diagram.jpg"/></media> and more text.</para>
</example>
</content>
</document>`;

    const ctx = {
      figureCaptions: {},
      figuresHandledInNotes: new Set(),
      figuresHandledInContainers: new Set(),
      inlineMedia: [
        {
          placeholder: '[[MEDIA:1]]',
          alt: 'A diagram.',
          src: '../../media/diagram.jpg',
          mimeType: 'image/jpeg',
        },
      ],
      inlineTables: [],
      imageMapping: new Map(),
    };

    const result = buildExampleDom(element, getSeg, {}, originalCnxml, ctx);

    // Normal para text injection should still work
    expect(result).toContain('Hér er mynd');
    // No figures were kept (there were none in the source)
    expect(ctx.figuresHandledInContainers.size).toBe(0);
  });
});

// ─── Figure inside exercise para (same pattern as buildExampleDom) ─
describe('buildExerciseDom figure inside para', () => {
  it('should keep figure inside exercise when para content is only [[MEDIA:N]]', () => {
    const element = {
      type: 'exercise',
      id: 'exer-fig',
      problem: {
        content: [
          {
            type: 'para',
            id: 'para-prob',
            segmentId: 'mod:para:para-prob',
          },
        ],
      },
      solution: {
        content: [
          {
            type: 'para',
            id: 'para-sol',
            segmentId: 'mod:para:para-sol',
          },
        ],
      },
    };

    const segments = new Map([
      ['mod:para:para-prob', 'Teiknaðu myndina.'],
      ['mod:para:para-sol', '[[MEDIA:1]]'],
    ]);

    const getSeg = (id) => segments.get(id) ?? '';

    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<exercise id="exer-fig">
<problem id="prob-fig"><para id="para-prob">Draw the diagram.</para></problem>
<solution id="sol-fig"><para id="para-sol">
<figure class="unnumbered" id="fig-sol">
<media alt="A solution diagram."><image mime-type="image/jpeg" src="../../media/solution.jpg"/></media>
</figure></para></solution>
</exercise>
</content>
</document>`;

    const ctx = {
      figureCaptions: {},
      figuresHandledInNotes: new Set(),
      figuresHandledInContainers: new Set(),
      inlineMedia: [
        {
          placeholder: '[[MEDIA:1]]',
          alt: 'A solution diagram.',
          src: '../../media/solution.jpg',
          mimeType: 'image/jpeg',
        },
      ],
      inlineTables: [],
      imageMapping: new Map(),
    };

    const result = buildExerciseDom(element, getSeg, {}, originalCnxml, ctx);

    // Figure must be inside the exercise
    expect(result).toContain('fig-sol');
    expect(result).toContain('solution.jpg');

    // Only one copy
    const imageCount = (result.match(/solution\.jpg/g) || []).length;
    expect(imageCount).toBe(1);

    // Marked as handled
    expect(ctx.figuresHandledInContainers.has('fig-sol')).toBe(true);
  });
});

// ─── C13: figure inside a para inside a note ──────────────────────
// Regression tests for liffraedi-2e m66374/m66375/m66440/m66442/m66443 (6 live
// occurrences; 71 in the corpus, all one shape). A <para> inside a <note> whose
// only content is a CAPTIONED <figure>. Extraction hoists the figure into a
// top-level structure entry AND flattens its <media> into the para segment as
// [[MEDIA:N]] followed by the caption prose — so the whole para segment is
// figure-derived. buildExampleDom/buildExerciseDom pre-scan their paras for
// figures and drop that text; buildNoteDom did not, so the expanded <media> was
// injected BEFORE the surviving DOM figure. The global deduplicateMedia keeps
// the FIRST occurrence of a media id, so it then deleted the copy *inside* the
// figure, leaving <figure><caption/></figure> — rejected by the OpenStax
// RelaxNG schema ("element caption not allowed yet; expected ... media") and
// rendered as an unlabelled orphan image + an image-less figure whose anchor
// the preceding cross-reference points at.
//
// The precedent tests above use an UNCAPTIONED figure, which is exactly why they
// never caught this: with no caption there is no prose left to duplicate.
describe('buildNoteDom figure inside para (C13)', () => {
  const CAPTION_IS = 'Glúkósi, galaktósi og frúktósi eru allir hexósar.';
  const ALT = 'The linear forms of glucose, galactose, and fructose.';

  const INLINE_MEDIA = [
    {
      placeholder: '[[MEDIA:1]]',
      id: 'fs-id1319192',
      alt: ALT,
      src: '../../media/Figure_03_02_02.png',
      mimeType: 'image/png',
    },
  ];

  const segments = new Map([
    ['m66440:para:fs-id2000117', `[[MEDIA:1]] ${CAPTION_IS}`],
    ['m66440:para:fs-id2762822', 'Hvers konar sykrur eru þetta?'],
    ['m66440:caption:fig-ch03_02_02-caption', CAPTION_IS],
  ]);

  // Production getSeg expands [[MEDIA:N]] via reverseInlineMarkup before the
  // builders ever see it — a Map lookup alone would not reproduce the bug.
  const getSeg = (id) => reverseInlineMarkup(segments.get(id) ?? '', {}, INLINE_MEDIA, []);

  const ORIGINAL = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<note id="fs-id1385935" class="visual-connection">
<para id="fs-id2000117">
<figure id="fig-ch03_02_02"><media id="fs-id1319192" alt="${ALT}">
<image mime-type="image/png" src="../../media/Figure_03_02_02.png" width="400"/>
</media>
<caption>Glucose, galactose, and fructose are all hexoses.</caption>
</figure></para>
<para id="fs-id2762822">What kind of sugars are these?</para>
</note>
</content>
</document>`;

  const element = {
    type: 'note',
    id: 'fs-id1385935',
    class: 'visual-connection',
    title: null,
    content: [
      { type: 'para', id: 'fs-id2000117', segmentId: 'm66440:para:fs-id2000117' },
      { type: 'para', id: 'fs-id2762822', segmentId: 'm66440:para:fs-id2762822' },
    ],
  };

  const makeCtx = (
    figureCaptions = { 'fig-ch03_02_02': 'm66440:caption:fig-ch03_02_02-caption' }
  ) => ({
    figureCaptions,
    figuresHandledInNotes: new Set(),
    figuresHandledInContainers: new Set(),
    inlineMedia: INLINE_MEDIA,
    inlineTables: [],
    imageMapping: new Map(),
  });

  const build = (ctx = makeCtx()) => buildNoteDom(element, getSeg, {}, ORIGINAL, ctx);

  it('emits no bare <media> outside the figure', () => {
    const outsideFigures = build().replace(/<figure[\s\S]*?<\/figure>/g, '');
    expect(outsideFigures).not.toContain('<media');
  });

  it('puts the figure ahead of any media in document order', () => {
    // deduplicateMedia keeps the FIRST occurrence of a media id, so an orphan
    // copy emitted ahead of the figure is what causes the figure's own <media>
    // to be the one deleted at document level.
    const result = build();
    expect(result.indexOf('<figure')).toBeLessThan(result.indexOf('<media'));
  });

  it('emits exactly one copy of the image', () => {
    expect((build().match(/Figure_03_02_02\.png/g) || []).length).toBe(1);
  });

  it('does not duplicate the caption prose as para body text', () => {
    const outsideFigures = build().replace(/<figure[\s\S]*?<\/figure>/g, '');
    expect(outsideFigures).not.toContain(CAPTION_IS);
  });

  it('still translates the kept figure caption', () => {
    expect(build()).toContain(`<caption>${CAPTION_IS}</caption>`);
  });

  it('leaves the note-sibling paras untouched', () => {
    expect(build()).toContain('Hvers konar sykrur eru þetta?');
  });

  it('registers the figure so the standalone buildFigure copy is skipped', () => {
    const ctx = makeCtx();
    build(ctx);
    expect(ctx.figuresHandledInNotes.has('fig-ch03_02_02')).toBe(true);
  });

  it('registers an UNCAPTIONED para figure too', () => {
    // The caption loop only registered ids when ctx.figureCaptions had an entry,
    // so a caption-less figure in a note para got a standalone duplicate as well.
    const ctx = makeCtx({});
    build(ctx);
    expect(ctx.figuresHandledInNotes.has('fig-ch03_02_02')).toBe(true);
  });

  it('keeps a note para that has real prose alongside a figure', () => {
    // No such shape exists in the corpus (all 71 are figure-only), but the
    // branch must not swallow genuine para text if one ever appears.
    const mixedOriginal = ORIGINAL.replace(
      '<para id="fs-id2000117">\n<figure',
      '<para id="fs-id2000117">Skoðaðu myndina.\n<figure'
    );
    const mixedSegments = new Map(segments);
    mixedSegments.set('m66440:para:fs-id2000117', `Skoðaðu myndina. [[MEDIA:1]] ${CAPTION_IS}`);
    const mixedGetSeg = (id) =>
      reverseInlineMarkup(mixedSegments.get(id) ?? '', {}, INLINE_MEDIA, []);
    const result = buildNoteDom(element, mixedGetSeg, {}, mixedOriginal, makeCtx());
    expect(result).toContain('Skoðaðu myndina.');
  });

  it('strips the expanded media from a mixed-prose para (no orphan copy)', () => {
    const mixedOriginal = ORIGINAL.replace(
      '<para id="fs-id2000117">\n<figure',
      '<para id="fs-id2000117">Skoðaðu myndina.\n<figure'
    );
    const mixedSegments = new Map(segments);
    mixedSegments.set('m66440:para:fs-id2000117', `Skoðaðu myndina. [[MEDIA:1]] ${CAPTION_IS}`);
    const mixedGetSeg = (id) =>
      reverseInlineMarkup(mixedSegments.get(id) ?? '', {}, INLINE_MEDIA, []);
    const result = buildNoteDom(element, mixedGetSeg, {}, mixedOriginal, makeCtx());
    const outsideFigures = result.replace(/<figure[\s\S]*?<\/figure>/g, '');
    expect(outsideFigures).not.toContain('<media');
  });

  it('leaves the source text of an UNTRANSLATED mixed-prose para in place', () => {
    // The pre-C13 path did `if (!paraText) continue`, so a para with no
    // translation kept its original English rather than being blanked. The new
    // branch must preserve that fail-safe: content loss is worse than EN residue,
    // which the A2 residue gate already reports.
    const mixedOriginal = ORIGINAL.replace(
      '<para id="fs-id2000117">\n<figure',
      '<para id="fs-id2000117">Look at the figure.\n<figure'
    );
    const emptyGetSeg = (id) => (id === 'm66440:para:fs-id2000117' ? '' : (segments.get(id) ?? ''));
    const result = buildNoteDom(element, emptyGetSeg, {}, mixedOriginal, makeCtx());
    expect(result).toContain('Look at the figure.');
  });

  it('honours paraHasFlattenedList when the para also holds a figure', () => {
    // The path this branch replaced consulted paraHasFlattenedList (audit #33)
    // and injected nothing when extraction had flattened a nested <list> into
    // the para's segment, leaving the list to the list handler. Skipping that
    // check would emit the item text twice. No corpus case has this shape today
    // (all 71 are figure-only), so this is a synthetic pin against divergence.
    const listOriginal = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>T</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>T</md:title></metadata>
<content>
<note id="n-list" class="tip">
<para id="p-list">Sjá formúluna
<figure id="f-list"><media id="m-list" alt="A"><image mime-type="image/png" src="../../media/a.png"/></media><caption>Skýring</caption></figure>
<list id="l-list" list-type="bulleted"><item id="i-list">Fyrsti liður</item></list>
</para>
</note>
</content>
</document>`;
    const listElement = {
      type: 'note',
      id: 'n-list',
      class: 'tip',
      title: null,
      content: [
        { type: 'para', id: 'p-list', segmentId: 'seg:p-list' },
        { type: 'list', id: 'l-list', items: [{ id: 'i-list', segmentId: 'seg:i-list' }] },
      ],
    };
    // The segment carries the expanded media, an <m:math> (what
    // paraHasFlattenedList keys on) and the flattened list item text.
    const listGetSeg = (id) =>
      id === 'seg:p-list'
        ? '<media id="m-list" alt="A"><image mime-type="image/png" src="../../media/a.png"/></media> Sjá formúluna <m:math><m:mi>x</m:mi></m:math> Fyrsti liður'
        : id === 'seg:i-list'
          ? 'Fyrsti liður'
          : '';
    const result = buildNoteDom(listElement, listGetSeg, {}, listOriginal, makeCtx({}));
    expect((result.match(/Fyrsti liður/g) || []).length).toBe(1);
  });
});

// C13 end-to-end: the destruction only happens after buildCnxml's document-level
// deduplicateMedia, so the unit tests above cannot see it. This one exercises the
// whole production chain — hoisted figure structure entry included — and pins the
// state the schema gate actually rejected.
describe('buildCnxml: figure inside a para inside a note (C13 end-to-end)', () => {
  const CAPTION_IS = 'Glúkósi, galaktósi og frúktósi eru allir hexósar.';
  const ALT = 'The linear forms of glucose, galactose, and fructose.';

  const makeResult = () => {
    const structure = {
      moduleId: 'm66440',
      title: { segmentId: 'm66440:title:auto-1', text: 'Kolvetni' },
      content: [
        {
          type: 'note',
          id: 'fs-id1385935',
          class: 'visual-connection',
          title: null,
          content: [
            { type: 'para', id: 'fs-id2000117', segmentId: 'm66440:para:fs-id2000117' },
            { type: 'para', id: 'fs-id2762822', segmentId: 'm66440:para:fs-id2762822' },
          ],
        },
        // Extraction hoists the note's figure to a top-level entry.
        {
          type: 'figure',
          id: 'fig-ch03_02_02',
          caption: { segmentId: 'm66440:caption:fig-ch03_02_02-caption' },
          media: {
            id: 'fs-id1319192',
            alt: ALT,
            src: '../../media/Figure_03_02_02.png',
            mimeType: 'image/png',
          },
        },
      ],
      inlineMedia: [
        {
          placeholder: '[[MEDIA:1]]',
          id: 'fs-id1319192',
          alt: ALT,
          src: '../../media/Figure_03_02_02.png',
          mimeType: 'image/png',
        },
      ],
    };

    const segments = new Map([
      ['m66440:title:auto-1', 'Kolvetni'],
      ['m66440:para:fs-id2000117', `[[MEDIA:1]] ${CAPTION_IS}`],
      ['m66440:para:fs-id2762822', 'Hvers konar sykrur eru þetta?'],
      ['m66440:caption:fig-ch03_02_02-caption', CAPTION_IS],
    ]);

    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Kolvetni</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Carbohydrates</md:title></metadata>
<content>
<note id="fs-id1385935" class="visual-connection">
<para id="fs-id2000117">
<figure id="fig-ch03_02_02"><media id="fs-id1319192" alt="${ALT}">
<image mime-type="image/png" src="../../media/Figure_03_02_02.png" width="400"/>
</media>
<caption>Glucose, galactose, and fructose are all hexoses.</caption>
</figure></para>
<para id="fs-id2762822">What kind of sugars are these?</para>
</note>
</content>
</document>`;

    return buildCnxml(structure, segments, {}, originalCnxml, {}).cnxml;
  };

  it('leaves no <figure> holding a caption but no media', () => {
    // The exact state jing rejected: "element caption not allowed yet;
    // expected element code, label, media, subfigure, table or title".
    expect(makeResult()).not.toMatch(/<figure[^>]*>\s*<caption>/);
  });

  it('keeps the image inside its figure after document-level media dedupe', () => {
    expect(makeResult()).toMatch(/<figure[^>]*id="fig-ch03_02_02"[^>]*>\s*<media/);
  });

  it('emits the image exactly once in the whole document', () => {
    expect((makeResult().match(/Figure_03_02_02\.png/g) || []).length).toBe(1);
  });

  it('does not emit a standalone duplicate of the hoisted figure', () => {
    expect((makeResult().match(/<figure[^>]*id="fig-ch03_02_02"/g) || []).length).toBe(1);
  });
});

// ─── A2: untranslated-EN residue detection ────────────────────────
describe('buildCnxml EN-residue detection (A2)', () => {
  const enText = 'Describe the composition and properties of colloidal dispersions in water';

  const makeInputs = (isPara) => {
    const structure = {
      moduleId: 'test',
      title: { segmentId: 'test:title:auto-1', text: 'Test' },
      content: [{ type: 'para', id: 'p1', segmentId: 'test:para:p1' }],
    };
    const segments = new Map([
      ['test:title:auto-1', 'Titill'],
      ['test:para:p1', isPara],
    ]);
    const enSegments = new Map([
      ['test:title:auto-1', 'Title'],
      ['test:para:p1', enText],
    ]);
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<para id="p1">${enText}</para>
</content>
</document>`;
    return { structure, segments, enSegments, originalCnxml };
  };

  it('flags a verbatim-English paragraph and reports INCOMPLETE', () => {
    const { structure, segments, enSegments, originalCnxml } = makeInputs(enText); // IS == EN
    const result = buildCnxml(structure, segments, {}, originalCnxml, { enSegments });
    expect(result.report.residues).toContain('test:para:p1');
    expect(result.report.complete).toBe(false);
  });

  it('reports COMPLETE for a properly translated paragraph', () => {
    const is = 'Lýstu samsetningu og eiginleikum kvoðudreifna í vatni nánar tiltekið';
    const { structure, segments, enSegments, originalCnxml } = makeInputs(is);
    const result = buildCnxml(structure, segments, {}, originalCnxml, { enSegments });
    expect(result.report.residues).toEqual([]);
    expect(result.report.complete).toBe(true);
  });

  it('does not run detection when enSegments is absent (EN-fallback inject)', () => {
    const { structure, segments, originalCnxml } = makeInputs(enText);
    const result = buildCnxml(structure, segments, {}, originalCnxml, {});
    expect(result.report.residues).toEqual([]);
    expect(result.report.complete).toBe(true);
  });

  it('does not run detection when checkResidue is false (--lang en round-trip)', () => {
    // Injecting the EN source as content: segments == enSegments by construction.
    const { structure, segments, enSegments, originalCnxml } = makeInputs(enText);
    const result = buildCnxml(structure, segments, {}, originalCnxml, {
      enSegments,
      checkResidue: false,
    });
    expect(result.report.residues).toEqual([]);
    expect(result.report.complete).toBe(true);
  });
});

// ─── buildCnxml residue tolerated routing — isAllowlisted (final-review fix) ───
// Pins the branch at cnxml-inject.js buildCnxml ~line 1853: an `exact` residue
// routes to stats.tolerated when options.isAllowlisted(...) is true, else to
// stats.residues. The A2 suite above never passes isAllowlisted, so it only
// ever exercises the `else` arm — this suite exercises both.
describe('buildCnxml residue tolerated routing (isAllowlisted)', () => {
  // Genuine untranslated-EN prose — NOT language-neutral (no formula/unit/pH
  // tokens), so detectResidue() flags it `exact:true` and it reaches the
  // isAllowlisted branch rather than being demoted beforehand.
  const enText = 'Write the two half reactions here';

  const makeInputs = (isText) => {
    const structure = {
      moduleId: 'test-tolerated',
      title: { segmentId: 'test-tolerated:title:auto-1', text: 'Test' },
      content: [{ type: 'para', id: 'p1', segmentId: 'test-tolerated:para:p1' }],
    };
    const segments = new Map([
      ['test-tolerated:title:auto-1', 'Titill'],
      ['test-tolerated:para:p1', isText],
    ]);
    const enSegments = new Map([
      ['test-tolerated:title:auto-1', 'Title'],
      ['test-tolerated:para:p1', enText],
    ]);
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<para id="p1">${enText}</para>
</content>
</document>`;
    return { structure, segments, enSegments, originalCnxml };
  };

  it('routes an allowlisted exact residue to report.tolerated, not report.residues', () => {
    const { structure, segments, enSegments, originalCnxml } = makeInputs(enText); // IS == EN
    const result = buildCnxml(structure, segments, {}, originalCnxml, {
      enSegments,
      checkResidue: true,
      isAllowlisted: () => true,
    });
    expect(result.report.tolerated).toContain('test-tolerated:para:p1');
    expect(result.report.residues).not.toContain('test-tolerated:para:p1');
    expect(result.report.complete).toBe(true);
  });

  it('routes a non-allowlisted exact residue to report.residues, not report.tolerated', () => {
    const { structure, segments, enSegments, originalCnxml } = makeInputs(enText); // IS == EN
    const result = buildCnxml(structure, segments, {}, originalCnxml, {
      enSegments,
      checkResidue: true,
      isAllowlisted: () => false,
    });
    expect(result.report.residues).toContain('test-tolerated:para:p1');
    expect(result.report.tolerated).not.toContain('test-tolerated:para:p1');
    expect(result.report.complete).toBe(false);
  });
});

// ─── inject: iframe media re-emit ─────────────────────────────────

describe('inject: iframe media re-emit', () => {
  const embed = {
    id: 'm1',
    class: null,
    alt: 'diet_detective',
    embedSrc: 'https://www.openstax.org/l/diet_detective',
    width: '660',
    height: '371.4',
  };

  it('buildMediaElement re-emits an inline iframe verbatim', () => {
    const out = buildMediaElement(embed);
    expect(out).toContain('<iframe');
    expect(out).toContain('src="https://www.openstax.org/l/diet_detective"');
    expect(out).toContain('width="660"');
    expect(out).not.toContain('<image');
  });

  it('buildMedia re-emits a block iframe verbatim', () => {
    const out = buildMedia(embed);
    expect(out).toContain('<iframe');
    expect(out).toContain('src="https://www.openstax.org/l/diet_detective"');
    expect(out).not.toContain('<image');
  });
});

// ─── inject seam: [[MEDIA:n]] → <iframe> round-trip (D4) ─────────
// Proves the extract→inject seam that ~41 of biology's 51 embeds ride on:
// extractInlineText captures embedSrc from <iframe> into the inlineMediaMap,
// and reverseInlineMarkup restores [[MEDIA:N]] → <media><iframe…/></media>.

describe('inject seam: [[MEDIA:n]] → iframe round-trip (D4)', () => {
  const EMBED_SRC = 'https://www.openstax.org/l/diet_detective';

  /**
   * Run a real extract→inject round-trip on a mini CNXML fragment containing
   * an inline <media><iframe> element.  The input is a raw CNXML string (NOT a
   * hand-written placeholder), so the full pipeline chain runs:
   *   extractInlineText  →  placeholder text + inlineMediaMap
   *   (identity translation — IS text == EN text)
   *   reverseInlineMarkup →  CNXML with <iframe> restored
   */
  it('extract produces [[MEDIA:1]] placeholder + embedSrc metadata', () => {
    const cnxml = `Para text: <media id="m1" alt="diet"><iframe src="${EMBED_SRC}" width="660" height="371"/></media>.`;
    const inlineMediaMap = new Map();
    const counters = { math: 0, media: 0 };
    const extracted = extractInlineText(cnxml, new Map(), counters, inlineMediaMap);

    expect(extracted).toContain('[[MEDIA:1]]');
    expect(extracted).not.toContain('<media');
    expect(inlineMediaMap.size).toBe(1);
    const [, meta] = [...inlineMediaMap.entries()][0];
    expect(meta.embedSrc).toBe(EMBED_SRC);
    expect(meta.width).toBe('660');
    expect(meta.height).toBe('371');
  });

  it('reverseInlineMarkup restores [[MEDIA:1]] to <iframe> CNXML (no placeholder leak)', () => {
    const cnxml = `Para text: <media id="m1" alt="diet"><iframe src="${EMBED_SRC}" width="660" height="371"/></media>.`;
    const inlineMediaMap = new Map();
    const counters = { math: 0, media: 0 };
    const extracted = extractInlineText(cnxml, new Map(), counters, inlineMediaMap);

    // Convert map to array the same way extract's structure serializer does (extract:615)
    const inlineMedia = Array.from(inlineMediaMap.entries()).map(([placeholder, data]) => ({
      placeholder,
      ...data,
    }));

    // Identity translation: IS text == extracted EN text (no MT step)
    const restored = reverseInlineMarkup(extracted, {}, inlineMedia);

    expect(restored).toContain('<iframe');
    expect(restored).toContain(`src="${EMBED_SRC}"`);
    expect(restored).not.toContain('[[MEDIA:');
    expect(restored).toContain('<media');
    expect(restored).not.toContain('<image');
    // Regression guard for the exact bug this seam test caught: the iframe tag
    // must NOT be XML-escaped to &lt;iframe on its way through reverseInlineMarkup
    // (the self-closing-tag allowlist was missing `iframe`).
    expect(restored).not.toContain('&lt;iframe');
  });
});

// ─── Nested list preservation — audit #33 ────────────────────────
describe('buildExerciseDom nested list in para (audit #33)', () => {
  it('preserves a nested list when the para segment contains math', () => {
    const element = {
      type: 'exercise',
      id: 'exr-nested',
      problem: {
        content: [
          { type: 'para', id: 'p-prob', segmentId: 'm1:para:p-prob' },
          {
            type: 'list',
            id: 'list-x',
            listType: 'enumerated',
            items: [
              { id: 'it-a', segmentId: 'm1:item:it-a' },
              { id: 'it-b', segmentId: 'm1:item:it-b' },
            ],
          },
        ],
      },
    };
    const segments = new Map([
      [
        'm1:para:p-prob',
        'Spurning með <m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mn>3</m:mn></m:math>',
      ],
      ['m1:item:it-a', 'Liður (a)'],
      ['m1:item:it-b', 'Liður (b)'],
    ]);
    const getSeg = (id) => segments.get(id) ?? '';
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<content>
<exercise id="exr-nested"><problem id="prob-1">
<para id="p-prob"><list id="list-x" list-type="enumerated">
<item id="it-a">Item A original</item>
<item id="it-b">Item B original</item>
</list></para>
</problem></exercise>
</content>
</document>`;
    const result = buildExerciseDom(element, getSeg, {}, originalCnxml, {});
    expect(result).toContain('<list id="list-x"');
    expect(result).toContain('Liður (a)');
    expect(result).toContain('Liður (b)');
    expect(result).not.toContain('Item A original');
  });
});

describe('buildNoteDom nested list in para (audit #33)', () => {
  it('preserves a nested list when the para segment contains math', () => {
    const element = {
      type: 'note',
      id: 'note-nested',
      content: [
        { type: 'para', id: 'p-note', segmentId: 'm1:para:p-note' },
        {
          type: 'list',
          id: 'list-n',
          listType: 'bulleted',
          items: [{ id: 'n-a', segmentId: 'm1:item:n-a' }],
        },
      ],
    };
    const segments = new Map([
      [
        'm1:para:p-note',
        'Athugið <m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mn>9</m:mn></m:math>',
      ],
      ['m1:item:n-a', 'Liður eitt'],
    ]);
    const getSeg = (id) => segments.get(id) ?? '';
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<content>
<note id="note-nested" class="note"><para id="p-note"><list id="list-n" list-type="bulleted">
<item id="n-a">Item one original</item>
</list></para></note>
</content>
</document>`;
    const result = buildNoteDom(element, getSeg, {}, originalCnxml, {});
    expect(result).toContain('<list id="list-n"');
    expect(result).toContain('Liður eitt');
    expect(result).not.toContain('Item one original');
  });
});

describe('annotateInlineTerms — F6 MATH placeholder', () => {
  it('drops [[MATH:N]] from the EN annotation instead of lowercasing it', () => {
    const en = new Map([['s1', '{{term}}standard enthalpy of formation [[MATH:23]]{{/term}}']]);
    const is = new Map([['s1', '{{term}}staðalmyndunarvermi{{/term}}']]);
    const { segments } = annotateInlineTerms(is, en);
    const out = segments.get('s1');
    expect(out).not.toMatch(/\[\[math:/i); // no [[math:23]] or [[MATH:23]]
    expect(out).toContain('(e. standard enthalpy of formation'); // annotation still present
  });

  it('still unwraps [[sup:2]] to plain text in the annotation', () => {
    const en = new Map([['s2', '{{term}}mol[[sup:2]]{{/term}}']]);
    const is = new Map([['s2', '{{term}}mól{{/term}}']]);
    const { segments } = annotateInlineTerms(is, en);
    expect(segments.get('s2')).toContain('(e. mol2)');
  });

  // m68852: "positron (+10β or +10e)" — the +10β / +10e notation is captured as
  // [[MATH:N]] placeholders during extraction. Dropping them (old F6 behaviour)
  // collapsed the annotation to the garble "positron  or". With an `equations`
  // map supplied, the placeholders should resolve to their visible MathML text
  // instead of vanishing.
  it('resolves [[MATH:N]] to visible notation instead of dropping it (m68852 positron case)', () => {
    const en = new Map([['s3', '{{term}}positron ([[MATH:1]] or [[MATH:2]]){{/term}}']]);
    const is = new Map([['s3', '{{term}}jáeind{{/term}}']]);
    const equations = {
      'math-1': { mathml: '<m:mn>+1</m:mn><m:mn>0</m:mn>β' },
      'math-2': { mathml: '<m:mn>+1</m:mn><m:mn>0</m:mn>e' },
    };
    const { segments } = annotateInlineTerms(is, en, equations);
    const out = segments.get('s3');
    expect(out).not.toContain('[[MATH:');
    expect(out).not.toContain('( or )');
    expect(out).toContain('+10β');
    expect(out).toContain('+10e');
  });

  // F3 (Fable): the resolved MATH notation must keep its case — the annotation
  // lowercases the English prose, but ΔHf° must not become δhf°.
  it('preserves the CASE of resolved MATH notation (ΔHf° not δhf°)', () => {
    const en = new Map([['s4', '{{term}}standard enthalpy of formation [[MATH:1]]{{/term}}']]);
    const is = new Map([['s4', '{{term}}staðalmyndunarvermi{{/term}}']]);
    const equations = {
      'math-1': { mathml: '<m:mtext>Δ</m:mtext><m:mi>H</m:mi><m:mtext>f</m:mtext><m:mo>°</m:mo>' },
    };
    const { segments } = annotateInlineTerms(is, en, equations);
    const out = segments.get('s4');
    expect(out).toContain('ΔHf°'); // notation keeps its case
    expect(out).not.toContain('δhf°'); // not lowercased
    expect(out).toContain('(e. standard enthalpy of formation'); // prose still lowercased
  });
});

// ─── C2/C3: annotateInlineTerms nested-marker tolerance ───────────────
// The bracket arms' content-exclusion group could not match term text carrying a
// nested marker ([[sub:]], [[i:]], [[MATH:n]]) — causing deterministic annotation
// loss AND positional mis-pairing (a WRONG "(e. …)" attached) when only one side
// matched. annotateInlineTerms runs on RAW segment text (inner markers unresolved).

describe('annotateInlineTerms — C2/C3 nested-marker tolerance', () => {
  it('(a) both sides carry a nested [[sub:]] term — annotates the text field, id untouched', () => {
    const en = new Map([['s1', 'Ein [[term:H[[sub:2]]O|t1]] sameind']]);
    const is = new Map([['s1', 'Ein [[term:þungt H[[sub:2]]O|t1]] sameind']]);
    const { segments, annotatedCount } = annotateInlineTerms(is, en);
    const out = segments.get('s1');
    expect(annotatedCount).toBe(1);
    expect(out).toBe('Ein [[term:þungt H[[sub:2]]O (e. h2o)|t1]] sameind'); // id t1 untouched
  });

  it('(b) mis-pairing probe: EN nested + plain vs IS both-plain — NO wrong annotation', () => {
    // Pre-fix: EN pattern skips the nested H2O term, sees only "acid" → the first
    // IS term (H2O) is wrongly annotated "(e. acid)". Post-fix both sides see 2 terms.
    const en = new Map([['s2', 'A [[term:H[[sub:2]]O|t1]] molecule and an [[term:acid|t2]] here']]);
    const is = new Map([['s2', 'Ein [[term:H2O|t1]] sameind og [[term:sýra|t2]] hér']]);
    const { segments } = annotateInlineTerms(is, en);
    const out = segments.get('s2');
    expect(out).not.toContain('H2O (e. acid)'); // the wrong pairing must NOT happen
    expect(out).toContain('[[term:sýra (e. acid)|t2]]'); // acid pairs with its real IS term
    expect(out).toContain('[[term:H2O|t1]]'); // H2O left unannotated (EN "h2o" === IS, skipped)
  });

  it('(c) [[MATH:n]]-bearing EN term text is matched and its notation resolved', () => {
    const en = new Map([['s3', 'The [[term:rate [[MATH:1]]|t9]] rises']]);
    const is = new Map([['s3', 'The [[term:hraði|t9]] rises']]);
    const equations = { 'math-1': { mathml: '<m:mi>k</m:mi>' } };
    const { segments, annotatedCount } = annotateInlineTerms(is, en, equations);
    const out = segments.get('s3');
    expect(annotatedCount).toBe(1);
    expect(out).toContain('[[term:hraði (e. rate k)|t9]]'); // MATH resolved into the annotation
  });

  it('(C3 mixed dialect) EN bracket-nested + IS legacy {{term}} pair correctly', () => {
    const en = new Map([
      ['s4', 'The [[term:[[i:s]] orbitals|term-1]] and [[term:viscosity|term-2]]'],
    ]);
    const is = new Map([['s4', '{{term}}s svigrúm{{/term}} og {{term}}seigja{{/term}}']]);
    const { segments } = annotateInlineTerms(is, en);
    const out = segments.get('s4');
    expect(out).not.toContain('s svigrúm (e. viscosity)'); // the silent-wrong class B4 kills
    expect(out).toContain('{{term}}s svigrúm (e. s orbitals){{/term}}');
    expect(out).toContain('{{term}}seigja (e. viscosity){{/term}}');
  });
});

describe('stripTermMarkersToText', () => {
  const eqs = { 'math-3': { mathml: '<math><mi>x</mi></math>' } };
  // NB: extraction emits UPPERCASE [[MATH:N]]. drop-other's (?!MATH:) is
  // case-sensitive, so it preserves [[MATH:N]] and only toLowerCase() (which
  // runs after drop-other) turns it into [[math:N]] for the resolve step. A
  // lowercase [[math:N]] passed in directly would be DROPPED — so tests use
  // uppercase, matching real inputs.

  it('strips sub/sup/i/b bracket markers and lowercases (site-A default: no trim)', () => {
    expect(stripTermMarkersToText('H[[sub:2]]O [[i:Solid]]', eqs)).toBe('h2o solid');
  });
  it('resolves [[MATH:N]] AFTER lowercasing (notation keeps its own content)', () => {
    expect(stripTermMarkersToText('value [[MATH:3]]', eqs)).toBe('value x');
  });
  it('drops non-MATH placeholders (MEDIA etc.) but keeps resolved MATH', () => {
    expect(stripTermMarkersToText('a [[MEDIA:1]] [[MATH:3]]', eqs)).toBe('a  x');
  });
  it('default does NOT trim (site-A behavior) — padded input keeps edges', () => {
    expect(stripTermMarkersToText('  Foo  ', eqs)).toBe('  foo  ');
  });
  it('with { trim: true } (site-B behavior) trims after strip, before lowercase', () => {
    expect(stripTermMarkersToText('  Foo  ', eqs, { trim: true })).toBe('foo');
  });
  it('drops an unresolved MATH marker (rare)', () => {
    expect(stripTermMarkersToText('a [[MATH:9]]', eqs)).toBe('a ');
  });

  it('stripTermMarkersToText unwraps [[term:|id]]/[[fn:|id]]/[[em:|class]] keeping text', () => {
    expect(stripTermMarkersToText('[[term:Viscosity|term-1]]', {})).toBe('viscosity');
    expect(stripTermMarkersToText('[[fn:A note|fs-1]]', {})).toBe('a note');
    expect(stripTermMarkersToText('[[em:R-O-R|emphasis-one]]', {})).toBe('r-o-r');
    expect(stripTermMarkersToText('[[u:Key]]', {})).toBe('key');
    expect(stripTermMarkersToText('[[term:Plain]]', {})).toBe('plain');
  });

  it('stripTermMarkersToText still drops unknown bracket markers wholesale', () => {
    expect(stripTermMarkersToText('[[MEDIA:1]]x', {})).toBe('x');
  });
});

describe('buildCnxml glossary annotation — MATH placeholder resolution (m68852)', () => {
  // The actual m68852 garble is NOT produced by annotateInlineTerms — the offending
  // segment is a bare glossary term (m68852:glossary-term:fs-idp72108384-term =
  // "positron [[MATH:51]] or [[MATH:52]]") with no {{term}} wrapper, so
  // annotateInlineTerms' enMarkerPattern never matches it. The "(e. ...)" hint for
  // glossary terms is built separately, inline in buildCnxml's glossary block
  // (~line 1825), which has its own copy of the same F6 MATH-drop bug. This test
  // exercises that real site.
  it('resolves [[MATH:N]] in a glossary term annotation instead of dropping it', () => {
    const structure = {
      moduleId: 'm68852',
      title: { text: 'Test' },
      content: [],
      glossary: {
        items: [
          {
            id: 'fs-idp72108384',
            termSegmentId: 'm68852:glossary-term:fs-idp72108384-term',
            definitionSegmentId: 'm68852:glossary-def:fs-idp72108384-def',
          },
        ],
      },
    };
    const segments = new Map([
      ['m68852:glossary-term:fs-idp72108384-term', 'jáeind'],
      ['m68852:glossary-def:fs-idp72108384-def', 'andeind rafeindar'],
    ]);
    const enSegments = new Map([
      ['m68852:glossary-term:fs-idp72108384-term', 'positron [[MATH:51]] or [[MATH:52]]'],
    ]);
    const equations = {
      'math-51': {
        mathml: '<m:mtext>(</m:mtext><m:mn>+1</m:mn><m:mn>0</m:mn><m:mtext>β</m:mtext>',
      },
      'math-52': { mathml: '<m:mn>+1</m:mn><m:mn>0</m:mn><m:mtext>e)</m:mtext>' },
    };
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<glossary>
<definition id="fs-idp72108384">
<term>positron (β or e)</term>
<meaning id="fs-idp72108384-meaning">antiparticle to the electron</meaning>
</definition>
</glossary>
</document>`;

    const { cnxml } = buildCnxml(structure, segments, equations, originalCnxml, {
      enSegments,
      annotateEn: true,
    });

    expect(cnxml).not.toContain('[[MATH:');
    expect(cnxml).not.toContain('( or )');
    expect(cnxml).toContain('+10β');
    expect(cnxml).toContain('+10e');
  });
});

describe('reverseInlineMarkup — F5 nested emphasis over link', () => {
  const rev = (t) => reverseInlineMarkup(t, {}, [], [], null, []);

  it('resolves [[i:[[link:text|url]]]] with no residue', () => {
    const out = rev('See [[i:[[link:Handbook|http://x.org/h]]]] now');
    expect(out).toContain(
      '<emphasis effect="italics"><link url="http://x.org/h">Handbook</link></emphasis>'
    );
    expect(out).not.toContain('[[');
  });

  it('still resolves a plain [[link:text|url]]', () => {
    const out = rev('[[link:Foo|http://y.org]]');
    expect(out).toBe('<link url="http://y.org">Foo</link>');
  });

  it('resolves deeper [[b:[[i:[[link:x|u]]]]]] fully', () => {
    const out = rev('[[b:[[i:[[link:x|http://u]]]]]]');
    expect(out).not.toContain('[[');
    expect(out).toContain('<emphasis effect="bold">');
    expect(out).toContain('<link url="http://u">x</link>');
  });
});

describe('assertNoMarkerResidue — F5/F6 gate', () => {
  it('throws on a lowercased [[math:23]]', () => {
    expect(() => assertNoMarkerResidue('<para>[[math:23]]</para>', 'm00001')).toThrow(
      /marker residue/i
    );
  });
  it('throws on a surviving [[i: emphasis marker', () => {
    expect(() => assertNoMarkerResidue('<para>[[i:x]]</para>', 'm00001')).toThrow();
  });
  it('passes clean output', () => {
    expect(() => assertNoMarkerResidue('<para>hreint</para>', 'm00001')).not.toThrow();
  });
  it('passes legit nested chemistry brackets (no word: prefix)', () => {
    expect(() => assertNoMarkerResidue('<para>[[Ag(NH3)2]+]</para>', 'm00001')).not.toThrow();
  });
  it('does NOT fire on tolerated [[MATH:N]] / [[MEDIA:N]]', () => {
    expect(() =>
      assertNoMarkerResidue('<para>[[MATH:5]] [[MEDIA:2]]</para>', 'm00001')
    ).not.toThrow();
  });
  it('throws on a surviving [[TABLE:…]] (un-carved by F4)', () => {
    expect(() => assertNoMarkerResidue('<para>[[TABLE:t1]]</para>', 'm00001')).toThrow(/TABLE:t1/);
  });
});

// ─── B4: id-anchored bracket markers ──────────────────────────────

describe('reverseInlineMarkup B4 id-anchored markers', () => {
  const emptyEq = {};

  it('converts [[term:text|id]] to <term id>', () => {
    const result = reverseInlineMarkup('Þetta er [[term:seigja|term-00001]] hugtak', emptyEq);
    expect(result).toContain('<term id="term-00001">seigja</term>');
  });

  it('converts [[term:text]] (no payload) to bare <term>', () => {
    const result = reverseInlineMarkup('Þetta er [[term:seigja]] hugtak', emptyEq);
    expect(result).toContain('<term>seigja</term>');
  });

  it('recovers class from the sidecar BY ID, not by position', () => {
    const inlineAttrs = { terms: [{ class: 'no-emphasis', id: 'term-00006' }] };
    const result = reverseInlineMarkup('[[term:vatn|term-00006]]', emptyEq, [], [], inlineAttrs);
    expect(result).toContain('<term class="no-emphasis" id="term-00006">vatn</term>');
  });

  it('ANTI-CASCADE: a dropped marker does not shift downstream ids', () => {
    // Sidecar has three terms; the middle marker was dropped by the API.
    const inlineAttrs = {
      terms: [{ id: 'term-1' }, { id: 'term-2' }, { id: 'term-3' }],
    };
    const text = '[[term:fyrsta|term-1]] og þriðja [[term:þriðja|term-3]]';
    const result = reverseInlineMarkup(text, emptyEq, [], [], inlineAttrs);
    expect(result).toContain('<term id="term-1">fyrsta</term>');
    expect(result).toContain('<term id="term-3">þriðja</term>'); // NOT term-2
    expect(result).not.toContain('term-2');
  });

  it('warns but keeps the marker-carried id when the sidecar lookup misses', () => {
    const inlineAttrs = { terms: [{ id: 'term-1' }] };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = reverseInlineMarkup('[[term:orð|term-9]]', emptyEq, [], [], inlineAttrs);
    expect(result).toContain('<term id="term-9">orð</term>');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('handles nested resolved markup inside term text', () => {
    const result = reverseInlineMarkup('[[term:H[[sub:2]]O|t1]]', emptyEq);
    expect(result).toContain('<term id="t1">H<sub>2</sub>O</term>');
  });

  it('anchors the id on the LAST pipe (pipe inside text survives)', () => {
    const result = reverseInlineMarkup('[[term:a|b vensl|term-7]]', emptyEq);
    expect(result).toContain('<term id="term-7">a|b vensl</term>');
  });

  it('converts [[fn:text|id]] to <footnote id>', () => {
    const result = reverseInlineMarkup('Texti [[fn:athugasemd|fs-idp123]] hér', emptyEq);
    expect(result).toContain('<footnote id="fs-idp123">athugasemd</footnote>');
  });

  it('converts [[fn:text]] to bare <footnote>', () => {
    const result = reverseInlineMarkup('Texti [[fn:athugasemd]] hér', emptyEq);
    expect(result).toContain('<footnote>athugasemd</footnote>');
  });

  it('footnote text containing a resolved xref converts cleanly', () => {
    const result = reverseInlineMarkup('[[fn:Sjá [[xref:Mynd 5|CNX_Fig]] hér|fs-id1]]', emptyEq);
    expect(result).toContain(
      '<footnote id="fs-id1">Sjá <link target-id="CNX_Fig">Mynd 5</link> hér</footnote>'
    );
  });

  it('converts [[u:text]] to underline emphasis', () => {
    const result = reverseInlineMarkup('[[u:lykilatriði]]', emptyEq);
    expect(result).toContain('<emphasis effect="underline">lykilatriði</emphasis>');
  });

  it('converts [[em:text|class]] with the marker-carried class (RC3)', () => {
    const result = reverseInlineMarkup('[[em:R—O—R|emphasis-one]]', emptyEq);
    expect(result).toContain('<emphasis class="emphasis-one">R—O—R</emphasis>');
  });

  it('new-format segment SKIPS the positional attr block entirely', () => {
    // Sidecar entries exist, but the segment is new-format: the attr-less term
    // must NOT consume a positional slot (no id attached to it).
    const inlineAttrs = { terms: [{ id: 'term-1' }, null] };
    const text = '[[term:fyrsta|term-1]] og [[term:annað]]';
    const result = reverseInlineMarkup(text, emptyEq, [], [], inlineAttrs);
    expect(result).toContain('<term id="term-1">fyrsta</term>');
    expect(result).toContain('<term>annað</term>');
  });

  it('legacy {{term}} segments still use the positional path (unchanged)', () => {
    const inlineAttrs = { terms: [{ id: 'term-1' }] };
    const result = reverseInlineMarkup('{{term}}seigja{{/term}}', emptyEq, [], [], inlineAttrs);
    expect(result).toContain('<term id="term-1">seigja</term>');
  });

  it('hasApiMarkers recognizes the new types (no legacy false positives)', () => {
    // A bracket-era segment containing a literal *asterisk* phrase must not
    // get legacy markdown conversion applied.
    const result = reverseInlineMarkup('[[term:orð|t1]] og *stjarna*', emptyEq);
    expect(result).not.toContain('<emphasis effect="italics">stjarna</emphasis>');
  });

  it('assertNoMarkerResidue hard-fails an unconverted [[term: marker', () => {
    expect(() => assertNoMarkerResidue('<para>[[term:orð|t1]]</para>', 'm99999')).toThrow(
      /Marker residue/
    );
  });

  it('corrupted id (charset-invalid) fails LOUD, not into visible text', () => {
    // ' bad id' contains spaces → with-id regex rejects; bare fallback must NOT swallow it
    const result = reverseInlineMarkup('[[term:hugtak|bad id!]]', {});
    expect(result).toContain('[[term:'); // marker survives...
    expect(() => assertNoMarkerResidue(result, 'm99999')).toThrow(/Marker residue/); // ...and the gate catches it
  });

  it('legitimate pipe-free bare markers still convert', () => {
    const result = reverseInlineMarkup('[[term:seigja]] og [[fn:nóta]]', {});
    expect(result).toContain('<term>seigja</term>');
    expect(result).toContain('<footnote>nóta</footnote>');
  });
});

// ─── B4/C1: emphasis-wrapped term/footnote (third resolveBracketEmphasis pass) ───
// Source shape <emphasis effect="italics"><term id="X">t</term></emphasis> extracts
// to a NESTED marker [[i:[[term:t|X]]]]. The [[i:]] wrapper is only leaf-level once
// the inner [[term:]] became <term> XML in the B4 block — so without a THIRD
// resolveBracketEmphasis pass after that block, the [[i:]] survives as residue and
// assertNoMarkerResidue aborts the whole --chapter batch (the C1 blast radius).

describe('reverseInlineMarkup B4 emphasis-wrapped term/fn (C1)', () => {
  it('resolves [[i:[[term:text|id]]]] fully (italics wrapping a term)', () => {
    const result = reverseInlineMarkup('[[i:[[term:Gram positive|term-00004]]]]', {});
    expect(result).toContain(
      '<emphasis effect="italics"><term id="term-00004">Gram positive</term></emphasis>'
    );
    expect(result).not.toContain('[[');
    expect(() => assertNoMarkerResidue(result, 'm66545')).not.toThrow();
  });

  it('resolves [[b:[[fn:text|id]]]] fully (bold wrapping a footnote)', () => {
    const result = reverseInlineMarkup('[[b:[[fn:See the appendix|fs-id42]]]]', {});
    expect(result).toContain(
      '<emphasis effect="bold"><footnote id="fs-id42">See the appendix</footnote></emphasis>'
    );
    expect(result).not.toContain('[[');
    expect(() => assertNoMarkerResidue(result, 'm42215')).not.toThrow();
  });

  it('end-to-end: extract → inject round-trip of <emphasis><term> passes the residue gate', () => {
    // The real source shape from the C1 corpus census (liffraedi-2e ch22 m66545).
    const counters = { segment: 0, math: 0, equation: 0, media: 0 };
    const marker = extractInlineText(
      '<emphasis effect="italics"><term id="term-00004">Gram positive</term></emphasis>',
      new Map(),
      counters
    );
    expect(marker).toBe('[[i:[[term:Gram positive|term-00004]]]]');
    const injected = reverseInlineMarkup(marker, {});
    expect(injected).toContain(
      '<emphasis effect="italics"><term id="term-00004">Gram positive</term></emphasis>'
    );
    expect(() => assertNoMarkerResidue(injected, 'm66545')).not.toThrow();
  });
});

// ─── B4: reverseInlineMarkup positional-restore hardening (legacy path) ────

describe('reverseInlineMarkup positional-restore hardening (legacy path)', () => {
  const emptyEq = {};

  it('HARDENING: marker-count mismatch warns and attaches NOTHING (terms)', () => {
    // Sidecar expects 3 terms; the API dropped one marker → 2 survive.
    // Old behavior: term-1/term-2 attached positionally (third lost, and a
    // NON-last drop would mis-id downstream terms). New: no attrs at all.
    const inlineAttrs = {
      terms: [{ id: 'term-1' }, { id: 'term-2' }, { id: 'term-3' }],
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mismatches = [];
    const result = reverseInlineMarkup(
      '{{term}}eitt{{/term}} og {{term}}tvö{{/term}}',
      emptyEq,
      [],
      [],
      inlineAttrs,
      null,
      null,
      { segmentId: 'm1:para:x', attrMismatches: mismatches }
    );
    expect(result).toContain('<term>eitt</term>');
    expect(result).toContain('<term>tvö</term>');
    expect(result).not.toContain('term-1'); // missing attrs beat wrong attrs
    expect(mismatches).toEqual([
      { segmentId: 'm1:para:x', family: 'terms', expected: 3, found: 2 },
    ]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('matched counts attach exactly as before (zero behavior change)', () => {
    const inlineAttrs = { terms: [{ id: 'term-1' }, { class: 'no-emphasis', id: 'term-2' }] };
    const result = reverseInlineMarkup(
      '{{term}}eitt{{/term}} og {{term}}tvö{{/term}}',
      emptyEq,
      [],
      [],
      inlineAttrs
    );
    expect(result).toContain('<term id="term-1">eitt</term>');
    expect(result).toContain('<term class="no-emphasis" id="term-2">tvö</term>');
  });

  it('HARDENING applies to footnotes', () => {
    const inlineAttrs = { footnotes: [{ id: 'fn-1' }, { id: 'fn-2' }] };
    const mismatches = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = reverseInlineMarkup(
      '{{fn}}ein{{/fn}}',
      emptyEq,
      [],
      [],
      inlineAttrs,
      null,
      null,
      {
        segmentId: 's',
        attrMismatches: mismatches,
      }
    );
    expect(result).toContain('<footnote>ein</footnote>');
    expect(result).not.toContain('fn-1');
    expect(mismatches[0]).toMatchObject({ family: 'footnotes', expected: 2, found: 1 });
    warnSpy.mockRestore();
  });

  it('HARDENING applies to {= class-emphasis (converts without class on mismatch)', () => {
    const inlineAttrs = { emphases: [{ class: 'emphasis-one' }, { class: 'emphasis-one' }] };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = reverseInlineMarkup('{=eitt=}', emptyEq, [], [], inlineAttrs);
    expect(result).toContain('<emphasis>eitt</emphasis>'); // converted, no class, no residue
    expect(result).not.toContain('emphasis-one');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('new-format [[em:]] segment skips the emphases positional path (no false warning)', () => {
    // Extraction emits [[em:text|class]] AND still populates the emphases
    // sidecar; the marker carries its own class, so the vestigial sidecar
    // entries must not trigger the positional path or its mismatch warning.
    const inlineAttrs = { emphases: [{ class: 'emphasis-one' }] };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = reverseInlineMarkup('[[em:R—O—R|emphasis-one]]', {}, [], [], inlineAttrs);
    expect(result).toContain('<emphasis class="emphasis-one">R—O—R</emphasis>');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('parseCliArgs --allow-en-fallback (A2-a)', () => {
  it('parses a comma-separated module allowlist into a Set', () => {
    const r = parseCliArgs(['--chapter', '1', '--allow-en-fallback', 'm68764,m68770']);
    expect(r.enFallbackModules).toEqual(new Set(['m68764', 'm68770']));
    expect(r.allowEnFallback).toBeUndefined();
  });

  it('defaults to an empty Set when the flag is absent', () => {
    const r = parseCliArgs(['--chapter', '1']);
    expect(r.enFallbackModules).toEqual(new Set());
  });

  it('trims whitespace and ignores empty ids', () => {
    const r = parseCliArgs(['--allow-en-fallback', ' m68764 , ,m68770 ']);
    expect(r.enFallbackModules).toEqual(new Set(['m68764', 'm68770']));
  });

  it('exits when the flag is passed with no module ids (trailing bare flag)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('EXIT');
    });
    expect(() => parseCliArgs(['--chapter', '1', '--allow-en-fallback'])).toThrow('EXIT');
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits when the flag is immediately followed by another flag', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('EXIT');
    });
    expect(() => parseCliArgs(['--allow-en-fallback', '--verbose'])).toThrow('EXIT');
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe('getMathLabelResolver — cache-miss warning (C18)', () => {
  it('warns on cache-miss per-bookDir, suppresses on cache-hit, warns on different bookDir', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // C18: regression test for cache-miss warning gate. Uses synthetic fixture
    // directories to isolate the test from production glossary state and from
    // the convention that all other cnxml-inject tests are pure in-memory.
    // Creates minimal glossary with ONE known competition (two entries with
    // same English term, different Icelandic, both approved).
    const minimalGlossary = JSON.stringify({
      terms: [
        {
          english: 'test-key',
          icelandic: 'option-one',
          status: 'approved',
          source: 'test',
        },
        {
          english: 'test-key',
          icelandic: 'option-two',
          status: 'approved',
          source: 'test',
        },
      ],
    });

    // Create two temporary book directories with glossary fixtures.
    // Synthetic dirs ensure: (a) unique keys per test run → cold-cache guaranteed
    // (no pollution from production state), (b) test passes only if cache is
    // keyed per-bookDir (a boolean cache would pass identically).
    const tmpDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'c18-test-'));
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'c18-test-'));

    try {
      // Set up glossary for both temp dirs
      fs.mkdirSync(path.join(tmpDir1, 'glossary'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir2, 'glossary'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir1, 'glossary', 'glossary-unified.json'), minimalGlossary);
      fs.writeFileSync(path.join(tmpDir2, 'glossary', 'glossary-unified.json'), minimalGlossary);

      // First call with tmpDir1 → cache miss → warn
      getMathLabelResolver(tmpDir1);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Second call, same tmpDir1 → cache hit → no additional warn
      getMathLabelResolver(tmpDir1);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Third call, same tmpDir1 → cache hit → no additional warn
      getMathLabelResolver(tmpDir1);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Call with different tmpDir2 → cache miss → warn again.
      // This proves the cache is keyed per-bookDir, not a boolean.
      getMathLabelResolver(tmpDir2);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    } finally {
      // Clean up temp dirs. Use force: true so cleanup runs even if an
      // assertion fails (ensuring no orphaned tmpdir per test run).
      fs.rmSync(tmpDir1, { recursive: true, force: true });
      fs.rmSync(tmpDir2, { recursive: true, force: true });
      warnSpy.mockRestore();
    }
  });
});
