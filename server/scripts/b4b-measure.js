/**
 * B4b design measurement — READ-ONLY. Two blocking questions:
 *   Q1  Does the `missing`-issue inflection check have anything to lose?
 *   Q2  The automaton fork: global EN automaton vs per-book in-scope automaton.
 * Run: ssh prod 'cd ~/repos/namsbokasafn-efni/server && node -' < this
 */
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');
const db = new Database(resolveDbPath(), { readonly: true });

const line = (s) => console.log(s);
line('DB: ' + resolveDbPath());

// ─── Q1 — the OLD model's inflection population ───────────────────────
line('\n══ Q1 — inflections in the OLD model (what the `missing` check runs on) ══');
const inf = db
  .prepare(
    `SELECT COUNT(*) tot,
            SUM(CASE WHEN inflections IS NOT NULL AND inflections <> '' AND inflections <> '[]'
                     THEN 1 ELSE 0 END) withInf,
            SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) approved,
            SUM(CASE WHEN status='approved' AND inflections IS NOT NULL
                      AND inflections <> '' AND inflections <> '[]' THEN 1 ELSE 0 END) apprInf
       FROM terminology_translations`
  )
  .get();
line(`  terminology_translations       : ${inf.tot}`);
line(
  `  ... with NON-EMPTY inflections : ${inf.withInf}  (${((100 * inf.withInf) / inf.tot).toFixed(2)}%)`
);
line(`  ... approved                   : ${inf.approved}`);
line(
  `  ... approved WITH inflections  : ${inf.apprInf}  (${((100 * inf.apprInf) / (inf.approved || 1)).toFixed(2)}% of approved)`
);
line('  → THE CONTROL: if this is ~0, the `missing` check already matches base forms only,');
line('    and the concept model losing `inflections` costs nothing measurable.');

// ─── Q2 — automaton sizing ────────────────────────────────────────────
line('\n══ Q2 — the automaton fork ══');
const globalEn = db
  .prepare("SELECT COUNT(DISTINCT text) n FROM concept_term WHERE lang='en'")
  .get().n;
const globalEnRows = db.prepare("SELECT COUNT(*) n FROM concept_term WHERE lang='en'").get().n;
const oldHeadwords = db.prepare('SELECT COUNT(*) n FROM terminology_headwords').get().n;
line(`  OLD global automaton  (terminology_headwords)      : ${oldHeadwords}`);
line(`  NEW global automaton  (DISTINCT concept_term en)   : ${globalEn}   [rows ${globalEnRows}]`);
line(
  `  ratio new/old (global)                             : ${(globalEn / oldHeadwords).toFixed(2)}x`
);

line('\n  Per-book IN-SCOPE distinct EN strings (the per-book-automaton arm):');
const books = db
  .prepare(
    `SELECT rb.id, rb.slug FROM registered_books rb
      WHERE EXISTS (SELECT 1 FROM book_domain_priority p WHERE p.book_id = rb.id)
      ORDER BY rb.slug`
  )
  .all();
const scopeStmt = db.prepare(
  `SELECT COUNT(DISTINCT t.text) n
     FROM concept_term t JOIN concept c ON c.id = t.concept_id
    WHERE t.lang='en'
      AND c.domain IN (SELECT domain FROM book_domain_priority WHERE book_id = ?)`
);
const scopes = new Map();
for (const b of books) {
  const n = scopeStmt.get(b.id).n;
  scopes.set(b.slug, n);
  const prio = db
    .prepare('SELECT domain FROM book_domain_priority WHERE book_id=? ORDER BY position')
    .all(b.id)
    .map((r) => r.domain);
  line(
    `    ${b.slug.padEnd(20)} ${String(n).padStart(6)}  (${((100 * n) / globalEn).toFixed(1)}% of global)  chain: ${prio.join(' > ')}`
  );
}
const maxScope = Math.max(...scopes.values());
line(`  → largest book scope: ${maxScope}; global: ${globalEn}`);
line(
  `  → a per-book automaton saves ${(100 - (100 * maxScope) / globalEn).toFixed(1)}% of entries at worst,`
);
line('    but turns ONE cached trie into one per open (book,chapter).');

// How many DISTINCT scope sets are there? Books sharing a chain share an automaton.
const chains = new Map();
for (const b of books) {
  const key = db
    .prepare('SELECT domain FROM book_domain_priority WHERE book_id=? ORDER BY position')
    .all(b.id)
    .map((r) => r.domain)
    .sort()
    .join('|');
  if (!chains.has(key)) chains.set(key, []);
  chains.get(key).push(b.slug);
}
line(`  → DISTINCT domain-sets across ${books.length} books: ${chains.size}`);
for (const [k, v] of chains) line(`      {${k}} → ${v.join(', ')}`);

// ─── Q3 — how many matched strings would resolve() actually see? ──────
line('\n══ Q3 — resolve() call volume (the per-match cost) ══');
line('  resolve() is called ONCE PER MATCHED STRING, not once per scope entry.');
const multi = db
  .prepare(
    `SELECT COUNT(*) n FROM (
       SELECT t.text FROM concept_term t JOIN concept c ON c.id=t.concept_id
        WHERE t.lang='en' GROUP BY t.text HAVING COUNT(DISTINCT c.id) > 1)`
  )
  .get().n;
line(
  `  EN strings carried by >1 concept (where resolution actually decides): ${multi} of ${globalEn} (${((100 * multi) / globalEn).toFixed(1)}%)`
);

// ─── Q4 — case folding: does the corpus contain non-ASCII EN keys? ────
line('\n══ Q4 — case-fold safety (nocaseKey is ASCII-only) ══');
const nonAscii = db
  .prepare(
    "SELECT COUNT(DISTINCT text) n FROM concept_term WHERE lang='en' AND text GLOB '*[^ -~]*'"
  )
  .get().n;
line(`  DISTINCT EN strings containing non-ASCII: ${nonAscii}`);
const caseDupes = db
  .prepare(
    `SELECT COUNT(*) n FROM (
       SELECT LOWER(text) k FROM concept_term WHERE lang='en'
        GROUP BY LOWER(text) HAVING COUNT(DISTINCT text) > 1)`
  )
  .get().n;
line(`  EN strings differing ONLY by case: ${caseDupes} group(s)`);

db.close();
line('\nDONE (read-only, nothing written).');
