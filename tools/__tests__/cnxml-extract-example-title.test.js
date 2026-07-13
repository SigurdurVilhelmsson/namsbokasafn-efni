import { describe, it, expect } from 'vitest';
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

// Recursively find the example element with the given id in the structure tree.
function findExample(node, id) {
  if (node && node.type === 'example' && node.id === id) return node;
  const children = Array.isArray(node) ? node : (node && node.content) || [];
  if (!Array.isArray(children)) return null;
  for (const child of children) {
    const hit = findExample(child, id);
    if (hit) return hit;
  }
  return null;
}

function roundTrip(cnxml) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  return buildCnxml(structure, parsed, equations, cnxml, {}, inlineAttrs).cnxml;
}

describe('RC4-m68860: title-only first para inside <example>', () => {
  it('keeps a title-only first para as a para element (not donated, not dropped)', () => {
    const cnxml = wrapDoc(`<example id="ex-1">
<para id="p-1"><title>Graphing the Dependence of y on x</title></para>
<para id="p-2">Body text here.</para>
</example>`);
    const { structure } = extractSegments(cnxml);
    const example = findExample(structure.content, 'ex-1');
    expect(example).toBeTruthy();
    // No example-title was fabricated from the para's title. The codebase's
    // consistent "no title" sentinel is `null` (exampleStructure init, and
    // sections/exercises/lists all follow the same convention), not `undefined`.
    expect(example.title).toBeNull();
    // The para survives with its title attached
    const para1 = example.content.find((el) => el.id === 'p-1');
    expect(para1).toBeDefined();
    expect(para1.title.text).toContain('Graphing the Dependence');
  });

  it('round-trips the title-only para back into the built CNXML', () => {
    const cnxml = wrapDoc(`<example id="ex-1">
<para id="p-1"><title>Graphing the Dependence of y on x</title></para>
<para id="p-2">Body text here.</para>
</example>`);
    const out = roundTrip(cnxml);
    expect(out).toContain('id="p-1"'); // the para is not dropped from the output
  });

  it('title+body first para keeps the existing donation behavior', () => {
    const cnxml = wrapDoc(`<example id="ex-2">
<para id="p-1"><title>Measuring Heat</title>Some body text.</para>
</example>`);
    const { structure } = extractSegments(cnxml);
    const example = findExample(structure.content, 'ex-2');
    expect(example.title.text).toBe('Measuring Heat');
    const para1 = example.content.find((el) => el.id === 'p-1');
    expect(para1.title).toBeUndefined(); // donated, stripped from the para
  });

  it('does NOT fall back to a para-nested title as the example title', () => {
    // With the only <title> living inside a title-only para, the standalone
    // fallback must not steal it (that would duplicate the heading).
    const cnxml = wrapDoc(`<example id="ex-3">
<para id="p-1"><title>Strategy</title></para>
<para id="p-2">Work through the problem.</para>
</example>`);
    const { structure } = extractSegments(cnxml);
    const example = findExample(structure.content, 'ex-3');
    // Same "no title" sentinel as above — see the note in the first test.
    expect(example.title).toBeNull();
  });

  it('M2: title-only first para blocks a LATER title+body para from donating', () => {
    // Pre-fix the donor scan `continue`d past the title-only first para and let
    // para2 donate "Solution" as the example title (a fabricated title, and para2
    // lost its step heading). The donation decision must be made at the FIRST
    // para-with-leading-title only: if it is title-only, NO para donates.
    const cnxml = wrapDoc(`<example id="ex-5">
<para id="p-1"><title>Strategy</title></para>
<para id="p-2"><title>Solution</title>Work it out.</para>
</example>`);
    const { structure } = extractSegments(cnxml);
    const example = findExample(structure.content, 'ex-5');
    expect(example.title).toBeNull(); // no fabricated title from para2
    const para1 = example.content.find((el) => el.id === 'p-1');
    const para2 = example.content.find((el) => el.id === 'p-2');
    expect(para1.title.text).toBe('Strategy'); // para1 keeps its para-title
    expect(para2.title.text).toBe('Solution'); // para2 keeps its para-title (not donated)
  });

  it('a direct <title> child still becomes the example title', () => {
    const cnxml = wrapDoc(`<example id="ex-4">
<title>Real Example Title</title>
<para id="p-1"><title>Strategy</title></para>
<para id="p-2">Body.</para>
</example>`);
    const { structure } = extractSegments(cnxml);
    const example = findExample(structure.content, 'ex-4');
    expect(example.title.text).toBe('Real Example Title');
    const para1 = example.content.find((el) => el.id === 'p-1');
    expect(para1.title.text).toBe('Strategy');
  });
});
