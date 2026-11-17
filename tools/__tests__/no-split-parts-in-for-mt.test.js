/**
 * Register §C225: `02-for-mt/` holds no legacy split parts.
 *
 * Chemistry's `02-for-mt/` held 49 tracked files named like
 * `m68709-segments(b).en.md`: parts of segment files that the archived protect
 * step split for upload to a web UI, still in its `{{SEG:` form. They sat beside
 * the current segment files for months. No live reader used their content:
 * every selector takes `-segments.en.md` and so skips them by name (the paid MT
 * tool, the server's module list, the re-MT battery's unit list, the corpus
 * export). The one place that read their names collapsed each onto its base
 * file. Re-extraction never removed them, so they were removed by hand.
 *
 * The first case is red while the files are in the tree.
 *
 * The second is the reason the removal loses nothing, and holds before and
 * after it: in every chapter directory, the sections you get by collapsing split
 * parts onto their base are exactly the base files. So every split part had its
 * base beside it, and no section existed only as a split part.
 *
 * `02-mt-output/` held seven more, in chemistry ch05: parts `(b)`, `(c)` and
 * `(d)` of `m68724`, `m68726` and `m68727`, named like `m68724-segments(b).is.md`.
 * They were the web-UI translation of February 2026 in the `{{SEG:` form. That
 * tree is READ ONLY, so they stayed when the 49 went, and this file pinned that
 * they were still there. [USER] decided on 2026-11-17 to remove them, after a
 * comparison found that all 553 of their segments are the same text as the base
 * files of that date in git history. The second block is red while they are in
 * the tree. Their base files, and the `*-segments-links.json` files beside
 * them, are not part of that removal: `tools/lib/mt-layers.js` reads the links
 * files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { isSplitPart, getUniqueSections } = require('../../server/services/splitFileUtils');

const BOOKS = path.resolve(import.meta.dirname, '..', '..', 'books');

/**
 * Every chapter directory of a stage tree, across all books.
 *
 * @param {string} stage e.g. '02-for-mt'
 * @returns {Array<{rel: string, files: string[]}>}
 */
function chapterDirs(stage) {
  const dirs = [];
  for (const book of fs.readdirSync(BOOKS)) {
    const tree = path.join(BOOKS, book, stage);
    if (!fs.existsSync(tree) || !fs.statSync(tree).isDirectory()) continue;
    for (const d of fs.readdirSync(tree)) {
      const full = path.join(tree, d);
      if (fs.statSync(full).isDirectory()) {
        dirs.push({ rel: `${book}/${stage}/${d}`, files: fs.readdirSync(full) });
      }
    }
  }
  return dirs;
}

const forMt = chapterDirs('02-for-mt');
const enFiles = (files) => files.filter((f) => f.endsWith('.en.md'));

describe('02-for-mt holds no legacy split parts (§C225)', () => {
  it('has no file named like a split part, in any book', () => {
    const found = forMt.flatMap((d) => d.files.filter(isSplitPart).map((f) => `${d.rel}/${f}`));
    expect(found).toEqual([]);
  });

  it('no section exists only as a split part: collapsing them gives exactly the base files', () => {
    const differing = forMt
      .filter((d) => {
        const collapsed = getUniqueSections(enFiles(d.files)).sort();
        const bases = getUniqueSections(enFiles(d.files).filter((f) => !isSplitPart(f))).sort();
        return JSON.stringify(collapsed) !== JSON.stringify(bases);
      })
      .map((d) => d.rel);
    expect(differing).toEqual([]);
  });

  it('control: the scan sees segment files in more than one book', () => {
    const booksWithFiles = new Set(
      forMt.filter((d) => enFiles(d.files).length > 0).map((d) => d.rel.split('/')[0])
    );
    expect(booksWithFiles.size).toBeGreaterThan(1);
  });

  it('control: the name test does recognise a split part', () => {
    expect(isSplitPart('m68709-segments(b).en.md')).toBe(true);
  });
});

const mtOutput = chapterDirs('02-mt-output');
const isFiles = (files) => files.filter((f) => f.endsWith('.is.md'));

describe('02-mt-output holds no legacy split parts (§C225)', () => {
  it('has no file named like a split part, in any book', () => {
    const found = mtOutput.flatMap((d) => d.files.filter(isSplitPart).map((f) => `${d.rel}/${f}`));
    expect(found).toEqual([]);
  });

  it('no section exists only as a split part: collapsing them gives exactly the base files', () => {
    const differing = mtOutput
      .filter((d) => {
        const collapsed = getUniqueSections(isFiles(d.files)).sort();
        const bases = getUniqueSections(isFiles(d.files).filter((f) => !isSplitPart(f))).sort();
        return JSON.stringify(collapsed) !== JSON.stringify(bases);
      })
      .map((d) => d.rel);
    expect(differing).toEqual([]);
  });

  it('control: the scan sees the segment files of chemistry ch05, where the seven were', () => {
    const ch05 = mtOutput.find((d) => d.rel === 'efnafraedi-2e/02-mt-output/ch05');
    expect(isFiles(ch05.files)).toContain('m68724-segments.is.md');
  });

  it('control: the name test does recognise an Icelandic split part', () => {
    expect(isSplitPart('m68724-segments(b).is.md')).toBe(true);
  });

  it('keeps the links files beside the base files in chemistry ch05', () => {
    const ch05 = mtOutput.find((d) => d.rel === 'efnafraedi-2e/02-mt-output/ch05');
    expect(ch05.files.filter((f) => f.endsWith('-segments-links.json')).sort()).toEqual([
      'm68724-segments-links.json',
      'm68726-segments-links.json',
      'm68727-segments-links.json',
    ]);
  });
});
