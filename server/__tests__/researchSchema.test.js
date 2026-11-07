// server/__tests__/researchSchema.test.js
// G1.2 PR3 Task 2: the research file's schema (spec §5.1, §5.9, §5.10, §5.16).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { ensureResearchSchema, RESEARCH_SCHEMA_VERSION } = require('../lib/researchSchema');

let dir;
let db;
const KEY = 'a'.repeat(32);
const KEY2 = 'b'.repeat(32);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-schema-'));
  db = new Database(path.join(dir, 'research.db'));
  db.defaultSafeIntegers(true);
});
afterEach(() => {
  if (db.open) db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const cols = (t) => db.pragma(`table_info(${t})`).map((c) => c.name);
const version = () => Number(db.pragma('user_version', { simple: true }));
const masterSql = () =>
  Object.fromEntries(
    db
      .prepare('SELECT name, sql FROM sqlite_master ORDER BY name')
      .all()
      .map((r) => [r.name, r.sql])
  );
const PROPAGATION_INDEX = 'idx_research_events_propagation_editing';
/** A version-1 file: the version-2 schema less its one addition, the propagation index. */
const toVersion1 = () => {
  ensureResearchSchema(db);
  db.exec('DROP INDEX idx_research_events_propagation_editing');
  db.pragma('user_version = 1');
};
const addKey = (k = KEY, interval = 1n) =>
  db
    .prepare('INSERT INTO editor_keys (interval_id, editor_key, stratum) VALUES (?, ?, NULL)')
    .run(interval, k);
let nextId = 1n;
const addEvent = (key, seq, actionId = null) =>
  db
    .prepare(
      `INSERT INTO research_events (id, key_seq, event_type, editor_key, client_action_id, server_time_ms,
         replayed, book, chapter, module_id, flag_snapshot_json, commit_source)
       VALUES (?, ?, 'x', ?, ?, 1, 0, 'b', 1, 'm1', '{}', 'unknown')`
    )
    .run(nextId++, seq, key, actionId);

describe('ensureResearchSchema', () => {
  it('builds the three tables on a fresh file, column by column (spec §5.9, §5.10, §5.16)', () => {
    expect(ensureResearchSchema(db)).toEqual({ ok: true, version: 2 });
    expect(RESEARCH_SCHEMA_VERSION).toBe(2);
    expect(version()).toBe(2);
    expect(cols('research_events')).toEqual([
      'id',
      'key_seq',
      'event_type',
      'editor_key',
      'client_action_id',
      'client_action_time_ms',
      'server_time_ms',
      'replayed',
      'session_id',
      'book',
      'chapter',
      'module_id',
      'segment_id',
      'occurrence',
      'served_version_id',
      'base_is_sha256',
      'editing_kind',
      'editing_id',
      'editing_content_sha256',
      'origin',
      'content_json',
      'before_json',
      'detail_json',
      'flag_snapshot_json',
      'server_commit',
      'commit_source',
      'code_dirty',
    ]);
    expect(cols('research_event_items')).toEqual([
      'event_id',
      'ordinal',
      'item_type',
      'outcome',
      'source',
      'op_id',
      'occurrence',
      'category',
      'run_id',
      'group_action_id',
      'ruling_id',
      'rule_id',
      'client_time_ms',
      'claim',
      'detail_json',
    ]);
    expect(cols('editor_keys')).toEqual(['interval_id', 'editor_key', 'stratum']);
  });

  it('declares the idempotency and ordering indexes', () => {
    ensureResearchSchema(db);
    const idx = Object.fromEntries(
      db.pragma('index_list(research_events)').map((i) => [i.name, i])
    );
    const names = (n) => db.pragma(`index_info(${n})`).map((c) => c.name);
    expect(Number(idx.idx_research_events_action.unique)).toBe(1);
    expect(names('idx_research_events_action')).toEqual(['editor_key', 'client_action_id']);
    expect(masterSql().idx_research_events_action).toContain('WHERE client_action_id IS NOT NULL');
    expect(Number(idx.idx_research_events_key_seq.unique)).toBe(1);
    expect(names('idx_research_events_key_seq')).toEqual(['editor_key', 'key_seq']);
  });

  it('version 2: a partial index on editing_id over propagation events only (spec AMENDED 2026-11-07)', () => {
    ensureResearchSchema(db);
    const idx = Object.fromEntries(
      db.pragma('index_list(research_events)').map((i) => [i.name, i])
    );
    const own = idx[PROPAGATION_INDEX];
    expect(own).toBeDefined();
    expect(Number(own.unique)).toBe(0);
    expect(Number(own.partial)).toBe(1);
    expect(db.pragma(`index_info(${PROPAGATION_INDEX})`).map((c) => c.name)).toEqual([
      'editing_id',
    ]);
    expect(masterSql()[PROPAGATION_INDEX]).toContain("WHERE event_type = 'propagation'");
  });

  it('a version-1 file is upgraded to version 2: the index is added and its rows are kept', () => {
    toVersion1();
    addKey();
    addEvent(KEY, 1n, 'kept');
    expect(version()).toBe(1);
    expect(masterSql()[PROPAGATION_INDEX]).toBeUndefined(); // the control: a real version-1 file
    expect(ensureResearchSchema(db)).toEqual({ ok: true, version: 2 });
    expect(masterSql()[PROPAGATION_INDEX]).toContain("WHERE event_type = 'propagation'");
    expect(
      db
        .prepare('SELECT client_action_id FROM research_events')
        .all()
        .map((r) => r.client_action_id)
    ).toEqual(['kept']);
    const upgraded = masterSql();
    expect(ensureResearchSchema(db)).toEqual({ ok: true, version: 2 }); // opened again: a no-op
    expect(masterSql()).toEqual(upgraded);
  });

  it('never throws: a version-2 step that fails rolls back whole and leaves the file at version 1', () => {
    toVersion1();
    db.exec('CREATE TABLE idx_research_events_propagation_editing (x TEXT)'); // the index's name is taken
    const r = ensureResearchSchema(db);
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(version()).toBe(1);
    expect(
      db.prepare('SELECT type FROM sqlite_master WHERE name = ?').all(PROPAGATION_INDEX)
    ).toEqual([{ type: 'table' }]);
  });

  it("researchLog's propagated-copy lookup names the event type as a literal and probes the index", () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'researchLog.js'), 'utf8');
    const m = /const PROPAGATIONS_OF_ROWS_SQL = `([^`]+)`;/.exec(src);
    expect(m).not.toBeNull();
    const sql = m[1];
    // A partial index serves a query only when the query's WHERE implies the index's: a literal does.
    expect(sql).toContain("event_type = 'propagation'");
    const plan = () =>
      db
        .prepare('EXPLAIN QUERY PLAN ' + sql)
        .all('[1, 2]')
        .map((r) => r.detail);
    ensureResearchSchema(db);
    expect(plan()).toContain(
      `SEARCH research_events USING INDEX ${PROPAGATION_INDEX} (editing_id=?)`
    );
    expect(plan()).not.toContain('SCAN research_events');
    // The control: without the index the same query scans the event log, so the check above can tell.
    db.exec('DROP INDEX idx_research_events_propagation_editing');
    expect(plan()).toContain('SCAN research_events');
  });

  it('rejects a repeated client_action_id for one key', () => {
    ensureResearchSchema(db);
    addKey();
    addEvent(KEY, 1n, 'a');
    expect(() => addEvent(KEY, 2n, 'a')).toThrow(/UNIQUE/);
  });

  it('lets events without a client_action_id coexist (NULLs do not collide)', () => {
    ensureResearchSchema(db);
    addKey();
    addEvent(KEY, 1n, null);
    expect(() => addEvent(KEY, 2n, null)).not.toThrow();
  });

  it('rejects a repeated key_seq for one key', () => {
    ensureResearchSchema(db);
    addKey();
    addEvent(KEY, 1n);
    expect(() => addEvent(KEY, 1n)).toThrow(/UNIQUE/);
  });

  it('refuses an event whose editor_key has no editor_keys row', () => {
    ensureResearchSchema(db);
    expect(() => addEvent(KEY2, 1n)).toThrow(/FOREIGN KEY/);
  });

  it("deletes an event's items with the event (ON DELETE CASCADE)", () => {
    ensureResearchSchema(db);
    addKey();
    const id = nextId;
    addEvent(KEY, 1n);
    db.prepare(
      `INSERT INTO research_event_items (event_id, ordinal, item_type, outcome, claim)
       VALUES (?, 0, 't', 'applied', 'validated')`
    ).run(id);
    expect(
      db.prepare('SELECT * FROM research_event_items WHERE event_id = ?').all(id)
    ).toHaveLength(1);
    db.prepare('DELETE FROM research_events WHERE id = ?').run(id);
    expect(db.prepare('SELECT * FROM research_event_items WHERE event_id = ?').all(id)).toEqual([]);
  });

  it('refuses to delete a key row while an event names it', () => {
    ensureResearchSchema(db);
    addKey();
    addEvent(KEY, 1n);
    expect(() => db.prepare('DELETE FROM editor_keys WHERE editor_key = ?').run(KEY)).toThrow(
      /FOREIGN KEY/
    );
  });

  it('re-running on the result changes nothing', () => {
    ensureResearchSchema(db);
    const before = masterSql();
    expect(ensureResearchSchema(db)).toEqual({ ok: true, version: 2 });
    expect(masterSql()).toEqual(before);
  });

  it('never throws: a conflicting table rolls the step back and leaves user_version at 0', () => {
    db.exec('CREATE TABLE research_events (x TEXT)');
    const r = ensureResearchSchema(db);
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(version()).toBe(0);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'editor_keys'").all()).toEqual(
      []
    );
  });

  it('control: the same call on a fresh file is ok', () => {
    expect(ensureResearchSchema(db).ok).toBe(true);
  });

  it('a file newer than this code is not ok, and nothing is created', () => {
    db.pragma('user_version = ' + (RESEARCH_SCHEMA_VERSION + 1));
    const r = ensureResearchSchema(db);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/newer/);
    expect(db.prepare('SELECT name FROM sqlite_master').all()).toEqual([]);
  });

  it('a closed handle is not ok, and does not throw', () => {
    db.close();
    expect(ensureResearchSchema(db).ok).toBe(false);
  });

  it('lives outside server/migrations (spec §5.1)', () => {
    const migDir = path.join(__dirname, '..', 'migrations');
    const hits = fs
      .readdirSync(migDir)
      .filter((f) => fs.statSync(path.join(migDir, f)).isFile())
      .filter((f) =>
        /research_events|editor_keys/.test(fs.readFileSync(path.join(migDir, f), 'latin1'))
      );
    expect(hits).toEqual([]);
    const own = fs.readFileSync(path.join(__dirname, '..', 'lib', 'researchSchema.js'), 'latin1');
    expect(own).toMatch(/research_events/);
  });
});
