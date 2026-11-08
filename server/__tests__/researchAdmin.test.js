/**
 * The research admin reader (G1.1 + G1.2 spec §5.16, §5.1; T17's PR4 part; PR4 Task 4, decisions
 * 13 and 16).
 *
 * The openers and the reads the deletion scripts (key readers) and PR5's raw export (event readers)
 * use, and never a write. The research file is built by ensureResearchSchema on a temp path, put
 * in WAL mode as the server leaves it, and seeded by SQL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { ensureResearchSchema } = require('../lib/researchSchema');
const admin = require('../scripts/lib/researchAdmin');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = path.join(__dirname, '..', 'scripts', 'lib', 'researchAdmin.js');
const RESEARCH_LOG_PATH = path.join(__dirname, '..', 'services', 'researchLog.js');

const K1 = 'a'.repeat(32); // K1 < K2, so editor_key order is K1 then K2
const K2 = 'b'.repeat(32);
const BIG_ID = 9007199254740993n; // above 2^53

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'research-admin-'));
const seeded = path.join(work, 'research.db');
let copyN = 0;
const copyOfSeeded = () => {
  const p = path.join(work, `copy-${++copyN}.db`);
  fs.copyFileSync(seeded, p);
  return p;
};

const open = [];
const track = (db) => {
  open.push(db);
  return db;
};

function seed(p) {
  const db = new Database(p);
  expect(ensureResearchSchema(db).ok).toBe(true);
  db.pragma('journal_mode = WAL');
  db.prepare('INSERT INTO editor_keys (interval_id, editor_key) VALUES (?, ?)').run(1, K1);
  db.prepare('INSERT INTO editor_keys (interval_id, editor_key) VALUES (?, ?)').run(2, K2);
  const event = db.prepare(
    `INSERT INTO research_events
       (id, key_seq, event_type, editor_key, server_time_ms, replayed, book, chapter, module_id,
        flag_snapshot_json, commit_source)
     VALUES (?, ?, 'segment-saved', ?, 1700000000000, 0, 'efnafraedi-2e', 1, 'm1', '{}', 'unknown')`
  );
  const item = db.prepare(
    `INSERT INTO research_event_items (event_id, ordinal, item_type, outcome, claim)
     VALUES (?, 0, ?, 'applied', 'validated')`
  );
  // Inserted out of order, so the reader's ORDER BY is what puts them in order.
  event.run(3n, 1, K2);
  event.run(BIG_ID, 2, K1);
  event.run(5n, 1, K1);
  item.run(BIG_ID, 'item-big');
  item.run(5n, 'item-five');
  db.close(); // the last connection: checkpoints the WAL into the file
}

beforeAll(() => seed(seeded));
afterAll(() => {
  while (open.length) {
    const db = open.pop();
    if (db.open) db.close();
  }
  fs.rmSync(work, { recursive: true, force: true });
});

describe('researchAdmin', () => {
  it('opens only an existing file', () => {
    const missing = path.join(work, 'absent.db');
    let caught;
    try {
      admin.openResearch({ researchPath: missing });
    } catch (err) {
      caught = err;
    }
    expect(caught?.code).toBe('SQLITE_CANTOPEN');
    expect(fs.existsSync(missing)).toBe(false);
    // Control: the seeded path opens.
    expect(() => track(admin.openResearch({ researchPath: seeded }))).not.toThrow();
  });

  it('is read-only unless asked to write', () => {
    const ro = track(admin.openResearch({ researchPath: seeded }));
    expect(() => ro.prepare('DELETE FROM research_event_items').run()).toThrow(/readonly/i);
    // Control, on a copy of the file: a write handle can.
    const rw = track(admin.openResearch({ researchPath: copyOfSeeded(), write: true }));
    expect(() => rw.prepare('DELETE FROM research_event_items').run()).not.toThrow();
  });

  it('reads ids above 2^53 exactly (PR3 decision 4)', () => {
    const db = track(admin.openResearch({ researchPath: seeded }));
    expect([...admin.iterateEvents(db)].map((e) => e.id)).toContain(BIG_ID);
  });

  it('the readers', () => {
    const db = track(admin.openResearch({ researchPath: seeded }));
    expect(admin.keyForInterval(db, 1)).toBe(K1);
    expect(admin.keyForInterval(db, 3)).toBeNull();
    expect(admin.allKeys(db)).toEqual([
      { intervalId: 1n, editorKey: K1 },
      { intervalId: 2n, editorKey: K2 },
    ]);
    expect(admin.anyResearchRow(db)).toBe(true);
    expect([...admin.iterateEvents(db)].map((e) => [e.editor_key, e.key_seq])).toEqual([
      [K1, 1n],
      [K1, 2n],
      [K2, 1n],
    ]);
    const expectedItems = db
      .prepare('SELECT * FROM research_event_items WHERE event_id = ?')
      .all(BIG_ID);
    expect(expectedItems).toHaveLength(1);
    expect(admin.itemsForEvent(db, BIG_ID)).toEqual(expectedItems);

    // anyResearchRow is false once every row is gone, deleted through a write handle.
    const emptied = copyOfSeeded();
    const rw = track(admin.openResearch({ researchPath: emptied, write: true }));
    rw.exec(
      'DELETE FROM research_event_items; DELETE FROM research_events; DELETE FROM editor_keys;'
    );
    expect(admin.anyResearchRow(rw)).toBe(false);
  });

  it('holds no write statement', () => {
    // Upper-case SQL keywords only: prose in comments is lower case.
    const WRITE = /\b(?:INSERT|UPDATE|DELETE|REPLACE|VACUUM|ATTACH|DROP|ALTER|CREATE)\s/;
    expect(WRITE.test(fs.readFileSync(MODULE_PATH, 'latin1'))).toBe(false);
    // Control: the same pattern matches the research log's writer.
    expect(WRITE.test(fs.readFileSync(RESEARCH_LOG_PATH, 'latin1'))).toBe(true);
  });
});
