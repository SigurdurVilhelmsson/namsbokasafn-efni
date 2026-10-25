/**
 * Migration 052 retires chapter_generated_files, the chapter file registry's table, and only it.
 *
 * Run through the real runner, as a server start runs it: 007 recreates the table on every start
 * and 052 drops it after 015/016/033 have used it, so the end state after any start is "absent".
 * The control is chapter_generation_log, created by the same 007: it must survive, rows and all,
 * because tools/lib/safeWrite.js writes to it and pipelineStatusService reads it.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: migrationRunner reads resolveDbPath() at module load.
const work = mkdtempSync(path.join(tmpdir(), 'migration052-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const migration007 = require('../migrations/007-chapter-files');
const migration052 = require('../migrations/052-retire-chapter-generated-files');

afterAll(() => rmSync(work, { recursive: true, force: true }));

/** Which of the two 007 tables exist, and how many rows the log holds. */
function state() {
  const db = new Database(process.env.SESSIONS_DB_PATH, { readonly: true });
  try {
    const has = (t) =>
      Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t));
    return {
      registry: has('chapter_generated_files'),
      log: has('chapter_generation_log'),
      logRows: has('chapter_generation_log')
        ? db.prepare('SELECT COUNT(*) AS n FROM chapter_generation_log').get().n
        : null,
    };
  } finally {
    db.close();
  }
}

describe('migration 052 through the real runner', () => {
  it('a fresh database starts with no registry table, the log kept, and no errors', () => {
    const { errors } = runAllMigrations();
    expect([errors, state()]).toEqual([[], { registry: false, log: true, logRows: 0 }]);
  });

  it('an existing database: the registry table and its rows go, the log and its rows stay', () => {
    // Production's shape: the table exists (007 made it long ago) and the log has rows.
    const db = new Database(process.env.SESSIONS_DB_PATH);
    migration007.up(db);
    db.prepare(
      `INSERT INTO chapter_generated_files (book_slug, chapter_num, file_type, file_path)
       VALUES ('efnafraedi-2e', 1, 'en-md', 'efnafraedi-2e/02-for-mt/ch01/1-1.en.md')`
    ).run();
    const log = db.prepare(
      `INSERT INTO chapter_generation_log (book_slug, chapter_num, action, details)
       VALUES ('efnafraedi-2e', 1, 'backup:render', '{}')`
    );
    log.run();
    log.run();
    db.close();
    expect(state()).toEqual({ registry: true, log: true, logRows: 2 }); // the seed took

    const { errors } = runAllMigrations();
    expect([errors, state()]).toEqual([[], { registry: false, log: true, logRows: 2 }]);
  });

  it('a second start changes nothing and reports no errors', () => {
    const { errors } = runAllMigrations();
    expect([errors, state()]).toEqual([[], { registry: false, log: true, logRows: 2 }]);
  });
});

describe('migration 052 never throws', () => {
  it('a DROP that fails (e.g. SQLITE_BUSY) becomes one warning, not a throw', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const busy = Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
    const db = {
      exec: () => {
        throw busy;
      },
    };
    try {
      expect(() => migration052.up(db)).not.toThrow();
      expect(warn.mock.calls.map((c) => c[0].slice(0, 60))).toEqual([
        '[052] could not drop chapter_generated_files — SQLITE_BUSY: ',
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it('a DROP that succeeds warns nothing (the control)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sql = [];
    try {
      migration052.up({ exec: (s) => sql.push(s) });
      expect([sql, warn.mock.calls.length]).toEqual([
        ['DROP TABLE IF EXISTS chapter_generated_files'],
        0,
      ]);
    } finally {
      warn.mockRestore();
    }
  });
});
