import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

/**
 * §C4 — a para whose only content is a title and blocks holding further paras
 * (chemistry m68710's "Solution" para around a stepwise list) is extracted by a
 * non-greedy match that stops at the FIRST inner `</para>`. Its segment therefore
 * carries the first inner para's text, and that inner para gets no segment.
 *
 * The text is DONATED, not dropped, so every count reconciles. What readers saw
 * was the translation written into the OUTER para (a duplicate line above the
 * list) and the inner para left in English (step 1). The extract traversal is
 * frozen (renumbering seg-ids breaks the corpus join key), so the inject side
 * writes the donated text back where it came from.
 *
 * The method is a sentinel keyed on ids: the outer segment's text is replaced
 * with a token, and after inject the token must be the WHOLE text of the first
 * inner para, must appear nowhere else, and the outer para must carry no text of
 * its own. Shapes are found from `01-source`, never from translated strings.
 */

const SOURCE = join(process.cwd(), 'books/efnafraedi-2e/01-source');
const BLOCKS = new Set(['title', 'list', 'equation', 'figure', 'table', 'note', 'media']);
const parse = (xml) => new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.cnxml')) out.push(p);
  }
  return out;
}

/** Text a para holds directly: its text nodes and non-block children. */
function ownText(para) {
  return Array.from(para.childNodes)
    .filter((c) => c.nodeType === 3 || (c.nodeType === 1 && !BLOCKS.has(c.localName)))
    .map((c) => c.textContent)
    .join('')
    .trim();
}

const byId = (doc, id) =>
  Array.from(doc.getElementsByTagName('para')).find((p) => p.getAttribute('id') === id);

describe('§C4 — a donated nested-para segment lands in the para it came from', () => {
  const cases = [];
  for (const file of walk(SOURCE).sort()) {
    const src = readFileSync(file, 'utf8');
    if (!/<para\b[^>]*>(?:(?!<\/para>)[\s\S])*<para\b/.test(src)) continue;
    const { segments, structure, equations, inlineAttrs } = extractSegments(src);
    const segIds = new Set(segments.map((s) => String(s.id).split(':').pop()));
    for (const outer of Array.from(parse(src).getElementsByTagName('para'))) {
      const inner = outer.getElementsByTagName('para')[0];
      const outerId = outer.getAttribute('id');
      if (!inner || ownText(outer) || !segIds.has(outerId)) continue;
      if (segIds.has(inner.getAttribute('id'))) continue;
      const token = `ZQX-C4-${cases.length}-ZQX`;
      const edited = segments.map((s) =>
        String(s.id).endsWith(`:${outerId}`) ? { ...s, text: token } : s
      );
      const out = buildCnxml(
        structure,
        parseSegments(formatSegmentsMarkdown(edited)),
        equations,
        src,
        {},
        inlineAttrs
      ).cnxml;
      const doc = parse(out);
      cases.push({
        where: `${basename(file, '.cnxml')} ${outerId} → ${inner.getAttribute('id')}`,
        innerText: byId(doc, inner.getAttribute('id'))?.textContent.trim() ?? 'MISSING',
        outerOwn: byId(doc, outerId) ? ownText(byId(doc, outerId)) : 'MISSING',
        tokenCount: out.split(token).length - 1,
        token,
      });
    }
  }

  it('the corpus has the shape (control)', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it('the donated text is the whole of the inner para, once, and the outer para holds none', () => {
    const bad = cases
      .filter((c) => c.innerText !== c.token || c.outerOwn !== '' || c.tokenCount !== 1)
      .map(
        (c) =>
          `${c.where}: inner=${JSON.stringify(c.innerText.slice(0, 60))} outer=${JSON.stringify(c.outerOwn.slice(0, 60))} ×${c.tokenCount}`
      );
    expect(bad).toEqual([]);
  });
});
