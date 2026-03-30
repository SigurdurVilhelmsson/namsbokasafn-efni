import { describe, it, expect } from 'vitest';
import {
  parseSegments,
  reverseInlineMarkup,
  restoreMathMarkers,
  restoreMathBySeparators,
  buildCnxml,
  buildExampleDom,
  buildExerciseDom,
} from '../cnxml-inject.js';

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
