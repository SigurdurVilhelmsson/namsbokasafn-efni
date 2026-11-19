/**
 * studyUnits (G1.7, spec §6.1): the one list of study units, read by G-1g and by the freeze script.
 * The fixture is G-1g's own: a locked unit, an unlocked one, chapter-metadata, an appendices unit
 * without MT, and the files and directories that are not units (the controls).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { listStudyUnits, UNIT_ID } = require('../lib/studyUnits');

const BOOK = 'efnafraedi';

describe('listStudyUnits', () => {
  let root;
  let booksDir;
  const put = (layer, rel) => {
    const p = path.join(booksDir, BOOK, layer, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '<!-- SEG:x:para:a -->\nx\n');
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-units-'));
    booksDir = path.join(root, 'books');
    put('02-for-mt', 'appendices/m94203-segments.en.md');
    put('02-for-mt', 'ch02/chapter-metadata-segments.en.md');
    put('02-for-mt', 'ch01/m94202-segments.en.md');
    put('02-for-mt', 'ch01/m94201-segments.en.md');
    put('02-for-mt', 'ch01/m94204-segments(b).en.md'); // legacy
    put('02-for-mt', 'ch01/exercises-segments.en.md'); // not an editable module
    put('02-for-mt', 'tmp/m94205-segments.en.md'); // not a chapter directory
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('lists the four real units in chapter then module order, appendices last', () => {
    expect(listStudyUnits({ book: BOOK, booksDir }).map((u) => u.unit)).toEqual([
      'ch01/m94201',
      'ch01/m94202',
      'ch02/chapter-metadata',
      'appendices/m94203',
    ]);
  });

  it('carries the chapter number, directory and module id', () => {
    const us = listStudyUnits({ book: BOOK, booksDir });
    expect(us.map((u) => [u.chapter, u.chapterDir, u.moduleId])).toEqual([
      [1, 'ch01', 'm94201'],
      [1, 'ch01', 'm94202'],
      [2, 'ch02', 'chapter-metadata'],
      [-1, 'appendices', 'm94203'],
    ]);
  });

  it('names the MT output and English source paths', () => {
    const u = listStudyUnits({ book: BOOK, booksDir })[0];
    expect(u.mtOutput).toBe(
      path.join(booksDir, BOOK, '02-mt-output', 'ch01', 'm94201-segments.is.md')
    );
    expect(u.enSource).toBe(
      path.join(booksDir, BOOK, '02-for-mt', 'ch01', 'm94201-segments.en.md')
    );
  });

  it('throws ENOENT when 02-for-mt is absent', () => {
    expect(() => listStudyUnits({ book: 'no-such-book', booksDir })).toThrow(/ENOENT/);
  });

  it('exports the unit-id pattern', () => {
    expect([
      UNIT_ID.test('m12345'),
      UNIT_ID.test('chapter-metadata'),
      UNIT_ID.test('exercises'),
    ]).toEqual([true, true, false]);
  });
});
