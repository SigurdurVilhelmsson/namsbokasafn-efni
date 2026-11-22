/**
 * The research retention date (G1.1 + G1.2 spec §5.15, §15 SD6; PR4 Task 3, decision 12; G1.15(b) Task 2).
 *
 * An enforceable value, set by SD6's record (docs/decisions/2026-11-21-retention-dates-2028-2029-2030.md) and owned
 * by server/lib/retentionDates.js. No seam and no flag can set it.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { RETENTION_DATE, retentionDateMs } = require('../lib/researchRetention');
const { RESEARCH_RAW_ROWS } = require('../lib/retentionDates');

describe('researchRetention', () => {
  // The commit that set the date changed this line and cites SD6's record (the decision record of 2026-11-21).
  it("is SD6's date: raw research rows are kept to 31 Dec 2029 (spec §5.15)", () => {
    expect(RETENTION_DATE).toBe('2029-12-31');
  });

  it('is read from the one owner of the retention dates', () => {
    expect(RETENTION_DATE).toBe(RESEARCH_RAW_ROWS);
  });

  it('the constant is always well formed', () => {
    expect(() => retentionDateMs(RETENTION_DATE)).not.toThrow();
  });

  // Rows are kept TO the date, so it takes effect at 00:00 UTC on the day after (G1.15(b) spec §4.1).
  it('reads a real date as 00:00 UTC on the day after, and refuses anything else', () => {
    expect(retentionDateMs(null)).toBeNull();
    expect(retentionDateMs('2030-06-30')).toBe(Date.UTC(2030, 6, 1));
    for (const bad of ['2030-6-30', '2030-02-30', '', '30.6.2030', 20300630]) {
      expect(() => retentionDateMs(bad), String(bad)).toThrow(TypeError);
    }
  });
});
