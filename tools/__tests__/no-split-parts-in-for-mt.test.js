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
 * `02-mt-output/` is a different tree and is READ ONLY. Its seven split files in
 * chemistry ch05 hold Icelandic text of an earlier MT vintage and are not part
 * of this removal; the last case pins that they are still there.
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

  it('leaves the split files of the READ ONLY 02-mt-output tree alone', () => {
    const inMtOutput = chapterDirs('02-mt-output').flatMap((d) => d.files.filter(isSplitPart));
    expect(inMtOutput.length).toBe(7);
  });
});
