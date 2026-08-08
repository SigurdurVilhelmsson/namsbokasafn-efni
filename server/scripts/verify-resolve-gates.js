/**
 * B1 acceptance gates 1, 2, 3 and 5, measured against a scratch corpus DB.
 *
 * Usage:
 *   node server/scripts/verify-resolve-gates.js --db /tmp/claude-1000/b1-scratch.db
 *
 * ⚠️ READ-ONLY on the corpus tables. It DOES write registered_books and
 * book_domain_priority into the SCRATCH database, because the import creates the
 * schema but not the books. Never point --db at a real database.
 *
 * Exit: 0 all gates pass · 1 a gate failed · 2 usage or environment error.
 */
const fs = require('fs');
const Database = require('better-sqlite3');
const { BOOK_DOMAIN_PRIORITY } = require('../lib/domains');
const { buildScope, resolve } = require('../lib/conceptResolver');

function parseArgs(argv) {
  let db = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db') {
      // ⚠️ Do not swallow the NEXT FLAG as a value (B0 finding 5).
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        return { error: '--db needs a path as the next argument' };
      }
      db = argv[++i].trim();
    } else if (a === '-h' || a === '--help') {
      return { help: true };
    } else {
      return { error: `unrecognised argument '${a}' — accepted: --db <path>` };
    }
  }
  return db ? { db } : { error: '--db is required' };
}

/**
 * Register the six books and seed their priorities INTO THE SCRATCH DB.
 *
 * ⚠️ TASK 9 DEFECT FOUND AND FIXED (2026-08-08): the brief's original
 * `INSERT OR IGNORE INTO registered_books (slug, registered_by) VALUES (?, 'gate')`
 * omits `title_is`. The REAL schema (created by the 47 migrations, not by the
 * `CREATE TABLE IF NOT EXISTS` below, which is a no-op against this DB) declares
 * `title_is TEXT NOT NULL` with no default. SQLite's `OR IGNORE` conflict
 * resolution SILENTLY SWALLOWS a NOT NULL violation — no exception, no row
 * inserted. The very next line does
 *   `const { id } = db.prepare('SELECT id ... WHERE slug = ?').get(slug)`
 * which then destructures `undefined` and throws
 * `TypeError: Cannot destructure property 'id' of 'row' as it is undefined`.
 * Reproduced verbatim against a scratch copy of the real DB, for 'efnafraedi-2e'
 * — the FIRST book Object.entries(BOOK_DOMAIN_PRIORITY) yields, and the one
 * Gates 1 and 2 both depend on. Only 2 of the 6 books (lifraen-efnafraedi,
 * edlisfraedi-2e) are pre-registered by run-concept-import.js's own §C35 seed,
 * so this is not an edge case — it kills the script on the very first book,
 * before Gate 1 ever runs. Fix: supply title_is (the slug itself — this is a
 * synthetic gate registration, `registered_by = 'gate'` already marks it as
 * such, so a real Icelandic title would be misleading, not more correct).
 */
function seedBooks(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS registered_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL,
    title_is TEXT, status TEXT DEFAULT 'active', registered_by TEXT)`);
  const insBook = db.prepare(
    "INSERT OR IGNORE INTO registered_books (slug, title_is, registered_by) VALUES (?, ?, 'gate')"
  );
  const insPrio = db.prepare(
    'INSERT OR REPLACE INTO book_domain_priority (book_id, domain, position) VALUES (?, ?, ?)'
  );
  for (const [slug, domains] of Object.entries(BOOK_DOMAIN_PRIORITY)) {
    insBook.run(slug, slug);
    const { id } = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
    domains.forEach((d, i) => insPrio.run(id, d, i + 1));
  }
}

/** Distinct English strings in scope for a book — gate 3. */
function scopedEnglish(db, slug) {
  const rows = db
    .prepare(
      `SELECT DISTINCT t.text
         FROM concept_term t JOIN concept c ON c.id = t.concept_id
         JOIN book_domain_priority p ON p.domain = c.domain
         JOIN registered_books b ON b.id = p.book_id
        WHERE t.lang = 'en' AND b.slug = ?`
    )
    .all(slug);
  return rows.map((r) => r.text);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: node server/scripts/verify-resolve-gates.js --db <scratch.db>');
    return 0;
  }
  if (args.error) {
    console.error(`error: ${args.error}`);
    return 2;
  }
  if (!fs.existsSync(args.db)) {
    console.error(`error: no such database ${args.db}`);
    return 2;
  }

  const db = new Database(args.db);
  seedBooks(db);
  const failures = [];

  // ── Gate 1: chemistry's fallback returns the four named terms ────────────
  const chemScope = buildScope(db, 'efnafraedi-2e', 0);
  if (chemScope.unscoped) {
    console.error(`GATE 1 FAIL: efnafraedi-2e is ${chemScope.unscoped}`);
    return 1;
  }
  console.log('── Gate 1: chemistry fallback ──');
  for (const en of ['pH', 'bond', 'carbon dioxide', 'nitrogen']) {
    const r = resolve(db, chemScope, en);
    const via = r.winner
      ? `${r.winner.domain} @${r.winner.position} -> ${r.winner.text}`
      : 'UNRESOLVED';
    console.log(`  ${en.padEnd(16)} ${via}`);
    if (!r.winner) failures.push(`gate1: '${en}' did not resolve`);
  }

  // ── Gate 2: the tie census ───────────────────────────────────────────────
  //
  // ⚠️ METHOD MATTERS AS MUCH AS THE NUMBER. §C36 measured 2,001/126/310 for
  // efnafraedi-2e under TWO restrictions, both reproduced here:
  //   (a) restricted to English strings that appear in the book's own 01-source;
  //   (b) a tie counted only in the BEST AVAILABLE domain (a tie at position 3 is
  //       not a tie when something resolved at position 1) — which resolve()
  //       already enforces, since `tied` is only ever populated at `best`.
  // A different number is a FINDING TO EXPLAIN, not a constant to update — but
  // only if the method is the same, so the script prints it.
  console.log('\n── Gate 2: tie census (efnafraedi-2e) ──');
  // ⚠️ TASK 9 DEFECT #2 (minor): the brief's own printed label here said
  // "books/efnafraedi-2e/01-source", but collectSourceEnglish() below reads
  // 02-for-mt (the extracted EN segments), not 01-source (raw CNXML). Fixed
  // the label to match what the code actually does, rather than leave a
  // self-contradicting method claim in a script whose whole purpose is
  // precise measurement.
  console.log('  method: strings from books/efnafraedi-2e/02-for-mt, exact binary match');
  const sourceStrings = collectSourceEnglish('efnafraedi-2e');
  let outright = 0;
  let nominal = 0;
  let real = 0;
  for (const en of sourceStrings) {
    const r = resolve(db, chemScope, en);
    if (r.tied.length) real++;
    else if (r.nominalTie.length) nominal++;
    else if (r.winner) outright++;
  }
  console.log(`  strings considered: ${sourceStrings.length}`);
  console.log(`  outright ${outright} · nominal ${nominal} · real ${real}`);
  console.log('  register recorded: outright 2001 · nominal 126 · real 310');

  // ── Gate 3: scope sizes ──────────────────────────────────────────────────
  console.log('\n── Gate 3: scoped corpus size ──');
  for (const slug of ['liffraedi-2e', 'efnafraedi-2e']) {
    const n = scopedEnglish(db, slug).length;
    console.log(`  ${slug.padEnd(18)} ${n} distinct English terms`);
  }
  console.log('  register recorded: liffraedi-2e 47568 · efnafraedi-2e 19749');

  // ── Gate 5: the term-less-candidate population ───────────────────────────
  //
  // B0's finding 4 is the model: quantify the hazard rather than assume it. If
  // this is 0 the §6 filter is a deliberate latent-case pin; if it is non-zero
  // gates 1 and 2 are NOT independent of it.
  console.log('\n── Gate 5: term-less candidates ──');
  const termless = db
    .prepare(
      `SELECT COUNT(*) AS n FROM concept c
        WHERE EXISTS (SELECT 1 FROM concept_term t WHERE t.concept_id = c.id AND t.lang = 'en')
          AND NOT EXISTS (SELECT 1 FROM concept_term t WHERE t.concept_id = c.id AND t.lang = 'is')`
    )
    .get().n;
  console.log(`  concepts with an EN term and NO IS term: ${termless}`);
  console.log(
    termless === 0
      ? '  -> the §6 filter is a LATENT-case pin. Say so in the spec.'
      : '  -> the case is LIVE. Gates 1 and 2 are not independent of the filter.'
  );

  // ── Controls ─────────────────────────────────────────────────────────────
  console.log('\n── Controls ──');
  const unreg = buildScope(db, 'engin-slik-bok', 0);
  const noPrio = (() => {
    db.prepare(
      "INSERT OR IGNORE INTO registered_books (slug, title_is, registered_by) VALUES ('ctrl-bare', 'ctrl-bare', 'gate')"
    ).run();
    return buildScope(db, 'ctrl-bare', 0);
  })();
  console.log(
    `  unregistered -> ${unreg.unscoped} · registered-no-priorities -> ${noPrio.unscoped}`
  );
  if (unreg.unscoped === noPrio.unscoped)
    failures.push('control: the two unscoped causes are indistinguishable');

  const miss = resolve(db, chemScope, 'zzz-not-a-term-zzz');
  console.log(`  a genuine miss -> winner ${miss.winner} · unscoped ${miss.unscoped}`);
  if (miss.unscoped !== false) failures.push('control: a miss reported an unscoped cause');

  db.close();
  if (failures.length) {
    console.error(`\nFAIL (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log('\nALL GATES REPORTED. Record the numbers in test-results/.');
  return 0;
}

/**
 * Distinct English strings appearing in a book's extracted EN segments —
 * books/<slug>/02-for-mt/**\/*.md, the text the MT glossary is actually filtered
 * against by filterGlossaryForText.
 *
 * ⚠️ THREE TRAPS, each measured in this tree on 2026-08-08, each of which
 * silently inflates or empties the census rather than erroring:
 *
 * 1. `02-for-mt` holds ~700 `<name>.md.backup.<timestamp>` files beside its 249
 *    real `.md` files. `endsWith('.md')` correctly excludes them BECAUSE they end
 *    in the timestamp. Do NOT "improve" this to `includes('.md')` — that pulls in
 *    every stale backup and counts months-old text as current source.
 *
 * 2. Every file is dense with `<!-- SEG:mNNNNN:type:id -->` markers. A bare word
 *    regex harvests `SEG`, `title`, `abstract-item` and friends as English terms.
 *    Strip the comments first.
 *
 * 3. Segment text carries `[[i:…]]`, `[[link:…]]`, `[[xref:…]]`, `[[docref:…]]`
 *    bracket markers whose TYPE names would likewise be counted. Strip the
 *    marker syntax but KEEP the inner prose — `[[i:hydrogen]]` really does mean
 *    the word hydrogen appears in the text.
 *
 * ⚠️ §C36 did NOT record how it extracted its strings, so this is a
 * reconstruction rather than a replay. That is why the caller prints the method.
 */
function collectSourceEnglish(slug) {
  const path = require('path');
  const root = path.join(__dirname, '..', '..', 'books', slug, '02-for-mt');
  if (!fs.existsSync(root)) {
    console.error(`  ⚠️ ${root} does not exist — gate 2 cannot run for ${slug}`);
    return [];
  }
  const words = new Set();
  let filesRead = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (!e.name.endsWith('.md')) continue; // excludes .md.backup.<timestamp>
      filesRead++;
      const text = fs
        .readFileSync(p, 'utf8')
        .replace(/<!--[\s\S]*?-->/g, ' ') // trap 2: SEG markers
        .replace(/\[\[[a-z]+:/g, ' ') // trap 3: marker OPEN, prose kept
        .replace(/\]\]/g, ' ');
      for (const m of text.matchAll(/[A-Za-z][A-Za-z-]+(?: [a-z]+)?/g)) words.add(m[0]);
    }
  };
  walk(root);
  // ⚠️ An empty result must be LOUD. A census over 0 files reports "0 ties" and
  // looks like a clean pass — an absence is not an answer.
  if (filesRead === 0) {
    console.error(`  ⚠️ read 0 .md files under ${root} — gate 2 is meaningless`);
    return [];
  }
  console.log(`  files read: ${filesRead}`);
  return [...words];
}

if (require.main === module) process.exitCode = main();
module.exports = { main, parseArgs };
