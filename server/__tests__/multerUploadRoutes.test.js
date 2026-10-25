/**
 * A REAL multipart upload through the term import routes' multer configuration (#557's
 * follow-up, 2026-10-24).
 *
 * Why it exists. CI validates a dependency bump only if CI runs the code that uses it
 * (CLAUDE.md § Tech Stack, the npm advisories rules). The unit route tests call a route's LAST
 * handler directly, which skips multer. The only multipart traffic in CI that reached an upload
 * route was the e2e suite's term CSV import (a valid file, a header-only one, one with
 * incomplete rows, and an editor refused). Nothing reached a size, count or field limit, a
 * file-filter refusal, or the error handler's multer branches. #557 moved multer 2.4.0 → 2.5.0
 * for a high advisory with only that to go on (and a one-off probe of 2.5.0).
 *
 * Here every upload case sends real multipart bytes over a real socket through the route's whole
 * chain (auth, role guard, multer, handler) and the app's real error handler.
 *
 * The configuration: routes/terminology.js, POST /api/terminology/import/{csv,excel,glossary},
 * memory storage, .csv/.xlsx/.xls, 5 MiB, one file, field "file". It is the server's only multer
 * configuration since 2026-10-25, when chapter import (disk storage, books.js) was retired with
 * the chapter file registry.
 *
 * What reaches a handler is compared as a value: a stored value that losing a byte, or gaining
 * one that is not whitespace, would change (a 5 MiB field stored whole, a last character two
 * bytes long with no newline after it). The CSV cases pin memory storage; the three term routes
 * share its one multer instance.
 *
 * Every refusal has a control that the same rule, removed, would have let through: the size
 * refusal sits beside an upload of exactly the limit, and the refused file type carries content
 * the handler would otherwise accept. Without them a refusal could be a payload that never parsed.
 *
 * Personas come from the real sign-in code: determineUserRole() on a Microsoft profile, then
 * createToken(), as authenticate() does. A profile with no account row is a visit (SD2, #557).
 *
 * The 413 is pinned with the route's own limit in the message (middleware/upload.js carries it
 * on the error), and a fileFilter refusal as a 400 labelled 'Invalid Upload' (the label
 * multer's own 400s get) carrying the filter's own message.
 */
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath() and the auth config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'multer-upload-routes-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.ADMIN_USERS = '';
delete process.env.AUTO_CREATE_USERS; // unset: a sign-in with no account row is a visit

const MiB = 1024 * 1024;
const TERMS_LIMIT = 5 * MiB; // routes/terminology.js, createUpload's fileSize

// A slug no real book uses, registered in the test's own database so the head editor's book is
// a real one. Nothing here writes under books/.
const FIXTURE = 'c557-multer-fixture';
const FIXTURE_SUBJECT = 'chemistry';

let db;
let auth;
let userService;
let server;
let base;
const personas = {};
const fsCjs = require('fs'); // the module object terminology.js calls mkdtempSync on

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
  require('../services/migrationRunner').runAllMigrations();
  const Database = require('better-sqlite3');
  db = new Database(process.env.SESSIONS_DB_PATH);
  auth = require('../services/auth');
  userService = require('../services/userService');

  // Register the fixture as the admin page does (a registered_books row), so the head editor's
  // book is a real one, then refresh the list from it, as index.js does at boot.
  const catalogue = db
    .prepare('INSERT INTO openstax_catalogue (slug, title) VALUES (?, ?)')
    .run(`${FIXTURE}-cat`, 'Multer fixture book');
  const book = db
    .prepare(
      `INSERT INTO registered_books (catalogue_id, slug, title_is, registered_by, status)
       VALUES (?, ?, ?, 'u-test', 'active')`
    )
    .run(catalogue.lastInsertRowid, FIXTURE, 'Prófbók fyrir upphal');
  // Its subject, as the admin page maps a registered book: what an import under it is tagged.
  db.prepare('INSERT INTO book_subject_mapping (book_id, primary_subject) VALUES (?, ?)').run(
    book.lastInsertRowid,
    FIXTURE_SUBJECT
  );
  require('../config').refreshValidBooks(db);

  personas.headEditor = signIn(member('he', 'head-editor', FIXTURE));
  personas.editor = signIn(member('ed', 'editor'));
  personas.visitor = signIn(profile('visitor')); // no row
  personas.nobody = { token: null };

  // index.js's body-handling chain, the terminology router, and its real error handler. (index.js
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
  app.use(errorHandler);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  db?.close();
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

describe('the personas are what the cases below say they are', () => {
  it('a head editor, an editor, and a visitor with no account row', () => {
    const summary = Object.fromEntries(
      ['headEditor', 'editor', 'visitor'].map((k) => [
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
      editor: { role: 'editor', books: [], source: 'database' },
      visitor: { role: 'viewer', books: [], source: 'visitor' },
    });
  });

  it('the visit created no account row', () => {
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(2);
  });

  it("the fixture book is registered, as a head editor's book is", () => {
    expect(require('../config').VALID_BOOKS).toContain(FIXTURE);
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

  // The CSV route hands the importer a file, not the upload's buffer, so it writes one. Both
  // places a temp file could land are watched: the old code wrote to /tmp by name. A spy on
  // mkdtempSync records the directory the route made, so the case can show it watched the place
  // the route wrote, rather than a name the route has stopped using.
  const TEMP_DIRS = [...new Set(['/tmp', tmpdir()])];
  const csvTempFiles = () =>
    TEMP_DIRS.flatMap((dir) =>
      readdirSync(dir)
        .filter((name) => name.startsWith('terminology-import-'))
        .map((name) => path.join(dir, name))
    ).sort();

  /** Upload one CSV; report the response, the directories the route made, and what was left. */
  async function importCsvWatchingTemp(name, bytes) {
    const before = csvTempFiles();
    const made = vi.spyOn(fsCjs, 'mkdtempSync');
    try {
      const res = await upload('/api/terminology/import/csv', {
        as: 'headEditor',
        field: 'file',
        files: [{ name, bytes }],
      });
      const dirs = made.mock.results.map((r) => r.value);
      const left = csvTempFiles().filter((f) => !before.includes(f));
      for (const f of left) rmSync(f, { recursive: true, force: true }); // red or green
      return {
        res,
        // Where each directory the route made sits, and whether it outlived the response.
        made: dirs.map((d) => ({
          inWatchedDir: TEMP_DIRS.includes(path.dirname(d)),
          existsAfter: existsSync(d),
        })),
        left,
      };
    } finally {
      made.mockRestore();
    }
  }

  // A file the parser cannot read is the uploader's to fix: a 400 that says what the parser said
  // (it was a 500 until 2026-10-25, whose reason the page could not show). Each kind of fault the
  // parser names is here, one of them under a code without the CSV_ prefix, so a check on the
  // prefix rather than the parser's error class would miss it. The parser throws inside the
  // importer, after the temp file is written, so each case also watches the temp file.
  for (const [fault, text, says] of [
    ['an unclosed quote', 'english,icelandic\r\n"c21d quote,orð', 'Quote Not Closed'],
    [
      'a row with a third field',
      'english,icelandic\r\nc21d fields,orð,auka\r\n',
      'Invalid Record Length',
    ],
    [
      'a quote inside a field',
      'english,icelandic\r\nc21d mid"quote,orð\r\n',
      'Invalid Opening Quote',
    ],
  ]) {
    it(`refuses a CSV with ${fault} with 400 saying why, and leaves no temp file`, async () => {
      const { res, made, left } = await importCsvWatchingTemp('bad.csv', Buffer.from(text, 'utf8'));
      expect([res.status, res.json?.error, made, left, stored('c21d ')]).toEqual([
        400,
        'Invalid CSV',
        [{ inWatchedDir: true, existsAfter: false }],
        [],
        [],
      ]);
      expect(res.json?.message).toMatch(new RegExp(`^The file could not be read as CSV: ${says}`));
    });
  }

  it('answers 500 when the import fails for a reason that is not the file, and leaves no temp file', async () => {
    const terminologyService = require('../services/terminologyService');
    // A real non-file failure carries a code (fs: ENOSPC; SQLite: SQLITE_BUSY), so the control
    // does too: a check on "has a code" instead of the parser's class would answer it 400.
    const failing = vi.spyOn(terminologyService, 'importFromCSV').mockImplementation(() => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    });
    try {
      const { res, made, left } = await importCsvWatchingTemp('ok.csv', csv(['c21d disk,orð']));
      expect([res.status, res.json?.error, made, left]).toEqual([
        500,
        'Failed to import CSV',
        [{ inWatchedDir: true, existsAfter: false }],
        [],
      ]);
    } finally {
      failing.mockRestore();
    }
  });

  it('refuses a glossary upload the parser cannot read with 400 saying why', async () => {
    const res = await upload(`/api/terminology/import/glossary?bookSlug=${FIXTURE}`, {
      as: 'headEditor',
      field: 'file',
      files: [
        {
          name: 'glossary.csv',
          bytes: Buffer.from('english,icelandic\r\n"c21d gloss,orð', 'utf8'),
        },
      ],
    });
    expect([res.status, res.json?.error, stored('c21d gloss')]).toEqual([400, 'Invalid CSV', []]);
    expect(res.json?.message).toMatch(/^The file could not be read as CSV: Quote Not Closed/);
  });

  it('answers 500 when the glossary import fails for a reason that is not the file', async () => {
    const terminologyService = require('../services/terminologyService');
    const failing = vi.spyOn(terminologyService, 'importGlossaryTerms').mockImplementation(() => {
      throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
    });
    try {
      const res = await upload(`/api/terminology/import/glossary?bookSlug=${FIXTURE}`, {
        as: 'headEditor',
        field: 'file',
        files: [{ name: 'glossary.csv', bytes: csv(['c21d gloss busy,orð']) }],
      });
      expect([res.status, res.json?.error, failing.mock.calls.length]).toEqual([
        500,
        'Failed to import glossary',
        1,
      ]);
    } finally {
      failing.mockRestore();
    }
  });

  it('leaves no temp file behind when the CSV import succeeds (the control)', async () => {
    const { res, made, left } = await importCsvWatchingTemp(
      'ok.csv',
      csv(['c557 tidy term,snyrtilegt'])
    );
    expect([res.status, res.json?.added, made, left]).toEqual([
      200,
      1,
      [{ inWatchedDir: true, existsAfter: false }],
      [],
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

/**
 * The import page sends the book it is importing for as `?bookSlug=` (its book picker). The
 * glossary route always read it; the CSV and Excel routes read only `subjects`, which the page
 * never sends, so every page import landed untagged whatever book was chosen (logged
 * 2026-10-24, fixed 2026-10-25). The book now gives the subject, a book that is not registered is
 * refused, and an explicit `subjects` list, which API callers send, still decides.
 */
describe('POST /api/terminology/import/*: the book the import page picks', () => {
  const subjectsOf = (english) =>
    db
      .prepare(
        `SELECT ts.subject FROM terminology_translation_subjects ts
           JOIN terminology_translations t ON t.id = ts.translation_id
           JOIN terminology_headwords h ON h.id = t.headword_id
          WHERE h.english = ? ORDER BY ts.subject`
      )
      .all(english)
      .map((r) => r.subject);
  const translationsOf = (english) =>
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM terminology_translations t
           JOIN terminology_headwords h ON h.id = t.headword_id WHERE h.english = ?`
      )
      .get(english).n;
  /** The metadata of the newest activity row of `type`, as the route logged it. */
  const lastImportLog = (type) =>
    JSON.parse(
      db
        .prepare('SELECT metadata FROM activity_log WHERE type = ? ORDER BY id DESC LIMIT 1')
        .get(type)?.metadata ?? 'null'
    );
  const oneCsv = (english) => [
    { name: 'terms.csv', bytes: Buffer.from(`english,icelandic\r\n${english},bókað\r\n`, 'utf8') },
  ];
  function oneXlsx(english) {
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['English', 'Icelandic'],
        [english, 'bókað'],
      ]),
      'Terms'
    );
    return [
      { name: 'terms.xlsx', bytes: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) },
    ];
  }

  it("a CSV imported under a book is tagged with that book's subject", async () => {
    const res = await upload(`/api/terminology/import/csv?bookSlug=${FIXTURE}`, {
      as: 'headEditor',
      field: 'file',
      files: oneCsv('c21d csv booked'),
    });
    expect([res.status, res.json?.added, subjectsOf('c21d csv booked')]).toEqual([
      200,
      1,
      [FIXTURE_SUBJECT],
    ]);
    expect(lastImportLog('import_terminology_csv')).toMatchObject({
      bookSlug: FIXTURE,
      subjects: [FIXTURE_SUBJECT],
      added: 1,
    });
  });

  it("an .xlsx imported under a book is tagged with that book's subject", async () => {
    const res = await upload(`/api/terminology/import/excel?bookSlug=${FIXTURE}`, {
      as: 'headEditor',
      field: 'file',
      files: oneXlsx('c21d xlsx booked'),
    });
    expect([res.status, res.json?.added, subjectsOf('c21d xlsx booked')]).toEqual([
      200,
      1,
      [FIXTURE_SUBJECT],
    ]);
    expect(lastImportLog('import_terminology_excel')).toMatchObject({
      bookSlug: FIXTURE,
      subjects: [FIXTURE_SUBJECT],
      added: 1,
    });
  });

  it('a CSV imported with no book stays untagged (the control)', async () => {
    const res = await upload('/api/terminology/import/csv', {
      as: 'headEditor',
      field: 'file',
      files: oneCsv('c21d csv unbooked'),
    });
    expect([res.status, res.json?.added, subjectsOf('c21d csv unbooked')]).toEqual([200, 1, []]);
  });

  it('an explicit subjects list still decides over the book', async () => {
    const res = await upload(`/api/terminology/import/csv?subjects=physics&bookSlug=${FIXTURE}`, {
      as: 'headEditor',
      field: 'file',
      files: oneCsv('c21d csv explicit'),
    });
    expect([res.status, subjectsOf('c21d csv explicit')]).toEqual([200, ['physics']]);
  });

  // A repeated key reaches the route as a list; a list is not the one comma-separated value the
  // route documents, so it is refused rather than dropped in favour of the book's subject.
  for (const route of ['csv', 'excel']) {
    it(`/import/${route}: refuses a repeated subjects key with 400, and imports nothing`, async () => {
      const english = `c21d ${route} repeated subjects`;
      const res = await upload(
        `/api/terminology/import/${route}?subjects=chemistry&subjects=physics&bookSlug=${FIXTURE}`,
        {
          as: 'headEditor',
          field: 'file',
          files: route === 'excel' ? oneXlsx(english) : oneCsv(english),
        }
      );
      expect([res.status, res.json?.error, translationsOf(english)]).toEqual([
        400,
        'Invalid subjects',
        0,
      ]);
    });
  }

  for (const route of ['csv', 'excel', 'glossary']) {
    it(`/import/${route}: refuses a book that is not registered, and imports nothing`, async () => {
      const english = `c21d ${route} unregistered`;
      const res = await upload(`/api/terminology/import/${route}?bookSlug=no-such-book`, {
        as: 'headEditor',
        field: 'file',
        files: route === 'excel' ? oneXlsx(english) : oneCsv(english),
      });
      expect([res.status, res.json?.error, translationsOf(english)]).toEqual([
        400,
        'Invalid book',
        0,
      ]);
    });
  }
});

/**
 * POST /api/terminology/import/existing-glossary builds a path from the body's bookSlug:
 * books/<bookSlug>/glossary/terminology-en-is.csv. It checked only that the file existed, so a
 * slug holding `..` reached any terminology-en-is.csv on the machine (logged 2026-10-24). The slug
 * must now be a registered book, checked before any path is built.
 */
describe('POST /api/terminology/import/existing-glossary: the book is checked first', () => {
  const BOOKS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'books');

  async function postJson(urlPath, body) {
    const res = await fetch(base + urlPath, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${personas.headEditor.token}`,
      },
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  const translationsOf = (english) =>
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM terminology_translations t
           JOIN terminology_headwords h ON h.id = t.headword_id WHERE h.english = ?`
      )
      .get(english).n;

  it('refuses a slug that walks out of books/ to another glossary file, and imports nothing', async () => {
    // A real file the walk reaches: before the check, the route imported it.
    const outside = path.join(work, 'outside-books');
    fsCjs.mkdirSync(path.join(outside, 'glossary'), { recursive: true });
    fsCjs.writeFileSync(
      path.join(outside, 'glossary', 'terminology-en-is.csv'),
      'english,icelandic\nc21d walked out,útrás\n'
    );
    const bookSlug = path.relative(BOOKS_DIR, outside);
    expect(bookSlug.startsWith('..')).toBe(true);

    const res = await postJson('/api/terminology/import/existing-glossary', { bookSlug });
    expect([res.status, res.json?.error, translationsOf('c21d walked out')]).toEqual([
      400,
      'Invalid book',
      0,
    ]);
  });

  for (const [what, bookSlug] of [
    ['a slug no book has', 'no-such-book'],
    ['a list, not a slug', [FIXTURE]],
  ]) {
    it(`refuses ${what} with 400`, async () => {
      const res = await postJson('/api/terminology/import/existing-glossary', { bookSlug });
      expect([res.status, res.json?.error]).toEqual([400, 'Invalid book']);
    });
  }

  it('lets a registered book through to the file check (the control)', async () => {
    // The fixture is registered and has no glossary file: the answer is the file check's.
    const res = await postJson('/api/terminology/import/existing-glossary', { bookSlug: FIXTURE });
    expect([res.status, res.json?.error]).toEqual([404, 'Glossary not found']);
  });
});

/**
 * POST /api/terminology/import/excel and what it will read. xlsx (SheetJS) throws only for a
 * damaged ZIP: plain text and other bytes "parse" into a sheet, and the importer takes the first
 * two columns as English and Icelandic, so a text file named .xlsx could import nonsense with a
 * 200 (measured 2026-10-25). A damaged workbook and a missing sheet name were 500s. Now the file
 * must be a binary workbook (ZIP, OLE, or an Excel 2-4 BIFF header) or a text workbook xlsx
 * recognises (XML Spreadsheet 2003, an HTML table), and not a workbook, damaged, a missing sheet
 * or no sheets is a 400 that says why. A sheet xlsx reads as empty still imports 0 rows (200).
 */
describe('POST /api/terminology/import/excel: only a workbook is read', () => {
  const XLSX = require('xlsx');
  function workbook(bookType, rows, sheet = 'Terms') {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['English', 'Icelandic'], ...rows]),
      sheet
    );
    return XLSX.write(wb, { type: 'buffer', bookType });
  }
  const sendExcel = (name, bytes, query = '') =>
    upload(`/api/terminology/import/excel${query}`, {
      as: 'headEditor',
      field: 'file',
      files: [{ name, bytes }],
    });
  const stored = (prefix) =>
    db
      .prepare(
        `SELECT h.english, t.icelandic FROM terminology_translations t
           JOIN terminology_headwords h ON h.id = t.headword_id
          WHERE h.english LIKE ? ORDER BY h.english`
      )
      .all(`${prefix}%`);

  it('imports an .xls, the older binary format (the control for the second signature)', async () => {
    const res = await sendExcel('terms.xls', workbook('biff8', [['c21e xls term', 'gamalt snið']]));
    expect([res.status, res.json?.added, stored('c21e xls')]).toEqual([
      200,
      1,
      [{ english: 'c21e xls term', icelandic: 'gamalt snið' }],
    ]);
  });

  // Excel also saves .xls as XML Spreadsheet 2003 or an HTML table, and Excel 2-4 wrote BIFF2-4;
  // xlsx reads all three, so the check must too (review of this branch, 2026-10-25).
  // BIFF2 is a single-byte format: xlsx writes "ð" in it as "_", so its case uses ASCII.
  for (const [format, bookType, icelandic] of [
    ['XML Spreadsheet 2003', 'xlml', 'snið'],
    ['an HTML table', 'html', 'snið'],
    ['Excel 2 (BIFF2)', 'biff2', 'snid'],
  ]) {
    it(`imports an .xls saved as ${format}`, async () => {
      const english = `c21e ${bookType} term`;
      const res = await sendExcel('terms.xls', workbook(bookType, [[english, icelandic]]));
      expect([res.status, res.json?.added, stored(english)]).toEqual([
        200,
        1,
        [{ english, icelandic }],
      ]);
    });
  }

  it('refuses a text file named .xlsx, which the parser would have read as a sheet', async () => {
    const notes = Buffer.from(
      'c21e dear editor, here are my notes\nc21e first point, second point\n'
    );
    const res = await sendExcel('notes.xlsx', notes);
    expect([res.status, res.json?.error, stored('c21e first')]).toEqual([
      400,
      'Invalid Excel file',
      [],
    ]);
    expect(res.json?.message).toMatch(/^The file is not an Excel workbook/);
  });

  it('refuses a CSV sent to the Excel import, and points to the CSV import', async () => {
    const res = await sendExcel(
      'terms.xlsx',
      Buffer.from('english,icelandic\nc21e csv here,hér\n')
    );
    expect([res.status, res.json?.error, stored('c21e csv here')]).toEqual([
      400,
      'Invalid Excel file',
      [],
    ]);
    expect(res.json?.message).toContain('CSV import');
  });

  it('refuses an empty file with 400', async () => {
    const res = await sendExcel('empty.xlsx', Buffer.alloc(0));
    expect([res.status, res.json?.error]).toEqual([400, 'Invalid Excel file']);
  });

  it('refuses a damaged workbook with 400 saying why', async () => {
    const whole = workbook('xlsx', [['c21e damaged', 'skemmt']]);
    const res = await sendExcel('damaged.xlsx', whole.subarray(0, Math.floor(whole.length / 2)));
    expect([res.status, res.json?.error, stored('c21e damaged')]).toEqual([
      400,
      'Invalid Excel file',
      [],
    ]);
    expect(res.json?.message).toMatch(/^The file could not be read as an Excel workbook: /);
  });

  it('refuses a sheet name that is an Object.prototype member, as any missing sheet', async () => {
    const res = await sendExcel(
      'terms.xlsx',
      workbook('xlsx', [['c21e proto', 'frumgerð']]),
      '?sheetName=toString'
    );
    expect([res.status, res.json?.error, stored('c21e proto')]).toEqual([
      400,
      'Invalid Excel file',
      [],
    ]);
  });

  it("keeps the parser's reason when xlsx throws a string, not an Error", async () => {
    const read = vi.spyOn(XLSX, 'read').mockImplementation(() => {
      // eslint-disable-next-line no-throw-literal -- imitates xlsx, which throws plain strings
      throw 'XLS Xnum Buffer underflow';
    });
    try {
      const res = await sendExcel('terms.xls', workbook('biff8', [['c21e thrown', 'kastað']]));
      expect([res.status, res.json?.message]).toEqual([
        400,
        'The file could not be read as an Excel workbook: XLS Xnum Buffer underflow',
      ]);
    } finally {
      read.mockRestore();
    }
  });

  it('refuses a workbook with no sheets with 400', async () => {
    const read = vi
      .spyOn(XLSX, 'read')
      .mockReturnValue({ SheetNames: [], Sheets: {}, bookType: 'xlsx' });
    try {
      const res = await sendExcel('terms.xlsx', workbook('xlsx', [['c21e nosheet', 'ekkert']]));
      expect([res.status, res.json?.message]).toEqual([400, 'The workbook has no sheets.']);
    } finally {
      read.mockRestore();
    }
  });

  it('refuses a sheet name the workbook does not have, and names the sheets it has', async () => {
    const res = await sendExcel(
      'terms.xlsx',
      workbook('xlsx', [['c21e sheet', 'blað']], 'Hugtök'),
      '?sheetName=Terms'
    );
    expect([res.status, res.json?.error, stored('c21e sheet')]).toEqual([
      400,
      'Invalid Excel file',
      [],
    ]);
    expect(res.json?.message).toBe('The workbook has no sheet named "Terms". Its sheets: Hugtök.');
  });
});

/**
 * POST /api/terminology/import/key-terms answered a book that is not registered with a 500
 * ("Book not found" thrown by the importer; logged 2026-10-25). It is the request's to fix, so it
 * is now the 400 "Invalid book" the other imports give, checked before the importer runs.
 */
describe('POST /api/terminology/import/key-terms: the book is checked first', () => {
  async function postKeyTerms(bookSlug) {
    const res = await fetch(`${base}/api/terminology/import/key-terms`, {
      method: 'POST',
      body: JSON.stringify({ bookSlug }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${personas.headEditor.token}`,
      },
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  for (const [what, bookSlug] of [
    ['a slug no book has', 'no-such-book'],
    ['a list, not a slug', [FIXTURE]],
  ]) {
    it(`refuses ${what} with 400`, async () => {
      const res = await postKeyTerms(bookSlug);
      expect([res.status, res.json?.error]).toEqual([400, 'Invalid book']);
    });
  }

  it('lets a registered book through to the importer (the control)', async () => {
    // The fixture has no publication tree, so the importer finds nothing to read.
    const res = await postKeyTerms(FIXTURE);
    expect([res.status, res.json?.added, res.json?.message]).toEqual([
      200,
      0,
      'No key-terms files found',
    ]);
  });
});
