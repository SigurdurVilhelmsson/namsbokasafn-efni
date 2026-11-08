/**
 * cnxml-render-cyl-source-keyed-corpus.test.js — H3 item 1 over chemistry's whole
 * corpus: every worked-example "Check Your Learning" heading renders the house
 * value, and nothing else on any page changes.
 *
 * Ruling: docs/decisions/2026-11-08-h3-four-form-rulings-chemistry.md.
 *
 * - The ORACLE is an @xmldom/xmldom census of the read-only 01-source: paras
 *   inside an <example> whose first child is a <title> reading "Check Your
 *   Learning" (ignoring case and a trailing full stop). The count is whatever the
 *   census finds, never a literal.
 * - Each module is rendered twice from its committed 03-translated/mt-preview
 *   CNXML, without and with its source. That tree is of mixed vintage; it serves
 *   here as real translated input to the render path, not as a reference.
 * - Assertions are keyed on the PARA ID (a para-title renders right before its
 *   para's `<p id>`), never on position or on prose (CLAUDE.md §C148/§C179).
 *   1. With the source, every census id carries the house value.
 *   2. The two renders are byte-identical once those headings are masked, so no
 *      other para-title (or anything else) changes.
 *   3. Without the source, fewer census ids carry it: the control that proves
 *      the source made the difference.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { renderCnxmlToHtml } from '../cnxml-render.js';
import { resetMathJaxIds } from '../lib/mathjax-render.js';
import { getBookRenderConfig } from '../lib/book-rendering-config.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOK = 'efnafraedi-2e';
const BOOK_DIR = path.join(REPO_ROOT, 'books', BOOK);
const HOUSE = 'Prófaðu þekkingu þína';

const isCyl = (t) => t.trim().replace(/\.$/, '').toLowerCase() === 'check your learning';

/** Census: { chapterDir, moduleId, ids[] } for every source module with a worked-example CYL para. */
function censusCylParas() {
  const out = [];
  const srcRoot = path.join(BOOK_DIR, '01-source');
  const dirs = fs.readdirSync(srcRoot).filter((d) => /^ch\d+$|^appendices$/.test(d));
  for (const chapterDir of dirs) {
    for (const file of fs.readdirSync(path.join(srcRoot, chapterDir))) {
      if (!file.endsWith('.cnxml')) continue;
      const xml = fs.readFileSync(path.join(srcRoot, chapterDir, file), 'utf-8');
      const doc = new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml');
      const ids = [];
      const paras = doc.getElementsByTagName('para');
      for (let i = 0; i < paras.length; i++) {
        const p = paras[i];
        let first = p.firstChild;
        while (first && first.nodeType === 3 && !first.data.trim()) first = first.nextSibling;
        if (!first || first.nodeName !== 'title' || !isCyl(first.textContent)) continue;
        let a = p.parentNode;
        while (a && a.nodeName !== 'example') a = a.parentNode;
        if (a) ids.push(p.getAttribute('id'));
      }
      if (ids.length) out.push({ chapterDir, moduleId: file.replace(/\.cnxml$/, ''), ids, xml });
    }
  }
  return out;
}

const headingRe = (id) =>
  new RegExp(`<p class="para-title"><strong>([^<]*)</strong></p>(\\s*<p id="${id}")`);
const titleAt = (html, id) => (html.match(headingRe(id)) || [])[1] ?? null;
const maskAt = (html, ids) =>
  ids.reduce((h, id) => h.replace(headingRe(id), '<p class="para-title">MASK</p>$2'), html);

describe('H3 item 1 over chemistry: worked-example "Check Your Learning" headings', () => {
  const bookConfig = getBookRenderConfig(BOOK);
  let modules;
  const results = [];

  beforeAll(() => {
    modules = censusCylParas();
    for (const m of modules) {
      const translated = fs.readFileSync(
        path.join(BOOK_DIR, '03-translated', 'mt-preview', m.chapterDir, `${m.moduleId}.cnxml`),
        'utf-8'
      );
      const chapter = m.chapterDir === 'appendices' ? -1 : Number(m.chapterDir.slice(2));
      const render = (extra) => {
        resetMathJaxIds();
        return renderCnxmlToHtml(translated, {
          moduleId: m.moduleId,
          chapter,
          lang: 'is',
          bookConfig,
          ...extra,
        }).html;
      };
      results.push({ ...m, without: render({}), with: render({ sourceCnxml: m.xml }) });
    }
  }, 600_000);

  it('the census finds worked-example Check Your Learning paras', () => {
    expect(modules.flatMap((m) => m.ids).length).toBeGreaterThan(0);
  });

  it('every one renders the house value when the source is given', () => {
    const wrong = results.flatMap((r) =>
      r.ids
        .filter((id) => titleAt(r.with, id) !== HOUSE)
        .map((id) => `${r.moduleId}#${id}: ${titleAt(r.with, id)}`)
    );
    expect(wrong).toEqual([]);
  });

  it('nothing else on any page changes', () => {
    const changed = results
      .filter((r) => maskAt(r.with, r.ids) !== maskAt(r.without, r.ids))
      .map((r) => r.moduleId);
    expect(changed).toEqual([]);
  });

  it('without the source, fewer of them carry the house value (control)', () => {
    const all = results.flatMap((r) => r.ids.map((id) => titleAt(r.without, id)));
    expect(all.filter((t) => t === HOUSE).length).toBeLessThan(all.length);
  });
});
