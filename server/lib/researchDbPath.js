/**
 * Path of the research database, derived from sessions.db's (spec §5.1).
 *
 * `sessions` is replaced in the base name only, so a directory named
 * `sessions` is untouched. A base name without `sessions` gets `.research`
 * before its extension: several suites choose names with no `sessions`, and
 * a plain replace would point the research file at the editorial test DB.
 *
 * There is deliberately no second environment variable. The server loads
 * `.env` (server/index.js:24) but the cron scripts do not, so two variables
 * could disagree. `researchDb` still refuses to open when the two paths are
 * equal, though this module never produces that.
 */
const path = require('path');
const resolveDbPath = require('./dbPath');

/**
 * @param {string} sessionsPath absolute path to the editorial database
 * @returns {string} absolute path to the research database beside it
 */
function deriveResearchPath(sessionsPath) {
  const dir = path.dirname(sessionsPath);
  const base = path.basename(sessionsPath);
  if (base.includes('sessions')) return path.join(dir, base.replaceAll('sessions', 'research'));
  const ext = path.extname(base);
  return path.join(dir, ext ? `${base.slice(0, -ext.length)}.research${ext}` : `${base}.research`);
}

/**
 * Read at call time, never cached, so tests that change SESSIONS_DB_PATH see it.
 * @returns {{ researchPath: string, editorialPath: string }}
 */
function resolveResearchDbPath() {
  const editorialPath = resolveDbPath();
  return { researchPath: deriveResearchPath(editorialPath), editorialPath };
}

module.exports = { deriveResearchPath, resolveResearchDbPath };
