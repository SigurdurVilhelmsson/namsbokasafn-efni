// server/__tests__/researchPaperConsent.test.js — research-paper-consent.js (G1.1 + G1.2 spec §5.14, §5.1, §6 item 18;
// T17's paper-script part; PR4 Task 9, decisions 18–21)
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);

// Env BEFORE any server require: the research file derives into this temp directory.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'research-paper-consent-'));
process.env.SESSIONS_DB_PATH = path.join(tmpRoot, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-research-paper-consent';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const { resolveResearchDbPath, deriveResearchPath } = require('../lib/researchDbPath');
const researchDb = require('../services/researchDb');
const researchLog = require('../services/researchLog');
const researchConsent = require('../services/researchConsent');
const researchDeletion = require('../services/researchDeletion');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const { sha256Text } = require('../lib/servedText');
const { parseArgs, recordPaperDecision } = require('../scripts/research-paper-consent');
const freshMigratedDb = require('./helpers/freshMigratedDb');
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
  'research-paper-consent.js'
);
const { researchPath, editorialPath } = resolveResearchDbPath();
const ABSENT = path.join(tmpRoot, 'absent.research.db');
const V1 = APPROVED[0];
const V2 = { version: 'prufa-2', sha256: sha256Text('prufutexti 2') };
const NOW = Date.UTC(2026, 10, 3, 10);
const uid = {};

const sessions = () => researchConsent.getSessionsDb();
const consentRows = (u) =>
  sessions().prepare('SELECT * FROM research_consent WHERE user_id = ? ORDER BY id').all(u);
function withResearch(fn) {
  const db = readResearch();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
const keyOf = (i) =>
  withResearch(
    (db) =>
      db.prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?').get(i)?.editor_key ??
      null
  );
const keyRows = (i) =>
  withResearch((db) => db.prepare('SELECT * FROM editor_keys WHERE interval_id = ?').all(i));
// readResearch() opens with safe integers, so the count comes back a BigInt.
const eventCount = (key) =>
  withResearch((db) =>
    Number(db.prepare('SELECT COUNT(*) AS n FROM research_events WHERE editor_key = ?').get(key).n)
  );
const lossesOf = (i) => losses().filter((l) => l.interval_id === i);

let actionSeq = 0;
function recordEvent(actor) {
  const r = researchLog.record(
    saveEvent({ actorProviderId: actor, clientActionId: `pc-act-${++actionSeq}` })
  );
  expect(r.status).toBe('written');
}
function lossFor(intervalId) {
  expect(
    researchConsent.recordLoss({
      intervalId,
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm98001',
      eventType: 'edit-save',
      errorClass: 'busy',
      clientActionId: `pc-loss-${++actionSeq}`,
      nowMs: Date.now(),
    })
  ).toBe(true);
}

beforeAll(() => {
  runAllMigrations();
  researchDb.openAtBoot();
  serverCommit._setTestServerCommit({
    serverCommit: 'c'.repeat(40),
    commitSource: 'deploy-file',
    codeDirty: 0,
  });
  for (const p of ['p-pc', 'p-pc2', 'p-pc3', 'p-pc5', 'p-pc6']) uid[p] = makeUser(p);
});

beforeEach(() => {
  sessions().exec('DELETE FROM research_consent; DELETE FROM research_capture_losses;');
  const w = new Database(researchPath, { timeout: 1000 });
  try {
    w.exec(
      'DELETE FROM research_event_items; DELETE FROM research_events; DELETE FROM editor_keys;'
    );
  } finally {
    w.close();
  }
  researchConsentText._setTestApprovedTexts([V1]);
});

afterEach(() => {
  vi.restoreAllMocks();
  researchConsentText._setTestApprovedTexts(null);
});

afterAll(() => {
  researchDb._reset();
  serverCommit._setTestServerCommit(null);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('research-paper-consent.js', () => {
  it('refuses while no text is approved, and a version that is not the current one', () => {
    researchConsentText._setTestApprovedTexts(null); // the real (empty) list
    const args = {
      userId: uid['p-pc'],
      decision: 'consented',
      textVersion: 'prufa-1',
      write: true,
      researchPath,
    };
    expect(recordPaperDecision(args)).toEqual({ ok: false, refused: 'NO_APPROVED_TEXT' });
    researchConsentText._setTestApprovedTexts([V1, V2]);
    expect(recordPaperDecision(args)).toEqual({ ok: false, refused: 'TEXT_VERSION_NOT_CURRENT' });
    expect(consentRows(uid['p-pc'])).toEqual([]);
  });

  it('refuses a user with no users row', () => {
    expect(
      recordPaperDecision({ userId: 999999, withdraw: true, write: true, researchPath })
    ).toEqual({ ok: false, refused: 'NO_USER' });
  });

  it('refuses a consent while the research file is absent, and does not create it (decision 21)', () => {
    const args = {
      userId: uid['p-pc'],
      decision: 'consented',
      textVersion: 'prufa-1',
      write: true,
    };
    expect(recordPaperDecision({ ...args, researchPath: ABSENT })).toEqual({
      ok: false,
      refused: 'RESEARCH_FILE_MISSING',
    });
    expect(fs.existsSync(ABSENT)).toBe(false);
    expect(consentRows(uid['p-pc'])).toEqual([]);
    // Control: the real path records it.
    expect(recordPaperDecision({ ...args, researchPath }).ok).toBe(true);
  });

  it('a withdrawal or a decline while the file is absent is still recorded, capture stops, and the deletion is left due (decision 21; §6 item 18)', () => {
    const i3 = consent(uid['p-pc3']);
    recordEvent('p-pc3');
    lossFor(i3);
    const i5 = consent(uid['p-pc5']);
    recordEvent('p-pc5');
    lossFor(i5);
    const spy = vi.spyOn(researchDeletion, 'deleteIntervalRowsNow');

    expect(
      recordPaperDecision({
        userId: uid['p-pc3'],
        withdraw: true,
        write: true,
        nowMs: NOW + 1,
        researchPath: ABSENT,
      })
    ).toEqual({
      ok: false,
      user: { id: uid['p-pc3'], displayName: 'p-pc3' },
      state: 'consented',
      action: 'withdraw',
      textVersion: null,
      write: true,
      researchFile: 'missing',
      outcome: 'withdrew',
      deletion: 'research-file-missing',
    });
    const [start3] = consentRows(uid['p-pc3']);
    expect(start3.withdrawn_at_ms).toBe(NOW + 1);
    expect(start3.deletion_done_at_ms).toBeNull(); // still due
    expect(researchConsent.captureStateFor(uid['p-pc3'])).toEqual({ capturing: false });

    const declined = recordPaperDecision({
      userId: uid['p-pc5'],
      decision: 'declined',
      textVersion: 'prufa-1',
      write: true,
      researchPath: ABSENT,
    });
    expect(declined).toMatchObject({
      ok: false,
      outcome: 'withdrew',
      deletion: 'research-file-missing',
    });
    expect(spy).not.toHaveBeenCalled();
    expect(fs.existsSync(ABSENT)).toBe(false);

    // Controls: nothing was deleted, and on the real path the deletion runs.
    expect(eventCount(keyOf(i3))).toBe(1);
    expect(eventCount(keyOf(i5))).toBe(1);
    expect(lossesOf(i3)).toHaveLength(1);
    expect(lossesOf(i5)).toHaveLength(1);
    const i6 = consent(uid['p-pc6']);
    recordPaperDecision({ userId: uid['p-pc6'], withdraw: true, write: true, researchPath });
    expect(spy.mock.calls).toEqual([[i6]]);
  });

  it('a dry run reports and writes nothing', () => {
    const before = {
      consent: consentRows(uid['p-pc']),
      keys: withResearch((db) => db.prepare('SELECT * FROM editor_keys').all()),
    };
    expect(
      recordPaperDecision({
        userId: uid['p-pc'],
        decision: 'consented',
        textVersion: 'prufa-1',
        write: false,
        researchPath,
      })
    ).toEqual({
      ok: true,
      user: { id: uid['p-pc'], displayName: 'p-pc' },
      state: 'undecided',
      action: 'consented',
      textVersion: 'prufa-1',
      write: false,
    });
    expect({
      consent: consentRows(uid['p-pc']),
      keys: withResearch((db) => db.prepare('SELECT * FROM editor_keys').all()),
    }).toEqual(before);
  });

  it('a consent on paper starts an interval, mints its key, at the time it is recorded (decision 20)', () => {
    const activity = () => sessions().prepare('SELECT * FROM activity_log ORDER BY id').all();
    const activityBefore = activity();
    const r = recordPaperDecision({
      userId: uid['p-pc'],
      decision: 'consented',
      textVersion: 'prufa-1',
      write: true,
      nowMs: NOW,
      researchPath,
    });
    expect(r.outcome).toBe('started');
    expect(r.key).toBe('minted');
    const [start] = consentRows(uid['p-pc']);
    expect(start.given_at_ms).toBe(NOW);
    expect(keyRows(start.id)).toHaveLength(1);
    expect(activity()).toEqual(activityBefore);
  });

  it('declining on paper during a live interval is a withdrawal, and deletes at once', () => {
    recordPaperDecision({
      userId: uid['p-pc'],
      decision: 'consented',
      textVersion: 'prufa-1',
      write: true,
      nowMs: NOW,
      researchPath,
    });
    const [start] = consentRows(uid['p-pc']);
    recordEvent('p-pc');
    const key = keyOf(start.id);
    expect(eventCount(key)).toBe(1);

    const r = recordPaperDecision({
      userId: uid['p-pc'],
      decision: 'declined',
      textVersion: 'prufa-1',
      write: true,
      researchPath,
    });
    expect(r.outcome).toBe('withdrew');
    expect(r.deletion).toEqual({ research: 'deleted', losses: 'deleted' });
    expect(typeof consentRows(uid['p-pc'])[0].withdrawn_at_ms).toBe('number');
    expect(eventCount(key)).toBe(0);
    expect(keyOf(start.id)).toBe(key);
  });

  it('--withdraw on paper does what the route does', () => {
    const i2 = consent(uid['p-pc2']);
    recordEvent('p-pc2');
    lossFor(i2);
    const key = keyOf(i2);

    const r = recordPaperDecision({
      userId: uid['p-pc2'],
      withdraw: true,
      write: true,
      researchPath,
    });
    expect(r.outcome).toBe('withdrew');
    expect(typeof consentRows(uid['p-pc2'])[0].withdrawn_at_ms).toBe('number');
    expect(eventCount(key)).toBe(0);
    expect(lossesOf(i2)).toEqual([]);
    expect(keyOf(i2)).toBe(key);

    const again = recordPaperDecision({
      userId: uid['p-pc2'],
      withdraw: true,
      write: true,
      researchPath,
    });
    expect(again.outcome).toBe('nothing-live');
    expect(again.deletion).toBeNull();
  });

  describe('the command line', () => {
    const cli = (args, env = { ...process.env, SESSIONS_DB_PATH: editorialPath }) =>
      spawnSync(process.execPath, [SCRIPT_PATH, ...args], { env, encoding: 'utf8' });

    it('parseArgs refuses anything but one decision with its text, or a withdrawal', () => {
      for (const argv of [
        [],
        ['--user', '7'],
        ['--user', '7', '--decision', 'maybe', '--text-version', 'v'],
        ['--user', '7', '--withdraw', '--decision', 'declined'],
        ['--user', '7', '--withdraw', '--force'],
      ]) {
        expect(parseArgs(argv).error, argv.join(' ')).toBeTruthy();
      }
      // Controls: the two valid shapes.
      expect(parseArgs(['--user', '7', '--withdraw', '--write'])).toEqual({
        userId: 7,
        withdraw: true,
        write: true,
      });
      expect(parseArgs(['--user', '7', '--decision', 'declined', '--text-version', 'v'])).toEqual({
        userId: 7,
        decision: 'declined',
        textVersion: 'v',
        write: false,
      });
    });

    it('a usage error exits 2 with nothing on stdout; a dry run exits 0; a refusal under --write exits 1', () => {
      const usage = cli(['--user', '7', '--withdraw', '--force']);
      expect(usage.status).toBe(2);
      expect(usage.stdout).toBe('');
      const dry = cli(['--user', String(uid['p-pc']), '--withdraw']);
      expect(dry.status).toBe(0);
      expect(JSON.parse(dry.stdout).write).toBe(false);
      const refused = cli(['--user', '999999', '--withdraw', '--write']);
      expect(refused.status).toBe(1);
      expect(JSON.parse(refused.stdout).refused).toBe('NO_USER');
    });

    it('with the research file absent, --withdraw --write records the withdrawal and exits 1', () => {
      const fresh = freshMigratedDb();
      const userId = Number(
        fresh.db
          .prepare(
            `INSERT INTO users (provider_id, provider_username, display_name, email, role)
             VALUES ('p-cli', 'p-cli', 'p-cli', 'p-cli@example.test', 'editor')`
          )
          .run().lastInsertRowid
      );
      const startId = Number(
        fresh.db
          .prepare(
            `INSERT INTO research_consent
               (user_id, decision, interval_id, consent_text_version, consent_text_sha256, given_at_ms)
             VALUES (?, 'consented', NULL, 'prufa-1', ?, 1700000000000)`
          )
          .run(userId, V1.sha256).lastInsertRowid
      );
      fresh.db.prepare('UPDATE research_consent SET interval_id = id WHERE id = ?').run(startId);
      fresh.db.close();
      const absent = deriveResearchPath(fresh.path);
      expect(fs.existsSync(absent)).toBe(false);

      const r = cli(['--user', String(userId), '--withdraw', '--write'], {
        ...process.env,
        SESSIONS_DB_PATH: fresh.path,
      });
      expect(r.status).toBe(1);
      expect(JSON.parse(r.stdout).outcome).toBe('withdrew');
      const check = new Database(fresh.path, { readonly: true });
      try {
        expect(
          typeof check
            .prepare('SELECT withdrawn_at_ms FROM research_consent WHERE id = ?')
            .get(startId).withdrawn_at_ms
        ).toBe('number');
      } finally {
        check.close();
      }
      expect(fs.existsSync(absent)).toBe(false);
    });
  });
});
