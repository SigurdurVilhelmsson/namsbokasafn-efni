// §C140 ㊱ B1 — failing names of ONE vitest file compared with the baseline names for that file.
//   node experiments/figure-text-translation/evidence/2026-09-17-c36-composer-bump/instruments/frf_compare.cjs <vitest.json> <out.txt>
// (repo root; the JSON from `npx vitest run tools/__tests__/figure-run-free.test.js --reporter=json --outputFile=<vitest.json>`)
// Committed after the final review found B1's report had been written by an inline, unrecorded `node -e`; this is that code.
const path = require('path');
const fs = require('fs');
const r = require(path.resolve(process.argv[2]));
const now = [];
for (const f of r.testResults)
  for (const a of f.assertionResults)
    if (a.status === 'failed') now.push(path.relative(process.cwd(), f.name) + ' :: ' + a.ancestorTitles.concat(a.title).join(' '));
now.sort();
const base = fs
  .readFileSync('experiments/figure-text-translation/evidence/2026-09-17-c36-composer-bump/reports/before/npm-failing-by-name.txt', 'utf8')
  .trim().split('\n').filter((n) => n.startsWith('tools/__tests__/figure-run-free.test.js'));
const out = [];
out.push('# bump-only (be19b3a5): tools/__tests__/figure-run-free.test.js alone, failing names vs the baseline names for that file');
out.push('tests ' + r.numTotalTests + ' passed ' + r.numPassedTests + ' failed ' + r.numFailedTests);
out.push('now ' + now.length + ' baseline(file) ' + base.length);
out.push('only-now (newly red) ' + JSON.stringify(now.filter((n) => !base.includes(n)), null, 1));
out.push('only-baseline (newly green) ' + JSON.stringify(base.filter((n) => !now.includes(n)), null, 1));
out.push('still red ' + JSON.stringify(now.filter((n) => base.includes(n)), null, 1));
fs.writeFileSync(process.argv[3], out.join('\n') + '\n');
console.log(out.join('\n'));
