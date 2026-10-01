// Mutation harness for §C140 ㊴. Golden copies, exact-once anchors, restore + byte-compare after
// EVERY round (never `git checkout`), and a final compare against the golden AND against HEAD.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = process.argv[2];
const SP = process.argv[3];
const DRIVER = path.join(REPO, 'tools/figure-run.js');
const OUTCOMES = path.join(REPO, 'tools/lib/figure-outcomes.js');
const PAID = path.join(REPO, 'tools/__tests__/figure-run-paid.test.js');
const TESTS = ['tools/__tests__/figure-run-paid.test.js', 'tools/__tests__/figure-outcomes.test.js'];
const FILES = [DRIVER, OUTCOMES, PAID];
const golden = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(f)]));
for (const f of FILES) fs.writeFileSync(path.join(SP, `golden-${path.basename(f)}`), golden[f]);

const M = [
  ['C1 refusal exempts --force', DRIVER, '        if (args.stale) {\n', '        if (args.stale && !args.force) {\n'],
  ['C2 refusal exempts --figure', DRIVER, '        if (args.stale) {\n', '        if (args.stale && !args.figures) {\n'],
  ['C3 refusal exempts --module', DRIVER, '        if (args.stale) {\n', '        if (args.stale && !args.modules) {\n'],
  ['C4 NOTE needs 2+ refusals', OUTCOMES, "  if (tally['skipped-unbought'] > 0) {\n", "  if (tally['skipped-unbought'] > 1) {\n"],
  ['C6 live buyable list keeps refused', DRIVER,
    "result.figures.filter((f) => f.billable && f.outcome !== 'skipped-unbought')",
    "result.figures.filter((f) => f.billable && (f.outcome !== 'skipped-unbought' || result.mode === 'live'))"],
];
function restoreAndCheck() {
  for (const f of FILES) {
    fs.writeFileSync(f, golden[f]);
    if (!fs.readFileSync(f).equals(golden[f])) throw new Error(`RESTORE FAILED: ${f}`);
  }
}

const results = [];
try {
  for (const [id, file, find, replace] of M) {
    const src = golden[file].toString('utf-8');
    const hits = src.split(find).length - 1;
    if (hits !== 1) {
      results.push({ id, status: `ANCHOR FOUND ${hits}x — NOT RUN` });
      continue;
    }
    fs.writeFileSync(file, src.replace(find, replace));
    const out = path.join(SP, `mut-${id.split(' ')[0]}.json`);
    const run = spawnSync('npx', ['vitest', 'run', ...TESTS, '--reporter=json', `--outputFile=${out}`], {
      cwd: REPO, encoding: 'utf-8', timeout: 600_000,
    });
    restoreAndCheck(); // BEFORE reading results: a crash below must not strand the mutant
    let failed = [];
    let total = null;
    try {
      const j = JSON.parse(fs.readFileSync(out, 'utf-8'));
      total = j.numTotalTests;
      for (const tf of j.testResults) for (const a of tf.assertionResults)
        if (a.status !== 'passed') failed.push(a.title);
    } catch (e) {
      failed = [`(no JSON report: exit ${run.status}, signal ${run.signal})`];
    }
    results.push({ id, exit: run.status, total, failed });
  }
} finally {
  restoreAndCheck();
}

for (const r of results) {
  const killed = r.failed && r.failed.length > 0;
  const verdict = r.status || (r.id.startsWith('PROBE') ? (killed ? 'PROBE FAILED' : 'PROBE PASSED')
    : (killed ? 'KILLED' : '*** SURVIVED ***'));
  console.log(`${verdict.padEnd(16)} ${r.id}  [exit ${r.exit}, ${r.total} tests]`);
  for (const t of r.failed || []) console.log(`                   - ${t}`);
}
console.log('FINAL golden compare:', FILES.every((f) => fs.readFileSync(f).equals(golden[f])) ? 'identical' : 'DIFFERS');
