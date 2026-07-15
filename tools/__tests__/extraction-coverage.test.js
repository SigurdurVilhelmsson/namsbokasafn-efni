import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  emittedElementIds,
  parseModuleDoc,
  checkLists,
  checkDuplicateSegIds,
  analyzeModule,
} from '../lib/extraction-coverage.js';

const TOOLS = path.resolve(import.meta.dirname, '..');

const doc = (contentInner) =>
  `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">` +
  `<content>${contentInner}</content></document>`;
const seg = (...ids) => ids.map((id) => `<!-- SEG:m:${id} -->\nx`).join('\n');

describe('emittedElementIds', () => {
  it('extracts the 3rd colon-component of each marker', () => {
    const ids = emittedElementIds(seg('item:L1-item-1', 'para:fs-1'));
    expect(ids.has('L1-item-1')).toBe(true);
    expect(ids.has('fs-1')).toBe(true);
  });
});

describe('checkLists', () => {
  it('R1: flags a list whose items are all dropped (0 of 4 emitted)', () => {
    const { content } = parseModuleDoc(
      doc(
        '<list id="L1"><item>monomers</item><item>polymers</item>' +
          '<item>water and polymers</item><item>none of the above</item></list>'
      )
    );
    const f = checkLists(content, emittedElementIds(seg('para:fs-stem')));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ listId: 'L1', items: 4, present: 0 });
    expect(f[0].missing).toContain('none of the above');
  });

  it('R2: flags a partial drop (3 of 4 emitted)', () => {
    const { content } = parseModuleDoc(
      doc('<list id="L1"><item>a</item><item>b</item><item>c</item><item>d</item></list>')
    );
    const f = checkLists(
      content,
      emittedElementIds(seg('item:L1-item-1', 'item:L1-item-2', 'item:L1-item-3'))
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ items: 4, present: 3 });
  });

  it('G1: passes a fully-emitted list (6 of 6) — the m68710 id-orphan case', () => {
    const { content } = parseModuleDoc(
      doc(
        '<list id="S"><item>a</item><item>b</item><item>c</item>' +
          '<item>d</item><item>e</item><item>f</item></list>'
      )
    );
    const emitted = emittedElementIds(
      seg(
        'item:S-item-1',
        'item:S-item-2',
        'item:S-item-3',
        'item:S-item-4',
        'item:S-item-5',
        'item:S-item-6'
      )
    );
    expect(checkLists(content, emitted)).toHaveLength(0);
  });

  it('G3: passes items carrying their own ids', () => {
    const { content } = parseModuleDoc(
      doc('<list id="L1"><item id="own-1">a</item><item id="own-2">b</item></list>')
    );
    expect(checkLists(content, emittedElementIds(seg('item:own-1', 'item:own-2')))).toHaveLength(0);
  });

  it('skips an id-less list (cannot compute expected id -> no false flag)', () => {
    const { content } = parseModuleDoc(doc('<list><item>a</item><item>b</item></list>'));
    expect(checkLists(content, emittedElementIds(seg()))).toHaveLength(0);
  });

  // --- container & nesting edge cases (adversarial review, wf_72c60b9a) ---

  it('does NOT flag a list nested in a table <entry> (flattened into the entry segment, no -item-N emitted)', () => {
    const { content } = parseModuleDoc(
      doc(
        '<table id="T"><tgroup><tbody><row><entry>' +
          '<list id="EL"><item>RNA</item><item>DNA</item></list>' +
          '</entry></row></tbody></tgroup></table>'
      )
    );
    // The extractor emits one entry segment (auto-N), never EL-item-*.
    expect(checkLists(content, emittedElementIds(seg('entry:auto-1')))).toHaveLength(0);
  });

  it('does NOT flag an outer item whose only content is a nested list (extractor emits null for it)', () => {
    const { content } = parseModuleDoc(
      doc(
        '<list id="L"><item>lead text</item>' +
          '<item><list id="L2"><item>inner</item></list></item></list>'
      )
    );
    // Extractor emits L-item-1 (lead text) + L2-item-1 (inner), NOT L-item-2 (text-less).
    expect(
      checkLists(content, emittedElementIds(seg('item:L-item-1', 'item:L2-item-1')))
    ).toHaveLength(0);
  });

  it('preserves item numbering across a skipped text-less item (uses full index, not emitted index)', () => {
    const { content } = parseModuleDoc(
      doc(
        '<list id="L"><item>one</item>' +
          '<item><list id="L2"><item>x</item></list></item>' +
          '<item>three</item></list>'
      )
    );
    // three is the 3rd item -> L-item-3 (index counts the skipped item2). Present => no flag.
    const emitted = emittedElementIds(seg('item:L-item-1', 'item:L-item-3', 'item:L2-item-1'));
    expect(checkLists(content, emitted)).toHaveLength(0);
  });

  it('G2: isolates a dropped list from a clean sibling list (only the dropped one flags)', () => {
    const { content } = parseModuleDoc(
      doc(
        '<list id="A"><item>a1</item><item>a2</item></list>' +
          '<list id="B"><item>b1</item><item>b2</item></list>'
      )
    );
    const f = checkLists(content, emittedElementIds(seg('item:A-item-1', 'item:A-item-2')));
    expect(f).toHaveLength(1);
    expect(f[0].listId).toBe('B');
  });

  it('orphan-immune: an item with an inner <para id> is covered by item:S-item-N, never the inner id', () => {
    const { content } = parseModuleDoc(
      doc(
        '<list id="S"><item><para id="inner-1">write</para></item>' +
          '<item><para id="inner-2">each</para></item></list>'
      )
    );
    // inner-1/inner-2 are NOT emitted (the m68710 orphan shape); item:S-item-* ARE.
    expect(
      checkLists(content, emittedElementIds(seg('item:S-item-1', 'item:S-item-2')))
    ).toHaveLength(0);
  });
});

describe('checkDuplicateSegIds', () => {
  it('flags a source id that defines two elements in <content>', () => {
    const { content } = parseModuleDoc(doc('<para id="dup">a</para><para id="dup">b</para>'));
    const r = checkDuplicateSegIds(content, '');
    expect(r.sourceDup).toEqual([{ id: 'dup', count: 2 }]);
  });

  it('flags a raw seg marker that repeats (parseSegmentsMap would dedupe it)', () => {
    const { content } = parseModuleDoc(doc('<para id="a">x</para>'));
    const segText = '<!-- SEG:m:para:a -->\nx\n<!-- SEG:m:para:a -->\ny';
    const r = checkDuplicateSegIds(content, segText);
    expect(r.rawDup).toEqual([{ segId: 'm:para:a', count: 2 }]);
  });

  it('reports nothing on a clean module', () => {
    const { content } = parseModuleDoc(doc('<para id="a">x</para>'));
    const r = checkDuplicateSegIds(content, '<!-- SEG:m:para:a -->\nx');
    expect(r.sourceDup).toHaveLength(0);
    expect(r.rawDup).toHaveLength(0);
  });
});

describe('analyzeModule', () => {
  it('aggregates list + dup findings and sets hasFindings', () => {
    const cnxml = doc('<list id="L1"><item>a</item><item>b</item></list>');
    const r = analyzeModule(cnxml, seg('para:other'));
    expect(r.listFindings).toHaveLength(1);
    expect(r.hasFindings).toBe(true);
  });

  it('hasFindings is false for a clean module', () => {
    const cnxml = doc('<list id="L1"><item>a</item></list>');
    const r = analyzeModule(cnxml, seg('item:L1-item-1'));
    expect(r.hasFindings).toBe(false);
  });
});

describe('verify-extraction-coverage CLI', () => {
  it('exits 1 and reports the dropped option lists on real m66438 (--json --chapter 3)', () => {
    let out;
    let code = 0;
    try {
      out = execFileSync(
        'node',
        [
          path.join(TOOLS, 'verify-extraction-coverage.js'),
          '--book',
          'liffraedi-2e',
          '--chapter',
          '3',
          '--json',
        ],
        { cwd: path.resolve(TOOLS, '..'), encoding: 'utf8' }
      );
    } catch (e) {
      code = e.status;
      out = e.stdout;
    }
    expect(code).toBe(1);
    const report = JSON.parse(out);
    expect(report.modules.m66438).toBeDefined();
    expect(report.modules.m66438.listFindings.length).toBeGreaterThanOrEqual(3);
  });
});
