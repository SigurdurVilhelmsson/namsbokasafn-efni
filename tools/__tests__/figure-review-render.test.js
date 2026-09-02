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
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { renderCnxmlToHtml, _loadBookConfigForTest, _setBooksDirForTest } from '../cnxml-render.js';

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

const NO_SIDECAR_FIGURE =
  '<figure id="figNoSidecar"><media id="mNS" alt="x">' +
  '<image src="../../media/CNX_Test_NoSidecar.jpg" mime-type="image/jpeg"/></media>' +
  '<caption>Cap</caption></figure>';

const WITH_SIDECAR_FIGURE =
  '<figure id="figHasSidecar"><media id="mHS" alt="x">' +
  '<image src="../../media/CNX_Test_HasSidecar.jpg" mime-type="image/jpeg"/></media>' +
  '<caption>Cap</caption></figure>';

let bookDir;
beforeEach(() => {
  bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figreview-'));
  _setBooksDirForTest(bookDir);
});
afterEach(() => _setBooksDirForTest(null));

describe('data-figure-review reaches the rendered HTML only from a real sidecar', () => {
  it('a figure with NO sidecar is NOT badged — it is the plain English original, nothing to review', () => {
    const html = render(NO_SIDECAR_FIGURE);
    expect(html).not.toContain('data-figure-review');
  });

  it('a figure WITH a sidecar in an unapproved state IS badged mt-preview (positive control — proves the first assertion is not vacuous)', () => {
    writeSidecar(bookDir, 'CNX_Test_HasSidecar', {
      version: SIDECAR_VERSION,
      basename: 'CNX_Test_HasSidecar',
      state: 'mt-preview',
      renderHash: null,
      composerVersion: COMPOSER_VERSION,
      blocks: {},
    });
    const html = render(WITH_SIDECAR_FIGURE);
    expect(html).toContain('data-figure-review="mt-preview"');
  });
});
