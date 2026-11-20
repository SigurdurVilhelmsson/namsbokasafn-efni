/**
 * The database handle for the book glossary's server services (the background inflection lookup
 * and the routes' service). Its own module so neither service has to require the other for it.
 *
 * Same shape as pipelineStatusService's handle: lazy, WAL, and a test seam. The path is resolved
 * when the handle is first opened, not at module load, so a test that injects a database never
 * names the real file at all.
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const resolveDbPath = require('../lib/dbPath');

let _testDb = null;
let _db;

/** @internal Test-only: use this connection instead of opening the real database. */
function _setTestDb(db) {
  _testDb = db;
}

function getDb() {
  if (_testDb) return _testDb;
  if (!_db) {
    const dbPath = resolveDbPath();
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
  }
  return _db;
}

module.exports = { getDb, _setTestDb };
