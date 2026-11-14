/**
 * What a guest reads without the names of the people who did the work ([USER] 2026-11-14, answers 6 and 7).
 *
 * A sign-in that matches no account is a visit: a `viewer` session (CLAUDE.md § Auth), so anyone in the school
 * tenant, students included. Two reads that ask only for a sign-in carried people with their content:
 *
 *   the glossary (GET /api/terminology, /lookup, /export, /:id): who proposed and who approved each
 *   translation, by name and account id, and every discussion comment with its author;
 *   the pipeline status (GET /api/pipeline-status/:book/:chapter): who completed a stage and who holds the
 *   chapter's lock, which are e-mail addresses.
 *
 * A guest still reads the glossary and the stages. The people and the discussions are left out for anyone
 * below the editor role.
 *
 * The check is by VALUE: every person planted here has a name and an id found nowhere else, and a guest's
 * answer must contain none of them, in any field. The control is the same request as an editor, which must
 * contain them, so a test that planted nothing cannot pass.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: the DB path and JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'guest-reads-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const express = require('express');
const cookieParser = require('cookie-parser');

const HEADWORD = 'vardordsentinel';
const ICELANDIC = 'varðorðsþýðing';

// The people. Every string here is planted once and exists nowhere else in the database.
const GLOSSARY_PEOPLE = [
  'Tillögumaður-Sentinel',
  'id-tillaga-7781',
  'Samþykkjandi-Sentinel',
  'id-samthykkt-7782',
  'Umræðumaður-Sentinel',
  'id-umraeda-7783',
  'athugasemd-sentinel-7784',
  'tillaga-í-umræðu-7785',
];
const PIPELINE_PEOPLE = [
  'lauk.stigi.sentinel@skoli.example',
  'laesir.sentinel@skoli.example',
  'id-ferill-7786',
  'ferill.sentinel@skoli.example',
  'smaatridi-sentinel-7787',
];

let server;
let base;
let createToken;
let headwordId;
let BOOK;

beforeAll(async () => {
  require('../services/migrationRunner').runAllMigrations();
  ({ createToken } = require('../services/auth'));
  const { VALID_BOOKS } = require('../config');
  if (!VALID_BOOKS.length) VALID_BOOKS.push('efnafraedi-2e');
  BOOK = VALID_BOOKS[0];

  const terminology = require('../services/terminologyService');
  const term = terminology.createTerm(
    { english: HEADWORD, icelandic: ICELANDIC, subjects: ['chemistry'] },
    'id-tillaga-7781',
    'Tillögumaður-Sentinel'
  );
  headwordId = term.id;
  terminology.approveTranslation(
    term.translations[0].id,
    'id-samthykkt-7782',
    'Samþykkjandi-Sentinel'
  );
  terminology.addDiscussion(
    headwordId,
    'athugasemd-sentinel-7784',
    'id-umraeda-7783',
    'Umræðumaður-Sentinel',
    'tillaga-í-umræðu-7785'
  );

  // The pipeline rows are planted in the tables the read draws on, so no stage transition runs here.
  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  db.prepare(
    `INSERT INTO chapter_pipeline_status (book_slug, chapter_num, stage, status, completed_at, completed_by)
     VALUES (?, 1, 'extraction', 'complete', datetime('now'), ?)`
  ).run(BOOK, 'lauk.stigi.sentinel@skoli.example');
  db.prepare(
    `INSERT INTO chapter_locks (chapter_id, locked_by, expires_at)
     VALUES (?, ?, datetime('now', '+1 hour'))`
  ).run(BOOK + '-01', 'laesir.sentinel@skoli.example');
  db.prepare(
    `INSERT INTO chapter_generation_log (book_slug, chapter_num, action, user_id, username, details)
     VALUES (?, 1, 'generate', ?, ?, ?)`
  ).run(
    BOOK,
    'id-ferill-7786',
    'ferill.sentinel@skoli.example',
    JSON.stringify({ by: 'smaatridi-sentinel-7787' })
  );
  db.close();

  const app = express();
  app.use(cookieParser());
  app.use('/api/terminology', require('../routes/terminology'));
  app.use('/api/pipeline-status', require('../routes/pipeline-status'));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(work, { recursive: true, force: true });
});

/** The answer's status and its whole body as text, for a session of this role with no account row. */
async function read(role, url) {
  const token = createToken({
    id: `enginn-reikningur-${role}`,
    username: `${role}@skoli.example`,
    name: role,
    role,
    books: role === 'head-editor' ? [BOOK] : [],
  });
  const res = await fetch(base + url, { headers: { cookie: `auth_token=${token}` } });
  return { status: res.status, text: await res.text() };
}

const found = (text, people) => people.filter((p) => text.includes(p));

const glossaryReads = () => [
  ['the search', `/api/terminology?q=${HEADWORD}`],
  ['the lookup', `/api/terminology/lookup?q=${HEADWORD}`],
  ['the JSON export', `/api/terminology/export?q=${HEADWORD}`],
  ['the CSV export', `/api/terminology/export?format=csv&q=${HEADWORD}`],
  ['one headword', `/api/terminology/${headwordId}`],
];

describe('the glossary, for a guest', () => {
  it.each(['the search', 'the lookup', 'the JSON export', 'the CSV export', 'one headword'])(
    '%s gives the term and names nobody',
    async (label) => {
      const url = glossaryReads().find(([l]) => l === label)[1];
      const r = await read('viewer', url);
      expect(r.status).toBe(200);
      // The guest still reads the glossary: the headword and its translation are in the answer.
      expect(r.text).toContain(HEADWORD);
      expect(r.text).toContain(ICELANDIC);
      expect(found(r.text, GLOSSARY_PEOPLE)).toEqual([]);
    }
  );

  it('the statistics name nobody', async () => {
    const r = await read('viewer', '/api/terminology/stats');
    expect(r.status).toBe(200);
    expect(found(r.text, GLOSSARY_PEOPLE)).toEqual([]);
  });

  it('one headword says that its discussion is withheld, so the page need not call it empty', async () => {
    const r = await read('viewer', `/api/terminology/${headwordId}`);
    const body = JSON.parse(r.text);
    expect(body.term.discussionsWithheld).toBe(true);
    expect(body.term.discussions).toBeUndefined();
  });

  it('control: an editor reads every one of them on the headword', async () => {
    const r = await read('editor', `/api/terminology/${headwordId}`);
    expect(r.status).toBe(200);
    expect(found(r.text, GLOSSARY_PEOPLE)).toEqual(GLOSSARY_PEOPLE);
    expect(JSON.parse(r.text).term.discussionsWithheld).toBeUndefined();
  });

  it('control: an editor reads who proposed and approved in the search and the export', async () => {
    for (const url of [`/api/terminology?q=${HEADWORD}`, `/api/terminology/export?q=${HEADWORD}`]) {
      const r = await read('editor', url);
      expect(found(r.text, ['Tillögumaður-Sentinel', 'Samþykkjandi-Sentinel'])).toEqual([
        'Tillögumaður-Sentinel',
        'Samþykkjandi-Sentinel',
      ]);
    }
  });
});

describe('the pipeline status, for a guest', () => {
  it('gives the stages and the lock, and names nobody', async () => {
    const r = await read('viewer', `/api/pipeline-status/${BOOK}/1`);
    expect(r.status).toBe(200);
    const body = JSON.parse(r.text);
    // The guest still reads what state the chapter is in.
    expect(body.history.some((h) => h.stage === 'extraction' && h.status === 'complete')).toBe(
      true
    );
    expect(body.lock && typeof body.lock.expiresAt).toBe('string');
    expect(found(r.text, PIPELINE_PEOPLE)).toEqual([]);
  });

  it('control: an editor reads who completed the stage, who holds the lock and the log', async () => {
    const r = await read('editor', `/api/pipeline-status/${BOOK}/1`);
    expect(r.status).toBe(200);
    expect(found(r.text, PIPELINE_PEOPLE)).toEqual(PIPELINE_PEOPLE);
  });
});
