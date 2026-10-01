// Mutation harness v3 for §C140 ㊴ — several edits per entry. Golden copies, exact-once anchors,
// restore + byte-compare after EVERY round (never `git checkout`), final compare vs golden.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = process.argv[2];
const SP = process.argv[3];
const DRIVER = path.join(REPO, 'tools/figure-run.js');
const OUTCOMES = path.join(REPO, 'tools/lib/figure-outcomes.js');
const PAID = path.join(REPO, 'tools/__tests__/figure-run-paid.test.js');
const TESTS = [
  'tools/__tests__/figure-run-paid.test.js',
  'tools/__tests__/figure-outcomes.test.js',
  'tools/__tests__/figure-run-free.test.js',
];
const FILES = [DRIVER, OUTCOMES, PAID];
const golden = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(f)]));
for (const f of FILES) fs.writeFileSync(path.join(SP, `golden3-${path.basename(f)}`), golden[f]);

const SEL = 'records.filter((r) => r.sidecar || r.sidecarUnreadable || mapped.has(r.basename))';
const REFUSAL = '        if (args.stale) {\n          rec.outcome = \'skipped-unbought\';';
const BUYABLE = "result.figures.filter((f) => f.billable && f.outcome !== 'skipped-unbought')";
const NOT_SELECTED =
  '      `  --stale: ${result.deselected} figure(s) in this chapter have no sidecar and no ` +\n' +
  '        `basename-keyed image-mapping row and were not selected — no composed copy of ours is ` +\n' +
  '        `served for them, so no recompose changes what readers see. Not classified either: a ` +\n' +
  '        `plain --dry-run does that.`';
const PROBE_ANCHOR = "  it('recomposes a textless figure that has a mapping row and no sidecar', async () => {\n";

const M = [
  ['M1 selection reverted to sidecar-only', [[DRIVER, SEL, 'records.filter((r) => r.sidecar || r.sidecarUnreadable)']]],
  ['M2 --stale selects every figure', [[DRIVER, SEL, 'records']]],
  ['M3 refusal deleted (backstop throws instead)', [[DRIVER, REFUSAL, "        if (false) {\n          rec.outcome = 'skipped-unbought';"]]],
  ['M4 refusal live-only', [[DRIVER, REFUSAL, "        if (args.stale && !args.dryRun) {\n          rec.outcome = 'skipped-unbought';"]]],
  ['M5 would-buy list keeps refused figures', [[DRIVER, BUYABLE, 'result.figures.filter((f) => f.billable)']]],
  ['M6 verdict NOTE removed', [[OUTCOMES, "  if (tally['skipped-unbought'] > 0) {\n", '  if (false) {\n']]],
  ['M7 outcome dropped from the vocabulary', [[OUTCOMES, "  'skipped-unbought',\n];", '];']]],
  ['M8 refused list not printed', [[DRIVER, '  if (refused.length) {\n', '  if (false) {\n']]],
  ['M9 not-selected line reverted to the old false claim', [[DRIVER, NOT_SELECTED,
    '      `  --stale: ${result.deselected} figure(s) in this chapter have no sidecar and were not ` +\n' +
    '        `selected. They are the ones a run WITHOUT --stale would buy.`']]],
  ['M10 refusal also hits figures WITH a sidecar', [[DRIVER,
    "      if (rec.outcome === 'translated' && !rec.sidecar) {\n        rec.billable = billableFrom(outDir);\n",
    "      if (rec.outcome === 'translated') {\n        if (!rec.sidecar) rec.billable = billableFrom(outDir);\n"]]],
  ['C1 refusal exempts --force', [[DRIVER, REFUSAL, "        if (args.stale && !args.force) {\n          rec.outcome = 'skipped-unbought';"]]],
  ['C2 refusal exempts --figure', [[DRIVER, REFUSAL, "        if (args.stale && !args.figures) {\n          rec.outcome = 'skipped-unbought';"]]],
  ['C3 refusal exempts --module', [[DRIVER, REFUSAL, "        if (args.stale && !args.modules) {\n          rec.outcome = 'skipped-unbought';"]]],
  ['C4 NOTE needs 2+ refusals', [[OUTCOMES, "  if (tally['skipped-unbought'] > 0) {\n", "  if (tally['skipped-unbought'] > 1) {\n"]]],
  ['C6 live buyable list keeps refused', [[DRIVER, BUYABLE,
    "result.figures.filter((f) => f.billable && (f.outcome !== 'skipped-unbought' || result.mode === 'live'))"]]],
  // NOT a mutant to kill: with the per-figure refusal DELETED, the spend-site backstop must still
  // stop the purchase. The probe test must PASS: the run throws the backstop's message, 0 translate.
  ['PROBE backstop holds with the loop refusal deleted', [
    [DRIVER, REFUSAL, "        if (false) {\n          rec.outcome = 'skipped-unbought';"],
    [PAID, PROBE_ANCHOR,
      "  it('PROBE backstop', async () => {\n" +
      '    const s = rebuyBook();\n' +
      '    const spawn = fakeSpawn();\n' +
      '    await expect(\n' +
      '      runFigures(live(s.booksRoot, { stale: true }), { spawn, booksRoot: s.booksRoot })\n' +
      '    ).rejects.toThrow(/refusing to buy FIG_REBUY under --stale/);\n' +
      "    expect(spawn.countOf('translate')).toBe(0);\n" +
      '  });\n\n' + PROBE_ANCHOR],
  ]],
  // NOT a mutant: measures the corrected docs' claim that `--force`, like a plain run, buys a
  // figure with NO sidecar. The probe test must PASS.
  ['PROBE --force buys a sidecar-less figure', [
    [PAID, PROBE_ANCHOR,
      "  it('PROBE force buys', async () => {\n" +
      '    const s = rebuyBook();\n' +
      '    const spawn = fakeSpawn();\n' +
      '    await runFigures(live(s.booksRoot, { force: true }), { spawn, booksRoot: s.booksRoot });\n' +
      "    expect(spawn.outDirsFor('translate')).toEqual(['FIG_REBUY']);\n" +
      '  });\n\n' + PROBE_ANCHOR],
  ]],
];

function restoreAndCheck() {
  for (const f of FILES) {
    fs.writeFileSync(f, golden[f]);
    if (!fs.readFileSync(f).equals(golden[f])) throw new Error(`RESTORE FAILED: ${f}`);
  }
}

const results = [];
try {
  for (const [id, edits] of M) {
    const staged = new Map();
    let bad = null;
    for (const [file, find, replace] of edits) {
      const src = (staged.get(file) || golden[file].toString('utf-8'));
      const hits = src.split(find).length - 1;
      if (hits !== 1) { bad = `ANCHOR FOUND ${hits}x in ${path.basename(file)} — NOT RUN`; break; }
      staged.set(file, src.replace(find, replace));
    }
    if (bad) { results.push({ id, status: bad }); continue; }
    for (const [file, text] of staged) fs.writeFileSync(file, text);
    const out = path.join(SP, `mut3-${id.split(' ')[0]}.json`);
    const run = spawnSync('npx', ['vitest', 'run', ...TESTS, '--reporter=json', `--outputFile=${out}`], {
      cwd: REPO, encoding: 'utf-8', timeout: 900_000,
    });
    restoreAndCheck(); // BEFORE reading results: a crash below must not strand the mutant
    let failed = [];
    let passedNames = [];
    let total = null;
    try {
      const j = JSON.parse(fs.readFileSync(out, 'utf-8'));
      total = j.numTotalTests;
      for (const tf of j.testResults) for (const a of tf.assertionResults) {
        if (a.status === 'passed') passedNames.push(a.title); else failed.push(a.title);
      }
    } catch (e) {
      failed = [`(no JSON report: exit ${run.status}, signal ${run.signal})`];
    }
    const probeTitle = (edits.map((e) => e[2]).join('').match(/it\('(PROBE [^']+)'/) || [])[1];
    results.push({ id, exit: run.status, total, failed, probePassed: Boolean(probeTitle) && passedNames.includes(probeTitle) });
  }
} finally {
  restoreAndCheck();
}

for (const r of results) {
  let verdict;
  if (r.status) verdict = r.status;
  else if (r.id.startsWith('PROBE')) verdict = r.probePassed ? 'PROBE PASSED' : 'PROBE FAILED';
  else verdict = r.failed.length ? 'KILLED' : '*** SURVIVED ***';
  console.log(`${verdict.padEnd(16)} ${r.id}  [exit ${r.exit}, ${r.total} tests, ${r.failed ? r.failed.length : 0} failing]`);
  if (!r.id.startsWith('PROBE')) for (const t of (r.failed || []).slice(0, 4)) console.log(`                   - ${t}`);
}
console.log('FINAL golden compare:', FILES.every((f) => fs.readFileSync(f).equals(golden[f])) ? 'identical' : 'DIFFERS');
