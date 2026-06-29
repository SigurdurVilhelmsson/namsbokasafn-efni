/**
 * renderService embed-mapping integration tests (D4 final-review fix)
 *
 * The server live-preview path (renderService.js) was failing with
 * "Unresolved embed" for any module containing a PhET/YouTube iframe,
 * because renderService never loaded the book's embed-mapping.json.
 *
 * Fix: renderService now calls loadEmbedMapping(book) and passes it as
 * options.embedMap to renderCnxmlToHtml, matching the bookConfig plumbing.
 *
 * These tests exercise the integration at the renderCnxmlToHtml +
 * loadEmbedMapping level (renderService itself reads real on-disk CNXML,
 * so direct invocation would require fixture files). The logic exercised
 * is identical to what renderService now provides.
 */

import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml } from '../../tools/cnxml-render.js';
import { loadEmbedMapping } from '../../tools/lib/embed-mapping.js';

// Minimal CNXML with a biology embed whose src is in liffraedi-2e/embed-mapping.json.
// This mirrors what cnxml-inject.js emits after D4 inject changes:
//   <media alt="T_brucei"><iframe width="660" height="371" src="<embedSrc>"/></media>
const BIOLOGY_EMBED_SRC = 'https://openstax.org/l/T_brucei';

function makeCnxmlWithEmbed(embedSrc) {
  return `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Próf</title>
<content>
  <note id="n1" class="interactive">
    <para id="p1">Horfðu á myndbandið
      <media id="m1" alt="T_brucei"><iframe width="660" height="371" src="${embedSrc}"/></media>.
    </para>
  </note>
</content>
</document>`;
}

describe('renderService embed-mapping wiring (D4 final-review fix)', () => {
  // RED: without embedMap the renderer fail-louds on the unresolved /l/ src.
  // This proves the bug that existed before the fix: if renderService omits
  // embedMap (or passes {}), any embed module 500s in live preview.
  it('RED — renderCnxmlToHtml throws "Unresolved embed" when embedMap is absent (simulates broken server path)', () => {
    const cnxml = makeCnxmlWithEmbed(BIOLOGY_EMBED_SRC);
    // Pass no embedMap (what the server did before the fix).
    // The module global EMBED_MAP starts as {} for each fresh module load;
    // without options.embedMap the global stays empty → fail-loud throws.
    expect(() =>
      renderCnxmlToHtml(cnxml, {
        chapter: 1,
        moduleId: 'm00001',
        lang: 'is',
        embedMap: {},
      })
    ).toThrow(/Unresolved embed/);
  });

  // GREEN: with embedMap loaded via loadEmbedMapping('liffraedi-2e') the render
  // succeeds and emits a responsive iframe — this is exactly what renderService
  // now does after the fix (loadEmbedMapping(book) passed as options.embedMap).
  it('GREEN — renderCnxmlToHtml succeeds and emits embed-responsive iframe when embedMap is loaded from liffraedi-2e mapping', () => {
    const cnxml = makeCnxmlWithEmbed(BIOLOGY_EMBED_SRC);
    const embedMap = loadEmbedMapping('liffraedi-2e');

    // The mapping must exist and contain the entry we rely on.
    expect(Object.keys(embedMap).length).toBeGreaterThan(0);
    expect(embedMap[BIOLOGY_EMBED_SRC]).toBeDefined();
    expect(embedMap[BIOLOGY_EMBED_SRC].status).toBe('ok');

    const { html } = renderCnxmlToHtml(cnxml, {
      chapter: 1,
      moduleId: 'm00001',
      lang: 'is',
      embedMap,
    });

    // The resolved youtube.com/embed URL must appear in the output — never the /l/ redirector.
    expect(html).toContain('class="embed-responsive"');
    expect(html).toContain(embedMap[BIOLOGY_EMBED_SRC].resolved);
    expect(html).not.toContain('openstax.org/l/');
    // Fallback link is always present so the embed is accessible without JS/iframes.
    expect(html).toContain('class="embed-fallback"');
  });

  it('loadEmbedMapping returns {} for a book without a mapping file (books without embeds are unaffected)', () => {
    expect(loadEmbedMapping('__no_such_book__')).toEqual({});
  });
});
