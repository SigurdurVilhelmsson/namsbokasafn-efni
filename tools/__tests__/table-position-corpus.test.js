import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

/**
 * §C185 ⑤ — does every chemistry <table> land in the SAME PARENT after an
 * English round-trip as it has in `01-source`?
 *
 * 🔴 A RELOCATION IS INVISIBLE TO EVERY COUNT AND EVERY ID CHECK. The table is
 * present, once, with its id, so `source-roundtrip-check` (556 → 556) and every
 * tally reconcile while a reader sees it in the wrong place. Measured 2026-10-09:
 * 2 of 191 tables moved to section level — `m68738` `fs-idm25109184`
 * (`example > note > table`, an exercise's "Answer:" note) and `m68843`
 * `fs-idp115554880` (`list > item > table`). Extraction flattens both into their
 * section's `structure.content`, and only a DIRECT child of a container was kept
 * in place (OC-B).
 *
 * So the unit compared is each table's ANCESTOR PATH, keyed on its id, source vs
 * output. Chemistry only: organic is not to be injected (CLAUDE.md § Organic).
 */

const SOURCE = join(process.cwd(), 'books/efnafraedi-2e/01-source');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.cnxml')) out.push(p);
  }
  return out;
}

/** id → nearest four ancestors (`name#id`), innermost last. */
function tablePaths(xml) {
  const doc = new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml');
  const out = new Map();
  const tables = doc.getElementsByTagName('table');
  for (let i = 0; i < tables.length; i++) {
    const path = [];
    for (let n = tables[i].parentNode; n && n.nodeType === 1; n = n.parentNode) {
      path.unshift(n.localName + (n.getAttribute('id') ? `#${n.getAttribute('id')}` : ''));
    }
    out.set(tables[i].getAttribute('id') || `#${i}`, path.slice(-4).join(' > '));
  }
  return out;
}

function roundTrip(src) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(src);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  return buildCnxml(structure, parsed, equations, src, {}, inlineAttrs).cnxml;
}

describe('§C185 ⑤ — every chemistry table keeps its source parent through a round-trip', () => {
  const files = walk(SOURCE).sort();
  let tables = 0;
  const moved = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('<table')) continue;
    const before = tablePaths(src);
    const after = tablePaths(roundTrip(src));
    for (const [id, path] of before) {
      tables++;
      if (after.get(id) !== path) {
        moved.push(`${basename(file, '.cnxml')} ${id}: ${path} → ${after.get(id) ?? 'MISSING'}`);
      }
    }
  }

  it('the corpus has tables to compare (control)', () => {
    expect(tables).toBeGreaterThan(0);
  });

  it('no table moves or goes missing', () => {
    expect(moved).toEqual([]);
  });
});
