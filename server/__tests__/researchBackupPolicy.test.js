/**
 * The research backup's values and its copy-name arithmetic (G1.1 + G1.2 spec §5.17, §5.20; T19's
 * arithmetic half; PR4 Task 2, decisions 23 and 24).
 *
 * The cron period itself is pinned against scripts/install-cron.sh in PR4 Task 11, beside the
 * cron line it pins.
 */
import { describe, it, expect } from 'vitest';
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
    expect(
      expiredNames(
        [
          copyName(T - C), // exactly at the cut-off: goes
          copyName(T - C + 60_000), // a minute younger: stays
          `${copyName(T - C + 60_000)}-wal`, // and its side file stays
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
      ].sort(),
      unknown: ['notes.txt', copyName(T + 7 * H)].sort(),
    });
  });
});
