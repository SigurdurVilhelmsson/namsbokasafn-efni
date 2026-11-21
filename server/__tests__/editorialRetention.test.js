// server/__tests__/editorialRetention.test.js
/**
 * The editorial retention core, step 1 `named` (G1.15(b) spec §4.3, §4.4 step 1; plan Task 5).
 *
 * After NAMED_EDITING_RECORDS takes effect, every person value dated on or before it becomes a placeholder made from
 * its row's rowid, the row's times are cut to the day, and the pure logs lose their covered rows. A record dated after
 * the date is never acted on and is reported. Each test plants rows in a database every migration built and compares
 * values, never counts alone: a whole-table snapshot is what sees a trigger's time stamp or a half-applied step.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { plantAll, insert } = require('./helpers/retentionPlant.cjs');
const { SCOPE } = require('../lib/editorialRetentionScope');
const { NAMED_EDITING_RECORDS, effectiveMs } = require('../lib/retentionDates');
const { planStep, applyStep } = require('../lib/editorialRetention');
const {
  addExclusion,
  addEntry,
  changeEntry,
  buildBookGlossaryRecord,
  C19_LOAD_LABEL,
} = require('../lib/bookGlossaryLayer');

const AT = effectiveMs(NAMED_EDITING_RECORDS); // 00:00 UTC on 1 Jan 2029
const LATER = '2029-02-01 09:00:00';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

let db;
beforeEach(() => {
  db = freshMigratedDb().db;
});
afterEach(() => db.close());

const scoped = (action) => Object.keys(SCOPE).filter((t) => SCOPE[t].action === action);
const SNAP_TABLES = [
  ...Object.keys(SCOPE),
  'book_chapters',
  'terminology_headwords',
  'retention_runs',
];
/** Every row of the tables the step may touch, order-independent, plus every trigger's stored SQL. */
function snapshot(d) {
  const out = {};
  for (const t of SNAP_TABLES) {
    out[t] = d
      .prepare(`SELECT * FROM "${t}"`)
      .all()
      .map((r) => JSON.stringify(r))
      .sort();
  }
  out.__triggers = d
    .prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
    .all();
  return out;
}
const rowOf = (t, rowid) =>
  db.prepare(`SELECT rowid AS _rowid, * FROM "${t}" WHERE rowid = ?`).get(rowid);
const refusal = (res, reason, table) =>
  res.refusals.find((r) => r.reason === reason && r.table === table);

describe('editorialRetention: the named step', () => {
  it('the planting helper reaches every strip and delete table', () => {
    const { rows } = plantAll(db);
    for (const t of [...scoped('strip'), ...scoped('delete')])
      expect(rows[t], t).toBeGreaterThan(0);
  });

  it('nothing changes before the date takes effect', () => {
    plantAll(db);
    const before = snapshot(db);
    const res = applyStep(db, 'named', AT - 1);
    expect(res).toMatchObject({ due: false, changed: 0 });
    expect(snapshot(db)).toEqual(before);
  });

  it('after it, no planted name or id is left in any column of any table, by value', () => {
    const { names, ints } = plantAll(db);
    expect(names.length).toBeGreaterThan(50); // control: the planting wrote names
    applyStep(db, 'named', AT);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .pluck()
      .all();
    const found = [];
    for (const t of tables) {
      for (const c of db.pragma(`table_info("${t}")`)) {
        const n = db
          .prepare(
            `SELECT COUNT(*) FROM "${t}" WHERE "${c.name}" IN (${names.map(() => '?').join(',')})`
          )
          .pluck()
          .get(...names);
        if (n) found.push(`${t}.${c.name}`);
      }
    }
    expect(found).toEqual([]);
    for (const t of scoped('strip')) {
      for (const p of SCOPE[t].person.filter((x) => x.type === 'integer')) {
        const n = db
          .prepare(
            `SELECT COUNT(*) FROM "${t}" WHERE "${p.col}" IN (${ints.map(() => '?').join(',')})`
          )
          .pluck()
          .get(...ints);
        expect(n, `${t}.${p.col}`).toBe(0);
      }
    }
  });

  it('a stripped value is fjarlægt-<rowid> in a text column and -<rowid> in an integer one', () => {
    const { rows } = plantAll(db);
    applyStep(db, 'named', AT);
    const edit = rowOf('segment_edits', rows.segment_edits);
    expect(edit.editor_id).toBe(`fjarlægt-${edit._rowid}`);
    expect(edit.reviewer_username).toBe(`fjarlægt-${edit._rowid}`);
    const rej = rowOf('suggestion_rejections', rows.suggestion_rejections);
    expect(rej.rejected_by).toBe(-rej._rowid);
  });

  it('the delete tables lose their covered rows', () => {
    const { rows } = plantAll(db);
    applyStep(db, 'named', AT);
    for (const t of scoped('delete')) expect(rowOf(t, rows[t]), t).toBeUndefined();
  });

  it('every time column of every stripped row is a day', () => {
    const { rows } = plantAll(db);
    applyStep(db, 'named', AT);
    for (const t of scoped('strip')) {
      const row = rowOf(t, rows[t]);
      for (const c of SCOPE[t].times) {
        if (/_ms$/.test(c)) expect(row[c] % DAY_MS, `${t}.${c}`).toBe(0);
        else expect(row[c], `${t}.${c}`).toMatch(DAY);
      }
    }
  });

  it('the times inside localization_logs.entries are days', () => {
    const { rows } = plantAll(db);
    applyStep(db, 'named', AT);
    const [entry] = JSON.parse(rowOf('localization_logs', rows.localization_logs).entries);
    expect(entry.timestamp).toBe('2028-06-01');
    expect(entry.updatedAt).toBe('2028-06-01');
    expect(entry.original).toBe('a'); // control: the content is kept
  });

  it('the timestamp triggers survive, and none stamps a stripped row with the run time', () => {
    const { rows } = plantAll(db);
    const triggers = snapshot(db).__triggers;
    expect(triggers.map((t) => t.tbl_name)).toEqual(
      expect.arrayContaining(['feedback', 'book_sections'])
    );
    applyStep(db, 'named', AT);
    expect(snapshot(db).__triggers).toEqual(triggers);
    for (const t of [
      'feedback',
      'book_sections',
      'chapter_pipeline_status',
      'terminology_translations',
    ]) {
      expect(rowOf(t, rows[t]).updated_at, t).toBe('2028-06-01');
    }
    // Control: the recreated trigger still stamps an ordinary update.
    db.prepare("UPDATE feedback SET status = 'closed' WHERE id = ?").run(rows.feedback);
    expect(rowOf('feedback', rows.feedback).updated_at).not.toBe('2028-06-01');
  });

  it('two pending edits by two editors on one segment both strip', () => {
    const seg = {
      book: 'b',
      chapter: 1,
      module_id: 'm1',
      segment_id: 's1',
      original_content: 'a',
      edited_content: 'b',
    };
    const at = { created_at: '2028-03-01 08:00:00' };
    const e1 = insert(db, 'segment_edits', {
      ...seg,
      ...at,
      status: 'pending',
      editor_id: 'Ed One',
      editor_username: 'one',
    });
    const e2 = insert(db, 'segment_edits', {
      ...seg,
      ...at,
      status: 'pending',
      editor_id: 'Ed Two',
      editor_username: 'two',
    });
    const l1 = insert(db, 'localization_pending_edits', {
      ...seg,
      ...at,
      status: 'pending',
      editor_id: 'Lo One',
      editor_username: 'one',
    });
    const l2 = insert(db, 'localization_pending_edits', {
      ...seg,
      ...at,
      status: 'pending',
      editor_id: 'Lo Two',
      editor_username: 'two',
    });
    applyStep(db, 'named', AT);
    expect([rowOf('segment_edits', e1).editor_id, rowOf('segment_edits', e2).editor_id]).toEqual([
      `fjarlægt-${e1}`,
      `fjarlægt-${e2}`,
    ]);
    expect(rowOf('localization_pending_edits', l2).editor_id).toBe(`fjarlægt-${l2}`);
    expect(rowOf('localization_pending_edits', l1).status).toBe('pending'); // still decidable
  });

  it('a two-actor row reviewed after the date keeps the reviewer and strips the author', () => {
    const id = insert(db, 'segment_edits', {
      book: 'b',
      chapter: 1,
      module_id: 'm1',
      segment_id: 's2',
      original_content: 'a',
      edited_content: 'b',
      status: 'approved',
      editor_id: 'Author Person',
      editor_username: 'author',
      created_at: '2028-11-30 16:45:00',
      reviewer_id: 'Late Reviewer',
      reviewer_username: 'late',
      reviewed_at: LATER,
    });
    const res = applyStep(db, 'named', AT);
    const row = rowOf('segment_edits', id);
    expect(row).toMatchObject({
      editor_id: `fjarlægt-${id}`,
      editor_username: `fjarlægt-${id}`,
      reviewer_id: 'Late Reviewer',
      reviewer_username: 'late',
      created_at: '2028-11-30',
      reviewed_at: LATER, // a time after the date is never cut
    });
    expect(refusal(res, 'later-records', 'segment_edits')).toMatchObject({ rows: 1 });
  });

  it('a row dated after the date is untouched and raises the refusal; a delete-table row too', () => {
    const fb = insert(db, 'feedback', {
      type: 'bug',
      message: 'm',
      user_name: 'Late Writer',
      created_at: LATER,
    });
    const log = insert(db, 'activity_log', {
      type: 't',
      description: 'd',
      user_id: 'Late Actor',
      username: 'late',
      created_at: LATER,
    });
    const before = [rowOf('feedback', fb), rowOf('activity_log', log)];
    const res = applyStep(db, 'named', AT);
    expect([rowOf('feedback', fb), rowOf('activity_log', log)]).toEqual(before);
    expect(refusal(res, 'later-records', 'feedback')).toMatchObject({ rows: 1 });
    expect(refusal(res, 'later-records', 'activity_log')).toMatchObject({ rows: 1 });
  });

  it('the boundary: 23:59:59 on the date is covered in both text formats and in ms; 00:00 the next day is not', () => {
    const { rows } = plantAll(db);
    const disc = (name, at) =>
      insert(db, 'segment_discussions', {
        segment_edit_id: rows.segment_edits,
        comment: 'c',
        user_id: name,
        username: name,
        created_at: at,
      });
    const a = disc('Edge Space', '2028-12-31 23:59:59');
    const b = disc('Edge Iso', '2028-12-31T23:59:59.999Z');
    const c = disc('Next Space', '2029-01-01 00:00:00');
    const d = disc('Next Iso', '2029-01-01T00:00:00.000Z');
    const rej = (op, ms) =>
      insert(db, 'suggestion_rejections', {
        book: 'b',
        chapter: 1,
        module_id: 'm1',
        segment_id: 's1',
        occurrence: 0,
        op_id: op,
        ruling_id: 'r',
        rejected_by: 7,
        rejected_at_ms: ms,
      });
    const e = rej('edge', AT - 1);
    const f = rej('next', AT);
    applyStep(db, 'named', AT);
    expect(rowOf('segment_discussions', a).user_id).toBe(`fjarlægt-${a}`);
    expect(rowOf('segment_discussions', b).user_id).toBe(`fjarlægt-${b}`);
    expect(rowOf('segment_discussions', c).user_id).toBe('Next Space');
    expect(rowOf('segment_discussions', d).user_id).toBe('Next Iso');
    expect(rowOf('suggestion_rejections', e).rejected_by).toBe(-e);
    expect(rowOf('suggestion_rejections', f).rejected_by).toBe(7);
  });

  it('an unreadable time is never read as covered: the row is left and reported', () => {
    const { rows } = plantAll(db);
    const id = insert(db, 'segment_discussions', {
      segment_edit_id: rows.segment_edits,
      comment: 'c',
      user_id: 'Odd Time',
      username: 'odd',
      created_at: 'yesterday',
    });
    const res = applyStep(db, 'named', AT);
    expect(rowOf('segment_discussions', id).user_id).toBe('Odd Time');
    expect(refusal(res, 'unreadable-time', 'segment_discussions')).toMatchObject({ rows: 1 });
  });

  it('a name beside a NULL time is left and reported', () => {
    const id = insert(db, 'content_versions', {
      book: 'b',
      chapter: 1,
      module_id: 'm1',
      segment_id: 's1',
      content: 'x',
      version: 1,
      track: 'faithful',
      applied_by: 'Undated Person',
      applied_at: null,
    });
    const res = applyStep(db, 'named', AT);
    expect(rowOf('content_versions', id).applied_by).toBe('Undated Person');
    expect(refusal(res, 'undated-name', 'content_versions')).toMatchObject({ rows: 1 });
  });

  it('unparseable entries are left and reported, the localizer is still stripped, and nothing throws', () => {
    const { rows } = plantAll(db);
    const id = insert(db, 'localization_logs', {
      section_id: rows.book_sections,
      localizer: 'Log Person',
      entries: 'not json',
      created_at: '2028-02-02 02:02:02',
      updated_at: '2028-02-03 03:03:03',
    });
    const res = applyStep(db, 'named', AT);
    expect(rowOf('localization_logs', id)).toMatchObject({
      localizer: `fjarlægt-${id}`,
      entries: 'not json',
    });
    expect(refusal(res, 'unreadable-json', 'localization_logs')).toMatchObject({ rows: 1 });
  });

  it('a second applyStep changes nothing', () => {
    plantAll(db);
    applyStep(db, 'named', AT);
    const once = snapshot(db);
    expect(applyStep(db, 'named', AT).changed).toBe(0);
    expect(snapshot(db)).toEqual(once);
  });

  it('a users row is never changed', () => {
    const { accountId } = plantAll(db);
    const before = db.prepare('SELECT * FROM users').all();
    applyStep(db, 'named', AT);
    expect(db.prepare('SELECT * FROM users').all()).toEqual(before);
    expect(before.some((u) => u.id === accountId)).toBe(true); // control
  });

  it('a failure mid-step leaves every row and every trigger as it was', () => {
    plantAll(db);
    db.exec(
      "CREATE TRIGGER boom BEFORE DELETE ON activity_log BEGIN SELECT RAISE(ABORT, 'boom'); END"
    );
    const before = snapshot(db);
    expect(() => applyStep(db, 'named', AT)).toThrow(/boom/);
    expect(snapshot(db)).toEqual(before);
  });

  it('planStep reports what applyStep changes and writes nothing', () => {
    plantAll(db);
    insert(db, 'feedback', {
      type: 'bug',
      message: 'm',
      user_name: 'Late Writer',
      created_at: LATER,
    });
    const before = snapshot(db);
    const plan = planStep(db, 'named', AT);
    expect(snapshot(db)).toEqual(before);
    expect(plan.due).toBe(true);
    const res = applyStep(db, 'named', AT);
    expect(Object.values(plan.counts).reduce((a, b) => a + b, 0)).toBe(res.changed);
    expect(plan.refusals).toEqual(res.refusals);
    expect(res.changed).toBeGreaterThan(30); // control
  });

  it('an unknown step is refused', () => {
    expect(() => planStep(db, 'everything', AT)).toThrow(/unknown retention step/);
  });
});

describe('editorialRetention: the public glossary record is unchanged by the strip (plan Task 5 ruling)', () => {
  const BOOK = 'efnafraedi-2e';
  const ACCT = '3f2b8c1e-9a4d-4e7b-8c55-1d2e3f4a5b6c';
  const ACCT2 = '9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
  const base = { book: BOOK, reason: 'because', source: 'test' };
  const withoutGenerated = ({ generated: _g, ...rest }) => rest;

  it('buildBookGlossaryRecord is the same before and after, while the database changed only where it should', () => {
    addExclusion(db, { ...base, english: 'Function', by: ACCT, at: '2028-05-01T10:00:00.000Z' });
    addExclusion(db, {
      ...base,
      english: 'Atom',
      by: C19_LOAD_LABEL,
      at: '2026-11-18T12:00:00.000Z',
    });
    const e = addEntry(db, {
      ...base,
      english: ['unit cell'],
      icelandic: 'grindareining',
      replaces: [],
      by: ACCT,
      at: '2028-05-02T10:00:00.000Z',
    });
    changeEntry(db, {
      ...base,
      conceptId: e.conceptId,
      icelandic: 'grindareiningar',
      by: ACCT2,
      at: '2028-05-03T10:00:00.000Z',
    });
    addExclusion(db, { ...base, english: 'Later', by: ACCT, at: '2029-01-05T10:00:00.000Z' });
    const before = withoutGenerated(buildBookGlossaryRecord(db, BOOK));
    expect(before.entries[0].updatedBy).toBe('aðalritstjóri'); // control: a non-null updated_by is in the record

    applyStep(db, 'named', AT);

    expect(withoutGenerated(buildBookGlossaryRecord(db, BOOK))).toEqual(before);
    const changes = db.prepare('SELECT id, by, at FROM book_glossary_change ORDER BY id').all();
    expect(changes.map((c) => c.by)).toEqual([
      `fjarlægt-${changes[0].id}`,
      C19_LOAD_LABEL,
      `fjarlægt-${changes[2].id}`,
      `fjarlægt-${changes[3].id}`,
      ACCT, // dated after the date: untouched
    ]);
    const entry = db.prepare('SELECT created_by, updated_by FROM book_glossary_entry').get();
    expect(entry.created_by).toMatch(/^fjarlægt-/);
    expect(entry.updated_by).toMatch(/^fjarlægt-/);
    expect(db.prepare('SELECT COUNT(*) FROM book_glossary_change').pluck().get()).toBe(5); // no history row added
  });
});
