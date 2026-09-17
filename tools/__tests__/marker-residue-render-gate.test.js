import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderCnxmlToHtml, assertNoMarkerResidueHtml } from '../cnxml-render.js';

/**
 * §C145 ② — the render-side gate on emitted HTML.
 *
 * 🔴 WHAT WENT WRONG, AND WHY THE INJECT GATE IS NOT ENOUGH. ⑰'s corruption was
 * written into chemistry m68700 by an ordinary inject on 2026-09-06, committed
 * past a `green: false` fidelity manifest, and RENDERED onto a prepared reader
 * page. Nothing between inject and the reader could see it: `cnxml-render.js`
 * contained zero occurrences of `[[`, and the render's own
 * `terms: 3/3 <dfn id> carry data-en` line reported success in the same run,
 * because its denominator is the rendered `<dfn>` count — which SHRINKS with the
 * loss. Verification caught it eleven days later.
 *
 * The first test below is the red-on-broken proof and it is deliberately shaped
 * as a PAIR: the corrupt module must render to HTML that still carries the
 * marker (otherwise the gate has nothing to catch and every later assertion is
 * vacuous), and the gate must then refuse that exact HTML.
 *
 * The fixture is a minimal module carrying the corruption VERBATIM from the
 * committed corrupt copy (`66612e43d:…/ch03/m68700.cnxml`) — inlined, not read
 * from git, because CI clones at depth 1 and a history read would be vacuous
 * there. The real module was measured the same way while this was written:
 * rendered 213,137 bytes, 1 opener hit, `[[term:tala Avogadros …` in the body.
 */

/** Verbatim from the committed corrupt m68700 — the `]]` is genuinely missing. */
const CORRUPT_PARA =
  'Þessi stóra tala er grundvallarfasti þekktur sem [[term:tala Avogadros ' +
  '(<emphasis effect="italics">N<sub>A</sub> (e. avogadro’s number ' +
  '(<emphasis effect="italics">na)</emphasis>)|term-00003</emphasis> eða ' +
  'Avogadros-fastinn til heiðurs ítalska vísindamanninum Amedeo Avogadro.';

const CLEAN_PARA =
  'Þessi stóra tala er grundvallarfasti þekktur sem tala Avogadros, ' +
  'eða Avogadros-fastinn til heiðurs ítalska vísindamanninum Amedeo Avogadro.';

const doc = (inner) => `<document xmlns="http://cnx.rice.edu/cnxml">
  <title>Mól</title>
  <content><para id="para-1">${inner}</para></content>
</document>`;

const render = (inner) =>
  renderCnxmlToHtml(doc(inner), { moduleId: 'm68700', chapter: 3, lang: 'is' }).html;

describe('§C145 ② — the corruption that reached a reader page', () => {
  it('RED: the corrupt module still renders the literal marker into HTML', () => {
    expect(render(CORRUPT_PARA)).toContain('[[term:');
  });

  it('GREEN: the gate refuses that page', () => {
    expect(() => assertNoMarkerResidueHtml(render(CORRUPT_PARA), '3-1-mol.html')).toThrow(
      /Marker residue in rendered HTML/
    );
  });

  it('names the page, so the refusal is actionable', () => {
    expect(() => assertNoMarkerResidueHtml(render(CORRUPT_PARA), '/a/b/3-1-mol.html')).toThrow(
      /3-1-mol\.html/
    );
  });

  it('reports it as truncated — the shape the inject gate could not see', () => {
    expect(() => assertNoMarkerResidueHtml(render(CORRUPT_PARA), 'p.html')).toThrow(/TRUNCATED/);
  });

  it('CONTROL: the same page without the corruption passes', () => {
    expect(() => assertNoMarkerResidueHtml(render(CLEAN_PARA), 'p.html')).not.toThrow();
  });

  it('CONTROL: the clean render is a real page, not an empty string', () => {
    expect(render(CLEAN_PARA).length).toBeGreaterThan(500);
  });
});

describe('§C145 ② — a closed marker is caught too (the microbiology legacy shape)', () => {
  // Verbatim shape from committed microbiology m58805 / 5-4-thorungar.html,
  // written 2026-03-23 — 101 days BEFORE the inject gate existed, which is why
  // it is on disk and published. An empty marker body, so the gate must not
  // require content between the colon and the `]]`.
  it('refuses a page carrying [[b:]]', () => {
    expect(() =>
      assertNoMarkerResidueHtml(render('Skaðlegur þörungablómi[[b:]], sem verður'), 'p.html')
    ).toThrow(/Marker residue/);
  });

  it('shows the whole token when it survived intact', () => {
    expect(() =>
      assertNoMarkerResidueHtml(render('Skaðlegur þörungablómi[[b:]], sem'), 'p.html')
    ).toThrow(/\[\[b:\]\]/);
  });
});

describe('§C145 ② — the choke point, pinned structurally', () => {
  /**
   * An enumeration ("all seven writers call the gate") is exactly the thing this
   * repo has watched go stale twice. So the property is checked instead: this
   * file may contain only ONE `safeWrite(` call, the one inside `writeHtmlPage`.
   * An eighth page writer therefore cannot skip the gate without turning this
   * test red.
   *
   * ⚠️ Comments are stripped first, on purpose: the file documents `safeWrite()`
   * in prose in several places, and a naive count trips on the comment that
   * documents the very thing it pins.
   */
  const SRC = readFileSync(join(process.cwd(), 'tools', 'cnxml-render.js'), 'utf8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('has exactly one safeWrite( call in executable code', () => {
    expect((CODE.match(/safeWrite\(/g) || []).length).toBe(1);
  });

  it('and that call is inside writeHtmlPage', () => {
    const body = CODE.slice(CODE.indexOf('function writeHtmlPage'));
    expect(body.slice(0, body.indexOf('\n}')).includes('safeWrite(')).toBe(true);
  });

  it('CONTROL: comment-stripping did not empty the file', () => {
    expect(CODE.length).toBeGreaterThan(SRC.length / 2);
  });

  it('CONTROL: the prose mentions of safeWrite that the strip removes really exist', () => {
    expect((SRC.match(/safeWrite\(/g) || []).length).toBeGreaterThan(1);
  });

  it('every page writer funnels through the choke point', () => {
    expect((CODE.match(/writeHtmlPage\(/g) || []).length).toBe(8); // 7 writers + the definition
  });
});
