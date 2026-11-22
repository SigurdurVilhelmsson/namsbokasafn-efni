#!/usr/bin/env node
/**
 * Load c19's rulings into a book's glossary layer (spec 2026-11-19-book-glossary-layer-design
 * §5.5 steps 2-4). Dry run by default.
 *
 *   node server/scripts/load-book-glossary.js --book <slug> --input <path> [--apply] [--verify]
 *
 * The input is the committed `c19-book-layer-input/1` file (exclude-headword, exclude-concept
 * and entry actions). Checks, ALL before any write; one failure refuses everything (exit 1):
 *   schema and book match · at least one action, and `counts` equals a tally of the actions by
 *   kind (a truncated or wrong file disagrees with its own counts) · each conceptId exists,
 *   still carries the English, and its rank-1 Icelandic equals `icelandicAtCensus` · no
 *   house-style concept carries a headword under a whole-headword exclusion · no
 *   book_term_preference row for an entry's English · no exclusion/entry collision inside the
 *   input.
 *
 * Dry run: applies every action to an in-memory COPY (`new Database(db.serialize())`) inside one
 * transaction and prints, per action, chemistry before → after and the physics book before = after
 * (`≠` when it would change: a change is a refusal). The real database is opened read-only and
 * never written.
 *
 * --apply: opens read-write and runs the checks and the writes inside ONE immediate transaction.
 * --verify (needs --input): refuses the input on the same file checks (schema, book, actions,
 * counts), then checks it against the layer AND books/<book>/glossary/glossary-unified.json.
 * Every action must be in the layer (headword exclusions also absent from the export; entries
 * carry their Icelandic, replacements excluded; 1-2 word entries match the export, 3+ word
 * entries are listed as editor only). Any missing action fails; exit 0 only if all hold.
 *
 * The `by`, `source` and `reason` values written reach a public repository through the committed
 * record, so they are fixed here and never read from a private file.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');
const { buildScope, resolve, matchKey } = require('../lib/conceptResolver');
const { addExclusion, addEntry, C19_LOAD_LABEL } = require('../lib/bookGlossaryLayer');
const { HOUSE_STYLE_SOURCE } = require('../lib/houseStyleTerms');

const SCHEMA = 'c19-book-layer-input/1';
const BY = C19_LOAD_LABEL;
const PHYSICS_BOOK = 'edlisfraedi-2e';
const DEFAULT_BOOKS_DIR = path.join(__dirname, '..', '..', 'books');
const REQUIRED_TABLES = [
  'registered_books',
  'concept',
  'concept_term',
  'book_term_preference',
  'book_glossary_exclusion',
  'book_glossary_entry',
  'book_glossary_change',
];
const KINDS = ['exclude-headword', 'exclude-concept', 'entry'];

function usage(message) {
  const e = new Error(message);
  e.code = 'USAGE';
  return e;
}

function parseArgs(argv) {
  const args = { apply: false, verify: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--verify') args.verify = true;
    else if (a === '--book' || a === '--input') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw usage(`${a} needs a value`);
      args[a.slice(2)] = v;
    } else throw usage(`unknown argument: ${a}`);
  }
  if (!args.book) throw usage('--book is required');
  if (!args.input) throw usage('--input is required');
  if (args.apply && args.verify) throw usage('--apply and --verify are separate runs');
  return args;
}

const sourceOf = (a) => (String(a.rulingId).startsWith('C234-') ? '§C234' : 'c19 pre-screen');
const formsOf = (a) => (a.kind === 'entry' ? a.entry.english : [a.english]);

function carries(db, conceptId, english) {
  const key = matchKey(english);
  return db
    .prepare("SELECT text FROM concept_term WHERE concept_id = ? AND lang = 'en'")
    .all(conceptId)
    .some((r) => matchKey(r.text) === key);
}

/** The census concept an action points at, or null (headwords and phrase entries have none). */
function checkedConcept(a) {
  if (a.kind === 'exclude-concept') return a.conceptId;
  if (a.kind === 'entry' && a.entry.replaces && a.entry.replaces.length && a.icelandicAtCensus)
    return a.entry.replaces[0];
  return null;
}

/**
 * The checks on the input file itself, before any database read; shared by the load and
 * `--verify`. Zero actions is a refusal, not a pass: a truncated or wrong file would otherwise
 * load nothing, or verify nothing, and report success. `counts` must equal a tally of the actions
 * by kind, and a missing `counts` is refused too, so this control cannot vanish silently.
 *
 * @param {object} input parsed input file
 * @param {string} book slug
 * @returns {string[]} one line per problem; empty when the file passes
 */
function inputProblems(input, book) {
  const problems = [];
  if (!input || input.schema !== SCHEMA) problems.push(`schema is not ${SCHEMA}`);
  if (!input || input.book !== book)
    problems.push(`input book ${input && input.book} is not ${book}`);
  if (problems.length) return problems;
  if (!Array.isArray(input.actions)) return ['input has no actions array'];
  if (input.actions.length === 0) return ['input has no actions'];
  const counts = input.counts;
  if (!counts || typeof counts !== 'object' || Array.isArray(counts))
    return ['input has no counts object to check its actions against'];
  const tally = {};
  for (const a of input.actions) tally[a && a.kind] = (tally[a && a.kind] || 0) + 1;
  for (const k of new Set([...Object.keys(counts), ...Object.keys(tally)])) {
    const said = counts[k] === undefined ? 0 : counts[k];
    const held = tally[k] || 0;
    if (said !== held)
      problems.push(`counts["${k}"] is ${JSON.stringify(said)}, but the input holds ${held}`);
  }
  return problems;
}

/**
 * @param {object} db
 * @param {object} input parsed input file
 * @param {string} book slug
 * @returns {string[]} one line per problem; empty when every check passes
 */
function runChecks(db, input, book) {
  const problems = inputProblems(input, book);
  if (problems.length) return problems;
  const missing = REQUIRED_TABLES.filter(
    (t) => !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)
  );
  if (missing.length)
    return [`this database lacks table(s) ${missing.join(', ')}: migrate it first`];
  const bookRow = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(book);
  if (!bookRow) return [`unknown book: ${book}`];

  const isRank1 = db.prepare(
    "SELECT text FROM concept_term WHERE concept_id = ? AND lang = 'is' ORDER BY rank, id LIMIT 1"
  );
  const exists = db.prepare('SELECT 1 FROM concept WHERE id = ?');
  const pref = db.prepare('SELECT 1 FROM book_term_preference WHERE book_id = ? AND english = ?');
  const houseKeys = new Set(
    db
      .prepare(
        `SELECT t.text FROM concept_term t JOIN concept c ON c.id = t.concept_id
          WHERE t.lang = 'en' AND c.collection = ?`
      )
      .all(HOUSE_STYLE_SOURCE)
      .map((r) => matchKey(r.text))
  );

  const wholeKeys = new Map();
  const entryKeys = new Map();
  const seen = new Set();
  for (const a of input.actions) {
    const id = `${a.rulingId} (${a.kind})`;
    if (!KINDS.includes(a.kind)) {
      problems.push(`${id}: unknown action kind`);
      continue;
    }
    if (seen.has(id)) problems.push(`${id}: duplicate action`);
    seen.add(id);
    const forms = formsOf(a);
    if (!forms.every((f) => typeof f === 'string' && f)) {
      problems.push(`${id}: no English`);
      continue;
    }

    const cid = checkedConcept(a);
    if (cid !== null) {
      if (!exists.get(cid)) problems.push(`${id}: concept ${cid} does not exist`);
      else {
        if (!forms.some((f) => carries(db, cid, f)))
          problems.push(`${id}: concept ${cid} no longer carries the English "${forms[0]}"`);
        const now = isRank1.get(cid);
        if (!now || now.text !== a.icelandicAtCensus)
          problems.push(
            `${id}: concept ${cid} Icelandic drifted (census "${a.icelandicAtCensus}", now "${now ? now.text : ''}")`
          );
      }
    }
    if (a.kind === 'exclude-headword') {
      const k = matchKey(a.english);
      wholeKeys.set(k, id);
      if (houseKeys.has(k))
        problems.push(`${id}: "${a.english}" is a house-style headword and may not be excluded`);
    }
    if (a.kind === 'entry') {
      for (const f of forms) {
        entryKeys.set(matchKey(f), id);
        if (pref.get(bookRow.id, f))
          problems.push(`${id}: "${f}" has a book_term_preference row for this book`);
      }
    }
  }
  for (const [k, id] of wholeKeys)
    if (entryKeys.has(k))
      problems.push(`${id}: excludes a headword that ${entryKeys.get(k)} gives an entry`);
  return problems;
}

function applyAction(db, book, a) {
  const common = { book, reason: a.comment, source: sourceOf(a), by: BY };
  if (a.kind === 'exclude-headword') return addExclusion(db, { ...common, english: a.english });
  if (a.kind === 'exclude-concept')
    return addExclusion(db, { ...common, english: a.english, conceptId: a.conceptId });
  return addEntry(db, {
    ...common,
    english: a.entry.english,
    icelandic: a.entry.icelandic,
    replaces: a.entry.replaces || [],
  });
}

/** What a book resolves for a form, as a printable pair and a comparable signature. */
function snapshot(db, book, forms) {
  if (!db.prepare('SELECT 1 FROM registered_books WHERE slug = ?').get(book)) return null;
  const scope = buildScope(db, book, 0);
  const texts = (l) => l.map((x) => x.text);
  const per = forms.map((f) => {
    const r = resolve(scope, f);
    return {
      winner: r.winner ? r.winner.text : null,
      tied: texts(r.tied),
      also: texts(r.alsoInScope),
      out: texts(r.outOfScope),
    };
  });
  return { shown: per[0].winner || '—', sig: JSON.stringify(per) };
}

function applyAll(db, book, actions) {
  const results = [];
  const refusals = [];
  for (const a of actions) {
    try {
      results.push(applyAction(db, book, a));
    } catch (e) {
      if (e.code !== 'LAYER_REFUSED') throw e;
      refusals.push(`${a.rulingId} (${a.kind}): ${e.message}`);
      results.push(null);
    }
  }
  return { results, refusals };
}

function printCounts(io, results) {
  const n = (s) => results.filter((r) => r && r.status === s).length;
  io.log(`added: ${n('added')}`);
  io.log(`already: ${n('already')}`);
}

function openDb(args, deps) {
  if (deps.db) return { db: deps.db, owned: false };
  return {
    db: new Database(resolveDbPath(), { readonly: !args.apply, fileMustExist: true }),
    owned: true,
  };
}

function refuseAll(io, problems) {
  io.error(`REFUSED, nothing written (${problems.length}):`);
  for (const p of problems) io.error(`  ${p}`);
  return 1;
}

function refusal(lines) {
  const err = new Error('refused');
  err.refusals = lines;
  return err;
}

/**
 * --apply. The checks and the writes run inside ONE immediate transaction: BEGIN IMMEDIATE takes
 * the write lock before the first check reads, so a commit by the live server cannot land between
 * the checks and the writes (a deferred transaction met that as SQLITE_BUSY_SNAPSHOT: a stack
 * trace, nothing written). Any refusal throws inside it, so the whole transaction rolls back and
 * nothing is written.
 */
function runApply(db, args, io, input) {
  let outcome;
  try {
    outcome = db
      .transaction(() => {
        const problems = runChecks(db, input, args.book);
        if (problems.length) throw refusal(problems);
        const o = applyAll(db, args.book, input.actions);
        if (o.refusals.length) throw refusal(o.refusals);
        return o;
      })
      .immediate();
  } catch (e) {
    if (!e.refusals) throw e;
    return refuseAll(io, e.refusals);
  }
  printCounts(io, outcome.results);
  return 0;
}

function runLoad(args, io, deps, input) {
  const { db, owned } = openDb(args, deps);
  try {
    if (args.apply) return runApply(db, args, io, input);

    const problems = runChecks(db, input, args.book);
    if (problems.length) return refuseAll(io, problems);
    const actions = input.actions;

    if (!db.prepare('SELECT 1 FROM registered_books WHERE slug = ?').get(PHYSICS_BOOK))
      return refuseAll(io, [
        `the physics control book ${PHYSICS_BOOK} is not registered: the dry run cannot show it unchanged`,
      ]);
    const before = actions.map((a) => ({
      chem: snapshot(db, args.book, formsOf(a)),
      phys: snapshot(db, PHYSICS_BOOK, formsOf(a)),
    }));
    // ⚠️ A WAL database serialises with header bytes 18/19 = 2 (WAL), and SQLite's in-memory VFS
    // cannot open a WAL: every statement on the copy would throw SQLITE_CANTOPEN. Production's
    // sessions.db is WAL. Patch the IMAGE (a private in-memory buffer) to rollback-journal mode
    // before opening it; the real file and its -wal are never touched, and the image already
    // holds the rows that exist only in the uncheckpointed WAL.
    const image = db.serialize();
    image[18] = 1;
    image[19] = 1;
    const copy = new Database(image);
    try {
      const o = copy.transaction(() => applyAll(copy, args.book, actions))();
      const refusals = [...o.refusals];
      io.log(
        'rulingId | kind | english | chemistry before → after | physics book before = after (≠: it would change, refused)'
      );
      actions.forEach((a, i) => {
        const chem = snapshot(copy, args.book, formsOf(a));
        const phys = snapshot(copy, PHYSICS_BOOK, formsOf(a));
        // The column shows the winner only, but the comparison covers all four lists, so the
        // separator comes from the SAME comparison as the refusal: `=` can never sit beside one.
        const physChanged = Boolean(before[i].phys && phys && before[i].phys.sig !== phys.sig);
        if (physChanged) refusals.push(`${a.rulingId} (${a.kind}): the physics book would change`);
        io.log(
          `${a.rulingId} | ${a.kind} | ${formsOf(a)[0]} | ${before[i].chem.shown} → ${chem.shown} | ` +
            `physics: ${before[i].phys ? before[i].phys.shown : 'n/a'} ${physChanged ? '≠' : '='} ` +
            `${phys ? phys.shown : 'n/a'}`
        );
      });
      printCounts(io, o.results);
      if (refusals.length) return refuseAll(io, refusals);
      io.log('dry run: nothing written. Re-run with --apply to write.');
      return 0;
    } finally {
      copy.close();
    }
  } finally {
    if (owned) db.close();
  }
}

function runVerify(args, io, deps, input) {
  const { db, owned } = openDb(args, deps);
  try {
    const booksDir = deps.booksDir || DEFAULT_BOOKS_DIR;
    const file = path.join(booksDir, args.book, 'glossary', 'glossary-unified.json');
    const missing = REQUIRED_TABLES.filter(
      (t) => !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)
    );
    if (missing.length) {
      io.error(`FAIL: this database lacks table(s) ${missing.join(', ')}: migrate it first`);
      return 1;
    }
    const inputFails = inputProblems(input, args.book);
    if (inputFails.length) {
      for (const p of inputFails) io.error(`FAIL: ${p}`);
      return 1;
    }
    let terms;
    try {
      terms = JSON.parse(fs.readFileSync(file, 'utf8')).terms;
      if (!Array.isArray(terms)) throw new Error('no terms array');
    } catch (e) {
      io.error(
        `FAIL: cannot read ${path.relative(path.join(__dirname, '..', '..'), file)}: ${e.message}`
      );
      return 1;
    }
    const bookRow = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(args.book);
    if (!bookRow) {
      io.error(`FAIL: unknown book ${args.book}`);
      return 1;
    }
    const byKey = new Map();
    for (const t of terms) {
      const k = matchKey(t.english);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(t);
    }
    const exclusion = db.prepare(
      'SELECT 1 FROM book_glossary_exclusion WHERE book_id = ? AND match_key = ? AND concept_id = ?'
    );
    const entryIds = db
      .prepare('SELECT concept_id FROM book_glossary_entry WHERE book_id = ?')
      .all(bookRow.id)
      .map((r) => r.concept_id);
    const termsOf = db.prepare(
      'SELECT lang, text FROM concept_term WHERE concept_id = ? ORDER BY rank, id'
    );
    const words = (x) => x.trim().split(/\s+/).length;
    const fails = [];
    const editorOnly = [];
    let okCount = 0;
    for (const a of input.actions) {
      const id = `${a.rulingId} (${a.kind})`;
      const before = fails.length;
      if (a.kind === 'exclude-headword') {
        const k = matchKey(a.english);
        if (!exclusion.get(bookRow.id, k, 0))
          fails.push(`${id}: no whole-headword exclusion in the layer`);
        if (byKey.has(k)) fails.push(`${id}: "${a.english}" is present in the export`);
      } else if (a.kind === 'exclude-concept') {
        if (!exclusion.get(bookRow.id, matchKey(a.english), a.conceptId))
          fails.push(`${id}: no exclusion of concept ${a.conceptId} in the layer`);
      } else if (a.kind === 'entry') {
        const forms = a.entry.english;
        const keys = forms.map(matchKey);
        const cid = entryIds.find((c) => {
          const t = termsOf.all(c);
          const en = t.filter((x) => x.lang === 'en').map((x) => matchKey(x.text));
          const is = t.find((x) => x.lang === 'is');
          return keys.every((k) => en.includes(k)) && is && is.text === a.entry.icelandic;
        });
        if (cid === undefined)
          fails.push(`${id}: no layer entry carries "${forms[0]}" → "${a.entry.icelandic}"`);
        for (const rc of a.entry.replaces || []) {
          if (!keys.some((k) => exclusion.get(bookRow.id, k, rc)))
            fails.push(`${id}: replaced concept ${rc} is not excluded in the layer`);
        }
        if (forms.every((f) => words(f) >= 3))
          editorOnly.push(`${forms[0]} → ${a.entry.icelandic}`);
        else {
          const present = forms.filter((f) => byKey.has(matchKey(f)));
          if (present.length === 0) fails.push(`${id}: "${forms[0]}" is absent from the export`);
          for (const f of present)
            for (const t of byKey.get(matchKey(f)))
              if (t.icelandic !== a.entry.icelandic)
                fails.push(
                  `${id}: "${f}" is "${t.icelandic}" in the export, not "${a.entry.icelandic}"`
                );
        }
      } else fails.push(`${id}: unknown action kind`);
      if (fails.length === before) okCount++;
    }
    io.log(`verified: ${okCount} of ${input.actions.length} actions`);
    for (const x of editorOnly) io.log(`editor only (3+ words, not in the export): ${x}`);
    for (const f of fails) io.error(`FAIL: ${f}`);
    if (fails.length) return 1;
    io.log('verify: PASS');
    return 0;
  } finally {
    if (owned) db.close();
  }
}

/**
 * @param {string[]} argv
 * @param {{log: Function, error: Function}} io
 * @param {{db?: object, booksDir?: string}} deps tests inject `db` and `booksDir`
 * @returns {number} 0 on success, 1 on a refusal, a failure or a usage error
 */
function main(argv, io = { log: console.log, error: console.error }, deps = {}) {
  try {
    const args = parseArgs(argv);
    let input;
    try {
      input = JSON.parse(fs.readFileSync(args.input, 'utf8'));
    } catch (e) {
      io.error(`cannot read input ${args.input}: ${e.message}`);
      return 1;
    }
    return args.verify ? runVerify(args, io, deps, input) : runLoad(args, io, deps, input);
  } catch (e) {
    if (e.code !== 'USAGE') throw e;
    io.error(`usage error: ${e.message}`);
    return 1;
  }
}

// A file run sets require.main; a stdin run (`node -`) does not, and must still execute.
const runDirectly = require.main === module || (module.id === '[stdin]' && process.argv[1] === '-');
if (runDirectly) {
  process.exitCode = 1; // a failure default: a run that dies before main() returns is never 0
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { parseArgs, runChecks, main };
