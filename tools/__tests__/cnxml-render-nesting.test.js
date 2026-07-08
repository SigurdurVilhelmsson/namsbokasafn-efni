/**
 * cnxml-render-nesting.test.js — container × child nesting matrix (Track C C0).
 *
 * Synthetic inline-CNXML probes asserting the structural invariant the
 * render→DOM migration must preserve: a child block element nested in a
 * container renders EXACTLY ONCE and INSIDE that container. Covers
 * {figure, media, list, table} × {example, exercise, note, section} × {xref, no-xref}.
 *
 * The `xref` variant (a sibling para cross-referencing the child by id) guards
 * the "(Mynd X.Y)"/`<link target-id>` regression where a figure escaped its
 * example because an `id="X"` substring check collided with `target-id="X"`
 * (m68700 copper — see cnxml-render.test.js).
 *
 * Formerly-known gap (Track C C4): <table> escaped example/exercise/note
 * (rendered after the container closed instead of in place). example was
 * fixed by WS5 residual b2 (renderTable dispatch + renderedTableIds dedup);
 * exercise/note were fixed by F1b (table dispatch + hoistTags entry in
 * renderSectionContent/renderNote) — see cnxml-render.js. All cells below
 * now assert the fixed (in-place, exactly-once) behavior.
 */

import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

const CHILDREN = {
  figure: {
    cnxml:
      '<figure id="CH_ID"><media id="m-f" alt="f"><image mime-type="image/jpeg" src="../../media/MARK_figure.jpg"/></media><caption>Cap</caption></figure>',
    marker: 'MARK_figure.jpg',
  },
  media: {
    cnxml:
      '<media id="CH_ID" alt="m"><image mime-type="image/jpeg" src="../../media/MARK_media.jpg"/></media>',
    marker: 'MARK_media.jpg',
  },
  list: { cnxml: '<list id="CH_ID"><item>MARK_list_item</item></list>', marker: 'MARK_list_item' },
  table: {
    cnxml:
      '<table id="CH_ID" summary="s"><tgroup cols="1"><tbody><row><entry>MARK_table_cell</entry></row></tbody></tgroup></table>',
    marker: 'MARK_table_cell',
  },
};

const xr = (x) => (x ? ' (<link target-id="CH_ID"/>)' : '');
const PARENTS = {
  example: (c, x) =>
    `<example id="P_ID"><para id="pq"><title>Q</title>Spurning${xr(x)}</para>${c}<para id="ps"><title>Lausn</title>Lausn</para></example>`,
  exercise: (c, x) =>
    `<exercise id="P_ID"><problem id="prob"><para id="pq">Sp${xr(x)}</para>${c}</problem></exercise>`,
  note: (c, x) => `<note id="P_ID"><title>Ath</title><para id="pq">Texti${xr(x)}</para>${c}</note>`,
  section: (c, x) =>
    `<section id="P_ID"><title>Kafli</title><para id="pq">Texti${xr(x)}</para>${c}</section>`,
};

// All table-escape cells (example/exercise/note) are now fixed — F1b closed
// the last two (exercise, note); example was fixed earlier (WS5 residual b2).
// Kept as an empty set (rather than deleted outright) so a future regression
// has an obvious place to re-pin a `skip`, mirroring the pattern above.
const KNOWN_ESCAPES = new Set();

function doc(inner) {
  return `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML"><title>T</title><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00001</md:content-id><md:title>T</md:title></metadata><content>${inner}</content></document>`;
}

function render(childName, parentName, withXref) {
  const child = CHILDREN[childName];
  const cnxml = doc(PARENTS[parentName](child.cnxml, withXref));
  const { html } = renderCnxmlToHtml(cnxml, { moduleId: 'm00001', chapter: 3, lang: 'is' });
  return { html, marker: child.marker };
}

/**
 * Structural containment: locate the wrapper element bearing id="P_ID" (whatever
 * HTML tag it renders as — aside/div/section), depth-match its own close tag,
 * and report whether the marker falls within that span. Robust to same-tag
 * nesting inside the wrapper (e.g. exercise's <div class="problem"> inside
 * <div class="eoc-exercise">) and to the close token appearing in page scaffolding.
 */
function isInside(html, parentId, marker) {
  const idIdx = html.indexOf(`id="${parentId}"`);
  if (idIdx === -1) return false;
  const openStart = html.lastIndexOf('<', idIdx);
  const tagMatch = html.slice(openStart).match(/^<([a-zA-Z][\w-]*)/);
  if (!tagMatch) return false;
  const tag = tagMatch[1];
  const openEnd = html.indexOf('>', idIdx) + 1;
  const openRe = new RegExp(`<${tag}\\b`, 'g');
  const closeTok = `</${tag}>`;
  let depth = 1;
  let idx = openEnd;
  while (depth > 0 && idx < html.length) {
    openRe.lastIndex = idx;
    const no = openRe.exec(html);
    const nextOpen = no ? no.index : -1;
    const nextClose = html.indexOf(closeTok, idx);
    if (nextClose === -1) return false;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      idx = nextOpen + tag.length + 1;
    } else {
      depth--;
      if (depth === 0) {
        const m = html.indexOf(marker);
        return m > openEnd && m < nextClose;
      }
      idx = nextClose + closeTok.length;
    }
  }
  return false;
}

describe('render nesting matrix: child renders once and inside its container', () => {
  for (const childName of Object.keys(CHILDREN)) {
    for (const parentName of Object.keys(PARENTS)) {
      const cell = `${childName}-in-${parentName}`;
      for (const withXref of [false, true]) {
        const label = `${cell}${withXref ? '+xref' : ''}`;
        const runner = KNOWN_ESCAPES.has(cell) ? it.skip : it;
        runner(label, () => {
          const { html, marker } = render(childName, parentName, withXref);
          // renders exactly once
          expect(html.split(marker).length - 1).toBe(1);
          // and inside the container
          expect(isInside(html, 'P_ID', marker)).toBe(true);
        });
      }
    }
  }
});
