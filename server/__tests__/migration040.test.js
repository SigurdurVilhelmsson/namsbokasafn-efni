/**
 * Migration 040 — service-table ownership
 *
 * activity_log / notifications / notification_preferences were created only
 * as an import-time side effect of their services. Batch 4 makes those
 * services lazy-open, so the schema must be migration-owned. This pins:
 * tables + indexes exist after up(), and up() is locally idempotent.
 * (Chain-level idempotency is covered by migrationIdempotency.test.js.)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration = require('../migrations/040-service-table-ownership');

let db;

beforeAll(() => {
  db = new Database(':memory:');
});

afterAll(() => {
  db.close();
});

function tableNames() {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);
}

function indexNames() {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
    )
    .all()
    .map((r) => r.name);
}

describe('migration 040', () => {
  it('exports the standard shape', () => {
    expect(migration.name).toBe('040-service-table-ownership');
    expect(typeof migration.up).toBe('function');
  });

  it('creates the three service tables', () => {
    migration.up(db);
    const tables = tableNames();
    expect(tables).toContain('activity_log');
    expect(tables).toContain('notifications');
    expect(tables).toContain('notification_preferences');
  });

  it('creates the verbatim index names the services used to create', () => {
    const idx = indexNames();
    expect(idx).toEqual(
      expect.arrayContaining([
        'idx_activity_log_type',
        'idx_activity_log_user_id',
        'idx_activity_log_book',
        'idx_activity_log_created_at',
        'idx_notifications_user_id',
        'idx_notifications_read',
        'idx_notifications_created_at',
      ])
    );
  });

  it('is idempotent when re-run on the same database', () => {
    expect(() => migration.up(db)).not.toThrow();
  });

  it('activity_log enforces the NOT NULL audit columns', () => {
    expect(() => db.prepare('INSERT INTO activity_log (type) VALUES (?)').run('x')).toThrow(
      /NOT NULL/
    );
  });
});
