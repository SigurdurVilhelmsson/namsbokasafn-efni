/**
 * Migration idempotency guard.
 *
 * runAllMigrations() re-applies every migration on every boot (e2e does two
 * runs: seed-fixture then server boot). That's by design — migrations use
 * CREATE ... IF NOT EXISTS. But `CREATE INDEX IF NOT EXISTS` only guards the
 * index *name*, not its columns: migrations 004/006 index columns that later
 * migrations removed (032 dropped terminology_discussions.term_id; 022 renamed
 * users.github_id → provider_id), so a re-run threw "no such column".
 *
 * This asserts a second run produces zero errors. It's the prerequisite for
 * making the migration/seed path fail-loud (a follow-up) — you can't fail-loud
 * while a benign re-run errors every boot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

const TMP_DB = path.join(os.tmpdir(), `migration-idempotency-${process.pid}.db`);
process.env.SESSIONS_DB_PATH = TMP_DB;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { runAllMigrations } = require('../services/migrationRunner');

function rm() {
  for (const s of ['', '-wal', '-shm']) fs.rmSync(TMP_DB + s, { force: true });
}

beforeAll(rm);
afterAll(rm);

describe('runAllMigrations idempotency', () => {
  it('is clean on a fresh DB and on a re-run over the same DB', () => {
    const first = runAllMigrations();
    expect(first.errors).toEqual([]);

    // Re-run over the already-migrated DB — must not error (was: 004/006
    // "no such column: term_id" / "no such column: github_id").
    const second = runAllMigrations();
    expect(second.errors).toEqual([]);
  });
});
