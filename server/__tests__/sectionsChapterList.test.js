/**
 * GET /api/sections/:book/:chapter: the sections of one chapter, for a section picker.
 *
 * The review tab on the localization page ("Yfirlestur á staðfæringu") fills its "Hluti" list from this address.
 * The sections router had only /:sectionId, so the request got a 404, the list read "Villa" and stayed disabled,
 * and the controls behind it could be reached only by typing ?sectionId=N (interface audit 2026-11-13, LO-01).
 *
 * The route is for the book's head editor and admins, as the page and its writes are ([USER] 2026-11-14,
 * answer 12). It answers with what a picker needs and no more: a section's row also holds the names of its
 * reviewer and localizer and its file paths, and none of that belongs in a list of options.
 *
 * Requests go through the real router, on a database built by the real migrations. Checks are by VALUE: the
 * answer must hold exactly the planted chapter's ids, in reading order, so another chapter's or another book's
 * section cannot slip in unseen; and the people and paths planted on a row must appear nowhere in it. The control
 * for the second is the section-by-id route, which does give them, so a test that planted nothing cannot pass.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: the DB path and JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'sections-chapter-list-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const express = require('express');
const cookieParser = require('cookie-parser');

const BOOK = 'efnafraedi-2e';
const OTHER = 'liffraedi-2e';

// Planted on one row of the chapter, and found nowhere else in the database.
const PEOPLE_AND_PATHS = [
  'id-yfirlesari-9911',
  'Yfirlesari-Sentinel',
  'id-stadfaerandi-9912',
  'Staðfærandi-Sentinel',
  'slod-truar-9913.md',
  'slod-stadfaerd-9914.md',
];

let server;
let base;
let createToken;
/** section_num → id, for the chapter under test; and the ids that must stay out. */
const ids = {};

beforeAll(async () => {
  require('../services/migrationRunner').runAllMigrations();
  ({ createToken } = require('../services/auth'));

  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  // The migrations register the real books; a chapter and its sections hang on a book's id.
  const bookId = (slug) =>
    db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug).id;
  const chapter = db.prepare(
    'INSERT INTO book_chapters (book_id, chapter_num, title_en) VALUES (?, ?, ?)'
  );
  const section = db.prepare(
    `INSERT INTO book_sections (book_id, chapter_id, chapter_num, section_num, title_en, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const plant = (slug, chapterNum, sectionNums, status = 'not_started') => {
    const book = bookId(slug);
    const chapterId = chapter.run(book, chapterNum, `Chapter ${chapterNum}`).lastInsertRowid;
    const planted = {};
    for (const num of sectionNums) {
      planted[num] = Number(
        section.run(book, chapterId, chapterNum, num, `Section ${num}`, status).lastInsertRowid
      );
    }
    return planted;
  };

  // Inserted out of reading order, so an answer in insertion order is told apart from one in reading order.
  Object.assign(ids, plant(BOOK, 1, ['1.2', 'intro', '1.10', '1.1']));
  ids.otherChapter = plant(BOOK, 2, ['2.1'])['2.1'];
  ids.appendix = plant(BOOK, -1, ['1'])['1'];
  ids.otherBook = plant(OTHER, 1, ['1.1'])['1.1'];
  plant(BOOK, 3, []); // a chapter with no sections

  db.prepare(
    `UPDATE book_sections
     SET status = 'localization_in_progress',
         linguistic_reviewer = ?, linguistic_reviewer_name = ?, localizer = ?, localizer_name = ?,
         faithful_path = ?, localized_path = ?
     WHERE id = ?`
  ).run(...PEOPLE_AND_PATHS, ids['1.2']);
  db.close();

  const app = express();
  app.use(cookieParser());
  app.use('/api/sections', require('../routes/sections'));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(work, { recursive: true, force: true });
});

const SESSIONS = {
  'the head editor of the book': { role: 'head-editor', books: [BOOK] },
  'an admin': { role: 'admin', books: [] },
  'a head editor of another book': { role: 'head-editor', books: [OTHER] },
  'a plain editor': { role: 'editor', books: [] },
  'a guest': { role: 'viewer', books: [] },
};

/** The answer's status and body, for a session of this kind with no account row (or signed out). */
async function get(session, url) {
  const headers = {};
  if (session) {
    const { role, books } = SESSIONS[session];
    const token = createToken({
      id: `enginn-reikningur-${role}`,
      username: `${role}@skoli.example`,
      name: role,
      role,
      books,
    });
    headers.cookie = `auth_token=${token}`;
  }
  const res = await fetch(base + url, { headers });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: Express's own "Cannot GET" page, which is what an address with no route answers.
  }
  return { status: res.status, text, body };
}

const CHAPTER_ONE = `/api/sections/${BOOK}/1`;

describe("a chapter's sections, for a section picker", () => {
  it.each(['the head editor of the book', 'an admin'])(
    '%s gets exactly that chapter, in reading order',
    async (session) => {
      const r = await get(session, CHAPTER_ONE);
      expect(r.body?.sections?.map((s) => s.id)).toEqual([
        ids.intro,
        ids['1.1'],
        ids['1.2'],
        ids['1.10'],
      ]);
    }
  );

  it('answers 200', async () => {
    expect((await get('an admin', CHAPTER_ONE)).status).toBe(200);
  });

  it('gives each section its number and its status, which is what the picker shows', async () => {
    const r = await get('an admin', CHAPTER_ONE);
    expect(r.body?.sections?.find((s) => s.id === ids['1.2'])).toEqual({
      id: ids['1.2'],
      sectionNum: '1.2',
      status: 'localization_in_progress',
    });
  });

  it('names nobody and gives no file path', async () => {
    const r = await get('an admin', CHAPTER_ONE);
    expect(r.status).toBe(200);
    expect(PEOPLE_AND_PATHS.filter((value) => r.text.includes(value))).toEqual([]);
  });

  it('control: the section-by-id route does give those names and paths', async () => {
    const r = await get('an admin', `/api/sections/${ids['1.2']}`);
    expect(PEOPLE_AND_PATHS.filter((value) => r.text.includes(value))).toEqual(PEOPLE_AND_PATHS);
  });

  it('takes the appendices by their name', async () => {
    const r = await get('an admin', `/api/sections/${BOOK}/appendices`);
    expect(r.body?.sections?.map((s) => s.id)).toEqual([ids.appendix]);
  });

  it('answers a chapter that has no sections with an empty list, not an error', async () => {
    const r = await get('an admin', `/api/sections/${BOOK}/3`);
    expect([r.status, r.body]).toEqual([200, { sections: [] }]);
  });
});

describe('who may read it', () => {
  it.each(['a head editor of another book', 'a plain editor', 'a guest'])(
    '%s is refused',
    async (session) => {
      expect((await get(session, CHAPTER_ONE)).status).toBe(403);
    }
  );

  it('a signed-out request is refused', async () => {
    expect((await get(null, CHAPTER_ONE)).status).toBe(401);
  });
});

describe('what it refuses to look up', () => {
  // An address with no route also answers 404, so these two ask for the handler's own JSON answer.
  it('a book that is not registered', async () => {
    const r = await get('an admin', '/api/sections/ekki-til-bok/1');
    expect([r.status, r.body && r.body.error]).toEqual([404, 'Book not found']);
  });

  it('a chapter that is not a number', async () => {
    const r = await get('an admin', `/api/sections/${BOOK}/fyrsti`);
    expect([r.status, r.body && r.body.error]).toEqual([400, 'Invalid chapter']);
  });
});

describe('the route beside it', () => {
  it('control: a section is still read by its id', async () => {
    const r = await get('an admin', `/api/sections/${ids['1.1']}`);
    expect([r.status, r.body && r.body.id]).toEqual([200, ids['1.1']]);
  });
});
