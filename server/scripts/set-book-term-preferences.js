#!/usr/bin/env node
/**
 * Set chemistry's book-wide term preferences for [USER]'s rulings that select a term the concept
 * model already holds.
 *
 * ── WHY PREFERENCES, AND WHY THESE EIGHT ───────────────────────────────────────
 * The 2026-10-29 conflict rulings (docs/decisions/2026-10-29-glossary-ruling-conflicts-resolved.md)
 * and the 2026-11-01 correction (docs/decisions/2026-11-01-polyatomic-ion-two-words.md) leave eight
 * headwords where chemistry's glossary gives one Icelandic and [USER] ruled another that ALREADY
 * EXISTS as a term on a concept carrying that English word. A `book_term_preference` row makes the
 * resolver pick that term for this book only (conceptResolver.js, applyPreference), so nothing new
 * is minted and the official concept, with its alternatives, stays the source. A ruled word that
 * exists on no concept needs a house-style entry instead (server/lib/houseStyleTerms.js): a
 * preference can only select, never create.
 *
 * ── WHY A SCRIPT AND NOT A MIGRATION ───────────────────────────────────────────
 * `book_term_preference` has no column saying who wrote a row: it holds editors' answers too. A
 * migration re-asserting these rows on every boot could not tell its rows from an editor's and
 * would overwrite a later editorial choice for these words. So this is a guarded, reviewable,
 * dry-run-by-default script, as the 2026-09 `atom → atóm` rows were. It refuses to overwrite a
 * different preference, and it is idempotent: run it again after an Íðorðabankinn re-import, which
 * drops a preference only when its term is removed upstream and then says so loudly
 * (run-concept-import.js, "EDITOR PREFERENCE(S) DROPPED").
 *
 * ── HOW EACH ENTRY IS FOUND ─────────────────────────────────────────────────────
 * By the concept's ÍÐORÐABANKINN id, never by our local concept or term id: local ids are
 * AUTOINCREMENT and change when a collection is re-imported, the upstream id does not. The entry
 * must find exactly that concept, unmerged, carrying the English word and the ruled Icelandic
 * (exact text: candidate lookup is case-sensitive). Any miss is a problem, and one problem anywhere
 * means nothing is written.
 *
 * Usage:
 *   node server/scripts/set-book-term-preferences.js            # dry run (default)
 *   node server/scripts/set-book-term-preferences.js --apply    # write the rows
 */
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');

/**
 * One row per ruling. `conceptAtWriting` is production's local concept id on 2026-11-01, kept for
 * the reader only; the lookup uses `idordabankiId`.
 */
const PREFERENCES = Object.freeze(
  [
    {
      english: 'accuracy',
      icelandic: 'hittni',
      idordabankiId: 523838,
      conceptAtWriting: 6464,
      ruled: '2026-10-29 [USER]',
      // Epidemiology's concept, whose head form is hittni. Not 6524, which also carries
      // nákvæmni: the export would then offer nákvæmni as accuracy's alternative, the collapse
      // with precision this ruling exists to end.
      why: 'hittni for accuracy, nákvæmni for precision (the 2026-10-29 record, "The two collapses")',
    },
    {
      english: 'alpha particle',
      icelandic: 'alfaeind',
      idordabankiId: 322177,
      conceptAtWriting: 81,
      ruled: '2026-10-29 [USER]',
      why: "the physics concept's listed alternative to alfaögn",
    },
    {
      english: 'atomic orbital',
      icelandic: 'atómsvigrúm',
      idordabankiId: 931183,
      conceptAtWriting: 4746,
      ruled: '2026-10-29 [USER]',
      why: 'atóm carried into compounds (entry rule 2); the MT writes it 99 times, frumeindasvigrúm 0',
    },
    {
      english: 'dipole moment',
      icelandic: 'tvískautsvægi',
      idordabankiId: 323553,
      conceptAtWriting: 4087,
      ruled: '2026-10-29 [USER]',
      why: 'the MT writes it 44 times, tvípólsvægi 0',
    },
    {
      english: 'electron affinity',
      icelandic: 'rafeindasækni',
      idordabankiId: 931316,
      conceptAtWriting: 5020,
      ruled: '2026-10-29 [USER]',
      why: 'the MT writes it 36 times, rafsækni 0',
    },
    {
      english: 'rate law',
      icelandic: 'hraðalögmál',
      idordabankiId: 931595,
      conceptAtWriting: 4813,
      ruled: '2026-10-29 [USER]',
      why: 'the MT writes it 164 times',
    },
    {
      english: 'vacancy',
      icelandic: 'eyða',
      idordabankiId: 323036,
      conceptAtWriting: 629,
      ruled: '2026-10-29 [USER]',
      why: "the glossary's listed alternative to eyðuveila: students would not know veila",
    },
    {
      english: 'polyatomic ion',
      icelandic: 'fjölatóma jón',
      idordabankiId: 931564,
      conceptAtWriting: 4725,
      ruled: '2026-11-01 [USER]',
      why: 'two words, correcting the 2026-10-29 fjölatómajón (docs/decisions/2026-11-01-polyatomic-ion-two-words.md)',
    },
  ].map((e) => Object.freeze({ book: 'efnafraedi-2e', ...e }))
);

/**
 * Work out what each entry needs, reading only.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {ReadonlyArray<object>} [entries]
 * @returns {{ rows: Array<{entry: object, bookId: number, termId: number, action: 'insert'|'already-set'}>,
 *             problems: Array<{entry: object, code: string, detail: string}> }}
 */
function planPreferences(db, entries = PREFERENCES) {
  const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?');
  const concept = db.prepare('SELECT id, merged_into FROM concept WHERE idordabanki_id = ?');
  const term = db.prepare(
    'SELECT id FROM concept_term WHERE concept_id = ? AND lang = ? AND text = ?'
  );
  // The key is (book, chapter, english) with english COLLATE NOCASE, so `=` here folds case
  // exactly as the primary key does.
  const existing = db.prepare(
    `SELECT p.term_id, t.text FROM book_term_preference p
       LEFT JOIN concept_term t ON t.id = p.term_id
      WHERE p.book_id = ? AND p.chapter = 0 AND p.english = ?`
  );
  const rows = [];
  const problems = [];
  const problem = (entry, code, detail) => problems.push({ entry, code, detail });

  for (const entry of entries) {
    const b = book.get(entry.book);
    if (!b) {
      problem(entry, 'book-not-registered', entry.book);
      continue;
    }
    const cs = concept.all(entry.idordabankiId);
    if (cs.length !== 1) {
      problem(
        entry,
        'concept-not-found',
        `Íðorðabankinn id ${entry.idordabankiId}: ${cs.length} concept(s)`
      );
      continue;
    }
    const c = cs[0];
    if (c.merged_into !== null) {
      problem(entry, 'concept-merged', `concept ${c.id} is merged into ${c.merged_into}`);
      continue;
    }
    if (!term.get(c.id, 'en', entry.english)) {
      problem(
        entry,
        'english-not-on-concept',
        `concept ${c.id} carries no English "${entry.english}"`
      );
      continue;
    }
    const t = term.get(c.id, 'is', entry.icelandic);
    if (!t) {
      problem(
        entry,
        'icelandic-not-on-concept',
        `concept ${c.id} carries no Icelandic "${entry.icelandic}"`
      );
      continue;
    }
    const prev = existing.get(b.id, entry.english);
    if (prev && prev.term_id !== t.id) {
      problem(
        entry,
        'conflicting-preference',
        `already set to term ${prev.term_id} (${prev.text ?? 'missing'}); not overwritten`
      );
      continue;
    }
    rows.push({ entry, bookId: b.id, termId: t.id, action: prev ? 'already-set' : 'insert' });
  }
  return { rows, problems };
}

/**
 * Write the plan's inserts in one transaction. Refuses a plan with any problem.
 *
 * @returns {number} rows inserted
 */
function applyPlan(db, plan) {
  if (plan.problems.length) throw new Error('refusing to apply a plan with problems');
  const ins = db.prepare(
    'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 0, ?, ?)'
  );
  return db.transaction((rows) => {
    let n = 0;
    for (const r of rows)
      if (r.action === 'insert') n += ins.run(r.bookId, r.entry.english, r.termId).changes;
    return n;
  })(plan.rows);
}

function main() {
  const apply = process.argv.includes('--apply');
  const db = new Database(resolveDbPath(), { readonly: !apply, fileMustExist: true });
  try {
    const plan = planPreferences(db);
    console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${resolveDbPath()}\n`);
    for (const r of plan.rows) {
      console.log(
        `  ${r.action.padEnd(11)} ${r.entry.book} ${r.entry.english.padEnd(18)} -> ` +
          `${r.entry.icelandic.padEnd(14)} term ${r.termId}`
      );
    }
    for (const p of plan.problems) {
      console.log(
        `  PROBLEM     ${p.entry.book} ${p.entry.english.padEnd(18)} ${p.code}: ${p.detail}`
      );
    }
    const inserts = plan.rows.filter((r) => r.action === 'insert').length;
    console.log(
      `\n  ${inserts} to insert, ${plan.rows.length - inserts} already set, ${plan.problems.length} problem(s).`
    );
    if (plan.problems.length) {
      console.log('\nNothing written: fix the problems first (one problem refuses the whole run).');
      process.exitCode = 1;
      return;
    }
    if (!apply) {
      console.log('\nDry run — nothing was written. Re-run with --apply to write.');
      return;
    }
    const n = applyPlan(db, plan);
    console.log(`\n  INSERTED ${n} row(s). The next 2-hourly content tick exports the glossary.`);
  } finally {
    db.close();
  }
}

if (require.main === module) main();
module.exports = { PREFERENCES, planPreferences, applyPlan };
