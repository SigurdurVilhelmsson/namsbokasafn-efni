/**
 * Tests for the one-off content-version backfill helpers
 * (server/scripts/backfill-content-versions.js).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
const { findFaithfulModules, chapterNumFromDir } = require('../scripts/backfill-content-versions');

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
