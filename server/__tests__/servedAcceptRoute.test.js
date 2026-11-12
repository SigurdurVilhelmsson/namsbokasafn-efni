/**
 * POST /:book/:chapter/:moduleId/accept places the segment, mints its served version and records it
 * (G1.1; spec §5.6 Accept, §5.7, §5.8; T4's value check after a re-render, T5's and T18's accept
 * halves; plan Task 15, decision 12).
 *
 * Drives the real GET and POST handlers on a real migrated database (SESSIONS_DB_PATH in a temp
 * dir, so the foreign key from segment_acceptances.served_version_id is live) over synthetic modules
 * under a temp books root. The two committed modules whose ids G1.12's re-extract de-duplicated in
 * the English (m68726, m68747; pure MT still holds both Icelandic copies) are COPIED into that root,
 * so nothing under books/ is read but the copy's source and nothing there is written: the
 * first-acceptance MT lock lands beside the temp copy.
 *
 * Every refusal compares the whole acceptance table and the served-version id list before and after,
 * by value, and carries a control that accepts, so a route refusing everything fails.
 */
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_BOOKS = path.resolve(__dirname, '..', '..', 'books');

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'served-accept-route-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { writeModule, handlerFor, invoke, EDITOR } = require('./helpers/servedFixture');

const CHEM = 'efnafraedi-2e';
const ORGANIC = 'lifraen-efnafraedi';
const M = 'm94001';
const A = `${M}:para:a`;
const B = `${M}:para:b`;
const D = `${M}:para:d`;

const M94001_EN = [
  [A, 'EN a'],
  [B, 'EN b'],
  [D, 'EN d'],
  [D, 'EN d'],
];
const M94001_MT = [
  [A, 'IS a'],
  [B, 'IS b'],
  [D, 'IS d1'],
  [D, 'IS d2'],
];

const KNOWN = [
  {
    chapter: 5,
    chapterDir: 'ch05',
    moduleId: 'm68726',
    segmentId: 'm68726:para:fs-idm94618544',
    markers: ['[[MATH:2]]', '[[MATH:3]]'], // what tells the two raw copies apart, first then second
  },
  {
    chapter: 8,
    chapterDir: 'ch08',
    moduleId: 'm68747',
    segmentId: 'm68747:para:fs-idm99049568',
    markers: ['hnútur sem', 'hnútyfirborð'],
  },
];

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let acceptance;
let servedEdit;
let REFUSAL_MESSAGES;
let get;
let accept;
let db;

/** Rewrites m94001 from its literal; `isOverrides` replaces one id's Icelandic. */
function writeM94001(isOverrides = {}) {
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: M,
    en: M94001_EN,
    mt: M94001_MT.map(([id, text]) => [id, isOverrides[id] ?? text]),
  });
}

function writeFixtures() {
  writeM94001();
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: 'm94002',
    en: [['m94002:para:a', 'EN a']], // EN only: no Icelandic layer
  });
  writeModule(root, {
    book: ORGANIC,
    chapterDir: 'ch01',
    moduleId: 'm94004',
    en: [['m94004:para:a', 'EN a']],
    mt: [['m94004:para:a', 'IS a']],
  });
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  acceptance = require('../services/acceptanceService');
  servedEdit = require('../services/servedEdit');
  ({ REFUSAL_MESSAGES } = servedEdit);
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  for (const k of KNOWN) {
    for (const [layer, ext] of [
      ['02-for-mt', 'en'],
      ['02-mt-output', 'is'],
    ]) {
      const rel = path.join(CHEM, layer, k.chapterDir, `${k.moduleId}-segments.${ext}.md`);
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      copyFileSync(path.join(REPO_BOOKS, rel), path.join(root, rel));
    }
  }
  const router = require('../routes/segment-editor');
  get = handlerFor(router, 'get', '/:book/:chapter/:moduleId');
  accept = handlerFor(router, 'post', '/:book/:chapter/:moduleId/accept');
  db = new Database(dbPath);
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestBooksDir(realBooksDir);
  db.close();
  rmSync(work, { recursive: true, force: true });
});

// The tests share one database and one books root and run in declaration order, so each starts
// from the literal modules and no edit or acceptance rows (acceptanceRoutes.test.js's precedent).
// Without it, the T5 control's accept of b would make the T4 control's accept of b's new text
// answer alreadyAccepted with the old row (a file rewrite lapses nothing). Served versions are
// left alone: a live foreign key references them, and every test compares version id sets before
// and after instead of assuming an empty table.
beforeEach(() => {
  writeFixtures();
  db.exec('DELETE FROM segment_acceptances; DELETE FROM segment_edits;');
});

function serve(book, chapterNum, moduleId, user = EDITOR) {
  return invoke(get, { params: { book, chapter: String(chapterNum), moduleId }, chapterNum, user });
}

function post(body, { user = EDITOR, book = CHEM, chapterNum = 1, moduleId = M } = {}) {
  return invoke(accept, {
    params: { book, chapter: String(chapterNum), moduleId },
    chapterNum,
    user,
    body,
  });
}

const segOf = (page, id) => page.segments.find((s) => s.segmentId === id);
const acceptanceRows = () => db.prepare('SELECT * FROM segment_acceptances ORDER BY id').all();
const versionIds = () =>
  db
    .prepare('SELECT id FROM served_text_versions ORDER BY id')
    .all()
    .map((r) => r.id);
const snapshot = () => ({ acceptances: acceptanceRows(), versions: versionIds() });
const versionById = (id) => db.prepare('SELECT * FROM served_text_versions WHERE id = ?').get(id);

/** Every key of a JSON value, at any depth. */
function keysDeep(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysDeep(v, out);
    }
  }
  return out;
}

describe('POST /accept — what is stored (spec §5.6 Accept, §5.8)', () => {
  it('stores the served version and occurrence; acceptOrigin is accepted and ignored', async () => {
    const r = await post({
      segmentId: A,
      acceptedContent: 'IS a',
      acceptOrigin: 'keyboard-stream',
    });
    expect(r.status).toBe(200);
    expect(r.body.alreadyAccepted).toBe(false);
    expect(keysDeep(r.body)).not.toContain('acceptOrigin');

    const rows = acceptanceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].occurrence).toBe(0);
    expect(rows[0].served_version_id).not.toBeNull();
    const v = versionById(rows[0].served_version_id);
    expect(v).toMatchObject({
      book: CHEM,
      chapter: 1,
      module_id: M,
      segment_id: A,
      occurrence: 0,
      layer: 'mt-output',
      en_text: 'EN a',
      is_text: 'IS a',
    });
    // The response carries the stored row, so the client sees what was recorded.
    expect(r.body.acceptance).toMatchObject({
      id: rows[0].id,
      served_version_id: rows[0].served_version_id,
      occurrence: 0,
    });
  });

  it('alreadyAccepted writes nothing', async () => {
    const first = await post({ segmentId: A, acceptedContent: 'IS a' });
    expect(first.status).toBe(200);
    expect(first.body.alreadyAccepted).toBe(false);

    const before = snapshot();
    const second = await post({ segmentId: A, acceptedContent: 'IS a' });
    expect(second.status).toBe(200);
    expect(second.body.alreadyAccepted).toBe(true);
    expect(snapshot()).toEqual(before);

    // The same, on a text nothing has minted yet: the file changed under an active acceptance (a
    // rewrite lapses nothing), so the existing lookup still answers alreadyAccepted, and a mint
    // placed before that lookup would leave a version for the new text behind (decision 12).
    writeM94001({ [A]: 'IS a, nýr texti' });
    const before2 = snapshot();
    const third = await post({ segmentId: A, acceptedContent: 'IS a, nýr texti' });
    expect(third.status).toBe(200);
    expect(third.body.alreadyAccepted).toBe(true);
    expect(third.body.acceptance.id).toBe(first.body.acceptance.id);
    expect(snapshot()).toEqual(before2);
    expect(
      db
        .prepare('SELECT COUNT(*) AS n FROM served_text_versions WHERE is_text = ?')
        .get('IS a, nýr texti').n
    ).toBe(0);
  });

  it('a direct legacy call still writes NULLs', () => {
    const r = acceptance.acceptSegment({
      book: CHEM,
      chapter: 1,
      moduleId: M,
      segmentId: A,
      acceptedContent: 'IS a',
      userId: 'u-ed1',
      username: 'editor1',
    });
    expect(r.alreadyAccepted).toBe(false);
    expect(r.acceptance.served_version_id).toBeNull();
    expect(r.acceptance.occurrence).toBeNull();
    const rows = acceptanceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ served_version_id: null, occurrence: null });
  });

  it('the unique-index race loser writes nothing: its mint rolls back with the INSERT (decision 12)', () => {
    // A text nothing has minted, so a version left behind is visible by value.
    writeM94001({ [B]: 'IS b, í kapphlaupi' });
    // A concurrent accept wins between this call's existing lookup and its transaction: the
    // proxied lookup inserts the winner's row on the real handle and reports nothing found, as a
    // lookup that ran just before the winner committed would.
    const real = new Database(dbPath);
    let raced = false;
    const isExistingLookup = (sql) =>
      /SELECT \* FROM segment_acceptances\s+WHERE book = \? AND module_id = \? AND segment_id = \? AND status = 'active'/.test(
        sql
      );
    const proxy = new Proxy(real, {
      get(target, prop) {
        if (prop === 'prepare') {
          return (sql) => {
            if (raced || !isExistingLookup(sql)) return target.prepare(sql);
            raced = true;
            return {
              get: () => {
                target
                  .prepare(
                    `INSERT INTO segment_acceptances
                       (book, chapter, module_id, segment_id, accepted_content, accepted_by,
                        accepted_by_username)
                     VALUES (?, 1, ?, ?, ?, 'u-winner', 'winner')`
                  )
                  .run(CHEM, M, B, 'IS b, í kapphlaupi');
                return undefined;
              },
            };
          };
        }
        const v = target[prop];
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    acceptance._setTestDb(proxy);
    try {
      const before = versionIds();
      const r = acceptance.acceptSegment({
        book: CHEM,
        chapter: 1,
        moduleId: M,
        segmentId: B,
        acceptedContent: 'IS b, í kapphlaupi',
        userId: 'u-ed1',
        username: 'editor1',
        occurrence: 0,
      });
      expect(raced).toBe(true);
      expect(r.alreadyAccepted).toBe(true);
      expect(r.acceptance).toMatchObject({ accepted_by: 'u-winner', served_version_id: null });
      expect(acceptanceRows()).toHaveLength(1);
      expect(versionIds()).toEqual(before);
      expect(
        db
          .prepare('SELECT COUNT(*) AS n FROM served_text_versions WHERE is_text = ?')
          .get('IS b, í kapphlaupi').n
      ).toBe(0);
    } finally {
      acceptance._setTestDb(null);
      real.close();
    }

    // Control: without the race the same call mints and stores that version.
    db.exec('DELETE FROM segment_acceptances;');
    const ok = acceptance.acceptSegment({
      book: CHEM,
      chapter: 1,
      moduleId: M,
      segmentId: B,
      acceptedContent: 'IS b, í kapphlaupi',
      userId: 'u-ed1',
      username: 'editor1',
      occurrence: 0,
    });
    expect(ok.alreadyAccepted).toBe(false);
    expect(versionById(ok.acceptance.served_version_id).is_text).toBe('IS b, í kapphlaupi');
  });
});

describe('POST /accept — placement and scope refusals (spec §5.6 steps 1–3, §5.7, §11)', () => {
  it('T5: a duplicated id is refused before the existing-acceptance lookup', async () => {
    db.prepare(
      `INSERT INTO segment_acceptances
         (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
       VALUES (?, 1, ?, ?, 'IS d2', 'u-ed1', 'editor1')`
    ).run(CHEM, M, D);

    const before = snapshot();
    const r = await post({ segmentId: D, acceptedContent: 'IS d2' });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'DUPLICATE_ID', message: REFUSAL_MESSAGES.DUPLICATE_ID });
    expect(snapshot()).toEqual(before);

    // Control: a single-occurrence id of the same module accepts.
    const ok = await post({ segmentId: B, acceptedContent: 'IS b' });
    expect(ok.status).toBe(200);
    expect(ok.body.alreadyAccepted).toBe(false);
    expect(acceptanceRows()).toHaveLength(2);
  });

  it('T5 on the two known ids: since G1.12 each is served once, with a base and the first copy, and accepts (spec T5)', async () => {
    // Until G1.12's re-extract these two ids occurred twice and the accept was refused DUPLICATE_ID.
    // The English now holds each once; pure MT keeps both Icelandic copies and the loader serves the
    // FIRST. The synthetic test above stays the DUPLICATE_ID backstop.
    for (const k of KNOWN) {
      const page = (await serve(CHEM, k.chapter, k.moduleId)).body;
      const mine = page.segments
        .filter((s) => s.segmentId === k.segmentId)
        .map((s) => ({ occurrence: s.occurrence, hasBase: 'baseSha256' in s, is: s.is }));
      expect(mine).toHaveLength(1);
      const X = mine[0].is;
      expect(typeof X).toBe('string');
      expect(mine).toEqual([{ occurrence: 0, hasBase: true, is: X }]);
      // The raw copies still differ, and the served text is the first one's.
      const raw = segmentParser
        .parseSegments(
          readFileSync(
            path.join(root, CHEM, '02-mt-output', k.chapterDir, `${k.moduleId}-segments.is.md`),
            'utf8'
          )
        )
        .filter((s) => s.segmentId === k.segmentId)
        .map((s) => s.content);
      expect(raw).toHaveLength(2);
      expect(raw[0]).not.toBe(raw[1]);
      const [first, last] = k.markers;
      expect(raw[0]).toContain(first);
      expect(raw[1]).toContain(last);
      expect(X).toContain(first);
      expect(X).not.toContain(last);

      const r = await post(
        { segmentId: k.segmentId, acceptedContent: X },
        { chapterNum: k.chapter, moduleId: k.moduleId }
      );
      expect(r.status).toBe(200);
      expect(r.body.alreadyAccepted).toBe(false);
      const rows = db
        .prepare('SELECT * FROM segment_acceptances WHERE segment_id = ?')
        .all(k.segmentId);
      expect(rows).toHaveLength(1);
      expect(rows[0].occurrence).toBe(0);
      expect(versionById(rows[0].served_version_id)).toMatchObject({
        chapter: k.chapter,
        segment_id: k.segmentId,
        occurrence: 0,
        is_text: X,
      });
    }

    // Control, same modules: a non-duplicated sibling accepts with its served is.
    const sibling = 'm68726:title:auto-1';
    const page = (await serve(CHEM, 5, 'm68726')).body;
    const siblingIs = segOf(page, sibling).is;
    expect(typeof siblingIs).toBe('string');
    const ok = await post(
      { segmentId: sibling, acceptedContent: siblingIs },
      { chapterNum: 5, moduleId: 'm68726' }
    );
    expect(ok.status).toBe(200);
    expect(ok.body.alreadyAccepted).toBe(false);
    const row = db.prepare('SELECT * FROM segment_acceptances WHERE segment_id = ?').get(sibling);
    expect(versionById(row.served_version_id)).toMatchObject({
      chapter: 5,
      segment_id: sibling,
      occurrence: 0,
      is_text: siblingIs,
    });
  });

  it('NO_LAYER and T18 BOOK_NOT_MINTED answer 409 and write nothing', async () => {
    const organicPage = (await serve(ORGANIC, 1, 'm94004')).body;
    const organicIs = segOf(organicPage, 'm94004:para:a').is;
    expect(organicIs).toBe('IS a'); // the correct value, so only the book can refuse it

    const before = snapshot();
    const layerless = await post(
      { segmentId: 'm94002:para:a', acceptedContent: 'IS a' },
      { moduleId: 'm94002' }
    );
    expect(layerless.status).toBe(409);
    expect(layerless.body).toEqual({ error: 'NO_LAYER', message: REFUSAL_MESSAGES.NO_LAYER });

    const organic = await post(
      { segmentId: 'm94004:para:a', acceptedContent: organicIs },
      { book: ORGANIC, moduleId: 'm94004' }
    );
    expect(organic.status).toBe(409);
    expect(organic.body).toEqual({
      error: 'BOOK_NOT_MINTED',
      message: REFUSAL_MESSAGES.BOOK_NOT_MINTED,
    });
    expect(snapshot()).toEqual(before);
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM segment_acceptances WHERE book = ?').get(ORGANIC).n
    ).toBe(0);
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM served_text_versions WHERE book = ?').get(ORGANIC).n
    ).toBe(0);

    // Control, same test: a chemistry accept answers 200.
    const ok = await post({ segmentId: A, acceptedContent: 'IS a' });
    expect(ok.status).toBe(200);
    expect(acceptanceRows()).toHaveLength(1);
  });
});

describe('acceptSegment refuses organic itself, whoever calls it (PR1 review, T15 note; spec §11)', () => {
  const call = (book, moduleId, segmentId) => () =>
    acceptance.acceptSegment({
      book,
      chapter: 1,
      moduleId,
      segmentId,
      acceptedContent: 'IS a',
      userId: 'u-ed1',
      username: 'editor1',
    });
  const caught = (fn) => {
    try {
      fn();
    } catch (err) {
      return err;
    }
    return null;
  };

  it('a direct call on organic with no occurrence throws the BOOK_NOT_MINTED refusal and writes nothing; chemistry still accepts', () => {
    // The correct value, so only the book can refuse it.
    expect(
      segmentParser
        .loadModuleForEditing(ORGANIC, 1, 'm94004')
        .segments.find((s) => s.segmentId === 'm94004:para:a').is
    ).toBe('IS a');
    // The refusal placeOnServedBase throws for the same request: the shape to match.
    const placed = caught(() =>
      servedEdit.placeOnServedBase({
        book: ORGANIC,
        chapter: 1,
        moduleId: 'm94004',
        segmentId: 'm94004:para:a',
      })
    );
    expect(placed?.code).toBe('BOOK_NOT_MINTED');

    const before = snapshot();
    const err = caught(call(ORGANIC, 'm94004', 'm94004:para:a'));
    expect(err).toBeInstanceOf(Error);
    expect({ code: err.code, message: err.message, refusal: err.refusal }).toEqual({
      code: placed.code,
      message: placed.message,
      refusal: placed.refusal,
    });
    expect(snapshot()).toEqual(before);
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM segment_acceptances WHERE book = ?').get(ORGANIC).n
    ).toBe(0);

    // Control, same test: the same direct call on chemistry accepts.
    const ok = call(CHEM, M, A)();
    expect(ok.alreadyAccepted).toBe(false);
    expect(acceptanceRows().map((r) => [r.book, r.segment_id])).toEqual([[CHEM, A]]);
  });
});

describe('POST /accept — the value check after a re-render (T4, server side)', () => {
  it('T4: after a declined re-render the old value is refused by the value check', async () => {
    const page = (await serve(CHEM, 1, M)).body;
    const oldIs = segOf(page, B).is;
    expect(oldIs).toBe('IS b');
    writeM94001({ [B]: 'IS b breytt á diski' });

    const before = snapshot();
    const stale = await post({ segmentId: B, acceptedContent: oldIs });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('STALE_CONTENT');
    expect(snapshot()).toEqual(before);

    // Control: the new text accepts, on a version of the new text.
    const ok = await post({ segmentId: B, acceptedContent: 'IS b breytt á diski' });
    expect(ok.status).toBe(200);
    expect(ok.body.alreadyAccepted).toBe(false);
    const rows = acceptanceRows();
    expect(rows).toHaveLength(1);
    expect(versionById(rows[0].served_version_id).is_text).toBe('IS b breytt á diski');
  });
});
