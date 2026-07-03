import { describe, it, expect } from 'vitest';
import { extractSegments } from '../cnxml-extract.js';

// Minimal CNXML: a table in each of exercise/example/note (inline-referenced),
// plus a direct-section-child table and a list-item table (both standalone).
const CNXML = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Doc</title>
<content>
<section id="s1"><title>S1</title>
<para id="p-direct">Intro.</para>
<table id="t-standalone" summary="direct child"><tgroup cols="1"><tbody><row><entry>A</entry></row></tbody></tgroup></table>
<exercise id="ex1"><problem id="pr1"><para id="pp1">See data:<table id="t-ex" summary="in exercise"><tgroup cols="1"><tbody><row><entry>X</entry></row></tbody></tgroup></table></para></problem></exercise>
<example id="exa1"><para id="ea1">Ex table:<table id="t-exa" summary="in example"><tgroup cols="1"><tbody><row><entry>Y</entry></row></tbody></tgroup></table></para></example>
<note id="n1"><para id="na1">Note table:<table id="t-note" summary="in note"><tgroup cols="1"><tbody><row><entry>Z</entry></row></tbody></tgroup></table></para></note>
<list id="l1"><item><para id="la1">Item table:<table id="t-list" summary="in list"><tgroup cols="1"><tbody><row><entry>W</entry></row></tbody></tgroup></table></para></item></list>
</section>
</content>
</document>`;

function standaloneTableIds(structure) {
  const ids = [];
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.type === 'table' && n.id) ids.push(n.id);
      if (n.content) walk(n.content);
    }
  };
  walk(structure.content);
  return ids;
}

describe('extraction models inline-referenced tables once (inline ref, not standalone)', () => {
  const { structure } = extractSegments(CNXML);
  const inlineIds = (structure.inlineTables || []).map((t) => t.tableId);
  const standaloneIds = standaloneTableIds(structure);

  it('captures exercise/example/note tables as inline refs', () => {
    for (const id of ['t-ex', 't-exa', 't-note']) {
      expect(inlineIds).toContain(id);
    }
  });

  it('does NOT emit those container tables as standalone structure elements', () => {
    for (const id of ['t-ex', 't-exa', 't-note']) {
      expect(standaloneIds).not.toContain(id);
    }
  });

  it('still emits a direct-section-child table as standalone', () => {
    expect(standaloneIds).toContain('t-standalone');
    expect(inlineIds).not.toContain('t-standalone');
  });

  // Pre-existing behaviour (NOT changed by F4): a list-item table is stripped from
  // contentForSimpleElements before `lists` is extracted, so it is never inline-
  // referenced and survives only as a standalone entry. Documented here so a future
  // change to that behaviour trips this test deliberately.
  it('leaves a list-item table as standalone (pre-existing, never inline-referenced)', () => {
    expect(standaloneIds).toContain('t-list');
    expect(inlineIds).not.toContain('t-list');
  });
});
