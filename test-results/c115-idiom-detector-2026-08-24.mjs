/**
 * §C115 detector — enumerate every `[^>]*`-delimited open-tag regex in the
 * pipeline tools, and classify mechanically into:
 *   A  = match an open tag, then read an ATTRIBUTE out of that span  (the silent-empty shape)
 *   B  = strip/skip tags, no attribute read                          (over-consume, visible)
 *   ?  = needs human/agent classification
 * The classification is a CANDIDATE list; agents verify. Range is stated, not implied.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const FILES = globSync('tools/*.js').concat(globSync('tools/lib/*.js'));

// a regex literal containing [^>]*  (or [^>]+)
const LIT = /\/(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuy]*/g;

let total = 0;
const rows = [];
for (const f of FILES) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return; // comments
    const lits = line.match(LIT) || [];
    for (const lit of lits) {
      if (!lit.includes('[^>]')) continue;
      total++;
      // does it look like an OPEN TAG matcher (has `<tag` before the [^>]) ?
      const openTag = /<\\?[a-zA-Z]/.test(lit) || /<\[a-z/.test(lit);
      // strip-shaped: /<[^>]*>/ with nothing else
      const strip = /^\/<\[\^>\]\*>\/[gimsuy]*$/.test(lit);
      rows.push({ file: f, line: i + 1, lit: lit.slice(0, 90), openTag, strip });
    }
  });
}
const A = rows.filter((r) => r.openTag && !r.strip);
const B = rows.filter((r) => r.strip);
const O = rows.filter((r) => !r.openTag && !r.strip);
console.log(`RANGE: ${FILES.length} files (tools/*.js + tools/lib/*.js). Excludes: server/, scripts/, tests, comments.`);
console.log(`total [^>] regex literals: ${total}`);
console.log(`  named-open-tag candidates (Population A candidates): ${A.length}`);
console.log(`  bare strip /<[^>]*>/ (Population B):                  ${B.length}`);
console.log(`  other:                                                ${O.length}`);
console.log('\n--- Population A candidates ---');
for (const r of A) console.log(`${r.file}:${r.line}  ${r.lit}`);
console.log('\n--- other (needs classification) ---');
for (const r of O) console.log(`${r.file}:${r.line}  ${r.lit}`);
