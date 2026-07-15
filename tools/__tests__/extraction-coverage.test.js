import { describe, it, expect } from 'vitest';
import {
  emittedElementIds,
  parseModuleDoc,
  checkLists,
  checkDuplicateSegIds,
} from '../lib/extraction-coverage.js';

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
