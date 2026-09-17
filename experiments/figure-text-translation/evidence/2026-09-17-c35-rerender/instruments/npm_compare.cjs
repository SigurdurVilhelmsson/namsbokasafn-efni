// §C140 ㉟ — full root vitest compared BY NAME with main's local floor.
// Baseline: evidence/2026-09-17-c36-composer-bump/reports/after/npm-failing-by-name.txt (36 names, the ㊱ branch
// whose code merged to main as 38dec598; this branch changes only books/ data, experiments/ and docs/).
//   node npm_compare.cjs <vitest.json> <out-dir>   (run from the repo root)
const fs = require('fs');
const path = require('path');
const [JSON_FILE, OUT] = process.argv.slice(2);
const r = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
const BASE = 'experiments/figure-text-translation/evidence/2026-09-17-c36-composer-bump/reports/after/npm-failing-by-name.txt';
const now = [];
for (const f of r.testResults)
  for (const a of f.assertionResults)
    if (a.status === 'failed')
      now.push(path.relative(process.cwd(), f.name) + ' :: ' + a.ancestorTitles.concat(a.title).join(' '));
now.sort();
const before = fs.readFileSync(BASE, 'utf8').trim().split('\n');
const died = r.testResults
  .filter((f) => f.status === 'failed' && !f.assertionResults.some((a) => a.status === 'failed'))
  .map((f) => path.relative(process.cwd(), f.name) + (f.message ? `  — ${f.message.split('\n')[0]}` : ''));
const planted = [...now, 'tools/__tests__/zz.test.js :: planted'];
const out = [
  '# §C140 ㉟ — full root vitest compared BY NAME with main\'s local floor (㊱ after-list)',
  `vitest JSON: numTotalTestSuites=${r.numTotalTestSuites} numTotalTests=${r.numTotalTests} numPassedTests=${r.numPassedTests} numFailedTests=${r.numFailedTests} numFailedTestSuites=${r.numFailedTestSuites} success=${r.success}`,
  `test files in JSON: ${r.testResults.length}`,
  `now ${now.length} before ${before.length}`,
  'only-now ' + JSON.stringify(now.filter((n) => !before.includes(n))),
  'only-before ' + JSON.stringify(before.filter((n) => !now.includes(n))),
  'files that died without a failing test: ' + JSON.stringify(died),
  'CONTROL planted shows as only-now: ' + JSON.stringify(planted.filter((n) => !before.includes(n))),
  'COMPARE-COMPLETE',
];
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'npm-failing-by-name.txt'), now.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'npm-compare.txt'), out.join('\n') + '\n');
console.log(out.join('\n'));
