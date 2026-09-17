// §C140 ⑥a build — Task 6 (R7 pin-fix re-run) — copied from instruments/npm_compare.cjs (this
// build's own Task 4 copy) with output paths repointed to *-after-pin-fix.txt so Task 4's own
// files (npm-failing-by-name.txt, npm-compare.txt — the pre-pin-fix 37 run) are never
// overwritten. This run is against the tree AFTER the R7 pin fix (commit e554f69c), on top of
// Task 5's recompose (c091dd4e). Baseline read is unchanged: reports/before/npm-failing-by-name.txt
// (36 names, copied from ④'s own after run).
const fs = require('fs');
const path = require('path');
const JSON_FILE = process.argv[2];
const r = require(JSON_FILE);
const E = 'experiments/figure-text-translation/evidence/2026-09-17-c6a-build/reports';
const now = [];
for (const f of r.testResults)
  for (const a of f.assertionResults)
    if (a.status === 'failed')
      now.push(path.relative(process.cwd(), f.name) + ' :: ' + a.ancestorTitles.concat(a.title).join(' '));
now.sort();
fs.writeFileSync(E + '/after/npm-failing-by-name-after-pin-fix.txt', now.join('\n') + '\n');
const before = fs.readFileSync(E + '/before/npm-failing-by-name.txt', 'utf8').trim().split('\n');
const died = r.testResults
  .filter((f) => f.status === 'failed' && !f.assertionResults.some((a) => a.status === 'failed'))
  .map((f) => path.relative(process.cwd(), f.name) + (f.message ? `  — ${f.message.split('\n')[0]}` : ''));
const planted = [...now, 'tools/__tests__/zz.test.js :: planted'];
const out = [];
out.push('# §C140 ⑥a build — Task 6 re-run AFTER the R7 pin fix (e554f69c), compared BY NAME with the ④-after baseline');
out.push('# command (repo root): npx vitest run --reporter=json --outputFile=<scratch>/vitest-after-pin.json');
out.push('# comparison: task-6-brief.md R7, output written to *-after-pin-fix.txt so Task 4\'s files are untouched');
out.push(`vitest JSON: numTotalTestSuites=${r.numTotalTestSuites} numTotalTests=${r.numTotalTests} numPassedTests=${r.numPassedTests} numFailedTests=${r.numFailedTests} numFailedTestSuites=${r.numFailedTestSuites} success=${r.success}`);
out.push(`test files in JSON: ${r.testResults.length}`);
out.push(`now ${now.length} before ${before.length}`);
out.push('only-now ' + JSON.stringify(now.filter((n) => !before.includes(n))));
out.push('only-before ' + JSON.stringify(before.filter((n) => !now.includes(n))));
out.push('files that died without a failing test: ' + JSON.stringify(died));
out.push('CONTROL planted shows as only-now: ' + JSON.stringify(planted.filter((n) => !before.includes(n))));
out.push('');
out.push('## now (failing names)');
out.push(...now);
out.push('');
out.push('## before (reports/before/npm-failing-by-name.txt)');
out.push(...before);
fs.writeFileSync(E + '/after/npm-compare-after-pin-fix.txt', out.join('\n') + '\n');
console.log(out.slice(0, 10).join('\n'));
