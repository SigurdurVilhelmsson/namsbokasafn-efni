// server/__tests__/lockedBackupHealth.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { readLockedBackupHealth, readLockedBackupHealthFile } = require('../lib/lockedBackupHealth');
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
  it.each(['listing-invalid', 'listing-empty', 'uploaded-not-seen', 'no-fresh-copy', 'over-cap'])(
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

// The file read that /api/health does (server/index.js calls this helper). Only a missing file is not-configured;
// a file that exists and cannot be read is unreadable, never a healthy reading (final review I2).
describe('readLockedBackupHealthFile', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locked-health-'));
  });
  afterEach(() => {
    for (const f of fs.readdirSync(dir)) fs.chmodSync(path.join(dir, f), 0o700);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const readFile = (statusFile) =>
    readLockedBackupHealthFile({ statusFile, nowMs: Date.now(), staleHours: STALE_HOURS });

  it('a missing file is not-configured', () => {
    expect(readFile(path.join(dir, 'absent.json'))).toEqual({ ok: true, state: 'not-configured' });
  });
  it('control: a fresh, good file reads ok', () => {
    const f = path.join(dir, 'status.json');
    fs.writeFileSync(f, status());
    expect(readFile(f)).toEqual({ ok: true, state: 'ok', oldest_age_days: 100 });
  });
  it('a directory at the path (EISDIR) is unreadable, not not-configured', () => {
    const f = path.join(dir, 'status.json');
    fs.mkdirSync(f);
    expect(readFile(f)).toEqual({ ok: false, state: 'unreadable' });
  });
  it.skipIf(typeof process.getuid === 'function' && process.getuid() === 0)(
    'a file it may not read (EACCES, mode 0000) is unreadable',
    () => {
      const f = path.join(dir, 'status.json');
      fs.writeFileSync(f, status());
      fs.chmodSync(f, 0o000);
      expect(readFile(f)).toEqual({ ok: false, state: 'unreadable' });
    }
  );
});

// The /api/health handler cannot be required in a unit test (startup.test.js says why), and its outer catch turns a
// wiring mistake into a quiet `unavailable`, so the call is pinned against the source, as schemaHealth.test.js does.
describe('index.js wires the file helper into /api/health', () => {
  const indexSource = fs.readFileSync(path.join(import.meta.dirname, '..', 'index.js'), 'utf-8');
  it('checks.offbox_backup_cap comes from readLockedBackupHealthFile, not a hand-rolled read', () => {
    expect(indexSource).toMatch(/checks\.offbox_backup_cap\s*=\s*readLockedBackupHealthFile\(/);
    expect(indexSource).toContain("'.offbox-locked-status.json'");
    expect(indexSource).not.toMatch(/readLockedBackupHealth\(\{/);
  });
});
