/**
 * Migration 042 — track discriminator on content_versions (item 15).
 * Verifies: rebuild adds track with 'faithful' default + CHECK; existing rows
 * preserved; UNIQUE now includes track (same version number may exist per
 * track); idempotent re-run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration031 = require('../migrations/031-content-versions');
const migration042 = require('../migrations/042-content-versions-track');

let db;

beforeEach(() => {
  db = new Database(':memory:');
  migration031.up(db);
  db.prepare(
    `INSERT INTO content_versions (book, chapter, module_id, segment_id, content, version, applied_by)
     VALUES ('bok', 3, 'm11111', 'm11111:para:a', 'gamalt efni', 1, 'ed1')`
  ).run();
});

afterEach(() => db.close());

describe('migration 042 content_versions track', () => {
  it('adds track with faithful default and preserves existing rows', () => {
    migration042.up(db);
    const row = db.prepare(`SELECT * FROM content_versions WHERE module_id = 'm11111'`).get();
    expect(row.track).toBe('faithful');
    expect(row.content).toBe('gamalt efni');
    expect(row.version).toBe(1);
  });

  it('CHECK rejects unknown track values', () => {
    migration042.up(db);
    expect(() =>
      db
        .prepare(
          `INSERT INTO content_versions (book, chapter, module_id, segment_id, content, version, track)
           VALUES ('bok', 3, 'm11111', 'm11111:para:a', 'x', 2, 'mt-preview')`
        )
        .run()
    ).toThrow(/CHECK/);
  });

  it('UNIQUE includes track: same version per track is allowed, per-track dup is not', () => {
    migration042.up(db);
    const ins = db.prepare(
      `INSERT INTO content_versions (book, chapter, module_id, segment_id, content, version, track)
       VALUES ('bok', 3, 'm11111', 'm11111:para:a', ?, 1, ?)`
    );
    ins.run('staðfært efni', 'localized'); // same (book,module,segment,version), other track → OK
    expect(() => ins.run('tvítak', 'localized')).toThrow(/UNIQUE/);
  });

  it('is idempotent on re-run', () => {
    migration042.up(db);
    expect(() => migration042.up(db)).not.toThrow();
    expect(db.prepare(`SELECT COUNT(*) c FROM content_versions`).get().c).toBe(1);
  });
});
