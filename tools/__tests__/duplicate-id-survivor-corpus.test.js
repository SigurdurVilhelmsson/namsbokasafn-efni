import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';
import { renderCnxmlToHtml } from '../cnxml-render.js';
import { renderEnglishRoundTrip } from '../render-oracle-check.js';

/**
 * G1.12 (spec §5.2, §5.4, §7 items 3-4) — does the FIRST Icelandic copy of a repeated segment id
 * reach the injected CNXML and the rendered page, on the real chemistry files?
 *
 * The population is every chemistry module whose committed `02-mt-output` Icelandic file holds an
 * id more than once (the nested-note paragraphs the old extractor emitted twice; the bought MT
 * still holds both copies). Each repeated id gets a planted body, FIRST on occurrence 0 and LAST
 * on occurrence 1, plus one non-repeated `para` per module as the reach control. Values are
 * compared WHOLE, at the element keyed by id, on both sides (CLAUDE.md § alt/caption sentinels).
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOK = 'efnafraedi-2e';
const BOOK_DIR = join(REPO, 'books', BOOK);

// Measured pin, not a ceiling: spec §3 (ledger Ruling 4) — 285 ids in 83 modules.
const PINNED_IDS = 285;
const PINNED_MODULES = 83;

const MARKER = /<!--\s*SEG:([^\s]+?)\s*-->/g;
const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** Split a segment file into [{id, body}] in file order. */
function records(text) {
  const ms = [...text.matchAll(MARKER)];
  return ms.map((m, i) => ({
    id: m[1],
    body: text.slice(m.index + m[0].length, i + 1 < ms.length ? ms[i + 1].index : text.length),
  }));
}

function population() {
  const mods = [];
  const mtRoot = join(BOOK_DIR, '02-mt-output');
  for (const chDir of readdirSync(mtRoot).sort()) {
    for (const f of readdirSync(join(mtRoot, chDir)).sort()) {
      const m = f.match(/^(m\d+)-segments\.is\.md$/);
      if (!m) continue;
      const text = readFileSync(join(mtRoot, chDir, f), 'utf8');
      const recs = records(text);
      const seen = new Map();
      for (const r of recs) seen.set(r.id, (seen.get(r.id) || 0) + 1);
      const repeated = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
      if (repeated.length) mods.push({ chDir, moduleId: m[1], text, recs, repeated });
    }
  }
  return mods;
}

const MODS = population();

/** Plant FIRST/LAST on repeated ids and CTRL on one non-repeated para. */
function plant(mod) {
  const rep = new Set(mod.repeated);
  const n = new Map(); // id -> occurrence counter
  const first = {};
  const ctrl = {};
  const src = readFileSync(join(BOOK_DIR, '01-source', mod.chDir, `${mod.moduleId}.cnxml`), 'utf8');
  const ctrlRec = mod.recs.find(
    (r) =>
      !rep.has(r.id) &&
      r.id.split(':')[1] === 'para' &&
      src.includes(`<para id="${r.id.split(':').slice(2).join(':')}"`)
  );
  let k = 0;
  const parts = mod.recs.map((r) => {
    let body = r.body;
    if (rep.has(r.id)) {
      const occ = n.get(r.id) || 0;
      n.set(r.id, occ + 1);
      if (occ === 0) {
        first[r.id] = `G112FIRST${++k}`;
        body = `\n${first[r.id]}\n\n`;
      } else if (occ === 1) {
        body = `\n${first[r.id].replace('FIRST', 'LAST')}\n\n`;
      } else {
        body = `\nG112LATER\n\n`;
      }
    } else if (r === ctrlRec) {
      ctrl[r.id] = `G112CTRL${++k}`;
      body = `\n${ctrl[r.id]}\n\n`;
    }
    return `<!-- SEG:${r.id} -->${body}`;
  });
  return { text: parts.join(''), first, ctrl, src };
}

const parseXml = (s, mime) => new DOMParser({ onError: () => {} }).parseFromString(s, mime);

function elementsById(doc, id) {
  const out = [];
  const walk = (n) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1) {
        if (c.getAttribute('id') === id) out.push(c);
        walk(c);
      }
    }
  };
  walk(doc.documentElement);
  return out;
}

// A `<para>` may hold block children the segment text does not own (a nested `<equation>`, m68808's
// fs-idm119337184), which the injector preserves in place. The para's OWN value is its text with
// those children left out; it is still compared whole.
const BLOCK_CHILDREN = new Set([
  'equation',
  'figure',
  'media',
  'table',
  'list',
  'note',
  'example',
  'exercise',
]);
function ownText(el) {
  let out = '';
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 3) out += c.data;
    else if (c.nodeType === 1 && !BLOCK_CHILDREN.has(c.nodeName)) out += ownText(c);
  }
  return out;
}

const elementId = (segId) => segId.split(':').slice(2).join(':');

describe('G1.12 survivor rule on the real chemistry corpus', () => {
  it('the population is the 285 ids in 83 modules the frozen list names', () => {
    const ids = MODS.reduce((a, m) => a + m.repeated.length, 0);
    expect({ modules: MODS.length, ids }).toEqual({ modules: PINNED_MODULES, ids: PINNED_IDS });
    const frozen = JSON.parse(readFileSync(join(BOOK_DIR, 'g112-unserved-copies.json'), 'utf8'));
    const want = frozen.entries.map((e) => `${e.moduleId}|${e.segmentId}`).sort();
    const got = MODS.flatMap((m) => m.repeated.map((id) => `${m.moduleId}|${id}`)).sort();
    expect(got).toEqual(want);
  });

  it('inject and render carry the first copy, never the second', { timeout: 90000 }, () => {
    const bad = [];
    let checkedFirst = 0;
    let checkedCtrl = 0;
    let lastSeen = 0;
    for (const mod of MODS) {
      const { text, first, ctrl, src } = plant(mod);
      const stDir = join(BOOK_DIR, '02-structure', mod.chDir);
      const structure = JSON.parse(
        readFileSync(join(stDir, `${mod.moduleId}-structure.json`), 'utf8')
      );
      const eqp = join(stDir, `${mod.moduleId}-equations.json`);
      const equations = existsSync(eqp) ? JSON.parse(readFileSync(eqp, 'utf8')) : {};
      const iap = join(stDir, `${mod.moduleId}-inline-attrs.json`);
      const inlineAttrs = existsSync(iap) ? JSON.parse(readFileSync(iap, 'utf8')) : {};

      const { cnxml } = buildCnxml(structure, parseSegments(text), equations, src, {}, inlineAttrs);
      const html = renderCnxmlToHtml(cnxml, { bookSlug: BOOK }).html;
      if (/G112LAST/.test(cnxml)) lastSeen++;
      if (/G112LAST/.test(html)) lastSeen++;
      const cDoc = parseXml(cnxml, 'text/xml');
      const hDoc = parseXml(html, 'text/html');
      for (const [segId, token] of [...Object.entries(first), ...Object.entries(ctrl)]) {
        const id = elementId(segId);
        for (const [side, doc] of [
          ['cnxml', cDoc],
          ['html', hDoc],
        ]) {
          const els = elementsById(doc, id);
          const vals = els.map((e) => norm(ownText(e)));
          if (vals.length !== 1 || vals[0] !== token) {
            bad.push(`${mod.moduleId} ${side} ${id}: want ${token}, got ${JSON.stringify(vals)}`);
          }
        }
        if (segId in first) checkedFirst++;
        else checkedCtrl++;
      }
    }
    expect(bad).toEqual([]);
    expect(lastSeen).toBe(0);
    expect(checkedFirst).toBe(PINNED_IDS);
    expect(checkedCtrl).toBe(PINNED_MODULES);
  });

  it(
    'controlled render pair: direct render of 01-source equals the English round trip at all 285 ids',
    { timeout: 90000 },
    () => {
      const bad = [];
      let compared = 0;
      for (const mod of MODS) {
        const src = readFileSync(
          join(BOOK_DIR, '01-source', mod.chDir, `${mod.moduleId}.cnxml`),
          'utf8'
        );
        const direct = parseXml(renderCnxmlToHtml(src, { bookSlug: BOOK }).html, 'text/html');
        const trip = parseXml(renderEnglishRoundTrip(src, BOOK).html, 'text/html');
        for (const segId of mod.repeated) {
          const id = elementId(segId);
          const d = elementsById(direct, id).map((e) => norm(e.textContent));
          const t = elementsById(trip, id).map((e) => norm(e.textContent));
          compared++;
          if (d.length < 1 || d[0] === '' || JSON.stringify(d) !== JSON.stringify(t)) {
            bad.push(
              `${mod.moduleId} ${id}: direct=${JSON.stringify(d)} trip=${JSON.stringify(t)}`
            );
          }
        }
      }
      expect(bad).toEqual([]);
      expect(compared).toBe(PINNED_IDS);
    }
  );
});
