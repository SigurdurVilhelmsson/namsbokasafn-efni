// server/__tests__/freshMigratedDb.test.js
/**
 * The helper must produce a schema built by the REAL migrations. The control is
 * terminologyTestDb: a hand-maintained copy of migration 032 that has none of the
 * concept tables. If a future edit points the helper at that copy, the control fails.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { createTestDb } = require('./helpers/terminologyTestDb');

const tableNames = (db) =>
  new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name)
  );

describe('freshMigratedDb', () => {
  it('applies every migration without error', () => {
    const { db, errors, applied } = freshMigratedDb();
    expect(errors).toEqual([]);
    expect(applied).toBeGreaterThanOrEqual(47);
    db.close();
  });

  it('creates all four concept-model tables', () => {
    const { db } = freshMigratedDb();
    const names = tableNames(db);
    for (const t of ['concept', 'concept_term', 'book_term_preference', 'book_domain_priority']) {
      expect(names.has(t)).toBe(true);
    }
    db.close();
  });

  it('CONTROL: the hand-copied terminologyTestDb has none of them', () => {
    const db = createTestDb();
    const names = tableNames(db);
    // All FOUR concept tables, not the two this asserted until 2026-08-08 — a control
    // that checks half the set can pass while the other half leaks in.
    for (const t of ['concept', 'concept_term', 'book_domain_priority', 'book_term_preference']) {
      expect(names.has(t)).toBe(false);
    }
    db.close(); // the other tests in this file close theirs; this one did not
  });

  it('has foreign keys ON, so ON DELETE CASCADE is live', () => {
    const { db } = freshMigratedDb();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });

  /**
   * ⚠️ THROWS RATHER THAN HANDING BACK A HALF-BUILT SCHEMA (whole-branch review,
   * 2026-08-09). Almost every caller writes `const { db } = freshMigratedDb()`
   * and DISCARDS `errors`, so before this a failed migration produced a database
   * with a missing table and surfaced much later as an assertion that named
   * neither the migration nor the table. A reviewer hit exactly that shape: one
   * non-reproducible 9-test failure across 2 files, unre-triggerable in 12 runs.
   *
   * ⚠️ The fixture is a temp directory, NEVER `server/migrations/` — a stray
   * `NNN-*.js` left there by a crashed test would break every later run, and
   * migrations are append-only by project rule.
   */
  it('THROWS when a migration fails, naming it — a discarded `errors` array must not hide it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bad-migrations-'));
    fs.writeFileSync(
      path.join(dir, '001-ok.js'),
      'module.exports = { up(db) { db.exec("CREATE TABLE ok (id INTEGER)"); } };'
    );
    fs.writeFileSync(
      path.join(dir, '002-broken.js'),
      'module.exports = { up() { throw new Error("simulated migration failure"); } };'
    );
    try {
      expect(() => freshMigratedDb(dir)).toThrow(/002-broken\.js: simulated migration failure/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // ⚠️ THE CONTROL. Without it, a helper that threw unconditionally — or on
  // every call — would pass the test above and take the whole suite with it.
  it('CONTROL: a directory of healthy migrations does NOT throw', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'good-migrations-'));
    fs.writeFileSync(
      path.join(dir, '001-ok.js'),
      'module.exports = { up(db) { db.exec("CREATE TABLE ok (id INTEGER)"); } };'
    );
    try {
      const { db, errors } = freshMigratedDb(dir);
      expect(errors).toEqual([]);
      expect(tableNames(db).has('ok')).toBe(true);
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
