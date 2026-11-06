// server/__tests__/closePendingEdits.test.js
//
// Plan 2026-10-10 item 1.6: the script that records [USER]'s rulings on chemistry's 38
// pending pre-clean-break edits (approve the 10 clean ones; supersede the 5 already present
// and the 23 made on an older MT). It runs on production, so every refusal is pinned, and
// each refusal must leave the database untouched.
//
// freshMigratedDb(): every real migration, no hand-copied DDL.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { closePendingEdits } = require('../scripts/close-pending-edits');

const BOOK = 'efnafraedi-2e';
const LEAD = 'lead@example.org';
const LEAD_ID = '00000000-0000-4000-8000-000000000001';
const held = () => ({ book: BOOK, reason: 'test hold' });

let db;
let dbPath;
let ids;
let input;
let inputSha256;
let rulings;

function addEdit(segment, original, edited) {
  return db
    .prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content,
         edited_content, status, editor_id, editor_username)
       VALUES (?, 3, 'm68700', ?, ?, ?, 'pending', 'ed-1', 'editor 1')`
    )
    .run(BOOK, segment, original, edited).lastInsertRowid;
}

/**
 * A row as the real freeze wrote it. experiments/terminology-consistency/freeze_pending_edits.py
 * strips leading and trailing whitespace from both texts before writing, so the frozen copy can
 * differ from the database by edge whitespace alone (row 138 on production: one trailing space).
 */
function frozenRow(id, cls) {
  const r = db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(id);
  return {
    id,
    class: cls,
    module: r.module_id,
    segment: r.segment_id,
    original: r.original_content.trim(),
    edited: r.edited_content.trim(),
  };
}

function freeze() {
  const text = JSON.stringify(input);
  inputSha256 = crypto.createHash('sha256').update(text).digest('hex');
  return text;
}

function run(overrides = {}) {
  return closePendingEdits(db, {
    book: BOOK,
    rulings,
    input,
    inputSha256,
    reviewer: LEAD,
    write: true,
    holdFor: held,
    ...overrides,
  });
}

const statusOf = (id) => db.prepare('SELECT status FROM segment_edits WHERE id = ?').get(id).status;

beforeEach(() => {
  ({ db, path: dbPath } = freshMigratedDb());
  db.prepare(
    `INSERT INTO users (provider_id, provider_username, display_name, email, role, last_login_at)
     VALUES (?, ?, 'Lead', ?, 'admin', CURRENT_TIMESTAMP)`
  ).run(LEAD_ID, LEAD, LEAD);
  ids = {
    clean: [
      addEdit('m68700:para:a', 'gamalt a', 'nýtt a'),
      addEdit('m68700:para:b', 'gamalt b', 'nýtt b'),
    ],
    present: [addEdit('m68700:para:c', 'gamalt c', 'nýtt c')],
    changed: [
      addEdit('m68700:para:d', 'eldra d', 'nýtt d'),
      addEdit('m68700:para:e', 'eldra e', 'nýtt e'),
    ],
  };
  ids.other = addEdit('m68700:para:z', 'annað', 'annað nýtt');
  input = {
    book: BOOK,
    rows: [
      ...ids.clean.map((id) => frozenRow(id, 'clean')),
      ...ids.present.map((id) => frozenRow(id, 'already-present')),
      ...ids.changed.map((id) => frozenRow(id, 'base-changed')),
    ],
  };
  freeze();
  rulings = {
    input: { sha256: inputSha256 },
    tally: { apply: 2, drop: 0 },
    answers: ids.clean.map((id) => ({
      id,
      choice: 'apply',
      note: '',
      savedAt: '2026-10-23T14:53:11.622Z',
    })),
    notAsked: {
      'already-present': { ids: ids.present, n: 1 },
      'base-changed': { ids: ids.changed, n: 2 },
    },
    total: 5,
  };
});

afterEach(() => {
  db.close();
});

describe('close-pending-edits: what a write does', () => {
  it('approves exactly the ruled clean rows', () => {
    run();
    const approved = db
      .prepare(`SELECT id FROM segment_edits WHERE status = 'approved' ORDER BY id`)
      .all()
      .map((r) => r.id);
    expect(approved).toEqual(ids.clean);
  });

  it('supersedes the rows already present in the September MT', () => {
    run();
    expect(ids.present.map(statusOf)).toEqual(['superseded']);
  });

  it('supersedes the rows made on an older MT', () => {
    run();
    expect(ids.changed.map(statusOf)).toEqual(['superseded', 'superseded']);
  });

  it("writes the reviewer's provider id and username, as the approve route does", () => {
    run();
    const r = db
      .prepare('SELECT reviewer_id, reviewer_username FROM segment_edits WHERE id = ?')
      .get(ids.clean[0]);
    expect(r).toEqual({ reviewer_id: LEAD_ID, reviewer_username: LEAD });
  });

  it('writes one segment_edit_approved activity row per approval, as the route does', () => {
    run();
    const n = db
      .prepare(`SELECT COUNT(*) AS n FROM activity_log WHERE type = 'segment_edit_approved'`)
      .get().n;
    expect(n).toBe(2);
  });

  it('applies nothing: no row gets applied_at', () => {
    run();
    const n = db
      .prepare('SELECT COUNT(*) AS n FROM segment_edits WHERE applied_at IS NOT NULL')
      .get().n;
    expect(n).toBe(0);
  });

  it('leaves a pending row outside the rulings alone', () => {
    run();
    expect(statusOf(ids.other)).toBe('pending');
  });
});

describe('close-pending-edits: a dry run', () => {
  it('writes nothing', () => {
    run({ write: false });
    const n = db
      .prepare(`SELECT COUNT(*) AS n FROM segment_edits WHERE status != 'pending'`)
      .get().n;
    expect(n).toBe(0);
  });

  it('reports the plan', () => {
    const report = run({ write: false });
    expect(report.plan.approve).toEqual(ids.clean);
  });
});

describe('close-pending-edits: refusals', () => {
  // Without the hold, an approved row is one click from an apply that writes the
  // module's whole base text over the September MT (register §C203).
  it('refuses without the apply hold', () => {
    expect(run({ holdFor: () => null }).ok).toBe(false);
  });

  it('writes nothing when it refuses', () => {
    run({ holdFor: () => null });
    const n = db
      .prepare(`SELECT COUNT(*) AS n FROM segment_edits WHERE status != 'pending'`)
      .get().n;
    expect(n).toBe(0);
  });

  it('refuses when a ruled row is no longer pending', () => {
    db.prepare(`UPDATE segment_edits SET status = 'discuss' WHERE id = ?`).run(ids.changed[1]);
    expect(run().ok).toBe(false);
  });

  it('refuses when a row changed since the frozen input', () => {
    db.prepare(`UPDATE segment_edits SET edited_content = 'breytt síðar' WHERE id = ?`).run(
      ids.clean[1]
    );
    expect(run().ok).toBe(false);
  });

  // Production's row 138: the database text ends in a space the freeze stripped. That is the
  // freeze's normalisation, not a change, so the row must not be refused (the case above is the
  // control: a real change still is).
  it('does not count edge whitespace the freeze stripped as a change', () => {
    for (const [col, field] of [
      ['edited_content', 'edited'],
      ['original_content', 'original'],
    ]) {
      const id = ids.changed[0];
      const row = input.rows.find((r) => r.id === id);
      db.prepare(`UPDATE segment_edits SET ${col} = ? WHERE id = ?`).run(` ${row[field]} \n`, id);
    }
    const report = run({ write: false });
    expect([report.ok, report.refused]).toEqual([true, []]);
  });

  it('still refuses whitespace INSIDE the text, which the freeze kept', () => {
    const id = ids.changed[0];
    const row = input.rows.find((r) => r.id === id);
    const inside = row.edited.replace(' ', '  ');
    expect(inside).not.toBe(row.edited); // the fixture text has a space to double
    db.prepare(`UPDATE segment_edits SET edited_content = ? WHERE id = ?`).run(inside, id);
    expect(run({ write: false }).refused).toEqual([`row ${id} changed since it was frozen`]);
  });

  it('refuses when another approved edit sits on a ruled segment', () => {
    db.prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content,
         edited_content, status, editor_id, editor_username)
       VALUES (?, 3, 'm68700', 'm68700:para:a', 'gamalt a', 'annað a', 'approved', 'ed-2', 'editor 2')`
    ).run(BOOK);
    expect(run().ok).toBe(false);
  });

  it('refuses when the input file is not the one the rulings name', () => {
    expect(run({ inputSha256: 'f'.repeat(64) }).ok).toBe(false);
  });

  it('refuses a reviewer who is not an active admin or head editor', () => {
    db.prepare(`UPDATE users SET role = 'editor' WHERE provider_username = ?`).run(LEAD);
    expect(run().ok).toBe(false);
  });

  it('refuses a ruling other than apply', () => {
    rulings.answers[0].choice = 'drop';
    expect(run().ok).toBe(false);
  });

  it('refuses an apply ruling on a row whose frozen class is not clean', () => {
    input.rows.find((r) => r.id === ids.clean[0]).class = 'base-changed';
    freeze();
    rulings.input.sha256 = inputSha256;
    expect(run().ok).toBe(false);
  });

  it('refuses when the rulings do not cover the frozen input', () => {
    rulings.notAsked['base-changed'].ids = ids.changed.slice(0, 1);
    expect(run().ok).toBe(false);
  });

  // G1.1 + G1.2 spec §5.6: this script logs no research event, so it must not run once a unit has opened.
  it('refuses once a unit of the book has opened, in a dry run as in a write, and writes nothing', () => {
    const open = db.prepare(
      `INSERT INTO module_openings (book, chapter, module_id, opened_at_ms, inflight_count)
       VALUES (?, 3, 'm68700', 1700000000000, 0)`
    );
    open.run('liffraedi-2e');
    // control: another book's opening does not count
    expect(run({ write: false })).toMatchObject({ ok: true, refused: [] });
    open.run(BOOK);
    const opened = [expect.stringMatching(/^efnafraedi-2e: 1 unit\(s\) have opened/)];
    expect(run({ write: false }).refused).toEqual(opened);
    const r = run();
    expect(r.ok).toBe(false);
    expect(r.refused).toEqual(opened);
    expect(db.prepare(`SELECT id FROM segment_edits WHERE status != 'pending'`).all()).toEqual([]);
  });

  it('a database without module_openings (before migration 054) counts as none opened', () => {
    db.exec('DROP TABLE module_opening_inflight; DROP TABLE module_openings');
    const r = run();
    expect(r.refused).toEqual([]);
    expect(ids.clean.map(statusOf)).toEqual(['approved', 'approved']); // the write went through
  });

  // Decision 29: the existence check is keyed on module_openings itself. With only the snapshot table gone, a
  // chemistry opening still refuses (a check for the other table would read this as none opened).
  it('looks for module_openings itself: with only module_opening_inflight gone, an opening still refuses', () => {
    db.prepare(
      `INSERT INTO module_openings (book, chapter, module_id, opened_at_ms, inflight_count)
       VALUES (?, 3, 'm68700', 1700000000000, 0)`
    ).run(BOOK);
    db.exec('DROP TABLE module_opening_inflight');
    const r = run();
    expect(r.ok).toBe(false);
    expect(r.refused).toEqual([expect.stringMatching(/^efnafraedi-2e: 1 unit\(s\) have opened/)]);
    expect(ids.clean.map(statusOf)).toEqual(['pending', 'pending']);
  });

  // Decision 29: only a MISSING table counts as none opened. Any other error from the read throws, as the script's
  // other reads do, so a module_openings it cannot read is never taken for an empty one.
  it('fails closed: a module_openings it cannot read throws, and nothing is written', () => {
    db.exec(
      'DROP TABLE module_opening_inflight; DROP TABLE module_openings; CREATE TABLE module_openings (x INTEGER)'
    );
    expect(() => run()).toThrow(/no such column: book/);
    expect(ids.clean.map(statusOf)).toEqual(['pending', 'pending']);
  });
});

// PR2 review U7: the opening guard is a read before the write, and the server is another process. A
// second connection to the same file plays the server; it opens a chemistry unit at a chosen moment.
describe('close-pending-edits: an opening recorded by another process while it runs', () => {
  const OPEN_SQL = `INSERT INTO module_openings (book, chapter, module_id, opened_at_ms, inflight_count)
                    VALUES (?, 3, 'm68700', 1700000000000, 0)`;
  const openings = () =>
    db.prepare('SELECT COUNT(*) AS n FROM module_openings WHERE book = ?').get(BOOK).n;
  const activityRows = () =>
    db.prepare(`SELECT COUNT(*) AS n FROM activity_log WHERE type = 'segment_edit_approved'`).get()
      .n;
  /** db, with `onGet(prop)` called before each property the script reads from it. */
  const watched = (onGet) =>
    new Proxy(db, {
      get(target, prop) {
        onGet(prop);
        const v = Reflect.get(target, prop);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  let server;
  beforeEach(() => {
    server = new Database(dbPath, { timeout: 0 }); // never waits: a refused write throws at once
  });
  afterEach(() => {
    server.close();
  });

  it('an opening that lands between the guard and the write refuses the write, and nothing is written', () => {
    // The script reaches for db.transaction after every check, the opening guard among them, and
    // before its first UPDATE: the server's opening commits there.
    let raced = false;
    const racing = watched((prop) => {
      if (prop === 'transaction' && !raced) {
        raced = true;
        server.prepare(OPEN_SQL).run(BOOK);
      }
    });
    expect(() => closePendingEdits(racing, { ...runArgs() })).toThrow(
      /efnafraedi-2e: a unit opened during the write/
    );
    expect(raced).toBe(true); // control: the opening was planted after the guard read none
    expect(openings()).toBe(1);
    expect(
      [...ids.clean, ...ids.present, ...ids.changed].map(statusOf).every((s) => s === 'pending')
    ).toBe(true);
    expect(activityRows()).toBe(0);
  });

  it('control: through the same watcher with no opening, the write goes through', () => {
    const r = closePendingEdits(
      watched(() => {}),
      runArgs()
    );
    expect(r).toMatchObject({ ok: true, wrote: { approved: 2, superseded: 3, activity: 2 } });
  });

  it('holds the write lock from its first statement: the server cannot open a unit mid-write (WAL, as production)', () => {
    db.pragma('journal_mode = WAL');
    // At the first approval's UPDATE, the server tries to record an opening.
    let attempt = null;
    const midWrite = new Proxy(db, {
      get(target, prop) {
        const v = Reflect.get(target, prop);
        if (prop !== 'prepare') return typeof v === 'function' ? v.bind(target) : v;
        return (sql) => {
          const stmt = target.prepare(sql);
          if (!/SET status = 'approved'/.test(sql)) return stmt;
          return {
            run: (...args) => {
              if (attempt === null) {
                try {
                  server.prepare(OPEN_SQL).run(BOOK);
                  attempt = 'committed';
                } catch (err) {
                  attempt = err.code;
                }
              }
              return stmt.run(...args);
            },
          };
        };
      },
    });
    const r = closePendingEdits(midWrite, runArgs());
    expect(attempt).toBe('SQLITE_BUSY');
    expect(r).toMatchObject({ ok: true, wrote: { approved: 2, superseded: 3, activity: 2 } });
    expect(openings()).toBe(0);
    // Control: once the write has committed, the same insert from the server goes through.
    server.prepare(OPEN_SQL).run(BOOK);
    expect(openings()).toBe(1);
  });
});

/** run()'s arguments, for a call that passes its own connection. */
function runArgs() {
  return {
    book: BOOK,
    rulings,
    input,
    inputSha256,
    reviewer: LEAD,
    write: true,
    holdFor: held,
  };
}
