/**
 * §C248, end to end: the pair the toolbar writes (markerIntegrity.wrapFor) reaches the reader's page as the
 * element, by value, in both kinds of segment. English round-trip of chemistry m68685 in memory
 * (extract → inject → render), as the spec's probe 2 (docs/superpowers/specs/2026-11-21-c248-g111-toolbar-
 * dialect-and-marker-gate-design.md §2.1). The control is the defect itself: a legacy `**Zq**` in the
 * new-format segment reaches the page raw, so the harness can see the difference it tests for.
 *
 * server/ reading tools/ is the permitted direction (CLAUDE.md, known gap E-2 is the reverse).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { extractSegments, formatSegmentsMarkdown } from '../../tools/cnxml-extract.js';
import { buildCnxml, parseSegments } from '../../tools/cnxml-inject.js';
import { renderCnxmlToHtml } from '../../tools/cnxml-render.js';

const require = createRequire(import.meta.url);
const { wrapFor } = require('../public/js/marker-integrity');
const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const BOOK = 'efnafraedi-2e';
const SRC = fs.readFileSync(
  path.join(REPO, 'books', BOOK, '01-source', 'ch02', 'm68685.cnxml'),
  'utf8'
);
const { segments, structure, equations, inlineAttrs } = extractSegments(SRC);
const idOf = (s) => s.segmentId || s.id;
const paras = segments.filter((s) => /:para:/.test(idOf(s)) && /^[A-Za-z]/.test(s.text));
const WITH = paras.find((s) => /\[\[(i|b|term|sub|sup|em|fn|u|span|sc):/.test(s.text));
const WITHOUT = paras.find((s) => !/\[\[|\{\{/.test(s.text));

/** Append `suffix` to one segment, inject and render; the rendered HTML. */
function render(seg, suffix) {
  const segs = segments.map((s) => (idOf(s) === idOf(seg) ? { ...s, text: s.text + suffix } : s));
  const built = buildCnxml(
    structure,
    parseSegments(formatSegmentsMarkdown(segs)),
    equations,
    SRC,
    {},
    inlineAttrs
  );
  const r = renderCnxmlToHtml(built.cnxml, { bookSlug: BOOK });
  return typeof r === 'string' ? r : r.html;
}

const ELEMENT = {
  bold: '<strong>Zq</strong>',
  italic: '<em>Zq</em>',
  term: '<dfn class="term">Zq</dfn>',
  underline: '<u>Zq</u>',
  sub: '<sub>Zq</sub>',
  sup: '<sup>Zq</sup>',
};

describe('the toolbar pair reaches the page as the element', () => {
  it('control: the module has both kinds of segment', () => {
    expect([Boolean(WITH), Boolean(WITHOUT)]).toEqual([true, true]);
  });

  it('control: a legacy **Zq** in the new-format segment reaches the page raw', () => {
    expect(render(WITH, ' **Zq**')).toContain('**Zq**');
  });

  for (const [label, seg] of [
    ['with a new-format marker', () => WITH],
    ['with no marker', () => WITHOUT],
  ]) {
    for (const kind of Object.keys(ELEMENT)) {
      it(`${kind}, in a segment ${label}`, () => {
        const s = seg();
        const { open, close } = wrapFor(kind, s.text);
        const html = render(s, ` ${open}Zq${close}`);
        expect(html.split(ELEMENT[kind]).length - 1).toBe(1);
      });
    }
  }
});
