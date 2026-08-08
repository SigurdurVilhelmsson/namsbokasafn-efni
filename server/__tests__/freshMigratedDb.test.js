// server/__tests__/freshMigratedDb.test.js
/**
 * The helper must produce a schema built by the REAL migrations. The control is
 * terminologyTestDb: a hand-maintained copy of migration 032 that has none of the
 * concept tables. If a future edit points the helper at that copy, the control fails.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
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
    for (const t of [
      'concept',
      'concept_term',
      'book_concept_preference',
      'book_domain_priority',
    ]) {
      expect(names.has(t)).toBe(true);
    }
    db.close();
  });

  it('CONTROL: the hand-copied terminologyTestDb has none of them', () => {
    const names = tableNames(createTestDb());
    expect(names.has('concept')).toBe(false);
    expect(names.has('book_domain_priority')).toBe(false);
  });

  it('has foreign keys ON, so ON DELETE CASCADE is live', () => {
    const { db } = freshMigratedDb();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });
});
