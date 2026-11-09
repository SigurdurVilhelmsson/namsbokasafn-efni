/**
 * Every research-side path, beside the research file (G1.1 + G1.2 spec §5.15 step 4, §5.17; PR4
 * decision 2).
 *
 * The copies directory (research-backups/), the exports a deletion empties (research-exports/),
 * the end-of-editing exports a deletion never touches (served-version-exports/), the backup's
 * heartbeat and a restore's staging file all derive from the research file's own directory. On
 * production that is pipeline-output/ (researchDbPath.js). One variable, SESSIONS_DB_PATH, then
 * moves every file PR4 writes: no test touches pipeline-output/, and the server and the cron
 * cannot disagree about where a file lives (§5.1: no second environment variable).
 *
 * A staging path gets its own -wal and -shm, and keeps the live exports directory.
 */
const path = require('path');

/**
 * @param {string} researchPath the research file (or a restore's staged copy of it)
 * @returns {Readonly<{ dir: string, researchPath: string, walPath: string, shmPath: string,
 *   backupsDir: string, exportsDir: string, servedVersionExportsDir: string,
 *   heartbeatPath: string, stagingPath: string }>}
 */
function researchFilesFor(researchPath) {
  const dir = path.dirname(researchPath);
  return Object.freeze({
    dir,
    researchPath,
    walPath: `${researchPath}-wal`,
    shmPath: `${researchPath}-shm`,
    backupsDir: path.join(dir, 'research-backups'),
    exportsDir: path.join(dir, 'research-exports'),
    servedVersionExportsDir: path.join(dir, 'served-version-exports'),
    heartbeatPath: path.join(dir, '.last-research-backup'),
    stagingPath: `${researchPath}.restoring`, // a restore's staged copy (decision 32); the prune refuses to ignore it
  });
}

module.exports = { researchFilesFor };
