/**
 * cnxml-render-periodic-table-fallback.test.js — the periodic-table appendix page.
 *
 * Chemistry's `book-config.json` marks one appendix module as `specialModules →
 * 'periodic-table'`; the renderer replaces its static table with a link to the
 * interactive one at `/<book>/lotukerfi`. Beside the button sits a plain-text
 * fallback link.
 *
 * In the PDFs that fallback is the only line a reader sees: vefur's print.css
 * hides the `.periodic-table-link` button, and vefur's print renderer (vefur
 * #391) rewrites the root-relative href to an absolute one without printing the
 * address. So the link's VISIBLE TEXT must be an address a reader can type —
 * `namsbokasafn.is/<book>/lotukerfi`, not the bare path `/<book>/lotukerfi`.
 * The hrefs stay root-relative: on screen that is correct on any host, and the
 * print rewrite keys on them.
 *
 * The whole-value fixture below is the committed published page's `<main>`
 * block (rendered 2026-07-21) with only that one text node changed, so it also
 * pins that the extraction into `buildPeriodicTableMain` changed nothing else.
 */

import { describe, it, expect } from 'vitest';
import { buildPeriodicTableMain } from '../cnxml-render.js';

const EXPECTED_MAIN = `<main>
<span id="fs-idm379479808" class="preserved-anchor"></span>
<div style="text-align: center; padding: 2rem;">
  <h2>Gagnavirkt lotukerfi frumefna</h2>
  <p style="font-size: 1.1rem; margin: 1.5rem 0;">
    Skoðaðu gagnavirkt lotukerfi okkar þar sem þú getur séð nákvæmar upplýsingar um öll frumefni.
  </p>
  <a href="/efnafraedi-2e/lotukerfi" class="periodic-table-link" style="display: inline-block; padding: 1rem 2rem; background-color: #0066cc; color: white; text-decoration: none; border-radius: 4px; font-size: 1.1rem; margin-top: 1rem;">
    Opna gagnavirka lotukerfið
  </a>
  <p style="margin-top: 2rem; color: #666;">
    <em>Einnig er hægt að nálgast lotukerfið beint á: <a href="/efnafraedi-2e/lotukerfi">namsbokasafn.is/efnafraedi-2e/lotukerfi</a></em>
  </p>
</div>
</main>`;

const fallbackAnchor = (html) => html.match(/<em>[^]*?<a href="([^"]*)">([^<]*)<\/a><\/em>/);

describe('periodic-table appendix: fallback link', () => {
  const html = buildPeriodicTableMain('efnafraedi-2e', ['fs-idm379479808']);

  it('shows the site address as the link text, so a printed page carries a usable address', () => {
    expect(fallbackAnchor(html)[2]).toBe('namsbokasafn.is/efnafraedi-2e/lotukerfi');
  });

  it('keeps the fallback href root-relative (vefur rewrites it for print)', () => {
    expect(fallbackAnchor(html)[1]).toBe('/efnafraedi-2e/lotukerfi');
  });

  it('keeps the button href root-relative', () => {
    expect(html).toContain('<a href="/efnafraedi-2e/lotukerfi" class="periodic-table-link"');
  });

  it('uses the book slug it is given, not a fixed one', () => {
    const other = buildPeriodicTableMain('some-book', []);
    expect(fallbackAnchor(other)[2]).toBe('namsbokasafn.is/some-book/lotukerfi');
  });

  it('emits one preserved anchor per id, so cross-references into the page still resolve', () => {
    const ids = [
      ...buildPeriodicTableMain('efnafraedi-2e', ['a1', 'b2']).matchAll(
        /<span id="([^"]+)" class="preserved-anchor"><\/span>/g
      ),
    ].map((m) => m[1]);
    expect(ids).toEqual(['a1', 'b2']);
  });

  it('matches the published page block exactly, apart from the changed link text', () => {
    expect(html).toBe(EXPECTED_MAIN);
  });
});
