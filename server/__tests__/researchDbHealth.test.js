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

beforeEach(() => {
  const { db, path: dbPath } = freshMigratedDb();
  db.close();
  editorialPath = dbPath;
  researchPath = deriveResearchPath(editorialPath);
  makeResearchFile();
});

describe('readResearchDbHealth', () => {
  it('ok: schema current, consent readable, no flag', () => {
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
    g.pragma('user_version = 0');
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
