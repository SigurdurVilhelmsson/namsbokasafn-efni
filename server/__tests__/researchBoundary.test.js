/**
 * T17: nothing of the research reaches a browser (spec §10 and §11; index decision 15).
 *
 * One file, grown by every PR: each PR appends its own `describe`, and a new editing column joins
 * ALLOWED_COLUMNS only in the commit of the migration that adds it. Every `describe` carries a
 * planted control, so a check that cannot see a violation cannot pass.
 */
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import (the module-JSON
// describe below drives the real module route on this temp database).
const work = mkdtempSync(path.join(tmpdir(), 'research-boundary-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const freshMigratedDb = require('./helpers/freshMigratedDb');
const { writeModule, handlerFor, invoke, EDITOR } = require('./helpers/servedFixture');

// Every column the module route sends to every editor's browser through SELECT *
// (segmentEditorService.getModuleEdits, acceptanceService.getModuleAcceptances). A column joins
// this list only after asking whether the tool needs it and whether every editor may see it
// (spec §5.8, R3).
const ALLOWED_COLUMNS = Object.freeze({
  segment_edits: [
    'id',
    'book',
    'chapter',
    'module_id',
    'segment_id',
    'original_content',
    'edited_content',
    'category',
    'editor_note',
    'status',
    'editor_id',
    'editor_username',
    'reviewer_id',
    'reviewer_username',
    'reviewer_note',
    'created_at',
    'reviewed_at',
    'applied_at',
    'review_id',
    // PR1
    'served_version_id',
    'occurrence',
    'origin',
    'displayed_edit_id',
    'displayed_edit_sha256',
  ],
  segment_acceptances: [
    'id',
    'book',
    'chapter',
    'module_id',
    'segment_id',
    'accepted_content',
    'accepted_by',
    'accepted_by_username',
    'accepted_at',
    'status',
    'superseded_at',
    'superseded_reason',
    'applied_at',
    // PR1
    'served_version_id',
    'occurrence',
  ],
});

function columnDrift(db, table, allowed) {
  const have = db.pragma(`table_info(${table})`).map((c) => c.name);
  return {
    unexpected: have.filter((c) => !allowed.includes(c)).sort(),
    missing: allowed.filter((c) => !have.includes(c)).sort(),
  };
}

describe('T17 (PR1): the editing columns the module route sends are an allowlist', () => {
  for (const table of Object.keys(ALLOWED_COLUMNS)) {
    it(`${table} has exactly the allowed columns`, () => {
      const { db } = freshMigratedDb();
      expect(columnDrift(db, table, ALLOWED_COLUMNS[table])).toEqual({
        unexpected: [],
        missing: [],
      });
    });
  }

  it('control: a planted column is reported by name', () => {
    const { db } = freshMigratedDb();
    db.exec('ALTER TABLE segment_edits ADD COLUMN research_probe TEXT');
    expect(columnDrift(db, 'segment_edits', ALLOWED_COLUMNS.segment_edits).unexpected).toEqual([
      'research_probe',
    ]);
  });
});

// What the module route may send (spec §5.4 step 6): today's keys plus PR1's three. Exact sets, so any new key fails.
const MODULE_JSON_ALLOWED = Object.freeze({
  top: [
    'book',
    'chapter',
    'moduleId',
    'isSource',
    'title',
    'titleIs',
    'segments',
    'equations',
    'segmentCount',
    'translatedCount',
    'mtFindingsGeneratedAt',
    'extractedAt',
    'sourceHash',
    'edits',
    'stats',
    'acceptances',
    'otherPendingSegments',
  ],
  segment: [
    'segmentId',
    'moduleId',
    'segmentType',
    'elementId',
    'en',
    'is',
    'hasTranslation',
    'mtFinding',
    'occurrence',
    'baseSha256',
  ],
  editRow: [...ALLOWED_COLUMNS.segment_edits, 'contentSha256'],
  acceptanceRow: [...ALLOWED_COLUMNS.segment_acceptances],
});
// Research and time-of-person names that must never reach a browser (spec §11), at any depth.
const FORBIDDEN_KEY =
  /(opened|switched|inflight|editor_?key|client_?action|assists?$|accept_?origin|reviewed_?edit|replayed|research|consent)/i;
const keysDeep = (v) =>
  v && typeof v === 'object'
    ? Object.entries(v).flatMap(([k, x]) => [...(Array.isArray(v) ? [] : [k]), ...keysDeep(x)])
    : [];
function jsonDrift(body) {
  const seg = body.segments.find((s) => 'baseSha256' in s);
  const firstEdit = Object.values(body.edits)[0][0];
  const firstAcc = Object.values(body.acceptances)[0];
  const odd = (keys, allowed) => keys.filter((k) => !allowed.includes(k)).sort();
  return {
    top: odd(Object.keys(body), MODULE_JSON_ALLOWED.top),
    segment: odd(Object.keys(seg), MODULE_JSON_ALLOWED.segment),
    editRow: odd(Object.keys(firstEdit), MODULE_JSON_ALLOWED.editRow),
    acceptanceRow: odd(Object.keys(firstAcc), MODULE_JSON_ALLOWED.acceptanceRow),
    forbidden: [...new Set(keysDeep(body).filter((k) => FORBIDDEN_KEY.test(k)))].sort(),
  };
}

describe('T17 (PR1): the module JSON carries no research field and no new time', () => {
  const BOOK = 'efnafraedi-2e';
  const MODULE = 'm90020';
  let segmentParser;
  let segmentEditor;
  let realBooksDir;
  let get;

  beforeAll(() => {
    const { runAllMigrations } = require('../services/migrationRunner');
    runAllMigrations();
    segmentParser = require('../services/segmentParser');
    segmentEditor = require('../services/segmentEditorService');
    realBooksDir = segmentParser.BOOKS_DIR;
    // a temp books root: the seeding save and accept write their MT lock beside the fixture
    const root = path.join(work, 'books');
    mkdirSync(root, { recursive: true });
    segmentParser._setTestBooksDir(root);
    segmentEditor._setTestBooksDir(root);
    get = handlerFor(require('../routes/segment-editor'), 'get', '/:book/:chapter/:moduleId');
    writeModule(root, {
      book: BOOK,
      chapterDir: 'ch01',
      moduleId: MODULE,
      en: [
        [`${MODULE}:para:a`, 'Alpha.'],
        [`${MODULE}:para:b`, 'Beta.'],
      ],
      mt: [
        [`${MODULE}:para:a`, 'Alfa.'],
        [`${MODULE}:para:b`, 'Beta á íslensku.'],
      ],
    });
    // seed: one edit (legacy call) and one acceptance (legacy call), on different segments
    segmentEditor.saveSegmentEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: `${MODULE}:para:a`,
      originalContent: 'Alfa.',
      editedContent: 'Alfa, breytt.',
      category: 'accuracy',
      editorNote: null,
      editorId: EDITOR.id,
      editorUsername: EDITOR.username,
    });
    require('../services/acceptanceService').acceptSegment({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: `${MODULE}:para:b`,
      acceptedContent: 'Beta á íslensku.',
      userId: EDITOR.id,
      username: EDITOR.username,
    });
  });

  afterAll(() => {
    segmentParser._setTestBooksDir(realBooksDir);
    segmentEditor._setTestBooksDir(realBooksDir);
    rmSync(work, { recursive: true, force: true });
  });

  const serve = () =>
    invoke(get, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
      user: EDITOR,
    });

  it('every key is allowed, at every level', async () => {
    const { status, body } = await serve();
    expect(status).toBe(200);
    // the seeded rows are what the drift check reads (so an empty edits or acceptances map cannot pass it)
    expect(Object.keys(body.edits)).toEqual([`${MODULE}:para:a`]);
    expect(Object.keys(body.acceptances)).toEqual([`${MODULE}:para:b`]);
    expect(jsonDrift(body)).toEqual({
      top: [],
      segment: [],
      editRow: [],
      acceptanceRow: [],
      forbidden: [],
    });
  });

  it('control: a planted key is reported at each level', async () => {
    const { body } = await serve();
    body.opened_at_ms = 1;
    body.segments.find((s) => 'baseSha256' in s).assists = [];
    Object.values(body.edits)[0][0].clientActionId = 'x';
    expect(jsonDrift(body)).toMatchObject({
      top: ['opened_at_ms'],
      segment: ['assists'],
      editRow: ['clientActionId'],
      forbidden: ['assists', 'clientActionId', 'opened_at_ms'],
    });
  });
});
