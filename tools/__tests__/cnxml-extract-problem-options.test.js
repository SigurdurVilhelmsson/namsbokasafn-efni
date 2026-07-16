import { describe, it, expect } from 'vitest';
import { extractSegments } from '../cnxml-extract.js';

// BIO-EX3 (campaign item 6b·f): processExercise extracted only <para> from each
// <problem> and silently dropped the enumerated <list> of multiple-choice answer
// options that is a SIBLING of the question <para>. The options never reached the
// segment corpus, so the Icelandic reader saw a question stem with no choices.
// Live shape reproduced from books/liffraedi-2e/01-source/ch03/m66438.cnxml.

const wrapDoc = (
  inner
) => `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Doc</title>
<content>
<section id="s1"><title>S1</title>
${inner}
</section>
</content>
</document>`;

const MC = wrapDoc(`<exercise id="ex-mc">
<problem id="prob-1">
<para id="q-1">Dehydration synthesis leads to formation of</para>
<list id="opts-1" list-type="enumerated" number-style="lower-alpha">
<item>monomers</item>
<item>polymers</item>
<item>water and polymers</item>
<item>none of the above</item>
</list>
</problem>
</exercise>`);

describe('processExercise multiple-choice options (BIO-EX3 / 6b·f)', () => {
  it('extracts each enumerated answer option as a segment', () => {
    const { segments } = extractSegments(MC);
    const texts = segments.map((s) => s.text);
    expect(texts).toContain('monomers');
    expect(texts).toContain('polymers');
    expect(texts).toContain('water and polymers');
    expect(texts).toContain('none of the above');
  });

  it('keeps the question stem, then its options, in document order', () => {
    const { segments } = extractSegments(MC);
    const flow = segments
      .filter((s) => s.type === 'problem' || s.type === 'item')
      .map((s) => s.text);
    expect(flow).toEqual([
      'Dehydration synthesis leads to formation of',
      'monomers',
      'polymers',
      'water and polymers',
      'none of the above',
    ]);
  });

  it('synthesizes a stable list-item seg-id for each id-less option', () => {
    const { segments } = extractSegments(MC);
    const items = segments.filter((s) => s.type === 'item');
    // id-less <item> gets `${list.id}-item-N` (mirrors processList / the 6b gate)
    // module id is 'unknown' in this fixture (no <document> module id); the
    // load-bearing part is the synthesized `opts-1-item-N` suffix.
    expect(items.map((s) => s.id)).toEqual([
      'unknown:item:opts-1-item-1',
      'unknown:item:opts-1-item-2',
      'unknown:item:opts-1-item-3',
      'unknown:item:opts-1-item-4',
    ]);
  });

  it('preserves document order when a list is interleaved between paras (m66501 shape)', () => {
    const cnxml = wrapDoc(`<exercise id="ex-il">
<problem id="prob-il">
<para id="p-a">First stem</para>
<para id="p-b">Second stem</para>
<list id="l-1" list-type="enumerated"><item>alpha</item><item>beta</item></list>
<para id="p-c">Third stem</para>
<list id="l-2" list-type="enumerated"><item>gamma</item></list>
</problem>
</exercise>`);
    const { segments } = extractSegments(cnxml);
    const flow = segments
      .filter((s) => s.type === 'problem' || s.type === 'item')
      .map((s) => s.text);
    expect(flow).toEqual(['First stem', 'Second stem', 'alpha', 'beta', 'Third stem', 'gamma']);
  });

  it('leaves a list-free problem unchanged (chemistry-safety: no extra segments, same order)', () => {
    // Every chemistry exercise is free-response prose. With no <list>, the walk must
    // yield exactly the paras it always did — the guarantee that the fix cannot
    // renumber the frozen chemistry corpus.
    const cnxml = wrapDoc(`<exercise id="ex-fr">
<problem id="prob-fr">
<para id="p-1">A free-response question.</para>
<para id="p-2">With a second paragraph.</para>
</problem>
</exercise>`);
    const { segments } = extractSegments(cnxml);
    const problem = segments.filter((s) => s.type === 'problem' || s.type === 'item');
    expect(problem.map((s) => ({ type: s.type, text: s.text }))).toEqual([
      { type: 'problem', text: 'A free-response question.' },
      { type: 'problem', text: 'With a second paragraph.' },
    ]);
  });
});
