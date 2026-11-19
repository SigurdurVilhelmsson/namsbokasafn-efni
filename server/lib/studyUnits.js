/**
 * studyUnits (G1.7, spec §6.1): the one list of a book's study units.
 *
 * G-1g (`scripts/read-research-preconditions.js`) and the freeze script both enumerate units
 * through here, so they cannot disagree about what a unit is. A unit is one editable module: a
 * `<id>-segments.en.md` file under `02-for-mt/<chapterDir>/` whose id is one the module route serves.
 */
const fs = require('fs');
const path = require('path');
const { chapterFromDir, compareChapters } = require('./chapterLabel');

const UNIT_ID = /^(m\d{5}|chapter-metadata)$/; // what the module route serves (validateModule, validateParams.js)

/**
 * @param {{ book: string, booksDir: string }} args
 * @returns {Array<{ unit: string, chapterDir: string, chapter: number, moduleId: string,
 *   mtOutput: string, enSource: string }>} sorted by chapter (appendices last), then module id.
 *   Throws the underlying ENOENT when the book has no 02-for-mt directory.
 */
function listStudyUnits({ book, booksDir }) {
  const forMt = path.join(booksDir, book, '02-for-mt');
  const units = [];
  for (const chapterDir of fs.readdirSync(forMt)) {
    const chapter = chapterFromDir(chapterDir);
    if (chapter === null) continue;
    for (const f of fs.readdirSync(path.join(forMt, chapterDir))) {
      if (!f.endsWith('-segments.en.md')) continue; // skips a legacy -segments(b).en.md file, should one reappear (the 49 were removed, §C225)
      const moduleId = f.slice(0, -'-segments.en.md'.length);
      if (!UNIT_ID.test(moduleId)) continue; // skips exercises-segments.en.md, as listChapterModules does
      units.push({
        unit: `${chapterDir}/${moduleId}`,
        chapterDir,
        chapter,
        moduleId,
        mtOutput: path.join(
          booksDir,
          book,
          '02-mt-output',
          chapterDir,
          `${moduleId}-segments.is.md`
        ),
        enSource: path.join(forMt, chapterDir, f),
      });
    }
  }
  return units.sort(
    (a, b) =>
      compareChapters(a.chapter, b.chapter) ||
      (a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0)
  );
}

module.exports = { listStudyUnits, UNIT_ID };
