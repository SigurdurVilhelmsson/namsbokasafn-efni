/**
 * A2b is BLOCKING. Its base-rate test asserts PASS for every EN/IS pair in three books.
 * At least one pair now FAILs. This names WHICH.
 *
 * It uses the TEST'S OWN helpers (mtOutputSegmentFiles / enCounterpart) so the population
 * is identical to the one the assertion walks — a lookalike glob would answer a different
 * question. And it prints the population it examined, so "0 failures" can be told apart
 * from "it examined nothing".
 */
import fs from 'node:fs';
import { runCheck, VERDICT } from '../../tools/lib/remt-battery.js';
import { A2b } from '../../tools/lib/remt-checks-mt.js';
import { mtOutputSegmentFiles, enCounterpart } from '../../tools/__tests__/helpers/remt-corpus.js';

console.log(`A2b: blocking=${A2b.blocking} tier=${A2b.tier}`);

const BOOKS = ['efnafraedi-2e', 'lifraen-efnafraedi', 'orverufraedi'];
const read = (p) => fs.readFileSync(p, 'utf8');

let pairs = 0, examined = 0, noEn = 0;
const bad = [];
const byBook = {};
for (const b of BOOKS) {
  const files = mtOutputSegmentFiles(b);
  byBook[b] = files.length;
  for (const f of files) {
    const en = enCounterpart(f);
    if (!en) { noEn++; continue; }
    const r = await runCheck(A2b, { isText: read(f), segText: read(en) });
    pairs++;
    examined += r.examined || 0;
    if (r.verdict !== VERDICT.PASS) {
      bad.push({ f, verdict: r.verdict, examined: r.examined, message: r.message || '' });
    }
  }
}

console.log(`\nPOPULATION (control): ${JSON.stringify(byBook)}  pairs=${pairs} examined=${examined} noEnCounterpart=${noEn}`);
if (pairs === 0) console.log('⚠️ examined NOTHING — the result below is meaningless');
console.log(`\nNON-PASS pairs: ${bad.length}`);
for (const x of bad) {
  console.log(`\n  ${x.verdict}  ${x.f}   examined=${x.examined}`);
  console.log(`    ${String(x.message).slice(0, 900)}`);
}
