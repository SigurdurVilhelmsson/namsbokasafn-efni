// server/__tests__/editorialRetentionScope.test.js
/**
 * Every person column, classified once (G1.15(b) spec §4.2; plan Task 4).
 *
 * Schema-anchored: the schema comes from every real migration (freshMigratedDb), and every column whose name looks
 * like a person must be classified, by SCOPE (it names a person) or by NOT_PERSON (it matches the pattern but holds
 * no person, with the reason). A table or column added later that names a person fails here, by name, until it is
 * classified, so it cannot escape the retention rule silently.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { SCOPE, NOT_PERSON } = require('../lib/editorialRetentionScope');

// The census pattern of 2026-11-21 (~/.cache/namsbokasafn-audit/2026-11-21-c46/g115b-schema-census.cjs), copied
// here, plus a `_name$` arm: book_sections.localizer_name matched neither the pattern nor the explicit list.
const PERSON_SHAPED =
  /user|editor|username|_by\b|by_|author|reviewer|proposed|approved|actor|email|display_name|provider|ip_addr|^ip$|assignee|owner|created_by|applied_by|_name$/i;
// The shapes the pattern misses (spec §4.2).
const EXPLICIT = new Set([
  'assigned_to',
  'by',
  'localizer',
  'responder_id',
  'responder_name',
  'user_email',
  'user_name',
]);

const { db } = freshMigratedDb();
afterAll(() => db.close());

const tableNames = (d) =>
  d
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .pluck()
    .all();
const columnsOf = (d, t) => d.pragma(`table_info("${t}")`);
const personCols = (t) => (SCOPE[t] ? SCOPE[t].person.map((p) => p.col) : []);

/** Every person-shaped column in `d` that neither SCOPE nor NOT_PERSON classifies, as `table.column`. */
function unclassified(d) {
  const out = [];
  for (const t of tableNames(d)) {
    for (const { name } of columnsOf(d, t)) {
      if (!PERSON_SHAPED.test(name) && !EXPLICIT.has(name)) continue;
      if (personCols(t).includes(name) || NOT_PERSON[`${t}.${name}`]) continue;
      out.push(`${t}.${name}`);
    }
  }
  return out;
}

describe('editorialRetentionScope: SCOPE', () => {
  it('classifies every person-shaped column of the migrated schema', () => {
    expect(unclassified(db)).toEqual([]);
  });

  it('control: a planted table with a person column is named', () => {
    const { db: d } = freshMigratedDb();
    try {
      d.exec(
        'CREATE TABLE planted_log (id INTEGER PRIMARY KEY, noted_by TEXT, localizer TEXT, note TEXT)'
      );
      expect(unclassified(d).sort()).toEqual(['planted_log.localizer', 'planted_log.noted_by']);
    } finally {
      d.close();
    }
  });

  it('holds the 35 tables that name a person, and no other', () => {
    expect(Object.keys(SCOPE)).toHaveLength(35);
    for (const t of Object.keys(SCOPE)) expect(tableNames(db), t).toContain(t);
  });

  it('every NOT_PERSON entry names a real column and gives a reason', () => {
    for (const [key, reason] of Object.entries(NOT_PERSON)) {
      const [t, c] = key.split('.');
      expect(
        columnsOf(db, t).map((x) => x.name),
        key
      ).toContain(c);
      expect(typeof reason).toBe('string');
      expect(reason.length, key).toBeGreaterThan(10);
      expect(personCols(t), key).not.toContain(c);
    }
  });

  it('every person column exists, with the type its placeholder needs', () => {
    for (const [t, entry] of Object.entries(SCOPE)) {
      const declared = Object.fromEntries(
        columnsOf(db, t).map((c) => [c.name, c.type.toUpperCase()])
      );
      for (const p of entry.person) {
        expect(declared, `${t}.${p.col}`).toHaveProperty(p.col);
        expect(p.type, `${t}.${p.col}`).toBe(declared[p.col] === 'INTEGER' ? 'integer' : 'text');
      }
    }
  });

  it('every timeCol, time and JSON-time column exists in its table; only kept tables have no timeCol', () => {
    for (const [t, entry] of Object.entries(SCOPE)) {
      const cols = columnsOf(db, t).map((c) => c.name);
      for (const p of entry.person) {
        if (entry.action === 'keep') expect(p.timeCol, `${t}.${p.col}`).toBeNull();
        else expect(cols, `${t}.${p.col} timeCol`).toContain(p.timeCol);
      }
      for (const c of entry.times) expect(cols, `${t} time ${c}`).toContain(c);
      for (const c of entry.jsonTimes ?? []) expect(cols, `${t} json ${c}`).toContain(c);
    }
  });

  it('the actions are the spec §4.2 table, with the columns it missed classified as strip', () => {
    const byAction = (a) =>
      Object.keys(SCOPE)
        .filter((t) => SCOPE[t].action === a)
        .sort();
    expect(byAction('delete')).toEqual([
      'activity_log',
      'analytics_events',
      'chapter_assignments',
      'chapter_generation_log',
      'chapter_locks',
      'notification_preferences',
      'notifications',
      'user_book_access',
      'user_chapter_assignments',
    ]);
    expect(byAction('keep')).toEqual(['editor_licence_clauses', 'users']);
    expect(byAction('consent')).toEqual(['research_consent']);
    expect(byAction('strip')).toHaveLength(23);
    // Named by no line of the spec's table, and each names a person (final census, Task 4):
    expect(personCols('book_sections')).toEqual(
      expect.arrayContaining(['localizer', 'localizer_name'])
    );
    expect(personCols('feedback')).toContain('assigned_to');
  });

  it('each actor is dated by its own time column (spec §4.3)', () => {
    const timeOf = (t, c) => SCOPE[t].person.find((p) => p.col === c).timeCol;
    expect(timeOf('segment_edits', 'editor_id')).toBe('created_at');
    expect(timeOf('segment_edits', 'reviewer_id')).toBe('reviewed_at');
    expect(timeOf('localization_pending_edits', 'reviewer_username')).toBe('reviewed_at');
    expect(timeOf('module_reviews', 'submitted_by')).toBe('submitted_at');
    expect(timeOf('book_glossary_entry', 'updated_by')).toBe('updated_at');
    expect(timeOf('suggestion_rejections', 'rejected_by')).toBe('rejected_at_ms');
  });

  it('localization_logs strips the times inside entries', () => {
    expect(SCOPE.localization_logs.jsonTimes).toEqual(['entries']);
  });

  it('the book glossary tables are stripped through the layer, never by SQL (plan Task 5 ruling)', () => {
    const viaLayer = Object.keys(SCOPE)
      .filter((t) => SCOPE[t].via === 'layer')
      .sort();
    expect(viaLayer).toEqual([
      'book_glossary_change',
      'book_glossary_entry',
      'book_glossary_exclusion',
    ]);
  });

  it('every strip table has a rowid, which the placeholder is made from (spec §4.3)', () => {
    for (const t of Object.keys(SCOPE).filter((x) => SCOPE[x].action === 'strip')) {
      const sql = db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').pluck().get(t);
      expect(sql, t).not.toMatch(/WITHOUT\s+ROWID/i);
    }
  });

  it('lists every unique index that holds a strip column', () => {
    const found = [];
    for (const t of Object.keys(SCOPE).filter((x) => SCOPE[x].action === 'strip')) {
      for (const ix of db.pragma(`index_list("${t}")`)) {
        if (!ix.unique) continue;
        const cols = db.pragma(`index_info("${ix.name}")`).map((c) => c.name);
        if (cols.some((c) => personCols(t).includes(c))) found.push(ix.name);
      }
    }
    expect(found.sort()).toEqual([
      'idx_loc_pending_one_per_editor',
      'idx_segment_edits_one_pending',
    ]);
  });

  it('is deeply frozen', () => {
    expect(Object.isFrozen(SCOPE)).toBe(true);
    expect(Object.isFrozen(SCOPE.segment_edits.person[0])).toBe(true);
    expect(Object.isFrozen(NOT_PERSON)).toBe(true);
  });
});
