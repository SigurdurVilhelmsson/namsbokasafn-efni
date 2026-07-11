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
  // Minimal subset of migration 003's tables — just what getSection's JOIN reads.
  const db = new Database(process.env.SESSIONS_DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS registered_books (id INTEGER PRIMARY KEY, slug TEXT, title_is TEXT);
    CREATE TABLE IF NOT EXISTS book_chapters (id INTEGER PRIMARY KEY, title_en TEXT, title_is TEXT);
    CREATE TABLE IF NOT EXISTS book_sections (
      id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL, chapter_id INTEGER NOT NULL,
      chapter_num INTEGER NOT NULL, section_num TEXT NOT NULL, module_id TEXT,
      title_en TEXT, title_is TEXT, status TEXT DEFAULT 'not_started'
    );
  `);
  db.prepare(
    `INSERT INTO registered_books (id, slug, title_is) VALUES (1, 'liffraedi-2e', 'Líffræði')`
  ).run();
  db.prepare(
    `INSERT INTO book_chapters (id, title_en, title_is) VALUES (1, 'Chapter 1', 'Kafli 1')`
  ).run();
  // One section row per action so cross-book RED-phase mutations can't interfere across tests.
  const ins = db.prepare(
    `INSERT INTO book_sections (id, book_id, chapter_id, chapter_num, section_num, status) VALUES (?, 1, 1, 1, ?, ?)`
  );
  ins.run(42, '1.1', 'review_submitted'); // approve-review target
  ins.run(43, '1.2', 'not_started'); // assign-reviewer target
  ins.run(44, '1.3', 'not_started'); // assign-localizer target
  ins.run(45, '1.4', 'review_submitted'); // request-changes target
  ins.run(46, '1.5', 'review_submitted'); // status-elevated target
  db.close();

  const app = express();
  app.use(express.json());
  app.use('/api/pipeline', require('../routes/pipeline'));
  app.use('/api/sections', require('../routes/sections'));
  app.use('/api/books', require('../routes/books'));
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
});
