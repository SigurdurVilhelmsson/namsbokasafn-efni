// server/__tests__/migrationCrashSafeFirstBoot.test.js
//
// Register §C250, the two findings the migration-convergence check pinned last:
//
// 1. 024 and 026 rebuild a table as one multi-statement exec (CREATE x_new; INSERT; DROP; RENAME)
//    with no transaction. A crash before the RENAME left x_new behind, and on the next start the
//    CREATE threw "already exists", which migrationRunner counts as skipped: the rebuild never
//    finished. Each now runs in one db.transaction and drops a leftover x_new first.
// 2. A fresh database's FIRST start was not the full schema: 022 rebuilds `users` after 006 made
//    its indexes and trigger, and 049 registers books after 032 seeded book_subject_mapping, so
//    both waited for a second start. migrationRunner now runs a second pass when it has just
//    created sessions.db.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const tmp = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `crash-safe-${tag}-`));
const tableSql = (db, name) =>
  db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(name)?.sql;

describe('024 finishes a rebuild a crash left half done (§C250)', () => {
  // The state the old 024 left after a crash before its RENAME: the table still points at
  // terminology_terms_old, and an empty terminology_discussions_new exists beside it.
  function stranded() {
    const db = new Database(path.join(tmp('024'), 'sessions.db'));
    db.exec(`
      CREATE TABLE terminology_terms_old (id INTEGER PRIMARY KEY);
      CREATE TABLE terminology_terms (id INTEGER PRIMARY KEY);
      INSERT INTO terminology_terms_old (id) VALUES (1);
      INSERT INTO terminology_terms (id) VALUES (1);
      CREATE TABLE terminology_discussions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        comment TEXT NOT NULL,
        proposed_translation TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (term_id) REFERENCES terminology_terms_old(id) ON DELETE CASCADE
      );
      INSERT INTO terminology_discussions (term_id, user_id, username, comment)
        VALUES (1, 'u1', 'Anna', 'kept');
      CREATE TABLE terminology_discussions_new (id INTEGER PRIMARY KEY);
    `);
    return db;
  }

  it('does not throw on the leftover terminology_discussions_new', () => {
    const db = stranded();
    expect(() => require('../migrations/024-fix-discussions-fk').up(db)).not.toThrow();
  });

  it('completes the rebuild: FK fixed, no leftover, rows kept', () => {
    const db = stranded();
    try {
      require('../migrations/024-fix-discussions-fk').up(db);
    } catch {
      // the assertions below say what is wrong
    }
    expect(tableSql(db, 'terminology_discussions')).not.toMatch(/terminology_terms_old/);
    expect(tableSql(db, 'terminology_discussions_new')).toBeUndefined();
    expect(db.prepare('SELECT comment FROM terminology_discussions').all()).toEqual([
      { comment: 'kept' },
    ]);
  });
});

describe('026 finishes a rebuild a crash left half done (§C250)', () => {
  function stranded() {
    const db = new Database(path.join(tmp('026'), 'sessions.db'));
    db.exec(`
      CREATE TABLE registered_books (id INTEGER PRIMARY KEY);
      CREATE TABLE terminology_terms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER,
        english TEXT NOT NULL,
        icelandic TEXT NOT NULL,
        alternatives TEXT, category TEXT, notes TEXT, source TEXT, source_chapter INTEGER,
        status TEXT DEFAULT 'proposed', proposed_by TEXT, proposed_by_name TEXT,
        approved_by TEXT, approved_by_name TEXT, approved_at DATETIME,
        definition_en TEXT, definition_is TEXT, pos TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO terminology_terms (english, icelandic) VALUES ('atom', 'atóm');
      CREATE TABLE terminology_terms_new (id INTEGER PRIMARY KEY);
    `);
    return db;
  }

  it('does not throw on the leftover terminology_terms_new', () => {
    const db = stranded();
    expect(() => require('../migrations/026-nullable-icelandic').up(db)).not.toThrow();
  });

  it('completes the rebuild: icelandic nullable, no leftover, rows kept', () => {
    const db = stranded();
    try {
      require('../migrations/026-nullable-icelandic').up(db);
    } catch {
      // the assertions below say what is wrong
    }
    expect(tableSql(db, 'terminology_terms')).not.toMatch(/icelandic TEXT NOT NULL/);
    expect(tableSql(db, 'terminology_terms_new')).toBeUndefined();
    expect(db.prepare('SELECT english, icelandic FROM terminology_terms').all()).toEqual([
      { english: 'atom', icelandic: 'atóm' },
    ]);
  });
});

describe("a fresh database's first start reaches the full schema (§C250)", () => {
  // migrationRunner resolves its database path when it is loaded, so point it at a file that does
  // not exist yet before requiring it. Each test file runs in its own process (vitest.config.js).
  const dbPath = path.join(tmp('firstboot'), 'sessions.db');
  process.env.SESSIONS_DB_PATH = dbPath;
  const { runAllMigrations } = require('../services/migrationRunner');
  const { snapshot, diff } = require('../verification/migration-convergence/snapshot');

  const FIRST_BOOT_OBJECTS = ['idx_users_role', 'idx_users_is_active', 'update_users_timestamp'];
  const first = runAllMigrations();
  const afterFirst = snapshot(dbPath);
  // Read now: the describe body runs both starts before any it() does.
  const presentAfterFirst = (() => {
    const db = new Database(dbPath, { readonly: true });
    const has = (n) => Boolean(db.prepare('SELECT 1 FROM sqlite_master WHERE name = ?').get(n));
    const out = FIRST_BOOT_OBJECTS.filter(has);
    db.close();
    return out;
  })();
  const second = runAllMigrations();
  const afterSecond = snapshot(dbPath);

  it('CONTROL: the database was created by that start and both starts report no errors', () => {
    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);
  });

  it('a second start changes nothing (users indexes, trigger, book_subject_mapping included)', () => {
    expect(diff(afterFirst, afterSecond)).toEqual([]);
  });

  it('the first start already has the objects that used to wait for the second', () => {
    expect(presentAfterFirst).toEqual(FIRST_BOOT_OBJECTS);
  });
});
