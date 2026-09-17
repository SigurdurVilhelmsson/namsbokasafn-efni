// §C140 ④ build — Step 6's by-name vitest comparison, copied from
// evidence/2026-09-16-c7-build/instruments/npm_compare.cjs (the ⑦ fix wave's own by-name
// comparison; controller ruling R2) with BOTH paths repointed at THIS build's evidence
// folder: output to reports/after/… and the baseline read from reports/before/…, never the
// c7 folder.
const fs = require('fs');
const path = require('path');
const JSON_FILE = process.argv[2];
const r = require(JSON_FILE);
const E = 'experiments/figure-text-translation/evidence/2026-09-17-c4-build/reports';
const now = [];
for (const f of r.testResults)
  for (const a of f.assertionResults)
    if (a.status === 'failed')
      now.push(path.relative(process.cwd(), f.name) + ' :: ' + a.ancestorTitles.concat(a.title).join(' '));
now.sort();
fs.writeFileSync(E + '/after/npm-failing-by-name.txt', now.join('\n') + '\n');
const before = fs.readFileSync(E + '/before/npm-failing-by-name.txt', 'utf8').trim().split('\n');
const died = r.testResults
  .filter((f) => f.status === 'failed' && !f.assertionResults.some((a) => a.status === 'failed'))
  .map((f) => path.relative(process.cwd(), f.name) + (f.message ? `  — ${f.message.split('\n')[0]}` : ''));
const planted = [...now, 'tools/__tests__/zz.test.js :: planted'];
const out = [];
out.push('# §C140 ④ build — full root vitest compared BY NAME with the Task 1 baseline');
out.push('# command (repo root): npx vitest run --reporter=json --outputFile=<scratch>/vitest-after.json');
out.push('# comparison: task-3-brief.md Step 6, with every result written here instead of the console');
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
fs.writeFileSync(E + '/after/npm-compare.txt', out.join('\n') + '\n');
console.log(out.slice(0, 10).join('\n'));
