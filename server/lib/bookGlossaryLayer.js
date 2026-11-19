/**
 * The book glossary layer's write API (spec 2026-11-19-book-glossary-layer-design §5.1-§5.2).
 *
 * A book can exclude a headword (concept_id 0), exclude one concept for a headword, or own an
 * entry. Every added row writes one book_glossary_change row in the SAME transaction.
 *
 * Refusals throw an Error with `code: 'LAYER_REFUSED'` and a one-line message.
 *
 * ⚠️ houseStyleTerms.js must NOT require this module: conceptResolver already requires
 * houseStyleTerms, and this module requires conceptResolver (require cycle).
 */
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

/** R1: a concept carries the English iff it has an en term whose matchKey equals the form's. */
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
        if (sameForms && is.length === 1 && is[0] === a.icelandic)
          return { status: 'already', conceptId: cid };
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
    // R2: a replaced concept must carry at least one of the entry's forms.
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

module.exports = { addExclusion, addEntry };
