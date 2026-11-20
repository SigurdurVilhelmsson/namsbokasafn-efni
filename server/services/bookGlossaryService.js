/**
 * bookGlossaryService — what the book glossary page reads (design §5.2).
 *
 * Data only: the routes validate and answer; this module reads the layer's tables and joins
 * the names, the lookup state and the export hold. Nothing here writes.
 */
const fs = require('fs');
const path = require('path');
const { buildScope, resolve, matchKey } = require('../lib/conceptResolver');
const { displayNameFor } = require('../lib/bookGlossaryLayer');
const { houseStyleInScope } = require('../lib/bookGlossaryRules');
const { readGlossaryExportHealth } = require('../lib/glossaryExportHealth');
const segmentParser = require('./segmentParser');
const inflections = require('./bookGlossaryInflections');

let projectRoot = path.join(__dirname, '..', '..');

/** @internal Test-only: read the export status file from another project root. */
function _setProjectRoot(dir) {
  projectRoot = dir;
}

const bookIdOf = (db, slug) => {
  const row = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
  return row ? row.id : null;
};

/** @returns {boolean} whether the slug is a registered book. */
function isRegisteredBook(db, slug) {
  return bookIdOf(db, slug) !== null;
}

/**
 * Whether the book has a glossary/ directory: the exporter's own predicate for writing the
 * committed record, read from the live books root so a test's injected root is honoured.
 */
function hasGlossaryDir(slug) {
  try {
    return fs.statSync(path.join(segmentParser.BOOKS_DIR, slug, 'glossary')).isDirectory();
  } catch {
    return false;
  }
}

/** The state of one entry's inflections, for the page (design §5.4). */
function inflectionState(db, conceptId) {
  const term = db
    .prepare(
      "SELECT inflections FROM concept_term WHERE concept_id = ? AND lang = 'is' ORDER BY rank, id LIMIT 1"
    )
    .get(conceptId);
  if (term && term.inflections) {
    try {
      const list = JSON.parse(term.inflections);
      if (Array.isArray(list)) return { state: 'forms', count: list.length };
    } catch {
      // unreadable forms count as none
    }
  }
  // conceptId is a Number here: the lookup queue matches by identity.
  const looked = inflections.status(Number(conceptId));
  if (looked && looked.state === 'pending') return { state: 'pending' };
  return { state: 'exact-only', reason: looked && looked.state === 'done' ? looked.result : null };
}

/**
 * The book's exclusions and entries, as the page lists them. People are shown by display name.
 *
 * @param {object} db
 * @param {string} slug
 */
function listLayer(db, slug) {
  const bookId = bookIdOf(db, slug);
  const entries = db
    .prepare('SELECT * FROM book_glossary_entry WHERE book_id = ? ORDER BY concept_id')
    .all(bookId)
    .map((r) => ({
      conceptId: r.concept_id,
      english: db
        .prepare(
          "SELECT text FROM concept_term WHERE concept_id = ? AND lang = 'en' ORDER BY rank, id"
        )
        .all(r.concept_id)
        .map((t) => t.text),
      icelandic:
        db
          .prepare(
            "SELECT text FROM concept_term WHERE concept_id = ? AND lang = 'is' ORDER BY rank, id LIMIT 1"
          )
          .get(r.concept_id)?.text ?? null,
      reason: r.reason,
      source: r.source,
      createdBy: displayNameFor(db, r.created_by),
      createdAt: r.created_at,
      updatedBy: r.updated_by == null ? null : displayNameFor(db, r.updated_by),
      updatedAt: r.updated_at,
      inflections: inflectionState(db, r.concept_id),
    }));
  // The book entry one of whose forms an exclusion's match key names (§C243 T3).
  const claimant = new Map();
  for (const e of entries) for (const f of e.english) claimant.set(matchKey(f), e.conceptId);
  const exclusions = db
    .prepare(
      'SELECT * FROM book_glossary_exclusion WHERE book_id = ? ORDER BY match_key, concept_id'
    )
    .all(bookId)
    .map((r) => ({
      id: r.id,
      english: r.english,
      conceptId: r.concept_id,
      claimedBy: r.concept_id > 0 ? (claimant.get(r.match_key) ?? null) : null,
      idordabankiId: r.idordabanki_id,
      icelandic: r.icelandic,
      reason: r.reason,
      source: r.source,
      createdBy: displayNameFor(db, r.created_by),
      createdAt: r.created_at,
    }));
  return { exclusions, entries };
}

/**
 * Everything the page shows about one headword: how it resolves for the book now, the layer rows
 * that touch it, whether house style covers it, and the book's per-chapter preferences.
 *
 * @param {object} db
 * @param {string} slug
 * @param {string} english
 */
function lookup(db, slug, english) {
  const bookId = bookIdOf(db, slug);
  const key = matchKey(english);
  const touches = (e) => typeof e === 'string' && matchKey(e) === key;
  const { exclusions, entries } = listLayer(db, slug);
  const preferences = db
    .prepare(
      `SELECT p.chapter, p.english, t.text AS icelandic, t.concept_id AS conceptId
         FROM book_term_preference p JOIN concept_term t ON t.id = p.term_id
        WHERE p.book_id = ? ORDER BY p.chapter`
    )
    .all(bookId)
    .filter((p) => touches(p.english))
    .map(({ chapter, icelandic, conceptId }) => ({ chapter, icelandic, conceptId }));
  return {
    resolution: resolve(buildScope(db, slug, 0), english),
    layer: {
      exclusions: exclusions.filter((x) => touches(x.english)),
      entries: entries.filter((x) => x.english.some(touches)),
    },
    houseStyle: houseStyleInScope(db, bookId, english),
    preferences,
  };
}

/**
 * Whether the exporter is holding this book's layer change back, from its status file.
 *
 * @param {string} slug
 * @returns {{held: boolean, since: string|null, recordError: boolean}}
 */
function exportState(slug) {
  const health = readGlossaryExportHealth({ projectRoot, nowMs: Date.now() });
  const book = health.books[slug];
  const held = !!book && book.outcome === 'refused-layer-change';
  return {
    held,
    since: held ? (book.since ?? null) : null,
    recordError: health.record_errors.includes(slug),
  };
}

module.exports = {
  isRegisteredBook,
  hasGlossaryDir,
  listLayer,
  lookup,
  exportState,
  _setProjectRoot,
};
