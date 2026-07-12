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
  // Suggestions-family (B1-F1) schema extension. localization_suggestions is
  // created by migration 004 in production (the service does NOT self-init it);
  // DDL copied from 004-terminology.js:85 (FK omitted — better-sqlite3 defaults
  // foreign_keys off and the harness uses explicit ids). faithful_path: scanBook's
  // SQL names bs.faithful_path, so the column must exist even though every harness
  // row leaves it NULL (→ 0 sections scanned). provider_id: requireBookAccess's
  // editor path calls userService.findByProviderId, which queries it — without the
  // column every editor-path request 500s. user_book_access: findByProviderId calls
  // getBookAccess whenever it finds a row. book_settings: isAssignmentEnforced.
  db.exec(`
    ALTER TABLE book_sections ADD COLUMN faithful_path TEXT;
    ALTER TABLE users ADD COLUMN provider_id TEXT;
    CREATE TABLE IF NOT EXISTS user_book_access (
      user_id INTEGER NOT NULL, book_slug TEXT NOT NULL, role_for_book TEXT
    );
    CREATE TABLE IF NOT EXISTS book_settings (
      book TEXT PRIMARY KEY, enforce_assignments INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS localization_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      suggestion_type TEXT NOT NULL,
      original_text TEXT NOT NULL,
      suggested_text TEXT NOT NULL,
      context TEXT,
      line_number INTEGER,
      pattern_id TEXT,
      status TEXT DEFAULT 'pending',
      reviewer_modified_text TEXT,
      reviewed_by TEXT,
      reviewed_by_name TEXT,
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  // T7-review Minor (Task 8, Part B): section 47 (book_id=2, efnafraedi-2e) gets its own
  // chapter row/id — see the `chapter_id=2` note at its INSERT below for why sharing
  // chapter_id=1 with the book_id=1 sections would be wrong.
  db.prepare(
    `INSERT INTO book_chapters (id, title_en, title_is) VALUES (2, 'Chapter 1 (efnafraedi-2e)', 'Kafli 1 (efnafræði)')`
  ).run();
  // One user row so the admin chapter-assignment routes (Task 6 / B1-F6) can reach a
  // genuine 200 instead of fail-open/500ing on a missing `users` table.
  db.prepare(`INSERT INTO users (id, display_name, role) VALUES (1, 'Editor One', 'editor')`).run();

  // One section row per action so cross-book RED-phase mutations can't interfere across tests.
  const ins = db.prepare(
    `INSERT INTO book_sections (id, book_id, chapter_id, chapter_num, section_num, status) VALUES (?, ?, ?, 1, ?, ?)`
  );
  ins.run(42, 1, 1, '1.1', 'review_submitted'); // approve-review target
  ins.run(43, 1, 1, '1.2', 'not_started'); // assign-reviewer target
  ins.run(44, 1, 1, '1.3', 'not_started'); // assign-localizer target
  ins.run(45, 1, 1, '1.4', 'review_submitted'); // request-changes target
  ins.run(46, 1, 1, '1.5', 'review_submitted'); // status-elevated target

  // G3: efnafraedi-2e-owned (book_id=2) section — proves the approve-review resolver
  // reads bs.bookSlug rather than a constant stuck on liffraedi-2e. T7-review Minor: this
  // must use its OWN chapter_id (2, not 1) — bookRegistration.updateChapterStatus()
  // aggregates book_sections by chapter_id alone (no book_id filter), so sharing
  // chapter_id=1 with the book_id=1 sections above would let approving this section mix
  // its status into book_id=1's chapter-1 aggregate (and vice versa) across two books.
  ins.run(47, 2, 2, '1.6', 'review_submitted');

  // G4: a FRESH row for the status route's admin-bypass case. Reusing section 46 (already
  // transitioned to review_approved by the "owning head-editor allowed" test below) would
  // hit the transition-validity 400 *before* the hand-rolled elevated-permission branch is
  // ever reached — a regression dropping the admin bypass there would stay green. This row
  // must stay untouched by any other test.
  ins.run(48, 1, 1, '1.7', 'review_submitted');

  // G5: gate-passing sections so the activityLog call-shape fix (07cd26e0) actually
  // executes end-to-end at 3 sites that no other test reaches a 200 on today.
  ins.run(49, 1, 1, '1.12', 'review_in_progress'); // submit-review target
  ins.run(50, 1, 1, '1.13', 'mt_uploaded'); // assign-reviewer target
  ins.run(51, 1, 1, '1.14', 'review_approved'); // assign-localizer target
  // submit-review requires the caller to be the assigned reviewer (or admin); HE_B's
  // minted sub is 'u-he-b' (see mintToken/HE_B below).
  db.prepare(`UPDATE book_sections SET linguistic_reviewer = 'u-he-b' WHERE id = 49`).run();

  // ── Suggestions-family fixtures (B1-F1 + folded B1-F2/F3) ──
  // Enforcement stays OFF for liffraedi-2e (fail-open matrix — the project's
  // default model) and is turned ON for efnafraedi-2e (default-deny matrix).
  // Only the new suggestions routes reach requireBookAccess's chapter-assignment
  // path in this suite (everything older is requireHeadEditor/-For gated), so
  // the toggle cannot affect the pre-existing tests.
  db.prepare(
    `INSERT INTO book_settings (book, enforce_assignments) VALUES ('efnafraedi-2e', 1)`
  ).run();
  // users rows WITH provider_id so findByProviderId resolves these personas.
  // A JWT user with no users row skips the chapter check entirely (dbUser-null
  // fall-through in requireBookAccess) — that would mask the enforcement-ON 403s
  // asserted below. HE_A deliberately gets NO row: the fail-open cases document
  // that the unknown-to-DB fall-through also passes when enforcement is off.
  db.prepare(
    `INSERT INTO users (id, display_name, role, provider_id) VALUES (2, 'Editor Ed', 'editor', 'u-ed')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, display_name, role, provider_id) VALUES (3, 'Head B', 'head-editor', 'u-he-b')`
  ).run();
  // Fresh sections (no interference with rows 42-51):
  ins.run(60, 1, 1, '1.20', 'not_started'); // liffraedi: fail-open matrix + bulk
  ins.run(61, 2, 2, '1.21', 'not_started'); // efnafraedi: enforcement-ON + resolver discrimination
  ins.run(62, 1, 1, '1.22', 'not_started'); // liffraedi: sync-log (kept suggestion-free → entriesCreated 0, no localization_log table needed)
  const insSug = db.prepare(
    `INSERT INTO localization_suggestions (id, section_id, suggestion_type, original_text, suggested_text)
     VALUES (?, ?, 'unit_conversion', '5 miles', '8.0 km')`
  );
  insSug.run(70, 60); // accept target (fail-open editor)
  insSug.run(71, 60); // reject target
  insSug.run(72, 60); // modify target
  insSug.run(73, 60); // bulk-accept target
  insSug.run(74, 60); // bulk-accept target
  insSug.run(75, 61); // efnafraedi: discrimination + enforcement-ON target

  db.close();

  const app = express();
  app.use(express.json());
  app.use('/api/pipeline', require('../routes/pipeline'));
  app.use('/api/sections', require('../routes/sections'));
  app.use('/api/books', require('../routes/books'));
  app.use('/api/admin', require('../routes/admin'));
  app.use('/api/activity', require('../routes/activity'));
  app.use('/api/suggestions', require('../routes/suggestions'));
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
  // assign-reviewer/assign-localizer clear every authz/status gate too, and (as of Task 8)
  // now also clear the notifications.create->createNotification bug below them, so all
  // three cases in this describe reach a genuine 200 and exercise their activityLog.log()
  // call for real.
  it('submit-review: the assigned reviewer (HE_B) reaches a genuine 200', async () => {
    const res = await post('/api/sections/49/submit-review', HE_B, {});
    expect(res.status).toBe(200);
  });

  // Task 8: was an ESCAPE HATCH (G5) — sections.js called `notifications.create(...)`, but
  // server/services/notifications.js exports `createNotification`, not `create`. The
  // gate-passing section cleared every prior gate (authz, status validation) and reached
  // this call, which threw → 500 (after the section-status write had already committed).
  // Fixed by renaming the 4 call sites to `createNotification` (param-compatible, pure
  // rename) — these now assert the genuine 200, closing the G5 deferral for real.
  it('assign-reviewer: owning head-editor (HE_B) reaches a genuine 200 on a gate-passing section', async () => {
    const res = await post('/api/sections/50/assign-reviewer', HE_B, {
      reviewerId: 'rev-1',
      reviewerName: 'Test Reviewer',
    });
    expect(res.status).toBe(200);
  });

  it('assign-localizer: owning head-editor (HE_B) reaches a genuine 200 on a gate-passing section', async () => {
    const res = await post('/api/sections/51/assign-localizer', HE_B, {
      localizerId: 'loc-1',
      localizerName: 'Test Localizer',
    });
    expect(res.status).toBe(200);
  });

  // Static guard for the other 2 of the 4 renamed call sites (approve-review:448,
  // request-changes:531): neither is reached by any test's current seed data (both sit
  // behind an `if (section.linguisticReviewer)` / `if (assignedUserId)` guard that's false
  // for every section this suite drives through those routes), so the runtime 200
  // assertions above only exercise sites 118/201. This source-level check covers all 4
  // regardless of which are runtime-exercised, so a reintroduced `notifications.create(`
  // typo anywhere in sections.js can't slip back in unnoticed.
  it('sections.js has no lingering notifications.create( call (all 4 sites renamed)', () => {
    const fs = require('fs');
    const sectionsSrc = fs.readFileSync(require.resolve('../routes/sections.js'), 'utf8');
    expect(sectionsSrc).not.toMatch(/notifications\.create\(/);

    const notificationsService = require('../services/notifications');
    expect(typeof notificationsService.create).toBe('undefined');
    expect(typeof notificationsService.createNotification).toBe('function');
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

describe('activity book-log read is book-scoped (B1-F5 sibling, whole-branch review)', () => {
  // GET /api/activity/book/:book leaked another book's full editorial activity
  // (usernames, actions, timestamps) to any head-editor — same class as the
  // GET /assignments read-leak fixed in T7. activityLog.getByBook self-inits its
  // table, so owner/admin reach a genuine 200 (empty log is fine).
  const READ = '/api/activity/book/liffraedi-2e';
  it('GET: head-editor of another book → 403', async () => {
    const res = await get(READ, HE_A);
    expect(res.status).toBe(403);
  });
  it('GET: owning head-editor → 200', async () => {
    const res = await get(READ, HE_B);
    expect(res.status).toBe(200);
  });
  it('GET: admin → 200', async () => {
    const res = await get(READ, ADMIN);
    expect(res.status).toBe(200);
  });
  it('GET: plain editor → 403', async () => {
    const res = await get(READ, EDITOR);
    expect(res.status).toBe(403);
  });
});

// ============================================================================
// Suggestions family (B1-F1 + folded B1-F2/F3 for this family)
// ============================================================================

describe('suggestions scan-book is head-editor-of-book scoped (B1-F1)', () => {
  const SCAN_BOOK = '/api/suggestions/scan-book/liffraedi-2e';

  it('head-editor of another book → 403 (was: any head-editor could regenerate any book)', async () => {
    const res = await post(SCAN_BOOK, HE_A);
    expect(res.status).toBe(403);
  });
  it('owning head-editor reaches a genuine 200 (scan-book activityLog site executes end-to-end)', async () => {
    const res = await post(SCAN_BOOK, HE_B);
    expect(res.status).toBe(200);
  });
  it('admin bypasses book scope (200)', async () => {
    const res = await post(SCAN_BOOK, ADMIN);
    expect(res.status).toBe(200);
  });
  it('plain editor → 403 (role gate, unchanged)', async () => {
    const res = await post(SCAN_BOOK, EDITOR);
    expect(res.status).toBe(403);
  });
});

describe('suggestions section-keyed routes are book/section-scoped (B1-F2/F3 fold-in)', () => {
  // ── Fail-open block (liffraedi-2e, enforcement OFF — the project's default
  // model, enforce_assignments not set). requireBookAccessForSection delegates
  // to requireBookAccess, so a caller with no assignments for the book passes:
  // that includes plain editors AND head-editors of OTHER books (they take the
  // same editor path — see the middleware JSDoc). The cross-book denials live
  // in the enforcement-ON block below.
  it('scan: plain editor clears authz fail-open and reaches a genuine 200 (scan activityLog site executes)', async () => {
    const res = await post('/api/suggestions/scan/60', EDITOR);
    expect(res.status).toBe(200);
  });
  it('read: head-editor of another book ALSO clears fail-open (documented requireBookAccess fall-through, same as any editor)', async () => {
    const res = await get('/api/suggestions/60', HE_A);
    expect(res.status).toBe(200);
  });
  it('stats: plain editor clears fail-open (200)', async () => {
    const res = await get('/api/suggestions/60/stats', EDITOR);
    expect(res.status).toBe(200);
  });

  // ── Enforcement-ON block (efnafraedi-2e, enforce_assignments=1 in the
  // harness): the chapter-assignment path turns default-deny, which is where
  // the middleware's cross-book protection actually bites.
  it('scan: unassigned editor → 403 under enforcement (default-deny)', async () => {
    const res = await post('/api/suggestions/scan/61', EDITOR);
    expect(res.status).toBe(403);
  });
  it('read: unassigned editor → 403 under enforcement (GETs are gated too)', async () => {
    const res = await get('/api/suggestions/61', EDITOR);
    expect(res.status).toBe(403);
  });
  it('read: owning head-editor short-circuits enforcement (200)', async () => {
    const res = await get('/api/suggestions/61', HE_A);
    expect(res.status).toBe(200);
  });
  it('read: admin short-circuits enforcement (200)', async () => {
    const res = await get('/api/suggestions/61', ADMIN);
    expect(res.status).toBe(200);
  });

  // ── Not-found + route-ordering pins
  it('scan: unknown section → 404', async () => {
    const res = await post('/api/suggestions/scan/99999', HE_B);
    expect(res.status).toBe(404);
  });
  it('read: non-numeric :sectionId → 404 (getSection(NaN) yields no row)', async () => {
    const res = await get('/api/suggestions/abc', HE_B);
    expect(res.status).toBe(404);
  });
  it('patterns route stays first and unscoped (requireAuth only)', async () => {
    const res = await get('/api/suggestions/patterns', EDITOR);
    expect(res.status).toBe(200);
  });
});

describe('suggestions bulk route contains ids to the gated section (id-smuggling rider)', () => {
  it('owning head-editor bulk-accepts same-section ids and reaches a genuine 200 (bulk activityLog site executes)', async () => {
    const res = await post('/api/suggestions/60/bulk', HE_B, { ids: [73, 74], action: 'accept' });
    expect(res.status).toBe(200);
  });
  it('ids belonging to another section → 400 (suggestion 75 is section 61 / efnafraedi)', async () => {
    const res = await post('/api/suggestions/60/bulk', HE_B, { ids: [75], action: 'accept' });
    expect(res.status).toBe(400);
  });
});

describe('suggestions sync-log: middleware + book-scoped canSync (rider)', () => {
  // Section 62 is liffraedi-owned and suggestion-free (entriesCreated: 0), so a
  // genuine 200 needs no localization_log table and no cross-test ordering.
  it('head-editor of another book → 403 from canSync (clears fail-open middleware, then the book-scoped elevated check denies)', async () => {
    const res = await post('/api/suggestions/62/sync-log', HE_A);
    expect(res.status).toBe(403);
  });
  it('plain editor (not the assigned localizer) → 403 from canSync (localizer gate preserved beneath the middleware)', async () => {
    const res = await post('/api/suggestions/62/sync-log', EDITOR);
    expect(res.status).toBe(403);
  });
  it('owning head-editor reaches a genuine 200 (sync-log activityLog site executes)', async () => {
    const res = await post('/api/suggestions/62/sync-log', HE_B);
    expect(res.status).toBe(200);
  });
});

describe('suggestion-id routes resolve to their owning section and book-scope on it', () => {
  // Suggestion 75 → section 61 → efnafraedi-2e (enforcement ON, HE_A's book).
  it('accept: head-editor of another book → 403 under enforcement (suggestion 75 is efnafraedi)', async () => {
    const res = await post('/api/suggestions/75/accept', HE_B);
    expect(res.status).toBe(403);
  });
  it('accept: owning head-editor → genuine 200 via the suggestion→section resolver (discriminates the resolver from a liffraedi constant; accept activityLog site executes)', async () => {
    const res = await post('/api/suggestions/75/accept', HE_A);
    expect(res.status).toBe(200);
  });
  // Suggestions 70-72 → section 60 → liffraedi-2e (fail-open).
  it('accept: plain editor clears fail-open on liffraedi and reaches a genuine 200', async () => {
    const res = await post('/api/suggestions/70/accept', EDITOR);
    expect(res.status).toBe(200);
  });
  it('reject: owning head-editor → genuine 200 (reject activityLog site executes)', async () => {
    const res = await post('/api/suggestions/71/reject', HE_B);
    expect(res.status).toBe(200);
  });
  it('modify: owning head-editor → genuine 200 (modify activityLog site executes)', async () => {
    const res = await post('/api/suggestions/72/modify', HE_B, { modifiedText: '8,0 km' });
    expect(res.status).toBe(200);
  });
  it('unknown suggestion id → 404 from the resolver (was a formatSuggestion TypeError → 500)', async () => {
    const res = await post('/api/suggestions/99999/accept', HE_B);
    expect(res.status).toBe(404);
  });
});

describe('suggestions.js activityLog call shape (static guard, mirrors the sections.js guard)', () => {
  it('has no legacy {action:/entityType:/details:} call shape left', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../routes/suggestions.js'), 'utf8');
    expect(src).not.toMatch(/\baction:\s*['"`]/);
    expect(src).not.toMatch(/\bentityType:/);
    expect(src).not.toMatch(/\bdetails:/);
  });
});
