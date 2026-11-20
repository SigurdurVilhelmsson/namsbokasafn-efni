/**
 * The book glossary layer's write API (spec 2026-11-19-book-glossary-layer-design §5.1-§5.2)
 * and its committed record (§5.4).
 *
 * Write API (`addExclusion`, `addEntry`): a book can exclude a headword (concept_id 0), exclude
 * one concept for a headword, or own an entry. Every added row writes one book_glossary_change
 * row in the SAME transaction. Refusals throw an Error with `code: 'LAYER_REFUSED'` and a
 * one-line message.
 *
 * Stage 2 (design §5.1): `removeExclusion`, `changeEntry` and `removeEntry`, each one transaction
 * with its history row and both `before_json` and `after_json`; `historyFor` reads a headword's
 * history (plan ruling P10).
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
const {
  conceptCarries,
  dedupeForms,
  houseStyleInScope,
  preferenceBlocksExclusion,
  preferencesOnTermsOf,
} = require('./bookGlossaryRules');

/** Every refusal code the write API (and the routes built on it) can throw. */
const REFUSALS = Object.freeze([
  'invalid',
  'unknown-book',
  'concept-missing',
  'not-carried',
  'entry-conflict',
  'excluded-headword',
  'preference',
  'own-entry',
  'replaced-not-carried',
  'no-scope',
  'needs-confirm',
  'not-found',
  'merged-into',
]);

/**
 * @param {string} message English, for logs
 * @param {string} refusal one of REFUSALS
 * @param {object} [extra] copied onto the error (e.g. `houseStyle`)
 */
function refuse(message, refusal, extra = {}) {
  const err = new Error(message);
  err.code = 'LAYER_REFUSED';
  err.refusal = refusal;
  Object.assign(err, extra);
  return err;
}

function bookIdOf(db, slug) {
  const row = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
  if (!row) throw refuse(`unknown book: ${slug}`, 'unknown-book');
  return row.id;
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

/** @returns {number} the new book_glossary_change row's id */
function writeHistory(db, bookId, a, action, english, afterObj, beforeObj = null) {
  return Number(
    db
      .prepare(
        `INSERT INTO book_glossary_change (book_id, at, by, action, english, before_json, after_json, reason, source)
     VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(
        bookId,
        a.at,
        a.by,
        action,
        english,
        beforeObj == null ? null : JSON.stringify(beforeObj),
        JSON.stringify(afterObj),
        a.reason,
        a.source
      ).lastInsertRowid
  );
}

/** The entry's en forms in the order the record lists them, with their row ids. */
function entryForms(db, conceptId) {
  return db
    .prepare(
      "SELECT id, text FROM concept_term WHERE concept_id = ? AND lang = 'en' ORDER BY rank, id"
    )
    .all(conceptId);
}

/** The entry's rank-1 Icelandic term (id, text, inflections), or undefined. */
function entryIcelandic(db, conceptId) {
  return db
    .prepare(
      "SELECT id, text, inflections FROM concept_term WHERE concept_id = ? AND lang = 'is' ORDER BY rank, id LIMIT 1"
    )
    .get(conceptId);
}

/** A stored inflection list as an array, or null (absent, or not a JSON list). */
function inflectionList(stored) {
  const v = parseJson(stored);
  return Array.isArray(v) ? v : null;
}

/** House-style concepts in scope for any of the forms, each concept once (first form wins). */
function houseStyleForForms(db, bookId, forms) {
  const seen = new Set();
  return forms
    .flatMap((f) => houseStyleInScope(db, bookId, f))
    .filter((h) => !seen.has(h.conceptId) && seen.add(h.conceptId));
}

/**
 * The stage-1 refusals of an English form an entry is about to claim: a whole-headword exclusion
 * of it, or a book_term_preference on it. addEntry and changeEntry share this, so a form added
 * later meets the same refusals as one the entry was created with.
 */
function refuseClaimedHeadword(db, bookId, f) {
  const whole = db
    .prepare(
      'SELECT 1 FROM book_glossary_exclusion WHERE book_id = ? AND match_key = ? AND concept_id = 0'
    )
    .get(bookId, matchKey(f));
  if (whole)
    throw refuse(`"${f}" is excluded as a whole headword for this book`, 'excluded-headword');
  const pref = db
    .prepare('SELECT 1 FROM book_term_preference WHERE book_id = ? AND english = ?')
    .get(bookId, f);
  if (pref) throw refuse(`"${f}" has a book_term_preference row for this book`, 'preference');
}

/** This book's entry row for the concept, or a `not-found` refusal. */
function ownEntry(db, bookId, conceptId) {
  const row = db
    .prepare('SELECT * FROM book_glossary_entry WHERE concept_id = ? AND book_id = ?')
    .get(conceptId, bookId);
  if (!row) throw refuse(`concept ${conceptId} is not an entry of this book`, 'not-found');
  return row;
}

/**
 * @param {object} db
 * @param {{book:string, english:string, conceptId?:number, reason:string, source:string, by:string, at?:string, confirmHouseStyle?:boolean}} a
 * @returns {{status:'added'|'already', id:number, changeId?:number}}
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
      if (!c) throw refuse(`concept ${conceptId} does not exist`, 'concept-missing');
      if (!conceptCarries(db, conceptId, a.english)) {
        throw refuse(
          `concept ${conceptId} does not carry the English "${a.english}"`,
          'not-carried'
        );
      }
      idordabankiId = c.idordabanki_id ?? null;
      const is = db
        .prepare(
          "SELECT text FROM concept_term WHERE concept_id = ? AND lang = 'is' ORDER BY rank, id LIMIT 1"
        )
        .get(conceptId);
      icelandic = is ? is.text : null;
    } else if (entriesClaiming(db, bookId, a.english).length > 0) {
      throw refuse(`conflict: a book entry claims the headword "${a.english}"`, 'entry-conflict');
    }

    // New refusals sit after the `already` return so re-running the c19 loader stays idempotent.
    if (
      conceptId > 0 &&
      db
        .prepare('SELECT 1 FROM book_glossary_entry WHERE book_id = ? AND concept_id = ?')
        .get(bookId, conceptId)
    ) {
      throw refuse(`concept ${conceptId} is this book's own entry`, 'own-entry');
    }
    if (preferenceBlocksExclusion(db, bookId, a.english, conceptId)) {
      throw refuse(`"${a.english}" has a book_term_preference row for this book`, 'preference');
    }
    const houseStyle = houseStyleInScope(db, bookId, a.english).filter(
      (h) => conceptId === 0 || h.conceptId === conceptId
    );
    if (houseStyle.length > 0 && !a.confirmHouseStyle) {
      throw refuse(`"${a.english}" is a house-style term in this book's scope`, 'needs-confirm', {
        houseStyle,
      });
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
    const changeId = writeHistory(db, bookId, { ...a, at }, 'exclude', a.english, {
      english: a.english,
      conceptId,
      idordabankiId,
      ...(houseStyle.length > 0 ? { houseStyleOverride: houseStyle } : {}),
    });
    return { status: 'added', id, changeId };
  })();
}

/**
 * @param {object} db
 * @param {{book:string, english:string[], icelandic:string, replaces?:number[], reason:string, source:string, by:string, at?:string, confirmHouseStyle?:boolean}} a
 * @returns {{status:'added'|'already', conceptId:number, changeId?:number}}
 */
function addEntry(db, a) {
  const at = a.at || new Date().toISOString();
  const replaces = a.replaces || [];
  if (!Array.isArray(a.english) || a.english.length === 0)
    throw refuse('an entry needs at least one English form', 'invalid');
  if (!a.icelandic) throw refuse('an entry needs an Icelandic term', 'invalid');
  const forms = dedupeForms(a.english);
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
              if (!ex)
                throw refuse(
                  `entry exists but concept ${rc} is not excluded for "${f2}"`,
                  'entry-conflict'
                );
            }
          }
          return { status: 'already', conceptId: cid };
        }
        throw refuse(`conflict: the book already has an entry for "${f}"`, 'entry-conflict');
      }
    }
    for (const f of forms) refuseClaimedHeadword(db, bookId, f);
    // A replaced concept must carry at least one of the entry's forms:
    // build ruling R2 (docs/superpowers/specs/2026-11-19-book-glossary-build-rulings.md).
    const carried = new Map();
    for (const cid of replaces) {
      const mine = forms.filter((f) => conceptCarries(db, cid, f));
      if (mine.length === 0)
        throw refuse(
          `replaced concept ${cid} carries none of the English forms`,
          'replaced-not-carried'
        );
      carried.set(cid, mine);
    }

    const dom = db
      .prepare(
        'SELECT domain FROM book_domain_priority WHERE book_id = ? ORDER BY position LIMIT 1'
      )
      .get(bookId);
    if (!dom) throw refuse(`book ${a.book} has no domain priority`, 'no-scope');

    // Each concept once, as changeEntry lists it: the history row it lands in is append-only.
    const houseStyle = houseStyleForForms(db, bookId, forms);
    if (houseStyle.length > 0 && !a.confirmHouseStyle) {
      throw refuse("an English form is a house-style term in this book's scope", 'needs-confirm', {
        houseStyle,
      });
    }

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
    const changeId = writeHistory(db, bookId, { ...a, at }, 'entry-add', forms[0], {
      english: forms,
      icelandic: a.icelandic,
      replaces,
      ...(houseStyle.length > 0 ? { houseStyleOverride: houseStyle } : {}),
    });
    // The entry-add row is written first and its id is returned; one exclude row per replaced
    // concept follows it. The entry now claims these headwords, but
    // exclusions of replaced concepts are single-concept rows, which never hit entry-conflict.
    for (const [cid, mine] of carried) {
      for (const f of mine)
        addExclusion(db, { ...a, at, english: f, conceptId: cid, confirmHouseStyle: true });
    }
    return { status: 'added', conceptId, changeId };
  })();
}

/**
 * Remove one of the book's exclusions (design §5.1). Removing a replacement's single-concept
 * exclusion while its entry stays makes the old concept acceptable again: the entry becomes an add.
 *
 * @param {object} db
 * @param {{book:string, exclusionId:number, reason:string, source:string, by:string, at?:string}} a
 * @returns {{status:'removed', changeId:number}}
 */
function removeExclusion(db, a) {
  const at = a.at || new Date().toISOString();
  return db.transaction(() => {
    const bookId = bookIdOf(db, a.book);
    const ex = db
      .prepare('SELECT * FROM book_glossary_exclusion WHERE id = ? AND book_id = ?')
      .get(a.exclusionId, bookId);
    if (!ex) throw refuse(`exclusion ${a.exclusionId} is not this book's`, 'not-found');
    db.prepare('DELETE FROM book_glossary_exclusion WHERE id = ?').run(ex.id);
    // The history omits an excluded row's Icelandic, as the exclude row does
    // (spec 2026-11-19-book-glossary-layer-design §5.4).
    const changeId = writeHistory(
      db,
      bookId,
      { ...a, at },
      'unexclude',
      ex.english,
      { english: ex.english, conceptId: ex.concept_id, excluded: false },
      { english: ex.english, conceptId: ex.concept_id, idordabankiId: ex.idordabanki_id }
    );
    return { status: 'removed', changeId };
  })();
}

/**
 * Change a book entry's Icelandic and/or its English forms (design §5.1).
 *
 * A new Icelandic replaces the rank-1 is term's text and clears its inflections, so the old
 * word's forms are never used for the new one; the old list stays in the history row's
 * before_json. `forms` replaces the en set. Forms compare by match key, so a reordered list, or a
 * respelling of a form the entry already carries, changes nothing.
 *
 * @param {object} db
 * @param {{book:string, conceptId:number, icelandic?:string, forms?:string[], reason:string, source:string, by:string, at?:string, confirmHouseStyle?:boolean}} a
 * @returns {{status:'changed'|'unchanged', conceptId:number, icelandicChanged:boolean, changeId:number|null}}
 */
function changeEntry(db, a) {
  const at = a.at || new Date().toISOString();
  const forms = a.forms == null ? null : dedupeForms(a.forms);
  if (forms && forms.length === 0)
    throw refuse('an entry keeps at least one English form', 'invalid');
  if (a.icelandic != null && !a.icelandic)
    throw refuse('an entry needs an Icelandic term', 'invalid');
  return db.transaction(() => {
    const bookId = bookIdOf(db, a.book);
    ownEntry(db, bookId, a.conceptId);
    const oldForms = entryForms(db, a.conceptId);
    const oldIs = entryIcelandic(db, a.conceptId);
    const oldKeys = new Set(oldForms.map((r) => matchKey(r.text)));
    const newKeys = forms ? new Set(forms.map(matchKey)) : oldKeys;
    const added = forms ? forms.filter((f) => !oldKeys.has(matchKey(f))) : [];
    const removed = oldForms.filter((r) => !newKeys.has(matchKey(r.text)));
    const icelandicChanged = a.icelandic != null && a.icelandic !== oldIs.text;
    if (added.length === 0 && removed.length === 0 && !icelandicChanged) {
      return {
        status: 'unchanged',
        conceptId: a.conceptId,
        icelandicChanged: false,
        changeId: null,
      };
    }

    // An added form's key is not this entry's, so any entry claiming it is another one (T3f).
    for (const f of added) {
      if (entriesClaiming(db, bookId, f).length > 0)
        throw refuse(`conflict: the book already has an entry for "${f}"`, 'entry-conflict');
      refuseClaimedHeadword(db, bookId, f);
    }
    // plan ruling P3: a preference's term_id would silently select the new word.
    if (icelandicChanged && preferencesOnTermsOf(db, a.conceptId) > 0) {
      throw refuse(
        `a book_term_preference points at a term of concept ${a.conceptId}`,
        'preference'
      );
    }
    // plan ruling P5: every form of the resulting entry, on every write, so a confirmed override
    // is confirmed again and each history row names what it overrode. Checked last, so the
    // head editor is never asked to confirm a change that a later check refuses.
    const resulting = [
      ...oldForms.filter((r) => newKeys.has(matchKey(r.text))).map((r) => r.text),
      ...added,
    ];
    const houseStyle = houseStyleForForms(db, bookId, resulting);
    if (houseStyle.length > 0 && !a.confirmHouseStyle) {
      throw refuse("an English form is a house-style term in this book's scope", 'needs-confirm', {
        houseStyle,
      });
    }

    if (icelandicChanged) {
      db.prepare('UPDATE concept_term SET text = ?, inflections = NULL WHERE id = ?').run(
        a.icelandic,
        oldIs.id
      );
    }
    const del = db.prepare('DELETE FROM concept_term WHERE id = ?');
    for (const r of removed) del.run(r.id);
    const ins = db.prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,'en',?,1,?)"
    );
    for (const f of added) ins.run(a.conceptId, f, BOOK_LAYER_SOURCE);
    db.prepare(
      'UPDATE book_glossary_entry SET updated_by = ?, updated_at = ? WHERE concept_id = ?'
    ).run(a.by, at, a.conceptId);

    // Read back in the record's order, so one row's `after` equals the next row's `before`.
    const newForms = entryForms(db, a.conceptId).map((r) => r.text);
    const changeId = writeHistory(
      db,
      bookId,
      { ...a, at },
      'entry-change',
      newForms[0],
      {
        english: newForms,
        icelandic: icelandicChanged ? a.icelandic : oldIs.text,
        ...(houseStyle.length > 0 ? { houseStyleOverride: houseStyle } : {}),
      },
      {
        english: oldForms.map((r) => r.text),
        icelandic: oldIs.text,
        inflections: inflectionList(oldIs.inflections),
      }
    );
    return { status: 'changed', conceptId: a.conceptId, icelandicChanged, changeId };
  })();
}

/**
 * Remove a book entry (design §5.1): its book_glossary_entry row and its book-owned concept, whose
 * terms follow by ON DELETE CASCADE. Its forms, Icelandic and inflections go into the history
 * row's before_json first, for the removal's worklist. Then each `undoExclusions` id is removed
 * with its own unexclude row. Every id is checked before anything is written, so a bad one leaves
 * the entry and every exclusion in place.
 *
 * @param {object} db
 * @param {{book:string, conceptId:number, reason:string, source:string, by:string, at?:string, undoExclusions?:number[]}} a
 * @returns {{status:'removed', changeId:number, undone:number[]}}
 */
function removeEntry(db, a) {
  const at = a.at || new Date().toISOString();
  const undo = [...new Set(a.undoExclusions || [])];
  return db.transaction(() => {
    const bookId = bookIdOf(db, a.book);
    ownEntry(db, bookId, a.conceptId);
    // plan ruling P3: term_id cascades from concept_term, so the delete would drop it silently.
    if (preferencesOnTermsOf(db, a.conceptId) > 0) {
      throw refuse(
        `a book_term_preference points at a term of concept ${a.conceptId}`,
        'preference'
      );
    }
    // plan ruling P4: merged_into has no cascade, so the delete would fail on a raw foreign key.
    if (db.prepare('SELECT 1 FROM concept WHERE merged_into = ?').get(a.conceptId)) {
      throw refuse(`another concept is merged into concept ${a.conceptId}`, 'merged-into');
    }

    // Read before the delete: the cascade takes the terms these come from.
    const forms = entryForms(db, a.conceptId).map((r) => r.text);
    const is = entryIcelandic(db, a.conceptId);
    const keys = new Set(forms.map(matchKey));
    const undoRow = db.prepare(
      'SELECT match_key FROM book_glossary_exclusion WHERE id = ? AND book_id = ? AND concept_id <> 0'
    );
    for (const id of undo) {
      const ex = undoRow.get(id, bookId);
      if (!ex || !keys.has(ex.match_key)) {
        throw refuse(
          `exclusion ${id} is not a single-concept exclusion of this book on the entry's headwords`,
          'not-found'
        );
      }
    }

    db.prepare('DELETE FROM book_glossary_entry WHERE concept_id = ?').run(a.conceptId);
    db.prepare('DELETE FROM concept WHERE id = ?').run(a.conceptId);
    // A dangling entry (its concept already gone) has no forms, and can still be removed.
    const changeId = writeHistory(
      db,
      bookId,
      { ...a, at },
      'entry-remove',
      forms[0] ?? '',
      { removed: true },
      {
        english: forms,
        icelandic: is ? is.text : null,
        inflections: inflectionList(is ? is.inflections : null),
      }
    );
    for (const exclusionId of undo) removeExclusion(db, { ...a, at, exclusionId });
    return { status: 'removed', changeId, undone: undo };
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
 * One book's history rows for a headword, newest first (plan ruling P10). A row matches on its
 * own `english` or on any form in its before/after `english` (a string on exclusion rows, a list
 * on entry rows), because an entry's row names only its first form. Folds with matchKey, as the
 * layer's keys do.
 *
 * @param {object} db
 * @param {string} bookSlug
 * @param {string} english
 * @returns {Array<{id:number, at:string, by:string, action:string, english:string, before:object|null, after:object|null, reason:string, source:string}>}
 */
function historyFor(db, bookSlug, english) {
  const bookId = bookIdOf(db, bookSlug);
  const key = matchKey(english);
  const formsOf = (side) => (side && side.english != null ? [].concat(side.english) : []);
  return db
    .prepare('SELECT * FROM book_glossary_change WHERE book_id = ? ORDER BY id DESC')
    .all(bookId)
    .map((h) => ({
      id: h.id,
      at: h.at,
      by: h.by,
      action: h.action,
      english: h.english,
      before: parseJson(h.before_json),
      after: parseJson(h.after_json),
      reason: h.reason,
      source: h.source,
    }))
    .filter((h) =>
      [h.english, ...formsOf(h.before), ...formsOf(h.after)].some(
        (e) => typeof e === 'string' && matchKey(e) === key
      )
    );
}

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
 * ⚠️ The whole build runs in ONE read transaction, as buildResolvedGlossary's does: it reads the
 * layer in several statements while head editors write from another process, so without a single
 * snapshot a record could pair a history row with a layer state that lacks its row, and be
 * committed. A deferred read transaction writes nothing, so the exporter's read-only connection
 * can run it.
 *
 * @param {object} db
 * @param {string} bookSlug
 * @returns {object|null}
 */
function buildBookGlossaryRecord(db, bookSlug) {
  return db.transaction(() => buildBookGlossaryRecordBody(db, bookSlug))();
}

function buildBookGlossaryRecordBody(db, bookSlug) {
  const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
  if (!book) return null;
  const bookId = book.id;
  const ex = db
    .prepare(
      'SELECT * FROM book_glossary_exclusion WHERE book_id = ? ORDER BY match_key, concept_id'
    )
    .all(bookId);
  const en = db
    .prepare('SELECT * FROM book_glossary_entry WHERE book_id = ? ORDER BY concept_id')
    .all(bookId);
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
      createdBy: displayNameFor(db, e.created_by),
      createdAt: e.created_at,
      updatedBy: e.updated_by === null ? null : displayNameFor(db, e.updated_by),
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
      createdBy: displayNameFor(db, e.created_by),
      createdAt: e.created_at,
    })),
    entries,
    history: hist.map((h) => ({
      id: h.id,
      at: h.at,
      by: displayNameFor(db, h.by),
      action: h.action,
      english: h.english,
      before: withoutInflections(parseJson(h.before_json)),
      after: withoutInflections(parseJson(h.after_json)),
      reason: h.reason,
      source: h.source,
    })),
    dangling,
  };
}

const ROLE_LABELS = {
  admin: 'stjórnandi',
  'head-editor': 'aðalritstjóri',
  editor: 'yfirlesari',
  viewer: 'lesandi',
};
const GUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The name the committed record shows for an account id (design §5.1). The record goes to a
 * public repository, so an email never appears: a display_name that is an email (login falls
 * back to the address when Microsoft gives no name) counts as absent (plan ruling P1), and an
 * account id that is a GUID, or holds an `@`, with no users row is written generically (P2).
 * Any other label, such as the c19 loader's, passes through unchanged.
 *
 * @param {object} db
 * @param {string} by An account id or a free-form label.
 * @returns {string}
 */
function displayNameFor(db, by) {
  const u = db.prepare('SELECT display_name, role FROM users WHERE provider_id = ?').get(by);
  if (u) {
    const name = typeof u.display_name === 'string' ? u.display_name.trim() : '';
    if (name && !name.includes('@')) return name;
    return ROLE_LABELS[u.role] ?? 'notandi';
  }
  if (typeof by === 'string' && (GUID_SHAPE.test(by) || by.includes('@')))
    return 'óþekktur notandi';
  return by;
}

/** A deep copy of a parsed history payload without any `inflections` key, at any depth. */
function withoutInflections(v) {
  if (Array.isArray(v)) return v.map(withoutInflections);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => k !== 'inflections')
        .map(([k, x]) => [k, withoutInflections(x)])
    );
  }
  return v;
}

/**
 * Write outDir/book-glossary.json when its content, ignoring `generated`, differs from the file
 * on disk. Atomic (.tmp + rename).
 *
 * @param {string} outDir
 * @param {object} record
 * @returns {'written'|'unchanged'|'no-glossary-dir'} 'no-glossary-dir' when outDir does not exist:
 *   the record never creates a book's glossary/ directory.
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
  if (!fs.existsSync(outDir)) return 'no-glossary-dir';
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

/**
 * The largest book_glossary_change.id of a book: a stamp of how far the layer has moved.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} bookSlug
 * @returns {number|null} null when the book has no layer history or is not registered
 */
function lastLayerChangeId(db, bookSlug) {
  const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
  if (!book) return null;
  const row = db
    .prepare('SELECT MAX(id) AS last FROM book_glossary_change WHERE book_id = ?')
    .get(book.id);
  return row.last ?? null;
}

/**
 * Lazy read-only reader of the layer's change id, as createBookGlossaryRecordFn is. An
 * unreadable database throws, inside the caller's per-book try/catch.
 *
 * @param {string} [dbPath]
 * @returns {(bookSlug: string) => number|null}
 */
function createLayerChangeIdFn(dbPath) {
  let db = null;
  return (slug) => {
    if (!db) {
      const Database = require('better-sqlite3');
      const resolveDbPath = require('./dbPath');
      db = new Database(dbPath || resolveDbPath(), { readonly: true });
    }
    return lastLayerChangeId(db, slug);
  };
}

module.exports = {
  RECORD_FILE,
  REFUSALS,
  addExclusion,
  addEntry,
  removeExclusion,
  changeEntry,
  removeEntry,
  historyFor,
  buildBookGlossaryRecord,
  displayNameFor,
  writeBookGlossaryRecord,
  createBookGlossaryRecordFn,
  lastLayerChangeId,
  createLayerChangeIdFn,
};
