/**
 * figure-review-render.test.js — Task 3 review finding 2: an INTEGRATION test
 * driving the real renderCnxmlToHtml → renderFigure call chain, not just
 * figureReviewAttr fed literal strings (figure-review-attribute.test.js).
 *
 * The unit test passed while the composition was broken: readSidecar(null)
 * → effectiveState(null, ...) → 'mt-preview' → figureReviewAttr('mt-preview')
 * → attribute emitted, for EVERY figure with no sidecar at all — i.e. every
 * untranslated figure in the corpus (0 sidecars committed, 1,529 chemistry
 * figures). Only a test that walks the real chain from CNXML in to HTML out
 * can see that.
 *
 * BOTH DIRECTIONS, and the no-sidecar direction is what makes the positive
 * direction mean anything — without it, "absent" could equally mean the test
 * never rendered a figure at all.
 *
 * 🔴 FINAL-WAVE FINDING 1 — THE FIXTURE WAS THE WRONG VINTAGE, so both
 * directions passed for the wrong reason. The renderer's only input is
 * `03-translated/` — cnxml-inject's OUTPUT — where applyImageBasenameSwaps has
 * already rewritten every mapped `<image src>` to the translated variant's
 * `outputName`. A hand-written pre-inject `src` is a shape production NEVER
 * produces for a translated figure, so the test could not see that the
 * renderer was deriving the sidecar key from the POST-inject basename while
 * the writer produces the ENGLISH one.
 *
 * The fixture is therefore no longer hand-written: the post-inject CNXML is
 * produced by running the pre-inject CNXML through the REAL seam
 * (`applyImageBasenameSwaps`), against the same mapping array that is written
 * to the book dir for the renderer to read. The `_IS` suffix is never restated
 * — it comes from `DEFAULT_SUFFIX`, its owner (CLAUDE.md: an enforceable value
 * is read from the file the code reads, never copied).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { renderCnxmlToHtml, _loadBookConfigForTest, _setBooksDirForTest } from '../cnxml-render.js';
import { applyImageBasenameSwaps } from '../cnxml-inject.js';
import { DEFAULT_SUFFIX } from '../generate-image-mapping.js';

const require = createRequire(import.meta.url);
const {
  writeSidecar,
  SIDECAR_VERSION,
  COMPOSER_VERSION,
} = require('../lib/figure-text-sidecar.cjs');

_loadBookConfigForTest('efnafraedi-2e');

function doc(figureXml) {
  return (
    '<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">' +
    '<title>T</title><content>' +
    figureXml +
    '</content></document>'
  );
}

function render(figureXml) {
  return renderCnxmlToHtml(doc(figureXml), {
    lang: 'is',
    chapter: 1,
    moduleId: 'mTEST',
    moduleSections: {},
  }).html;
}

/** A figure as it exists in 01-source / 02-structure — the ENGLISH basename. */
function preInjectFigure(id, basename) {
  return (
    `<figure id="${id}"><media id="m-${id}" alt="x">` +
    `<image src="../../media/${basename}.jpg" mime-type="image/jpeg"/></media>` +
    '<caption>Cap</caption></figure>'
  );
}

/**
 * The ONE mapping array. It is both written to the book dir (what the renderer
 * reads) and passed to applyImageBasenameSwaps (what produced 03-translated),
 * so the test cannot drift from the seam it is testing.
 */
const MAPPING = [
  {
    originalImage: 'CNX_Test_Mapped',
    outputName: `CNX_Test_Mapped${DEFAULT_SUFFIX}.svg`,
    extension: '.svg',
  },
  {
    originalImage: 'CNX_Test_MappedNoSidecar',
    outputName: `CNX_Test_MappedNoSidecar${DEFAULT_SUFFIX}.svg`,
    extension: '.svg',
  },
];

let bookDir;
beforeEach(() => {
  bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figreview-'));
  fs.mkdirSync(path.join(bookDir, 'media'), { recursive: true });
  fs.writeFileSync(
    path.join(bookDir, 'media', 'image-mapping.json'),
    JSON.stringify(MAPPING, null, 2),
    'utf-8'
  );
  _setBooksDirForTest(bookDir);
});
afterEach(() => _setBooksDirForTest(null));

function sidecarFor(basename) {
  writeSidecar(bookDir, basename, {
    version: SIDECAR_VERSION,
    basename,
    state: 'mt-preview',
    renderHash: null,
    composerVersion: COMPOSER_VERSION,
    blocks: {},
  });
}

describe('data-figure-review reaches the rendered HTML only from a real sidecar', () => {
  it('a figure with NO sidecar is NOT badged — it is the plain English original, nothing to review', () => {
    const html = render(preInjectFigure('figNoSidecar', 'CNX_Test_NoSidecar'));
    expect(html).not.toContain('data-figure-review');
  });

  it('an UNMAPPED figure with a sidecar IS badged (fallback branch — no image-mapping entry, so the src basename IS the English one)', () => {
    sidecarFor('CNX_Test_Unmapped');
    const html = render(preInjectFigure('figUnmapped', 'CNX_Test_Unmapped'));
    expect(html).toContain('data-figure-review="mt-preview"');
  });
});

/**
 * 🔴 THE PRODUCTION SHAPE. Everything above renders a pre-inject `src`; nothing
 * above can see finding 1, because an unmapped figure's src basename is already
 * the English one. These render what `03-translated/` ACTUALLY holds.
 */
describe('the production shape: a figure whose src cnxml-inject already swapped', () => {
  it('🔴 a MAPPED figure (post-inject src) with an English-basename sidecar IS badged — the sidecar key must be the ENGLISH basename, not the swapped one', () => {
    const injected = applyImageBasenameSwaps(
      doc(preInjectFigure('figMapped', 'CNX_Test_Mapped')),
      MAPPING
    );
    // The seam really did rewrite the src — without this the assertion below
    // could pass by the fixture never having been swapped at all.
    expect(injected).toContain(`CNX_Test_Mapped${DEFAULT_SUFFIX}.svg`);
    expect(injected).not.toContain('CNX_Test_Mapped.jpg');

    sidecarFor('CNX_Test_Mapped'); // the writer's shape: figure-text/<ENGLISH>.is.json

    const html = renderCnxmlToHtml(injected, {
      lang: 'is',
      chapter: 1,
      moduleId: 'mTEST',
      moduleSections: {},
    }).html;
    expect(html).toContain('data-figure-review="mt-preview"');
  });

  it('a MAPPED figure with NO sidecar is still NOT badged (proves the assertion above is not just "badge everything mapped")', () => {
    const injected = applyImageBasenameSwaps(
      doc(preInjectFigure('figMappedNS', 'CNX_Test_MappedNoSidecar')),
      MAPPING
    );
    expect(injected).toContain(`CNX_Test_MappedNoSidecar${DEFAULT_SUFFIX}.svg`);

    const html = renderCnxmlToHtml(injected, {
      lang: 'is',
      chapter: 1,
      moduleId: 'mTEST',
      moduleSections: {},
    }).html;
    expect(html).not.toContain('data-figure-review');
  });
});
