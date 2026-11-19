/**
 * The book glossary layer's write API (spec 2026-11-19-book-glossary-layer-design §5.1-§5.2)
 * and its committed record (§5.4).
 *
 * Write API (`addExclusion`, `addEntry`): a book can exclude a headword (concept_id 0), exclude
 * one concept for a headword, or own an entry. Every added row writes one book_glossary_change
 * row in the SAME transaction. Refusals throw an Error with `code: 'LAYER_REFUSED'` and a
 * one-line message.
 *
 * Record: `buildBookGlossaryRecord` builds books/<book>/glossary/book-glossary.json's content,
 * `writeBookGlossaryRecord` writes it when it changed, and `createBookGlossaryRecordFn` is the
 * `recordFn` the glossary export (server/scripts/export-terminology.js) calls for each book.
 *
 * ⚠️ houseStyleTerms.js must NOT require this module: conceptResolver already requires
 * houseStyleTerms, and this module requires conceptResolver (require cycle).
 */
const fs = require('fs');
const path = require('path');
const { matchKey } = require('./conceptResolver');
const { BOOK_LAYER_SOURCE } = require('./houseStyleTerms');

function refuse(message) {
  const err = new Error(message);
  err.code = 'LAYER_REFUSED';
  return err;
}

function bookIdOf(db, slug) {
  const row = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
  if (!row) throw refuse(`unknown book: ${slug}`);
  return row.id;
}

/**
 * A concept carries the English iff it has an en term whose matchKey equals the form's:
 * build ruling R1 (docs/superpowers/specs/2026-11-19-book-glossary-build-rulings.md).
 */
function conceptCarries(db, conceptId, english) {
  const key = matchKey(english);
  return db
    .prepare("SELECT text FROM concept_term WHERE concept_id = ? AND lang = 'en'")
    .all(conceptId)
    .some((r) => matchKey(r.text) === key);
}

/** Book entries (concept ids) that carry the given English for this book. */
function entriesClaiming(db, bookId, english) {
  const key = matchKey(english);
  return db
    .prepare(
      `SELECT e.concept_id, t.text FROM book_glossary_entry e
         JOIN concept_term t ON t.concept_id = e.concept_id AND t.lang = 'en'
        WHERE e.book_id = ?`
    )
    .all(bookId)
    .filter((r) => matchKey(r.text) === key)
    .map((r) => r.concept_id);
}

function writeHistory(db, bookId, a, action, english, afterObj) {
  db.prepare(
    `INSERT INTO book_glossary_change (book_id, at, by, action, english, before_json, after_json, reason, source)
     VALUES (?,?,?,?,?,NULL,?,?,?)`
  ).run(bookId, a.at, a.by, action, english, JSON.stringify(afterObj), a.reason, a.source);
}

/**
 * @param {object} db
 * @param {{book:string, english:string, conceptId?:number, reason:string, source:string, by:string, at?:string}} a
 * @returns {{status:'added'|'already', id:number}}
 */
function addExclusion(db, a) {
  const at = a.at || new Date().toISOString();
  const conceptId = a.conceptId || 0;
  return db.transaction(() => {
    const bookId = bookIdOf(db, a.book);
    const key = matchKey(a.english);
    const existing = db
      .prepare(
        'SELECT id FROM book_glossary_exclusion WHERE book_id = ? AND match_key = ? AND concept_id = ?'
      )
      .get(bookId, key, conceptId);
    if (existing) return { status: 'already', id: existing.id };

    let idordabankiId = null;
    let icelandic = null;
    if (conceptId > 0) {
      const c = db.prepare('SELECT idordabanki_id FROM concept WHERE id = ?').get(conceptId);
      if (!c) throw refuse(`concept ${conceptId} does not exist`);
      if (!conceptCarries(db, conceptId, a.english)) {
        throw refuse(`concept ${conceptId} does not carry the English "${a.english}"`);
      }
      idordabankiId = c.idordabanki_id ?? null;
      const is = db
        .prepare(
          "SELECT text FROM concept_term WHERE concept_id = ? AND lang = 'is' ORDER BY rank, id LIMIT 1"
        )
        .get(conceptId);
      icelandic = is ? is.text : null;
    } else if (entriesClaiming(db, bookId, a.english).length > 0) {
      throw refuse(`conflict: a book entry claims the headword "${a.english}"`);
    }

    const id = Number(
      db
        .prepare(
          `INSERT INTO book_glossary_exclusion
             (book_id, english, match_key, concept_id, idordabanki_id, icelandic, reason, source, created_by, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          bookId,
          a.english,
          key,
          conceptId,
          idordabankiId,
          icelandic,
          a.reason,
          a.source,
          a.by,
          at
        ).lastInsertRowid
    );
    // spec §5.4: the committed history omits the Icelandic of an excluded row.
    writeHistory(db, bookId, { ...a, at }, 'exclude', a.english, {
      english: a.english,
      conceptId,
      idordabankiId,
    });
    return { status: 'added', id };
  })();
}

/**
 * @param {object} db
 * @param {{book:string, english:string[], icelandic:string, replaces?:number[], reason:string, source:string, by:string, at?:string}} a
 * @returns {{status:'added'|'already', conceptId:number}}
 */
function addEntry(db, a) {
  const at = a.at || new Date().toISOString();
  const replaces = a.replaces || [];
  const forms = a.english;
  if (!Array.isArray(forms) || forms.length === 0)
    throw refuse('an entry needs at least one English form');
  if (!a.icelandic) throw refuse('an entry needs an Icelandic term');
  return db.transaction(() => {
    const bookId = bookIdOf(db, a.book);
    const keys = new Set(forms.map(matchKey));

    // An existing book entry carrying any form: identical -> already, otherwise refuse.
    for (const f of forms) {
      for (const cid of entriesClaiming(db, bookId, f)) {
        const ens = db
          .prepare("SELECT text FROM concept_term WHERE concept_id = ? AND lang = 'en'")
          .all(cid)
          .map((r) => matchKey(r.text));
        const is = db
          .prepare("SELECT text FROM concept_term WHERE concept_id = ? AND lang = 'is'")
          .all(cid)
          .map((r) => r.text);
        const sameForms = ens.length === keys.size && ens.every((k) => keys.has(k));
        if (sameForms && is.length === 1 && is[0] === a.icelandic) {
          // 'already' only if every requested replacement is currently excluded. Never write the
          // missing ones here (a head editor may have un-excluded the word on purpose):
          // build ruling R7 (docs/superpowers/specs/2026-11-19-book-glossary-build-rulings.md).
          for (const rc of replaces) {
            for (const f2 of forms.filter((x) => conceptCarries(db, rc, x))) {
              const ex = db
                .prepare(
                  'SELECT 1 FROM book_glossary_exclusion WHERE book_id = ? AND match_key = ? AND concept_id = ?'
                )
                .get(bookId, matchKey(f2), rc);
              if (!ex) throw refuse(`entry exists but concept ${rc} is not excluded for "${f2}"`);
            }
          }
          return { status: 'already', conceptId: cid };
        }
        throw refuse(`conflict: the book already has an entry for "${f}"`);
      }
    }
    for (const f of forms) {
      const k = matchKey(f);
      const whole = db
        .prepare(
          'SELECT 1 FROM book_glossary_exclusion WHERE book_id = ? AND match_key = ? AND concept_id = 0'
        )
        .get(bookId, k);
      if (whole) throw refuse(`"${f}" is excluded as a whole headword for this book`);
      const pref = db
        .prepare('SELECT 1 FROM book_term_preference WHERE book_id = ? AND english = ?')
        .get(bookId, f);
      if (pref) throw refuse(`"${f}" has a book_term_preference row for this book`);
    }
    // A replaced concept must carry at least one of the entry's forms:
    // build ruling R2 (docs/superpowers/specs/2026-11-19-book-glossary-build-rulings.md).
    const carried = new Map();
    for (const cid of replaces) {
      const mine = forms.filter((f) => conceptCarries(db, cid, f));
      if (mine.length === 0)
        throw refuse(`replaced concept ${cid} carries none of the English forms`);
      carried.set(cid, mine);
    }

    const dom = db
      .prepare(
        'SELECT domain FROM book_domain_priority WHERE book_id = ? ORDER BY position LIMIT 1'
      )
      .get(bookId);
    if (!dom) throw refuse(`book ${a.book} has no domain priority`);

    const conceptId = Number(
      db
        .prepare('INSERT INTO concept (domain, collection, idordabanki_id) VALUES (?,?,NULL)')
        .run(dom.domain, BOOK_LAYER_SOURCE).lastInsertRowid
    );
    const ins = db.prepare(
      'INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,1,?)'
    );
    for (const f of forms) ins.run(conceptId, 'en', f, BOOK_LAYER_SOURCE);
    ins.run(conceptId, 'is', a.icelandic, BOOK_LAYER_SOURCE);
    db.prepare(
      `INSERT INTO book_glossary_entry (concept_id, book_id, reason, source, created_by, created_at)
       VALUES (?,?,?,?,?,?)`
    ).run(conceptId, bookId, a.reason, a.source, a.by, at);
    writeHistory(db, bookId, { ...a, at }, 'entry-add', forms[0], {
      english: forms,
      icelandic: a.icelandic,
      replaces,
    });
    for (const [cid, mine] of carried) {
      for (const f of mine) addExclusion(db, { ...a, at, english: f, conceptId: cid });
    }
    return { status: 'added', conceptId };
  })();
}

const RECORD_FILE = 'book-glossary.json';

const parseJson = (s) => {
  if (s === null || s === undefined) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

/**
 * The layer's committed record for one book (spec §5.4), or null when the book has no row in any
 * of the three tables. Cumulative: the whole history every time, so a manual export between two
 * cron runs cannot lose rows. An excluded row's Icelandic is NOT carried (licence note, §5.4).
 *
 * `dangling`: single-concept exclusions whose concept is missing, merged or no longer carries
 * the English; entries whose concept is missing or merged. Merged concepts are listed because
 * the lookup follows a merge to its survivor, so a merged key would miss silently:
 * build ruling R11 (docs/superpowers/specs/2026-11-19-book-glossary-build-rulings.md).
 *
 * @param {object} db
 * @param {string} bookSlug
 * @returns {object|null}
 */
function buildBookGlossaryRecord(db, bookSlug) {
  const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
  if (!book) return null;
  const bookId = book.id;
  const ex = db
    .prepare(
      'SELECT * FROM book_glossary_exclusion WHERE book_id = ? ORDER BY match_key, concept_id'
    )
    .all(bookId);
  const en = db.prepare('SELECT * FROM book_glossary_entry WHERE book_id = ?').all(bookId);
  const hist = db
    .prepare('SELECT * FROM book_glossary_change WHERE book_id = ? ORDER BY id')
    .all(bookId);
  if (ex.length === 0 && en.length === 0 && hist.length === 0) return null;

  const conceptRow = db.prepare('SELECT domain, merged_into FROM concept WHERE id = ?');
  const dangling = [];
  for (const e of ex) {
    if (e.concept_id <= 0) continue;
    const c = conceptRow.get(e.concept_id);
    let reason = null;
    if (!c) reason = 'missing';
    else if (c.merged_into !== null) reason = 'merged';
    else if (!conceptCarries(db, e.concept_id, e.english)) reason = 'no-english';
    if (reason)
      dangling.push({ kind: 'exclusion', english: e.english, conceptId: e.concept_id, reason });
  }

  const entries = en.map((e) => {
    const c = conceptRow.get(e.concept_id);
    const terms = db
      .prepare('SELECT lang, text FROM concept_term WHERE concept_id = ? ORDER BY rank, id')
      .all(e.concept_id);
    const english = terms.filter((t) => t.lang === 'en').map((t) => t.text);
    const is = terms.find((t) => t.lang === 'is');
    if (!c || c.merged_into !== null) {
      dangling.push({
        kind: 'entry',
        english: english[0] ?? '',
        conceptId: e.concept_id,
        reason: !c ? 'missing' : 'merged',
      });
    }
    return {
      conceptId: e.concept_id,
      english,
      icelandic: is ? is.text : null,
      domain: c ? c.domain : null,
      reason: e.reason,
      source: e.source,
      createdBy: e.created_by,
      createdAt: e.created_at,
      updatedBy: e.updated_by,
      updatedAt: e.updated_at,
    };
  });
  entries.sort((a, b) =>
    (a.english[0] ?? '') < (b.english[0] ?? '')
      ? -1
      : (a.english[0] ?? '') > (b.english[0] ?? '')
        ? 1
        : a.conceptId - b.conceptId
  );

  return {
    schema: 'book-glossary/1',
    book: bookSlug,
    generated: new Date().toISOString(),
    exclusions: ex.map((e) => ({
      english: e.english,
      conceptId: e.concept_id,
      idordabankiId: e.idordabanki_id,
      reason: e.reason,
      source: e.source,
      createdBy: e.created_by,
      createdAt: e.created_at,
    })),
    entries,
    history: hist.map((h) => ({
      id: h.id,
      at: h.at,
      by: h.by,
      action: h.action,
      english: h.english,
      before: parseJson(h.before_json),
      after: parseJson(h.after_json),
      reason: h.reason,
      source: h.source,
    })),
    dangling,
  };
}

/**
 * Write outDir/book-glossary.json when its content, ignoring `generated`, differs from the file
 * on disk. Atomic (.tmp + rename).
 *
 * @param {string} outDir
 * @param {object} record
 * @returns {'written'|'unchanged'}
 */
function writeBookGlossaryRecord(outDir, record) {
  const file = path.join(outDir, RECORD_FILE);
  try {
    const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      JSON.stringify({ ...prev, generated: null }) ===
      JSON.stringify({ ...record, generated: null })
    )
      return 'unchanged';
  } catch {
    // absent or unreadable: write it
  }
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
  return 'written';
}

/**
 * The `recordFn` runGlossaryExport injects. The read-only open is LAZY, as in
 * createResolvedExportFn: a missing DB must surface inside the per-book try/catch.
 *
 * @param {string} [dbPath]
 * @returns {(bookSlug: string) => object|null}
 */
function createBookGlossaryRecordFn(dbPath) {
  let db = null;
  return (slug) => {
    if (!db) {
      const Database = require('better-sqlite3');
      const resolveDbPath = require('./dbPath');
      db = new Database(dbPath || resolveDbPath(), { readonly: true });
    }
    return buildBookGlossaryRecord(db, slug);
  };
}

module.exports = {
  addExclusion,
  addEntry,
  buildBookGlossaryRecord,
  writeBookGlossaryRecord,
  createBookGlossaryRecordFn,
};
