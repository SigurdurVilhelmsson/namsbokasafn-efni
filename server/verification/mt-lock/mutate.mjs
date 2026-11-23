// Prove replay.mjs can fail: apply each mutant to the REAL code, run the replay, and expect the named
// line. BREAK mutants remove a guard and must print "GUARD BROKEN: <guard>"; FIX mutants close a
// finding and must print "PINNED FINDING NO LONGER REPRODUCES: <finding>" (so a real fix is seen).
//
// Restore discipline (CLAUDE.md, mutation-test restore): golden copies are taken BEFORE the first
// mutation, in memory and ON DISK (a fresh mt-lock-mutate-golden-* directory under the OS temp dir, its
// path printed first), every round restores from them and compares byte for byte, and the end compares
// once more. Never git checkout / git stash. If this process dies mid-round, copy the three files back
// from the printed golden directory (each is stored under its repo-relative path) and compare.
//
// Usage: node server/verification/mt-lock/mutate.mjs   (nothing else may edit these files meanwhile)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const LOCK = path.join(repo, 'tools/lib/mt-lock.cjs');
const AT = path.join(repo, 'tools/api-translate.js');
const SWEEP = path.join(repo, 'server/e2e/helpers/mt-lock-sweep.js');
const golden = new Map([LOCK, AT, SWEEP].map((f) => [f, fs.readFileSync(f)]));
const goldenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-lock-mutate-golden-'));
for (const [f, bytes] of golden) {
  const dest = path.join(goldenDir, path.relative(repo, f));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
}
console.log(`golden copies: ${goldenDir}`);

const MUTANTS = [
  {
    label: "BREAK writeFreezeLock's exclusive create ('wx' -> 'w')",
    file: LOCK,
    from: "{ encoding: 'utf8', flag: 'wx' }",
    to: "{ encoding: 'utf8', flag: 'w' }",
    expect: "GUARD BROKEN: writeFreezeLock's exclusive create",
  },
  {
    label: 'BREAK writeMtLock loses its existsSync no-op',
    file: LOCK,
    from: '  if (fs.existsSync(lock)) return;\n',
    to: '',
    expect: 'GUARD BROKEN: writeMtLock leaves an existing freeze marker alone',
  },
  {
    label: 'BREAK isMtLocked reads an unreadable marker as unlocked',
    file: LOCK,
    from: '    return true; // indeterminate',
    to: '    return false; // indeterminate',
    expect: 'GUARD BROKEN: isMtLocked',
  },
  {
    label: 'BREAK mtRunDecision loses its lock rule',
    file: AT,
    from: "  if (locked) return 'locked-skip'; // absolute: editing has begun, never clobber\n",
    to: '',
    expect: 'GUARD BROKEN: mtRunDecision',
  },
  {
    label: 'BREAK the sweep ignores its snapshot',
    file: SWEEP,
    from: 'const ourLitter = known !== null && !known.has(rel);',
    to: 'const ourLitter = known !== null;',
    expect: 'GUARD BROKEN: F3 control',
  },
  {
    label: 'FIX F2: writeMtLock creates exclusively',
    file: LOCK,
    from: "  fs.writeFileSync(lock, body + '\\n', 'utf8');",
    to: "  fs.writeFileSync(lock, body + '\\n', { encoding: 'utf8', flag: 'wx' });",
    expect: 'PINNED FINDING NO LONGER REPRODUCES: F2',
  },
  {
    label: 'FIX F1: translateModule re-reads the lock before its write',
    file: AT,
    from: "  fs.writeFileSync(outputPath, r.output, 'utf8');",
    to: "  if (isMtLocked(outputPath)) throw new Error('locked during the run');\n  fs.writeFileSync(outputPath, r.output, 'utf8');",
    expect: 'PINNED FINDING NO LONGER REPRODUCES: F1',
  },
];

const count = (s, sub) => s.split(sub).length - 1;
const restoreAll = () => {
  for (const [f, bytes] of golden) fs.writeFileSync(f, bytes);
};
const allRestored = () => [...golden].every(([f, bytes]) => fs.readFileSync(f).equals(bytes));

let fail = 0;
try {
  for (const m of MUTANTS) {
    const src = golden.get(m.file).toString('utf8');
    const n = count(src, m.from);
    if (n !== 1) {
      console.log(
        `ANCHOR: ${m.label}: found ${n} times in ${path.relative(repo, m.file)} — update mutate.mjs`
      );
      fail = 1;
      continue;
    }
    fs.writeFileSync(m.file, src.replace(m.from, m.to));
    const r = spawnSync(process.execPath, [path.join(here, 'replay.mjs')], {
      encoding: 'utf8',
      timeout: 120000,
    });
    restoreAll();
    if (!allRestored()) {
      console.log(`RESTORE FAILED after: ${m.label} — stop and compare the files with git diff`);
      fail = 1;
      break;
    }
    const out = `${r.stdout}${r.stderr}`;
    if (r.status !== 0 && out.includes(m.expect)) console.log(`seen  ${m.label}`);
    else {
      console.log(`MISSED ${m.label}: exit ${r.status}, expected a line with "${m.expect}"`);
      console.log(
        out
          .split('\n')
          .filter((l) => /BROKEN|NO LONGER|Error/.test(l))
          .map((l) => `    ${l}`)
          .join('\n')
      );
      fail = 1;
    }
  }
} finally {
  restoreAll();
}
const ok = allRestored();
console.log(`targets restored byte for byte: ${ok ? 'yes' : 'NO'}`);
if (ok) fs.rmSync(goldenDir, { recursive: true, force: true });
else console.log(`golden copies kept for a hand restore: ${goldenDir}`);
process.exitCode = fail || !ok ? 1 : 0;
