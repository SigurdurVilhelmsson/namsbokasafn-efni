// tools/__tests__/quote-container.test.js
//
// §C179 — `<quote>` is a block container OpenStax ships and this pipeline had a
// case for it NOWHERE: not in HANDLED_INLINE, not in HANDLED_BLOCK, no renderer,
// no builder. Organic is the only book in the repo that has any.
//
// ⚠️ THE LOSS WAS STYLING, NOT CONTENT, and the register said content for a day.
// The quote's `<para>` children were always extracted and always injected; only
// the WRAPPER was dropped, so the reader got the rule in a plain `<p>` and lost
// the callout box. Measuring that is what set the severity.
//
// 🔴 THE HAZARD A CONTAINER CHANGE CARRIES IS DUPLICATION, AND IT BIT HERE.
// CLAUDE.md's rule: owner-without-cut ships the prose TWICE, cut-without-owner
// deletes it, and a tag count sees neither. m00155's quote lives inside an
// `<example>`, whose subtree is preserved verbatim — so the first draft emitted
// it standalone as well and the injected CNXML carried two.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { extractSegments } from '../cnxml-extract.js';
import { roundTrip } from '../source-roundtrip-check.js';
import { renderCnxmlToHtml } from '../cnxml-render.js';
import { HANDLED_BLOCK } from '../lib/handled-tags.js';

const SRC = (book) => join(import.meta.dirname, '..', '..', 'books', book, '01-source');
const count = (s, re) => (s.match(re) || []).length;

function modulesWithQuotes(book) {
  const out = [];
  const root = SRC(book);
  for (const unit of readdirSync(root)) {
    const dir = join(root, unit);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.cnxml'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      const n = count(src, /<quote\b/g);
      if (n) out.push({ unit, moduleId: f.replace('.cnxml', ''), src, n });
    }
  }
  return out;
}

const html = (cnxml, ch, id) => {
  const r = renderCnxmlToHtml(cnxml, ch, id, {});
  return typeof r === 'string' ? r : r.html || '';
};

describe('§C179 — <quote> survives as a callout instead of being unwrapped', () => {
  const organic = modulesWithQuotes('lifraen-efnafraedi');

  it('PREMISE PIN — organic has quotes and chemistry has none', () => {
    expect(organic.length).toBeGreaterThan(0);
    expect(modulesWithQuotes('efnafraedi-2e')).toEqual([]);
    expect(HANDLED_BLOCK.has('quote')).toBe(true);
  });

  it('SOURCE → INJECTED is 1:1 per module — neither dropped nor duplicated', () => {
    // Counted per module and in BOTH directions by equality: the first draft of
    // this change was short on two modules and long on a third, which a corpus
    // total would have reported as correct.
    const rows = organic.map((m) => ({
      id: `${m.unit}/${m.moduleId}`,
      source: m.n,
      injected: count(roundTrip(m.src), /<quote\b/g),
    }));
    expect(rows.filter((r) => r.source !== r.injected)).toEqual([]);
  });

  it('🔴 THE DUPLICATION GUARD — a quote inside an <example> is owned by the example', () => {
    // m00155's single quote is nested in an <example>, whose subtree the builder
    // preserves verbatim. Emitting it standalone as well put TWO in the injected
    // CNXML and would have shown a reader the same callout prose twice.
    const m = organic.find((x) => x.moduleId === 'm00155');
    expect(m.n).toBe(1);
    const { structure } = extractSegments(m.src);
    // It must NOT appear as a top-level structure node…
    expect(JSON.stringify(structure.elements || []).includes('"type":"quote"')).toBe(false);
    // …and exactly one must still reach the injected CNXML, via the example.
    expect(count(roundTrip(m.src), /<quote\b/g)).toBe(1);
    // 🔴 AND ITS PROSE MUST REACH THE READER — KEYED ON THE ELEMENT ID, NOT ON
    // THE WORDS. The first version of this assertion searched the page for
    // "Broadband decoupled" and PASSED while all three paras were missing,
    // because a nearby figure's `alt` contains the same phrase. The value was
    // present; the element was not.
    //
    // That false pass hid a real, pre-existing loss: renderExample had no quote
    // handler, so this example jumped from "…has the following spectral data:"
    // straight to the Strategy heading and the data never appeared. §C179 wires
    // `quote: renderQuote` into that dispatch; these ids are the proof.
    const out155 = html(roundTrip(m.src), 13, 'm00155');
    for (const id of ['para-00005', 'para-00006', 'para-00007']) {
      expect(out155).toContain(`id="${id}"`);
    }
    expect(out155).toContain('<blockquote');
  });

  it('RENDERED — a top-level quote becomes <blockquote class="cnx-callout"> with its prose inside', () => {
    const m = organic.find((x) => x.moduleId === 'm00072');
    const out = html(roundTrip(m.src), 7, 'm00072');
    expect(count(out, /<blockquote[^>]*class="cnx-callout"/g)).toBe(1);
    // The rule text is INSIDE the callout, not beside it.
    const block = out.match(/<blockquote[\s\S]*?<\/blockquote>/)[0];
    expect(block).toContain('Hammond');
    expect(block).toContain('<p');
  });

  it('NO DOUBLE-SHIP — the quote prose appears in the HTML exactly as often as in the source', () => {
    // The owner-without-cut failure is invisible to a tag count: both copies are
    // well-formed. Compare the VALUE's multiplicity instead.
    const m = organic.find((x) => x.moduleId === 'm00070');
    const out = html(roundTrip(m.src), 7, 'm00070');
    const phrase = /In the addition of HX to an alkene/g;
    // Two in the source — Markovnikov's rule and the same rule restated — so two
    // is CORRECT here and a naive "must be 1" assertion would have been wrong.
    expect(count(m.src, phrase)).toBe(2);
    expect(count(out, phrase)).toBe(2);
    expect(count(out, /<blockquote/g)).toBe(2);
  });
});
