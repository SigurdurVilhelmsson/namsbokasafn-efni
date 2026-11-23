/**
 * One server start, as far as the schema is concerned: loads the crash hooks, then runs the REAL
 * `runAllMigrations()` against SESSIONS_DB_PATH (set by check.js to a throwaway file).
 * Writes the runner's result as JSON to MIG_RESULT. In crash mode it dies by SIGKILL mid-run and
 * writes no result, which is the point.
 */
'use strict';

process.exitCode = 1;
const fs = require('node:fs');

if (!process.env.SESSIONS_DB_PATH || !process.env.MIG_RESULT) {
  throw new Error('child.js needs SESSIONS_DB_PATH and MIG_RESULT');
}
// MIG_NO_HOOKS=1 runs the runner untouched: check.js's control that splitting `exec` changes nothing.
if (!process.env.MIG_NO_HOOKS) require('./crash-hooks');
const { runAllMigrations } = require('../../services/migrationRunner');

const result = runAllMigrations();
fs.writeFileSync(process.env.MIG_RESULT, JSON.stringify(result));
process.exitCode = 0;
