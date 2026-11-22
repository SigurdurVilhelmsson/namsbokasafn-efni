// server/__tests__/editorScopeOpenBook.test.js
//
// G1.13 (spec §6.1): the closed-book guard lets the open book through, on every guarded family the
// other route tests do not already drive in that direction: the pipeline-status lock and unlock,
// publication, the localization editor's writes, acceptance revoke, review complete, and the admin
// chapter-assignment POST and DELETE. A guard that read the wrong field on one of them would refuse
// chemistry's head editor (or the row's owner) with BOOK_CLOSED, and nothing else would notice.
//
// Each chemistry case asserts only that the answer is not BOOK_CLOSED. Its control sends the same
// request to the closed book and expects BOOK_CLOSED, which shows that the request reaches the guard
// rather than being refused before it.
//
// SAFETY: every request is answered by a later layer before it can touch the books tree: chapter
// 9999 or an invalid module id, the pipeline hold (G1.14), an acceptance that is no longer active,
// or a review with a pending edit (so review complete records changes_requested and never applies).
// The database is a fully migrated temp file.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config are read at module load.
const freshMigratedDb = require('./helpers/freshMigratedDb');
const seeded = freshMigratedDb();
process.env.SESSIONS_DB_PATH = seeded.path;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const express = require('express');
const jwt = require('jsonwebtoken');

const CHEM = 'efnafraedi-2e';
const LIF = 'liffraedi-2e';

// Invented personas. None has a users row, so each is decided from its token.
const HE = {
  [CHEM]: { username: 'he-efna', role: 'head-editor', books: [CHEM] },
  [LIF]: { username: 'he-lif', role: 'head-editor', books: [LIF] },
};
const OWNER = { username: 'ed-eigandi', role: 'editor', books: [] };

let server;
let base;
const acceptanceOf = {};
const reviewOf = {};

function mintToken(user) {
  return jwt.sign(
    {
      sub: `u-${user.username}`,
      username: user.username,
      name: user.username,
      role: user.role,
      books: user.books,
    },
    process.env.JWT_SECRET,
    { issuer: 'namsbokasafn-pipeline', expiresIn: '10m' }
  );
}

async function send(method, pathname, user, body) {
  const res = await fetch(base + pathname, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${mintToken(user)}` },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

beforeAll(() => {
  const db = seeded.db;
  for (const book of [CHEM, LIF]) {
    // Already superseded, so revoke answers 400 'Acceptance is not active' once the guard has passed.
    acceptanceOf[book] = Number(
      db
        .prepare(
          `INSERT INTO segment_acceptances (book, chapter, module_id, segment_id, accepted_content,
             accepted_by, accepted_by_username, status) VALUES (?, 1, 'm68664', 'm68664:para:a',
             'IS a', ?, ?, 'superseded')`
        )
        .run(book, `u-${OWNER.username}`, OWNER.username).lastInsertRowid
    );
    // One pending edit stamped to the review: complete records changes_requested, never applies.
    reviewOf[book] = Number(
      db
        .prepare(
          `INSERT INTO module_reviews (book, chapter, module_id, submitted_by, submitted_by_username)
           VALUES (?, 1, 'm68664', 'u-onnur', 'onnur')`
        )
        .run(book).lastInsertRowid
    );
    db.prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content,
         edited_content, editor_id, editor_username, status, review_id)
       VALUES (?, 1, 'm68664', 'm68664:para:a', 'a', 'b', 'u-onnur', 'onnur', 'pending', ?)`
    ).run(book, reviewOf[book]);
  }

  const app = express();
  app.use(express.json());
  app.use('/api/pipeline-status', require('../routes/pipeline-status'));
  app.use('/api/publication', require('../routes/publication'));
  app.use('/api/localization-editor', require('../routes/localization-editor'));
  app.use('/api/segment-editor', require('../routes/segment-editor'));
  app.use('/api/admin', require('../routes/admin'));
  app.use(require('../middleware/errorHandler').errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server?.close();
  seeded.db.close();
});

// [family, (book) => [method, path, caller, body]]. The order matters only for the lock: the
// unlock follows it, as an editor's would.
const FAMILIES = [
  ['pipeline-status lock', (b) => ['POST', `/api/pipeline-status/${b}/1/lock`, HE[b]]],
  ['pipeline-status unlock', (b) => ['DELETE', `/api/pipeline-status/${b}/1/lock`, HE[b]]],
  ['publication', (b) => ['POST', `/api/publication/${b}/9999/mt-preview`, HE[b]]],
  [
    'localization-editor save',
    (b) => ['POST', `/api/localization-editor/${b}/1/ogilt/save`, HE[b], { segmentId: 'x' }],
  ],
  [
    'acceptance revoke (the row’s owner)',
    (b) => ['POST', `/api/segment-editor/acceptance/${acceptanceOf[b]}/revoke`, OWNER],
  ],
  [
    'review complete',
    (b) => ['POST', `/api/segment-editor/reviews/${reviewOf[b]}/complete`, HE[b]],
  ],
  [
    'admin assignment POST',
    (b) => ['POST', `/api/admin/assignments/${b}/9999`, HE[b], { userId: 1 }],
  ],
  ['admin assignment DELETE', (b) => ['DELETE', `/api/admin/assignments/${b}/9999`, HE[b]]],
];

describe('the open book passes the closed-book guard on every guarded family (spec §6.1)', () => {
  for (const [family, request] of FAMILIES) {
    it(`${family}: chemistry is not refused with BOOK_CLOSED`, async () => {
      const r = await send(...request(CHEM));
      expect(r.body).toEqual(expect.any(Object)); // a JSON answer from the route, not a missing one
      expect(r.body.error).not.toBe('BOOK_CLOSED');
    });

    it(`${family}: control, the same request on the closed book is refused with BOOK_CLOSED`, async () => {
      const r = await send(...request(LIF));
      expect([r.status, r.body?.error]).toEqual([403, 'BOOK_CLOSED']);
    });
  }
});
