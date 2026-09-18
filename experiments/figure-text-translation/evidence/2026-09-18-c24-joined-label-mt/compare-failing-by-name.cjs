// Compare two vitest JSON reports BY NAME, both directions, at test and file level.
// Usage: node compare.cjs <floor.json> <floorRoot> <branch.json> <branchRoot>
const [floorPath, floorRoot, branchPath, branchRoot] = process.argv.slice(2);
function failing(p, root) {
  const r = require(p);
  const tests = new Set();
  const files = new Set();
  for (const f of r.testResults) {
    const rel = f.name.startsWith(root) ? f.name.slice(root.length).replace(/^\//, '') : f.name;
    if (f.status === 'failed') files.add(rel);
    for (const a of f.assertionResults || []) {
      if (a.status === 'failed') tests.add(`${rel} :: ${a.fullName}`);
    }
  }
  return { tests, files, total: r.numTotalTests, failed: r.numFailedTests };
}
const F = failing(floorPath, floorRoot);
const B = failing(branchPath, branchRoot);
const only = (a, b) => [...a].filter((x) => !b.has(x));
// Positive control for the comparator itself: the parser must reproduce each report's own count.
console.log('parser control:', F.tests.size === F.failed, B.tests.size === B.failed);
console.log({ floorTotal: F.total, floorFailed: F.tests.size, branchTotal: B.total, branchFailed: B.tests.size });
console.log('only-branch tests:', only(B.tests, F.tests));
console.log('only-floor tests:', only(F.tests, B.tests));
console.log('files floor/branch:', F.files.size, B.files.size);
console.log('only-branch files:', only(B.files, F.files));
console.log('only-floor files:', only(F.files, B.files));
