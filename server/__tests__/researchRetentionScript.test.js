// server/__tests__/researchRetentionScript.test.js — research-retention.js (G1.1 + G1.2 spec §5.15, A3; T9's shape
// for retention; PR4 Task 7, decisions 9, 11, 12 and 13)
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);

// Env BEFORE any server require (see researchWithdrawal.test.js).
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'research-retention-'));
process.env.SESSIONS_DB_PATH = path.join(tmpRoot, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-research-retention';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const { researchFilesFor } = require('../lib/researchFiles');
const { RETENTION_DATE } = require('../lib/researchRetention');
const researchDb = require('../services/researchDb');
const researchLog = require('../services/researchLog');
const researchConsent = require('../services/researchConsent');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const researchPurge = require('../scripts/lib/researchPurge');
const { anyResearchRow, openResearch } = require('../scripts/lib/researchAdmin');
const { isDue, runRetention } = require('../scripts/research-retention');
const {
  APPROVED,
  makeUser,
  consent,
  saveEvent,
  readResearch,
  losses,
} = require('./helpers/researchFixture.cjs');

const SCRIPT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'research-retention.js'
);
const { researchPath, editorialPath } = resolveResearchDbPath();
const files = researchFilesFor(researchPath);
const PAST = '2026-01-01';
const NOW = Date.UTC(2026, 10, 3);
const uid = {};

const run = (over) =>
  runRetention({ researchPath, sessionsPath: editorialPath, busyTimeoutMs: 100, ...over });

function bytes() {
  const parts = [fs.readFileSync(researchPath)];
  if (fs.existsSync(files.walPath)) parts.push(fs.readFileSync(files.walPath));
  return Buffer.concat(parts);
}
const holds = (s) => bytes().includes(Buffer.from(s, 'ascii'));
function withResearch(fn) {
  const db = readResearch();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
const researchRows = () =>
  withResearch((db) => ({
    keys: db.prepare('SELECT * FROM editor_keys ORDER BY interval_id').all(),
    events: db.prepare('SELECT * FROM research_events ORDER BY id').all(),
    items: db.prepare('SELECT * FROM research_event_items ORDER BY event_id, ordinal').all(),
  }));
const sessions = () => researchConsent.getSessionsDb();
const deletions = () => sessions().prepare('SELECT * FROM research_deletions ORDER BY rowid').all();
const addDataset = (p) =>
  sessions()
    .prepare('INSERT INTO research_derived_datasets (path, sha256, created_day) VALUES (?, ?, ?)')
    .run(p, 'a'.repeat(64), '2026-11-01');
function dueNow(retentionDate = PAST) {
  const research = openResearch({ researchPath });
  const editorial = new Database(editorialPath, { readonly: true });
  try {
    return isDue({ research, sessions: editorial, retentionDate, nowMs: NOW });
  } finally {
    research.close();
    editorial.close();
  }
}

let actionSeq = 0;
function recordEvent(actor, text) {
  const r = researchLog.record(
    saveEvent({
      actorProviderId: actor,
      content: { text, note: null, category: null },
      clientActionId: `ret-act-${++actionSeq}`,
    })
  );
  expect(r.status).toBe('written');
}

beforeAll(() => {
  runAllMigrations();
  researchDb.openAtBoot();
  researchConsentText._setTestApprovedTexts(APPROVED);
  serverCommit._setTestServerCommit({
    serverCommit: 'c'.repeat(40),
    commitSource: 'deploy-file',
    codeDirty: 0,
  });
  for (const p of ['p-ret1', 'p-ret2']) uid[p] = makeUser(p);
});

afterAll(() => {
  researchDb._reset();
  researchConsentText._setTestApprovedTexts(null);
  serverCommit._setTestServerCommit(null);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  sessions().exec(
    `DELETE FROM research_consent; DELETE FROM research_capture_losses; DELETE FROM research_deletions;
     DELETE FROM research_derived_datasets;`
  );
  const w = new Database(researchPath, { timeout: 1000 });
  try {
    w.exec(
      'DELETE FROM research_event_items; DELETE FROM research_events; DELETE FROM editor_keys;'
    );
    w.exec('VACUUM');
    w.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    w.close();
  }
  fs.rmSync(files.exportsDir, { recursive: true, force: true });
  fs.rmSync(files.servedVersionExportsDir, { recursive: true, force: true });

  const i1 = consent(uid['p-ret1']);
  recordEvent('p-ret1', 'SENTINEL-RET-1');
  recordEvent('p-ret1', 'SENTINEL-RET-2');
  consent(uid['p-ret2']);
  recordEvent('p-ret2', 'SENTINEL-RET-3');
  expect(
    researchConsent.recordLoss({
      intervalId: i1,
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm98001',
      eventType: 'edit-save',
      errorClass: 'busy',
      clientActionId: 'ret-l-1',
      nowMs: NOW,
    })
  ).toBe(true);

  fs.mkdirSync(files.exportsDir, { recursive: true });
  fs.writeFileSync(path.join(files.exportsDir, 'x.jsonl'), '{"x":1}\n');
  fs.mkdirSync(files.servedVersionExportsDir, { recursive: true });
  fs.writeFileSync(path.join(files.servedVersionExportsDir, 'y.jsonl'), '{"y":1}\n');
});

const cli = (args) =>
  spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    env: { ...process.env, SESSIONS_DB_PATH: editorialPath },
    encoding: 'utf8',
  });

describe('research-retention.js', () => {
  it('the real date is empty, so nothing is ever due, even with rows (spec §5.15)', () => {
    const before = researchRows();
    expect(run({ write: true, retentionDate: RETENTION_DATE, nowMs: NOW })).toEqual({
      script: 'research-retention',
      write: true,
      due: false,
      ok: true,
    });
    expect(researchRows()).toEqual(before);
    const r = cli(['--write']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).due).toBe(false);
    expect(researchRows()).toEqual(before);
    // Control: a passed date with rows is due.
    expect(dueNow(PAST)).toBe(true);
  });

  it('a date that has not passed is not due', () => {
    expect(run({ write: true, retentionDate: '2099-01-01', nowMs: NOW }).due).toBe(false);
  });

  it('--write refuses while no derived dataset is recorded, and only when something is due (decision 12)', () => {
    const before = researchRows();
    expect(run({ write: true, retentionDate: PAST, nowMs: NOW })).toEqual({
      script: 'research-retention',
      write: true,
      due: true,
      ok: false,
      refused: 'no-derived-dataset',
    });
    expect(researchRows()).toEqual(before);
    expect(run({ write: false, retentionDate: PAST, nowMs: NOW })).toEqual({
      script: 'research-retention',
      write: false,
      due: true,
      ok: true,
      derivedDataset: false,
    });
    // Control: with the empty date and no dataset row, the backup job's every-cycle call is fine.
    expect(run({ write: true, retentionDate: RETENTION_DATE, nowMs: NOW })).toEqual({
      script: 'research-retention',
      write: true,
      due: false,
      ok: true,
    });
    expect(run({ write: true, retentionDate: PAST, noDerivedDataset: true, nowMs: NOW }).ok).toBe(
      true
    );
  });

  it('with a derived dataset recorded, the write run needs no flag (decision 12)', () => {
    addDataset('/x/derived.parquet');
    expect(run({ write: true, retentionDate: PAST, nowMs: NOW }).ok).toBe(true);
  });

  it('a dataset row naming what this run deletes, or a relative path, does not count (decision 12)', () => {
    for (const bad of [
      path.join(files.exportsDir, 'derived.parquet'),
      path.join(files.backupsDir, 'd.parquet'),
      files.researchPath,
      'derived.parquet',
    ]) {
      sessions().exec('DELETE FROM research_derived_datasets');
      addDataset(bad);
      const before = researchRows();
      expect(run({ write: true, retentionDate: PAST, nowMs: NOW }), bad).toEqual({
        script: 'research-retention',
        write: true,
        due: true,
        ok: false,
        refused: 'no-derived-dataset',
      });
      expect(researchRows()).toEqual(before);
      expect(run({ write: false, retentionDate: PAST, nowMs: NOW }).derivedDataset, bad).toBe(
        false
      );
    }
    // Control in the same fixture: a dataset outside everything this run deletes counts.
    addDataset('/x/derived.parquet');
    expect(run({ write: false, retentionDate: PAST, nowMs: NOW }).derivedDataset).toBe(true);
    expect(run({ write: true, retentionDate: PAST, nowMs: NOW }).ok).toBe(true);
  });

  it('a write run deletes every research row, the key map included, compacts, verifies and records — and touches no consent row and no loss row', () => {
    const keys = researchRows().keys.map((k) => k.editor_key);
    expect(keys).toHaveLength(2);
    expect(holds('SENTINEL-RET-1')).toBe(true); // control
    const consentBefore = sessions().prepare('SELECT * FROM research_consent ORDER BY id').all();
    const lossesBefore = losses();
    expect(lossesBefore).toHaveLength(1);
    const yBefore = fs.readFileSync(path.join(files.servedVersionExportsDir, 'y.jsonl'));

    const report = run({ write: true, retentionDate: PAST, noDerivedDataset: true, nowMs: NOW });
    expect(report).toMatchObject({
      due: true,
      compact: 'ok',
      scan: 'clean',
      exports: 'emptied',
      verified: true,
      ok: true,
    });
    withResearch((db) => expect(anyResearchRow(db)).toBe(false));
    for (const s of ['SENTINEL-RET', ...keys]) expect(holds(s), s).toBe(false);
    expect(deletions()).toEqual([
      { kind: 'retention', interval_id: null, done_at_ms: NOW, verified: 1 },
    ]);
    // Decision 9 and A3: no consent row and no loss row is a research row here.
    expect(sessions().prepare('SELECT * FROM research_consent ORDER BY id').all()).toEqual(
      consentBefore
    );
    expect(losses()).toEqual(lossesBefore);
    expect(fs.readdirSync(files.exportsDir)).toEqual([]);
    expect(fs.readFileSync(path.join(files.servedVersionExportsDir, 'y.jsonl'))).toEqual(yBefore);
    // The report carries no key and no count.
    expect(/[0-9a-f]{32}/.test(JSON.stringify(report))).toBe(false);
    expect(/\d/.test(JSON.stringify(report))).toBe(false);
  });

  it('a run that deleted but could not compact stays due by its missing record (decision 11)', () => {
    const failed = run({
      write: true,
      retentionDate: PAST,
      noDerivedDataset: true,
      nowMs: NOW,
      steps: { ...researchPurge, compact: () => ({ ok: false, step: 'vacuum' }) },
    });
    expect(failed.ok).toBe(false);
    expect(failed.compact).toBe('vacuum');
    withResearch((db) => expect(anyResearchRow(db)).toBe(false));
    expect(deletions()).toEqual([]);
    expect(dueNow()).toBe(true);

    const next = run({ write: true, retentionDate: PAST, noDerivedDataset: true, nowMs: NOW });
    expect(next.ok).toBe(true);
    expect(next.verified).toBe(false);
    expect(deletions()).toEqual([
      { kind: 'retention', interval_id: null, done_at_ms: NOW, verified: 0 },
    ]);
    expect(dueNow()).toBe(false); // control
  });

  it(
    'a reader holding the file stops the run before anything is deleted',
    { timeout: 30_000 },
    () => {
      const before = researchRows();
      const reader = new Database(researchPath, { readonly: true });
      try {
        reader.exec('BEGIN');
        reader.prepare('SELECT * FROM research_events').all();
        expect(
          run({ write: true, retentionDate: PAST, noDerivedDataset: true, nowMs: NOW })
        ).toEqual({
          script: 'research-retention',
          write: true,
          due: true,
          ok: false,
          failed: 'checkpoint-preflight',
        });
        expect(researchRows()).toEqual(before);
        reader.exec('COMMIT');
      } finally {
        reader.close();
      }
    }
  );

  it('the command line takes no date and refuses unknown arguments', () => {
    const refused = cli(['--retention-date', '2020-01-01']);
    expect(refused.status).toBe(2);
    expect(refused.stdout).toBe('');
    const r = cli(['--write', '--no-derived-dataset']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).due).toBe(false);
  });
});
