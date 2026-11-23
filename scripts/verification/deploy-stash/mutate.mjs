// Prove check.mjs can fail: apply each mutant to a TEMP COPY of scripts/deploy.sh (never the real file),
// run `check.mjs --deploy <copy>`, and expect it to fail with the named scenario among the changed rows.
// BREAK mutants remove something steps 2-4 rely on; FIX mutants close a finding, so a real fix is seen
// (the pinned row changes and the pin must be updated on purpose).
//
// Usage: node scripts/verification/deploy-stash/mutate.mjs   (about a minute and a half: one full check per mutant)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const DEPLOY = path.join(repo, 'scripts/deploy.sh');
const before = fs.readFileSync(DEPLOY);
const src = before.toString('utf8');

const MUTANTS = [
  {
    label: 'BREAK step 4 never pops the stash',
    from: '  if git stash pop; then',
    to: '  if true; then',
    expect: 'clean|write:none|untracked:no|lock:none',
  },
  {
    label: 'BREAK step 2 never stashes (the pull meets a dirty tree)',
    from: '  git stash push -m "deploy-$(date +%Y%m%d-%H%M%S)"',
    to: '  :',
    expect: 'clean|write:none|untracked:no|lock:none',
  },
  {
    label: 'BREAK the ours merge driver is not registered',
    from: 'git config merge.ours.driver true\n',
    to: '',
    expect: 'manifest|write:none|untracked:no|lock:none',
  },
  {
    // The control for check.mjs's lost-change count: a mutant that really loses changes must
    // make that count non-zero, or the "0" it prints on the real script proves nothing.
    label: 'BREAK step 4 drops the stash instead of popping it',
    from: '  if git stash pop; then',
    to: '  if git stash drop; then',
    expect: 'clean|write:none|untracked:no|lock:none',
    expectLost: true,
  },
  {
    label: 'FIX a failed pull puts the stash back before exiting',
    from: 'git pull --rebase origin main\n',
    to: 'git pull --rebase origin main || { if [ "$STASHED" -eq 1 ]; then git stash pop; fi; exit 1; }\n',
    expect: 'unreachable|write:none|untracked:no|lock:none',
  },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-stash-mutants-'));
let fail = 0;
try {
  for (const m of MUTANTS) {
    const n = src.split(m.from).length - 1;
    if (n !== 1) {
      console.log(`ANCHOR: ${m.label}: found ${n} times in scripts/deploy.sh — update mutate.mjs`);
      fail = 1;
      continue;
    }
    const copy = path.join(tmp, 'deploy.sh');
    fs.writeFileSync(copy, src.replace(m.from, m.to));
    const r = spawnSync(process.execPath, [path.join(here, 'check.mjs'), '--deploy', copy], {
      encoding: 'utf8',
      timeout: 300000,
    });
    const out = `${r.stdout}${r.stderr}`;
    const lost = Number((out.match(/gone from every place looked at: (\d+)/) ?? [])[1] ?? NaN);
    const lostOk = m.expectLost ? lost > 0 : true;
    if (r.status === 1 && out.includes(`CHANGED ${m.expect}\n`) && lostOk) {
      console.log(`seen  ${m.label}${m.expectLost ? ` (lost-change count ${lost})` : ''}`);
    } else {
      console.log(`MISSED ${m.label}: exit ${r.status}, expected a CHANGED row for ${m.expect}`);
      console.log(
        out
          .split('\n')
          .filter((l) => /CHANGED|Error|FAIL/.test(l))
          .slice(0, 6)
          .map((l) => `    ${l}`)
          .join('\n')
      );
      fail = 1;
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
const untouched = fs.readFileSync(DEPLOY).equals(before);
console.log(`scripts/deploy.sh untouched: ${untouched ? 'yes' : 'NO'}`);
process.exitCode = fail || !untouched ? 1 : 0;
