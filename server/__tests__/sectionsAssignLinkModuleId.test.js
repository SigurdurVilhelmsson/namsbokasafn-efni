/**
 * C1c Task 4, Part A / U3a (controller override — ALL FOUR sites, not just
 * the two the spec/brief named).
 *
 * All four notification `link:` fields in sections.js built
 * `...&module=${section.sectionNum}`, but the editor routes that consume
 * `module=` are guarded by `validateModule`'s `^(m\d{5}|chapter-metadata)$`
 * regex. `section.sectionNum` is `book_sections.section_num` — `"5.1"` for a
 * normal chapter section, `"1"` for an appendix section — so EVERY
 * assignment/approval/changes-requested notification deep link 400s in the
 * editor, for every chapter (not only appendices). The fix swaps the
 * `module=` value to `section.moduleId` at all four sites:
 *   - :123 POST assign-reviewer   -> notify reviewer  (segment-editor)
 *   - :206 POST assign-localizer  -> notify localizer (localization-editor)
 *   - :453 POST approve-review    -> notify reviewer  (segment-editor)
 *   - :536 POST request-changes   -> notify reviewer/localizer (segment-editor)
 *
 * Harness: real Express app + real temp-file DB (mirrors
 * crossBookAuthz.test.js's fixture shape for book_sections/book_chapters,
 * plus migration040 for the notifications table notifications.
 * createNotification actually inserts into). Each route is driven through a
 * genuine HTTP call as an admin (bypasses requireHeadEditorFor's per-book
 * ownership check, same persona convention as crossBookAuthz.test.js), and
 * the assertion reads the `link` column back off the `notifications` table
 * — proving what was actually persisted, not just what the handler intended.
 *
 * Each route is exercised twice: once for a NORMAL chapter section (proves
 * the all-chapter fix — this is not an appendix-only bug) and once for an
 * APPENDIX section (chapter_num=-1, sectionNum='1'..'4') — proving the fix
 * also covers the motivating C1 case.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'sections-link-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const express = require('express');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const migration040 = require('../migrations/040-service-table-ownership');

const ADMIN = { username: 'adm', role: 'admin', books: [] };

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
let db;

beforeAll(() => {
  db = new Database(process.env.SESSIONS_DB_PATH);
  migration040.up(db);

  // Minimal schema subset (copied from crossBookAuthz.test.js's fixture,
  // which is verified against the real migration-003 shape) — just what
  // getSection's JOIN reads plus the columns updateSectionStatus writes for
  // assign-reviewer/assign-localizer/approve-review/request-changes.
  db.exec(`
    CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT, title_is TEXT);
    CREATE TABLE book_chapters (
      id INTEGER PRIMARY KEY, title_en TEXT, title_is TEXT, status TEXT DEFAULT 'not_started'
    );
    CREATE TABLE book_sections (
      id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL, chapter_id INTEGER NOT NULL,
      chapter_num INTEGER NOT NULL, section_num TEXT NOT NULL, module_id TEXT,
      title_en TEXT, title_is TEXT, status TEXT DEFAULT 'not_started',
      linguistic_reviewer TEXT, linguistic_reviewer_name TEXT,
      linguistic_assigned_at DATETIME, linguistic_submitted_at DATETIME,
      linguistic_approved_at DATETIME, linguistic_approved_by TEXT, linguistic_approved_by_name TEXT,
      localizer TEXT, localizer_name TEXT, localization_assigned_at DATETIME
    );
  `);

  db.prepare(
    `INSERT INTO registered_books (id, slug, title_is) VALUES (1, 'efnafraedi-2e', 'Efnafræði')`
  ).run();
  db.prepare(
    `INSERT INTO book_chapters (id, title_en, title_is) VALUES (1, 'Chapter 5', 'Kafli 5')`
  ).run();

  const ins = db.prepare(`
    INSERT INTO book_sections
      (id, book_id, chapter_id, chapter_num, section_num, module_id, status, linguistic_reviewer, localizer)
    VALUES (?, 1, 1, ?, ?, ?, ?, ?, ?)
  `);
  // Normal chapter (chapter_num=5) — proves the fix is not appendix-only.
  ins.run(100, 5, '5.1', 'm12345', 'mt_uploaded', null, null); // assign-reviewer target
  ins.run(101, 5, '5.2', 'm22222', 'review_approved', null, null); // assign-localizer target
  ins.run(102, 5, '5.3', 'm33333', 'review_submitted', 'rev-1', null); // approve-review target
  ins.run(103, 5, '5.4', 'm44444', 'review_submitted', 'rev-2', null); // request-changes target

  // Appendix (chapter_num=-1) — the motivating C1 case.
  ins.run(200, -1, '1', 'm90001', 'mt_uploaded', null, null); // assign-reviewer target
  ins.run(201, -1, '2', 'm90002', 'review_approved', null, null); // assign-localizer target
  ins.run(202, -1, '3', 'm90003', 'review_submitted', 'rev-3', null); // approve-review target
  ins.run(203, -1, '4', 'm90004', 'review_submitted', 'rev-4', null); // request-changes target

  db.close();

  const app = express();
  app.use(express.json());
  app.use('/api/sections', require('../routes/sections'));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server?.close();
  rmSync(work, { recursive: true, force: true });
});

async function post(pathname, body) {
  return fetch(base + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${mintToken(ADMIN)}` },
    body: JSON.stringify(body ?? {}),
  });
}

function latestNotificationLink(userId) {
  const d = new Database(process.env.SESSIONS_DB_PATH);
  try {
    const row = d
      .prepare('SELECT link FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1')
      .get(userId);
    return row?.link;
  } finally {
    d.close();
  }
}

describe('sections.js assignment/notification links use moduleId, not sectionNum (U3a, all 4 sites)', () => {
  describe(':123 POST /:sectionId/assign-reviewer', () => {
    it('normal chapter section: link carries module=m12345, not module=5.1', async () => {
      const res = await post('/api/sections/100/assign-reviewer', {
        reviewerId: 'rev-normal',
        reviewerName: 'Reviewer Normal',
      });
      expect(res.status).toBe(200);
      const link = latestNotificationLink('rev-normal');
      expect(link).toContain('module=m12345');
      expect(link).not.toContain('module=5.1');
      expect(link).toContain('/segment-editor');
    });

    it('appendix section: link carries module=m90001, not module=1', async () => {
      const res = await post('/api/sections/200/assign-reviewer', {
        reviewerId: 'rev-appendix',
        reviewerName: 'Reviewer Appendix',
      });
      expect(res.status).toBe(200);
      const link = latestNotificationLink('rev-appendix');
      expect(link).toContain('module=m90001');
      expect(link).not.toContain('module=1&'); // not a bare section-num "1"
      expect(link).not.toMatch(/module=1$/);
    });
  });

  describe(':206 POST /:sectionId/assign-localizer', () => {
    it('normal chapter section: link carries module=m22222, not module=5.2', async () => {
      const res = await post('/api/sections/101/assign-localizer', {
        localizerId: 'loc-normal',
        localizerName: 'Localizer Normal',
      });
      expect(res.status).toBe(200);
      const link = latestNotificationLink('loc-normal');
      expect(link).toContain('module=m22222');
      expect(link).not.toContain('module=5.2');
      expect(link).toContain('/localization-editor');
    });

    it('appendix section: link carries module=m90002, not module=2', async () => {
      const res = await post('/api/sections/201/assign-localizer', {
        localizerId: 'loc-appendix',
        localizerName: 'Localizer Appendix',
      });
      expect(res.status).toBe(200);
      const link = latestNotificationLink('loc-appendix');
      expect(link).toContain('module=m90002');
      expect(link).not.toMatch(/module=2$/);
    });
  });

  describe(':453 POST /:sectionId/approve-review', () => {
    it('normal chapter section: link carries module=m33333, not module=5.3', async () => {
      const res = await post('/api/sections/102/approve-review', {});
      expect(res.status).toBe(200);
      const link = latestNotificationLink('rev-1');
      expect(link).toContain('module=m33333');
      expect(link).not.toContain('module=5.3');
      expect(link).toContain('/segment-editor');
    });

    it('appendix section: link carries module=m90003, not module=3', async () => {
      const res = await post('/api/sections/202/approve-review', {});
      expect(res.status).toBe(200);
      const link = latestNotificationLink('rev-3');
      expect(link).toContain('module=m90003');
      expect(link).not.toMatch(/module=3$/);
    });
  });

  describe(':536 POST /:sectionId/request-changes', () => {
    it('normal chapter section: link carries module=m44444, not module=5.4', async () => {
      const res = await post('/api/sections/103/request-changes', { notes: 'Villa í málsgrein 2' });
      expect(res.status).toBe(200);
      const link = latestNotificationLink('rev-2');
      expect(link).toContain('module=m44444');
      expect(link).not.toContain('module=5.4');
      expect(link).toContain('/segment-editor');
    });

    it('appendix section: link carries module=m90004, not module=4', async () => {
      const res = await post('/api/sections/203/request-changes', { notes: 'Villa í viðauka' });
      expect(res.status).toBe(200);
      const link = latestNotificationLink('rev-4');
      expect(link).toContain('module=m90004');
      expect(link).not.toMatch(/module=4$/);
    });
  });
});
