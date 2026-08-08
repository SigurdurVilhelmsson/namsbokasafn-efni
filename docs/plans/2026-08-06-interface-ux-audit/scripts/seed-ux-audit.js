/**
 * UX-audit seeder — builds a throwaway DB populated with the six REAL books.
 *
 * Replicates bookRegistration.registerBook()'s DB transaction ONLY. It
 * deliberately does NOT call createBookDirectories(), which writes a README
 * into books/<slug>/01-source/ — a read-only, legally load-bearing directory
 * (CLAUDE.md). Five of the six books currently lack that README, so calling
 * registerBook would create files in the protected tree.
 *
 * Run with SESSIONS_DB_PATH pointing at a scratchpad DB.
 */
const path = require('path');
const fs = require('fs');
const SERVER = '/home/user/namsbokasafn-efni/server';
// This script lives outside the server tree, so node_modules must be resolved explicitly.
const Database = require(path.join(SERVER, 'node_modules/better-sqlite3'));

const { runAllMigrations, failLoudOnMigrationErrors } = require(
  path.join(SERVER, 'services/migrationRunner')
);
const openstaxCatalogue = require(path.join(SERVER, 'services/openstaxCatalogue'));
const { chapterDir } = require(path.join(SERVER, 'lib/chapterLabel'));
const resolveDbPath = require(path.join(SERVER, 'lib/dbPath'));

const DATA_DIR = path.join(SERVER, 'data');

// catalogueSlug -> the Icelandic slug that exists under books/
const BOOKS = [
  'chemistry-2e',
  'biology-2e',
  'college-physics-2e',
  'organic-chemistry',
  'microbiology',
  'astronomy-2e',
];

// Mirrors server/e2e/helpers/auth.js DEFAULT_USER_IDS so injected JWTs line up
// with real rows (activity feeds / assignment tables resolve names from here).
const USERS = [
  { id: 99999, username: 'test-admin', name: 'Test Admin', role: 'admin' },
  { id: 99998, username: 'test-head-editor', name: 'Test Head-Editor', role: 'head-editor' },
  { id: 99997, username: 'test-editor', name: 'Test Editor', role: 'editor' },
  { id: 99995, username: 'test-viewer', name: 'Test Viewer', role: 'viewer' },
  // A deliberately clean account for the cold-start journey: no assignments,
  // no activity, no drafts.
  { id: 99990, username: 'nyr-kennari', name: 'Nýr Kennari', role: 'editor' },
];

function main() {
  const dbPath = resolveDbPath();
  console.log('DB:', dbPath);
  if (!dbPath.includes('scratchpad')) {
    throw new Error('Refusing to seed: SESSIONS_DB_PATH is not in the scratchpad — ' + dbPath);
  }
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }

  const result = runAllMigrations();
  failLoudOnMigrationErrors(result, {
    onError: (errors) => console.error('migration errors', errors),
  });
  console.log('migrations: ok');

  openstaxCatalogue.syncCatalogue();
  console.log('catalogue synced');

  const db = new Database(dbPath);
  try {
    for (const catalogueSlug of BOOKS) {
      const dataFile = path.join(DATA_DIR, `${catalogueSlug}.json`);
      const bookData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      const entry = openstaxCatalogue.getCatalogueEntry(catalogueSlug);
      if (!entry) {
        console.warn(`  !! no catalogue entry for ${catalogueSlug} — skipped`);
        continue;
      }
      const slug = bookData.slug;
      const titleIs = bookData.titleIs || bookData.title;

      const insertChapter = db.prepare(`
        INSERT INTO book_chapters (book_id, chapter_num, title_en, title_is, section_count, status)
        VALUES (?, ?, ?, ?, ?, 'not_started')`);
      const insertSection = db.prepare(`
        INSERT INTO book_sections (
          book_id, chapter_id, chapter_num, section_num, module_id,
          title_en, title_is, cnxml_path, en_md_path, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started')`);

      const counts = db.transaction(() => {
        // Migrations pre-seed some slugs (registered_by='system', null catalogue,
        // zero chapters). Clear any such row so this book is fully populated —
        // same shape as registerBook's forceReregister path.
        const existing = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
        if (existing) {
          db.prepare('DELETE FROM book_sections WHERE book_id = ?').run(existing.id);
          db.prepare('DELETE FROM book_chapters WHERE book_id = ?').run(existing.id);
          db.prepare('DELETE FROM registered_books WHERE id = ?').run(existing.id);
        }

        const bookRes = db
          .prepare(
            `INSERT INTO registered_books (catalogue_id, slug, title_is, registered_by, status)
             VALUES (?, ?, ?, 'ux-audit', 'active')`
          )
          .run(entry.id, slug, titleIs);
        const bookId = bookRes.lastInsertRowid;

        let sections = 0;
        let chapters = 0;
        for (const chapter of bookData.chapters || []) {
          const modules = chapter.modules || [];
          const chRes = insertChapter.run(
            bookId,
            chapter.chapter,
            chapter.title,
            chapter.titleIs || null,
            modules.length
          );
          chapters++;
          const dir = chapterDir(chapter.chapter);
          modules.forEach((mod, i) => {
            const sectionNum = mod.section || `${chapter.chapter}.${i}`;
            insertSection.run(
              bookId,
              chRes.lastInsertRowid,
              chapter.chapter,
              sectionNum,
              mod.id,
              mod.title,
              null,
              `01-source/${dir}/${mod.id}.cnxml`,
              `02-for-mt/${dir}/${String(sectionNum).replace('.', '-')}.en.md`
            );
            sections++;
          });
        }

        const appendices = bookData.appendices || [];
        if (appendices.length) {
          const apxRes = insertChapter.run(bookId, -1, 'Appendices', 'Viðaukar', appendices.length);
          chapters++;
          const dir = chapterDir(-1);
          appendices.forEach((a, i) => {
            insertSection.run(
              bookId,
              apxRes.lastInsertRowid,
              -1,
              String(i + 1),
              a.id,
              a.title ?? null,
              null,
              `01-source/${dir}/${a.id}.cnxml`,
              `02-for-mt/${dir}/${i + 1}.en.md`
            );
            sections++;
          });
        }

        const subject = entry.subject || 'chemistry';
        db.prepare(
          `INSERT OR IGNORE INTO book_subject_mapping (book_id, primary_subject) VALUES (?, ?)`
        ).run(bookId, subject);

        return { chapters, sections };
      })();

      console.log(
        `  ${slug.padEnd(20)} chapters=${String(counts.chapters).padEnd(3)} sections=${counts.sections}`
      );
    }

    const insertUser = db.prepare(`
      INSERT OR REPLACE INTO users (id, provider_id, provider_username, display_name, role, is_active)
      VALUES (?, ?, ?, ?, ?, 1)`);
    for (const u of USERS) {
      insertUser.run(u.id, String(u.id), u.username, u.name, u.role);
    }
    console.log(`users seeded: ${USERS.length}`);
  } finally {
    db.close();
  }
  console.log('SEED COMPLETE');
}

main();
