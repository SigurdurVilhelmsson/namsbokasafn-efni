// server/__tests__/retentionDates.test.js
/**
 * The four retention dates, one owner (G1.15(b) spec §4.1; decision record
 * docs/decisions/2026-11-21-retention-dates-2028-2029-2030.md). Enforceable values: a change goes through this test
 * in one reviewed commit that cites the decision record.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  NAMED_EDITING_RECORDS,
  UNNAMED_RECORDS,
  RESEARCH_RAW_ROWS,
  CONSENT_RECORDS,
  effectiveMs,
} = require('../lib/retentionDates');

describe('the retention dates', () => {
  it('are the four dates of the decision record', () => {
    expect({ NAMED_EDITING_RECORDS, UNNAMED_RECORDS, RESEARCH_RAW_ROWS, CONSENT_RECORDS }).toEqual({
      NAMED_EDITING_RECORDS: '2028-12-31',
      UNNAMED_RECORDS: '2029-12-31',
      RESEARCH_RAW_ROWS: '2029-12-31',
      CONSENT_RECORDS: '2030-12-31',
    });
  });

  // A record is kept TO the date, so the date takes effect at 00:00 UTC on the day after (spec §4.1).
  it.each([
    ['NAMED_EDITING_RECORDS', NAMED_EDITING_RECORDS, Date.UTC(2029, 0, 1)],
    ['UNNAMED_RECORDS', UNNAMED_RECORDS, Date.UTC(2030, 0, 1)],
    ['RESEARCH_RAW_ROWS', RESEARCH_RAW_ROWS, Date.UTC(2030, 0, 1)],
    ['CONSENT_RECORDS', CONSENT_RECORDS, Date.UTC(2031, 0, 1)],
  ])('%s takes effect at 00:00 UTC on the day after', (_name, date, ms) => {
    expect(effectiveMs(date)).toBe(ms);
  });

  it('effectiveMs crosses a month end', () => {
    expect(effectiveMs('2030-02-28')).toBe(Date.UTC(2030, 2, 1));
  });

  it.each(['2030-02-30', '2030-6-30', '', '30.6.2030', null, undefined, 20301231])(
    'effectiveMs refuses %j',
    (bad) => {
      expect(() => effectiveMs(bad)).toThrow(TypeError);
    }
  );

  // A circular CommonJS require returns a silent, partly filled module object, so the owner of the dates requires
  // nothing: every consumer reads it, and it reads no one.
  it('requires nothing', () => {
    const source = readFileSync(path.join(__dirname, '..', 'lib', 'retentionDates.js'), 'utf8');
    expect(source).not.toMatch(/\brequire\s*\(/);
  });
});
