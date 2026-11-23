// server/__tests__/migrationBootChurn.test.js
//
// Register §C250 (every-boot churn): migrationRunner keeps no ledger and re-runs every migration on
// every start. Before this fix, each boot recreated the retired legacy tables (002: edit_history,
// pending_reviews; 004: terminology_terms, terminology_imports) only for later migrations to redo
// work on them and drop them again (021; 026, 028, then 032), logging "Applying migration 026" and
// "dropped edit_history" on every restart (prod journal, 2026-11-23). Once 032 has run, the legacy
// tables are retired and a later boot must not bring them back.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const MIGRATIONS = path.join(import.meta.dirname, '..', 'migrations');
const LEGACY = ['edit_history', 'pending_reviews', 'terminology_terms', 'terminology_imports'];
const CHURN_LOGS = [
  /Migration 021: dropped/,
  /Applying migration 026/,
  /Applying migration 028/,
  /idordabanki_id column added/,
];

/**
 * One server start's migrations, as migrationRunner runs them: every up(db) in order, a throw
 * naming "duplicate column" or "already exists" counted as skipped, any other throw an error.
 * Records which legacy tables existed after each migration, and what the migrations logged.
 */
function boot(db) {
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => /^\d{3}-.*\.js$/.test(f))
    .sort();
  const seen = new Set();
  const errors = [];
  const logs = [];
  const origLog = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    for (const f of files) {
      try {
        require(path.join(MIGRATIONS, f)).up(db);
      } catch (e) {
        if (!/duplicate column|already exists/.test(e.message)) errors.push(`${f}: ${e.message}`);
      }
      for (const t of LEGACY) {
        if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(t))
          seen.add(t);
      }
    }
  } finally {
    console.log = origLog;
  }
  return { seen: [...seen].sort(), errors, logs };
}

describe('a later boot does not recreate the retired legacy tables (§C250 churn)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boot-churn-'));
  const db = new Database(path.join(dir, 'sessions.db'));
  const first = boot(db);
  const second = boot(db);

  it('CONTROL: the first boot of a fresh database creates them (they are later retired by 021 and 032)', () => {
    expect(first.errors).toEqual([]);
    expect(first.seen).toEqual([...LEGACY].sort());
  });

  it('a later boot never creates any legacy table', () => {
    expect(second.errors).toEqual([]);
    expect(second.seen).toEqual([]);
  });

  it('a later boot logs none of the churn lines', () => {
    const churn = second.logs.filter((l) => CHURN_LOGS.some((re) => re.test(l)));
    expect(churn).toEqual([]);
  });

  it('a later boot with a registered `liffraedi` book does not wedge on the retired tables (#784 review)', () => {
    // 015 cleans up a `liffraedi` book by book_id across book_chapters, book_sections and
    // terminology_terms. While 004 recreated terminology_terms on every boot that worked; once it is
    // retired, an unguarded DELETE throws "no such table" and the server never boots again. An admin
    // can register that slug (it passes bookRegistration's BOOK_SLUG), so this is reachable.
    // Not asserted here: 015 also DELETES that book on every boot (register §C250, logged, not fixed).
    const sdir = fs.mkdtempSync(path.join(os.tmpdir(), 'boot-churn-seeded-'));
    const sdb = new Database(path.join(sdir, 'sessions.db'));
    expect(boot(sdb).errors).toEqual([]);
    expect(boot(sdb).errors).toEqual([]);
    const required = sdb
      .pragma('table_info(registered_books)')
      .filter((c) => c.notnull && c.dflt_value === null && !c.pk)
      .map((c) => c.name);
    const cols = required.includes('slug') ? required : [...required, 'slug'];
    sdb
      .prepare(
        `INSERT INTO registered_books (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      )
      .run(...cols.map((c) => (c === 'slug' ? 'liffraedi' : 'x')));
    expect(boot(sdb).errors).toEqual([]);
  });

  it('a later boot with a registered `efnafraedi` book does not wedge on 015s rename (§C250)', () => {
    // 015 renamed efnafraedi → efnafraedi-2e once, historically; with no ledger it re-runs every boot.
    // Once efnafraedi-2e exists, a newly registered `efnafraedi` (a valid slug) made the rename hit
    // UNIQUE(registered_books.slug), an error the runner does not skip: the server never booted again.
    // That the book itself then survives (016 leaves it alone) is the next case.
    const sdir = fs.mkdtempSync(path.join(os.tmpdir(), 'boot-churn-efna-'));
    const sdb = new Database(path.join(sdir, 'sessions.db'));
    expect(boot(sdb).errors).toEqual([]);
    expect(boot(sdb).errors).toEqual([]);
    const required = sdb
      .pragma('table_info(registered_books)')
      .filter((c) => c.notnull && c.dflt_value === null && !c.pk)
      .map((c) => c.name);
    const cols = required.includes('slug') ? required : [...required, 'slug'];
    sdb
      .prepare(
        `INSERT INTO registered_books (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      )
      .run(...cols.map((c) => (c === 'slug' ? 'efnafraedi' : 'x')));
    expect(boot(sdb).errors).toEqual([]);
  });

  it('a later boot keeps a newly registered `efnafraedi` book (016 no longer merges and deletes it)', () => {
    // 016 cleaned up a historical state in which both efnafraedi and efnafraedi-2e existed by merging
    // the old book into the new one and deleting it. With no ledger it re-ran every boot, so once the
    // historical rename was done it swallowed any book an admin later registered as `efnafraedi`.
    // A fresh database never registers `efnafraedi` (019 and 049 register efnafraedi-2e), so once
    // efnafraedi-2e exists such a row is a deliberate new book, and both are left alone (§C250).
    const sdir = fs.mkdtempSync(path.join(os.tmpdir(), 'boot-churn-efna-keep-'));
    const sdb = new Database(path.join(sdir, 'sessions.db'));
    boot(sdb);
    boot(sdb);
    const required = sdb
      .pragma('table_info(registered_books)')
      .filter((c) => c.notnull && c.dflt_value === null && !c.pk)
      .map((c) => c.name);
    const cols = required.includes('slug') ? required : [...required, 'slug'];
    sdb
      .prepare(
        `INSERT INTO registered_books (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      )
      .run(...cols.map((c) => (c === 'slug' ? 'efnafraedi' : 'x')));
    const slugs = () =>
      sdb
        .prepare(
          "SELECT slug FROM registered_books WHERE slug IN ('efnafraedi', 'efnafraedi-2e') ORDER BY slug"
        )
        .all()
        .map((r) => r.slug);
    expect(boot(sdb).errors).toEqual([]);
    expect(slugs()).toEqual(['efnafraedi', 'efnafraedi-2e']);
    expect(boot(sdb).errors).toEqual([]);
    expect(slugs()).toEqual(['efnafraedi', 'efnafraedi-2e']);
  });

  it('a later boot keeps a newly registered `liffraedi` book (015 no longer deletes it)', () => {
    // 015 removed the historical liffraedi book (replaced by liffraedi-2e). With no ledger it re-ran on
    // every boot, so it deleted any book an admin later registered as `liffraedi`, with its chapters
    // and sections. Once liffraedi-2e exists the removal is done, and such a row is a deliberate new
    // book (a fresh database never registers `liffraedi`), so it is left alone (§C250).
    const sdir = fs.mkdtempSync(path.join(os.tmpdir(), 'boot-churn-liff-keep-'));
    const sdb = new Database(path.join(sdir, 'sessions.db'));
    boot(sdb);
    boot(sdb);
    const required = sdb
      .pragma('table_info(registered_books)')
      .filter((c) => c.notnull && c.dflt_value === null && !c.pk)
      .map((c) => c.name);
    const cols = required.includes('slug') ? required : [...required, 'slug'];
    sdb
      .prepare(
        `INSERT INTO registered_books (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      )
      .run(...cols.map((c) => (c === 'slug' ? 'liffraedi' : 'x')));
    const slugs = () =>
      sdb
        .prepare(
          "SELECT slug FROM registered_books WHERE slug IN ('liffraedi', 'liffraedi-2e') ORDER BY slug"
        )
        .all()
        .map((r) => r.slug);
    expect(boot(sdb).errors).toEqual([]);
    expect(slugs()).toEqual(['liffraedi', 'liffraedi-2e']);
    expect(boot(sdb).errors).toEqual([]);
    expect(slugs()).toEqual(['liffraedi', 'liffraedi-2e']);
  });

  it('the final schema is the same after the later boot', () => {
    const tables = (d) =>
      d
        .prepare(
          "SELECT name FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY name"
        )
        .all()
        .map((r) => r.name);
    const after = tables(db);
    const third = boot(db);
    expect(third.errors).toEqual([]);
    expect(tables(db)).toEqual(after);
  });
});
