// server/__tests__/assignmentGate.test.js
//
// G1.13 (spec §6.5, §6.6; proof T7): every path that creates a user_chapter_assignments row asks the
// assign gate first, and a refusal writes no row. In a study book an assignment row opens research
// units, so the gate is what keeps the study's consent basis: a decision on record (either one), a
// licence clause, and the book served from the Fable layer.
//
// Each refusal case starts from a fully assignable state and removes one condition, so the reason
// it asserts is the one that condition produces, not one masked by the order.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');

// The schema comes first, and its file becomes the server's DB, so the real routers and the
// service read one database. Env BEFORE any server require.
const built = freshMigratedDb();
const db = built.db;
process.env.SESSIONS_DB_PATH = built.path;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const express = require('express');
const jwt = require('jsonwebtoken');
const userService = require('../services/userService');
const { assignmentRefusal, REFUSAL_MESSAGES } = require('../services/assignmentGate');
const servedLayer = require('../lib/servedLayer');
const { plantAssignment, plantAssignable } = require('./helpers/plantAssignment.cjs');

userService._setTestDb(db);

const CHEM = 'efnafraedi-2e';
const CLOSED = 'liffraedi-2e';
const ids = {};
let server;
let base;

function addUser(key, role) {
  ids[key] = Number(
    db
      .prepare(
        `INSERT INTO users (display_name, role, provider_id, provider_username, is_active)
         VALUES (?, ?, ?, ?, 1)`
      )
      .run(`Prufa ${key}`, role, `p-gate-${key}`, `gate-${key}`).lastInsertRowid
  );
}

beforeAll(() => {
  addUser('holder', 'editor');
  addUser('editor', 'editor');
  addUser('admin', 'admin');
  addUser('headChem', 'head-editor');
  addUser('headOther', 'head-editor');
  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('../routes/admin'));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server?.close();
  rmSync(path.dirname(built.path), { recursive: true, force: true });
});

beforeEach(() => {
  for (const t of [
    'user_chapter_assignments',
    'research_consent',
    'editor_licence_clauses',
    'book_switch_events',
    'user_book_access',
  ]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
});

function token() {
  return jwt.sign(
    { sub: 'u-gate-admin', username: 'gate-admin', name: 'adm', role: 'admin', books: [] },
    process.env.JWT_SECRET,
    { issuer: 'namsbokasafn-pipeline', expiresIn: '10m' }
  );
}
async function call(method, pathname, body) {
  const res = await fetch(base + pathname, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** The user ids that hold a chapter, sorted. */
const holders = (book, chapter) =>
  db
    .prepare('SELECT user_id FROM user_chapter_assignments WHERE book_slug = ? AND chapter = ?')
    .all(book, chapter)
    .map((r) => r.user_id)
    .sort((a, b) => a - b);
const rowsOf = (userId) =>
  db
    .prepare('SELECT book_slug, chapter FROM user_chapter_assignments WHERE user_id = ?')
    .all(userId);
const viewOff = (book) =>
  db
    .prepare(
      `INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms)
       VALUES (?, 'suggestion-view', 0, ?)`
    )
    .run(book, Date.now());
const headOf = (userId, book) =>
  db
    .prepare(
      `INSERT INTO user_book_access (user_id, book_slug, role_for_book) VALUES (?, ?, 'head-editor')`
    )
    .run(userId, book);

// Each case: the user, book and chapter, set up from a fully assignable state minus one condition.
const CASES = {
  'book-closed': () => {
    plantAssignable(db, { userId: ids.editor, book: CHEM });
    plantAssignable(db, { userId: ids.editor, book: CLOSED });
    return { userId: ids.editor, book: CLOSED, chapter: 3 };
  },
  'chapter-not-editable': () => {
    plantAssignable(db, { userId: ids.editor, book: CHEM });
    return { userId: ids.editor, book: CHEM, chapter: 0 };
  },
  'bypass-role': () => {
    plantAssignable(db, { userId: ids.admin, book: CHEM });
    return { userId: ids.admin, book: CHEM, chapter: 3 };
  },
  'no-consent-decision': () => {
    plantAssignable(db, { userId: ids.editor, book: CHEM });
    db.prepare('DELETE FROM research_consent WHERE user_id = ?').run(ids.editor);
    return { userId: ids.editor, book: CHEM, chapter: 3 };
  },
  'no-licence-clause': () => {
    plantAssignable(db, { userId: ids.editor, book: CHEM });
    db.prepare('DELETE FROM editor_licence_clauses WHERE user_id = ?').run(ids.editor);
    return { userId: ids.editor, book: CHEM, chapter: 3 };
  },
  'served-layer-not-fable': () => {
    plantAssignable(db, { userId: ids.editor, book: CHEM });
    // The setting names chemistry's layer 'fable'; stub it back to the pure MT layer.
    vi.spyOn(servedLayer, 'servedLayerFor').mockReturnValue('mt-output');
    return { userId: ids.editor, book: CHEM, chapter: 3 };
  },
};

afterEach(() => vi.restoreAllMocks());

describe('T7: the assign gate refuses, and no path writes a row', () => {
  it.each([
    'book-closed',
    'chapter-not-editable',
    'bypass-role',
    'no-consent-decision',
    'no-licence-clause',
    'served-layer-not-fable',
  ])(
    'refuses with %s, through both routes and setChapterAssignee, writing no row',
    async (reason) => {
      const { userId, book, chapter } = CASES[reason]();
      // The chapter's present holder must still hold it after every refused attempt.
      plantAssignment(db, { userId: ids.holder, book, chapter });
      const refused = { error: 'ASSIGNMENT_REFUSED', reason, message: REFUSAL_MESSAGES[reason] };

      expect(assignmentRefusal(db, { userId, book, chapter })).toBe(reason);
      expect(userService.assignmentRefusalFor(userId, book, chapter)).toBe(reason);

      const one = await call('POST', `/api/admin/assignments/${book}/${chapter}`, { userId });
      expect([one.status, one.body]).toEqual([409, refused]);

      const many = await call('POST', `/api/admin/users/${userId}/chapters`, {
        bookSlug: book,
        chapters: [chapter],
      });
      expect([many.status, many.body]).toEqual([409, refused]);

      let thrown;
      try {
        userService.setChapterAssignee(userId, book, chapter, 'test');
      } catch (err) {
        thrown = err;
      }
      expect([thrown?.code, thrown?.reason]).toEqual(['ASSIGNMENT_REFUSED', reason]);

      let thrownAdd;
      try {
        userService.assignChapter(userId, book, chapter, 'test');
      } catch (err) {
        thrownAdd = err;
      }
      expect([thrownAdd?.code, thrownAdd?.reason]).toEqual(['ASSIGNMENT_REFUSED', reason]);

      expect(rowsOf(userId)).toEqual([]);
      expect(holders(book, chapter)).toEqual([ids.holder]);
    }
  );

  it('every reason has an Icelandic message', () => {
    expect(Object.keys(REFUSAL_MESSAGES).sort()).toEqual(Object.keys(CASES).sort());
    for (const m of Object.values(REFUSAL_MESSAGES)) expect(m.length).toBeGreaterThan(10);
    expect(Object.isFrozen(REFUSAL_MESSAGES)).toBe(true);
  });
});

describe('T7: what the gate lets through', () => {
  it('a study book served from the Fable layer is assignable with the suggestion view off', () => {
    plantAssignable(db, { userId: ids.editor, book: CHEM });
    viewOff(CHEM);
    expect(servedLayer.servedLayerFor(CHEM)).toBe('fable');
    expect(assignmentRefusal(db, { userId: ids.editor, book: CHEM, chapter: 3 })).toBeNull();
  });

  it('the superseded suggestion-view reason is gone from the messages', () => {
    expect(Object.keys(REFUSAL_MESSAGES)).not.toContain('suggestion-view-off');
  });

  it('a declined consent row plus a licence row, view on → assigned', async () => {
    plantAssignable(db, { userId: ids.editor, book: CHEM });
    // control: the decision on record is a decline, and it counts (spec §6.5, from §5.14)
    expect(
      db.prepare('SELECT decision FROM research_consent WHERE user_id = ?').all(ids.editor)
    ).toEqual([{ decision: 'declined' }]);
    expect(assignmentRefusal(db, { userId: ids.editor, book: CHEM, chapter: 3 })).toBeNull();

    const one = await call('POST', `/api/admin/assignments/${CHEM}/3`, { userId: ids.editor });
    expect(one.status).toBe(200);
    const many = await call('POST', `/api/admin/users/${ids.editor}/chapters`, {
      bookSlug: CHEM,
      chapters: [4, 5],
    });
    expect(many.status).toBe(200);
    userService.setChapterAssignee(ids.editor, CHEM, 6, 'test');
    userService.assignChapter(ids.editor, CHEM, 7, 'test');
    // Appendices are chapter -1 and assignable like any chapter (only 0 is refused).
    userService.setChapterAssignee(ids.editor, CHEM, -1, 'test');
    expect(
      rowsOf(ids.editor)
        .map((r) => r.chapter)
        .sort((a, b) => a - b)
    ).toEqual([-1, 3, 4, 5, 6, 7]);
  });

  it('a head editor of another book is not bypass-role in chemistry', async () => {
    headOf(ids.headOther, CLOSED);
    plantAssignable(db, { userId: ids.headOther, book: CHEM });
    expect(assignmentRefusal(db, { userId: ids.headOther, book: CHEM, chapter: 3 })).toBeNull();
    const r = await call('POST', `/api/admin/assignments/${CHEM}/3`, { userId: ids.headOther });
    expect(r.status).toBe(200);
    expect(holders(CHEM, 3)).toEqual([ids.headOther]);
    // control: the same account, made head editor of chemistry, is bypass-role
    headOf(ids.headOther, CHEM);
    expect(assignmentRefusal(db, { userId: ids.headOther, book: CHEM, chapter: 4 })).toBe(
      'bypass-role'
    );
  });

  it("a head editor of this book is bypass-role, but a book-access head-editor row on an editor's account is not", () => {
    headOf(ids.headChem, CHEM);
    plantAssignable(db, { userId: ids.headChem, book: CHEM });
    expect(assignmentRefusal(db, { userId: ids.headChem, book: CHEM, chapter: 3 })).toBe(
      'bypass-role'
    );
    // The token's rule: a head editor is users.role head-editor AND a head-editor row for the book.
    headOf(ids.editor, CHEM);
    plantAssignable(db, { userId: ids.editor, book: CHEM });
    expect(assignmentRefusal(db, { userId: ids.editor, book: CHEM, chapter: 3 })).toBeNull();
  });

  it('chapter "0" through POST /api/admin/assignments/efnafraedi-2e/0 → 409 chapter-not-editable', async () => {
    plantAssignable(db, { userId: ids.editor, book: CHEM });
    const r = await call('POST', `/api/admin/assignments/${CHEM}/0`, { userId: ids.editor });
    expect([r.status, r.body.error, r.body.reason]).toEqual([
      409,
      'ASSIGNMENT_REFUSED',
      'chapter-not-editable',
    ]);
    expect(holders(CHEM, 0)).toEqual([]);
    // control: the same editor takes chapter 1
    const ok = await call('POST', `/api/admin/assignments/${CHEM}/1`, { userId: ids.editor });
    expect(ok.status).toBe(200);
    expect(holders(CHEM, 1)).toEqual([ids.editor]);
  });

  it('the chapter is not checked when the page lists editors (no chapter given)', () => {
    plantAssignable(db, { userId: ids.editor, book: CHEM });
    expect(
      assignmentRefusal(db, { userId: ids.editor, book: CHEM, chapter: undefined })
    ).toBeNull();
    expect(userService.assignmentRefusalFor(ids.editor, CHEM)).toBeNull();
  });
});

describe('T7: the multi-chapter route checks every chapter before it writes', () => {
  it('multi-chapter assign refused writes nothing', async () => {
    plantAssignable(db, { userId: ids.editor, book: CHEM });
    db.prepare('DELETE FROM editor_licence_clauses WHERE user_id = ?').run(ids.editor);
    const r = await call('POST', `/api/admin/users/${ids.editor}/chapters`, {
      bookSlug: CHEM,
      chapters: [3, 4],
    });
    expect([r.status, r.body.reason]).toEqual([409, 'no-licence-clause']);
    expect(holders(CHEM, 3)).toEqual([]);
    expect(holders(CHEM, 4)).toEqual([]);
  });

  it('a refusal on a later chapter leaves the earlier ones unwritten too', async () => {
    plantAssignable(db, { userId: ids.editor, book: CHEM });
    plantAssignment(db, { userId: ids.holder, book: CHEM, chapter: 3 });
    const r = await call('POST', `/api/admin/users/${ids.editor}/chapters`, {
      bookSlug: CHEM,
      chapters: [3, 0],
    });
    expect([r.status, r.body.reason]).toEqual([409, 'chapter-not-editable']);
    expect(holders(CHEM, 3)).toEqual([ids.holder]);
    expect(rowsOf(ids.editor)).toEqual([]);
  });
});

describe('T7: removing is not gated', () => {
  it('removing an assignment is not gated', async () => {
    // An editor with no consent decision, no licence clause, and the view off: every condition fails.
    viewOff(CHEM);
    plantAssignment(db, { userId: ids.editor, book: CHEM, chapter: 5 });
    plantAssignment(db, { userId: ids.editor, book: CHEM, chapter: 6 });
    plantAssignment(db, { userId: ids.editor, book: CHEM, chapter: 7 });
    expect(userService.assignmentRefusalFor(ids.editor, CHEM, 5)).toBe('no-consent-decision');

    const a = await call('DELETE', `/api/admin/assignments/${CHEM}/5`);
    expect([a.status, a.body.removed]).toEqual([200, true]);
    const b = await call('DELETE', `/api/admin/users/${ids.editor}/chapters/${CHEM}/6`);
    expect(b.status).toBe(200);
    userService.removeChapterAssignment(ids.editor, CHEM, 7);
    expect(rowsOf(ids.editor)).toEqual([]);
  });
});

describe('T7: the assignments page lists who can be assigned', () => {
  it('GET assignments lists each editor with refusal and licenceSignedOn', async () => {
    plantAssignable(db, { userId: ids.editor, book: CHEM });
    plantAssignable(db, { userId: ids.holder, book: CHEM });
    db.prepare('DELETE FROM editor_licence_clauses WHERE user_id = ?').run(ids.holder);
    const r = await call('GET', `/api/admin/assignments/${CHEM}`);
    expect(r.status).toBe(200);
    const byId = Object.fromEntries(r.body.editors.map((e) => [e.id, e]));
    expect([byId[ids.editor].refusal, byId[ids.editor].licenceSignedOn]).toEqual([
      null,
      '2026-01-15',
    ]);
    expect([byId[ids.holder].refusal, byId[ids.holder].licenceSignedOn]).toEqual([
      'no-licence-clause',
      null,
    ]);
    expect(byId[ids.admin].refusal).toBe('bypass-role');
    expect(r.body.refusalMessages).toEqual(REFUSAL_MESSAGES);

    // A closed book: everyone is book-closed.
    const closed = await call('GET', `/api/admin/assignments/${CLOSED}`);
    expect(closed.status).toBe(200);
    expect(closed.body.editors.length).toBeGreaterThan(0);
    expect(new Set(closed.body.editors.map((e) => e.refusal))).toEqual(new Set(['book-closed']));
  });
});
