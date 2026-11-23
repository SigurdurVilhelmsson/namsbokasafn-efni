#!/usr/bin/env node
/**
 * Migration convergence after a crash: bounded exhaustive check of the REAL runAllMigrations().
 *
 * PROMISE (migrationRunner.js's header): migrations are idempotent and every server start runs
 * them all, so a start converges to the full schema. The runner keeps NO ledger of what has run; a
 * migration that throws "duplicate column" or "already exists" is counted as skipped and never
 * finished. So the question is: if the server dies part-way through building the schema, do the
 * starts that follow still reach the full schema, and say so if they cannot?
 *
 * METHOD. Starting from an empty database (a fresh clone, a new box, the E2E seed):
 *   1. list every crash point: every SQLite COMMIT the real run makes (crash-hooks.js);
 *   2. for each point k: start the real runner in a child process that dies by SIGKILL just after
 *      commit k, then restart it (clean, no hooks killing it) until two starts in a row leave the
 *      same database: the fixed point;
 *   3. compare that fixed point with the REFERENCE: a clean build re-run to its own fixed point.
 * Each point lands in one class:
 *   converged  the fixed point equals the reference, no errors;
 *   short      the runner reports no errors, but the fixed point differs (silent: boot proceeds);
 *   wedge      the runner reports errors at every restart (failLoudOnMigrationErrors exits 1, so
 *              the server never boots again);
 *   unsettled  no fixed point within MAX_STARTS restarts.
 * Only `converged` passes. A finding is pinned below by the migration on the stack at its crash
 * point, so a pin cannot hide a new failure elsewhere; a pin that stops failing is an error too.
 *
 * Bounds: empty-database start; ONE crash, then clean restarts; a process kill (SIGKILL), not power
 * loss (SQLite's journal makes a committed write durable across a kill; fsync is not tested).
 *
 * Usage, from the repo root (about 3 minutes; prints its verdict at the end):
 *   node server/verification/migration-convergence/check.js
 *   node server/verification/migration-convergence/check.js --only 93     # one crash point
 */
'use strict';

process.exitCode = 1;

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { snapshot, diff } = require('./snapshot');

const CHILD = path.join(__dirname, 'child.js');
const MAX_STARTS = 4;

// ── Known findings ───────────────────────────────────────────────────────────────────────────────
// A crash point may fail only in the class listed for the migration on its stack, and only with
// exactly these differences from the reference. Anything else is a new failure.
// The shape behind them: no ledger, so a migration is re-run whole on every start, and a re-run
// that throws "duplicate column" / "already exists" on its FIRST statement is counted as skipped
// and never finishes. A crash after that first statement and before the last strands it.
// (013 and 014 had this shape too, register §C250; each now runs in one db.transaction, and
// mutate.js's BREAK on 014 shows the check still catches it coming back.)
// None pinned (register §C250). 024 and 026 used to leave a stray empty `*_new` table after a crash
// inside their one-exec table rebuild; each now runs in one db.transaction and drops a leftover
// `*_new` first. A pin, if one is ever needed again, names the migration, the class and the exact
// diffs: { '<migration id>': { class: 'short', diffs: ['schema: table x_new'] } }.
const KNOWN_CRASH_FINDINGS = {};
// None pinned (register §C250). A fresh database's first start used to stop short of the full schema
// (022 rebuilt `users` after 006 made its indexes and trigger; 049 registered books after 032 seeded
// book_subject_mapping). migrationRunner now runs a second pass when it has just created sessions.db.
const KNOWN_FIRST_BOOT_DIFFS = [];

// ── Child runs ───────────────────────────────────────────────────────────────────────────────────
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-convergence-'));
let runs = 0;

/** One server start against `db`. */
function start(db, extraEnv = {}) {
  runs++;
  const resultFile = path.join(root, `result-${runs}.json`);
  const r = spawnSync(process.execPath, [CHILD], {
    env: { ...process.env, SESSIONS_DB_PATH: db, MIG_RESULT: resultFile, ...extraEnv },
    stdio: ['ignore', 'ignore', 'pipe'],
    encoding: 'utf8',
    timeout: 60_000,
  });
  let result = null;
  if (fs.existsSync(resultFile)) {
    result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    fs.unlinkSync(resultFile);
  }
  return { status: r.status, signal: r.signal, result, stderr: r.stderr || '' };
}

/** The crash points of a fresh build, as [{n, migration, sql}]. Also returns that build's path. */
function listPoints(tag) {
  const db = path.join(root, `list-${tag}.db`);
  const log = path.join(root, `points-${tag}.txt`);
  const r = start(db, { MIG_CRASH_AT: 'list', MIG_LOG: log });
  if (!r.result || r.result.errors.length) throw new Error(`list run failed: ${r.stderr}`);
  const points = fs
    .readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map((l) => {
      const [n, migration, sql] = l.split('\t');
      return { n: Number(n), migration, sql };
    });
  return { db, points };
}

/** Restart `db` until two starts in a row leave the same database. */
function settle(db) {
  const errorsSeen = [];
  let prev = null;
  for (let i = 0; i < MAX_STARTS; i++) {
    const r = start(db);
    const errors = r.result
      ? r.result.errors
      : [`start threw (exit ${r.status}): ${r.stderr.slice(0, 300)}`];
    errorsSeen.push(errors);
    const snap = snapshot(db);
    if (prev && diff(prev, snap).length === 0) return { snap, errorsSeen, settled: true };
    prev = snap;
  }
  return { snap: prev, errorsSeen, settled: false };
}

function main() {
  const only =
    process.argv.indexOf('--only') !== -1
      ? Number(process.argv[process.argv.indexOf('--only') + 1])
      : null;
  let bad = false;
  const fail = (msg) => {
    bad = true;
    console.log(`FAIL: ${msg}`);
  };

  // Controls: the point list is stable; the hooks (which split exec) build what the plain runner
  // builds; and a clean build has a fixed point.
  const A = listPoints('a');
  const B = listPoints('b');
  if (JSON.stringify(A.points) !== JSON.stringify(B.points))
    fail('crash-point list differs between two clean runs');
  const plainDb = path.join(root, 'plain.db');
  start(plainDb, { MIG_NO_HOOKS: '1' });
  const splitDiff = diff(snapshot(plainDb), snapshot(A.db));
  if (splitDiff.length)
    fail(`hooked build differs from the plain runner's: ${splitDiff.join(', ')}`);

  const firstBoot = snapshot(A.db);
  const ref = settle(A.db);
  if (!ref.settled) fail('a clean build has no fixed point');
  if (ref.errorsSeen.some((e) => e.length))
    fail(`a clean re-run reports errors: ${JSON.stringify(ref.errorsSeen)}`);
  const firstBootDiffs = diff(firstBoot, ref.snap);
  const fbUnexpected = firstBootDiffs.filter((d) => !KNOWN_FIRST_BOOT_DIFFS.includes(d));
  const fbFixed = KNOWN_FIRST_BOOT_DIFFS.filter((d) => !firstBootDiffs.includes(d));
  console.log(`Crash points (commits in a fresh build): ${A.points.length}`);
  console.log(
    `First boot reaches the full schema: ${firstBootDiffs.length === 0 ? 'yes' : `NO, short by ${firstBootDiffs.length} (pinned finding)`}`
  );
  if (fbUnexpected.length) fail(`first boot is short in a NEW way: ${fbUnexpected.join(', ')}`);
  if (fbFixed.length)
    fail(
      `first-boot pin no longer failing on: ${fbFixed.join(', ')} — if fixed on purpose, remove it from KNOWN_FIRST_BOOT_DIFFS`
    );

  // The enumeration.
  const byClass = { converged: 0, short: 0, wedge: 0, unsettled: 0 };
  const pinnedSeen = new Set();
  const failures = [];
  for (const p of A.points) {
    if (only !== null && p.n !== only) continue;
    const db = path.join(root, `crash-${p.n}.db`);
    const log = path.join(root, `crash-${p.n}.txt`);
    const c = start(db, { MIG_CRASH_AT: String(p.n), MIG_LOG: log });
    const died = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim() : '';
    if (c.signal !== 'SIGKILL' || died !== `${p.n}\t${p.migration}\t${p.sql}`) {
      fail(
        `point ${p.n}: the crash run did not die at its point (signal ${c.signal}, logged "${died}")`
      );
      continue;
    }
    const s = settle(db);
    const lastErrors = s.errorsSeen[s.errorsSeen.length - 1];
    const d = s.snap ? diff(s.snap, ref.snap) : ['(no snapshot)'];
    const cls = !s.settled
      ? 'unsettled'
      : lastErrors.length
        ? 'wedge'
        : d.length
          ? 'short'
          : 'converged';
    byClass[cls]++;
    fs.rmSync(db, { force: true });
    if (cls === 'converged') continue;
    const pin = KNOWN_CRASH_FINDINGS[p.migration];
    if (pin && pin.class === cls && JSON.stringify(pin.diffs) === JSON.stringify(d)) {
      pinnedSeen.add(p.migration);
      continue;
    }
    failures.push({ ...p, cls, diffs: d, errors: lastErrors });
  }

  console.log(
    `Crash runs: converged ${byClass.converged}, short ${byClass.short}, wedge ${byClass.wedge}, unsettled ${byClass.unsettled}`
  );
  for (const [m, pin] of Object.entries(KNOWN_CRASH_FINDINGS)) {
    if (pinnedSeen.has(m))
      console.log(`  known finding still present: ${m} (${pin.class}: ${pin.diffs.join(', ')})`);
    else if (only === null)
      fail(`pinned finding no longer failing: ${m} — if fixed on purpose, remove its pin`);
  }
  for (const f of failures.slice(0, 20)) {
    fail(
      `point ${f.n} (${f.migration}) after "${f.sql}": ${f.cls.toUpperCase()}` +
        (f.diffs.length ? ` — differs from the reference in: ${f.diffs.join(', ')}` : '') +
        (f.errors.length ? ` — runner errors: ${f.errors.join(' | ')}` : '')
    );
  }
  if (failures.length > 20) console.log(`  … and ${failures.length - 20} more`);
  console.log(`Server starts run: ${runs}`);

  fs.rmSync(root, { recursive: true, force: true });
  if (bad) {
    console.log('\nFAIL');
    process.exitCode = 1;
  } else {
    console.log('\nOK: every crash point converges or fails only as pinned; controls hold');
    process.exitCode = 0;
  }
}

main();
