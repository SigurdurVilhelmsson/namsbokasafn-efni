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

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCnxmlToHtml } from '../../tools/cnxml-render.js';
import { loadEmbedMapping } from '../../tools/lib/embed-mapping.js';

const require = createRequire(import.meta.url);

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

/**
 * renderModule track-forwarding regression (item9/D3 task-review finding 1b)
 *
 * renderModule(book, chapter, moduleId, track='faithful') already used
 * `track` to pick which CNXML file to read (the cnxmlPath below), but the
 * options object it built for renderCnxmlToHtml omitted `track` — so the
 * live-preview route never told the renderer which track was being
 * previewed, and resolveOsEmbed's RENDER_TRACK silently fell back to
 * whatever a *previous* in-process render's track was (or the module's
 * 'mt-preview' default on a cold renderer). Fix: pass `track` through in
 * the options object.
 *
 * Seam note: renderModule() reads real on-disk CNXML from a path it
 * computes itself (not overridable via a test hook), and lazily
 * `import()`s tools/cnxml-render.js by that same absolute, PROJECT_ROOT-
 * anchored path — a *different* module-cache entry than this test file's
 * own `import { renderCnxmlToHtml } from '../../tools/cnxml-render.js'`
 * above (confirmed empirically: renderService.js is loaded via
 * `createRequire()`, native Node CJS, so its internal `import()` goes
 * through Node's real ESM loader, not vitest's; a relative `import` in
 * this file goes through vitest's own module graph instead — two disjoint
 * caches, so neither vi.mock nor cnxml-render.js's own
 * `_setBooksDirForTest`/`_getOsEmbedStatsForTest` test seams reach the
 * instance renderModule() actually uses). `fs` IS a real, single,
 * process-wide Node core module, though — `vi.spyOn(fs, ...)` mutates the
 * one object every loader shares, so it transparently intercepts fs calls
 * made from natively-`require()`d code too. This test uses that as an
 * "options capture": it fakes only the one CNXML file renderModule() reads
 * (real book 'efnafraedi-2e', a throwaway moduleId — nothing is written to
 * disk), lets every other fs call (book-config.json, embed-mapping.json)
 * hit the real repo, and inspects which exercise-sidecar path
 * resolveOsEmbed's fs.existsSync probes. That path embeds the live
 * RENDER_TRACK value, which is exactly what options.track (or its
 * omission) controls — so "the requested track's directory was probed,
 * not the stale/default one" is a direct proof that `track` reached the
 * render options through renderModule().
 */
describe('renderModule track forwarding (D3 task-review finding 1b)', () => {
  it("forwards the requested track into the render options (resolveOsEmbed probes that track's exercise sidecar dir)", async () => {
    const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const book = 'efnafraedi-2e';
    const track = 'faithful'; // non-default — RENDER_TRACK's module-load default is 'mt-preview'
    const moduleId = '__d3-track-forward-probe__';
    const cnxmlPath = path.join(
      PROJECT_ROOT,
      'books',
      book,
      '03-translated',
      track,
      'ch01',
      `${moduleId}.cnxml`
    );

    // No 'section-exercises'/'exercises' class on the section — avoids
    // efnafraedi-2e's excludedSectionClasses substring-matching it away
    // (see cnxml-render-osembed-track.test.js's own comment on this trap).
    const FAKE_CNXML =
      '<document xmlns="http://cnx.rice.edu/cnxml"><title>T</title><content>' +
      '<section id="s1"><title>Æfingar</title>' +
      '<exercise id="e1"><problem id="p1"><para id="pp1">' +
      '<link class="os-embed" url="#exercise/probe-nick"/></para></problem></exercise>' +
      '</section></content></document>';

    const realExistsSync = fs.existsSync.bind(fs);
    const realReadFileSync = fs.readFileSync.bind(fs);
    const probedPaths = [];

    const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      probedPaths.push(String(p));
      if (String(p) === cnxmlPath) return true;
      return realExistsSync(p);
    });
    const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...rest) => {
      if (String(p) === cnxmlPath) return FAKE_CNXML;
      return realReadFileSync(p, ...rest);
    });

    try {
      const renderService = require('../services/renderService.js');
      await renderService.renderModule(book, 1, moduleId, track);
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
    }

    const expectedSidecarSuffix = path.join('03-translated', track, 'exercises', 'probe-nick.json');
    const staleDefaultSuffix = path.join(
      '03-translated',
      'mt-preview',
      'exercises',
      'probe-nick.json'
    );

    expect(probedPaths.some((p) => p.endsWith(expectedSidecarSuffix))).toBe(true);
    expect(probedPaths.some((p) => p.endsWith(staleDefaultSuffix))).toBe(false);
  });
});
