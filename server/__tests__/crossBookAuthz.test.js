import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'authz-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'authz-test.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const express = require('express');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');

// Personas — role strings match server/e2e/helpers/auth.js; books[] holds slugs.
const HE_A = { username: 'he-a', role: 'head-editor', books: ['efnafraedi-2e'] };
const HE_B = { username: 'he-b', role: 'head-editor', books: ['liffraedi-2e'] };
const ADMIN = { username: 'adm', role: 'admin', books: [] };
const EDITOR = { username: 'ed', role: 'editor', books: [] };

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

let server;
let base;

beforeAll(() => {
  // Minimal subset of migration 003's tables — just what getSection's JOIN reads,
  // plus the columns that section head-editor actions (approve-review, assign-reviewer,
  // assign-localizer, submit-review, status elevated branch) actually write via
  // bookRegistration.updateSectionStatus / updateChapterStatus. Types/defaults copied
  // verbatim from 003-book-catalogue.js. `users` + `user_chapter_assignments` mirror
  // migrations 006/010 (minimal columns only — see B1-F6).
  const db = new Database(process.env.SESSIONS_DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS registered_books (id INTEGER PRIMARY KEY, slug TEXT, title_is TEXT);
    CREATE TABLE IF NOT EXISTS book_chapters (
      id INTEGER PRIMARY KEY, title_en TEXT, title_is TEXT, status TEXT DEFAULT 'not_started'
    );
    CREATE TABLE IF NOT EXISTS book_sections (
      id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL, chapter_id INTEGER NOT NULL,
      chapter_num INTEGER NOT NULL, section_num TEXT NOT NULL, module_id TEXT,
      title_en TEXT, title_is TEXT, status TEXT DEFAULT 'not_started',
      linguistic_reviewer TEXT, linguistic_reviewer_name TEXT,
      linguistic_assigned_at DATETIME, linguistic_submitted_at DATETIME,
      linguistic_approved_at DATETIME, linguistic_approved_by TEXT, linguistic_approved_by_name TEXT,
      localizer TEXT, localizer_name TEXT, localization_assigned_at DATETIME
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, display_name TEXT,
      role TEXT DEFAULT 'editor', is_active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS user_chapter_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, book_slug TEXT NOT NULL,
      chapter INTEGER NOT NULL, assigned_by TEXT, assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, book_slug, chapter)
    );
  `);
  db.prepare(
    `INSERT INTO registered_books (id, slug, title_is) VALUES (1, 'liffraedi-2e', 'Líffræði')`
  ).run();
  // G3 (resolver discrimination beyond /inject): a second, HE_A-owned book so a section
  // resolver stuck on a hardcoded 'liffraedi-2e' constant can be told apart from one that
  // actually reads bs.book_id → registered_books.slug.
  db.prepare(
    `INSERT INTO registered_books (id, slug, title_is) VALUES (2, 'efnafraedi-2e', 'Efnafræði')`
  ).run();
  db.prepare(
    `INSERT INTO book_chapters (id, title_en, title_is) VALUES (1, 'Chapter 1', 'Kafli 1')`
  ).run();
  // One user row so the admin chapter-assignment routes (Task 6 / B1-F6) can reach a
  // genuine 200 instead of fail-open/500ing on a missing `users` table.
  db.prepare(`INSERT INTO users (id, display_name, role) VALUES (1, 'Editor One', 'editor')`).run();

  // One section row per action so cross-book RED-phase mutations can't interfere across tests.
  const ins = db.prepare(
    `INSERT INTO book_sections (id, book_id, chapter_id, chapter_num, section_num, status) VALUES (?, ?, 1, 1, ?, ?)`
  );
  ins.run(42, 1, '1.1', 'review_submitted'); // approve-review target
  ins.run(43, 1, '1.2', 'not_started'); // assign-reviewer target
  ins.run(44, 1, '1.3', 'not_started'); // assign-localizer target
  ins.run(45, 1, '1.4', 'review_submitted'); // request-changes target
  ins.run(46, 1, '1.5', 'review_submitted'); // status-elevated target

  // G3: efnafraedi-2e-owned (book_id=2) section — proves the approve-review resolver
  // reads bs.bookSlug rather than a constant stuck on liffraedi-2e.
  ins.run(47, 2, '1.6', 'review_submitted');

  // G4: a FRESH row for the status route's admin-bypass case. Reusing section 46 (already
  // transitioned to review_approved by the "owning head-editor allowed" test below) would
  // hit the transition-validity 400 *before* the hand-rolled elevated-permission branch is
  // ever reached — a regression dropping the admin bypass there would stay green. This row
  // must stay untouched by any other test.
  ins.run(48, 1, '1.7', 'review_submitted');

  // G5: gate-passing sections so the activityLog call-shape fix (07cd26e0) actually
  // executes end-to-end at 3 sites that no other test reaches a 200 on today.
  ins.run(49, 1, '1.12', 'review_in_progress'); // submit-review target
  ins.run(50, 1, '1.13', 'mt_uploaded'); // assign-reviewer target
  ins.run(51, 1, '1.14', 'review_approved'); // assign-localizer target
  // submit-review requires the caller to be the assigned reviewer (or admin); HE_B's
  // minted sub is 'u-he-b' (see mintToken/HE_B below).
  db.prepare(`UPDATE book_sections SET linguistic_reviewer = 'u-he-b' WHERE id = 49`).run();
  db.close();

  const app = express();
  app.use(express.json());
  app.use('/api/pipeline', require('../routes/pipeline'));
  app.use('/api/sections', require('../routes/sections'));
  app.use('/api/books', require('../routes/books'));
  app.use('/api/admin', require('../routes/admin'));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server?.close();
  rmSync(work, { recursive: true, force: true });
});

async function post(pathname, user, body) {
  return fetch(base + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${mintToken(user)}` },
    body: JSON.stringify(body ?? {}),
  });
}

async function del(pathname, user) {
  return fetch(base + pathname, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${mintToken(user)}` },
  });
}

async function get(pathname, user) {
  return fetch(base + pathname, {
    headers: { authorization: `Bearer ${mintToken(user)}` },
  });
}

// SAFETY: every pipeline probe uses chapter 9999 so validateParams 400s any request
// that clears authz — no pipeline job is ever actually started by this suite.
describe('pipeline POSTs are book-scoped', () => {
  for (const route of ['/api/pipeline/inject', '/api/pipeline/render', '/api/pipeline/run']) {
    it(`${route}: head-editor of another book → 403`, async () => {
      const res = await post(route, HE_A, {
        book: 'liffraedi-2e',
        chapter: 9999,
        track: 'faithful',
      });
      expect(res.status).toBe(403);
    });
    it(`${route}: owning head-editor clears authz (later 400, never 401/403)`, async () => {
      const res = await post(route, HE_B, {
        book: 'liffraedi-2e',
        chapter: 9999,
        track: 'faithful',
      });
      expect(res.status).toBe(400);
    });
    it(`${route}: admin bypasses book scope (later 400)`, async () => {
      const res = await post(route, ADMIN, {
        book: 'liffraedi-2e',
        chapter: 9999,
        track: 'faithful',
      });
      expect(res.status).toBe(400);
    });
    it(`${route}: plain editor → 403 (role gate, unchanged)`, async () => {
      const res = await post(route, EDITOR, {
        book: 'liffraedi-2e',
        chapter: 9999,
        track: 'faithful',
      });
      expect(res.status).toBe(403);
    });
  }

  // Discriminates the resolver from a hardcoded constant (T1 review finding):
  // HE_A succeeds on their OWN book, so the guard must be reading req.body.book —
  // a resolver stuck on 'liffraedi-2e' would 403 here.
  it('/api/pipeline/inject: head-editor clears authz for their own book (later 400)', async () => {
    const res = await post('/api/pipeline/inject', HE_A, {
      book: 'efnafraedi-2e',
      chapter: 9999,
      track: 'faithful',
    });
    expect(res.status).toBe(400);
  });

  // G3 (whole-branch review): the /inject-only case above wouldn't catch a resolver
  // that special-cased just that one route — repeat the discrimination on /render.
  it('/api/pipeline/render: head-editor clears authz for their own book (later 400)', async () => {
    const res = await post('/api/pipeline/render', HE_A, {
      book: 'efnafraedi-2e',
      chapter: 9999,
      track: 'faithful',
    });
    expect(res.status).toBe(400);
  });
});

describe('section head-editor actions are book-scoped', () => {
  // Section rows 42-46 all belong to liffraedi-2e (HE_B's book).
  const CASES = [
    { name: 'approve-review', path: '/api/sections/42/approve-review', body: {} },
    {
      name: 'assign-reviewer',
      path: '/api/sections/43/assign-reviewer',
      body: { reviewerId: 'someone' },
    },
    {
      name: 'assign-localizer',
      path: '/api/sections/44/assign-localizer',
      body: { localizerId: 'someone' },
    },
    { name: 'request-changes', path: '/api/sections/45/request-changes', body: { notes: 'x' } },
  ];
  for (const c of CASES) {
    it(`${c.name}: head-editor of another book → 403`, async () => {
      const res = await post(c.path, HE_A, c.body);
      expect(res.status).toBe(403);
    });
    it(`${c.name}: owning head-editor clears authz (never 401/403)`, async () => {
      const res = await post(c.path, HE_B, c.body);
      expect([401, 403]).not.toContain(res.status);
      // "Clears authz" means a genuine handler-level outcome, not a crash slipping
      // through the loose non-401/403 check above.
      expect(res.status).toBeLessThan(500);
    });
    it(`${c.name}: plain editor → 403`, async () => {
      const res = await post(c.path, EDITOR, c.body);
      expect(res.status).toBe(403);
    });
    // G4 (whole-branch review, design §6): the requireHeadEditorFor admin bypass runs
    // unconditionally in middleware, before any of these handlers' business-logic gates
    // (invalid-status 400s etc.) — so reusing the same rows here is safe: "not 401/403"
    // proves the bypass ran even when the downstream outcome legitimately varies by case.
    it(`${c.name}: admin bypasses book scope (never 401/403)`, async () => {
      const res = await post(c.path, ADMIN, c.body);
      expect([401, 403]).not.toContain(res.status);
      expect(res.status).toBeLessThan(500);
    });
  }
  // NOTE (T2 review): this 404 comes from loadSection's own not-found guard, which runs
  // BEFORE the book-scope middleware — the resolver's internal !book→404 branch is
  // unreachable on these routes (loadSection always yields a section with a bookSlug).
  it('unknown section → 404 for a head-editor (loadSection not-found guard)', async () => {
    const res = await post('/api/sections/99999/approve-review', HE_A, {});
    expect(res.status).toBe(404);
  });

  // G3 (whole-branch review): section 47 belongs to efnafraedi-2e (HE_A's book, not
  // HE_B's) — this discriminates the section resolver from a hardcoded 'liffraedi-2e'
  // constant, which the /inject-style pipeline discrimination case above can't reach
  // (it only exercises the pipeline resolver, not the section one).
  it('approve-review: head-editor clears authz for their own (different) book via the section resolver', async () => {
    const res = await post('/api/sections/47/approve-review', HE_A, {});
    expect(res.status).toBe(200);
  });

  it('status elevated transition: head-editor of another book → 403', async () => {
    const res = await post('/api/sections/46/status', HE_A, { status: 'review_approved' });
    expect(res.status).toBe(403);
  });
  it('status elevated transition: owning head-editor allowed', async () => {
    const res = await post('/api/sections/46/status', HE_B, { status: 'review_approved' });
    expect([401, 403]).not.toContain(res.status);
    // "Allowed" means a genuine handler-level outcome, not a crash slipping
    // through the loose non-401/403 check above.
    expect(res.status).toBeLessThan(500);
  });
  // G4 (whole-branch review, design §6): the hand-rolled elevated-permission branch in
  // the /status handler (`req.user.role !== ROLES.ADMIN && !isOwningHeadEditor`) is
  // gated BEHIND the transition-validity check — reusing section 46 here (already
  // 'review_approved' from the test above) would 400 at the transition-validity gate
  // before ever reaching the admin-bypass branch, so a regression dropping that branch
  // would stay green. Section 48 is untouched by any other test, so the transition is
  // still valid and this genuinely exercises the branch.
  it('status elevated transition: admin bypasses book scope (fresh row, exercises the hand-rolled elevated-permission branch)', async () => {
    const res = await post('/api/sections/48/status', ADMIN, { status: 'review_approved' });
    expect(res.status).toBe(200);
  });
});

describe('activityLog call-shape sites actually execute end-to-end (G5, Important #2 / B1-F6)', () => {
  // The shape fix in 07cd26e0 touched 7 sites; only approve-review/request-changes/status
  // ran a genuine 200 in the existing matrix. These gate-passing sections let the
  // remaining sites reach past their status/param gates. submit-review has no other
  // blocker and reaches a genuine 200 (its activityLog.log() call executes for real).
  // assign-reviewer/assign-localizer clear every authz/status gate too, but then hit an
  // unrelated pre-existing bug (see the two tests below) before reaching activityLog —
  // left as an honest authz-only assertion per the G5 escape hatch, not silently patched.
  it('submit-review: the assigned reviewer (HE_B) reaches a genuine 200', async () => {
    const res = await post('/api/sections/49/submit-review', HE_B, {});
    expect(res.status).toBe(200);
  });

  // ESCAPE HATCH (G5): this uncovered a real bug, not a harness gap — sections.js calls
  // `notifications.create(...)`, but server/services/notifications.js exports
  // `createNotification`, not `create`. The gate-passing section clears every prior gate
  // (authz, status validation) and reaches this call, which throws → 500. Filed as a new
  // finding (register follow-up); NOT fixed here (out of this commit's scope — see G5
  // escape-hatch policy). Asserting only that authz cleared, honestly, until it's fixed.
  it('assign-reviewer: owning head-editor (HE_B) clears authz on a gate-passing section (500 today — notifications.create bug, see report)', async () => {
    const res = await post('/api/sections/50/assign-reviewer', HE_B, {
      reviewerId: 'rev-1',
      reviewerName: 'Test Reviewer',
    });
    expect([401, 403]).not.toContain(res.status);
  });

  it('assign-localizer: owning head-editor (HE_B) clears authz on a gate-passing section (500 today — notifications.create bug, see report)', async () => {
    const res = await post('/api/sections/51/assign-localizer', HE_B, {
      localizerId: 'loc-1',
      localizerName: 'Test Localizer',
    });
    expect([401, 403]).not.toContain(res.status);
  });
});

describe('chapter markdown-import is head-editor-of-book scoped (SA-11 rider)', () => {
  const IMPORT = '/api/books/liffraedi-2e/chapters/1/import';
  it('plain editor → 403 (was allowed before this change)', async () => {
    const res = await post(IMPORT, EDITOR, {});
    expect(res.status).toBe(403);
  });
  it('head-editor of another book → 403', async () => {
    const res = await post(IMPORT, HE_A, {});
    expect(res.status).toBe(403);
  });
  it('owning head-editor clears authz (400 no-files, never 401/403)', async () => {
    const res = await post(IMPORT, HE_B, {});
    expect(res.status).toBe(400);
  });
  it('admin clears authz (400 no-files)', async () => {
    const res = await post(IMPORT, ADMIN, {});
    expect(res.status).toBe(400);
  });
});

describe('section upload route is retired (design decision 2026-07-11)', () => {
  it('is not registered on the router (introspection, mirrors books-routes.test.js)', () => {
    const sectionsRouter = require('../routes/sections');
    const registeredPaths = sectionsRouter.stack
      .filter((layer) => layer.route)
      .map((layer) => layer.route.path);
    expect(registeredPaths).not.toContain('/:sectionId/upload/:uploadType');
  });
  it('POST → 404 even for admin', async () => {
    const res = await post('/api/sections/42/upload/faithful', ADMIN, {});
    expect(res.status).toBe(404);
  });
});

describe('admin chapter-assignment routes are book-scoped (Task 6)', () => {
  // liffraedi-2e is HE_B's book (owner). HE_A only has efnafraedi-2e.
  const ASSIGN = '/api/admin/assignments/liffraedi-2e/1';

  it('POST assign: head-editor of another book → 403', async () => {
    const res = await post(ASSIGN, HE_A, { userId: 1 });
    expect(res.status).toBe(403);
  });
  it('POST assign: owning head-editor clears authz (never 401/403)', async () => {
    const res = await post(ASSIGN, HE_B, { userId: 1 });
    expect([401, 403]).not.toContain(res.status);
    // B1-F6: with the harness's users/user_chapter_assignments tables now real, this is
    // a genuine handler success, not a 500 slipping through the loose check above.
    expect(res.status).toBeLessThan(500);
  });
  it('POST assign: admin clears authz (never 401/403)', async () => {
    const res = await post(ASSIGN, ADMIN, { userId: 1 });
    expect([401, 403]).not.toContain(res.status);
    expect(res.status).toBeLessThan(500);
  });
  it('POST assign: plain editor → 403', async () => {
    const res = await post(ASSIGN, EDITOR, { userId: 1 });
    expect(res.status).toBe(403);
  });

  it('DELETE assign: head-editor of another book → 403', async () => {
    const res = await del(ASSIGN, HE_A);
    expect(res.status).toBe(403);
  });
  it('DELETE assign: owning head-editor clears authz (never 401/403)', async () => {
    const res = await del(ASSIGN, HE_B);
    expect([401, 403]).not.toContain(res.status);
    expect(res.status).toBeLessThan(500);
  });
  it('DELETE assign: admin clears authz (never 401/403)', async () => {
    const res = await del(ASSIGN, ADMIN);
    expect([401, 403]).not.toContain(res.status);
    expect(res.status).toBeLessThan(500);
  });
  it('DELETE assign: plain editor → 403', async () => {
    const res = await del(ASSIGN, EDITOR);
    expect(res.status).toBe(403);
  });
});

describe('admin GET assignments is book-scoped (B1-F5, whole-branch review)', () => {
  // GET /assignments/:book was the one read-leak sibling of Task 6's POST/DELETE fix —
  // gated on requireRole(HEAD_EDITOR) only, so any head-editor could read another book's
  // chapter assignments, assigned-editor names, and editorial progress.
  const READ = '/api/admin/assignments/liffraedi-2e';

  it('GET: head-editor of another book → 403', async () => {
    const res = await get(READ, HE_A);
    expect(res.status).toBe(403);
  });
  it('GET: owning head-editor clears authz and reaches a genuine 200', async () => {
    const res = await get(READ, HE_B);
    expect(res.status).toBe(200);
  });
  it('GET: admin clears authz and reaches a genuine 200', async () => {
    const res = await get(READ, ADMIN);
    expect(res.status).toBe(200);
  });
  it('GET: plain editor → 403', async () => {
    const res = await get(READ, EDITOR);
    expect(res.status).toBe(403);
  });
});
