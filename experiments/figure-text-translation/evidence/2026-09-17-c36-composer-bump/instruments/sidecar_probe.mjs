// §C140 ㊱ — read-only probe of every committed figure sidecar under the CURRENT COMPOSER_VERSION.
//   node experiments/figure-text-translation/evidence/2026-09-17-c36-composer-bump/instruments/sidecar_probe.mjs
// Prints, per book: sidecar count, key sets, composedVersion/composerVersion values, composedHash===renderHash,
// state keys, and isStale (tools/figure-run.js's own function) true/false counts. Terminal line `PROBE-DONE`.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..', '..');
const S = require(path.join(REPO, 'tools/lib/figure-text-sidecar.cjs'));
const { isStale } = await import(path.join(REPO, 'tools/figure-run.js'));
console.log(`COMPOSER_VERSION=${JSON.stringify(S.COMPOSER_VERSION)}`);
for (const book of ['efnafraedi-2e', '__e2e-fixture__']) {
  const dir = path.join(REPO, 'books', book, 'figure-text');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.is.json')).sort();
  const tally = (f) => files.reduce((m, n) => { const k = f(JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'))); m[k] = (m[k] || 0) + 1; return m; }, {});
  console.log(`${book}: ${files.length} sidecars`);
  console.log('  keys            ', JSON.stringify(tally((s) => Object.keys(s).join(','))));
  console.log('  composedVersion ', JSON.stringify(tally((s) => String(s.composedVersion))));
  console.log('  composerVersion ', JSON.stringify(tally((s) => String(s.composerVersion))));
  console.log('  composed==render', JSON.stringify(tally((s) => String(s.composedHash !== undefined && s.composedHash === s.renderHash))));
  console.log('  has state       ', JSON.stringify(tally((s) => String('state' in s))));
  console.log('  isStale         ', JSON.stringify(tally((s) => String(isStale(s)))));
}
console.log('PROBE-DONE');
