// server/__tests__/propagationScope.test.js
//
// G1.13 (spec §6.3; proof T6): propagation checks each target chapter. `scopeOccurrences` splits
// targets by `mayWrite` and skips chapter 0 for everyone; `canWriteChapter` is the rule behind it.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');

const built = freshMigratedDb();
const db = built.db;
process.env.SESSIONS_DB_PATH = built.path;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const userService = require('../services/userService');
const { scopeOccurrences } = require('../services/propagationService');
const { plantAssignment } = require('./helpers/plantAssignment.cjs');

userService._setTestDb(db);

const CHEM = 'efnafraedi-2e';
const OTHER = 'liffraedi-2e';
const occ = (chapter) => ({ chapter, moduleId: `m${chapter}`, segmentId: 's' });

let dbId;

beforeAll(() => {
  dbId = Number(
    db
      .prepare(
        `INSERT INTO users (display_name, role, provider_id, provider_username) VALUES (?, 'editor', ?, ?)`
      )
      .run('Prufa Ritstjóri', 'u-skop', 'skop').lastInsertRowid
  );
});

afterAll(() => {
  rmSync(path.dirname(built.path), { recursive: true, force: true });
});

beforeEach(() => {
  db.prepare('DELETE FROM user_chapter_assignments').run();
});

describe('scopeOccurrences', () => {
  it('an editor holding ch2: only ch2 is in scope; ch3 and -1 not-your-chapter; ch0 chapter-not-editable', () => {
    const { inScope, skipped } = scopeOccurrences(
      [occ(2), occ(3), occ(0), occ(-1)],
      (c) => c === 2
    );
    expect(inScope.map((o) => o.chapter)).toEqual([2]);
    expect(skipped.map((s) => [s.chapter ?? null, s.reason])).toEqual([
      [3, 'not-your-chapter'],
      [0, 'chapter-not-editable'],
      [-1, 'not-your-chapter'],
    ]);
  });

  it('the head editor reaches 2, 3 and -1, and ch0 is still skipped', () => {
    const { inScope, skipped } = scopeOccurrences([occ(2), occ(3), occ(0), occ(-1)], () => true);
    expect(inScope.map((o) => o.chapter)).toEqual([2, 3, -1]);
    expect(skipped).toEqual([
      { moduleId: 'm0', segmentId: 's', chapter: 0, reason: 'chapter-not-editable' },
    ]);
  });

  it('ch0 is skipped without consulting mayWrite', () => {
    const asked = [];
    scopeOccurrences([occ(0)], (c) => {
      asked.push(c);
      return true;
    });
    expect(asked).toEqual([]);
  });

  it('inScope keeps the input objects themselves', () => {
    const o = occ(2);
    expect(scopeOccurrences([o], () => true).inScope[0]).toBe(o);
  });
});

describe('canWriteChapter', () => {
  const user = (over) => ({ id: 'u-skop', role: 'editor', books: [], ...over });

  it('an admin may write any chapter', () => {
    expect(
      userService.canWriteChapter({ user: user({ role: 'admin' }), book: CHEM, chapter: 5 })
    ).toBe(true);
  });

  it('the head editor of the book may; the head editor of another book may not', () => {
    const head = user({ role: 'head-editor', books: [CHEM] });
    expect(userService.canWriteChapter({ user: head, book: CHEM, chapter: 5 })).toBe(true);
    // OTHER is not a study book, so a user with no rows there is the legacy fail-open case; one row
    // elsewhere in that book makes the other chapters closed, which isolates the head-editor rule.
    plantAssignment(db, { userId: dbId, book: OTHER, chapter: 9 });
    expect(userService.canWriteChapter({ user: head, book: OTHER, chapter: 5 })).toBe(false);
  });

  it('an editor with a row for the chapter may, and without one may not (chemistry is enforced)', () => {
    plantAssignment(db, { userId: dbId, book: CHEM, chapter: 2 });
    expect(userService.canWriteChapter({ user: user(), book: CHEM, chapter: 2 })).toBe(true);
    expect(userService.canWriteChapter({ user: user(), book: CHEM, chapter: 3 })).toBe(false);
  });

  it('a token with no users row may not', () => {
    expect(
      userService.canWriteChapter({ user: user({ id: 'u-enginn' }), book: CHEM, chapter: 2 })
    ).toBe(false);
  });

  it('chapter 0 with a row at 0 is checked, not skipped by truthiness', () => {
    plantAssignment(db, { userId: dbId, book: CHEM, chapter: 0 });
    expect(userService.canWriteChapter({ user: user(), book: CHEM, chapter: 0 })).toBe(true);
  });

  it('chapter -1 (appendices) is checked as a chapter', () => {
    plantAssignment(db, { userId: dbId, book: CHEM, chapter: 2 });
    expect(userService.canWriteChapter({ user: user(), book: CHEM, chapter: -1 })).toBe(false);
    plantAssignment(db, { userId: dbId, book: CHEM, chapter: -1 });
    expect(userService.canWriteChapter({ user: user(), book: CHEM, chapter: -1 })).toBe(true);
  });
});
