/**
 * The MT rewrote DIGITS inside an element id, leaving the SEG count unchanged.
 * Census it corpus-wide: which pairs have equal SEG counts but a non-empty
 * symmetric difference of id SETS?
 *
 * Counting unit: one SEG id. A pair is a (EN file, IS file) couple.
 * The population is printed as the control, so "0 renames" can be told apart
 * from "it examined nothing".
 */
import fs from 'node:fs';
import segMarkers from '../../tools/lib/seg-markers.cjs';
import { mtOutputSegmentFiles, enCounterpart } from '../../tools/__tests__/helpers/remt-corpus.js';

const { parseSegmentsMap } = segMarkers;
const BOOKS = ['efnafraedi-2e', 'lifraen-efnafraedi', 'orverufraedi'];
const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => p.replace(/^.*\/books\//, 'books/');

let pairs = 0;
const renames = [];   // equal counts, different id sets  -> the defect class
const countDrift = []; // unequal counts                  -> vintage drift

for (const b of BOOKS) {
  for (const f of mtOutputSegmentFiles(b)) {
    const en = enCounterpart(f);
    if (!en) continue;
    pairs++;
    const E = [...parseSegmentsMap(read(en)).keys()];
    const I = [...parseSegmentsMap(read(f)).keys()];
    if (E.length !== I.length) { countDrift.push({ f: rel(f), en: E.length, is: I.length }); continue; }
    const se = new Set(E), si = new Set(I);
    const onlyEn = E.filter((k) => !si.has(k));
    const onlyIs = I.filter((k) => !se.has(k));
    if (onlyEn.length) renames.push({ f: rel(f), n: E.length, onlyEn, onlyIs });
  }
}

console.log(`POPULATION (control): pairs=${pairs}`);
console.log(`\nCOUNT-EQUAL but ID-SET DIFFERENT — the digit-rewrite class: ${renames.length}`);
for (const r of renames) {
  console.log(`\n  ${r.f}   (${r.n} segments, counts equal)`);
  for (let i = 0; i < r.onlyEn.length; i++) {
    console.log(`     EN: ${r.onlyEn[i]}`);
    console.log(`     IS: ${r.onlyIs[i]}`);
  }
}
console.log(`\nCOUNT-UNEQUAL (vintage drift, a different class): ${countDrift.length}`);
for (const d of countDrift) console.log(`  ${d.f}  EN ${d.en} / IS ${d.is}`);
