#!/usr/bin/env node
/**
 * READ-ONLY: snapshot every place a book's term rulings live, for the S tag
 * (Skerfur plan SD3, amended 2026-10-24).
 *
 * The approved-term baseline must count every ruling dated before S, whether or not it has
 * reached production yet: the 11 October stage 1 rulings reach production only after S. So
 * this reads all four places a ruling lives:
 *   - server/lib/houseStyleTerms.js at the checked-out commit (the house-style entries);
 *   - the book's preference rows in sessions.db (book_term_preference), with the term each
 *     one chooses;
 *   - the compiled stage 1 ruling set (its sha256, its counts, and the headwords it rules);
 *   - for diffing at the end, the concept model in the book's domains.
 *
 * The raw stores stay in the output, so SD3's two counts can be recomputed from it under
 * whatever definition SD3 settles on. `derived` holds them under SD3's recommendation:
 * headwords with a recorded ruling in any store, and committee confirmations (no store
 * records one yet).
 *
 * The database is opened `readonly: true, fileMustExist: true`. The snapshot goes to stdout
 * and a one-line summary to stderr, so it can be run over ssh with stdout redirected:
 *   node server/scripts/snapshot-ruling-stores.js --book efnafraedi-2e \
 *     --compiled experiments/terminology-consistency/results/2026-10-11/ruling-set-after-stage1.json \
 *     > ruling-snapshot.json
 * Relative paths resolve against the repository root. Exit codes: 0 written, 1 failed,
 * 2 usage.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

/** Every table read below. A database from before migration 047 lacks book_domain_priority. */
const REQUIRED_TABLES = [
  'registered_books',
  'book_domain_priority',
  'book_term_preference',
  'concept',
  'concept_term',
];
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{book: string, houseStyle: {domain: string, source: string, terms: object[]},
 *   compiled: object, compiledSha256: string, repoHead: string|null, takenAt: string}} opts
 */
function snapshotRulingStores(
  db,
  { book, houseStyle, compiled, compiledSha256, repoHead, takenAt }
) {
  const present = new Set(
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((r) => r.name)
  );
  const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
  if (missing.length) {
    throw new Error(
      `the database is missing table ${missing.join(', ')}: start the server once so its ` +
        `migrations run, then snapshot again`
    );
  }
  const registered = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(book);
  if (!registered) throw new Error(`book ${book} is not registered on this server`);
  const domains = db
    .prepare(
      'SELECT domain, position FROM book_domain_priority WHERE book_id = ? ORDER BY position'
    )
    .all(registered.id);
  const domainNames = domains.map((d) => d.domain);

  const houseEntries = domainNames.includes(houseStyle.domain)
    ? houseStyle.terms.map((t) => ({ en: [...t.en], is: t.is, ruled: t.ruled }))
    : [];

  const preferences = db
    .prepare(
      `SELECT p.chapter, p.english, t.text AS term, t.lang, c.domain
         FROM book_term_preference p
         JOIN concept_term t ON t.id = p.term_id
         JOIN concept c ON c.id = t.concept_id
        WHERE p.book_id = ?
        ORDER BY p.chapter, p.english`
    )
    .all(registered.id);

  const inDomains = domainNames.map(() => '?').join(',');
  const concepts = domainNames.length
    ? db
        .prepare(
          `SELECT id, domain, idordabanki_id, merged_into FROM concept
            WHERE domain IN (${inDomains}) ORDER BY id`
        )
        .all(...domainNames)
    : [];
  const terms = domainNames.length
    ? db
        .prepare(
          `SELECT t.concept_id, t.lang, t.text, t.rank, t.source
             FROM concept_term t JOIN concept c ON c.id = t.concept_id
            WHERE c.domain IN (${inDomains})
            ORDER BY t.concept_id, t.lang, t.rank, t.text`
        )
        .all(...domainNames)
    : [];

  const ruled = new Set();
  for (const e of houseEntries) for (const en of e.en) ruled.add(norm(en));
  for (const r of preferences) ruled.add(norm(r.english));
  for (const r of compiled.stage1 || []) ruled.add(norm(r.enNorm || r.en));
  for (const r of compiled.before || []) ruled.add(norm(r.enNorm || r.en));

  return {
    about:
      'Every place a term ruling lives for this book, read at the S tag (Skerfur plan SD3). Read-only.',
    takenAt,
    repoHead,
    book,
    domains,
    stores: {
      houseStyle: {
        source: houseStyle.source,
        domain: houseStyle.domain,
        count: houseEntries.length,
        sha256: hash(houseEntries),
        entries: houseEntries,
      },
      preferences: {
        table: 'book_term_preference',
        count: preferences.length,
        sha256: hash(preferences),
        rows: preferences,
      },
      compiled: {
        sha256: compiledSha256,
        compiledAt: compiled.compiledAt,
        repoHead: compiled.repoHead,
        counts: compiled.counts,
        stage1: (compiled.stage1 || []).length,
        before: (compiled.before || []).length,
      },
      conceptModel: {
        domains: domainNames,
        concepts: concepts.length,
        termCount: terms.length,
        sha256: hash({ concepts, terms }),
        terms,
      },
    },
    derived: {
      note: "Under SD3's recommendation. Recompute from `stores` if SD3 is amended.",
      rulingHeadwords: { count: ruled.size, headwords: [...ruled].sort() },
      committeeConfirmed: { count: 0, note: 'No store records a committee confirmation at S.' },
    },
  };
}

/** Unknown arguments are refused, not dropped (CLAUDE.md: parseArgs silently drops them). */
function parse(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--book', '--compiled'].includes(a) && argv[i + 1]) {
      args[a.slice(2)] = argv[i + 1];
      i += 1;
    } else return { error: `unknown or incomplete argument: ${a}` };
  }
  for (const k of ['book', 'compiled']) if (!args[k]) return { error: `--${k} is required` };
  return args;
}

function main() {
  process.exitCode = 1; // a run that reaches no verdict must not read as success
  const args = parse(process.argv.slice(2));
  if (args.error) {
    console.error(
      `${args.error}\nusage: snapshot-ruling-stores.js --book <slug> --compiled <file>`
    );
    process.exitCode = 2;
    return;
  }
  const Database = require('better-sqlite3');
  const resolveDbPath = require('../lib/dbPath');
  const houseStyle = require('../lib/houseStyleTerms');
  const compiledBytes = fs.readFileSync(path.resolve(ROOT, args.compiled));
  let repoHead = null;
  try {
    repoHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    repoHead = null; // reported as null rather than guessed
  }
  const db = new Database(resolveDbPath(), { readonly: true, fileMustExist: true });
  try {
    const snapshot = snapshotRulingStores(db, {
      book: args.book,
      houseStyle: {
        domain: houseStyle.HOUSE_STYLE_DOMAIN,
        source: 'server/lib/houseStyleTerms.js',
        terms: houseStyle.HOUSE_STYLE_TERMS,
      },
      compiled: JSON.parse(compiledBytes.toString('utf8')),
      compiledSha256: crypto.createHash('sha256').update(compiledBytes).digest('hex'),
      repoHead,
      takenAt: new Date().toISOString(),
    });
    process.stdout.write(JSON.stringify(snapshot, null, 1) + '\n');
    const s = snapshot.stores;
    console.error(
      `snapshot ${args.book} at ${repoHead || 'unknown commit'}: house style ${s.houseStyle.count}, ` +
        `preferences ${s.preferences.count}, compiled stage 1 ${s.compiled.stage1} + before ` +
        `${s.compiled.before}, concept terms ${s.conceptModel.termCount}; ` +
        `headwords with a ruling ${snapshot.derived.rulingHeadwords.count}`
    );
    process.exitCode = 0;
  } catch (err) {
    console.error(`snapshot refused: ${err.message}`); // exitCode stays 1
  } finally {
    db.close();
  }
}

if (require.main === module) main();

module.exports = { snapshotRulingStores };
