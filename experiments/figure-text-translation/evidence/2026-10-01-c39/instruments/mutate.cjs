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
  ['M1 selection reverted to sidecar-only', DRIVER,
    'records.filter((r) => r.sidecar || r.sidecarUnreadable || mapped.has(r.basename))',
    'records.filter((r) => r.sidecar || r.sidecarUnreadable)'],
  ['M2 --stale selects every figure', DRIVER,
    'records.filter((r) => r.sidecar || r.sidecarUnreadable || mapped.has(r.basename))',
    'records'],
  ['M3 refusal deleted', DRIVER, '        if (args.stale) {\n', '        if (false) {\n'],
  ['M4 refusal live-only', DRIVER, '        if (args.stale) {\n', '        if (args.stale && !args.dryRun) {\n'],
  ['M5 would-buy list keeps refused figures', DRIVER,
    "result.figures.filter((f) => f.billable && f.outcome !== 'skipped-unbought')",
    'result.figures.filter((f) => f.billable)'],
  ['M6 verdict NOTE removed', OUTCOMES, "  if (tally['skipped-unbought'] > 0) {\n", '  if (false) {\n'],
  ['M7 outcome dropped from the vocabulary', OUTCOMES, "  'skipped-unbought',\n];", '];'],
  ['M8 refused list not printed', DRIVER, '  if (refused.length) {\n', '  if (false) {\n'],
  ['M9 not-selected line reverted to the old false claim', DRIVER,
    '      `  --stale: ${result.deselected} figure(s) in this chapter have no sidecar and no ` +\n' +
    '        `image-mapping row and were not selected — no composed copy of ours is served for ` +\n' +
    '        `them, so no recompose changes what readers see.`',
    '      `  --stale: ${result.deselected} figure(s) in this chapter have no sidecar and were not ` +\n' +
    '        `selected. They are the ones a run WITHOUT --stale would buy.`'],
  ['M10 refusal also hits figures WITH a sidecar', DRIVER,
    "      if (rec.outcome === 'translated' && !rec.sidecar) {\n        rec.billable = billableFrom(outDir);\n",
    "      if (rec.outcome === 'translated') {\n        if (!rec.sidecar) rec.billable = billableFrom(outDir);\n"],
  // NOT a mutant: a probe that MEASURES the doc claim "--force, like a plain run, still buys a
  // figure with no sidecar file". Expected outcome: the probe test PASSES.
  ['PROBE --force buys a sidecar-less figure', PAID,
    "  it('recomposes a textless figure that has a mapping row and no sidecar', async () => {\n",
    "  it('PROBE --force buys a sidecar-less figure', async () => {\n" +
    "    const b = makeBook({ figures: ['FIG_REBUY'], mapping: [row('FIG_REBUY')] });\n" +
    '    const spawn = fakeSpawn();\n' +
    '    await runFigures(live(b.booksRoot, { force: true }), { spawn, booksRoot: b.booksRoot });\n' +
    "    expect(spawn.outDirsFor('translate')).toEqual(['FIG_REBUY']);\n" +
    '  });\n\n' +
    "  it('recomposes a textless figure that has a mapping row and no sidecar', async () => {\n"],
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
