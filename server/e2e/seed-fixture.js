// E2E-only: build the throwaway DB schema and register the __e2e-fixture__ book.
// Run by playwright.config.js's webServer command BEFORE `node ../index.js`,
// with SESSIONS_DB_PATH pointing at the throwaway DB. Never runs in production.
const crypto = require('crypto');
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

  // One chapter with two sections under the fixture book, for the review tab's section list on the localization
  // page (localization-editor.spec.js; interface audit 2026-11-13, LO-01). They are inserted out of reading order,
  // and one is in progress, which the list shows beside its number. The fixture book is in no catalogue and has
  // no data file, so no book or chapter list shows it; that spec owns these rows.
  const fixtureChapter = Number(
    db
      .prepare(
        `INSERT INTO book_chapters (book_id, chapter_num, title_en) VALUES (?, 1, 'E2E chapter')`
      )
      .run(row.id).lastInsertRowid
  );
  const addFixtureSection = db.prepare(
    `INSERT INTO book_sections (book_id, chapter_id, chapter_num, section_num, title_en, status)
     VALUES (?, ?, 1, ?, ?, ?)`
  );
  addFixtureSection.run(
    row.id,
    fixtureChapter,
    '1.2',
    'E2E section two',
    'localization_in_progress'
  );
  addFixtureSection.run(row.id, fixtureChapter, '1.1', 'E2E section one', 'not_started');

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

  // ⚠️ The concept server/e2e/book-glossary.spec.js replaces and restores through the book
  // glossary page (plan ruling Q10). Measured 2026-11-20 on the real tree: 14 chemistry EN segments
  // hold "salt bridge", 12 of them with "saltbrú" whole-word in the served Icelandic, and none is in
  // a module another spec opens (m68663, m68664, m68667, m68684, m68693). The first is ch17 m68822,
  // segment m68822:para:fs-idm196674112, which the spec's worklist assertion keys on. No other
  // spec counts concepts, and the spec removes its own entry and the exclusion it claims.
  const saltBridgeConcept = Number(seedConcept.run('chemistry').lastInsertRowid);
  seedTerm.run(saltBridgeConcept, 'en', 'salt bridge');
  seedTerm.run(saltBridgeConcept, 'is', 'saltbrú');

  // ⚠️ The dedicated editor of server/e2e/suggestion-view.spec.js (G1.23, spec §9.4–9.6), and its
  // assignment to efnafraedi-2e chapter 2, which that spec owns (helpers/segments.js). A module of a
  // study book opens at its first serve to a user whose users row holds a user_chapter_assignments
  // row for the chapter (services/moduleOpenings.js: the row is looked up by provider_id, which is
  // the token's `sub`), and a module gets suggestions only if it opened strictly after the view's
  // first switch-on. The other logins seeded below with an assignment hold chapters 4, 5 and 6, so
  // only this editor's serves open a chapter 2 module.
  // NO switch row is seeded: the spec switches the view on itself, between its two openings, and
  // never switches it off. The provider id must match SUGGESTION_EDITOR_ID in that spec, and no
  // other spec may use it.
  const suggestionEditor = db
    .prepare(
      `INSERT INTO users (provider_id, provider_username, display_name, role, created_by)
       VALUES ('90123', 'e2e-suggestion-view-editor', 'E2E Suggestion Editor', 'editor', 'e2e')`
    )
    .run();
  db.prepare(
    `INSERT INTO user_chapter_assignments (user_id, book_slug, chapter, assigned_by)
     VALUES (?, 'efnafraedi-2e', 2, 'e2e')`
  ).run(Number(suggestionEditor.lastInsertRowid));

  // The two editors of server/e2e/assignments.spec.js (one assignee per chapter, [USER] 2026-11-14), and the
  // state that spec settles: efnafraedi-2e chapter 9 held by BOTH, as rows written before the rule could be.
  // Nobody signs in as either (no helper token uses these provider ids), so they open no module. That spec
  // owns chapters 7, 8 and 9 of the book's assignments; no other spec may assign them.
  const addAssignEditor = db.prepare(
    `INSERT INTO users (provider_id, provider_username, display_name, role, created_by)
     VALUES (?, ?, ?, 'editor', 'e2e')`
  );
  const assignA = Number(
    addAssignEditor.run('90201', 'e2e-assign-a', 'E2E Úthlutun A').lastInsertRowid
  );
  const assignB = Number(
    addAssignEditor.run('90202', 'e2e-assign-b', 'E2E Úthlutun B').lastInsertRowid
  );
  const addLegacyRow = db.prepare(
    `INSERT INTO user_chapter_assignments (user_id, book_slug, chapter, assigned_by)
     VALUES (?, 'efnafraedi-2e', 9, 'e2e')`
  );
  addLegacyRow.run(assignA);
  addLegacyRow.run(assignB);

  // What the assign gate asks of both before that spec can give them a chapter (G1.13 spec §6.5): a consent
  // decision on record (either kind, so a decline here) and a signed licence clause. The gate's third condition,
  // the suggestion view being on, is that spec's to meet: it runs in the playwright.config.js project that
  // depends on the one where suggestion-view.spec.js switches the view on. Planted directly, as every row here
  // is; the user_id is users.id, which neither table checks.
  const consentText = 'E2E consent text';
  const addDeclinedConsent = db.prepare(
    `INSERT INTO research_consent
       (user_id, decision, interval_id, consent_text_version, consent_text_sha256, given_at_ms)
     VALUES (?, 'declined', NULL, 'e2e', ?, ?)`
  );
  const addLicenceClause = db.prepare(
    `INSERT INTO editor_licence_clauses (user_id, signed_on, recorded_by, recorded_at_ms)
     VALUES (?, '2026-11-01', 'e2e', ?)`
  );
  for (const userId of [assignA, assignB]) {
    addDeclinedConsent.run(
      userId,
      crypto.createHash('sha256').update(consentText).digest('hex'),
      Date.now()
    );
    addLicenceClause.run(userId, Date.now());
  }

  // The editor of server/e2e/front-page.spec.js (Heim lists a member's chapters, interface audit 2026-11-13,
  // HM-01): efnafraedi-2e chapter 5, which that spec owns. It only reads Heim, so it opens no module.
  const heimEditor = Number(
    addAssignEditor.run('90301', 'e2e-heim-editor', 'E2E Heim Editor').lastInsertRowid
  );
  db.prepare(
    `INSERT INTO user_chapter_assignments (user_id, book_slug, chapter, assigned_by)
     VALUES (?, 'efnafraedi-2e', 5, 'e2e')`
  ).run(heimEditor);

  // The two editors who save in efnafraedi-2e as plain editors. Chemistry is a study book, so it is always
  // assignment-enforced (G1.13 spec §6.2): such an editor saves only with a users row whose provider_id is the
  // token's `sub` and an assignment row for the chapter. The rows are planted, not given through the assign gate.
  // A users row with an assignment makes the editor's first serve of a module in that chapter open it
  // (services/moduleOpenings.js), and an opened module gets suggestions for every viewer once the view is on, so
  // each spec owns a chapter and a module that no other spec serves:
  //   - server/e2e/editor-workflow.spec.js (provider id 88001): chapter 4, module m68710. It moved there from the
  //     fixture book, which is closed to non-admins (spec §6.1). Its head editor (88002) passes by the token's
  //     `books` and needs no row.
  //   - server/e2e/ux-phase2.spec.js's M5 block (provider id 88010): chapter 6, module m68729.
  // The provider ids must match those specs, and no other spec may use them or save in those chapters.
  const workflowEditor = Number(
    addAssignEditor.run('88001', 'e2e-workflow-editor', 'E2E Workflow Editor').lastInsertRowid
  );
  const m5Editor = Number(
    addAssignEditor.run('88010', 'e2e-m5-editor', 'E2E M5 Editor').lastInsertRowid
  );
  const addChemistryRow = db.prepare(
    `INSERT INTO user_chapter_assignments (user_id, book_slug, chapter, assigned_by)
     VALUES (?, 'efnafraedi-2e', ?, 'e2e')`
  );
  addChemistryRow.run(workflowEditor, 4);
  addChemistryRow.run(m5Editor, 6);
} finally {
  db.close();
}
