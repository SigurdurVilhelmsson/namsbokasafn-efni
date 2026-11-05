/**
 * The serve hook in the module route (G1.1; spec §5.3, §5.4 steps 1–3 and 6, fail-soft and scope;
 * T2's route half, T3's serve half, T18's organic serve; plan Task 6).
 *
 * Drives the real GET handler on a real migrated database (SESSIONS_DB_PATH in a temp dir) over
 * synthetic modules under a temp books root, so nothing under books/ is read or written. Every
 * negative case carries its control in the same fixture: a module that mints nothing is served
 * beside one that does, and the read-only handle's failed mint is followed by the same module
 * minting on a writable one.
 */
import { mkdtempSync, rmSync, copyFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'served-serve-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const logger = require('../lib/logger');
const { sha256Text } = require('../lib/servedText');
const { writeModule, writeRaw, handlerFor, invoke, EDITOR } = require('./helpers/servedFixture');

const CHEM = 'efnafraedi-2e';
const ORGANIC = 'lifraen-efnafraedi';
// T3's control module, and the module the contentSha256 case seeds its edits on.
const M90006 = Object.freeze({
  book: CHEM,
  chapterDir: 'ch01',
  moduleId: 'm90006',
  en: [
    ['m90006:para:p', 'Pi.'],
    ['m90006:para:q', 'Qu.'],
  ],
  mt: [
    ['m90006:para:p', 'Pí.'],
    ['m90006:para:q', 'Kú.'],
  ],
});

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let get;
let reader;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  get = handlerFor(require('../routes/segment-editor'), 'get', '/:book/:chapter/:moduleId');
  reader = new Database(dbPath, { readonly: true });
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestBooksDir(realBooksDir);
  reader.close();
  rmSync(work, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function serve(book, chapterNum, moduleId, chapter = String(chapterNum)) {
  return invoke(get, { params: { book, chapter, moduleId }, chapterNum, user: EDITOR });
}

/** served_text_versions rows, read through a second (read-only) connection. */
function rows(where, ...params) {
  return reader
    .prepare(`SELECT * FROM served_text_versions WHERE ${where} ORDER BY id`)
    .all(...params);
}
const idsOf = (module) => rows('module_id = ?', module).map((r) => r.id);
const segOf = (body, id) => body.segments.find((s) => s.segmentId === id);

describe('T2, route half: each normalisation step is hashed after it, from the response object (spec §5.3)', () => {
  // [id, EN, the IS slice between this marker and the next, the served `is`, the pre-step text]
  const CASES = [
    [
      'm90001:para:trim',
      'Space.',
      '\n   Bil í kring.   \n',
      'Bil í kring.',
      '\n   Bil í kring.   \n',
    ],
    [
      'm90001:para:wrap',
      'Wrap.',
      '\nLína eitt\nlína tvö\n',
      'Lína eitt lína tvö',
      'Lína eitt\nlína tvö',
    ],
    [
      'm90001:para:esc',
      'Formula [[MATH:1]] here.',
      '\nFormúla \\[\\[MATH:1\\]\\] hér.\n',
      'Formúla [[MATH:1]] hér.',
      'Formúla \\[\\[MATH:1\\]\\] hér.',
    ],
    [
      'm90001:para:term',
      'The __atom__ is small.',
      '\n**Frumeindin** er lítil.\n',
      '__Frumeindin__ er lítil.',
      '**Frumeindin** er lítil.',
    ],
    ['m90001:para:plain', 'Plain.', '\nÓbreytt.\n', 'Óbreytt.', 'Óbreytt.'],
  ];
  const CONTROL = 'm90001:para:plain';
  let body;

  beforeAll(async () => {
    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch01',
      moduleId: 'm90001',
      en: CASES.map(([id, en]) => [id, en]),
    });
    // writeRaw, so the IS body between the markers is exact (the trim case's slice included)
    writeRaw(
      root,
      `${CHEM}/02-mt-output/ch01/m90001-segments.is.md`,
      CASES.map(([id, , slice]) => `<!-- SEG:${id} -->${slice}`).join('')
    );
    const out = await serve(CHEM, 1, 'm90001');
    expect(out.status).toBe(200);
    body = out.body;
  });

  for (const [id, , , served, preStep] of CASES) {
    it(`${id}: the served text, its hash, and the minted row agree`, () => {
      const seg = segOf(body, id);
      expect(seg.is).toBe(served);
      expect(seg.occurrence).toBe(0);
      expect(seg.baseSha256).toBe(sha256Text(served));
      const minted = rows('module_id = ? AND segment_id = ? AND occurrence = 0', 'm90001', id);
      expect(minted).toHaveLength(1);
      expect(minted[0].is_sha256).toBe(seg.baseSha256);
      expect(minted[0].is_text).toBe(seg.is);
      if (id === CONTROL) expect(sha256Text(preStep)).toBe(seg.baseSha256);
      else expect(sha256Text(preStep)).not.toBe(seg.baseSha256);
    });
  }
});

describe('T3, serve half (spec §5.2)', () => {
  const EN3 = [
    ['m90003:para:a', 'Alpha.'],
    ['m90003:para:b', 'Beta.'],
    ['m90003:para:d', 'Delta one.'],
    ['m90003:para:d', 'Delta two.'],
  ];
  const MT3 = [
    ['m90003:para:a', 'Alfa.'],
    ['m90003:para:b', 'Beta á íslensku.'],
    ['m90003:para:d', 'Delta eitt.'],
    ['m90003:para:d', 'Delta tvö.'],
  ];
  const mtPath = () => path.join(root, CHEM, '02-mt-output/ch01/m90003-segments.is.md');

  beforeAll(() => {
    writeModule(root, { book: CHEM, chapterDir: 'ch01', moduleId: 'm90003', en: EN3, mt: MT3 });
    writeModule(root, M90006);
  });

  it('serving identical text twice adds no row', async () => {
    expect((await serve(CHEM, 1, 'm90003')).status).toBe(200);
    const before = idsOf('m90003');
    expect(before.length).toBeGreaterThan(0); // control: the first serve minted
    expect((await serve(CHEM, 1, 'm90003')).status).toBe(200);
    expect(idsOf('m90003')).toEqual(before);
  });

  it('changing the Icelandic adds exactly one row, and the old one stays', async () => {
    await serve(CHEM, 1, 'm90003');
    const before = idsOf('m90003');
    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch01',
      moduleId: 'm90003',
      en: EN3,
      mt: MT3.map(([id, t]) => [id, id === 'm90003:para:b' ? 'Beta, nýr texti.' : t]),
    });
    expect((await serve(CHEM, 1, 'm90003')).status).toBe(200);
    const after = idsOf('m90003');
    const added = after.filter((id) => !before.includes(id));
    expect(added).toHaveLength(1);
    const [row] = rows('id = ?', added[0]);
    expect(row.segment_id).toBe('m90003:para:b');
    expect(row.is_text).toBe('Beta, nýr texti.');
    expect(after).toEqual(expect.arrayContaining(before));
  });

  it('changing the English adds exactly one row', async () => {
    await serve(CHEM, 1, 'm90003');
    const before = idsOf('m90003');
    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch01',
      moduleId: 'm90003',
      en: EN3.map(([id, t]) => [id, id === 'm90003:para:a' ? 'Alpha, new text.' : t]),
    });
    expect((await serve(CHEM, 1, 'm90003')).status).toBe(200);
    const after = idsOf('m90003');
    const added = after.filter((id) => !before.includes(id));
    expect(added).toHaveLength(1);
    const [row] = rows('id = ?', added[0]);
    expect(row.segment_id).toBe('m90003:para:a');
    expect(row.en_text).toBe('Alpha, new text.');
    expect(after).toEqual(expect.arrayContaining(before));
  });

  it('changing only the layer adds one row per segment, with the same is_sha256', async () => {
    const mt = await serve(CHEM, 1, 'm90003');
    expect(mt.body.isSource).toBe('mt-output');
    const before = idsOf('m90003');
    const faithful = path.join(root, CHEM, '03-faithful-translation/ch01/m90003-segments.is.md');
    mkdirSync(path.dirname(faithful), { recursive: true });
    copyFileSync(mtPath(), faithful);
    const out = await serve(CHEM, 1, 'm90003');
    expect(out.body.isSource).toBe('faithful');
    const added = rows('module_id = ?', 'm90003').filter((r) => !before.includes(r.id));
    expect(added.map((r) => [r.segment_id, r.layer]).sort()).toEqual([
      ['m90003:para:a', 'faithful'],
      ['m90003:para:b', 'faithful'],
    ]);
    for (const id of ['m90003:para:a', 'm90003:para:b']) {
      const mtSeg = segOf(mt.body, id);
      const [mtRow] = rows(
        "module_id = 'm90003' AND segment_id = ? AND layer = 'mt-output' AND is_sha256 = ? AND en_sha256 = ?",
        id,
        mtSeg.baseSha256,
        sha256Text(mtSeg.en)
      );
      const fRow = added.find((r) => r.segment_id === id);
      expect(fRow.is_sha256).toBe(mtRow.is_sha256);
      expect(fRow.en_sha256).toBe(mtRow.en_sha256);
      expect(segOf(out.body, id).baseSha256).toBe(mtSeg.baseSha256);
    }
  });

  it('a duplicated id and a layerless module mint nothing; a second module gains its own rows', async () => {
    const dup = await serve(CHEM, 1, 'm90003');
    expect(dup.status).toBe(200);
    expect(rows('segment_id = ?', 'm90003:para:d')).toEqual([]);
    const copies = dup.body.segments.filter((s) => s.segmentId === 'm90003:para:d');
    expect(copies.map((s) => s.occurrence)).toEqual([0, 1]);
    for (const s of copies) expect('baseSha256' in s).toBe(false);

    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch01',
      moduleId: 'm90002',
      en: [
        ['m90002:para:x', 'Ex.'],
        ['m90002:para:y', 'Why.'],
      ],
    });
    const layerless = await serve(CHEM, 1, 'm90002');
    expect(layerless.status).toBe(200);
    expect(layerless.body.isSource).toBeNull();
    expect(layerless.body.segments.map((s) => s.occurrence)).toEqual([0, 0]);
    expect(layerless.body.segments.filter((s) => 'baseSha256' in s)).toEqual([]);
    expect(rows('module_id = ?', 'm90002')).toEqual([]);

    // control: a second module served in the same test gains rows for exactly its segment ids
    expect(rows('module_id = ?', 'm90006')).toEqual([]);
    expect((await serve(CHEM, 1, 'm90006')).status).toBe(200);
    expect([...new Set(rows('module_id = ?', 'm90006').map((r) => r.segment_id))].sort()).toEqual([
      'm90006:para:p',
      'm90006:para:q',
    ]);
  });
});

describe('the chapter is in every key (Review Focus 2 of the index)', () => {
  it('chapter-metadata mints per chapter, and an appendix under -1', async () => {
    for (const [dir, title, titleIs] of [
      ['ch02', 'Atoms, Molecules, and Ions', 'Frumeindir, sameindir og jónir'],
      ['ch05', 'Thermochemistry', 'Varmaefnafræði'],
    ]) {
      writeModule(root, {
        book: CHEM,
        chapterDir: dir,
        moduleId: 'chapter-metadata',
        en: [[`chapter:title:${dir}`, title]],
        mt: [[`chapter:title:${dir}`, titleIs]],
      });
    }
    const chapters = () =>
      reader
        .prepare(
          `SELECT DISTINCT chapter FROM served_text_versions
            WHERE module_id = 'chapter-metadata' ORDER BY chapter`
        )
        .all()
        .map((r) => r.chapter);
    expect((await serve(CHEM, 2, 'chapter-metadata')).status).toBe(200);
    expect(chapters()).toEqual([2]);
    expect((await serve(CHEM, 5, 'chapter-metadata')).status).toBe(200);
    expect(chapters()).toEqual([2, 5]);

    writeModule(root, {
      book: CHEM,
      chapterDir: 'appendices',
      moduleId: 'm90008',
      en: [['m90008:para:z', 'Zed.']],
      mt: [['m90008:para:z', 'Seta.']],
    });
    expect((await serve(CHEM, -1, 'm90008', 'appendices')).status).toBe(200);
    expect(rows('module_id = ?', 'm90008').map((r) => [r.segment_id, r.chapter])).toEqual([
      ['m90008:para:z', -1],
    ]);
  });
});

describe('contentSha256 per edit row (spec §5.4 step 6)', () => {
  it('every edit row carries the hash of its edited_content, and the hash is not stored', async () => {
    writeModule(root, M90006);
    for (const [segmentId, originalContent, editedContent] of [
      ['m90006:para:p', 'Pí.', 'Pí, breytt.'],
      ['m90006:para:q', 'Kú.', 'Kú, „breytt“.'],
    ]) {
      segmentEditor.saveSegmentEdit({
        book: CHEM,
        chapter: 1,
        moduleId: 'm90006',
        segmentId,
        originalContent,
        editedContent,
        category: 'accuracy',
        editorNote: null,
        editorId: EDITOR.id,
        editorUsername: EDITOR.username,
      });
    }
    const { status, body } = await serve(CHEM, 1, 'm90006');
    expect(status).toBe(200);
    expect(Object.keys(body.edits).sort()).toEqual(['m90006:para:p', 'm90006:para:q']);
    const editRows = Object.values(body.edits).flat();
    expect(editRows.map((r) => r.edited_content).sort()).toEqual(['Kú, „breytt“.', 'Pí, breytt.']);
    for (const row of editRows) expect(row.contentSha256).toBe(sha256Text(row.edited_content));
    const columns = reader.pragma('table_info(segment_edits)').map((c) => c.name.toLowerCase());
    expect(columns).not.toContain('contentsha256');
    expect(columns).toContain('edited_content'); // control: the pragma reads the real table
  });
});

describe('fail-soft minting (spec §5.4)', () => {
  it('a failed mint still serves baseSha256 and logs once; an unchanged re-serve attempts no write', async () => {
    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch01',
      moduleId: 'm90007',
      en: [
        ['m90007:para:s', 'Ess.'],
        ['m90007:para:t', 'Tee.'],
      ],
      mt: [
        ['m90007:para:s', 'Ess á íslensku.'],
        ['m90007:para:t', 'Té á íslensku.'],
      ],
    });
    // m90001 was served (and minted) by the T2 describe; its files are unchanged since.
    expect(rows('module_id = ?', 'm90001').length).toBeGreaterThan(0);
    const allIds = () => rows('1 = 1').map((r) => r.id);
    const before = allIds();
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const ro = new Database(dbPath, { readonly: true });
    segmentEditor._setTestDb(ro);
    try {
      const out = await serve(CHEM, 1, 'm90007');
      expect(out.status).toBe(200);
      for (const seg of out.body.segments) expect(seg.baseSha256).toBe(sha256Text(seg.is));
      expect(out.body.segments.map((s) => s.segmentId)).toEqual(['m90007:para:s', 'm90007:para:t']);
      expect(allIds()).toEqual(before);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][1]).toMatch(/Served-version mint failed/);

      // still read-only: a module served earlier with unchanged files attempts no write
      const again = await serve(CHEM, 1, 'm90001');
      expect(again.status).toBe(200);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      segmentEditor._setTestDb(null);
      ro.close();
    }
    // control: the same module mints on a writable handle, so the read-only handle was the cause
    expect((await serve(CHEM, 1, 'm90007')).status).toBe(200);
    expect(rows('module_id = ?', 'm90007').map((r) => r.segment_id)).toEqual([
      'm90007:para:s',
      'm90007:para:t',
    ]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('T18, PR1 half: an organic serve mints nothing', () => {
  it('organic serves with occurrence and no baseSha256, and mints no row; its chemistry twin mints', async () => {
    const pairs = (m) => ({
      en: [
        [`${m}:para:x`, 'The same English.'],
        [`${m}:para:y`, 'More English.'],
      ],
      mt: [
        [`${m}:para:x`, 'Sama íslenskan.'],
        [`${m}:para:y`, 'Meiri íslenska.'],
      ],
    });
    writeModule(root, {
      book: ORGANIC,
      chapterDir: 'ch01',
      moduleId: 'm90004',
      ...pairs('m90004'),
    });
    writeModule(root, { book: CHEM, chapterDir: 'ch01', moduleId: 'm90005', ...pairs('m90005') });

    const organic = await serve(ORGANIC, 1, 'm90004');
    expect(organic.status).toBe(200);
    expect(organic.body.isSource).toBe('mt-output');
    expect(organic.body.segments.map((s) => s.occurrence)).toEqual([0, 0]);
    expect(organic.body.segments.filter((s) => 'baseSha256' in s)).toEqual([]);
    const twin = await serve(CHEM, 1, 'm90005');
    expect(twin.status).toBe(200);

    expect(
      reader
        .prepare(
          `SELECT module_id, segment_id FROM served_text_versions
            WHERE book = 'lifraen-efnafraedi' ORDER BY module_id, segment_id`
        )
        .all()
    ).toEqual([]);
    // control, same fixture: the chemistry twin minted its two rows (values, not a count)
    expect(
      reader
        .prepare(
          `SELECT module_id, segment_id FROM served_text_versions
            WHERE book = 'efnafraedi-2e' AND module_id = 'm90005' ORDER BY module_id, segment_id`
        )
        .all()
    ).toEqual([
      { module_id: 'm90005', segment_id: 'm90005:para:x' },
      { module_id: 'm90005', segment_id: 'm90005:para:y' },
    ]);
  });
});
