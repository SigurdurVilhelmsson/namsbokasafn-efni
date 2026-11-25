/**
 * G1.7 step 1, Task 4: `server/scripts/study-freeze.js manifest` (spec §6.3, §6.4, §6.6).
 *
 * The manifest records the frozen base: one line per served segment occurrence, hashed by the
 * served-version code itself. The join test (T3) drives the module route on a real migrated
 * database and checks every row it mints against the manifest on (chapter, module_id, segment_id,
 * occurrence, en_sha256, is_sha256) — `layer` is recorded but is not part of the join.
 *
 * SESSIONS_DB_PATH and JWT_SECRET are set BEFORE any server require (moduleOpeningRoute.test.js).
 * The books root is a temp directory; git facts are injected, never read from the repository.
 * The route is served as a signed-in user with no users row, so no opening is recorded and no
 * MT lock is written by any first-edit hook.
 */
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  unlinkSync,
  readdirSync,
  existsSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'study-freeze-manifest-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const segmentParser = require('../services/segmentParser');
const { writeModule, writeRaw, handlerFor, invoke } = require('./helpers/servedFixture');
const { FREEZE_LOCK_BODY, mtLockPathFor, writeFreezeLock } = require('../../tools/lib/mt-lock.cjs');
const { STUDY_BOOKS } = require('../lib/researchScope');
const { writeBookGlossaryRecord } = require('../lib/bookGlossaryLayer');

const BOOK = STUDY_BOOKS[0];
const TAG = `freeze-${BOOK}-2026-12-01`;
const UNITS = [
  { chapterDir: 'ch01', chapter: 1, param: '1', moduleId: 'm95001' },
  { chapterDir: 'ch01', chapter: 1, param: '1', moduleId: 'm95002' },
  { chapterDir: 'appendices', chapter: -1, param: 'appendices', moduleId: 'm95003' },
];
const GIT = Object.freeze({
  baseCommit: 'a'.repeat(40),
  layer1LastCommit: 'b'.repeat(40),
  handRepairs: [{ commit: 'c'.repeat(40), subject: 'data(mt): HAND REPAIR — one title' }],
  shallow: false,
  dirtyPaths: [],
  // the 02-mt-selected files git tracks, book-relative (gitFacts reads them with git ls-files)
  layer1sFiles: [
    '02-mt-selected/ch01/m95002-rerequest.jsonl',
    '02-mt-selected/ch01/m95002-selected.json',
  ],
});
const REVISIONS = {
  m95001: {
    schema: 'mt-revised/1',
    module: 'm95001',
    rulingSet: { path: 'experiments/r/ruling-set.json', sha256: 'd'.repeat(64) },
    prompt: { path: 'tools/ai-review/prompts/term-pass-v2.md', sha256: 'e'.repeat(64) },
    model: 'claude-opus-5-5',
    runIds: ['run-b', 'run-a'],
  },
  m95002: {
    schema: 'mt-revised/1',
    module: 'm95002',
    rulingSet: { path: 'experiments/r/ruling-set.json', sha256: 'd'.repeat(64) },
    prompt: { path: 'tools/ai-review/prompts/term-pass-v1.md', sha256: 'f'.repeat(64) },
    model: 'claude-opus-5-5',
    runIds: ['run-a'],
  },
};
// A book glossary layer record (book-layer spec §5.4), written below by the exporter's own writer
// so the manifest is tested against the path the export really uses.
const BOOK_LAYER_RECORD = {
  schema: 'book-glossary/1',
  book: BOOK,
  generated: '2026-11-20T00:00:00.000Z',
  exclusions: [{ english: 'tan', conceptId: 0 }],
  entries: [],
  history: [],
  dangling: [],
};
const JOIN = ['chapter', 'module_id', 'segment_id', 'occurrence', 'en_sha256', 'is_sha256'];
const VISITOR = Object.freeze({
  id: 'p-freeze-visitor',
  username: 'gestur',
  role: 'editor',
  books: [],
});

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const ids = (u) => [`${u.moduleId}:para:a`, `${u.moduleId}:para:b`];
const mtText = (u, i) => `Íslenska ${u.moduleId} ${i}.`;
const joinKey = (r) => JSON.stringify(JOIN.map((k) => r[k]));
const linesOf = (jsonl) =>
  jsonl
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

let db;
let get;
let realBooksDir;
let root;
let out;
let io;
let study;

const bookPath = (...p) => path.join(root, BOOK, ...p);
const mtPath = (u) => bookPath('02-mt-output', u.chapterDir, `${u.moduleId}-segments.is.md`);
const lockOf = (u) => mtLockPathFor(mtPath(u));
const freezeDir = () => bookPath('freeze');
const serve = (u) =>
  invoke(get, {
    params: { book: BOOK, chapter: u.param, moduleId: u.moduleId },
    chapterNum: u.chapter,
    user: VISITOR,
  });
const servedRows = () =>
  db
    .prepare(
      `SELECT chapter, module_id, segment_id, occurrence, en_sha256, is_sha256, layer
         FROM served_text_versions WHERE book = ? ORDER BY id`
    )
    .all(BOOK);
const text = () => out.join('\n');

function buildTree() {
  root = path.join(work, `books-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  for (const u of UNITS) {
    writeModule(root, {
      book: BOOK,
      chapterDir: u.chapterDir,
      moduleId: u.moduleId,
      en: ids(u).map((id, i) => [id, `English ${u.moduleId} ${i}.`]),
      mt: ids(u).map((id, i) => [id, mtText(u, i)]),
    });
  }
  study.writeMarkers(study.planMarkers({ book: BOOK }));
  for (const [m, rec] of Object.entries(REVISIONS)) {
    writeRaw(root, `${BOOK}/02-mt-revised/ch01/${m}-revision.json`, JSON.stringify(rec, null, 2));
  }
  writeRaw(root, `${BOOK}/02-mt-revised/ch01/m95001-changes.jsonl`, '{"segmentId":"x"}\n');
  writeRaw(root, `${BOOK}/02-mt-revised/ch01/m95001-segments.is.md`, 'not a revision record\n');
  writeRaw(
    root,
    `${BOOK}/02-mt-selected/ch01/m95002-selected.json`,
    JSON.stringify({
      schema: 'mt-selected/1',
      module: 'm95002',
      entries: [{ segmentId: 'm95002:para:a', occurrence: 0, text: 'Valinn texti.' }],
    })
  );
  writeRaw(root, `${BOOK}/02-mt-selected/ch01/m95002-rerequest.jsonl`, '{"run":"r"}\n');
  writeRaw(
    root,
    `${BOOK}/glossary/glossary-unified.json`,
    JSON.stringify({ producer: 'export-terminology-resolved', terms: [{}, {}, {}] })
  );
  writeBookGlossaryRecord(path.join(root, BOOK, 'glossary'), BOOK_LAYER_RECORD);
  writeRaw(root, `${BOOK}/03-faithful-translation/README.md`, 'readme\n');
  writeRaw(root, `${BOOK}/03-faithful-translation/ch01/m95001-review-status.json`, '{}\n');
}

beforeAll(() => {
  runAllMigrations();
  db = new Database(process.env.SESSIONS_DB_PATH);
  realBooksDir = segmentParser.BOOKS_DIR;
  study = require('../scripts/study-freeze');
  const router = require('../routes/segment-editor');
  get = handlerFor(router, 'get', '/:book/:chapter/:moduleId');
});

beforeEach(() => {
  buildTree();
  db.prepare('DELETE FROM served_text_versions').run();
  out = [];
  io = { log: (l) => out.push(String(l)), error: (l) => out.push(String(l)) };
});

afterAll(() => {
  db.close();
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

async function serveAll() {
  for (const u of UNITS) expect((await serve(u)).status).toBe(200);
}

describe('T3: the manifest joins the served versions the route mints (spec §6.4)', () => {
  it('every served-version row the route mints joins a manifest line on the six values', async () => {
    await serveAll();
    const rows = servedRows();
    const lines = linesOf(study.buildManifest({ book: BOOK, tag: TAG, git: GIT }).segmentsJsonl);
    const keys = new Set(lines.map(joinKey));
    expect({
      rows: rows.length,
      lines: lines.length,
      unjoined: rows.filter((r) => !keys.has(joinKey(r))),
    }).toEqual({ rows: 6, lines: 6, unjoined: [] });
  });

  describe('relabel: the same text written as a faithful file and served again', () => {
    let rows;
    let lines;
    beforeEach(async () => {
      lines = linesOf(study.buildManifest({ book: BOOK, tag: TAG, git: GIT }).segmentsJsonl);
      await serveAll();
      const u = UNITS[0];
      const faithful = bookPath(
        '03-faithful-translation',
        u.chapterDir,
        `${u.moduleId}-segments.is.md`
      );
      mkdirSync(path.dirname(faithful), { recursive: true });
      copyFileSync(mtPath(u), faithful);
      expect((await serve(u)).status).toBe(200);
      rows = servedRows();
    });
    it('mints one new faithful row per segment of the unit', () => {
      expect(rows.filter((r) => r.layer === 'faithful').map((r) => r.module_id)).toEqual([
        'm95001',
        'm95001',
      ]);
    });
    it('every row joins, the faithful ones included', () => {
      const keys = new Set(lines.map(joinKey));
      expect(rows.filter((r) => !keys.has(joinKey(r)))).toEqual([]);
    });
    it('control: a join that also keyed on layer would drop the faithful rows', () => {
      const withLayer = (r) => JSON.stringify([...JOIN, 'layer'].map((k) => r[k]));
      const keys = new Set(lines.map(withLayer));
      expect(rows.filter((r) => !keys.has(withLayer(r))).length).toBe(2);
    });
  });

  it('control: one changed byte in one served segment, served again, gives exactly that one row unjoined', async () => {
    const lines = linesOf(study.buildManifest({ book: BOOK, tag: TAG, git: GIT }).segmentsJsonl);
    await serveAll();
    const u = UNITS[1];
    const changed = mtText(u, 0).replace('.', '!');
    // The editor serves the Fable layer, so the changed byte goes into the served file.
    const served = bookPath('02-mt-fable', u.chapterDir, `${u.moduleId}-segments.is.md`);
    const before = readFileSync(served, 'utf8');
    writeFileSync(served, before.replace(mtText(u, 0), changed));
    expect(readFileSync(served, 'utf8')).not.toBe(before); // control: the byte did change
    expect((await serve(u)).status).toBe(200);
    const keys = new Set(lines.map(joinKey));
    const unjoined = servedRows().filter((r) => !keys.has(joinKey(r)));
    expect(unjoined.map((r) => [r.segment_id, r.occurrence, r.is_sha256])).toEqual([
      ['m95002:para:a', 0, sha(changed)],
    ]);
  });
});

describe('T4: determinism', () => {
  it('two builds on one tree give identical bytes', () => {
    const a = study.buildManifest({ book: BOOK, tag: TAG, git: GIT });
    const b = study.buildManifest({ book: BOOK, tag: TAG, git: GIT });
    expect([JSON.stringify(b.header), b.segmentsJsonl]).toEqual([
      JSON.stringify(a.header),
      a.segmentsJsonl,
    ]);
  });
});

describe('the header, as spec §6.4', () => {
  let header;
  let segmentsJsonl;
  beforeEach(() => {
    ({ header, segmentsJsonl } = study.buildManifest({ book: BOOK, tag: TAG, git: GIT }));
  });

  it('carries its fields in the spec order', () => {
    expect(Object.keys(header)).toEqual([
      'schema',
      'book',
      'tag',
      'cutDate',
      'baseCommit',
      'supersedes',
      'segmentsSha256',
      'counts',
      'units',
      'layers',
      'glossary',
      'markers',
    ]);
  });
  it('identifies the cut', () => {
    expect([header.schema, header.book, header.tag, header.cutDate, header.baseCommit]).toEqual([
      'study-freeze/1',
      BOOK,
      TAG,
      '2026-12-01',
      GIT.baseCommit,
    ]);
  });
  it('supersedes nothing by default', () => {
    expect(header.supersedes).toBe(null);
  });
  it('segmentsSha256 is the sha256 of segments.jsonl, which ends with a newline', () => {
    expect([header.segmentsSha256, segmentsJsonl.endsWith('}\n')]).toEqual([
      sha(segmentsJsonl),
      true,
    ]);
  });
  it('segment lines use the served-version column names in order', () => {
    expect(Object.keys(linesOf(segmentsJsonl)[0])).toEqual([...JOIN, 'layer']);
  });
  it('counts units, segments and segments by layer', () => {
    expect(header.counts).toEqual({ units: 3, segments: 6, byLayer: { fable: 6 } });
  });
  it('lists the units in chapter order, appendices last', () => {
    expect(header.units.map((u) => [u.chapter, u.chapterDir, u.moduleId])).toEqual([
      [1, 'ch01', 'm95001'],
      [1, 'ch01', 'm95002'],
      [-1, 'appendices', 'm95003'],
    ]);
  });
  it('units and layers carry their keys in the spec order', () => {
    expect([Object.keys(header.units[0]), Object.keys(header.layers)]).toEqual([
      [
        'chapter',
        'chapterDir',
        'moduleId',
        'enSha256',
        'mtSha256',
        'faithfulSha256',
        'changesSha256',
        'segments',
        'marker',
      ],
      ['layer1', 'layer1s', 'layer2', 'layer3'],
    ]);
  });
  it('a unit carries its file hashes, segment count and marker', () => {
    const u = UNITS[2];
    expect(header.units[2]).toEqual({
      chapter: -1,
      chapterDir: 'appendices',
      moduleId: 'm95003',
      enSha256: sha(readFileSync(bookPath('02-for-mt', 'appendices', 'm95003-segments.en.md'))),
      mtSha256: sha(readFileSync(mtPath(u))),
      faithfulSha256: null,
      changesSha256: null,
      segments: 2,
      marker: 'freeze',
    });
  });
  it('changesSha256 is non-null only for the unit with a change log', () => {
    expect(header.units.map((u) => u.changesSha256)).toEqual([
      sha(readFileSync(bookPath('02-mt-revised', 'ch01', 'm95001-changes.jsonl'))),
      null,
      null,
    ]);
  });
  it('layer 1 carries the injected last commit and hand repairs', () => {
    expect(header.layers.layer1).toEqual({
      dir: '02-mt-output',
      lastCommit: GIT.layer1LastCommit,
      handRepairs: GIT.handRepairs,
    });
  });
  it('layer 1s lists every tracked 02-mt-selected file, entries only for *-selected.json', () => {
    const f = (rel) => sha(readFileSync(bookPath(rel)));
    expect(header.layers.layer1s.files).toEqual([
      {
        path: '02-mt-selected/ch01/m95002-rerequest.jsonl',
        sha256: f('02-mt-selected/ch01/m95002-rerequest.jsonl'),
        entries: null,
      },
      {
        path: '02-mt-selected/ch01/m95002-selected.json',
        sha256: f('02-mt-selected/ch01/m95002-selected.json'),
        entries: 1,
      },
    ]);
  });
  it('layer 1s: no manifest segment was served from it', () => {
    expect(header.layers.layer1s.servedSegments).toBe(0);
  });
  it('layer 2 records the revision records, their distinct references and one hash', () => {
    const rel = (m) => `02-mt-revised/ch01/${m}-revision.json`;
    const listing = ['m95001', 'm95002']
      .map((m) => `${rel(m)}\t${sha(readFileSync(bookPath(rel(m))))}\n`)
      .join('');
    expect(header.layers.layer2).toEqual({
      dir: '02-mt-revised',
      revisionRecords: 2,
      rulingSets: [{ path: 'experiments/r/ruling-set.json', sha256: 'd'.repeat(64) }],
      prompts: [
        { path: 'tools/ai-review/prompts/term-pass-v1.md', sha256: 'f'.repeat(64) },
        { path: 'tools/ai-review/prompts/term-pass-v2.md', sha256: 'e'.repeat(64) },
      ],
      models: ['claude-opus-5-5'],
      runIds: ['run-a', 'run-b'],
      revisionRecordsSha256: sha(listing),
    });
  });
  it('layer 3 counts faithful files and review-status sidecars', () => {
    expect(header.layers.layer3).toEqual({
      dir: '03-faithful-translation',
      faithfulFiles: 0,
      reviewStatusSidecars: 1,
    });
  });
  it('the glossary carries its path, hash, producer and term count', () => {
    expect(header.glossary).toEqual({
      path: 'glossary/glossary-unified.json',
      sha256: sha(readFileSync(bookPath('glossary', 'glossary-unified.json'))),
      producer: 'export-terminology-resolved',
      terms: 3,
      bookLayer: expect.any(Object), // its content: the next test
    });
  });
  it("the glossary carries the book layer record's path and hash (book-layer spec §5.4)", () => {
    expect(header.glossary.bookLayer).toEqual({
      path: 'glossary/book-glossary.json',
      sha256: sha(readFileSync(bookPath('glossary', 'book-glossary.json'))),
    });
  });
  it('markers: the count and the sha256 of the freeze body', () => {
    expect(header.markers).toEqual({ count: 3, bodySha256: sha(FREEZE_LOCK_BODY) });
  });
});

describe('the header with absent or served layer directories', () => {
  it('absent layer directories and glossary give zero counts and empty lists, never a throw', () => {
    for (const d of ['02-mt-selected', '02-mt-revised', '03-faithful-translation', 'glossary']) {
      rmSync(bookPath(d), { recursive: true, force: true });
    }
    const { header } = study.buildManifest({ book: BOOK, tag: TAG, git: GIT });
    expect([header.layers, header.glossary, header.units.map((u) => u.changesSha256)]).toEqual([
      {
        layer1: {
          dir: '02-mt-output',
          lastCommit: GIT.layer1LastCommit,
          handRepairs: GIT.handRepairs,
        },
        layer1s: { dir: '02-mt-selected', files: [], servedSegments: 0 },
        layer2: {
          dir: '02-mt-revised',
          revisionRecords: 0,
          rulingSets: [],
          prompts: [],
          models: [],
          runIds: [],
          revisionRecordsSha256: sha(''),
        },
        layer3: { dir: '03-faithful-translation', faithfulFiles: 0, reviewStatusSidecars: 0 },
      },
      {
        path: 'glossary/glossary-unified.json',
        sha256: null,
        producer: null,
        terms: 0,
        bookLayer: { path: 'glossary/book-glossary.json', sha256: null },
      },
      [null, null, null],
    ]);
  });

  it('a book layer record is still hashed when glossary-unified.json is absent', () => {
    rmSync(bookPath('glossary', 'glossary-unified.json'));
    const { header } = study.buildManifest({ book: BOOK, tag: TAG, git: GIT });
    expect(header.glossary.bookLayer).toEqual({
      path: 'glossary/book-glossary.json',
      sha256: sha(readFileSync(bookPath('glossary', 'book-glossary.json'))),
    });
  });

  it('a file under 02-mt-selected that git does not track (a gitignored x.bak) is not recorded', () => {
    writeRaw(root, `${BOOK}/02-mt-selected/ch01/x.bak`, 'a local backup\n');
    const { header } = study.buildManifest({ book: BOOK, tag: TAG, git: GIT });
    expect(header.layers.layer1s.files.map((f) => f.path)).toEqual(GIT.layer1sFiles);
  });

  it('a tracked file absent from disk is not recorded and does not throw', () => {
    const git = { ...GIT, layer1sFiles: [...GIT.layer1sFiles, '02-mt-selected/ch01/gone.json'] };
    const { header } = study.buildManifest({ book: BOOK, tag: TAG, git });
    expect(header.layers.layer1s.files.map((f) => f.path)).toEqual(GIT.layer1sFiles);
  });

  it('git facts without the tracked list are refused, never read as "every file on disk"', () => {
    const { layer1sFiles, ...noList } = GIT;
    expect(layer1sFiles.length).toBe(2);
    expect(() => study.buildManifest({ book: BOOK, tag: TAG, git: noList })).toThrow(
      /layer1sFiles/
    );
  });

  it('control: a 02-mt-selected entry whose text is what the loader serves counts as served', () => {
    writeRaw(
      root,
      `${BOOK}/02-mt-selected/ch01/m95002-selected.json`,
      JSON.stringify({
        module: 'm95002',
        entries: [{ segmentId: 'm95002:para:b', occurrence: 0, text: mtText(UNITS[1], 1) }],
      })
    );
    const { header } = study.buildManifest({ book: BOOK, tag: TAG, git: GIT });
    expect(header.layers.layer1s.servedSegments).toBe(1);
  });

  it('a unit served from a faithful file records its hash and the faithful layer', () => {
    const u = UNITS[0];
    const faithful = bookPath(
      '03-faithful-translation',
      u.chapterDir,
      `${u.moduleId}-segments.is.md`
    );
    copyFileSync(mtPath(u), faithful);
    const { header } = study.buildManifest({ book: BOOK, tag: TAG, git: GIT });
    expect([header.units[0].faithfulSha256, header.counts.byLayer, header.layers.layer3]).toEqual([
      sha(readFileSync(faithful)),
      { faithful: 2, fable: 4 },
      { dir: '03-faithful-translation', faithfulFiles: 1, reviewStatusSidecars: 1 },
    ]);
  });
});

describe('manifestRefusals', () => {
  it('none on a frozen, clean tree', () => {
    expect(study.manifestRefusals({ book: BOOK, git: GIT })).toEqual([]);
  });
  it('a unit whose marker is not the freeze marker is not-frozen', () => {
    unlinkSync(lockOf(UNITS[1]));
    expect(study.manifestRefusals({ book: BOOK, git: GIT })).toEqual([
      { unit: 'ch01/m95002', reason: 'not-frozen' },
    ]);
  });
  it('a unit with a duplicated id', () => {
    const id = 'm95004:para:a';
    writeModule(root, {
      book: BOOK,
      chapterDir: 'ch01',
      moduleId: 'm95004',
      en: [
        [id, 'One.'],
        [id, 'Two.'],
      ],
      mt: [[id, 'Eitt.']],
    });
    writeFreezeLock(bookPath('02-mt-output', 'ch01', 'm95004-segments.is.md'));
    expect(study.manifestRefusals({ book: BOOK, git: GIT })).toEqual([
      { unit: 'ch01/m95004', reason: 'duplicated-id' },
    ]);
  });
  it('a unit with no Icelandic layer', () => {
    writeModule(root, {
      book: BOOK,
      chapterDir: 'ch01',
      moduleId: 'm95005',
      en: [['m95005:p:a', 'x']],
    });
    writeFreezeLock(bookPath('02-mt-output', 'ch01', 'm95005-segments.is.md'));
    expect(study.manifestRefusals({ book: BOOK, git: GIT })).toEqual([
      { unit: 'ch01/m95005', reason: 'no-layer' },
    ]);
  });
  it('a shallow clone and a dirty input', () => {
    const dirty = `books/${BOOK}/02-mt-output/ch01/m95001-segments.is.md`;
    expect(
      study.manifestRefusals({ book: BOOK, git: { ...GIT, shallow: true, dirtyPaths: [dirty] } })
    ).toEqual([{ reason: 'shallow-clone' }, { reason: 'dirty-input', paths: [dirty] }]);
  });
});

describe('manifest through main', () => {
  const write = (...extra) =>
    study.main(['manifest', '--write', '--tag', TAG, ...extra], io, { git: GIT });

  it('--write writes segments.jsonl and freeze.json exactly as buildManifest builds them', () => {
    const built = study.buildManifest({ book: BOOK, tag: TAG, git: GIT });
    expect(write()).toBe(0);
    const dir = path.join(freezeDir(), TAG);
    expect([
      readFileSync(path.join(dir, 'segments.jsonl'), 'utf8'),
      readFileSync(path.join(dir, 'freeze.json'), 'utf8'),
    ]).toEqual([built.segmentsJsonl, `${JSON.stringify(built.header, null, 2)}\n`]);
  });

  it('the write goes through a temp directory beside freeze/ (not in it), renamed into place', () => {
    const fs = require('fs');
    const realRename = fs.renameSync;
    const renames = [];
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      renames.push([from, to]);
      return realRename(from, to);
    });
    try {
      expect(write()).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(renames.length).toBe(1);
    const [[from, to]] = renames;
    expect([path.dirname(from), path.basename(from).startsWith('.freeze-tmp-'), to]).toEqual([
      bookPath(),
      true,
      path.join(freezeDir(), TAG),
    ]);
    expect(readdirSync(bookPath()).filter((n) => n.startsWith('.freeze-tmp-'))).toEqual([]);
  });

  // Two failure points: the second file's write (before freeze/ exists) and the rename (after
  // this call created freeze/), so both clean-up paths are exercised.
  it.each([
    ['writeFileSync', (p) => String(p).endsWith('freeze.json')],
    ['renameSync', () => true],
  ])(
    'a failed %s leaves the book directory as it was, and the re-run is not manifest-exists',
    (call, failsOn) => {
      const listing = () => readdirSync(bookPath(), { recursive: true }).map(String).sort();
      const before = listing();
      expect(before.includes('freeze')).toBe(false);
      const fs = require('fs');
      const real = fs[call];
      const spy = vi.spyOn(fs, call).mockImplementation((p, ...rest) => {
        if (failsOn(p)) {
          throw Object.assign(new Error('ENOSPC: injected for the test'), { code: 'ENOSPC' });
        }
        return real(p, ...rest);
      });
      try {
        expect(() => write()).toThrow(/ENOSPC/);
      } finally {
        spy.mockRestore();
      }
      expect(listing()).toEqual(before); // no freeze/<tag>/, no freeze/, no temp directory
      out.length = 0;
      expect(write()).toBe(0);
      expect(text()).not.toContain('manifest-exists');
      expect(existsSync(path.join(freezeDir(), TAG, 'freeze.json'))).toBe(true);
    }
  );

  it('a dry run writes nothing and prints the counts and the segments sha256', () => {
    const { header } = study.buildManifest({ book: BOOK, tag: TAG, git: GIT });
    expect(study.main(['manifest'], io, { git: GIT })).toBe(0);
    expect([existsSync(freezeDir()), text().includes(header.segmentsSha256)]).toEqual([
      false,
      true,
    ]);
    expect(text()).toContain('3 units, 6 segments');
  });

  describe('refusals (Review Focus 4): named, and nothing written', () => {
    it('a unit not frozen', () => {
      unlinkSync(lockOf(UNITS[1]));
      expect(write()).toBe(1);
      expect([existsSync(freezeDir()), /not-frozen.*ch01\/m95002/.test(text())]).toEqual([
        false,
        true,
      ]);
    });
    it('a shallow clone', () => {
      expect(
        study.main(['manifest', '--write', '--tag', TAG], io, { git: { ...GIT, shallow: true } })
      ).toBe(1);
      expect([existsSync(freezeDir()), text().includes('shallow-clone')]).toEqual([false, true]);
    });
    it('a dirty input', () => {
      const dirtyPaths = [`books/${BOOK}/02-mt-output/ch01/m95001-segments.is.md`];
      expect(
        study.main(['manifest', '--write', '--tag', TAG], io, { git: { ...GIT, dirtyPaths } })
      ).toBe(1);
      expect([existsSync(freezeDir()), text().includes('dirty-input')]).toEqual([false, true]);
    });
    it('the marker body is never printed', () => {
      writeFileSync(
        lockOf(UNITS[1]),
        '{"lockedAt":"2099-01-01T00:00:00.000Z","firstEditId":424242}'
      );
      expect(write()).toBe(1);
      expect([/not-frozen.*ch01\/m95002/.test(text()), /2099|424242/.test(text())]).toEqual([
        true,
        false,
      ]);
    });
  });

  describe('a corrupt input is a named refusal: the path, never a stack trace or the content', () => {
    // A corrupt file starts with this, and JSON.parse's message quotes the input.
    const LEAK = 'zqx-leak';
    it.each([
      '02-mt-revised/ch01/m95001-revision.json',
      '02-mt-selected/ch01/m95002-selected.json',
      'glossary/glossary-unified.json',
    ])('%s: --write --tag refuses, names it, and still prints every other refusal', (rel) => {
      writeFileSync(bookPath(rel), `${LEAK}{`);
      unlinkSync(lockOf(UNITS[1]));
      expect(write()).toBe(1);
      expect(text()).toContain(`refused: bad-input (${BOOK}/${rel}: not valid JSON)`);
      expect(text()).toMatch(/not-frozen.*ch01\/m95002/);
      expect(text()).not.toContain(LEAK);
      expect(existsSync(freezeDir())).toBe(false);
    });
    it('a dry run without --tag names a corrupt input too', () => {
      writeFileSync(bookPath('02-mt-revised/ch01/m95002-revision.json'), `${LEAK}{`);
      expect(study.main(['manifest'], io, { git: GIT })).toBe(1);
      expect(text()).toContain(
        `refused: bad-input (${BOOK}/02-mt-revised/ch01/m95002-revision.json: not valid JSON)`
      );
      expect(text()).not.toContain(LEAK);
    });
    it("the current manifest's corrupt freeze.json is a named refusal", () => {
      expect(write()).toBe(0);
      writeFileSync(path.join(freezeDir(), TAG, 'freeze.json'), `${LEAK}{`);
      out.length = 0;
      const TAG2 = `freeze-${BOOK}-2026-12-15`;
      expect(
        study.main(['manifest', '--write', '--tag', TAG2, '--supersedes', TAG], io, { git: GIT })
      ).toBe(1);
      expect(text()).toContain(
        `refused: bad-input (${BOOK}/freeze/${TAG}/freeze.json: not valid JSON)`
      );
      expect(text()).not.toContain(LEAK);
      expect(existsSync(path.join(freezeDir(), TAG2))).toBe(false);
    });
  });

  describe('tags (Review Focus 5)', () => {
    it('an existing freeze/<tag>/ directory is refused and left exactly as it was', () => {
      const dir = path.join(freezeDir(), TAG);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'keep.txt'), 'x');
      expect(write()).toBe(1);
      expect([readdirSync(dir), text().includes('manifest-exists')]).toEqual([['keep.txt'], true]);
    });
    it('writeManifest itself refuses an existing directory with code REFUSED', () => {
      const built = study.buildManifest({ book: BOOK, tag: TAG, git: GIT });
      mkdirSync(path.join(freezeDir(), TAG), { recursive: true });
      expect(() => study.writeManifest({ book: BOOK, tag: TAG, ...built })).toThrow(
        expect.objectContaining({ code: 'REFUSED' })
      );
    });
    it('a non-empty freeze/<tag>/ that appears after the existence check is refused at the rename', () => {
      const built = study.buildManifest({ book: BOOK, tag: TAG, git: GIT });
      const dir = path.join(freezeDir(), TAG);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'keep.txt'), 'x');
      const fs = require('fs');
      const realExists = fs.existsSync;
      const spy = vi
        .spyOn(fs, 'existsSync')
        .mockImplementation((p) => (p === dir ? false : realExists(p)));
      try {
        expect(() => study.writeManifest({ book: BOOK, tag: TAG, ...built })).toThrow(
          expect.objectContaining({ code: 'REFUSED' })
        );
      } finally {
        spy.mockRestore();
      }
      expect(readdirSync(dir)).toEqual(['keep.txt']);
      expect(readdirSync(bookPath()).filter((n) => n.startsWith('.freeze-tmp-'))).toEqual([]);
    });
    it.each([
      'freeze-2026-12-01',
      `freeze-${BOOK}-2026-1-01`,
      `freeze-${BOOK}-2026-12-01x`,
      `freeze-${BOOK}-2026-13-01`,
      `freeze-liffraedi-2e-2026-12-01`,
      `../freeze-${BOOK}-2026-12-01`,
    ])('a malformed tag %s is a usage error and writes nothing', (bad) => {
      expect(study.main(['manifest', '--write', '--tag', bad], io, { git: GIT })).toBe(1);
      expect([existsSync(freezeDir()), text().includes(`freeze-${BOOK}-YYYY-MM-DD`)]).toEqual([
        false,
        true,
      ]);
    });
    it('buildManifest throws code USAGE for a malformed tag', () => {
      expect(() => study.buildManifest({ book: BOOK, tag: 'freeze-x', git: GIT })).toThrow(
        expect.objectContaining({ code: 'USAGE' })
      );
    });
    it('--manifest is a usage error for manifest', () => {
      expect(study.main(['manifest', '--manifest', 'x'], io, { git: GIT })).toBe(1);
      expect(text()).toContain('--manifest applies to check only');
    });
    it('--write without --tag is a usage error', () => {
      expect(study.main(['manifest', '--write'], io, { git: GIT })).toBe(1);
      expect([existsSync(freezeDir()), text().includes('--write needs --tag')]).toEqual([
        false,
        true,
      ]);
    });
  });

  describe('supersedes (spec §6.6)', () => {
    const TAG2 = `freeze-${BOOK}-2026-12-15`;
    it('build ruling R1 (docs/superpowers/specs/2026-11-19-g17-build-rulings.md): --supersedes naming a tag with no current manifest is refused; nothing written', () => {
      expect(write('--supersedes', `freeze-${BOOK}-2026-11-01`)).toBe(1);
      expect([existsSync(freezeDir()), text().includes('supersedes-not-current')]).toEqual([
        false,
        true,
      ]);
    });
    it('a re-cut naming the current manifest is written, supersedes it and becomes current', () => {
      expect(write()).toBe(0);
      expect(
        study.main(['manifest', '--write', '--tag', TAG2, '--supersedes', TAG], io, { git: GIT })
      ).toBe(0);
      const cur = study.currentManifest({ book: BOOK });
      expect([path.basename(cur.dir), cur.header.supersedes]).toEqual([TAG2, TAG]);
    });
    it('--supersedes naming a superseded (not current) manifest is refused', () => {
      const TAG3 = `freeze-${BOOK}-2026-12-20`;
      const run = (tag, sup) =>
        study.main(['manifest', '--write', '--tag', tag, '--supersedes', sup], io, { git: GIT });
      expect([write(), run(TAG2, TAG)]).toEqual([0, 0]);
      out.length = 0;
      expect(run(TAG3, TAG)).toBe(1);
      expect([
        existsSync(path.join(freezeDir(), TAG3)),
        text().includes('supersedes-not-current'),
      ]).toEqual([false, true]);
    });
    it('a write is refused while two manifests are current (ambiguous)', () => {
      for (const t of [TAG, TAG2]) {
        const built = study.buildManifest({ book: BOOK, tag: t, git: GIT });
        study.writeManifest({ book: BOOK, tag: t, ...built });
      }
      const TAG3 = `freeze-${BOOK}-2026-12-20`;
      expect(study.main(['manifest', '--write', '--tag', TAG3], io, { git: GIT })).toBe(1);
      expect([
        existsSync(path.join(freezeDir(), TAG3)),
        text().includes('ambiguous-manifests'),
      ]).toEqual([false, true]);
    });
    it('a second manifest without --supersedes is refused while one is current', () => {
      expect(write()).toBe(0);
      expect(study.main(['manifest', '--write', '--tag', TAG2], io, { git: GIT })).toBe(1);
      expect([existsSync(path.join(freezeDir(), TAG2)), text().includes('current-exists')]).toEqual(
        [false, true]
      );
    });
  });
});

describe('currentManifest', () => {
  const put = (tag, supersedes = null) => {
    const built = study.buildManifest({ book: BOOK, tag, supersedes, git: GIT });
    return study.writeManifest({ book: BOOK, tag, ...built });
  };
  it('is null when no manifest exists', () => {
    expect(study.currentManifest({ book: BOOK })).toBe(null);
  });
  it('is the only manifest when there is one', () => {
    const dir = put(TAG);
    expect(study.currentManifest({ book: BOOK }).dir).toBe(dir);
  });
  it('throws code AMBIGUOUS when two manifests supersede nothing', () => {
    put(TAG);
    put(`freeze-${BOOK}-2026-12-15`);
    expect(() => study.currentManifest({ book: BOOK })).toThrow(
      expect.objectContaining({ code: 'AMBIGUOUS' })
    );
  });
});
