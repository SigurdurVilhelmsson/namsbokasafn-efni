/**
 * Would strategy 3 have repaired the 6 real corruptions?
 *
 * Runs the real `repairSegTags` over every committed EN/IS pair and reports, by
 * VALUE, which ids it would have corrected — and, as the control that makes the
 * result mean anything, how many pairs it leaves untouched.
 *
 * ⚠️ This is a COUNTERFACTUAL. `repairSegTags` runs on freshly returned MT output;
 * the committed files were written before it existed. So a green result here means
 * "the class is closed for future buys", NOT "the 6 on disk are fixed".
 */
import fs from 'node:fs';
import { repairSegTags } from '../../tools/api-translate.js';
import { mtOutputSegmentFiles, enCounterpart } from '../../tools/__tests__/helpers/remt-corpus.js';

const TAG = /<!-- SEG:(\S+?) -->/g;
const ids = (t) => [...t.matchAll(TAG)].map((m) => m[1]);
const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => p.replace(/^.*\/books\//, 'books/');

let pairs = 0, unchanged = 0, repaired = 0, stillBroken = 0;
const details = [];

for (const b of ['efnafraedi-2e', 'lifraen-efnafraedi', 'orverufraedi']) {
  for (const f of mtOutputSegmentFiles(b)) {
    const en = enCounterpart(f);
    if (!en) continue;
    pairs++;
    const input = read(en), output = read(f);
    const fixed = repairSegTags(input, output);
    if (fixed === output) { unchanged++; continue; }

    const before = ids(output), after = ids(fixed), src = new Set(ids(input));
    const wasBad = before.filter((x) => !src.has(x));
    const nowBad = after.filter((x) => !src.has(x));
    repaired++;
    if (nowBad.length) stillBroken++;
    details.push(
      `${rel(f)}\n     unmatched before: ${wasBad.length}  after: ${nowBad.length}` +
      wasBad.map((x, i) => `\n       ${x}  ->  ${after[before.indexOf(x)]}`).join('')
    );
  }
}

console.log(`POPULATION (control): pairs=${pairs}`);
console.log(`  untouched by the repair: ${unchanged}   <-- must be the vast majority, or the repair is over-firing`);
console.log(`  files the repair CHANGED: ${repaired}`);
console.log(`  files still carrying an unmatched id after repair: ${stillBroken}`);
console.log('');
details.forEach((d) => console.log('  ' + d));
