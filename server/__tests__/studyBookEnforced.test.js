// server/__tests__/studyBookEnforced.test.js
//
// G1.13 (spec §6.2; proofs T3, T4, T5): a study book is always assignment-enforced, fails closed,
// refuses a chapter-less write, and its enforcement toggle cannot be switched off.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
const { requireBookAccess } = require('../middleware/requireRole');
const { plantAssignment } = require('./helpers/plantAssignment.cjs');

userService._setTestDb(db);

const CHEM = 'efnafraedi-2e';
const OTHER = 'liffraedi-2e';
let userId;
let server;
let base;

function setRow(book, value) {
  db.prepare('DELETE FROM book_settings WHERE book = ?').run(book);
  if (value !== null) {
    db.prepare('INSERT INTO book_settings (book, enforce_assignments) VALUES (?, ?)').run(
      book,
      value
    );
  }
}

beforeAll(() => {
  userId = Number(
    db
      .prepare(
        `INSERT INTO users (display_name, role, provider_id, provider_username) VALUES (?, 'editor', ?, ?)`
      )
      .run('Prufa Ritstjóri', 'u-prufa', 'prufa').lastInsertRowid
  );
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
  db.prepare('DELETE FROM user_chapter_assignments').run();
  db.prepare('DELETE FROM book_settings').run();
});

describe('T3: isAssignmentEnforced', () => {
  it.each([[null], [0], [1]])('chemistry is enforced with book_settings row %s', (v) => {
    setRow(CHEM, v);
    expect(userService.isAssignmentEnforced(CHEM)).toBe(true);
  });

  it('a non-study book follows its row', () => {
    setRow('testbook', 0);
    expect(userService.isAssignmentEnforced('testbook')).toBe(false);
    setRow('testbook', 1);
    expect(userService.isAssignmentEnforced('testbook')).toBe(true);
  });
});

describe('T4: hasChapterAccess fails closed for a study book', () => {
  it('no row for the chapter → false', () => {
    setRow(CHEM, 0);
    expect(userService.hasChapterAccess(userId, CHEM, 3)).toBe(false);
  });

  it('null user → false', () => {
    setRow(CHEM, 0);
    expect(userService.hasChapterAccess(null, CHEM, 3)).toBe(false);
  });

  it('an assigned chapter → true (control)', () => {
    plantAssignment(db, { userId, book: CHEM, chapter: 3 });
    expect(userService.hasChapterAccess(userId, CHEM, 3)).toBe(true);
  });

  // DDL is transactional in SQLite: the drop is rolled back, so later tests keep their schema.
  for (const table of ['user_chapter_assignments', 'users']) {
    it(`${table} table dropped → throws ASSIGNMENT_TABLE_UNAVAILABLE`, () => {
      setRow(CHEM, 0);
      db.exec('BEGIN');
      try {
        db.pragma('foreign_keys = OFF');
        db.exec(`DROP TABLE ${table}`);
        let code;
        try {
          userService.hasChapterAccess(userId, CHEM, 3);
        } catch (err) {
          code = err.code;
        }
        expect(code).toBe('ASSIGNMENT_TABLE_UNAVAILABLE');
      } finally {
        db.exec('ROLLBACK');
        db.pragma('foreign_keys = ON');
      }
    });
  }

  it.each([
    ['0', 0],
    ['-1', -1],
    [-1, -1],
  ])('chapter %j is checked, not skipped', (asked, planted) => {
    expect(userService.hasChapterAccess(userId, CHEM, asked)).toBe(false);
    plantAssignment(db, { userId, book: CHEM, chapter: planted });
    expect(userService.hasChapterAccess(userId, CHEM, asked)).toBe(true);
  });
});

describe('requireBookAccess, chapter-less path', () => {
  function run(book, params = {}, extra = {}) {
    const req = {
      user: { id: 'u-prufa', username: 'prufa', role: 'editor', books: [] },
      params: { book, ...params },
      ...extra,
    };
    const out = { nexted: false, status: null, body: null };
    const res = {
      status(s) {
        out.status = s;
        return this;
      },
      json(b) {
        out.body = b;
        return this;
      },
    };
    requireBookAccess()(req, res, () => {
      out.nexted = true;
    });
    return out;
  }

  it('an editor on chemistry with no chapter → 403 CHAPTER_UNKNOWN', () => {
    const out = run(CHEM);
    expect([out.nexted, out.status, out.body.error]).toEqual([false, 403, 'CHAPTER_UNKNOWN']);
  });

  it('an empty-string chapter is refused the same way', () => {
    expect(run(CHEM, { chapter: '' }).body?.error).toBe('CHAPTER_UNKNOWN');
  });

  it('chapter 0 is a chapter: the assignment decides (control)', () => {
    expect(run(CHEM, { chapter: '0' }).status).toBe(403);
    plantAssignment(db, { userId, book: CHEM, chapter: 0 });
    expect(run(CHEM, { chapter: '0' }).nexted).toBe(true);
  });

  it('a non-study book passes as before', () => {
    expect(run('testbook').nexted).toBe(true);
  });
});

function token(role) {
  return jwt.sign(
    { sub: `u-adm-${role}`, username: `adm-${role}`, name: 'adm', role, books: [] },
    process.env.JWT_SECRET,
    { issuer: 'namsbokasafn-pipeline', expiresIn: '10m' }
  );
}
async function call(method, pathname, body) {
  const res = await fetch(base + pathname, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token('admin')}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const stored = (book) =>
  db.prepare('SELECT enforce_assignments FROM book_settings WHERE book = ?').get(book);

describe('T5: the enforcement toggle', () => {
  it('refuses to turn chemistry off (409) and writes nothing', async () => {
    const r = await call('POST', `/api/admin/assignments/${CHEM}/enforcement`, { enabled: false });
    expect([r.status, r.body.error, stored(CHEM)]).toEqual([
      409,
      'STUDY_BOOK_ALWAYS_ENFORCED',
      undefined,
    ]);
  });

  it('still turns a non-study book off', async () => {
    setRow(OTHER, 1);
    const r = await call('POST', `/api/admin/assignments/${OTHER}/enforcement`, { enabled: false });
    expect([r.status, r.body.enforceAssignments, stored(OTHER).enforce_assignments]).toEqual([
      200,
      false,
      0,
    ]);
  });

  it('turning chemistry on is accepted', async () => {
    const r = await call('POST', `/api/admin/assignments/${CHEM}/enforcement`, { enabled: true });
    expect([r.status, r.body.enforceAssignments]).toEqual([200, true]);
  });

  it('GET assignments reports enforcementLocked for chemistry, not for another book', async () => {
    const a = await call('GET', `/api/admin/assignments/${CHEM}`);
    const b = await call('GET', `/api/admin/assignments/${OTHER}`);
    expect([a.status, a.body.enforcementLocked, b.status, b.body.enforcementLocked]).toEqual([
      200,
      true,
      200,
      false,
    ]);
  });
});
