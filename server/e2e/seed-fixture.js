// E2E-only: build the throwaway DB schema and register the __e2e-fixture__ book.
// Run by playwright.config.js's webServer command BEFORE `node ../index.js`,
// with SESSIONS_DB_PATH pointing at the throwaway DB. Never runs in production.
const Database = require('better-sqlite3');
const { runAllMigrations, failLoudOnMigrationErrors } = require('../services/migrationRunner');
const resolveDbPath = require('../lib/dbPath');

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
} finally {
  db.close();
}
