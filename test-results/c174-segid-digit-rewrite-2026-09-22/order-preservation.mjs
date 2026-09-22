/**
 * GATES C174's STRATEGY 3. Ordinal repair — "the unmatched output tag at position i is
 * the unmatched input tag at position i" — is only safe if the MT PRESERVES MARKER ORDER.
 * Two instances agreeing is a hypothesis. This measures it over the whole corpus.
 *
 * It uses the SAME regex `repairSegTags` uses, so the population is the one the repair
 * would actually see — a lookalike would answer a different question.
 *
 * Three questions, in order of what would kill the strategy:
 *   Q1 Does any pair REORDER its matched ids?  (any yes ⇒ ordinal repair is unsafe)
 *   Q2 When ids are unmatched, are the EN-side and IS-side unmatched COUNTS equal?
 *   Q3 Do the unmatched ones sit at the SAME ordinal positions on both sides?
 */
import fs from 'node:fs';
import { mtOutputSegmentFiles, enCounterpart } from '../../tools/__tests__/helpers/remt-corpus.js';

const TAG = /<!-- SEG:(\S+?) -->/g;
const ids = (t) => [...t.matchAll(TAG)].map((m) => m[1]);
const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => p.replace(/^.*\/books\//, 'books/');

let pairs = 0, countEqual = 0, identical = 0;
let reordered = 0, unmatchedBalanced = 0, unmatchedAligned = 0;
const reorderCases = [], alignCases = [], mismatchCases = [];

for (const b of ['efnafraedi-2e', 'lifraen-efnafraedi', 'orverufraedi']) {
  for (const f of mtOutputSegmentFiles(b)) {
    const en = enCounterpart(f);
    if (!en) continue;
    pairs++;
    const E = ids(read(en)), I = ids(read(f));
    if (E.length !== I.length) continue;
    countEqual++;
    if (E.every((x, i) => x === I[i])) { identical++; continue; }

    const se = new Set(E), si = new Set(I);
    // positions where the two sides disagree
    const diffPos = E.map((_, i) => i).filter((i) => E[i] !== I[i]);
    // Q1: a REORDER is a position that disagrees but whose IS id exists elsewhere in EN
    const reorderPos = diffPos.filter((i) => se.has(I[i]));
    if (reorderPos.length) {
      reordered++;
      if (reorderCases.length < 6) reorderCases.push(`${rel(f)}  ${reorderPos.length} reordered pos, e.g. ${i0(E, I, reorderPos[0])}`);
      continue;
    }
    // Q2: unmatched counts balanced?
    const onlyEn = E.filter((x) => !si.has(x));
    const onlyIs = I.filter((x) => !se.has(x));
    if (onlyEn.length !== onlyIs.length) {
      if (mismatchCases.length < 6) mismatchCases.push(`${rel(f)}  onlyEn=${onlyEn.length} onlyIs=${onlyIs.length}`);
      continue;
    }
    unmatchedBalanced++;
    // Q3: do the unmatched sit at identical ordinal positions?
    const posEn = E.map((x, i) => (!si.has(x) ? i : -1)).filter((i) => i >= 0);
    const posIs = I.map((x, i) => (!se.has(x) ? i : -1)).filter((i) => i >= 0);
    const aligned = posEn.length === posIs.length && posEn.every((p, k) => p === posIs[k]);
    if (aligned) {
      unmatchedAligned++;
      if (alignCases.length < 8) alignCases.push(`${rel(f)}  pos ${posEn.join(',')}  ${E[posEn[0]]}  ->  ${I[posIs[0]]}`);
    } else if (mismatchCases.length < 6) {
      mismatchCases.push(`${rel(f)}  UNALIGNED posEn=${posEn} posIs=${posIs}`);
    }
  }
}

function i0(E, I, i) { return `pos ${i}: EN ${E[i]} / IS ${I[i]}`; }

console.log(`POPULATION (control): pairs=${pairs}  countEqual=${countEqual}  byte-identical id sequence=${identical}`);
console.log(`\nQ1  pairs whose matched ids are REORDERED: ${reordered}   <-- ANY > 0 KILLS ORDINAL REPAIR`);
reorderCases.forEach((c) => console.log('    ' + c));
console.log(`\nQ2  pairs with unmatched ids, EN/IS counts BALANCED: ${unmatchedBalanced}`);
console.log(`Q3  ...of those, unmatched at IDENTICAL ordinal positions: ${unmatchedAligned}`);
alignCases.forEach((c) => console.log('    ' + c));
console.log(`\nunbalanced / unaligned cases: ${mismatchCases.length}`);
mismatchCases.forEach((c) => console.log('    ' + c));
