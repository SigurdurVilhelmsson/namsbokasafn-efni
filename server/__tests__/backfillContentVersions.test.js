/**
 * Tests for the one-off content-version backfill
 * (server/scripts/backfill-content-versions.js).
 *
 * ⚠️ Schema comes from freshMigratedDb() (every real migration), and
 * SESSIONS_DB_PATH points at that file BEFORE the script loads, so nothing can
 * reach the repo's pipeline-output/sessions.db.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const built = freshMigratedDb();
process.env.SESSIONS_DB_PATH = built.path;

const {
  findFaithfulModules,
  chapterNumFromDir,
  backfill,
} = require('../scripts/backfill-content-versions');
const contentVersionService = require('../services/contentVersionService');

describe('chapterNumFromDir', () => {
  it('maps chNN to the chapter number', () => {
    expect(chapterNumFromDir('ch01')).toBe(1);
    expect(chapterNumFromDir('ch12')).toBe(12);
  });

  it('maps appendices to -1', () => {
    expect(chapterNumFromDir('appendices')).toBe(-1);
  });

  it('returns null for anything else', () => {
    expect(chapterNumFromDir('foo')).toBeNull();
    expect(chapterNumFromDir('chapter1')).toBeNull();
  });
});

describe('findFaithfulModules', () => {
  let tmpDir;
  let booksDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'backfill-test-'));
    booksDir = join(tmpDir, 'books');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFaithful(book, chDir, moduleId) {
    const dir = join(booksDir, book, '03-faithful-translation', chDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${moduleId}-segments.is.md`), '<!-- SEG:x:para:1 -->\nhalló', 'utf-8');
  }

  it('finds faithful modules across chapters and appendices', () => {
    writeFaithful('bok', 'ch01', 'm111');
    writeFaithful('bok', 'ch01', 'm222');
    writeFaithful('bok', 'appendices', 'm999');

    const found = findFaithfulModules('bok', booksDir).sort((a, b) =>
      a.moduleId.localeCompare(b.moduleId)
    );
    expect(found).toEqual([
      { chDir: 'ch01', chapter: 1, moduleId: 'm111' },
      { chDir: 'ch01', chapter: 1, moduleId: 'm222' },
      { chDir: 'appendices', chapter: -1, moduleId: 'm999' },
    ]);
  });

  it('ignores non-segment files and unknown dirs', () => {
    writeFaithful('bok', 'ch02', 'm333');
    const junkDir = join(booksDir, 'bok', '03-faithful-translation', 'notes');
    mkdirSync(junkDir, { recursive: true });
    writeFileSync(join(junkDir, 'm444-segments.is.md'), 'x', 'utf-8'); // unknown dir → skipped
    writeFileSync(
      join(booksDir, 'bok', '03-faithful-translation', 'ch02', 'README.md'),
      'x',
      'utf-8'
    );

    const found = findFaithfulModules('bok', booksDir);
    expect(found).toEqual([{ chDir: 'ch02', chapter: 2, moduleId: 'm333' }]);
  });

  it('returns [] when the book has no faithful directory', () => {
    expect(findFaithfulModules('missing', booksDir)).toEqual([]);
  });
});

// The run itself. Its "already has history → skip" guard reads the module's
// history in that module's chapter (§C209: content_versions is read per
// chapter); a wrong chapter there reads every module as history-less and seeds
// an MT baseline on top of real history, as its newest version.
describe('backfill', () => {
  const BOOK = 'bfbook';
  const db = built.db;
  let tmpDir;
  let booksDir;

  const rowsOf = (moduleId) =>
    db
      .prepare('SELECT * FROM content_versions WHERE book = ? AND module_id = ? ORDER BY id')
      .all(BOOK, moduleId);

  function writePair(chDir, moduleId, segId, faithfulText, mtText) {
    for (const [stage, text] of [
      ['03-faithful-translation', faithfulText],
      ['02-mt-output', mtText],
    ]) {
      const dir = join(booksDir, BOOK, stage, chDir);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${moduleId}-segments.is.md`), `<!-- SEG:${segId} -->\n${text}\n`);
    }
  }

  beforeEach(() => {
    contentVersionService._setTestDb(db);
    db.exec('DELETE FROM content_versions');
    tmpDir = mkdtempSync(join(tmpdir(), 'backfill-run-'));
    booksDir = join(tmpDir, 'books');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    contentVersionService._setTestDb(null);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  afterAll(() => db.close());

  it('skips a module that has history in its chapter, seeds one that has none, and a re-run changes nothing', () => {
    writePair('ch02', 'm00002', 'm00002:para:fs-1', 'Yfirfarið.', 'Vélþýðing tvö.');
    writePair('ch05', 'm00005', 'm00005:para:fs-1', 'Yfirfarið.', 'Vélþýðing fimm.');
    contentVersionService.snapshotModule(
      BOOK,
      2,
      'm00002',
      [{ segmentId: 'm00002:para:fs-1', content: 'Raunveruleg saga.' }],
      'editor-1'
    );
    const ch02Before = rowsOf('m00002');
    expect(ch02Before).toHaveLength(1);

    backfill({ books: [BOOK], booksDir });

    // ch02 already had history: its rows are unchanged, whole rows by value.
    expect(rowsOf('m00002')).toEqual(ch02Before);
    // Positive control: ch05 had none and gained exactly its MT baseline as v1.
    const seeded = rowsOf('m00005').map(
      ({ book, chapter, module_id, segment_id, content, version, track, applied_by }) => ({
        book,
        chapter,
        module_id,
        segment_id,
        content,
        version,
        track,
        applied_by,
      })
    );
    expect(seeded).toEqual([
      {
        book: BOOK,
        chapter: 5,
        module_id: 'm00005',
        segment_id: 'm00005:para:fs-1',
        content: 'Vélþýðing fimm.',
        version: 1,
        track: 'faithful',
        applied_by: 'backfill',
      },
    ]);

    // Idempotent: a second run finds history everywhere and writes nothing.
    const table = db.prepare('SELECT * FROM content_versions ORDER BY id').all();
    backfill({ books: [BOOK], booksDir });
    expect(db.prepare('SELECT * FROM content_versions ORDER BY id').all()).toEqual(table);
  });

  it('a dry run writes nothing', () => {
    writePair('ch05', 'm00005', 'm00005:para:fs-1', 'Yfirfarið.', 'Vélþýðing fimm.');

    backfill({ books: [BOOK], booksDir, dryRun: true });
    expect(rowsOf('m00005')).toEqual([]);

    // Control: the same tree, run for real, does write.
    backfill({ books: [BOOK], booksDir });
    expect(rowsOf('m00005').map((r) => [r.version, r.applied_by])).toEqual([[1, 'backfill']]);
  });
});
