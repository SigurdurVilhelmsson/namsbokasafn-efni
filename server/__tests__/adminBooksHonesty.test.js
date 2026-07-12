/**
 * GET /api/admin/books honesty (batch 4, audit finding 22 / design D9).
 *
 * A real editorial-progress failure used to render as fabricated zeros —
 * byte-identical to an untouched book, with no log line. Pins: on a
 * progress-computation failure the route returns editorialProgress: null +
 * editorialProgressUnavailable: true and pino-logs the error.
 *
 * Harness: temp-file DB via SESSIONS_DB_PATH (set BEFORE any server
 * require), real migrations, one registered book row, then DROP the
 * segment_edits table so getEditorialProgress throws. The route handler is
 * invoked directly via router introspection (auth middlewares bypassed).
 *
 * Adaptation from the task brief's draft test (verified against the real
 * schema, not assumed):
 *  - There is no top-level `books` table. The route reads via
 *    bookRegistration.listRegisteredBooks(), which joins `registered_books`
 *    to `openstax_catalogue` (INNER JOIN — see 2026-06-10 known issue).
 *    Migration 003's DDL requires: openstax_catalogue.slug/title NOT NULL;
 *    registered_books.slug/title_is/registered_by NOT NULL, plus a
 *    catalogue_id that resolves via the INNER JOIN or the book silently
 *    disappears from the list (a different failure mode than the one under
 *    test) — so both rows are inserted here.
 */
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'adminbooks-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const logger = require('../lib/logger');

let handler;
let db;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  const Database = require('better-sqlite3');
  db = new Database(process.env.SESSIONS_DB_PATH);

  // listRegisteredBooks() INNER JOINs openstax_catalogue, so a registered
  // book needs a matching catalogue row to appear in the list at all.
  const catalogueResult = db
    .prepare(
      "INSERT INTO openstax_catalogue (slug, title) VALUES ('prufubok-cat', 'Test Catalogue Book')"
    )
    .run();

  db.prepare(
    `INSERT INTO registered_books (catalogue_id, slug, title_is, registered_by, status)
     VALUES (?, 'prufubok', 'Prufubók', 'u-adm', 'active')`
  ).run(catalogueResult.lastInsertRowid);

  db.exec('DROP TABLE segment_edits'); // force getEditorialProgress to throw

  const router = require('../routes/admin');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/books' && l.route.methods.get
  );
  handler = layer.route.stack[layer.route.stack.length - 1].handle;
});

afterEach(() => vi.restoreAllMocks());

function invoke() {
  return new Promise((resolve) => {
    const req = { user: { id: 'u-adm', username: 'adm', role: 'admin' }, params: {}, query: {} };
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
      },
    };
    handler(req, res);
  });
}

describe('GET /api/admin/books with a broken progress pipeline', () => {
  it('marks progress unavailable instead of fabricating zeros, and logs', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { status, body } = await invoke();
    expect(status).toBe(200);
    const book = body.books.find((b) => b.slug === 'prufubok');
    expect(book).toBeTruthy();
    expect(book.editorialProgress).toBeNull();
    expect(book.editorialProgressUnavailable).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ book: 'prufubok' }),
      expect.stringContaining('Editorial progress failed')
    );
  });
});
