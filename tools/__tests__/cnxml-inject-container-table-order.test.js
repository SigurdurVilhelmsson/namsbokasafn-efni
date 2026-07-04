import { describe, it, expect } from 'vitest';
import { extractSegments } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';
import { formatSegmentsMarkdown } from '../cnxml-extract.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// A <table> that is a DIRECT child of an <example>, with a para after it inside
// the example, and a top-level para after the example. Pre-fix the table is
// stripped from the example and rendered standalone AFTER the example's inner
// paras; post-fix it stays before ep2.
const CNXML = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Doc</title>
<content>
<section id="s1"><title>S1</title>
<example id="ex1"><title>Ex</title>
<para id="ep1">Before the table.</para>
<table id="tX" class="unnumbered" summary="s"><tgroup cols="1"><tbody><row><entry>a</entry></row></tbody></tgroup></table>
<para id="ep2">After the table.</para>
</example>
<para id="after">Top-level after the example.</para>
</content>
</document>`;

function build(cnxml) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  return buildCnxml(structure, parsed, equations, cnxml, {}, inlineAttrs).cnxml;
}

describe('direct-child container table keeps its in-container position (OC-B)', () => {
  const out = build(CNXML);

  it('renders the table exactly once', () => {
    expect((out.match(/<table\b[^>]*\bid="tX"/g) || []).length).toBe(1);
  });

  it('places the table before the following in-example para (ep2), not after it', () => {
    expect(out.indexOf('id="tX"')).toBeGreaterThan(-1);
    expect(out.indexOf('id="ep2"')).toBeGreaterThan(-1);
    // pre-fix: standalone tX renders after ep2 → this fails
    expect(out.indexOf('id="tX"')).toBeLessThan(out.indexOf('id="ep2"'));
  });
});

describe('m68789 renders both the inline (F4) and direct-child (OC-B) tables once each', () => {
  const src = readFileSync(
    join(
      import.meta.dirname,
      '..',
      '..',
      'books',
      'efnafraedi-2e',
      '01-source',
      'ch12',
      'm68789.cnxml'
    ),
    'utf8'
  );
  const out = build(src);
  it('inline exercise table fs-idm121830912 appears exactly once (F4 path intact)', () => {
    expect((out.match(/<table\b[^>]*\bid="fs-idm121830912"/g) || []).length).toBe(1);
  });
  it('direct-child example table fs-idm205685856 appears exactly once (OC-B path)', () => {
    expect((out.match(/<table\b[^>]*\bid="fs-idm205685856"/g) || []).length).toBe(1);
  });
});
