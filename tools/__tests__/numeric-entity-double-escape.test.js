/**
 * A NUMERIC character reference must not be double-escaped on inject (§C118).
 *
 * WHAT WAS BROKEN. `reverseInlineMarkup` escapes stray ampersands with
 *   result.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;')
 * whose negative lookahead enumerates the five NAMED XML entities and nothing else.
 * A numeric character reference — `&#8201;` (thin space) or `&#x2009;` — is not on
 * that list, so its `&` was escaped and `&#8201;` became `&amp;#8201;`.
 *
 * 🔴 IT IS READER-VISIBLE, which is what makes it worse than the id-level findings
 * in the same campaign. Measured on organic m00038 by rendering both ways:
 *   rendered from SOURCE   : 28 thin spaces, 0 literal entity text
 *   rendered via PIPELINE  : 0 thin spaces, 28 literal "&#8201;"
 * so the published page would print `H&#8201;⟷&#8201;H` where it should read
 * `H ⟷ H`. Exposure: 627 numeric references across 89 of 342 organic modules
 * (406 decimal + 221 hex); chemistry has 12, in one module.
 *
 * ⚠️ THE BUG IS AN ENUMERATION, so the fix must not be another one. It would be easy
 * to add `#8201;` and move on; the corpus carries 221 HEX references too, and the next
 * OpenStax module can use any code point at all. The lookahead therefore matches the
 * numeric FORMS (`&#\d+;` and `&#x[0-9a-fA-F]+;`), not any particular character.
 *
 * ⚠️ AND THE ESCAPE ITSELF MUST STAY. A bare `&` in translated prose still has to
 * become `&amp;` or the output is not well-formed XML — see the last test here, which
 * is the reason this is a lookahead rather than a deletion.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

function roundTrip(cnxml) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  return buildCnxml(structure, parsed, equations, cnxml, {}, inlineAttrs).cnxml;
}

describe('numeric character references survive inject', () => {
  it('a decimal reference is not double-escaped', () => {
    const out = roundTrip(wrapDoc('<para id="p-1">H&#8201;x&#8201;H</para>'));
    expect(out).not.toContain('&amp;#8201;');
    expect(out).toContain('&#8201;');
  });

  it('a hex reference is not double-escaped', () => {
    const out = roundTrip(wrapDoc('<para id="p-1">H&#x2009;x&#x2009;H</para>'));
    expect(out).not.toContain('&amp;#x2009;');
    expect(out).toContain('&#x2009;');
  });

  it('the five named entities still pass through untouched', () => {
    const out = roundTrip(wrapDoc('<para id="p-1">a &amp; b &lt; c &gt; d</para>'));
    expect(out).not.toContain('&amp;amp;');
    expect(out).not.toContain('&amp;lt;');
    expect(out).not.toContain('&amp;gt;');
  });

  it('a BARE ampersand is still escaped — the guard must not be removed', () => {
    // The reason this is a lookahead and not a deletion. Without the escape the
    // output is not well-formed XML.
    const out = roundTrip(wrapDoc('<para id="p-1">Smith &  Jones</para>'));
    expect(out).toContain('&amp;');
  });

  it('an ampersand followed by a non-entity word is still escaped', () => {
    const out = roundTrip(wrapDoc('<para id="p-1">AT&Tish</para>'));
    expect(out).toContain('AT&amp;Tish');
  });
});

describe('the real organic corpus keeps its numeric references', () => {
  const dir = path.join(REPO_ROOT, 'books', 'lifraen-efnafraedi', '01-source', 'ch03');
  const modules = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.cnxml')) : [];
  const countNumeric = (s) => (String(s).match(/&#(?:x[0-9a-fA-F]+|\d+);/g) || []).length;

  it('found modules to assert against', () => {
    expect(modules.length).toBeGreaterThan(0); // control: no modules => vacuous
  });

  it('the population is NON-EMPTY — ch03 really does carry numeric references', () => {
    const n = modules.reduce(
      (a, f) => a + countNumeric(fs.readFileSync(path.join(dir, f), 'utf8')),
      0
    );
    expect(n, 'no numeric references in ch03 — the guard below is vacuous').toBeGreaterThan(0);
  });

  it.each(modules)('%s: numeric references are neither lost nor double-escaped', (file) => {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const out = roundTrip(src);
    expect(countNumeric(out)).toBe(countNumeric(src));
    expect(out).not.toMatch(/&amp;#(?:x[0-9a-fA-F]+|\d+);/);
  });
});
