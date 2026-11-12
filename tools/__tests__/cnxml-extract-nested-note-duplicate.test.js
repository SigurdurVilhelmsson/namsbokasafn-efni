import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

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

const ids = (r) => r.segments.map((s) => s.id);
const textOf = (r, id) => r.segments.filter((s) => s.id === id).map((s) => s.text);

// Recursively find a node of the given type and id in the structure tree.
function findNode(node, type, id) {
  if (node && node.type === type && node.id === id) return node;
  const children = Array.isArray(node) ? node : (node && node.content) || [];
  if (!Array.isArray(children)) return null;
  for (const child of children) {
    const hit = findNode(child, type, id);
    if (hit) return hit;
  }
  return null;
}

const math = (n) => `<m:math><m:mn>${n}</m:mn></m:math>`;

// A: nested note para with math, then a later para with math and an id-less table entry
const fixtureA =
  wrapDoc(`<example id="ex-1"><para id="p-1"><title>Worked example</title> First body.</para>
<note id="n-1"><para id="p-2">Answer is ${math(2)} and ${math(3)}.</para></note></example>
<para id="p-3">After, ${math(4)}.</para>
<table id="t-1" summary=""><tgroup cols="1"><tbody><row><entry>Cell</entry></row></tbody></tgroup></table>`);

describe('G1.12: a nested note repeats a para the example walk already emitted', () => {
  it('A: keeps one p-2 segment and leaves later numbering unchanged', () => {
    const a = extractSegments(fixtureA);
    expect(ids(a)).toEqual([
      'unknown:title:auto-1',
      'unknown:title:s1-title',
      'unknown:example-title:ex-1-title',
      'unknown:para:p-1',
      'unknown:para:p-2',
      'unknown:para:p-3',
      'unknown:entry:auto-8',
    ]);
    expect(textOf(a, 'unknown:para:p-2')).toEqual(['Answer is [[MATH:1]] and [[MATH:2]].']);
    expect(textOf(a, 'unknown:para:p-3')).toEqual(['After, [[MATH:5]].']);
    expect(Object.keys(a.equations)).toEqual(['math-1', 'math-2', 'math-3', 'math-4', 'math-5']);
  });

  it('A: the example keeps its p-2 structure entry', () => {
    const { structure } = extractSegments(fixtureA);
    const example = findNode(structure.content, 'example', 'ex-1');
    expect(example.content).toContainEqual(
      expect.objectContaining({ type: 'para', id: 'p-2', segmentId: 'unknown:para:p-2' })
    );
  });

  it('A: the note node keeps its p-2 structure entry', () => {
    const { structure } = extractSegments(fixtureA);
    const note = findNode(structure.content, 'note', 'n-1');
    expect(note.content).toContainEqual(
      expect.objectContaining({ type: 'para', id: 'p-2', segmentId: 'unknown:para:p-2' })
    );
  });

  it('A: round trip writes both maths into <para id="p-2">', () => {
    const { segments, structure, equations, inlineAttrs } = extractSegments(fixtureA);
    const parsed = parseSegments(formatSegmentsMarkdown(segments));
    const out = buildCnxml(structure, parsed, equations, fixtureA, {}, inlineAttrs).cnxml;
    const dom = new DOMParser().parseFromString(out, 'text/xml');
    const all = dom.getElementsByTagName('*');
    let p2 = null;
    for (let i = 0; i < all.length; i++) {
      if (all[i].getAttribute('id') === 'p-2') {
        p2 = all[i];
        break;
      }
    }
    expect(p2).not.toBeNull();
    const inner = p2.getElementsByTagName('*');
    let maths = 0;
    for (let i = 0; i < inner.length; i++) if (inner[i].localName === 'math') maths++;
    expect(maths).toBe(2);
  });

  it('B: a title-only para in the nested note keeps the note para:p-9', () => {
    const b = extractSegments(
      wrapDoc(`<example id="ex-2"><para id="p-1"><title>Ex</title> Intro.</para>
<note id="n-2"><para id="p-9"><title>Only a heading</title></para><para id="p-10">Body.</para></note></example>`)
    );
    expect(ids(b)).toEqual([
      'unknown:title:auto-1',
      'unknown:title:s1-title',
      'unknown:example-title:ex-2-title',
      'unknown:para:p-1',
      'unknown:para-title:p-9-title',
      'unknown:para:p-10',
      'unknown:note-title:n-2-title',
      'unknown:para:p-9',
    ]);
  });

  it('C: inline attrs do not leak onto a later alt', () => {
    const c = extractSegments(
      wrapDoc(`<example id="ex-1"><para id="p-1"><title>T</title> Body.</para>
<note id="n-1"><para id="p-2">See <term id="t-1">flask</term>.</para><media id="med-1" alt="A flask"><image mime-type="image/png" src="f.png"/></media></note></example>`)
    );
    expect(c.inlineAttrs).toEqual({ 'unknown:para:p-2': { terms: [{ id: 't-1' }] } });
    expect(c.inlineAttrs['unknown:alt:med-1-alt']).toBeUndefined();
  });

  it('D: a titled nested para keeps its text once and its title once', () => {
    const d = extractSegments(
      wrapDoc(`<example id="ex-1"><para id="p-1"><title>Ex</title> Intro.</para>
<note id="n-1"><para id="p-2"><title>Answer</title> The answer.</para></note></example>`)
    );
    expect(textOf(d, 'unknown:para:p-2')).toEqual(['The answer.']);
    expect(textOf(d, 'unknown:para-title:p-2-title')).toEqual(['Answer']);
  });

  it('E: two sibling notes holding p-2 and p-3 emit each once', () => {
    const e = extractSegments(
      wrapDoc(`<example id="ex-1"><para id="p-1"><title>T</title> Body.</para>
<note id="n-1"><para id="p-2">Two.</para></note><note id="n-2"><para id="p-3">Three.</para></note></example>`)
    );
    expect(ids(e).slice(-3)).toEqual(['unknown:para:p-1', 'unknown:para:p-2', 'unknown:para:p-3']);
    expect(ids(e).filter((i) => i === 'unknown:para:p-2')).toHaveLength(1);
    expect(ids(e).filter((i) => i === 'unknown:para:p-3')).toHaveLength(1);
  });

  it('F: a blank para does not claim its id', () => {
    const f = extractSegments(
      wrapDoc(`<example id="ex-1"><para id="p-1"><title>T</title> Body.</para>
<note id="n-1"><para id="p-2"> </para><para id="p-3">Real.</para></note></example>
<table id="t-1" summary=""><tgroup cols="1"><tbody><row><entry>Cell</entry></row></tbody></tgroup></table>`)
    );
    expect(ids(f).filter((i) => i === 'unknown:para:p-3')).toHaveLength(1);
    expect(ids(f)).toEqual([
      'unknown:title:auto-1',
      'unknown:title:s1-title',
      'unknown:example-title:ex-1-title',
      'unknown:para:p-1',
      'unknown:para:p-3',
      'unknown:entry:auto-7',
    ]);
  });

  it('G: an id-less para in the nested note is still emitted twice', () => {
    const g = extractSegments(
      wrapDoc(`<example id="ex-1"><para id="p-1"><title>T</title> Body.</para>
<note id="n-1"><para>No id.</para></note></example>`)
    );
    expect(ids(g)).toContain('unknown:para:auto-5');
    expect(ids(g)).toContain('unknown:para:auto-6');
  });

  it('H: a top-level note para is emitted once', () => {
    const h = extractSegments(wrapDoc(`<note id="n-9"><para id="p-8">Standalone.</para></note>`));
    expect(ids(h).filter((i) => i === 'unknown:para:p-8')).toHaveLength(1);
  });
});
