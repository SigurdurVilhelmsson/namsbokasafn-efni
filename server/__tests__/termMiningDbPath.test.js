/**
 * termMiningService must honor SESSIONS_DB_PATH (regression guard).
 *
 * Bug: termMiningService hardcoded `pipeline-output/sessions.db` instead of using
 * resolveDbPath(), so it ignored SESSIONS_DB_PATH. In production the hardcoded
 * path and resolveDbPath()'s default coincide, so prod was fine — but under E2E
 * (SESSIONS_DB_PATH → throwaway DB) the migrations built the schema in the E2E DB
 * while termMiningService queried the canonical DB. That passed locally (the dev's
 * canonical DB happens to have the table) but 500'd in CI ("no such table:
 * mined_term_candidates") where no canonical DB exists.
 *
 * This test sets SESSIONS_DB_PATH to a fresh migrated temp DB, seeds a candidate
 * under a unique book slug, and asserts listCandidates reads THAT DB. Before the
 * fix it reads the canonical DB (no such row/table) and fails.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

// Unique per-run-ish temp DB path (Date.now unavailable is fine — pid+fixed suffix).
const TMP_DB = path.join(os.tmpdir(), `termmining-dbpath-${process.pid}.db`);
const BOOK = '__dbpathtest__'; // slug that won't exist in any real DB

// MUST be set before requiring the service (DB_PATH is resolved at module load).
process.env.SESSIONS_DB_PATH = TMP_DB;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

let termMining;

beforeAll(() => {
  for (const s of ['', '-wal', '-shm']) fs.rmSync(TMP_DB + s, { force: true });
  // Build the full schema in the temp DB via the real migration runner.
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  // Seed one candidate for our unique book directly into the temp DB.
  const Database = require('better-sqlite3');
  const db = new Database(TMP_DB);
  db.prepare(
    `INSERT INTO mined_term_candidates (book, mt_form, corrected_form, occurrences)
     VALUES (?, 'foo', 'bar', 3)`
  ).run(BOOK);
  db.close();
  // Require the service AFTER the env + schema are in place.
  termMining = require('../services/termMiningService');
});

afterAll(() => {
  for (const s of ['', '-wal', '-shm']) fs.rmSync(TMP_DB + s, { force: true });
});

describe('termMiningService DB path', () => {
  it('reads the SESSIONS_DB_PATH database, not the hardcoded canonical one', () => {
    const rows = termMining.listCandidates(BOOK, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mt_form: 'foo', corrected_form: 'bar' });
  });
});
