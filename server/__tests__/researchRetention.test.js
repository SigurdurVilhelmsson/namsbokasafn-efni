/**
 * The research retention date (G1.1 + G1.2 spec §5.15, §15 SD6; PR4 Task 3, decision 12).
 *
 * An enforceable value: empty until SD6 sets it, and while it is empty research-retention.js
 * deletes nothing by date. No seam and no flag can set it.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { RETENTION_DATE, retentionDateMs } = require('../lib/researchRetention');

describe('researchRetention', () => {
  // The commit that sets the date changes this line, cites SD6's record, and is reviewed like the
  // approved consent-texts list.
  it('is empty until SD6 sets it (spec §5.15)', () => {
    expect(RETENTION_DATE).toBeNull();
  });

  it('the constant is always well formed', () => {
    expect(() => retentionDateMs(RETENTION_DATE)).not.toThrow();
  });

  it('reads a real date as its UTC midnight and refuses anything else', () => {
    expect(retentionDateMs(null)).toBeNull();
    expect(retentionDateMs('2030-06-30')).toBe(Date.UTC(2030, 5, 30));
    for (const bad of ['2030-6-30', '2030-02-30', '', '30.6.2030', 20300630]) {
      expect(() => retentionDateMs(bad), String(bad)).toThrow(TypeError);
    }
  });
});
