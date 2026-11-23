#!/usr/bin/env node
/**
 * Proves check.js can fail, in both directions:
 *   - a BREAK: a migration that converges today stops converging, and the check must name it;
 *   - a FIX: a pinned migration is made atomic, and the check must say its pin no longer fails.
 * Each scratch change is applied to the real file, check.js runs, and the expected line must appear
 * in its output (with a non-zero exit: an unexpected failure and a stale pin both fail the check).
 *
 * Restores follow CLAUDE.md's mutation-test rule: golden copies taken BEFORE the first change (in
 * the system temp dir), a restore plus byte comparison after every round, and a final restore in
 * `finally`. Never restore with `git checkout --` or `git stash`.
 *
 * Usage, from the repo root (about 4 minutes per scratch change; run it in the background):
 *   node server/verification/migration-convergence/mutate.js
 */
'use strict';

process.exitCode = 1;

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const M014 = 'server/migrations/014-source-tracking.js';
const M024 = 'server/migrations/024-fix-discussions-fk.js';
const M060 = 'server/migrations/060-editor-licence-clauses.js';

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
    'FIX: 024 runs its table rebuild in one transaction',
    M024,
    [
      [
        '    db.exec(`\n      -- Preserve existing data',
        '    db.transaction(() => db.exec(`\n      -- Preserve existing data',
      ],
      [
        '        ON terminology_discussions(term_id);\n    `);',
        '        ON terminology_discussions(term_id);\n    `))();',
      ],
    ],
    /^FAIL: pinned finding no longer failing: 024-fix-discussions-fk/m,
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
    const r = spawnSync(process.execPath, ['server/verification/migration-convergence/check.js'], {
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
