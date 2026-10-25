/**
 * Migration 052: retire the chapter file registry's table, chapter_generated_files.
 *
 * [USER] retired the registry on 2026-10-25: chapter import and the chapter file routes in
 * routes/books.js, and services/chapterFilesService.js. Its table kept one current row per book,
 * chapter and file type, so it could not hold a chapter's per-section files, and no page called
 * it. Production held 0 rows (measured read-only, 2026-10-25). Nothing reads or writes it now.
 *
 * ⚠️ ONLY THIS TABLE. chapter_generation_log, which 007 creates beside it, STAYS:
 * tools/lib/safeWrite.js writes backup events to it and services/pipelineStatusService.js reads
 * it, and all 244 rows on production are safeWrite's. Do not "finish the job" by dropping it.
 *
 * ⚠️ WHY A LATE DROP AND NOT AN EDIT TO 007. migrationRunner calls every up() on every server
 * start, in list order. On each start 007 creates chapter_generated_files (IF NOT EXISTS), and
 * then 015 UPDATEs it by name, on every start and with no existence check: 015's tableExists guard
 * covers only its tables with a `book` column, not its `book_slug` loop, which lists this table.
 * 033 does the same whenever its old organic slug is registered. If 007 stopped creating the table,
 * 015 would throw "no such table" on EVERY database, and a migration that throws stops the server
 * starting. So the table is dropped here, after them, as 030 dropped its tables: it is recreated
 * empty and dropped again on every start, which costs nothing and leaves the old migrations
 * untouched.
 *
 * ⚠️ NEVER THROWS. A DROP is a write, so a start that meets another writer holding the database
 * past the busy timeout can get SQLITE_BUSY. Production runs in WAL mode, where readers never block
 * it, but a writer can: scripts/backup-db.sh's wal_checkpoint(TRUNCATE), tools/lib/safeWrite.js,
 * or an old server process still stopping. (A writer held through the WHOLE start fails earlier,
 * unguarded migrations first; this guard covers one that arrives late.) That becomes one warning
 * and the next start drops the table; throwing would make failLoudOnMigrationErrors stop it.
 */

/** The whole migration, kept apart so that up() is nothing but the never-throw boundary. */
function migrate(db) {
  db.exec('DROP TABLE IF EXISTS chapter_generated_files');
}

module.exports = {
  name: '052-retire-chapter-generated-files',

  up(db) {
    try {
      migrate(db);
    } catch (err) {
      console.warn(
        `[052] could not drop chapter_generated_files — ${err.code || err.name}: ${err.message}. ` +
          'Nothing reads it any more, so nothing breaks; the next server start tries again. ' +
          'NOT THROWN ON PURPOSE: throwing here would stop this server starting at all.'
      );
    }
  },
};
