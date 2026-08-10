// server/scripts/lib/scratchCorpus.js
/**
 * A throwaway concept corpus for the §C36 acceptance gates: every real migration
 * against an empty file, then the 20-collection Íðorðabankinn import.
 *
 * ⚠️ EXTRACTED FROM verify-b4a-gates.js, MOVED NOT REWRITTEN (§C36 B4b-0b).
 * B4b-0b's gate is the second caller and B4b-1's will be the third; a second
 * hand-copy of this setup is how two gates end up measuring subtly different
 * databases and neither notices. The §C35 and migration-048 comments below
 * travel WITH the code — they are the reason each line is shaped as it is.
 *
 * ⚠️ NEVER pipeline-output/sessions.db, NEVER production. The local dev DB holds
 * 6 terminology rows and no concept model at all, so it cannot host these gates.
 *
 * ⚠️ THE RESULT IS A RECONSTRUCTION, NOT PRODUCTION'S DATABASE. A number that
 * diverges from a recorded figure is AMBIGUOUS — it could be the code or it
 * could be the reconstruction. Callers must assert the corpus totals
 * (concept 70,187 / concept_term 192,189) before trusting anything measured on
 * it; that assertion is what turns the caveat into a measurement.
 */
const { BOOK_DOMAIN_PRIORITY } = require('../../lib/domains');
// ⚠️ A TEST HELPER ON PURPOSE. `freshMigratedDb` is the ONE place that builds a
// schema by running the real migrations in order; verify-resolve-gates.js's
// review finding 5 deleted a hand-written `CREATE TABLE` from that script for
// exactly this reason — "this script must never invent the schema". Importing
// the helper keeps one owner rather than making this a second hand-copied DDL.
const freshMigratedDb = require('../../__tests__/helpers/freshMigratedDb');
const { runImport, formatImportReport } = require('../run-concept-import');

/**
 * Register the six books and seed their priorities INTO THE SCRATCH DATABASE.
 *
 * ⚠️ `title_is` IS NOT OPTIONAL, and omitting it fails SILENTLY. Migration 003
 * declares `title_is TEXT NOT NULL` with no default, and SQLite's `OR IGNORE`
 * conflict resolution swallows a NOT NULL violation: no exception, no row. That
 * is register §C35's defect — the same one that leaves `efnafraedi-2e`
 * unregistered on any locally-migrated database — and it is why caveat 2 exists.
 * `registered_by = 'gate'` marks these rows as synthetic; the slug stands in for
 * a title deliberately, since inventing an Icelandic one would be misleading.
 */
function seedBooks(db) {
  if (
    !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get('registered_books')
  ) {
    throw new Error('registered_books is missing — the migrations did not run');
  }
  const insBook = db.prepare(
    "INSERT OR IGNORE INTO registered_books (slug, title_is, registered_by) VALUES (?, ?, 'gate')"
  );
  const insPrio = db.prepare(
    'INSERT OR REPLACE INTO book_domain_priority (book_id, domain, position) VALUES (?, ?, ?)'
  );
  const registered = [];
  for (const [slug, domains] of Object.entries(BOOK_DOMAIN_PRIORITY)) {
    const before = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
    insBook.run(slug, slug);
    const row = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
    if (!row) {
      throw new Error(
        `${slug} could not be registered — INSERT OR IGNORE swallowed it (§C35 shape). ` +
          'Check registered_books’ NOT NULL columns.'
      );
    }
    domains.forEach((d, i) => insPrio.run(row.id, d, i + 1));
    registered.push(`${slug}${before ? ' (already registered)' : ' (registered by this script)'}`);
  }
  console.log('  ' + registered.join('\n  '));
}

/**
 * Build the scratch corpus, capturing anything migration 048 warns about.
 *
 * ⚠️ The capture is gate 2's positive observation. 048 logs `[048] …` ONLY when
 * `book_concept_preference` held rows; silence is therefore the measurement that
 * nothing was expanded, dropped or collided. Reading the row count afterwards
 * cannot tell you that — the table is gone by then, by design.
 */
function buildCorpusDb(corpusDir) {
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (...a) => {
    warnings.push(a.join(' '));
    realWarn(...a);
  };
  let built;
  try {
    built = freshMigratedDb();
  } finally {
    console.warn = realWarn;
  }
  if (built.errors.length) {
    throw new Error(`migrations failed:\n  ${built.errors.join('\n  ')}`);
  }
  console.log(`  migrations applied: ${built.applied}, errors: 0`);
  console.log(`  scratch database:   ${built.path}`);

  const t0 = Date.now();
  const stats = runImport(built.db, corpusDir);
  console.log(formatImportReport(stats));
  console.log(`  import wall time: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { ...built, warnings };
}

module.exports = { buildCorpusDb, seedBooks };
