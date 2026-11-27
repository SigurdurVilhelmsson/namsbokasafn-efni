/**
 * Health of the locked off-box copies (G1.20): the 12-month check.
 *
 * scripts/backup-db.sh writes pipeline-output/backups/.offbox-locked-status.json
 * after each upload to the locked remote. /api/health reads it and calls this.
 * The file is only as fresh as the last upload, so the oldest copy's age is
 * advanced by the file's own age before it is compared with the alarm.
 *
 * /api/health is unauthenticated: the result carries only ok, state and
 * oldest_age_days, never a message, table, name or count. Never throws.
 *
 * @param {{statusText: string|null, statusMtimeMs: number|null, nowMs: number, staleHours: number}} p
 * @returns {{ok: boolean, state: string, oldest_age_days?: number}}
 */
const fs = require('fs');
const { CAP_ALARM_AFTER_DAYS, DAY_MS } = require('./editorialBackupPolicy');

function readLockedBackupHealth({ statusText, statusMtimeMs, nowMs, staleHours }) {
  try {
    if (statusText === null) return { ok: true, state: 'not-configured' };
    let status;
    try {
      status = JSON.parse(statusText);
    } catch {
      return { ok: false, state: 'unreadable' };
    }
    if (!status || typeof status !== 'object' || Array.isArray(status)) {
      return { ok: false, state: 'unreadable' };
    }
    const fileAgeMs = typeof statusMtimeMs === 'number' ? nowMs - statusMtimeMs : Infinity;
    if (!(fileAgeMs <= staleHours * 3600000)) return { ok: false, state: 'stale' };
    if (status.ok !== true) {
      const first = Array.isArray(status.reasons) ? status.reasons[0] : undefined;
      return { ok: false, state: typeof first === 'string' ? first : 'unreadable' };
    }
    if (!Number.isFinite(status.oldest_age_days)) return { ok: false, state: 'unreadable' };
    const oldest = status.oldest_age_days + Math.max(0, Math.floor(fileAgeMs / DAY_MS));
    if (oldest > CAP_ALARM_AFTER_DAYS)
      return { ok: false, state: 'over-cap', oldest_age_days: oldest };
    return { ok: true, state: 'ok', oldest_age_days: oldest };
  } catch {
    return { ok: false, state: 'unavailable' };
  }
}

/**
 * Read the status file and judge it. Only a MISSING file (ENOENT) is not-configured: a file that exists and cannot
 * be stat'ed or read (EACCES, EISDIR, EIO, ...) is unreadable, never a healthy not-configured (G1.20 final review
 * I2). server/index.js calls this, so the tested read is the shipped one. Never throws.
 *
 * @param {{statusFile: string, nowMs: number, staleHours: number}} p
 * @returns {{ok: boolean, state: string, oldest_age_days?: number}}
 */
function readLockedBackupHealthFile({ statusFile, nowMs, staleHours }) {
  let statusText = null;
  let statusMtimeMs = null;
  try {
    statusMtimeMs = fs.statSync(statusFile).mtimeMs;
    statusText = fs.readFileSync(statusFile, 'utf8');
  } catch (err) {
    if (!err || err.code !== 'ENOENT') return { ok: false, state: 'unreadable' };
    statusText = null;
    statusMtimeMs = null;
  }
  return readLockedBackupHealth({ statusText, statusMtimeMs, nowMs, staleHours });
}

module.exports = { readLockedBackupHealth, readLockedBackupHealthFile };
