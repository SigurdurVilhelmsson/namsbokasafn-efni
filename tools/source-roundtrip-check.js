#!/usr/bin/env node
/**
 * source-roundtrip-check.js — §C118 T2: the EN round-trip, compared to 01-source BY VALUE.
 *
 * WHAT IT DOES. Extracts a module, injects its OWN ENGLISH straight back, and diffs the
 * result against the frozen `01-source` CNXML element-by-element, keyed on element id.
 * No translation is involved, so every difference is the pipeline losing, adding or
 * rewriting something — never a content decision.
 *
 * 🔴 WHY THIS EXISTS ALONGSIDE `lib/inject-roundtrip.js`, WHICH ALREADY ROUND-TRIPS.
 * That helper counts ONE attribute (`alt`) and its own docstring records the limit:
 * a reviewer deleted EVERY alt segment before buildCnxml and all eight assertions
 * stayed green. Counting cannot see a substitution that did not happen (§C89), and
 * chemistry ch03 proves it at full strength — element totals 1255->1255, per-tag
 * deltas {}, and yet 763 `<meaning>` ids corpus-wide are silently rewritten.
 * ▶ **This tool compares VALUES. That is the whole difference.**
 *
 * WHY THE ENGLISH ROUND-TRIP IS THE STRONGEST FREE ORACLE WE HAVE. Comparing Icelandic
 * output against English source can only ever check structure, which forces the
 * count-based instruments that have repeatedly gone green over real damage. Injecting
 * the English back makes CONTENT EQUALITY MEANINGFUL AGAIN, so the same pipeline becomes
 * testable by direct comparison — at 0 ISK, with no MT and no translation noise.
 *
 * WHAT IT COMPARES, and why not raw bytes. `lib/inject-roundtrip.js` rejected byte diffing
 * because whitespace-only changes buried the findings (17 physics modules did exactly that
 * in §C81 round 3). So this walks both documents in order and compares, per element:
 * tag name, every attribute, and the element's OWN direct text (whitespace-normalised,
 * descendants excluded). Elements are matched by `id` where present — the strong key —
 * with per-tag totals reported alongside to localise a pure sequence change.
 *
 * ⚠️ AN ID-KEYED DIFF IS BLIND TO ELEMENTS WITH NO ID, so the per-tag census
 * (`tagCountDeltas`) is not decoration: it is the control that catches a dropped
 * element the id map cannot see. Organic's dropped `<span>`s carry no id and show up
 * ONLY there. Read both columns or you will read a real loss as a clean module.
 *
 * Usage:
 *   node tools/source-roundtrip-check.js <book-slug> <chapter-dir> [--verbose]
 *   node tools/source-roundtrip-check.js efnafraedi-2e ch03
 *   node tools/source-roundtrip-check.js lifraen-efnafraedi ch03 --verbose
 *
 * Exit code 1 if any module differs. Read-only: writes nothing, touches no book tree.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DOMParser } from '@xmldom/xmldom';
import { extractSegments, formatSegmentsMarkdown } from './cnxml-extract.js';
import { buildCnxml, parseSegments } from './cnxml-inject.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const norm = (s) =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .trim();

/** Document-order spine: one record per element, carrying identity + its OWN text. */
export function spine(xml) {
  const doc = new DOMParser({ onError() {} }).parseFromString(xml, 'text/xml');
  const out = [];
  (function walk(n) {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType !== 1) continue;
      const attrs = {};
      if (c.attributes)
        for (let i = 0; i < c.attributes.length; i++) {
          const a = c.attributes[i];
          attrs[a.name] = a.value;
        }
      // OWN text only — direct text children, not descendants. A dropped inline
      // wrapper (organic's <span>) shows up here as its text migrating upward.
      let own = '';
      for (let t = c.firstChild; t; t = t.nextSibling) if (t.nodeType === 3) own += t.nodeValue;
      out.push({ tag: c.nodeName, id: attrs.id || null, attrs, text: norm(own) });
      walk(c);
    }
  })(doc);
  return out;
}

/** Compare a source CNXML against its EN round-trip output. */
export function compareToSource(src, out) {
  const A = spine(src);
  const B = spine(out);
  const d = {
    missingEl: [],
    addedEl: [],
    attrDiff: [],
    textDiff: [],
    tagCount: {},
    counts: { src: A.length, out: B.length },
  };
  const byIdA = new Map();
  const byIdB = new Map();
  for (const e of A) if (e.id) byIdA.set(e.id, e);
  for (const e of B) if (e.id) byIdB.set(e.id, e);
  for (const [id, a] of byIdA) {
    const b = byIdB.get(id);
    if (!b) {
      d.missingEl.push(`${a.tag}#${id}`);
      continue;
    }
    if (a.tag !== b.tag) d.attrDiff.push(`#${id}: tag ${a.tag} -> ${b.tag}`);
    for (const k of new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)])) {
      if (a.attrs[k] !== b.attrs[k])
        d.attrDiff.push(
          `#${id} @${k}: ${JSON.stringify(a.attrs[k])} -> ${JSON.stringify(b.attrs[k])}`
        );
    }
    if (a.text !== b.text)
      d.textDiff.push(
        `#${id} <${a.tag}>: ${JSON.stringify(a.text.slice(0, 70))} -> ${JSON.stringify(b.text.slice(0, 70))}`
      );
  }
  for (const [id, b] of byIdB) if (!byIdA.has(id)) d.addedEl.push(`${b.tag}#${id}`);
  // The control for id-less elements. Without this a dropped <span> is invisible.
  const tally = (X) => X.reduce((m, e) => ((m[e.tag] = (m[e.tag] || 0) + 1), m), {});
  const tA = tally(A);
  const tB = tally(B);
  for (const k of new Set([...Object.keys(tA), ...Object.keys(tB)]))
    if ((tA[k] || 0) !== (tB[k] || 0)) d.tagCount[k] = `${tA[k] || 0}->${tB[k] || 0}`;
  return d;
}

/** True when a module round-trips with no difference of any kind. */
export function isClean(d) {
  return (
    d.missingEl.length === 0 &&
    d.addedEl.length === 0 &&
    d.attrDiff.length === 0 &&
    d.textDiff.length === 0 &&
    Object.keys(d.tagCount).length === 0
  );
}

/** Round-trip one module's CNXML through extract -> inject(EN). */
export function roundTrip(src) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(src);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  return buildCnxml(structure, parsed, equations, src, {}, inlineAttrs).cnxml;
}

function main() {
  const [book, ch, ...rest] = process.argv.slice(2);
  const verbose = rest.includes('--verbose');
  if (!book || !ch) {
    console.error(
      'Usage: node tools/source-roundtrip-check.js <book-slug> <chapter-dir> [--verbose]'
    );
    process.exitCode = 2;
    return;
  }
  const dir = path.join(REPO_ROOT, 'books', book, '01-source', ch);
  if (!fs.existsSync(dir)) {
    console.error(`No such chapter: ${dir}`);
    process.exitCode = 2;
    return;
  }
  console.log(`T2 — EN round-trip vs 01-source (BY VALUE, id-keyed)   ${book}/${ch}`);
  console.log('   module   els(src->out)  missing  added  attrDiff  textDiff   tagCountDeltas');
  let differing = 0;
  for (const f of fs
    .readdirSync(dir)
    .filter((x) => x.endsWith('.cnxml'))
    .sort()) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    let out;
    try {
      out = roundTrip(src);
    } catch (e) {
      console.log(
        `🔴 ${f.replace('.cnxml', '').padEnd(9)} BUILD FAILED: ${e.message.slice(0, 70)}`
      );
      differing++;
      continue;
    }
    const d = compareToSource(src, out);
    const clean = isClean(d);
    if (!clean) differing++;
    console.log(
      `${clean ? '   ' : '🔴 '}${f.replace('.cnxml', '').padEnd(9)}` +
        `${(d.counts.src + '->' + d.counts.out).padStart(13)}` +
        `${String(d.missingEl.length).padStart(9)}${String(d.addedEl.length).padStart(7)}` +
        `${String(d.attrDiff.length).padStart(10)}${String(d.textDiff.length).padStart(10)}` +
        `   ${JSON.stringify(d.tagCount)}`
    );
    const cap = verbose ? 1e9 : 4;
    for (const x of d.missingEl.slice(0, cap)) console.log(`        MISSING  ${x}`);
    for (const x of d.addedEl.slice(0, cap)) console.log(`        ADDED    ${x}`);
    for (const x of d.attrDiff.slice(0, cap)) console.log(`        ATTR     ${x.slice(0, 140)}`);
    for (const x of d.textDiff.slice(0, cap)) console.log(`        TEXT     ${x.slice(0, 140)}`);
  }
  console.log(
    differing
      ? `\n🔴 ${differing} module(s) differ from 01-source`
      : '\n✅ every module round-trips identically'
  );
  process.exitCode = differing ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
