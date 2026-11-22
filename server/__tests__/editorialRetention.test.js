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
const {
  plantAll,
  insert,
  pinSeeds,
  AT: PLANT_AT,
  AT_MS: PLANT_AT_MS,
} = require('./helpers/retentionPlant.cjs');
const { SCOPE } = require('../lib/editorialRetentionScope');
const {
  NAMED_EDITING_RECORDS,
  UNNAMED_RECORDS,
  CONSENT_RECORDS,
  RESEARCH_RAW_ROWS,
  effectiveMs,
} = require('../lib/retentionDates');
const Database = require('better-sqlite3');
const { isDue: isResearchDue } = require('../scripts/research-retention');
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
  pinSeeds(db);
});
afterEach(() => db.close());

const scoped = (action) => Object.keys(SCOPE).filter((t) => SCOPE[t].action === action);
const SNAP_TABLES = [
  ...Object.keys(SCOPE),
  'book_chapters',
  'terminology_headwords',
  'retention_runs',
  'served_text_versions',
  'module_openings',
  'module_opening_inflight',
  'research_capture_losses',
  'research_deletions',
  'research_derived_datasets',
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

describe('editorialRetention: no fixture depends on the day the suite runs (final review I-2)', () => {
  // A migration stamps its seeds with CURRENT_TIMESTAMP, which reads the OS clock, and no injected clock reaches it: a
  // suite run after a date would meet its own seeds as later records. pinSeeds dates every row already in a SCOPE
  // table at the plant time; every retention test calls it right after freshMigratedDb().
  const LATE = '2029-06-01 00:00:00';
  const LATE_MS = Date.UTC(2029, 5, 1);

  it('a database migrated after the date meets a later-records refusal until its seeds are pinned', () => {
    pinSeeds(db, { at: LATE, atMs: LATE_MS }); // as a migration run on 2029-06-01 stamps them
    expect(planStep(db, 'named', AT).refusals).toContainEqual(
      expect.objectContaining({ reason: 'later-records', table: 'registered_books' })
    );
    pinSeeds(db);
    expect(planStep(db, 'named', AT).refusals).toEqual([]);
  });

  it('pins every time of every SCOPE row to the plant time exactly, past the timestamp triggers', () => {
    plantAll(db, { at: LATE, atMs: LATE_MS, tag: 'L' });
    pinSeeds(db);
    const off = [];
    for (const [t, e] of Object.entries(SCOPE)) {
      for (const c of new Set([...e.times, ...e.person.map((p) => p.timeCol).filter(Boolean)])) {
        const want = /_ms$/.test(c) ? PLANT_AT_MS : PLANT_AT;
        const n = db
          .prepare(`SELECT COUNT(*) FROM "${t}" WHERE "${c}" IS NOT NULL AND "${c}" IS NOT ?`)
          .pluck()
          .get(want);
        if (n) off.push(`${t}.${c}`);
      }
    }
    expect(off).toEqual([]);
  });
});

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

  it('a text time with a UTC offset is never read as covered: the row is left and reported (final review M-2)', () => {
    const { rows } = plantAll(db);
    const id = insert(db, 'segment_discussions', {
      segment_edit_id: rows.segment_edits,
      comment: 'c',
      user_id: 'Offset Time',
      username: 'offset',
      created_at: '2028-12-31T23:30:00-02:00', // 2029-01-01T01:30Z, after the date, though its day reads 2028-12-31
    });
    const res = applyStep(db, 'named', AT);
    expect(rowOf('segment_discussions', id).user_id).toBe('Offset Time');
    expect(refusal(res, 'unreadable-time', 'segment_discussions')).toMatchObject({ rows: 1 });
  });

  it('an integer time no millisecond clock wrote (seconds, or a small number) is never read as covered (final review M-3)', () => {
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
    const secs = rej('secs', Math.floor(Date.UTC(2029, 5, 1) / 1000)); // a 2029 time in seconds
    const small = rej('small', 5); // the schema refuses 0 and negatives here (CHECK > 0)
    const res = applyStep(db, 'named', AT);
    expect([
      rowOf('suggestion_rejections', secs).rejected_by,
      rowOf('suggestion_rejections', small).rejected_by,
    ]).toEqual([7, 7]);
    expect(refusal(res, 'unreadable-time', 'suggestion_rejections')).toMatchObject({ rows: 2 });
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

// [USER] 2026-11-22 (the final review's I-1): a tool still writing after the date is continued use, so a person
// decides then (§0 answer 1). That holds for every tool's label, the c19 loader's included: its label is kept from
// the strip so the committed record stays as it is, and that keep-list must not also hide its later writes.
describe("editorialRetention: every tool's write after the date is continued use (final review I-1)", () => {
  it('a book registration by a tool label after the date raises the refusal (the ruling keeps this)', () => {
    insert(db, 'registered_books', {
      slug: 'gate-later',
      title_is: 'x',
      registered_by: 'gate',
      registered_at: LATER,
    });
    const res = planStep(db, 'named', AT);
    expect(refusal(res, 'later-records', 'registered_books')).toMatchObject({ rows: 1 });
  });

  it("a row by the c19 loader's label after the date raises the refusal too, and the label is still never stripped", () => {
    const base = { book: 'efnafraedi-2e', reason: 'because', source: 'test' };
    addExclusion(db, {
      ...base,
      english: 'Late',
      by: C19_LOAD_LABEL,
      at: '2029-01-05T10:00:00.000Z',
    });
    addExclusion(db, {
      ...base,
      english: 'Early',
      by: C19_LOAD_LABEL,
      at: '2026-11-18T12:00:00.000Z',
    });
    const res = applyStep(db, 'named', AT);
    expect(refusal(res, 'later-records', 'book_glossary_change')).toMatchObject({ rows: 1 });
    expect(refusal(res, 'later-records', 'book_glossary_exclusion')).toMatchObject({ rows: 1 });
    expect(db.prepare('SELECT by FROM book_glossary_change ORDER BY id').pluck().all()).toEqual([
      C19_LOAD_LABEL,
      C19_LOAD_LABEL,
    ]);
  });

  // [USER] 2026-11-22: a report from the public feedback form counts as the tools' writes do, and a later record is
  // any row with a time after the date, whether or not it names anyone (spec §4.4: "a record dated after a date").
  it('a public report with no name or email after the date raises the refusal', () => {
    insert(db, 'feedback', { type: 'bug', message: 'm', created_at: LATER });
    const res = planStep(db, 'named', AT);
    expect(refusal(res, 'later-records', 'feedback')).toMatchObject({ rows: 1 });
  });

  it('a row whose only later time is a tool update raises it too, and its covered name is still stripped', () => {
    insert(db, 'chapter_pipeline_status', {
      book_slug: 'b',
      chapter_num: 1,
      stage: 'extraction',
      status: 'complete',
      completed_by: 'Early Editor',
      completed_at: '2028-11-30 10:00:00',
      updated_at: LATER,
    });
    const res = applyStep(db, 'named', AT);
    expect(refusal(res, 'later-records', 'chapter_pipeline_status')).toMatchObject({ rows: 1 });
    const by = db
      .prepare("SELECT completed_by FROM chapter_pipeline_status WHERE book_slug = 'b'")
      .pluck()
      .get();
    expect(by).toMatch(/^fjarlægt-/);
  });
});

// ── Task 6: steps 2 and 3 (spec §4.4) ──

const AT2 = effectiveMs(UNNAMED_RECORDS); // 00:00 UTC on 1 Jan 2030
const AT3 = effectiveMs(CONSENT_RECORDS); // 00:00 UTC on 1 Jan 2031
const HEX = 'a'.repeat(64);
const blocking = (res) => res.refusals.filter((r) => r.blocking).map((r) => r.reason);
const recordRun = (kind, ms) =>
  db
    .prepare('INSERT INTO retention_runs (kind, done_at_ms, rows_changed) VALUES (?, ?, 0)')
    .run(kind, ms);

function servedVersion(seg = 's1') {
  return insert(db, 'served_text_versions', {
    book: 'b',
    chapter: 1,
    module_id: 'm1',
    segment_id: seg,
    occurrence: 0,
    en_sha256: HEX,
    is_sha256: HEX,
    layer: 'faithful',
    en_text: 'en',
    is_text: 'is',
  });
}
function opening(module, ms) {
  insert(db, 'module_openings', {
    book: 'b',
    chapter: 1,
    module_id: module,
    opened_at_ms: ms,
    inflight_count: 1,
  });
  insert(db, 'module_opening_inflight', {
    book: 'b',
    chapter: 1,
    module_id: module,
    segment_id: 's1',
    occurrence: 0,
  });
}
function editServed(versionId, createdAt) {
  return insert(db, 'segment_edits', {
    book: 'b',
    chapter: 1,
    module_id: 'm1',
    segment_id: `s-${versionId}-${createdAt}`,
    original_content: 'a',
    edited_content: 'b',
    status: 'approved',
    editor_id: 'fjarlægt-0',
    editor_username: 'fjarlægt-0',
    created_at: createdAt,
    served_version_id: versionId,
  });
}
const countOf = (t) => db.prepare(`SELECT COUNT(*) FROM "${t}"`).pluck().get();

describe('editorialRetention: step 2, unnamed', () => {
  it('nothing changes before its date takes effect', () => {
    recordRun('named', AT);
    editServed(servedVersion(), '2028-04-04 04:04:04');
    opening('m1', Date.UTC(2028, 3, 4));
    const before = snapshot(db);
    expect(applyStep(db, 'unnamed', AT2 - 1)).toMatchObject({ due: false, changed: 0 });
    expect(snapshot(db)).toEqual(before);
  });

  it('refuses before step 1 is recorded, and changes nothing', () => {
    servedVersion();
    const before = snapshot(db);
    const res = applyStep(db, 'unnamed', AT2);
    expect(blocking(res)).toEqual(['named-not-recorded']);
    expect(res.changed).toBe(0);
    expect(snapshot(db)).toEqual(before);
  });

  it('clears the served-version references, then deletes every served version and opening; inflight rows go by cascade', () => {
    recordRun('named', AT);
    const v1 = servedVersion('s1');
    const v2 = servedVersion('s2');
    const edit = editServed(v1, '2028-04-04 04:04:04');
    const acc = insert(db, 'segment_acceptances', {
      book: 'b',
      chapter: 1,
      module_id: 'm1',
      segment_id: 's2',
      accepted_content: 'x',
      accepted_by: 'fjarlægt-0',
      accepted_by_username: 'fjarlægt-0',
      status: 'active',
      accepted_at: '2028-04-05 05:05:05',
      served_version_id: v2,
    });
    opening('m1', Date.UTC(2028, 3, 4));
    // Control: the foreign key is live, so the references must be cleared before the delete.
    expect(() => db.prepare('DELETE FROM served_text_versions WHERE id = ?').run(v1)).toThrow(
      /FOREIGN KEY/
    );

    const res = applyStep(db, 'unnamed', AT2);
    expect(blocking(res)).toEqual([]);
    expect(
      db.prepare('SELECT served_version_id FROM segment_edits WHERE id = ?').pluck().get(edit)
    ).toBeNull();
    expect(
      db.prepare('SELECT served_version_id FROM segment_acceptances WHERE id = ?').pluck().get(acc)
    ).toBeNull();
    expect([
      countOf('served_text_versions'),
      countOf('module_openings'),
      countOf('module_opening_inflight'),
    ]).toEqual([0, 0, 0]);
    expect(res.changed).toBe(2 + 2 + 1 + 1); // two references cleared, two versions, one opening, its inflight row
  });

  it('refuses outright while a row dated after 2028 references a served version', () => {
    recordRun('named', AT);
    editServed(servedVersion(), '2029-03-01 10:00:00');
    const before = snapshot(db);
    const res = applyStep(db, 'unnamed', AT2);
    expect(blocking(res)).toEqual(['later-references']);
    expect(res.refusals.find((r) => r.reason === 'later-references')).toMatchObject({
      table: 'segment_edits',
      rows: 1,
    });
    expect(snapshot(db)).toEqual(before);
  });

  it('refuses outright while a unit was opened after 2028', () => {
    recordRun('named', AT);
    servedVersion();
    opening('m2', AT);
    const before = snapshot(db);
    const res = applyStep(db, 'unnamed', AT2);
    expect(blocking(res)).toEqual(['later-openings']);
    expect(snapshot(db)).toEqual(before);
  });

  it('refuses outright on an opening time it cannot read as on or before 2028 (seconds), and deletes nothing (final review M-3)', () => {
    recordRun('named', AT);
    servedVersion();
    opening('m2', Math.floor(Date.UTC(2029, 5, 1) / 1000)); // a 2029 opening in seconds
    const before = snapshot(db);
    const res = applyStep(db, 'unnamed', AT2);
    expect(blocking(res)).toEqual(['later-openings']);
    expect(snapshot(db)).toEqual(before);
  });

  it('a second unnamed changes nothing', () => {
    recordRun('named', AT);
    editServed(servedVersion(), '2028-04-04 04:04:04');
    opening('m1', Date.UTC(2028, 3, 4));
    applyStep(db, 'unnamed', AT2);
    const once = snapshot(db);
    expect(applyStep(db, 'unnamed', AT2).changed).toBe(0);
    expect(snapshot(db)).toEqual(once);
  });

  it('planStep predicts it and writes nothing', () => {
    recordRun('named', AT);
    editServed(servedVersion(), '2028-04-04 04:04:04');
    const before = snapshot(db);
    const plan = planStep(db, 'unnamed', AT2);
    expect(snapshot(db)).toEqual(before);
    const res = applyStep(db, 'unnamed', AT2);
    expect(Object.values(plan.counts).reduce((a, b) => a + b, 0)).toBe(res.changed);
  });
});

describe('editorialRetention: step 3, consent', () => {
  const consentRow = (givenMs, extra = {}) =>
    insert(db, 'research_consent', {
      user_id: 41,
      decision: 'consented',
      interval_id: 9,
      consent_text_version: 'v1',
      consent_text_sha256: HEX,
      given_at_ms: givenMs,
      ...extra,
    });
  const loss = (day) =>
    insert(db, 'research_capture_losses', {
      interval_id: 9,
      book: 'b',
      chapter: 1,
      module_id: 'm1',
      event_type: 'edit-save',
      loss_day: day,
      error_class: 'busy',
      client_action_id: `l-${day}`,
    });
  const retentionDeletion = (ms) =>
    db
      .prepare(
        "INSERT INTO research_deletions (kind, interval_id, done_at_ms, verified) VALUES ('retention', NULL, ?, 1)"
      )
      .run(ms);
  const withdrawalDeletion = (ms) =>
    db
      .prepare(
        "INSERT INTO research_deletions (kind, interval_id, done_at_ms, verified) VALUES ('withdrawal', 9, ?, 1)"
      )
      .run(ms);

  it('nothing changes before its date takes effect', () => {
    consentRow(Date.UTC(2027, 0, 5));
    retentionDeletion(effectiveMs('2029-12-31'));
    const before = snapshot(db);
    expect(applyStep(db, 'consent', AT3 - 1)).toMatchObject({ due: false, changed: 0 });
    expect(snapshot(db)).toEqual(before);
  });

  it('refuses before research-retention.js has recorded its deletion, and changes nothing', () => {
    consentRow(Date.UTC(2027, 0, 5));
    const before = snapshot(db);
    const res = applyStep(db, 'consent', AT3);
    expect(blocking(res)).toEqual(['research-retention-not-recorded']);
    expect(snapshot(db)).toEqual(before);
  });

  it('deletes the consent and loss records, keeps the deletion and dataset records, and research-retention.js stays not due', () => {
    consentRow(Date.UTC(2027, 0, 5), {
      withdrawn_at_ms: Date.UTC(2027, 5, 1),
      deletion_done_at_ms: Date.UTC(2027, 5, 2),
    });
    consentRow(Date.UTC(2027, 1, 6));
    loss('2027-03-03');
    withdrawalDeletion(Date.UTC(2027, 5, 2));
    retentionDeletion(effectiveMs('2029-12-31'));
    db.prepare(
      "INSERT INTO research_derived_datasets (path, sha256, created_day) VALUES ('/data/set.jsonl', ?, '2029-11-30')"
    ).run(HEX);

    const res = applyStep(db, 'consent', AT3);
    expect(blocking(res)).toEqual([]);
    expect(res.changed).toBe(3);
    expect([countOf('research_consent'), countOf('research_capture_losses')]).toEqual([0, 0]);
    expect([countOf('research_deletions'), countOf('research_derived_datasets')]).toEqual([2, 1]);

    // research-retention.js's isDue on an emptied research file (only the three tables its first arm reads): the
    // retention row kept here is what keeps it from becoming due again and writing a fresh row.
    const research = new Database(':memory:');
    try {
      research.exec(
        'CREATE TABLE editor_keys (x); CREATE TABLE research_events (x); CREATE TABLE research_event_items (x);'
      );
      const due = (sessionsDb) =>
        isResearchDue({
          research,
          sessions: sessionsDb,
          retentionDate: RESEARCH_RAW_ROWS,
          nowMs: AT3,
        });
      expect(due(db)).toBe(false);
      // Control: with the retention row gone, it would be due again.
      db.prepare("DELETE FROM research_deletions WHERE kind = 'retention'").run();
      expect(due(db)).toBe(true);
    } finally {
      research.close();
    }
  });

  it('refuses outright on a consent time it cannot read as on or before 2030 (seconds), and deletes nothing (final review M-3)', () => {
    consentRow(Math.floor(Date.UTC(2031, 0, 2) / 1000)); // a 2031 consent in seconds
    retentionDeletion(effectiveMs('2029-12-31'));
    const before = snapshot(db);
    const res = applyStep(db, 'consent', AT3);
    expect(blocking(res)).toEqual(['later-records']);
    expect(snapshot(db)).toEqual(before);
  });

  it('refuses outright while a consent or loss record is dated after 2030', () => {
    consentRow(Date.UTC(2027, 0, 5));
    loss('2031-01-01');
    retentionDeletion(effectiveMs('2029-12-31'));
    const before = snapshot(db);
    const res = applyStep(db, 'consent', AT3);
    expect(blocking(res)).toEqual(['later-records']);
    expect(res.refusals.find((r) => r.reason === 'later-records')).toMatchObject({
      table: 'research_capture_losses',
      rows: 1,
    });
    expect(snapshot(db)).toEqual(before);
  });

  it('a second consent changes nothing', () => {
    consentRow(Date.UTC(2027, 0, 5));
    retentionDeletion(effectiveMs('2029-12-31'));
    applyStep(db, 'consent', AT3);
    const once = snapshot(db);
    expect(applyStep(db, 'consent', AT3).changed).toBe(0);
    expect(snapshot(db)).toEqual(once);
  });
});
