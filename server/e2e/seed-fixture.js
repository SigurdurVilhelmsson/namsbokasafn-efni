// E2E-only: build the throwaway DB schema and register the __e2e-fixture__ book.
// Run by playwright.config.js's webServer command BEFORE `node ../index.js`,
// with SESSIONS_DB_PATH pointing at the throwaway DB. Never runs in production.
const Database = require('better-sqlite3');
const { runAllMigrations, failLoudOnMigrationErrors } = require('../services/migrationRunner');
const resolveDbPath = require('../lib/dbPath');
const { BOOK_DOMAIN_PRIORITY } = require('../lib/domains');

// builds full schema + migration seed on the fresh DB; abort loudly if the
// schema build errors (previously the result was discarded, hiding failures).
const migrationResult = runAllMigrations();
failLoudOnMigrationErrors(migrationResult, {
  onError: (errors) => console.error('seed-fixture: migration errors — aborting', errors),
});

const db = new Database(resolveDbPath());
try {
  db.prepare(
    `INSERT OR IGNORE INTO registered_books (slug, title_is, registered_by, status)
     VALUES ('__e2e-fixture__', 'E2E Fixture', 'e2e', 'active')`
  ).run();
  const row = db.prepare(`SELECT id FROM registered_books WHERE slug = '__e2e-fixture__'`).get();
  db.prepare(
    `INSERT OR IGNORE INTO book_subject_mapping (book_id, primary_subject) VALUES (?, 'chemistry')`
  ).run(row.id);

  // ⚠️ Register the real books too, and seed their book_domain_priority rows.
  //
  // §C51/§C35: a database built from every migration, from empty, ends with
  // registered_books = ['edlisfraedi-2e', 'lifraen-efnafraedi'] only.
  // 019-register-new-books.js's INSERT OR IGNORE for liffraedi-2e/orverufraedi
  // omits the NOT NULL registered_by column and silently no-ops; efnafraedi-2e
  // and stjornufraedi are registered by no migration at all. On a real box this
  // is invisible — an admin registers each book via the admin route soon after
  // first boot, and that row then persists forever. E2E never takes that step;
  // it rebuilds from empty every run, so it never picks up the same rows.
  //
  // This was harmless before the B4b-1 matcher cut-over: the old matcher
  // (`terminology_headwords` + a null-safe subject check) never required a
  // registered book at all. Task 4 made an unscoped book fail-closed on
  // purpose (server/lib/conceptResolver.js buildScope, commit 39b14a49) — a
  // deliberate, correct decision in isolation — and that turned this
  // pre-existing gap fatal: /terms for efnafraedi-2e returned zero matches for
  // every segment in this fixture, not merely for anything a test created.
  //
  // The real fix is migration-side (§C51/§C35, deliberately NOT done here —
  // migrations run on every server start including production's, and fixing
  // 019 properly is its own item). This block exists only so the E2E box
  // behaves like a real install that HAS had the admin step done — without it,
  // the E2E box is not representative of one.
  //
  // registered_by is set explicitly (unlike 019's bug) so INSERT OR IGNORE
  // cannot silently no-op the same way. Domain priorities are read from
  // lib/domains.js's BOOK_DOMAIN_PRIORITY — the SAME map migration 047 reads on
  // every real boot to (re-)populate book_domain_priority — rather than
  // retyped here, so this cannot drift from that map independently.
  const titleIs = {
    'efnafraedi-2e': 'Efnafræði 2e',
    'liffraedi-2e': 'Líffræði 2e',
    orverufraedi: 'Örverufræði',
    'lifraen-efnafraedi': 'Lífræn efnafræði',
    'edlisfraedi-2e': 'Eðlisfræði 2e',
    stjornufraedi: 'Stjörnufræði',
  };
  const registerBook = db.prepare(
    `INSERT OR IGNORE INTO registered_books (slug, title_is, registered_by, status)
     VALUES (?, ?, 'e2e', 'active')`
  );
  const bookBySlug = db.prepare(`SELECT id FROM registered_books WHERE slug = ?`);
  const insertPriority = db.prepare(
    `INSERT OR IGNORE INTO book_domain_priority (book_id, domain, position) VALUES (?, ?, ?)`
  );
  for (const [slug, domains] of Object.entries(BOOK_DOMAIN_PRIORITY)) {
    registerBook.run(slug, titleIs[slug] || slug);
    const book = bookBySlug.get(slug);
    domains.forEach((domain, i) => insertPriority.run(book.id, domain, i + 1));
  }

  // ⚠️ Concept seeds for server/e2e/terminology-multibook.spec.js's issue-path
  // and match-shape tests. D1-a (docs/superpowers/specs/2026-08-10-terminology
  // -concept-model-part-b4b1-design.md §3): the concept model has no write path
  // until B4c, so POST /api/terminology can no longer make a term matchable by
  // findTermsInSegments — it writes the OLD terminology_headwords/
  // terminology_translations tables only, which the matcher no longer reads.
  // Seeded directly here so those two tests can still exercise the /terms
  // route's issue path and match shape end-to-end over HTTP, which is their
  // whole purpose (they were ported from C24 specifically to keep a real
  // server + real DB in that loop).
  //
  // Both English strings ('toys', 'ancestors') occur once, whole-word, in
  // efnafraedi-2e ch01/m68664's real EN text (verified against
  // 02-for-mt/ch01/m68664-segments.en.md's opening paragraph — the spec's own
  // comment records the same fact). domain: 'chemistry' is efnafraedi-2e's #1
  // book_domain_priority (seeded above), so each concept's sole Icelandic term
  // wins uncontested — no book_term_preference row needed. The '-e2e-seed'
  // suffix guarantees the Icelandic strings cannot already occur in the
  // module's real faithful/MT text, so the 'toys' concept's 'missing' issue is
  // deterministic, not incidental. ⚠️ These Icelandic strings are duplicated
  // (not imported) in the spec file's assertions — if the two ever disagree,
  // the spec's `expected` assertion fails loudly rather than passing on a
  // stale string.
  const seedConcept = db.prepare('INSERT INTO concept (domain) VALUES (?)');
  const seedTerm = db.prepare(
    `INSERT INTO concept_term (concept_id, lang, text, rank, source)
     VALUES (?, ?, ?, 1, 'e2e-seed')`
  );
  const toysConcept = Number(seedConcept.run('chemistry').lastInsertRowid);
  seedTerm.run(toysConcept, 'en', 'toys');
  seedTerm.run(toysConcept, 'is', 'leikföng-e2e-seed');

  const ancestorsConcept = Number(seedConcept.run('chemistry').lastInsertRowid);
  seedTerm.run(ancestorsConcept, 'en', 'ancestors');
  seedTerm.run(ancestorsConcept, 'is', 'forfeður-e2e-seed');
} finally {
  db.close();
}
