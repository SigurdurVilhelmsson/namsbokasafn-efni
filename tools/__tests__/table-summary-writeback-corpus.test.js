import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { extractSegments } from '../cnxml-extract.js';
import { buildCnxml } from '../cnxml-inject.js';
import { renderCnxmlToHtml, decodeEntities } from '../cnxml-render.js';

/**
 * §C126 #4 — does a translated `<table summary>` reach the injected CNXML AND the
 * rendered page, for every summary-bearing table in both kept books?
 *
 * [USER] ruled 2026-09-22 that table summaries are TRANSLATED. Before this, the
 * attribute was never a segment: it was copied raw into `02-structure`, never
 * sent to the MT, never written back, and `renderTable` emitted no summary at
 * all — OpenStax's own published HTML carries it as `data-summary` (measured
 * 2026-09-23 on chemistry 1.5 and on a Key Equations page).
 *
 * 🔴 §C89's SHAPE AGAIN: an untranslated summary is still PRESENT, so no count of
 * tables or attributes moves when a translation is dropped. The method is the
 * one `caption-writeback-corpus.test.js` settled on: overwrite every summary
 * segment with a token that cannot come from the source, inject, render, and
 * compare the WHOLE value at the element keyed by the SOURCE table id — never
 * `includes`, never "any table on the page".
 *
 * ⚠️ THE DENOMINATOR IS THE SOURCE, NOT THE EXTRACTOR. Tables with a non-blank
 * `summary` are counted from `01-source` with xmldom, so a run where the
 * extractor emits nothing reads `emitted 0` against a known total instead of
 * passing vacuously.
 *
 * ⚠️ THE TOKEN CARRIES `"`, `&`, `<`, `>`, `$&` AND AN INVENTED `[[sub:2]]`.
 * The corpus has NONE of those in a summary (0 of 210, measured), so without
 * them escape-only, decode-then-escape and a string replacer are
 * indistinguishable on real data. The marker is what the paid MT does to
 * summaries that spell subscripts out in words (91 of chemistry's 191; cf. the
 * m68791 alt, §C169) — unwrapped at the lookup, it must arrive as `2`.
 *
 * ▶ POSITIVE CONTROL, per table: the first cell segment of the same table gets
 * its own token, and must reach the same id-keyed table on both sides. Cell
 * text already worked before this change, so a harness that broke everything
 * equally cannot read as a pass.
 *
 * ▶ BEST-EFFORT ARM: every committed MT predates the type, so the same sweep is
 * re-run with the summary segments ABSENT from the map. The source summary must
 * survive untouched and the injection report must be identical to the control —
 * a recording lookup here would make inject refuse every bought module.
 */

const BOOKS = join(process.cwd(), 'books');
const parser = () => new DOMParser({ onError: () => {} });

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== 'media' && entry !== 'exercises' && entry !== 'docx') walk(p, out);
    } else if (entry.endsWith('.cnxml')) out.push(p);
  }
  return out;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Source context: `key-equations`, `exercise`, or `body`. */
function tableContext(table) {
  for (let p = table.parentNode; p && p.nodeName; p = p.parentNode) {
    if (p.nodeName === 'section' && /\bkey-equations\b/.test(p.getAttribute('class') || '')) {
      return 'key-equations';
    }
  }
  for (let p = table.parentNode; p && p.nodeName; p = p.parentNode) {
    if (p.nodeName === 'exercise') return 'exercise';
  }
  return 'body';
}

/** Every table node in the extracted structure (content tree + inline tables). */
function structureTables(structure) {
  const out = [];
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    if (n.type === 'table' && n.id) out.push(n);
    for (const v of Object.values(n)) if (v && typeof v === 'object') visit(v);
  };
  visit(structure.content);
  for (const t of structure.inlineTables || []) visit(t.structure || t);
  return out;
}

function firstCellSegmentId(tableNode) {
  for (const row of tableNode.rows || []) {
    for (const cell of row.cells || []) {
      if (cell.segmentId) return cell.segmentId;
      for (const p of cell.paras || []) if (p.segmentId) return p.segmentId;
    }
  }
  return null;
}

/** `<table … id="X" …>…</table>` blocks of rendered HTML, quote-aware open tag. */
function renderedTables(html, tableId) {
  const block = new RegExp(
    `<table((?:[^>"]|"[^"]*")*\\sid="${escapeRegExp(tableId)}"(?:[^>"]|"[^"]*")*)>([\\s\\S]*?)<\\/table>`,
    'g'
  );
  return [...html.matchAll(block)].map((m) => {
    const ds = m[1].match(/\sdata-summary="([^"]*)"/);
    return { summary: ds ? decodeEntities(ds[1]) : null, body: m[2] };
  });
}

const htmlOf = (r) => (typeof r === 'string' ? r : r.html || '');

/** Rendered HTML of each enclosing `<exercise>` — the end-of-chapter rollup path. */
function rollupHtml(cnxml, tableId, book) {
  const doc = parser().parseFromString(cnxml, 'text/xml');
  const t = Array.from(doc.getElementsByTagName('table')).find(
    (el) => el.getAttribute('id') === tableId
  );
  let ex = t && t.parentNode;
  while (ex && ex.nodeName !== 'exercise') ex = ex.parentNode;
  if (!ex) return '';
  const xml = new XMLSerializer().serializeToString(ex);
  return htmlOf(
    renderCnxmlToHtml(
      `<?xml version="1.0"?><document xmlns="http://cnx.rice.edu/cnxml"><content>${xml}</content></document>`,
      { bookSlug: book, excludeSections: false, includeSolutions: true }
    )
  );
}

const TOKEN = (i) => `ZQX"${i} & x < y > z $& [[sub:2]] ZQX`;
const EXPECT = (i) => `ZQX"${i} & x < y > z $& 2 ZQX`;
const CELL = (i) => `ZQXCELL${i}ZQX`;

function sweep(book) {
  const byContext = {};
  const dropped = [];
  const controlMiss = [];
  const bestEffortBad = [];
  const refused = [];
  let i = 0;
  for (const f of walk(join(BOOKS, book, '01-source'))) {
    const src = readFileSync(f, 'utf8');
    const srcTables = Array.from(
      parser().parseFromString(src, 'text/xml').getElementsByTagName('table')
    ).filter((t) => (t.getAttribute('summary') || '').trim());
    if (!srcTables.length) continue;
    const mod = basename(f, '.cnxml');

    const { segments, structure, equations, inlineAttrs } = extractSegments(src);
    const english = new Map(segments.map((s) => [s.id, s.text]));
    const nodes = new Map(structureTables(structure).map((n) => [n.id, n]));

    const map = new Map(english);
    const probes = [];
    for (const t of srcTables) {
      const id = t.getAttribute('id');
      const n = i++;
      const node = nodes.get(id);
      const segId = node?.summarySegmentId || null;
      const cellId = node ? firstCellSegmentId(node) : null;
      if (segId) map.set(segId, TOKEN(n));
      if (cellId) map.set(cellId, CELL(n));
      probes.push({
        id,
        n,
        segId,
        cellId,
        context: tableContext(t),
        source: decodeEntities(t.getAttribute('summary')),
      });
    }

    let built;
    try {
      built = buildCnxml(structure, map, equations, src, {}, inlineAttrs);
    } catch (err) {
      if (!/Marker residue/.test(err.message)) throw err;
      refused.push(mod);
      continue;
    }
    const outTables = Array.from(
      parser().parseFromString(built.cnxml, 'text/xml').getElementsByTagName('table')
    );
    const page = htmlOf(renderCnxmlToHtml(built.cnxml, { bookSlug: book }));

    for (const p of probes) {
      const c = (byContext[p.context] ||= {
        tables: 0,
        cellControl: 0,
        emitted: 0,
        injected: 0,
        rendered: 0,
        rollup: 0,
      });
      c.tables++;
      if (p.segId) c.emitted++;
      const copies = outTables.filter((el) => el.getAttribute('id') === p.id);
      const cellOk =
        !p.cellId ||
        (copies.length > 0 && copies.every((el) => el.textContent.includes(CELL(p.n))));
      const injected =
        p.segId &&
        copies.length > 0 &&
        copies.every((el) => el.getAttribute('summary') === EXPECT(p.n));
      if (injected) c.injected++;
      if (p.cellId && cellOk) c.cellControl++;
      let blocks = renderedTables(page, p.id);
      const onPage = blocks.length > 0;
      if (onPage && blocks.every((b) => b.summary === EXPECT(p.n))) c.rendered++;
      if (!onPage && p.context === 'exercise') {
        blocks = renderedTables(rollupHtml(built.cnxml, p.id, book), p.id);
        if (blocks.length > 0 && blocks.every((b) => b.summary === EXPECT(p.n))) c.rollup++;
      }
      if (p.cellId && blocks.length > 0 && !blocks.every((b) => b.body.includes(CELL(p.n)))) {
        controlMiss.push(`${mod} ${p.id} rendered-cell`);
      }
      if (!cellOk) controlMiss.push(`${mod} ${p.id} injected-cell`);
      if (!injected) dropped.push(`${mod} ${p.id} ${p.context} (inject)`);
    }

    // Best-effort arm: summary translations ABSENT, as in every committed MT.
    const pre = new Map(english);
    for (const p of probes) if (p.segId) pre.delete(p.segId);
    const control = buildCnxml(structure, english, equations, src, {}, inlineAttrs);
    const preBuilt = buildCnxml(structure, pre, equations, src, {}, inlineAttrs);
    const preTables = Array.from(
      parser().parseFromString(preBuilt.cnxml, 'text/xml').getElementsByTagName('table')
    );
    for (const p of probes) {
      const copies = preTables.filter((el) => el.getAttribute('id') === p.id);
      if (
        !copies.length ||
        !copies.every((el) => decodeEntities(el.getAttribute('summary')) === p.source)
      ) {
        bestEffortBad.push(`${mod} ${p.id} english-lost`);
      }
    }
    const rep = (b) =>
      JSON.stringify({
        complete: b.report?.complete,
        missing: b.report?.segmentsMissing ?? b.stats?.segmentsMissing,
      });
    if (rep(control) !== rep(preBuilt)) bestEffortBad.push(`${mod} report-differs`);
  }
  return {
    byContext,
    dropped: dropped.sort(),
    controlMiss: controlMiss.sort(),
    bestEffortBad: bestEffortBad.sort(),
    refused: refused.sort(),
  };
}

describe('§C126 #4 — a translated table summary reaches the injected CNXML AND the rendered page', () => {
  it('chemistry: all 191 reach the CNXML; every table that renders through renderTable carries it', () => {
    // 🔴 THE BEFORE/AFTER IS THE POINT (tables / emitted / injected / rendered):
    //                   before §C126 #4        after §C126 #4
    //   body            120 / 0 / 0 / 0        120 / 120 / 120 / 120
    //   exercise         28 / 0 / 0 / 0         28 /  28 /  28 /  28 (rollup)
    //   key-equations    43 / 0 / 0 / 0         43 /  43 /  43 /   0   ← see below
    // `cellControl` is the positive control: cell text already reached every one
    // of the 191 tables before the change, and still does.
    const r = sweep('efnafraedi-2e');
    expect(r.refused).toEqual([]);
    expect(r.controlMiss).toEqual([]);
    expect(r.bestEffortBad).toEqual([]);
    expect(r.byContext).toEqual({
      body: {
        tables: 120,
        cellControl: 120,
        emitted: 120,
        injected: 120,
        rendered: 120,
        rollup: 0,
      },
      // End-of-chapter exercise tables are not on the module page; they render on
      // the compiled N-exercises / N-answer-key pages, which call renderCnxmlToHtml
      // on the exercise content — the `rollup` column.
      exercise: { tables: 28, cellControl: 28, emitted: 28, injected: 28, rendered: 0, rollup: 28 },
      // ⚠️ THE ONE ZERO IS A RENDER DIVERGENCE THIS CHANGE DOES NOT OWN, AND IT IS
      // PINNED SO IT CANNOT HIDE A REAL DROP. All 43 are `section.key-equations`
      // tables whose summary is the literal "key equations table". The translation
      // reaches the injected CNXML (43/43), but `renderKeyEquations` MERGES every
      // module's rows into ONE synthetic `<table class="key-equations-table …">`
      // with no id and no summary, so the value has no table to land on. OpenStax
      // renders one `<table id="key-equations-table" data-summary="key equations
      // table" role="presentation">` per module. Logged in the register (§C126 #4).
      'key-equations': {
        tables: 43,
        cellControl: 43,
        emitted: 43,
        injected: 43,
        rendered: 0,
        rollup: 0,
      },
    });
    expect(r.dropped).toEqual([]);
  }, 600_000);

  it('organic: all 19 non-blank summaries reach the CNXML and the page', () => {
    // before §C126 #4: body 19 / 0 / 0 / 0 — after: 19 / 19 / 19 / 19.
    // 80 organic tables carry the attribute; the other 61 are blank ("" ×54,
    // " " ×7) and emit nothing, so they are outside this denominator by design.
    const r = sweep('lifraen-efnafraedi');
    expect(r.refused).toEqual([]);
    expect(r.controlMiss).toEqual([]);
    expect(r.bestEffortBad).toEqual([]);
    expect(r.byContext).toEqual({
      body: { tables: 19, cellControl: 19, emitted: 19, injected: 19, rendered: 19, rollup: 0 },
    });
    expect(r.dropped).toEqual([]);
  }, 600_000);
});
