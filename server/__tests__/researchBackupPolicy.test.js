/**
 * The research backup's values and its copy-name arithmetic (G1.1 + G1.2 spec §5.17, §5.20; T19's
 * arithmetic half; PR4 Task 2, decisions 23 and 24).
 *
 * The cron period itself is pinned against scripts/install-cron.sh, below (PR4 Task 11).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  RESEARCH_BACKUP_CRON_HOURS,
  MAX_COPY_AGE_HOURS,
  PRUNE_CUTOFF_HOURS,
  RESEARCH_BACKUP_STALE_HOURS,
  COPY_NAME,
  stamp,
  copyName,
  stampMs,
  expiredNames,
} = require('../lib/researchBackupPolicy');
const contentBackupHealth = require('../lib/contentBackupHealth');
const offboxBackupHealth = require('../lib/offboxBackupHealth');

const H = 3_600_000;
const T = Date.UTC(2026, 10, 3, 6, 45, 7);

describe('researchBackupPolicy', () => {
  it('the cut-off is 7 days minus one cron period; the threshold two missed cycles plus margin (spec §5.17, §5.20)', () => {
    expect(RESEARCH_BACKUP_CRON_HOURS).toBe(6);
    expect(MAX_COPY_AGE_HOURS).toBe(7 * 24);
    expect(PRUNE_CUTOFF_HOURS).toBe(MAX_COPY_AGE_HOURS - RESEARCH_BACKUP_CRON_HOURS);
    expect(RESEARCH_BACKUP_STALE_HOURS).toBe(2 * RESEARCH_BACKUP_CRON_HOURS + 2);
    // Control: the same formula reproduces the house's two derived thresholds.
    const stale = (cronHours) => 2 * cronHours + 2;
    expect(stale(2)).toBe(contentBackupHealth.DEFAULT_STALE_HOURS);
    expect(stale(6)).toBe(offboxBackupHealth.DEFAULT_STALE_HOURS);
  });

  it('names copies by a UTC stamp, and reads back only the names it owns', () => {
    expect(stamp(T)).toBe('2026-11-03T064507Z');
    expect(copyName(T)).toBe('research.2026-11-03T064507Z.db');
    for (const n of [
      copyName(T),
      `${copyName(T)}.partial`,
      `${copyName(T)}.partial-wal`,
      `${copyName(T)}.verify`,
      `${copyName(T)}-journal`,
    ]) {
      expect(stampMs(n), n).toBe(T);
    }
    for (const n of [
      'sessions.2026-11-03-064507.db',
      'research.db',
      'research.db.restoring',
      'research.2026-13-03T064507Z.db',
      'research.2026-02-30T000000Z.db',
      'research.2026-11-03T246000Z.db',
      `${copyName(T)}.bak`,
      `${copyName(T)}.replaced`,
      'notes.txt',
    ]) {
      expect(stampMs(n), n).toBeNull();
    }
    expect(COPY_NAME.test(copyName(T))).toBe(true);
    expect(COPY_NAME.test(`${copyName(T)}.partial`)).toBe(false);
  });

  it('expires what has reached the cut-off, keeps what has not, and reports what it did not make', () => {
    const C = PRUNE_CUTOFF_HOURS * H;
    const HALF = (RESEARCH_BACKUP_CRON_HOURS / 2) * H;
    expect(
      expiredNames(
        [
          copyName(T - C), // exactly at the cut-off: goes
          copyName(T - C + 60_000), // a minute younger: goes too (within half a period of the cut-off)
          copyName(T - C + HALF + 60_000), // more than half a period younger: stays
          `${copyName(T - C + HALF + 60_000)}-wal`, // and its side file stays
          `${copyName(T - 170 * H)}.partial`,
          `${copyName(T - 200 * H)}-shm`,
          'notes.txt',
          copyName(T + 7 * H), // more than one period ahead: unknown
          copyName(T + 60_000), // a minute ahead: a clock nudge, stays
          '',
        ],
        T
      )
    ).toEqual({
      expired: [
        `${copyName(T - 200 * H)}-shm`,
        `${copyName(T - 170 * H)}.partial`,
        copyName(T - C),
        copyName(T - C + 60_000),
      ].sort(),
      unknown: ['notes.txt', copyName(T + 7 * H)].sort(),
    });
  });

  // Review finding (2026-11-08): each run prunes first and stamps its copy seconds later, so measured from the copy's
  // own stamp it is a few seconds short of the cut-off at the run that should remove it. Without a tolerance it then
  // survives one more period, to 7 days minus those seconds, and one late or missed run breaks spec §5.17's "no copy
  // older than 7 days at any moment". Walk the real ticks: the copy must go at the run where it reaches the cut-off.
  it('a copy is pruned at the run where it reaches the cut-off, though the prune runs seconds before that run copies', () => {
    const period = RESEARCH_BACKUP_CRON_HOURS * H;
    const copiedAt = T + 4_000; // run 0's copy, stamped 4 s after run 0 began
    const name = copyName(copiedAt);
    const pruneAt = (k) => T + k * period + 300; // run k's prune, 0.3 s in
    const firstRun = [...Array(40).keys()].find(
      (k) => expiredNames([name], pruneAt(k)).expired.length
    );
    expect(firstRun).toBe(PRUNE_CUTOFF_HOURS / RESEARCH_BACKUP_CRON_HOURS);
    // The promise: at no run is a copy kept past 7 days, even if the run that should have pruned it is missed.
    expect((pruneAt(firstRun + 1) - copiedAt) / H).toBeLessThanOrEqual(MAX_COPY_AGE_HOURS);
    // Control: half a period earlier it is still kept, so the tolerance does not prune young copies.
    expect(expiredNames([name], pruneAt(firstRun) - period / 2 - 60_000).expired).toEqual([]);
  });

  it('T19: the research cron line is every RESEARCH_BACKUP_CRON_HOURS hours, so the cut-off and the threshold are still right', () => {
    const cron = readFileSync(new URL('../../scripts/install-cron.sh', import.meta.url), 'utf8');
    const lineFor = (re) =>
      cron.split('\n').find((l) => !l.trimStart().startsWith('#') && re.test(l));
    const line = lineFor(/\/scripts\/research-backup\.sh(\s|$)/);
    expect(line, 'no uncommented research-backup.sh cron line found').toBeTruthy();
    expect(line.trim().split(/\s+/).slice(1, 5)).toEqual([
      `*/${RESEARCH_BACKUP_CRON_HOURS}`,
      '*',
      '*',
      '*',
    ]);
    // Control: the editorial line, read the same way, is the 6-hourly period offboxBackupHealth derives from.
    const editorial = lineFor(/\/scripts\/backup-db\.sh(\s|$)/);
    expect(editorial.trim().split(/\s+/)[1]).toBe('*/6');
    expect(offboxBackupHealth.DEFAULT_STALE_HOURS).toBe(2 * 6 + 2);
  });
});
