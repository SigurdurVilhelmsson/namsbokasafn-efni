import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { ensureResearchSchema } = require('../lib/researchSchema');
const { deriveResearchPath } = require('../lib/researchDbPath');
const { readResearchDbHealth } = require('../lib/researchDbHealth');
const { researchFilesFor } = require('../lib/researchFiles');
const { RESEARCH_BACKUP_STALE_HOURS } = require('../lib/researchBackupPolicy');

const H = 3_600_000;

let editorialPath;
let researchPath;

const makeResearchFile = () => {
  const g = new Database(researchPath);
  ensureResearchSchema(g);
  g.close();
};
const consent = () => {
  const e = new Database(editorialPath);
  e.prepare(
    `INSERT INTO research_consent (user_id, decision, interval_id, consent_text_version,
       consent_text_sha256, given_at_ms) VALUES (1, 'consented', 1, 'v', ?, 1)`
  ).run('a'.repeat(64));
  e.close();
};
const health = (extra = {}) =>
  readResearchDbHealth({ editorialPath, researchPath, consentLookupFailing: false, ...extra });
/** The research backup's heartbeat (PR4), its mtime `ageMs` before `nowMs`. */
const plantHeartbeat = (ageMs, nowMs = Date.now()) => {
  const p = researchFilesFor(researchPath).heartbeatPath;
  fs.writeFileSync(p, 'x');
  const t = new Date(nowMs - ageMs);
  fs.utimesSync(p, t, t);
};

beforeEach(() => {
  const { db, path: dbPath } = freshMigratedDb();
  db.close();
  editorialPath = dbPath;
  researchPath = deriveResearchPath(editorialPath);
  makeResearchFile();
});

describe('readResearchDbHealth', () => {
  it('ok: schema current, consent readable, no flag, and a fresh research backup', () => {
    plantHeartbeat(H); // PR4: a missing heartbeat is backup-stale (decision 30); the next describe has that arm
    const result = health();
    expect(result).toEqual({ ok: true, reason: null });
    expect(Object.keys(result)).toEqual(['ok', 'reason']);
  });

  it('the in-memory consent flag wins', () => {
    expect(health({ consentLookupFailing: true })).toEqual({
      ok: false,
      reason: 'consent-unavailable',
    });
  });

  it('an unreadable research_consent is consent-unavailable', () => {
    const e = new Database(editorialPath);
    e.exec('DROP TABLE research_consent');
    e.close();
    expect(health()).toEqual({ ok: false, reason: 'consent-unavailable' });
  });

  it('missing only when a consented row exists; otherwise unavailable', () => {
    fs.rmSync(researchPath);
    expect(health()).toEqual({ ok: false, reason: 'unavailable' });
    consent();
    expect(health()).toEqual({ ok: false, reason: 'missing' });
  });

  it('a garbage file is unavailable', () => {
    fs.writeFileSync(researchPath, 'this is not a database, just text '.repeat(20));
    expect(health()).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('an empty SQLite file (user_version 0) is unavailable', () => {
    fs.rmSync(researchPath);
    new Database(researchPath).close();
    expect(health()).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('a stale schema version is unavailable', () => {
    const g = new Database(researchPath);
    g.pragma('user_version = 1'); // the previous version: a file the server has not yet upgraded
    g.close();
    expect(health()).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('the research path equal to the editorial path is unavailable', () => {
    expect(health({ researchPath: editorialPath })).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('never throws on bad input', () => {
    expect(readResearchDbHealth({})).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('index.js wires the check inside the health handler', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    expect(src).toContain("require('./lib/researchDbHealth')");
    const m = /checks\.research_db\s*=/.exec(src);
    expect(m).not.toBeNull();
    expect(m.index).toBeGreaterThan(src.indexOf("app.get('/api/health'"));
    expect(m.index).toBeLessThan(src.indexOf('const allOk'));
  });
});

describe('readResearchDbHealth: the research backup (PR4, spec §5.17, §5.20)', () => {
  it('a fresh heartbeat is ok; a missing or stale one is backup-stale (spec §5.20)', () => {
    const now = Date.now();
    const cases = [];
    plantHeartbeat(H, now);
    cases.push([health({ nowMs: now }), { ok: true, reason: null }]);
    plantHeartbeat((RESEARCH_BACKUP_STALE_HOURS + 1) * H, now);
    cases.push([health({ nowMs: now }), { ok: false, reason: 'backup-stale' }]);
    fs.rmSync(researchFilesFor(researchPath).heartbeatPath);
    cases.push([health({ nowMs: now }), { ok: false, reason: 'backup-stale' }]);
    for (const [result, expected] of cases) {
      expect(result).toEqual(expected);
      expect(Object.keys(result)).toEqual(['ok', 'reason']);
    }
  });

  it('backup-stale comes after every other reason (PR3 decision 37)', () => {
    plantHeartbeat((RESEARCH_BACKUP_STALE_HOURS + 1) * H);
    expect(health({ consentLookupFailing: true })).toEqual({
      ok: false,
      reason: 'consent-unavailable',
    });
    fs.writeFileSync(researchPath, 'this is not a database, just text '.repeat(20));
    expect(health()).toEqual({ ok: false, reason: 'unavailable' });
    fs.rmSync(researchPath);
    consent();
    expect(health()).toEqual({ ok: false, reason: 'missing' });
  });

  it("T19: the threshold is two missed research cycles plus margin, and the cycle is install-cron.sh's", () => {
    expect(RESEARCH_BACKUP_STALE_HOURS).toBe(2 * 6 + 2);
    const cron = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'install-cron.sh'),
      'utf8'
    );
    const line = cron
      .split('\n')
      .find(
        (l) => !l.trimStart().startsWith('#') && /\/scripts\/research-backup\.sh(\s|$)/.test(l)
      );
    expect(line, 'no uncommented research-backup.sh cron line found').toBeTruthy();
    expect(line.trim().split(/\s+/)[1]).toBe('*/6');
    // Control: the house arithmetic rounds the age (backupHeartbeatHealth.js), so exactly the threshold is still ok.
    const now = Date.now();
    plantHeartbeat(RESEARCH_BACKUP_STALE_HOURS * H, now);
    expect(health({ nowMs: now })).toEqual({ ok: true, reason: null });
    plantHeartbeat((RESEARCH_BACKUP_STALE_HOURS + 1) * H, now);
    expect(health({ nowMs: now })).toEqual({ ok: false, reason: 'backup-stale' });
  });
});
