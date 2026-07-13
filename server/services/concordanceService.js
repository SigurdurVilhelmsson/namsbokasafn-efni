/**
 * concordanceService — searchable index of applied EN↔IS faithful segments.
 *
 * Backs two MTPE-throughput features (editorial-throughput roadmap Unit 2):
 *   - concordance search: "how did we translate this before?" inside the editor;
 *   - exact-match review deduplication: when the same EN sentence was already
 *     reviewed and approved elsewhere, surface that human-verified translation
 *     so the reviewer confirms rather than re-reviews the MT draft.
 *
 * Fuzzy matching is intentionally absent (MTPE: a fresh MT of the actual
 * sentence beats a patched stale match). Only normalized exact matches are
 * used for deduplication; FTS5 powers free-text concordance lookups.
 *
 * The index (`tm_segments` + `tm_segments_fts`, migration 036) is kept current
 * by indexModule(), called from applyApprovedEdits after each apply, and can be
 * rebuilt wholesale by the backfill CLI.
 */
const path = require('path');
const Database = require('better-sqlite3');
const log = require('../lib/logger');
const segmentParser = require('./segmentParser');
const resolveDbPath = require('../lib/dbPath');

const DB_PATH = resolveDbPath();

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

// ─── Text helpers ─────────────────────────────────────────────────────

/**
 * Strip inline bracket/legacy markers to plain text (mirror of
 * tools/generate-tm.js stripMarkers; kept in CJS for the server). MATH
 * placeholders are preserved; ambiguous single-char legacy markers are left.
 * Also unwraps B4 id-anchored markers ([[term:]]/[[fn:]]/[[u:]]/[[em:]]) to
 * their display text.
 *
 * @param {string} text
 * @returns {string}
 */
function stripMarkers(text) {
  if (!text) return '';
  return (
    text
      .replace(/\[\[(?:link|xref|docref):([^\]|]*)\|[^\]]*\]\]/g, '$1')
      .replace(/ ?\[\[(?:xref|docref):[^\]]*\]\]/g, '')
      .replace(/\[\[(?:i|b|sub|sup):([^\]]*)\]\]/g, '$1')
      .replace(/\+\+([^+]+)\+\+/g, '$1')
      .replace(/\{\{([a-z]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, '$2')
      // B4 id-anchored markers: keep the display text (left of the pipe).
      // Placed AFTER the inline rule so nested [[sub:]] inside term text is
      // already unwrapped when this runs.
      .replace(/\[\[(?:term|fn|em):([^\]|]*)\|[^\]]*\]\]/g, '$1')
      .replace(/\[\[(?:term|fn|u):([^\]]*)\]\]/g, '$1')
  );
}

/** Clean display text: strip markers, flatten newlines, collapse spaces. */
function cleanText(text) {
  return stripMarkers(text)
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Normalized EN for exact-match lookups: cleaned + lowercased. */
function normalizeEn(text) {
  return cleanText(text).toLowerCase();
}

// ─── Indexing ─────────────────────────────────────────────────────────

/**
 * Index (or re-index) a module's applied faithful segment pairs.
 * Reads the freshly-written faithful file via segmentParser; only segments
 * with both EN and IS content are stored. Replaces any prior rows for the
 * module so a re-apply keeps the index in sync.
 *
 * @param {string} book
 * @param {number|string} chapter
 * @param {string} moduleId
 * @returns {{ indexed: number, skipped: number }}
 */
function indexModule(book, chapter, moduleId) {
  const conn = getDb();
  let data;
  try {
    data = segmentParser.loadModuleForEditing(book, chapter, moduleId);
  } catch (err) {
    log.warn({ err, book, moduleId }, 'Concordance index skipped — module not loadable');
    return { indexed: 0, skipped: 0 };
  }

  const chapterLabel = String(chapter);
  const rows = [];
  let skipped = 0;
  for (const seg of data.segments) {
    const en = cleanText(seg.en);
    const is = cleanText(seg.is);
    if (!en || !is) {
      skipped++;
      continue;
    }
    rows.push({ segmentId: seg.segmentId, en, is, enNorm: normalizeEn(seg.en) });
  }

  const tx = conn.transaction(() => {
    // Remove old FTS mirror rows for this module, then the canonical rows.
    const oldIds = conn
      .prepare(`SELECT id FROM tm_segments WHERE book = ? AND module_id = ?`)
      .all(book, moduleId);
    const delFts = conn.prepare(
      `INSERT INTO tm_segments_fts(tm_segments_fts, rowid, en_text, is_text)
       VALUES('delete', ?, ?, ?)`
    );
    const getRow = conn.prepare(`SELECT id, en_text, is_text FROM tm_segments WHERE id = ?`);
    for (const { id } of oldIds) {
      const r = getRow.get(id);
      if (r) delFts.run(r.id, r.en_text, r.is_text);
    }
    conn.prepare(`DELETE FROM tm_segments WHERE book = ? AND module_id = ?`).run(book, moduleId);

    const insert = conn.prepare(
      `INSERT INTO tm_segments(book, chapter, module_id, segment_id, en_text, is_text, en_norm)
       VALUES(@book, @chapter, @moduleId, @segmentId, @en, @is, @enNorm)`
    );
    const insertFts = conn.prepare(
      `INSERT INTO tm_segments_fts(rowid, en_text, is_text) VALUES(?, ?, ?)`
    );
    for (const row of rows) {
      const info = insert.run({ book, chapter: chapterLabel, moduleId, ...row });
      insertFts.run(info.lastInsertRowid, row.en, row.is);
    }
  });
  tx();

  return { indexed: rows.length, skipped };
}

/**
 * Backfill the index for every faithful module in a book (or all books).
 *
 * @param {string} [book] - omit to backfill all books under books/
 * @returns {{ modules: number, indexed: number }}
 */
function backfill(book) {
  const fs = require('fs');
  const BOOKS_DIR = segmentParser.BOOKS_DIR;
  const books = book ? [book] : safeReaddir(BOOKS_DIR);
  let modules = 0;
  let indexed = 0;

  for (const b of books) {
    const faithfulRoot = path.join(BOOKS_DIR, b, '03-faithful-translation');
    if (!fs.existsSync(faithfulRoot)) continue;
    for (const dir of safeReaddir(faithfulRoot)) {
      if (!/^ch\d+$/.test(dir) && dir !== 'appendices') continue;
      const chapter = dir === 'appendices' ? 'appendices' : parseInt(dir.replace('ch', ''), 10);
      const chDir = path.join(faithfulRoot, dir);
      for (const f of safeReaddir(chDir)) {
        if (!f.endsWith('-segments.is.md')) continue;
        const moduleId = f.replace('-segments.is.md', '');
        const r = indexModule(b, chapter, moduleId);
        modules++;
        indexed += r.indexed;
      }
    }
  }
  return { modules, indexed };
}

function safeReaddir(dir) {
  const fs = require('fs');
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

// ─── Search & lookups ─────────────────────────────────────────────────

/** Escape a user query for an FTS5 MATCH as a single quoted phrase. */
function ftsPhrase(q) {
  return '"' + String(q).replace(/"/g, '""') + '"';
}

/**
 * Concordance search across EN and IS text (book-scoped, exact phrase).
 *
 * @param {string} query
 * @param {{ book: string, limit?: number }} opts
 * @returns {Array<{book,chapter,module_id,segment_id,en_text,is_text}>}
 */
function search(query, { book, limit = 25 } = {}) {
  const q = (query || '').trim();
  if (q.length < 2 || !book) return [];
  const conn = getDb();
  return conn
    .prepare(
      `SELECT t.book, t.chapter, t.module_id, t.segment_id, t.en_text, t.is_text
       FROM tm_segments_fts f
       JOIN tm_segments t ON t.id = f.rowid
       WHERE f.tm_segments_fts MATCH ? AND t.book = ?
       ORDER BY rank
       LIMIT ?`
    )
    .all(ftsPhrase(q), book, limit);
}

/**
 * Exact-match review-deduplication suggestions for a module: for each EN
 * segment that has a human-approved translation of the same normalized EN in
 * another module, return that translation. Same-book matches rank first.
 *
 * @param {string} book
 * @param {number|string} chapter
 * @param {string} moduleId
 * @returns {Array<{segmentId, en, suggestion: {is_text, book, chapter, module_id}}>}
 */
function findRepetitions(book, chapter, moduleId) {
  const conn = getDb();
  let data;
  try {
    data = segmentParser.loadModuleForEditing(book, chapter, moduleId);
  } catch {
    return [];
  }

  const stmt = conn.prepare(
    `SELECT book, chapter, module_id, is_text
     FROM tm_segments
     WHERE en_norm = ? AND NOT (book = ? AND module_id = ?)
     ORDER BY (book = ?) DESC, applied_at DESC
     LIMIT 1`
  );

  const out = [];
  const seen = new Set();
  for (const seg of data.segments) {
    const enNorm = normalizeEn(seg.en);
    if (!enNorm || seen.has(seg.segmentId)) continue;
    const match = stmt.get(enNorm, book, moduleId, book);
    if (match) {
      out.push({
        segmentId: seg.segmentId,
        en: cleanText(seg.en),
        suggestion: {
          is_text: match.is_text,
          book: match.book,
          chapter: match.chapter,
          module_id: match.module_id,
        },
      });
      seen.add(seg.segmentId);
    }
  }
  return out;
}

/**
 * Chapter-level repetition audit (head-editor): EN strings that recur, with
 * whether their IS translations agree.
 *
 * @param {string} book
 * @param {number|string} [chapter] - omit for whole book
 * @param {{ limit?: number }} [opts]
 * @returns {Array<{en_text, count, distinctTranslations, agree, modules}>}
 */
function repetitionReport(book, chapter, { limit = 50 } = {}) {
  const conn = getDb();
  const params = [book];
  let where = `book = ?`;
  if (chapter !== undefined && chapter !== null && chapter !== '') {
    where += ` AND chapter = ?`;
    params.push(String(chapter));
  }
  const rows = conn
    .prepare(
      `SELECT en_norm,
              COUNT(*) AS count,
              COUNT(DISTINCT is_text) AS distinctTranslations,
              MIN(en_text) AS en_text,
              GROUP_CONCAT(DISTINCT module_id) AS modules
       FROM tm_segments
       WHERE ${where}
       GROUP BY en_norm
       HAVING count > 1
       ORDER BY (distinctTranslations > 1) DESC, count DESC
       LIMIT ?`
    )
    .all(...params, limit);

  return rows.map((r) => ({
    en_text: r.en_text,
    count: r.count,
    distinctTranslations: r.distinctTranslations,
    agree: r.distinctTranslations === 1,
    modules: r.modules ? r.modules.split(',') : [],
  }));
}

/** @internal Test-only: inject a DB instance. */
function _setTestDb(testDb) {
  db = testDb;
}

module.exports = {
  stripMarkers,
  cleanText,
  normalizeEn,
  indexModule,
  backfill,
  search,
  findRepetitions,
  repetitionReport,
  _setTestDb,
};
