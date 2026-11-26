/**
 * Book glossary routes (design §5.2): the page where a book's head editors see and change the
 * book's glossary layer. Mutations are POST only (CLAUDE.md § Auth).
 *
 * The routes are the boundary: the write API trusts its callers, so every input is validated
 * here before it is called, and every write-API argument is built field by field from validated
 * values. Nothing from the request body is spread into a call, so a `by` or an `at` in the body
 * can never set who wrote a row or when.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { requireHeadEditor } = require('../middleware/requireRole');
const { refuseClosedBookForNonAdmins } = require('../lib/editorScope');
// Called through the module object, not destructured, so a test can make a write throw.
const layer = require('../lib/bookGlossaryLayer');
const log = require('../lib/logger');
const activityLog = require('../services/activityLog');
const inflections = require('../services/bookGlossaryInflections');
const { getDb } = require('../services/bookGlossaryDb');
const service = require('../services/bookGlossaryService');
const { buildWorklist } = require('../services/bookGlossaryWorklist');
const { worklistSpec } = require('../lib/worklistSpec');

// plan ruling P8 (amended by design §AMENDED 2026-11-20)
const MAX_TERM = 200;
const MAX_FORMS = 20;
const MAX_REASON = 2000;
const MAX_SOURCE = 500;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
// Design §AMENDED 2026-11-20 (2): zero-width characters, the byte-order mark and bidi controls.
// A headword pasted with one looks right and matches nothing, since English is matched by text.
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u061C]/;

/** The Icelandic answer to each write-API refusal, keyed by its code. */
const MESSAGES = Object.freeze({
  'concept-missing': 'Hugtakið er ekki til.',
  'not-carried': 'Hugtakið ber ekki þetta enska orð.',
  'entry-conflict': 'Bókin hefur þegar færslu fyrir þetta orð.',
  'excluded-headword': 'Orðið er útilokað í heild í þessari bók. Afturkallaðu útilokunina fyrst.',
  preference:
    'Bókin hefur valið þýðingu fyrir þetta orð. Síðan getur ekki breytt því vali; biddu forritara um að gera það.',
  'own-entry':
    'Þetta er færsla bókarinnar sjálfrar. Breyttu henni eða fjarlægðu hana frekar en að útiloka hana.',
  'replaced-not-carried': 'Hugtakið sem á að víkja ber ekkert af ensku orðum færslunnar.',
  'not-found': 'Fannst ekki í orðasafni bókarinnar.',
  'merged-into':
    'Öðru hugtaki hefur verið steypt saman við þessa færslu. Biddu forritara um að skoða það.',
  'no-scope': 'Bókin hefur enga sviðsröð. Biddu forritara um að skoða það.',
  'needs-confirm':
    'Þessi breyting víkur til hliðar ákvörðun um orðanotkun verksins. Staðfestu til að halda áfram.',
  invalid: 'Ógild beiðni.',
  'unknown-book': 'Ógild beiðni.',
});

const NO_GLOSSARY_DIR_MESSAGE =
  'Bókin hefur enga glossary-möppu, svo breytingar á orðasafni hennar kæmust aldrei í git. Biddu forritara um að stofna hana.';

const SERVER_ERROR_MESSAGE = 'Villa á þjóni';

const invalid = (res, field) => res.status(400).json({ error: `Ógilt gildi: ${field}` });

const refused = (res, refusal, extra = {}) =>
  res.status(409).json({ error: MESSAGES[refusal] || MESSAGES.invalid, refusal, ...extra });

/** A validation failure inside a write handler; the wrapper answers it with 400. */
class Invalid extends Error {
  constructor(field) {
    super(`invalid ${field}`);
    this.field = field;
  }
}

/** The value, or a validation failure for `field` when the cleaner returned null. */
function need(value, field) {
  if (value === null) throw new Invalid(field);
  return value;
}

/** A trimmed string of 1..max characters with no control character, or null. */
function cleanText(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > max || CONTROL_CHARS.test(s)) return null;
  return s;
}

/**
 * A trimmed term (an English headword or form, or the Icelandic term), or null when it is missing,
 * too long, or holds a control or an invisible character. The invisible check reads the raw value:
 * trim() strips U+FEFF, so a byte-order mark at either end would otherwise be removed silently
 * instead of refused.
 */
const cleanTerm = (v) =>
  typeof v === 'string' && INVISIBLE_CHARS.test(v) ? null : cleanText(v, MAX_TERM);
const cleanEnglish = cleanTerm;

/**
 * Free text (a reason or a source): every whitespace run, line breaks and tabs included, becomes
 * one space before the control-character rule applies (design §AMENDED 2026-11-20 (1)), so a
 * reason pasted from an email keeps its words and the published record stays single-line.
 */
const collapseWhitespace = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * A whole number ≥ min, from a JSON integer or a string of digits, or null. Strict on purpose:
 * Number(null) and Number('') are 0, and 0 as an exclusion's conceptId means the whole headword.
 */
function cleanInt(v, min) {
  let n = NaN;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\d+$/.test(v.trim())) n = Number(v.trim());
  return Number.isSafeInteger(n) && n >= min ? n : null;
}

/** A list of ids ≥ 1 (possibly empty), or null when any member is not such an id. */
function cleanIds(v) {
  if (!Array.isArray(v)) return null;
  const ids = v.map((x) => cleanInt(x, 1));
  return ids.includes(null) ? null : ids;
}

/** One to MAX_FORMS English forms, each a clean headword, or null. */
function cleanForms(v) {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_FORMS) return null;
  const forms = v.map(cleanEnglish);
  return forms.includes(null) ? null : forms;
}

/** The reason and source every write records. An omitted source is written as '' (NOT NULL). */
function provenance(b) {
  const reason = need(
    cleanText(typeof b.reason === 'string' ? collapseWhitespace(b.reason) : b.reason, MAX_REASON),
    'reason'
  );
  if (b.source == null) return { reason, source: '' };
  if (typeof b.source !== 'string') throw new Invalid('source');
  const source = collapseWhitespace(b.source);
  if (source.length > MAX_SOURCE || CONTROL_CHARS.test(source)) throw new Invalid('source');
  return { reason, source };
}

/**
 * confirmHouseStyle must be a real boolean: the write API tests it for truth, so a string such as
 * 'false' would otherwise confirm an override.
 */
function confirmOf(b) {
  if (b.confirmHouseStyle === undefined) return false;
  if (typeof b.confirmHouseStyle !== 'boolean') throw new Invalid('confirmHouseStyle');
  return b.confirmHouseStyle;
}

/** Who triggered a background lookup, for its activity row. */
const lookupContext = (req) => ({
  book: req.params.book,
  userId: req.user.id,
  username: req.user.username,
});

function serverError(req, res, err) {
  log.error({ err, book: req.params.book, path: req.path }, 'book glossary request failed');
  return res.status(500).json({ error: SERVER_ERROR_MESSAGE });
}

/**
 * Wrap a write handler. The handler validates (throwing Invalid) and calls the write API, and
 * returns `{result, action, description, lookup}`. The wrapper answers refusals with 409 and
 * anything else with 500, and for a write that changed something logs one activity row and, when
 * `lookup` names a concept, schedules its inflection lookup (design §5.4).
 */
function layerWrite(handler) {
  return (req, res) => {
    const body =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    let out;
    try {
      out = handler(req, body);
    } catch (err) {
      if (err instanceof Invalid) return invalid(res, err.field);
      if (err && err.code === 'LAYER_REFUSED') {
        return refused(
          res,
          err.refusal,
          err.refusal === 'needs-confirm' ? { houseStyle: err.houseStyle } : {}
        );
      }
      return serverError(req, res, err);
    }
    const { result, action, description, lookup } = out;
    // An 'already' or 'unchanged' answer wrote nothing, so there is no change to log.
    if (result.changeId != null) {
      activityLog.log({
        type: activityLog.ACTIVITY_TYPES.BOOK_GLOSSARY_CHANGED,
        userId: req.user.id,
        username: req.user.username,
        book: req.params.book,
        description,
        metadata: { action, changeId: result.changeId },
      });
    }
    if (lookup != null) inflections.schedule(lookup, lookupContext(req));
    return res.status(result.status === 'added' ? 201 : 200).json(result);
  };
}

// An admin passes the head-editor guard for any slug, so the book is checked against the registry too,
// after the guard so that an anonymous caller learns nothing about which slugs exist.
function registeredBook(req, res, next) {
  if (!service.isRegisteredBook(getDb(), req.params.book)) return invalid(res, 'book');
  next();
}

// The exporter writes the committed record only for a book with a glossary/ directory, so a change
// to any other book's layer could never reach git (design §5.2). Refused before anything is read
// from the body.
function writableBook(req, res, next) {
  if (!service.hasGlossaryDir(req.params.book)) {
    return res.status(409).json({ error: NO_GLOSSARY_DIR_MESSAGE });
  }
  next();
}

const guard = [requireAuth, requireHeadEditor('book'), registeredBook];
// The closed-book guard (G1.13, spec §6.1): a head editor of a book not open to editors cannot write
// its layer; an admin can.
const writeGuard = [
  ...guard,
  writableBook,
  refuseClosedBookForNonAdmins((req) => req.params.book, 'param'),
];

router.get('/:book', ...guard, (req, res) => {
  const db = getDb();
  const slug = req.params.book;
  res.json({
    book: slug,
    ...service.listLayer(db, slug),
    hold: service.exportState(slug),
    // Plan ruling Q13: the page offers no action for a book the write routes would refuse.
    writable: service.hasGlossaryDir(slug),
  });
});

router.get('/:book/lookup', ...guard, (req, res) => {
  const english = cleanEnglish(req.query.english);
  if (!english) return invalid(res, 'english');
  res.json(service.lookup(getDb(), req.params.book, english));
});

router.get('/:book/history', ...guard, (req, res) => {
  const english = cleanEnglish(req.query.english);
  if (!english) return invalid(res, 'english');
  const db = getDb();
  try {
    const history = layer.historyFor(db, req.params.book, english).map((h) => ({
      ...h,
      by: layer.displayNameFor(db, h.by),
      // Plan ruling Q6: the page offers the worklist button exactly where the route answers with a list.
      worklist: worklistSpec(db, req.params.book, h).kind !== null,
    }));
    return res.json({ history });
  } catch (err) {
    return serverError(req, res, err);
  }
});

router.get('/:book/worklist', ...guard, (req, res) => {
  const changeId = cleanInt(req.query.changeId, 1);
  if (changeId === null) return invalid(res, 'changeId');
  try {
    const out = buildWorklist(getDb(), req.params.book, changeId);
    if (!out) return res.status(404).json({ error: MESSAGES['not-found'], refusal: 'not-found' });
    return res.json(out);
  } catch (err) {
    return serverError(req, res, err);
  }
});

router.post(
  '/:book/exclusions',
  ...writeGuard,
  layerWrite((req, b) => {
    const english = need(cleanEnglish(b.english), 'english');
    // Required: 0 excludes the whole headword, which must never happen by omission.
    const conceptId = need(cleanInt(b.conceptId, 0), 'conceptId');
    const result = layer.addExclusion(getDb(), {
      book: req.params.book,
      english,
      conceptId,
      ...provenance(b),
      confirmHouseStyle: confirmOf(b),
      by: req.user.id,
    });
    return {
      result,
      action: 'exclude',
      description: `Útilokun í orðasafni bókar: ${english}`,
      lookup: null,
    };
  })
);

router.post(
  '/:book/exclusions/:id/undo',
  ...writeGuard,
  layerWrite((req, b) => {
    const exclusionId = need(cleanInt(req.params.id, 1), 'id');
    const result = layer.removeExclusion(getDb(), {
      book: req.params.book,
      exclusionId,
      ...provenance(b),
      by: req.user.id,
    });
    return {
      result,
      action: 'unexclude',
      description: 'Útilokun afturkölluð í orðasafni bókar',
      lookup: null,
    };
  })
);

router.post(
  '/:book/entries',
  ...writeGuard,
  layerWrite((req, b) => {
    const forms = need(cleanForms(b.forms), 'forms');
    const icelandic = need(cleanTerm(b.icelandic), 'icelandic');
    if (b.mode !== 'replace' && b.mode !== 'add') throw new Invalid('mode');
    // 'replace' names the concepts the entry replaces; 'add' stands beside them and takes none.
    const replaces = b.replaces === undefined ? [] : need(cleanIds(b.replaces), 'replaces');
    if ((b.mode === 'replace') !== replaces.length > 0) throw new Invalid('replaces');
    const result = layer.addEntry(getDb(), {
      book: req.params.book,
      english: forms,
      icelandic,
      replaces,
      ...provenance(b),
      confirmHouseStyle: confirmOf(b),
      by: req.user.id,
    });
    return {
      result,
      action: 'entry-add',
      description: `Ný færsla í orðasafni bókar: ${forms.join(', ')} → ${icelandic}`,
      lookup: result.status === 'added' ? result.conceptId : null,
    };
  })
);

router.post(
  '/:book/entries/:conceptId/change',
  ...writeGuard,
  layerWrite((req, b) => {
    const conceptId = need(cleanInt(req.params.conceptId, 1), 'conceptId');
    const icelandic =
      b.icelandic === undefined ? undefined : need(cleanTerm(b.icelandic), 'icelandic');
    const forms = b.forms === undefined ? undefined : need(cleanForms(b.forms), 'forms');
    if (icelandic === undefined && forms === undefined) throw new Invalid('icelandic');
    const result = layer.changeEntry(getDb(), {
      book: req.params.book,
      conceptId,
      icelandic,
      forms,
      ...provenance(b),
      confirmHouseStyle: confirmOf(b),
      by: req.user.id,
    });
    return {
      result,
      action: 'entry-change',
      description: `Færslu breytt í orðasafni bókar (hugtak ${conceptId})`,
      // A new Icelandic word needs its own forms; a forms-only change keeps the word's.
      lookup: result.icelandicChanged ? conceptId : null,
    };
  })
);

router.post(
  '/:book/entries/:conceptId/remove',
  ...writeGuard,
  layerWrite((req, b) => {
    const conceptId = need(cleanInt(req.params.conceptId, 1), 'conceptId');
    const undoExclusions =
      b.undoExclusions === undefined ? [] : need(cleanIds(b.undoExclusions), 'undoExclusions');
    const result = layer.removeEntry(getDb(), {
      book: req.params.book,
      conceptId,
      undoExclusions,
      ...provenance(b),
      by: req.user.id,
    });
    return {
      result,
      action: 'entry-remove',
      description: `Færsla fjarlægð úr orðasafni bókar (hugtak ${conceptId})`,
      lookup: null,
    };
  })
);

router.post('/:book/entries/:conceptId/inflections', ...writeGuard, (req, res) => {
  const conceptId = cleanInt(req.params.conceptId, 1);
  if (conceptId === null) return invalid(res, 'conceptId');
  try {
    // The lookup writes inflections onto whatever concept it is given, so a retry is limited to
    // this book's own entries: a shared concept's terms are not this book's to change.
    const own = getDb()
      .prepare(
        `SELECT 1 FROM book_glossary_entry e JOIN registered_books b ON b.id = e.book_id
          WHERE b.slug = ? AND e.concept_id = ?`
      )
      .get(req.params.book, conceptId);
    if (!own) return refused(res, 'not-found');
    inflections.schedule(conceptId, lookupContext(req));
    return res.status(202).json({ status: 'scheduled', conceptId });
  } catch (err) {
    return serverError(req, res, err);
  }
});

module.exports = router;
module.exports.MESSAGES = MESSAGES;
module.exports.NO_GLOSSARY_DIR_MESSAGE = NO_GLOSSARY_DIR_MESSAGE;
