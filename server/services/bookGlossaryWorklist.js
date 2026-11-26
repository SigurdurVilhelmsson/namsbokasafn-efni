/**
 * The book glossary worklist scan (design §5.5): which segments of a book still hold the old
 * Icelandic word of one history row. Read-only; stores nothing.
 *
 * This is the only module that requires segmentEditorService, whose connection and books root are
 * fixed outside this module's control, so the pure lib modules stay out of its module graph.
 */
const { readChange, worklistSpec } = require('../lib/worklistSpec');
const { matchSegment, excerptOf } = require('../lib/worklistMatch');
const { listStudyUnits } = require('../lib/studyUnits');
const segmentParser = require('./segmentParser');
const segmentEditorService = require('./segmentEditorService');
const log = require('../lib/logger');

const EMPTY = { units: 0, unreadable: [], chapters: [], total: 0 };

/** Units of the book; none when it has no 02-for-mt/ (plan ruling Q4). */
function unitsOf(book) {
  try {
    // BOOKS_DIR is read here, at call time: a test reassigns it after this module loads.
    return listStudyUnits({ book, booksDir: segmentParser.BOOKS_DIR });
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

const linkFor = (book, chapter, moduleId, segmentId) =>
  `/editor?book=${encodeURIComponent(book)}&chapter=${chapter}&module=${encodeURIComponent(moduleId)}&segment=${encodeURIComponent(segmentId)}`;

/**
 * @param {object} db
 * @param {string} bookSlug
 * @param {number} changeId
 * @returns {null|object} null when the change is not this book's
 */
function buildWorklist(db, bookSlug, changeId) {
  const row = readChange(db, bookSlug, changeId);
  if (!row) return null;
  const spec = worklistSpec(db, bookSlug, row);
  const head = {
    changeId: row.id,
    action: row.action,
    kind: spec.kind,
    reason: spec.reason,
    english: spec.english,
    old: spec.old,
    newIcelandic: spec.newIcelandic,
  };
  if (spec.kind === null) return { ...head, ...EMPTY };

  const units = unitsOf(bookSlug);
  const unreadable = [];
  let firstError = null;
  let firstErrorUnit = null;
  const byChapter = new Map();
  let total = 0;
  for (const u of units) {
    // Reading AND matching one unit sit in one try, and its hits are kept only if the whole unit
    // finished: a fault in either makes the unit unreadable, never the whole list a 500 (§C244 M10).
    let items;
    try {
      items = segmentEditorService
        .buildEffectiveSegments(bookSlug, u.chapter, u.moduleId)
        .flatMap((s) => {
          const hit = matchSegment(
            { enContent: s.enContent, isContent: s.isContent },
            { english: spec.english, oldForms: spec.oldForms, newIcelandic: spec.newIcelandic }
          );
          if (!hit) return [];
          return [
            {
              moduleId: u.moduleId,
              segmentId: s.segmentId,
              english: hit.english,
              excerpt: excerptOf(s.isContent, hit.index, hit.length),
              link: linkFor(bookSlug, u.chapter, u.moduleId, s.segmentId),
            },
          ];
        });
    } catch (err) {
      unreadable.push(u.unit);
      if (firstError === null) {
        firstError = err;
        firstErrorUnit = u.unit;
      }
      continue;
    }
    if (items.length === 0) continue;
    if (!byChapter.has(u.chapter)) byChapter.set(u.chapter, []);
    byChapter.get(u.chapter).push(...items);
    total += items.length;
  }
  // Once per request, not per unit: a database fault would otherwise log once for every unit.
  // The page names the units; the log keeps the cause and the unit it came from (§C244 N4).
  if (unreadable.length > 0) {
    log.warn(
      { err: firstError, unit: firstErrorUnit, book: bookSlug, units: unreadable.length },
      'book glossary worklist: units could not be read'
    );
  }
  return {
    ...head,
    units: units.length,
    unreadable,
    chapters: [...byChapter].map(([chapter, items]) => ({ chapter, items })),
    total,
  };
}

module.exports = { buildWorklist };
