/**
 * M0 — post-run manual-fix ledger sweep. Frozen evidence, 2026-08-23. READ-ONLY.
 * Runs from any cwd (paths resolved against import.meta.url).
 *
 * Three measurements, each with its control:
 *   1. Class B — alt attributes with NO source string in the KEPT books.
 *      (If this is 0, no ledger item can be "the source has no alt to translate".)
 *   2. The raw-`>`-in-attribute census — the `<media[^>]*>` truncation class.
 *      An unescaped `>` is LEGAL XML but fatal to a `[^>]*` regex. `<` must be
 *      escaped; `>` need not be, which is why this is invisible to a schema check.
 *   3. Published <img> alts, split on whether the image is a localized (_IS.)
 *      variant — the control that refuted "the localization route drops alt".
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseModuleDoc } from '../tools/lib/extraction-coverage.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEPT = ['efnafraedi-2e', 'lifraen-efnafraedi'];
const walk = (d, ext, out = []) => {
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
};
/** True end of an open tag, respecting quoted attribute values. */
const tagEnd = (t, i) => {
  let j = i, q = null;
  while (j < t.length) {
    const c = t[j];
    if (q) { if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === '>') return j;
    j++;
  }
  return -1;
};

console.log('1 · CLASS B — media with no usable alt in 01-source (unit: <media> elements)');
for (const b of KEPT) {
  let total = 0, noAlt = 0;
  for (const f of walk(path.join(REPO, 'books', b, '01-source'), '.cnxml')) {
    const { content } = parseModuleDoc(fs.readFileSync(f, 'utf-8'));
    if (!content) continue;
    const ms = content.getElementsByTagName('media');
    for (let i = 0; i < ms.length; i++) {
      total++;
      const own = ms[i].getAttribute('alt');
      let img = null;
      for (let j = 0; j < ms[i].childNodes.length; j++) {
        const c = ms[i].childNodes[j];
        if (c.nodeType === 1 && c.localName === 'image') { img = c.getAttribute('alt'); break; }
      }
      if (!(own && own.trim()) && !(img && img.trim())) noAlt++;
    }
  }
  console.log(`   ${b.padEnd(20)} media ${String(total).padStart(5)}   with NO usable alt: ${noAlt}`);
}

console.log('\n2 · THE TRUNCATION CLASS — raw ">" inside a quoted attribute value');
let grand = 0;
for (const b of KEPT) {
  let total = 0; const hits = [];
  for (const f of walk(path.join(REPO, 'books', b, '01-source'), '.cnxml')) {
    const t = fs.readFileSync(f, 'utf-8');
    for (const m of t.matchAll(/<(media|image)\b/g)) {
      const i = m.index, e = tagEnd(t, i);
      if (e < 0) continue;
      total++;
      const inner = t.slice(i, e);
      let q = null, raw = false;
      for (const c of inner) {
        if (q) { if (c === q) q = null; else if (c === '>') raw = true; }
        else if (c === '"' || c === "'") q = c;
      }
      if (raw) {
        const id = inner.match(/id="([^"]*)"/);
        hits.push(`${path.basename(f, '.cnxml')} <${m[1]} id=${id ? id[1] : '-'}>`);
      }
    }
  }
  grand += hits.length;
  console.log(`   ${b.padEnd(20)} ${String(hits.length).padStart(3)} of ${String(total).padStart(5)} media/image open tags`);
  hits.forEach((h) => console.log(`        ${h}`));
}
console.log(`   TOTAL across both kept books: ${grand}`);

console.log('\n3 · PUBLISHED <img> alt, split on localized (_IS.) vs not — the refuting control');
const tally = { IS: [0, 0], other: [0, 0] };
const empties = [];
for (const b of KEPT) {
  for (const f of walk(path.join(REPO, 'books', b, '05-publication'), '.html')) {
    const t = fs.readFileSync(f, 'utf-8');
    for (const m of t.matchAll(/<img\b[^>]*>/g)) {
      const src = m[0].match(/src="([^"]*)"/);
      if (!src) continue;
      const alt = m[0].match(/alt="([^"]*)"/);
      const k = src[1].includes('_IS.') ? 'IS' : 'other';
      const empty = !alt || !alt[1].trim();
      tally[k][empty ? 1 : 0]++;
      if (empty) empties.push(`${path.relative(REPO, f)}  ${path.basename(src[1])}`);
    }
  }
}
console.log(`   localized (_IS.):  non-empty alt ${String(tally.IS[0]).padStart(4)}   EMPTY ${tally.IS[1]}`);
console.log(`   everything else :  non-empty alt ${String(tally.other[0]).padStart(4)}   EMPTY ${tally.other[1]}`);
empties.forEach((e) => console.log(`        EMPTY: ${e}`));

// 4 · WIDENED 2026-08-23 — the same truncation class over EVERY element type and
//     ALL FIVE books, not just media/image in the kept two. This is what turns
//     "any [^>]* regex has the same exposure" from a hedge into a measurement.
const ALL = ['efnafraedi-2e', 'lifraen-efnafraedi', 'edlisfraedi-2e', 'liffraedi-2e', 'orverufraedi'];
console.log('\n4 · RAW ">" inside ANY quoted attribute value, ALL element types, all books');
for (const b of ALL) {
  const root = path.join(REPO, 'books', b, '01-source');
  if (!fs.existsSync(root)) continue;
  let tags = 0; const hits = [];
  for (const f of walk(root, '.cnxml')) {
    const t = fs.readFileSync(f, 'utf-8');
    for (const m of t.matchAll(/<[A-Za-z][\w:.-]*/g)) {
      const i = m.index, e = tagEnd(t, i);
      if (e < 0) continue;
      tags++;
      const inner = t.slice(i, e);
      let q = null, raw = false;
      for (const c of inner) {
        if (q) { if (c === q) q = null; else if (c === '>') raw = true; }
        else if (c === '"' || c === "'") q = c;
      }
      if (raw) {
        const id = inner.match(/id="([^"]*)"/);
        hits.push(`${path.basename(f, '.cnxml')} <${m[0].slice(1)} id=${id ? id[1] : '-'}>`);
      }
    }
  }
  const kept = KEPT.includes(b);
  console.log(`   ${b.padEnd(20)} ${String(hits.length).padStart(3)} of ${String(tags).padStart(7)} open tags   ${kept ? '(KEPT)' : '(withdrawn)'}`);
  hits.forEach((h) => console.log(`        ${h}`));
}
