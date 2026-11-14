/**
 * What the front page's data (GET /api/my-work/today) tells an editor (interface audit 2026-11-13, IA-4;
 * register §C221):
 *
 *   HM-01  the chapters assigned to them, each with a link into the editor (no page listed them);
 *   HM-03  a reviewer's question and a rejection as two kinds, with the first words of the text concerned
 *          (both were "Breytingar óskast" with "Laga nú", and neither named the sentence);
 *   HM-04  a link that opens the row, not only the module.
 *
 * Requests go through the real router with real tokens.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: the DB path and JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'my-work-today-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const express = require('express');
const cookieParser = require('cookie-parser');

let server;
let base;
let createToken;
let BOOK;

const EDITOR = { id: 'p-heim-editor', username: 'heim.editor@skoli.example', role: 'editor' };
const NEW_EDITOR = { id: 'p-heim-new', username: 'heim.new@skoli.example', role: 'editor' };

beforeAll(async () => {
  require('../services/migrationRunner').runAllMigrations();
  ({ createToken } = require('../services/auth'));
  const { VALID_BOOKS } = require('../config');
  if (!VALID_BOOKS.length) VALID_BOOKS.push('efnafraedi-2e');
  BOOK = VALID_BOOKS[0];

  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  const addUser = db.prepare(
    `INSERT INTO users (provider_id, provider_username, display_name, role, is_active)
     VALUES (?, ?, ?, 'editor', 1)`
  );
  const editorRow = Number(addUser.run(EDITOR.id, EDITOR.username, 'Heim Editor').lastInsertRowid);
  addUser.run(NEW_EDITOR.id, NEW_EDITOR.username, 'Heim New');

  const addEdit = db.prepare(
    `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content,
       status, editor_id, editor_username, reviewer_username, reviewer_note, reviewed_at, created_at)
     VALUES (?, 3, 'm11111', ?, 'original', ?, ?, ?, ?, 'Yfirlesari', ?, ?, ?)`
  );
  addEdit.run(
    BOOK,
    'm11111:para:fs-question',
    'Efnið er [[i:vatn]] og annað sem kemur fram í löngum texta sem nær langt út fyrir það sem sýnt er á forsíðunni',
    'discuss',
    EDITOR.id,
    EDITOR.username,
    'Á þetta að vera í nútíð eða þátíð?',
    '2026-11-13 10:00:00',
    '2026-11-13 09:00:00'
  );
  addEdit.run(
    BOOK,
    'm11111:para:fs-rejected',
    'Hafnaður texti',
    'rejected',
    EDITOR.id,
    EDITOR.username,
    'Rangt hugtak',
    '2026-11-13 09:30:00',
    '2026-11-13 09:00:00'
  );
  db.close();

  const userService = require('../services/userService');
  userService.assignChapter(editorRow, BOOK, 2, 'test');
  userService.assignChapter(editorRow, BOOK, -1, 'test');

  const app = express();
  app.use(cookieParser());
  app.use('/api/my-work', require('../routes/my-work'));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(work, { recursive: true, force: true });
});

async function today(person) {
  const token = createToken({
    id: person.id,
    username: person.username,
    name: person.username,
    role: person.role,
    books: [],
  });
  const res = await fetch(`${base}/api/my-work/today`, {
    headers: { cookie: `auth_token=${token}` },
  });
  expect(res.status).toBe(200);
  return res.json();
}

describe('the chapters assigned to the reader (HM-01)', () => {
  it('lists each assigned chapter with a link into the editor', async () => {
    const data = await today(EDITOR);
    const chapters = data.assignedChapters.map((c) => [c.book, c.chapter]);
    expect(chapters).toEqual([
      [BOOK, -1],
      [BOOK, 2],
    ]);
    const two = data.assignedChapters.find((c) => c.chapter === 2);
    expect(two.editorUrl).toBe(`/editor?book=${BOOK}&chapter=2`);
    expect(typeof two.bookLabel).toBe('string');
  });

  it('is an empty list for an editor with no chapter, and for a session with no account row', async () => {
    expect((await today(NEW_EDITOR)).assignedChapters).toEqual([]);
    const guest = { id: 'p-no-row', username: 'gestur@skoli.example', role: 'viewer' };
    expect((await today(guest)).assignedChapters).toEqual([]);
  });
});

describe('a question and a rejection are two kinds (HM-03), and each opens its row (HM-04)', () => {
  it('a discussion is a question, and a rejection is a rejection', async () => {
    const data = await today(EDITOR);
    const byKind = Object.fromEntries(data.allTasks.map((t) => [t.kind, t]));
    expect(Object.keys(byKind).sort()).toEqual(['question', 'rejected']);
    expect(byKind.question.notes).toBe('Á þetta að vera í nútíð eða þátíð?');
    expect(byKind.rejected.notes).toBe('Rangt hugtak');
  });

  it('carries the first words of the text, without markers', async () => {
    const { allTasks } = await today(EDITOR);
    const question = allTasks.find((t) => t.kind === 'question');
    expect(question.excerpt.startsWith('Efnið er vatn og annað')).toBe(true);
    expect(question.excerpt).not.toContain('[[');
    expect(question.excerpt.length).toBeLessThanOrEqual(81);
    expect(question.excerpt.endsWith('…')).toBe(true);
    expect(allTasks.find((t) => t.kind === 'rejected').excerpt).toBe('Hafnaður texti');
  });

  it("each task's link names its segment", async () => {
    const { allTasks } = await today(EDITOR);
    const question = allTasks.find((t) => t.kind === 'question');
    const url = new URL(question.editorUrl, 'http://x');
    expect(url.pathname).toBe('/segment-editor');
    expect(url.searchParams.get('book')).toBe(BOOK);
    expect(url.searchParams.get('module')).toBe('m11111');
    expect(url.searchParams.get('segment')).toBe('m11111:para:fs-question');
  });
});
