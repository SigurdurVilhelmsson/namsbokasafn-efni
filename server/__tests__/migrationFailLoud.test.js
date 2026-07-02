/**
 * failLoudOnMigrationErrors — the boot/seed gate that refuses to run on a broken
 * schema. Fatal in all environments (migrations are idempotent; the re-run is
 * asserted clean in CI), so any error here means a real broken schema.
 *
 * The fail-silent version of this (index.js log-and-continue; seed-fixture
 * discarding the result) is what let the recent DB-path bug hide.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const require = createRequire(import.meta.url);
const { failLoudOnMigrationErrors } = require('../services/migrationRunner');

describe('failLoudOnMigrationErrors', () => {
  it('exits 1 and reports when there are migration errors', () => {
    let code = null;
    let reported = null;
    failLoudOnMigrationErrors(
      { errors: ['004: no such column: term_id'] },
      { exit: (c) => (code = c), onError: (e) => (reported = e) }
    );
    expect(code).toBe(1);
    expect(reported).toEqual(['004: no such column: term_id']);
  });

  it('does not exit when there are no errors', () => {
    let code = null;
    failLoudOnMigrationErrors({ applied: 38, skipped: 0, errors: [] }, { exit: (c) => (code = c) });
    expect(code).toBe(null);
  });

  it('is safe when errors is absent', () => {
    let code = null;
    failLoudOnMigrationErrors({}, { exit: (c) => (code = c) });
    expect(code).toBe(null);
  });
});
