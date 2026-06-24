const path = require('path');

/**
 * Absolute path to the editorial server's SQLite DB. Honors SESSIONS_DB_PATH
 * (E2E points this at a throwaway DB); otherwise the canonical
 * pipeline-output/sessions.db. Single source of truth — was previously
 * duplicated across ~27 files.
 * @returns {string}
 */
module.exports = function resolveDbPath() {
  return (
    process.env.SESSIONS_DB_PATH ||
    path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db')
  );
};
