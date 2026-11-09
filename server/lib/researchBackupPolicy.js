/**
 * The research backup's values and the copy names it owns (G1.1 + G1.2 spec §5.17, §5.20; PR4
 * decisions 23 and 24).
 *
 * These are enforceable values: a change here changes its test in the same commit (CLAUDE.md § One
 * source of truth), and no prose elsewhere restates them.
 *
 * - RESEARCH_BACKUP_CRON_HOURS is the period of the research line in scripts/install-cron.sh,
 *   pinned against that file in researchBackupPolicy.test.js.
 * - MAX_COPY_AGE_HOURS is the decision record's 7 days (R2).
 * - PRUNE_CUTOFF_HOURS subtracts one cron period: no copy may be older than 7 days at any moment,
 *   and a copy is next looked at one period after this run.
 * - RESEARCH_BACKUP_STALE_HOURS is two missed cycles plus margin, the formula of the editorial
 *   checks (offboxBackupHealth.js, contentBackupHealth.js).
 *
 * A copy is pruned at the first run at which its age is within half a cron period of the cut-off
 * (PRUNE_TOLERANCE_HOURS). Each run prunes first and stamps its own copy seconds later, and cron
 * starts each run a little early or late, so measured from its stamp a copy is a few seconds short
 * of the cut-off at the very run meant to remove it; without the tolerance it survived a whole
 * period more, and one late or missed run then broke "no copy older than 7 days at any moment"
 * (spec §5.17; review finding 2026-11-08). The tolerance is derived, not chosen, and prunes early,
 * never late.
 *
 * Neither the cut-off nor the threshold has an environment override, unlike the editorial checks:
 * widening either one silently would hide a dead job behind a deletion promise.
 *
 * Owned names (decision 23): research.<YYYY-MM-DDTHHMMSSZ>.db, with an optional .partial (a copy in
 * progress) or .verify (the monthly test's download) suffix and an optional -wal, -shm or -journal.
 * The stamp is UTC, so a time-zone change cannot shift an age, and holds no colon. A name this
 * module does not own, or one stamped more than one period in the future, is reported as unknown:
 * never deleted and never ignored.
 */
const H = 3_600_000;
const RESEARCH_BACKUP_CRON_HOURS = 6;
const MAX_COPY_AGE_HOURS = 7 * 24;
const PRUNE_CUTOFF_HOURS = MAX_COPY_AGE_HOURS - RESEARCH_BACKUP_CRON_HOURS;
const RESEARCH_BACKUP_STALE_HOURS = 2 * RESEARCH_BACKUP_CRON_HOURS + 2;
const PRUNE_TOLERANCE_HOURS = RESEARCH_BACKUP_CRON_HOURS / 2;
const COPY_NAME = /^research\.\d{4}-\d{2}-\d{2}T\d{6}Z\.db$/;
const OWNED_NAME =
  /^research\.(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})Z\.db(?:\.partial|\.verify)?(?:-wal|-shm|-journal)?$/;

/** @returns {string} 'YYYY-MM-DDTHHMMSSZ' (UTC) */
function stamp(ms) {
  const s = new Date(ms).toISOString();
  return `${s.slice(0, 10)}T${s.slice(11, 13)}${s.slice(14, 16)}${s.slice(17, 19)}Z`;
}
const copyName = (ms) => `research.${stamp(ms)}.db`;

/** @returns {number | null} the stamp of an owned name, or null */
function stampMs(name) {
  const m = OWNED_NAME.exec(name);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  // A real instant only: 2026-02-30 would roll over to March and silently age the wrong way.
  return stamp(ms) === `${m[1]}-${m[2]}-${m[3]}T${m[4]}${m[5]}${m[6]}Z` ? ms : null;
}

/**
 * @param {string[]} names
 * @param {number} nowMs
 * @returns {{ expired: string[], unknown: string[] }} both sorted; empty names ignored
 */
function expiredNames(names, nowMs) {
  const expired = [];
  const unknown = [];
  for (const name of names) {
    if (!name) continue;
    const t = stampMs(name);
    if (t === null || t - nowMs > RESEARCH_BACKUP_CRON_HOURS * H) unknown.push(name);
    else if (nowMs - t >= (PRUNE_CUTOFF_HOURS - PRUNE_TOLERANCE_HOURS) * H) expired.push(name);
  }
  return { expired: expired.sort(), unknown: unknown.sort() };
}

module.exports = {
  RESEARCH_BACKUP_CRON_HOURS,
  MAX_COPY_AGE_HOURS,
  PRUNE_CUTOFF_HOURS,
  RESEARCH_BACKUP_STALE_HOURS,
  PRUNE_TOLERANCE_HOURS,
  COPY_NAME,
  stamp,
  copyName,
  stampMs,
  expiredNames,
};
