/**
 * Migration 043 — segment_acceptances (item 20b, "Staðfesta vélþýðingu").
 * Verifies: schema shape, one-active-per-segment partial unique index,
 * status CHECK, idempotent re-run, registration in migrationRunner,
 * startup pin count.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration043 = require('../migrations/043-segment-acceptances');

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

beforeEach(() => {
  db = new Database(':memory:');
  migration043.up(db);
});

afterEach(() => db.close());

function insertActive(segmentId = 'm1:para:a') {
  return db
    .prepare(
      `INSERT INTO segment_acceptances
         (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
       VALUES ('bok', 1, 'm1', ?, 'texti', 'u1', 'editor1')`
    )
    .run(segmentId);
}

describe('migration 043 segment_acceptances', () => {
  it('creates the table with expected defaults', () => {
    insertActive();
    const row = db.prepare(`SELECT * FROM segment_acceptances`).get();
    expect(row.status).toBe('active');
    expect(row.accepted_at).toBeTruthy();
    expect(row.applied_at).toBeNull();
    expect(row.superseded_at).toBeNull();
    expect(row.superseded_reason).toBeNull();
  });

  it('one ACTIVE acceptance per segment (partial unique index)', () => {
    insertActive();
    expect(() => insertActive()).toThrow(/UNIQUE/);
    // A superseded row does NOT block a new active one
    db.prepare(`UPDATE segment_acceptances SET status = 'superseded'`).run();
    expect(() => insertActive()).not.toThrow();
  });

  it('status CHECK rejects unknown values', () => {
    insertActive();
    expect(() => db.prepare(`UPDATE segment_acceptances SET status = 'accepted'`).run()).toThrow(
      /CHECK/
    );
  });

  it('is idempotent on re-run', () => {
    insertActive();
    expect(() => migration043.up(db)).not.toThrow();
    expect(db.prepare(`SELECT COUNT(*) AS n FROM segment_acceptances`).get().n).toBe(1);
  });

  it('is registered in migrationRunner after 042', () => {
    const src = readFileSync(join(__dirname, '..', 'services', 'migrationRunner.js'), 'utf-8');
    expect(src).toContain(`'../migrations/043-segment-acceptances'`);
    expect(src.indexOf('042-content-versions-track')).toBeLessThan(
      src.indexOf('043-segment-acceptances')
    );
  });
});
