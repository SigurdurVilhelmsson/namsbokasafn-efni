/**
 * A self-closing `<link document="mNNNNN"/>` — a whole-module reference with no
 * target-id — must survive extract -> inject (§C118).
 *
 * WHAT WAS BROKEN, AND IT IS AN ASYMMETRY. cnxml-extract has two link handlers:
 * one for SELF-CLOSING links and one for links WITH CONTENT. The with-content
 * handler covers both `document + target-id` AND `document` alone ("Document link
 * without target-id (links to entire module)"). The self-closing handler covered
 * only `document + target-id` and fell through on the rest. `<link document="m00029"/>`
 * therefore reached the next handler — self-closing cross-references — which requires
 * a target-id, missed there too, and was stripped. The module reference vanished with
 * no marker and no warning.
 *
 * MEASURED: organic carries 1,198 document-only links across 189 of 342 modules;
 * chemistry carries ZERO of this shape (of 1,206 links). Localised on organic ch03 by
 * tools/source-roundtrip-check.js as link 8->6, 6->5, 4->3, 2->1.
 *
 * THE DIAGNOSTIC THAT PINNED IT: m00036's para-00005 contains BOTH shapes in one
 * sentence — `<link target-id="fig-00002"/>` and `<link document="m00029"/>`. The
 * first survived as `[[xref:fig-00002]]`; the second produced no marker at all and
 * `m00029` appeared nowhere in the extracted segments. One paragraph, one handler,
 * two outcomes — which is what ruled out "the para wasn't processed".
 *
 * ⚠️ INJECT NEEDED NO CHANGE, and that was verified rather than assumed — the
 * `[[docref:doc]]` -> `<link document="$1"/>` conversion already existed. Contrast
 * the span fix in the same campaign, where the obvious two sites turned out to be
 * three; the number of sites is never safe to predict, only to measure. The corpus
 * test below is what actually settles it.
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

const extractText = (cnxml) => formatSegmentsMarkdown(extractSegments(cnxml).segments);

function roundTrip(cnxml) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  return buildCnxml(structure, parsed, equations, cnxml, {}, inlineAttrs).cnxml;
}

const countLinks = (s) => (String(s).match(/<link\b/g) || []).length;

describe('self-closing document-only link', () => {
  it('extracts to a [[docref:doc]] marker', () => {
    const md = extractText(wrapDoc('<para id="p-1">See this (<link document="m00029"/>).</para>'));
    expect(md).toContain('[[docref:m00029]]');
  });

  it('round-trips back to the self-closing element', () => {
    const out = roundTrip(wrapDoc('<para id="p-1">See this (<link document="m00029"/>).</para>'));
    expect(out).toContain('<link document="m00029"/>');
  });

  it('survives alongside a target-id link in the SAME paragraph', () => {
    // m00036's real shape — the diagnostic that isolated the defect.
    const out = roundTrip(
      wrapDoc(
        '<para id="p-1">rises (<link target-id="fig-00002"/>), due to forces (<link document="m00029"/>).</para>'
      )
    );
    expect(out).toContain('<link target-id="fig-00002"/>');
    expect(out).toContain('<link document="m00029"/>');
  });
});

describe('the shapes that already worked must keep working', () => {
  it('document + target-id, self-closing', () => {
    const out = roundTrip(
      wrapDoc('<para id="p-1">x (<link document="m00029" target-id="fig-1"/>) y</para>')
    );
    expect(out).toContain('<link document="m00029" target-id="fig-1"/>');
  });

  it('document-only WITH link text', () => {
    const out = roundTrip(
      wrapDoc('<para id="p-1">x <link document="m00029">that section</link> y</para>')
    );
    expect(out).toContain('<link document="m00029">that section</link>');
  });

  it('a plain target-id xref', () => {
    const out = roundTrip(wrapDoc('<para id="p-1">x (<link target-id="fig-00002"/>) y</para>'));
    expect(out).toContain('<link target-id="fig-00002"/>');
  });
});

describe('the real organic corpus round-trips its links', () => {
  const dir = path.join(REPO_ROOT, 'books', 'lifraen-efnafraedi', '01-source', 'ch03');
  const modules = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.cnxml')) : [];

  it('found modules to assert against', () => {
    expect(modules.length).toBeGreaterThan(0); // control: no modules => vacuous
  });

  it('the population is NON-EMPTY — ch03 really does carry document-only links', () => {
    // Without this the per-module assertion passes trivially on a corpus that has
    // none of the shape under test.
    const n = modules.reduce(
      (a, f) =>
        a +
        (fs.readFileSync(path.join(dir, f), 'utf8').match(/<link document="[^"]*"\s*\/>/g) || [])
          .length,
      0
    );
    expect(n, 'no document-only links in ch03 — the guard below is vacuous').toBeGreaterThan(0);
  });

  it.each(modules)('%s: link count survives the round-trip', (file) => {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    expect(countLinks(roundTrip(src))).toBe(countLinks(src));
  });
});
