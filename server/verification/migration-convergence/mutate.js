#!/usr/bin/env node
/**
 * Proves check.js can fail: each BREAK makes something that converges today stop converging (a
 * migration, or the runner's second pass on a new database), and the check must name it. There used
 * to be a FIX direction too (a pinned migration made atomic, its pin reported as no longer failing);
 * since register §C250 nothing is pinned, so there is no pin left for a FIX to clear. If a pin is
 * ever added again, add a FIX change here that makes its migration converge.
 * Each scratch change is applied to the real file, check.js runs, and the expected line must appear
 * in its output (with a non-zero exit: an unexpected failure and a stale pin both fail the check).
 *
 * Restores follow CLAUDE.md's mutation-test rule: golden copies taken BEFORE the first change (in
 * the system temp dir), a restore plus byte comparison after every round, and a final restore in
 * `finally`. Never restore with `git checkout --` or `git stash`.
 *
 * Usage (any cwd; about 4 minutes per scratch change; run it in the background):
 *   node server/verification/migration-convergence/mutate.js
 */
'use strict';

process.exitCode = 1;

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Resolved against this file, never the cwd (CLAUDE.md § resolve resource paths against something
// intrinsic): run from server/ instead of the repo root, a relative path would miss the migrations.
const MIGRATIONS = path.resolve(__dirname, '..', '..', 'migrations');
const CHECK = path.join(__dirname, 'check.js');
const M014 = path.join(MIGRATIONS, '014-source-tracking.js');
const M024 = path.join(MIGRATIONS, '024-fix-discussions-fk.js');
const M060 = path.join(MIGRATIONS, '060-editor-licence-clauses.js');
const RUNNER = path.resolve(__dirname, '..', '..', 'services', 'migrationRunner.js');

// 014's §C250 body (transaction + per-column guards), and the bare ALTERs it replaced.
const M014_FIXED_BODY = fs
  .readFileSync(M014, 'utf8')
  .match(/ {4}const COLUMNS = \[[\s\S]*?\n {4}\}\)\(\);\n/)?.[0];
const BARE_ALTERS =
  '    db.exec(`ALTER TABLE registered_books ADD COLUMN source_commit_hash TEXT`);\n' +
  '    db.exec(`ALTER TABLE registered_books ADD COLUMN source_fetched_at DATETIME`);\n' +
  '    db.exec(`ALTER TABLE registered_books ADD COLUMN source_repo TEXT`);\n';
if (!M014_FIXED_BODY)
  throw new Error('014 no longer has its COLUMNS + transaction body — update mutate.js');

// [label, file, edits: [[exact text (must occur once), replacement], …], line the output must contain]
const CHANGES = [
  [
    'BREAK: 060 loses IF NOT EXISTS on its CREATE TABLE',
    M060,
    [
      [
        'CREATE TABLE IF NOT EXISTS editor_licence_clauses (',
        'CREATE TABLE editor_licence_clauses (',
      ],
    ],
    /^FAIL: point \d+ \(060-editor-licence-clauses\) .*SHORT/m,
  ],
  [
    // The guards alone would repair a crash, so the regression worth catching is bare ALTERs again.
    'BREAK: 014 back to three bare ALTERs (the §C250 fix reverted)',
    M014,
    [[M014_FIXED_BODY, BARE_ALTERS]],
    /^FAIL: point \d+ \(014-source-tracking\) .*SHORT/m,
  ],
  [
    // Without the transaction, a crash after the DROP and before the RENAME leaves no original
    // table, so the next start returns early and the `_new` table stays: the §C250 fix reverted.
    'BREAK: 024 loses its transaction (one bare exec again)',
    M024,
    [['    db.transaction(() => {\n', '    (() => {\n']],
    /^FAIL: point \d+ \(024-fix-discussions-fk\) .*SHORT/m,
  ],
  [
    'BREAK: migrationRunner loses its second pass on a new database',
    RUNNER,
    [
      [
        '  if (!created || first.errors.length) return { ...first, secondPass: false };',
        '  return { ...first, secondPass: false };',
      ],
    ],
    /^FAIL: first boot is short in a NEW way/m,
  ],
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-mutate-'));
const goldens = {};
for (const f of new Set(CHANGES.map((c) => c[1]))) {
  goldens[f] = path.join(tmp, path.basename(f));
  fs.copyFileSync(f, goldens[f]);
}
const restoreAll = () =>
  Object.entries(goldens).every(([f, g]) => {
    fs.copyFileSync(g, f);
    return fs.readFileSync(f).equals(fs.readFileSync(g));
  });

let allSeen = true;
let restored = true;
try {
  for (const [label, file, edits, expected] of CHANGES) {
    let src = fs.readFileSync(goldens[file], 'utf8');
    const bad = edits.find(([from]) => src.split(from).length - 1 !== 1);
    if (bad) {
      console.log(`${label}: an anchor is not found exactly once in ${file} — update the change`);
      allSeen = false;
      continue;
    }
    for (const [from, to] of edits) src = src.replace(from, () => to);
    fs.writeFileSync(file, src);
    const r = spawnSync(process.execPath, [CHECK], {
      encoding: 'utf8',
      timeout: 900_000,
    });
    restored = restoreAll() && restored;
    const out = r.stdout || '';
    const fails = out.split('\n').filter((l) => l.startsWith('FAIL: '));
    const seen = r.status !== 0 && expected.test(out);
    // The FIX must change exactly one thing: its pin's line is the only FAIL.
    const clean = !label.startsWith('FIX') || fails.length === 1;
    if (!seen || !clean) allSeen = false;
    console.log(
      `${seen && clean ? 'seen' : 'MISSED'}  ${label}: exit ${r.status}; FAIL lines: ${fails.length ? '\n    ' + fails.join('\n    ') : 'none'}`
    );
  }
} finally {
  restored = restoreAll() && restored;
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`targets restored byte for byte: ${restored ? 'yes' : 'NO — check git status now'}`);
process.exitCode = allSeen && restored ? 0 : 1;
