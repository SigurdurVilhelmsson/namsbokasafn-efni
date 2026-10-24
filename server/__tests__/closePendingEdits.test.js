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
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { closePendingEdits } = require('../scripts/close-pending-edits');

const BOOK = 'efnafraedi-2e';
const LEAD = 'lead@example.org';
const LEAD_ID = '00000000-0000-4000-8000-000000000001';
const held = () => ({ book: BOOK, reason: 'test hold' });

let db;
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

function frozenRow(id, cls) {
  const r = db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(id);
  return {
    id,
    class: cls,
    module: r.module_id,
    segment: r.segment_id,
    original: r.original_content,
    edited: r.edited_content,
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
  ({ db } = freshMigratedDb());
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
});
