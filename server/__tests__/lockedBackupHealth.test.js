// server/__tests__/lockedBackupHealth.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { readLockedBackupHealth } = require('../lib/lockedBackupHealth');
const { CAP_ALARM_AFTER_DAYS, DAY_MS } = require('../lib/editorialBackupPolicy');

const NOW = Date.parse('2027-12-01T00:00:00Z');
const HOUR = 3600000;
const STALE_HOURS = 14;
const status = (o = {}) =>
  JSON.stringify({
    at: new Date(NOW).toISOString(),
    ok: true,
    reasons: [],
    oldest_age_days: 100,
    ...o,
  });
const read = (statusText, statusMtimeMs = NOW - HOUR) =>
  readLockedBackupHealth({ statusText, statusMtimeMs, nowMs: NOW, staleHours: STALE_HOURS });

describe('readLockedBackupHealth', () => {
  it('reads not-configured as ok when there is no status file', () => {
    expect(read(null, null)).toEqual({ ok: true, state: 'not-configured' });
  });
  it('is unreadable when the text is not JSON', () => {
    expect(read('{nope')).toEqual({ ok: false, state: 'unreadable' });
  });
  it('is unreadable when the JSON is not an object', () => {
    expect(read('null').state).toBe('unreadable');
  });
  it('is stale when the file is older than staleHours', () => {
    expect(read(status(), NOW - 15 * HOUR)).toEqual({ ok: false, state: 'stale' });
  });
  it('is stale when the file has no mtime', () => {
    expect(read(status(), null).state).toBe('stale');
  });
  it.each(['listing-invalid', 'listing-empty', 'uploaded-not-seen', 'over-cap'])(
    'reports the first reason %s when the status says not ok',
    (reason) => {
      const r = read(status({ ok: false, reasons: [reason, 'listing-empty'] }));
      expect(r.ok).toBe(false);
      expect(r.state).toBe(reason);
    }
  );
  it('reports listing-invalid for an unreadable-listing status', () => {
    const r = read(JSON.stringify({ at: 'x', ok: false, reasons: ['listing-invalid'] }));
    expect(r).toEqual({ ok: false, state: 'listing-invalid' });
  });
  it('is ok when the oldest age sits exactly at the alarm and the file is fresh', () => {
    expect(read(status({ oldest_age_days: CAP_ALARM_AFTER_DAYS })).state).toBe('ok');
  });
  it('is over-cap once the status file ages the oldest copy past the alarm', () => {
    const r = readLockedBackupHealth({
      statusText: status({ oldest_age_days: CAP_ALARM_AFTER_DAYS }),
      statusMtimeMs: NOW - DAY_MS,
      nowMs: NOW,
      staleHours: 48,
    });
    expect(r).toEqual({ ok: false, state: 'over-cap', oldest_age_days: CAP_ALARM_AFTER_DAYS + 1 });
  });
  it('is ok with oldest_age_days otherwise', () => {
    expect(read(status())).toEqual({ ok: true, state: 'ok', oldest_age_days: 100 });
  });
  it('carries no field besides ok, state and oldest_age_days', () => {
    const results = [
      read(null, null),
      read('{nope'),
      read(status(), NOW - 15 * HOUR),
      read(status({ ok: false, reasons: ['over-cap'], secret: 'x', data_versions: 3 })),
      read(status({ table: 'users', rows: 5 })),
    ];
    for (const r of results) {
      expect(Object.keys(r).every((k) => ['ok', 'state', 'oldest_age_days'].includes(k))).toBe(
        true
      );
    }
  });
});
