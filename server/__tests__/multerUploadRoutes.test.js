/**
 * A REAL multipart upload through both multer configurations (#557's follow-up, 2026-10-24).
 *
 * Why it exists. CI validates a dependency bump only if CI runs the code that uses it
 * (CLAUDE.md § Tech Stack, the npm advisories rules). The unit route tests call a route's LAST
 * handler directly, which skips multer. The only multipart traffic in CI that reached an upload
 * route was the e2e suite's term CSV import (memory storage: a valid file, a header-only one, one
 * with incomplete rows, and an editor refused). Nothing sent a file to chapter import (disk
 * storage), and nothing reached a size, count or field limit, a file-filter refusal, multer's
 * clean-up, or the error handler's multer branches. #557 moved multer 2.4.0 → 2.5.0 for a high
 * advisory with only that to go on (and a one-off probe of 2.5.0).
 *
 * Here every upload case sends real multipart bytes over a real socket through the route's whole
 * chain (router.param, auth, role guard, multer, handler) and the app's real error handler.
 *
 * The two configurations:
 *   routes/books.js        POST /api/books/:bookId/chapters/:chapter/import
 *                          disk storage in pipeline-output/uploads, .md only, 10 MiB a file,
 *                          at most 50 files, field "files"
 *   routes/terminology.js  POST /api/terminology/import/{csv,excel,glossary}
 *                          memory storage, .csv/.xlsx/.xls, 5 MiB, one file, field "file"
 *
 * What reaches a handler is compared as a value: stored bytes with Buffer.equals for disk storage,
 * and for memory storage a stored value that losing a byte, or gaining one that is not whitespace,
 * would change (a 5 MiB field stored whole, a last character two bytes long with no newline after
 * it). The CSV cases pin memory storage; the three term routes share its one multer instance.
 *
 * Every refusal has a control that the same rule, removed, would have let through: the size
 * refusals sit beside an upload of exactly the limit, the 51-file refusal beside exactly 50, and
 * each refused file type carries content the handler would otherwise accept. Without them a
 * refusal could be a payload that never parsed.
 *
 * Personas come from the real sign-in code: determineUserRole() on a Microsoft profile, then
 * createToken(), as authenticate() does. A profile with no account row is a visit (SD2, #557).
 *
 * Each 413 is pinned with its route's own limit in the message (middleware/upload.js carries it
 * on the error), and a fileFilter refusal as a 400 labelled 'Invalid Upload' (the label
 * multer's own 400s get) carrying the filter's own message.
 */
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  existsSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Env BEFORE any server require: resolveDbPath() and the auth config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'multer-upload-routes-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.ADMIN_USERS = '';
delete process.env.AUTO_CREATE_USERS; // unset: a sign-in with no account row is a visit

const MiB = 1024 * 1024;
const BOOKS_LIMIT = 10 * MiB; // routes/books.js, createUpload's fileSize
const TERMS_LIMIT = 5 * MiB; // routes/terminology.js, createUpload's fileSize

// A slug no real book uses (gitignored, like books/testbook/). The import creates its tree;
// every books case starts without it.
const FIXTURE = 'c557-multer-fixture';
const fixtureRoot = path.join(__dirname, '..', '..', 'books', FIXTURE);
const chapterDir = path.join(fixtureRoot, '02-for-mt', 'ch01');
const uploadsDir = path.join(__dirname, '..', '..', 'pipeline-output', 'uploads');

// Every byte value, between two lines of Icelandic with CRLF endings: what a sloppy
// multipart parser would mangle (a lone CR or LF, a NUL, high bytes, multibyte UTF-8).
const ALL_BYTES = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
const ICELANDIC_CRLF = Buffer.from('# Þrýstingur og rúmmál\r\n\r\nGasið þenst út.\r\n', 'utf8');
const SMALL_MD = Buffer.from('Inngangur\r\n', 'utf8');

/** n bytes with no short period, so a byte lost, gained, moved or flipped changes the value. */
function patterned(n) {
  const b = Buffer.allocUnsafe(n);
  let x = 0x2545f491;
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    b[i] = x >>> 24;
  }
  return b;
}

let db;
let auth;
let userService;
let server;
let base;
const personas = {};
const fsCjs = require('fs'); // the module object books.js calls renameSync on

const profile = (n) => ({
  id: `ms-oid-c557-${n}`,
  displayName: `Prófari ${n}`,
  mail: `c557-${n}@skoli.example`,
});

/** A session token minted as authenticate() mints one, with the role determineUserRole() gives. */
function signIn(msUser) {
  const roleInfo = auth.determineUserRole(msUser);
  const email = msUser.mail;
  const token = auth.createToken({
    id: msUser.id,
    username: email,
    name: msUser.displayName || email,
    avatar: null,
    role: roleInfo.role,
    books: roleInfo.books,
  });
  return { roleInfo, token };
}

/** An account row, as the admin page creates one, optionally head editor of one book. */
function member(n, role, headEditorOf) {
  const p = profile(n);
  const row = userService.createUser({
    providerId: p.id,
    providerUsername: p.mail,
    email: p.mail,
    role,
  });
  if (headEditorOf) userService.assignBookAccess(row.id, headEditorOf, 'head-editor');
  return p;
}

beforeAll(async () => {
  rmSync(fixtureRoot, { recursive: true, force: true });
  require('../services/migrationRunner').runAllMigrations();
  const Database = require('better-sqlite3');
  db = new Database(process.env.SESSIONS_DB_PATH);
  auth = require('../services/auth');
  userService = require('../services/userService');

  // books.js refuses any :bookId outside VALID_BOOKS. Register the fixture as the admin page
  // does (a registered_books row), then refresh the list from it, as index.js does at boot.
  const catalogue = db
    .prepare('INSERT INTO openstax_catalogue (slug, title) VALUES (?, ?)')
    .run(`${FIXTURE}-cat`, 'Multer fixture book');
  db.prepare(
    `INSERT INTO registered_books (catalogue_id, slug, title_is, registered_by, status)
     VALUES (?, ?, ?, 'u-test', 'active')`
  ).run(catalogue.lastInsertRowid, FIXTURE, 'Prófbók fyrir upphal');
  require('../config').refreshValidBooks(db);

  personas.headEditor = signIn(member('he', 'head-editor', FIXTURE));
  personas.otherBook = signIn(member('other', 'head-editor', 'some-other-book'));
  personas.editor = signIn(member('ed', 'editor'));
  personas.visitor = signIn(profile('visitor')); // no row
  personas.nobody = { token: null };

  // index.js's body-handling chain, the two routers, and its real error handler. (index.js
  // itself cannot be required: it starts the server.)
  const express = require('express');
  const cookieParser = require('cookie-parser');
  const { refuseCompressedBodies } = require('../middleware/refuseCompressedBodies');
  const { errorHandler } = require('../middleware/errorHandler');
  const app = express();
  app.use(cookieParser());
  app.use(refuseCompressedBodies);
  app.use(express.json({ limit: '1mb', inflate: false }));
  app.use(express.urlencoded({ extended: true, limit: '1mb', inflate: false }));
  app.use('/api/terminology', require('../routes/terminology'));
  app.use('/api/books', require('../routes/books'));
  app.use(errorHandler);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  db?.close();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

/** POST a real multipart body: one part per file, all under one field name. */
async function upload(urlPath, { as, field, files }) {
  const form = new FormData();
  for (const f of files) form.append(field, new File([f.bytes], f.name));
  const token = personas[as].token;
  const res = await fetch(base + urlPath, {
    method: 'POST',
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON; the status is the evidence
  }
  return { status: res.status, json };
}

const listing = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : []);
// Recursive, so a temp file inside a subdirectory of uploads/ is seen too.
const uploadsListing = () =>
  existsSync(uploadsDir) ? readdirSync(uploadsDir, { recursive: true }).sort() : [];

/** Names in pipeline-output/uploads now that were not in `before`: multer's leftovers. */
function addedSince(before) {
  const seen = new Set(before);
  return uploadsListing().filter((name) => !seen.has(name));
}

/** Remove what appeared in uploads/ since `before`, and nothing else. */
function removeAddedSince(before) {
  for (const name of addedSince(before)) {
    const p = path.join(uploadsDir, name);
    if (existsSync(p) && statSync(p).isFile()) unlinkSync(p);
  }
}

describe('the personas are what the cases below say they are', () => {
  it('two head editors (this book, another), an editor, and a visitor with no account row', () => {
    const summary = Object.fromEntries(
      ['headEditor', 'otherBook', 'editor', 'visitor'].map((k) => [
        k,
        {
          role: personas[k].roleInfo.role,
          books: personas[k].roleInfo.books,
          source: personas[k].roleInfo.source,
        },
      ])
    );
    expect(summary).toEqual({
      headEditor: { role: 'head-editor', books: [FIXTURE], source: 'database' },
      otherBook: { role: 'head-editor', books: ['some-other-book'], source: 'database' },
      editor: { role: 'editor', books: [], source: 'database' },
      visitor: { role: 'viewer', books: [], source: 'visitor' },
    });
  });

  it('the visit created no account row', () => {
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(3);
  });

  it('the fixture book is registered, so books.js lets its slug through', () => {
    expect(require('../config').VALID_BOOKS).toContain(FIXTURE);
  });
});

describe('POST /api/books/:bookId/chapters/:chapter/import: disk storage', () => {
  const importPath = `/api/books/${FIXTURE}/chapters/1/import`;
  let before;
  beforeEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
    before = uploadsListing();
  });
  // Runs whatever a case asserted, so a red run does not pile up temp files in uploads/.
  afterEach(() => removeAddedSince(before));

  it('stores each file byte for byte under its .en.md name, and leaves no temp file', async () => {
    const first = Buffer.concat([ICELANDIC_CRLF, ALL_BYTES, ICELANDIC_CRLF]);
    const second = Buffer.from('Inngangur\r\n--\r\nÞ\r\n', 'utf8');
    // The positive control for every "nothing kept" check in this file: multer's temp files
    // are moved out of exactly the directory those checks list. If the disk destination moved,
    // this fails instead of leaving the checks looking at an empty place.
    const moves = vi.spyOn(fsCjs, 'renameSync');
    let res;
    let tempDirs;
    try {
      res = await upload(importPath, {
        as: 'headEditor',
        field: 'files',
        files: [
          { name: '1-1.en.md', bytes: first },
          { name: 'intro.md', bytes: second },
        ],
      });
      // Read before mockRestore(), which also clears the recorded calls.
      tempDirs = moves.mock.calls.map(([from]) => path.dirname(from));
    } finally {
      moves.mockRestore();
    }
    expect([res.status, res.json?.imported, listing(chapterDir)]).toEqual([
      200,
      2,
      ['1-1.en.md', 'intro.en.md'],
    ]);
    expect(tempDirs).toEqual([uploadsDir, uploadsDir]);
    expect(readFileSync(path.join(chapterDir, '1-1.en.md')).equals(first)).toBe(true);
    expect(readFileSync(path.join(chapterDir, 'intro.en.md')).equals(second)).toBe(true);
    expect(addedSince(before)).toEqual([]);
  });

  it('accepts a file of exactly 10 MiB, byte for byte', async () => {
    const bytes = patterned(BOOKS_LIMIT);
    const res = await upload(importPath, {
      as: 'headEditor',
      field: 'files',
      files: [{ name: '1-1.en.md', bytes }],
    });
    expect([res.status, res.json?.imported, addedSince(before)]).toEqual([200, 1, []]);
    expect(readFileSync(path.join(chapterDir, '1-1.en.md')).equals(bytes)).toBe(true);
  });

  it('refuses a file one byte over 10 MiB with 413, and keeps no part of it', async () => {
    const res = await upload(importPath, {
      as: 'headEditor',
      field: 'files',
      files: [{ name: '1-1.en.md', bytes: patterned(BOOKS_LIMIT + 1) }],
    });
    expect([res.status, res.json, listing(chapterDir), addedSince(before)]).toEqual([
      413,
      { error: 'File Too Large', message: 'Uploaded file exceeds the size limit (10 MB)' },
      [],
      [],
    ]);
  });

  const manyFiles = (n) =>
    Array.from({ length: n }, (_, i) => ({
      name: `1-${i + 1}.en.md`,
      bytes: Buffer.from(`Hluti ${i + 1}: ${'þ'.repeat(i)}\r\n`, 'utf8'),
    }));

  it('accepts exactly 50 files, each stored whole under its own name', async () => {
    const files = manyFiles(50);
    const res = await upload(importPath, { as: 'headEditor', field: 'files', files });
    const stored = Object.fromEntries(
      listing(chapterDir).map((name) => [name, readFileSync(path.join(chapterDir, name))])
    );
    const sent = Object.fromEntries(files.map((f) => [f.name, f.bytes]));
    expect([res.status, res.json?.imported, addedSince(before)]).toEqual([200, 50, []]);
    expect(stored).toEqual(sent);
  });

  it('refuses 51 files with 400, and removes the temp files it had already written', async () => {
    const res = await upload(importPath, {
      as: 'headEditor',
      field: 'files',
      files: manyFiles(51),
    });
    expect([res.status, res.json?.error, listing(chapterDir), addedSince(before)]).toEqual([
      400,
      'Invalid Upload',
      [],
      [],
    ]);
  });

  it('refuses a file sent under any field name but "files" with 400', async () => {
    const res = await upload(importPath, {
      as: 'headEditor',
      field: 'file',
      files: [{ name: '1-1.en.md', bytes: SMALL_MD }],
    });
    expect([res.status, res.json?.error, listing(chapterDir), addedSince(before)]).toEqual([
      400,
      'Invalid Upload',
      [],
      [],
    ]);
  });

  it('refuses a batch holding a non-.md file, and removes the .md one written before it', async () => {
    const res = await upload(importPath, {
      as: 'headEditor',
      field: 'files',
      files: [
        { name: '1-1.en.md', bytes: SMALL_MD },
        { name: 'notes.txt', bytes: SMALL_MD },
      ],
    });
    expect([res.status, res.json, listing(chapterDir), addedSince(before)]).toEqual([
      400,
      { error: 'Invalid Upload', message: 'Only .md files are allowed' },
      [],
      [],
    ]);
  });

  // Each guard runs before multer, so a refused request never touches the disk. Were multer
  // first, it would write the temp file and the guard's refusal would strand it in uploads/.
  for (const [as, status] of [
    ['nobody', 401],
    ['visitor', 403],
    ['editor', 403],
    ['otherBook', 403],
  ]) {
    it(`refuses ${as} with ${status} before multer writes anything`, async () => {
      const res = await upload(importPath, {
        as,
        field: 'files',
        files: [{ name: '1-1.en.md', bytes: SMALL_MD }],
      });
      expect([res.status, listing(chapterDir), addedSince(before)]).toEqual([status, [], []]);
    });
  }

  it('refuses a book that is not registered with 400 before multer writes anything', async () => {
    const res = await upload('/api/books/c557-not-registered/chapters/1/import', {
      as: 'headEditor',
      field: 'files',
      files: [{ name: '1-1.en.md', bytes: SMALL_MD }],
    });
    expect([res.status, res.json?.error, addedSince(before)]).toEqual([400, 'Ógild bók', []]);
  });
});

describe('POST /api/terminology/import/*: memory storage', () => {
  /** Translations of every headword starting with `prefix`, as the importer stored them. */
  const stored = (prefix) =>
    db
      .prepare(
        `SELECT h.english, t.icelandic, t.source
           FROM terminology_translations t
           JOIN terminology_headwords h ON h.id = t.headword_id
          WHERE h.english LIKE ? ORDER BY h.english`
      )
      .all(`${prefix}%`);

  const csv = (rows) => Buffer.from(`english,icelandic\r\n${rows.join('\r\n')}\r\n`, 'utf8');

  /** A one-row CSV of exactly `size` bytes, padded in definition_en, which the importer stores. */
  function csvOfSize(english, size) {
    const head = `english,icelandic,definition_en\r\n${english},stór,`;
    const tail = '\r\n';
    const pad = 'x'.repeat(size - Buffer.byteLength(head, 'utf8') - tail.length);
    return { bytes: Buffer.from(head + pad + tail, 'utf8'), pad };
  }

  it('imports a CSV upload, and the Icelandic arrives exactly, last byte included', async () => {
    // No newline at the end, and the last character (ð) is two bytes: a buffer that lost its
    // last byte would store a different value, which a parser would not otherwise notice.
    const bytes = Buffer.from(
      'english,icelandic\r\nc557 csv pressure,þrýstingur\r\nc557 csv reaction,hvarfið',
      'utf8'
    );
    const res = await upload('/api/terminology/import/csv', {
      as: 'headEditor',
      field: 'file',
      files: [{ name: 'terms.csv', bytes }],
    });
    expect([res.status, res.json?.added]).toEqual([200, 2]);
    expect(stored('c557 csv ')).toEqual([
      { english: 'c557 csv pressure', icelandic: 'þrýstingur', source: 'imported-csv' },
      { english: 'c557 csv reaction', icelandic: 'hvarfið', source: 'imported-csv' },
    ]);
  });

  it('imports an .xlsx upload: a binary file parses', async () => {
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['English', 'Icelandic'],
        ['c557 xlsx enthalpy', 'vermi'],
        ['c557 xlsx entropy', 'óreiða'],
      ]),
      'Terms'
    );
    const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const res = await upload('/api/terminology/import/excel', {
      as: 'headEditor',
      field: 'file',
      files: [{ name: 'terms.xlsx', bytes }],
    });
    expect([res.status, res.json?.added]).toEqual([200, 2]);
    expect(stored('c557 xlsx ')).toEqual([
      { english: 'c557 xlsx enthalpy', icelandic: 'vermi', source: 'imported-excel' },
      { english: 'c557 xlsx entropy', icelandic: 'óreiða', source: 'imported-excel' },
    ]);
  });

  it('imports a glossary upload through the same multer instance', async () => {
    const res = await upload(`/api/terminology/import/glossary?bookSlug=${FIXTURE}`, {
      as: 'headEditor',
      field: 'file',
      files: [{ name: 'glossary.csv', bytes: csv(['c557 glossary catalyst,hvati']) }],
    });
    expect([res.status, res.json?.added, stored('c557 glossary ')]).toEqual([
      200,
      1,
      [{ english: 'c557 glossary catalyst', icelandic: 'hvati', source: 'openstax-glossary' }],
    ]);
  });

  it('accepts a CSV of exactly 5 MiB, and stores its 5 MiB field whole', async () => {
    const { bytes, pad } = csvOfSize('c557 at limit', TERMS_LIMIT);
    const res = await upload('/api/terminology/import/csv', {
      as: 'headEditor',
      field: 'file',
      files: [{ name: 'big.csv', bytes }],
    });
    const row = db
      .prepare('SELECT definition_en FROM terminology_headwords WHERE english = ?')
      .get('c557 at limit');
    expect([res.status, res.json?.added]).toEqual([200, 1]);
    expect(row?.definition_en === pad).toBe(true);
  });

  it('refuses a CSV one byte over 5 MiB with 413, and imports nothing from it', async () => {
    const res = await upload('/api/terminology/import/csv', {
      as: 'headEditor',
      field: 'file',
      files: [{ name: 'big.csv', bytes: csvOfSize('c557 over limit', TERMS_LIMIT + 1).bytes }],
    });
    expect([res.status, res.json, stored('c557 over limit')]).toEqual([
      413,
      { error: 'File Too Large', message: 'Uploaded file exceeds the size limit (5 MB)' },
      [],
    ]);
  });

  it('refuses a .txt upload that holds a valid CSV, and imports nothing from it', async () => {
    const res = await upload('/api/terminology/import/csv', {
      as: 'headEditor',
      field: 'file',
      files: [{ name: 'terms.txt', bytes: csv(['c557 txt term,orð']) }],
    });
    expect([res.status, res.json, stored('c557 txt ')]).toEqual([
      400,
      { error: 'Invalid Upload', message: 'Only CSV and Excel files are allowed' },
      [],
    ]);
  });

  it('refuses a second file with 400, and imports neither', async () => {
    const res = await upload('/api/terminology/import/csv', {
      as: 'headEditor',
      field: 'file',
      files: [
        { name: 'a.csv', bytes: csv(['c557 two a,einn']) },
        { name: 'b.csv', bytes: csv(['c557 two b,tveir']) },
      ],
    });
    expect([res.status, res.json?.error, stored('c557 two ')]).toEqual([400, 'Invalid Upload', []]);
  });

  it('refuses a file sent under any field name but "file" with 400', async () => {
    const res = await upload('/api/terminology/import/csv', {
      as: 'headEditor',
      field: 'files',
      files: [{ name: 'terms.csv', bytes: csv(['c557 field term,orð']) }],
    });
    expect([res.status, res.json?.error, stored('c557 field ')]).toEqual([
      400,
      'Invalid Upload',
      [],
    ]);
  });

  // The guard refuses what the head editor's identical upload would import.
  for (const [as, status] of [
    ['nobody', 401],
    ['visitor', 403],
    ['editor', 403],
  ]) {
    it(`refuses ${as} with ${status}, and imports nothing`, async () => {
      const res = await upload('/api/terminology/import/csv', {
        as,
        field: 'file',
        files: [{ name: 'terms.csv', bytes: csv([`c557 auth ${as},orð`]) }],
      });
      expect([res.status, stored(`c557 auth ${as}`)]).toEqual([status, []]);
    });
  }

  // Guard ORDER, which memory storage cannot show on disk. The upload is one multer itself
  // refuses (the wrong field name), so were multer before the guard the answer would be its
  // 400; the guard's 401 or 403 means the guard ran first.
  for (const route of ['csv', 'excel', 'glossary']) {
    for (const [as, status] of [
      ['nobody', 401],
      ['visitor', 403],
      ['editor', 403],
    ]) {
      it(`/import/${route}: refuses ${as} with ${status} before multer reads the body`, async () => {
        const res = await upload(`/api/terminology/import/${route}?bookSlug=${FIXTURE}`, {
          as,
          field: 'files',
          files: [{ name: 'terms.csv', bytes: csv([`c557 order ${route} ${as},orð`]) }],
        });
        expect([res.status, stored(`c557 order ${route}`)]).toEqual([status, []]);
      });
    }
  }
});
