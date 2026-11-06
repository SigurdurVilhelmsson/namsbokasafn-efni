// server/__tests__/researchLogFailures.test.js — spec §5.1, §5.11 (G1.2 PR3, Task 12)
// record's failure half: every loss after the gate is one counted row, only for a consenting
// editor, and never a stall.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'research-log-failures-'));
process.env.SESSIONS_DB_PATH = path.join(tmpRoot, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-research-failures';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const researchDb = require('../services/researchDb');
const researchLog = require('../services/researchLog');
const researchConsent = require('../services/researchConsent');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const logger = require('../lib/logger');
const {
  APPROVED,
  makeUser,
  consent,
  decline,
  saveEvent,
  readResearch,
  losses,
} = require('./helpers/researchFixture.cjs');

const { researchPath } = resolveResearchDbPath();
const goldenPath = path.join(tmpRoot, 'golden-research.db');
const T = Date.UTC(2026, 10, 3, 12);
const { record } = researchLog;
let INT1;
let n = 0;
const act = (prefix = 'f') => `${prefix}-${++n}`;
const sdb = () => researchConsent.getSessionsDb();
const lossTuples = () =>
  losses().map((l) => [l.interval_id, l.event_type, l.error_class, l.client_action_id]);
/** The loss rows (as tuples) that running fn added. */
const added = (fn) => {
  const before = lossTuples().length;
  fn();
  return lossTuples().slice(before);
};
const removeFiles = () => {
  for (const s of ['', '-wal', '-shm']) fs.rmSync(researchPath + s, { force: true });
};
const down = () => {
  researchDb._reset();
  removeFiles();
};
const up = () => {
  for (const s of ['-wal', '-shm']) fs.rmSync(researchPath + s, { force: true });
  fs.copyFileSync(goldenPath, researchPath);
  researchDb._reset();
};
const eventIds = () => {
  const r = readResearch();
  try {
    return r
      .prepare('SELECT id FROM research_events ORDER BY id')
      .all()
      .map((x) => x.id);
  } finally {
    r.close();
  }
};
const rename = (from, to) => sdb().exec(`ALTER TABLE ${from} RENAME TO ${to}`);

beforeAll(() => {
  runAllMigrations();
  researchDb.openAtBoot();
  researchConsentText._setTestApprovedTexts(APPROVED);
  serverCommit._setTestServerCommit({
    serverCommit: 'c'.repeat(40),
    commitSource: 'deploy-file',
    codeDirty: 0,
  });
  for (const p of ['p-ed1', 'p-dec', 'p-und']) makeUser(p);
  INT1 = consent(
    researchConsent
      .getSessionsDb()
      .prepare('SELECT id FROM users WHERE provider_id = ?')
      .get('p-ed1').id
  );
  decline(sdb().prepare('SELECT id FROM users WHERE provider_id = ?').get('p-dec').id);
  expect(researchLog.ensureKey(INT1).status).toBe('minted');
  researchDb.getHandle().pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(researchPath, goldenPath);
  const g = new Database(goldenPath, { readonly: true });
  g.defaultSafeIntegers(true);
  expect(g.pragma('user_version', { simple: true })).toBe(1n);
  g.close();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T);
  vi.spyOn(logger, 'error').mockImplementation(() => {});
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  up();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(() => {
  researchDb._reset();
  researchConsentText._setTestApprovedTexts(null);
  serverCommit._setTestServerCommit(null);
});

describe('T10, record level: the research file down (spec §5.11 step 6)', () => {
  it("a consenting editor's act is a loss carrying their interval, and the file is not recreated", () => {
    down();
    expect(record(saveEvent({ clientActionId: 'act-9' }))).toEqual({
      status: 'lost',
      reason: 'unavailable',
      ledgered: true,
    });
    const row = losses().find((l) => l.client_action_id === 'act-9');
    expect(row).toMatchObject({
      interval_id: INT1,
      book: 'efnafraedi-2e',
      chapter: 1,
      module_id: 'm98001',
      event_type: 'edit-save',
      loss_day: '2026-11-03',
      error_class: 'unavailable',
      client_action_id: 'act-9',
    });
    expect(fs.existsSync(researchPath)).toBe(false);
  });

  it('exactly one loss per lost event, and one per act', () => {
    down();
    let replay;
    const rows = added(() => {
      record(saveEvent({ clientActionId: 'act-10' }));
      record(saveEvent({ clientActionId: 'act-11' }));
      // A far-future client time clears the decision-16 gate (the consent was given at real
      // Date.now(), later than the fixture's 2023 default), so the replay reaches the ledger.
      replay = record(
        saveEvent({ clientActionId: 'act-10', replayed: true, clientActionTime: 8_000_000_000_000 })
      );
    });
    expect(replay).toEqual({ status: 'lost', reason: 'unavailable', ledgered: true });
    expect(rows).toEqual([
      [INT1, 'edit-save', 'unavailable', 'act-10'],
      [INT1, 'edit-save', 'unavailable', 'act-11'],
    ]);
  });

  it('T8: a decliner and an undecided editor leave no loss row, even with the file down (R1)', () => {
    down();
    const before = losses();
    for (const p of ['p-dec', 'p-und']) {
      expect(record(saveEvent({ actorProviderId: p, clientActionId: act('dn') }))).toEqual({
        status: 'skipped',
        reason: 'not-consenting',
      });
    }
    expect(losses()).toEqual(before);
  });

  it('control: the same act with the file up writes an event and no loss', () => {
    vi.setSystemTime(T + 61_000);
    const before = losses();
    expect(record(saveEvent({ clientActionId: act('ok') })).status).toBe('written');
    expect(losses()).toEqual(before);
  });
});

describe('T18, event half, file down: scope is step 1, before anything can fail', () => {
  it('a non-study act leaves no row; a chemistry act in the same window is the loss', () => {
    down();
    const before = lossTuples();
    expect(record(saveEvent({ book: 'liffraedi-2e', clientActionId: 'nb-1' }))).toEqual({
      status: 'skipped',
      reason: 'not-study',
    });
    expect(lossTuples()).toEqual(before);
    expect(record(saveEvent({ clientActionId: 'act-t18' }))).toEqual({
      status: 'lost',
      reason: 'unavailable',
      ledgered: true,
    });
    expect(lossTuples().slice(before.length)).toEqual([
      [INT1, 'edit-save', 'unavailable', 'act-t18'],
    ]);
  });
});

describe('retry once a minute, and the corrupt file (spec §5.1)', () => {
  it('a lost write does not re-attempt the open inside the minute', () => {
    down();
    expect(record(saveEvent({ clientActionId: act('rt') })).status).toBe('lost');
    // the file is back, but no restart: _reset() is deliberately not called
    for (const s of ['-wal', '-shm']) fs.rmSync(researchPath + s, { force: true });
    fs.copyFileSync(goldenPath, researchPath);
    vi.setSystemTime(T + 30_000);
    expect(record(saveEvent({ clientActionId: act('rt') }))).toMatchObject({
      status: 'lost',
      reason: 'unavailable',
    });
    expect(researchDb.status().lastAttemptAtMs).toBe(T);
    vi.setSystemTime(T + 60_000);
    expect(record(saveEvent({ clientActionId: act('rt') })).status).toBe('written');
  });

  it('a file corrupted mid-run is noted and stays unavailable', () => {
    researchDb.getHandle();
    researchDb._reset();
    removeFiles();
    fs.writeFileSync(researchPath, 'this is not a database '.repeat(200));
    expect(record(saveEvent({ clientActionId: act('cr') }))).toMatchObject({
      status: 'lost',
      reason: 'unavailable',
    });
    expect(researchDb.status().reason).toBe('corrupt');
    vi.setSystemTime(T + 5 * 60_000);
    expect(record(saveEvent({ clientActionId: act('cr') })).status).toBe('lost');
    up();
    expect(record(saveEvent({ clientActionId: act('cr') })).status).toBe('written');
  });
});

describe('T10, record level: a held lock is a busy loss within the short wait (spec §5.1, §5.11)', () => {
  it('returns busy well inside the default 5000 ms, then writes once released', () => {
    vi.useRealTimers();
    researchDb.getHandle(); // open first: the open itself must not wait on the lock
    const other = new Database(researchPath);
    other.defaultSafeIntegers(true);
    other.exec('BEGIN EXCLUSIVE');
    let res;
    let rows;
    let ms;
    try {
      const t0 = performance.now();
      rows = added(() => {
        res = record(saveEvent({ clientActionId: 'act-busy' }));
      });
      ms = performance.now() - t0;
    } finally {
      other.exec('ROLLBACK');
      other.close();
    }
    expect(res).toEqual({ status: 'lost', reason: 'busy', ledgered: true });
    expect(ms).toBeLessThan(2500);
    expect(rows).toEqual([[INT1, 'edit-save', 'busy', 'act-busy']]);
    expect(record(saveEvent({ clientActionId: act('bz') })).status).toBe('written');
  });
});

describe('consent unknown (spec §5.11; T8)', () => {
  it('an unreadable consent table: one consent-unknown row and the health flag', () => {
    rename('research_consent', 'rc_hidden');
    let res;
    let rows;
    try {
      rows = added(() => {
        res = record(saveEvent({ clientActionId: 'act-cu' }));
      });
      expect(researchLog.consentLookupFailing()).toBe(true);
    } finally {
      rename('rc_hidden', 'research_consent');
    }
    expect(res).toEqual({ status: 'lost', reason: 'consent-unknown', ledgered: true });
    expect(rows).toEqual([[null, 'edit-save', 'consent-unknown', 'act-cu']]);
    expect(record(saveEvent({ clientActionId: act('cu') })).status).toBe('written');
    expect(researchLog.consentLookupFailing()).toBe(false);
  });

  it('a non-study book or a visitor writes no consent-unknown row', () => {
    rename('research_consent', 'rc_hidden');
    try {
      const before = lossTuples();
      expect(record(saveEvent({ book: 'liffraedi-2e', clientActionId: act('cv') }))).toEqual({
        status: 'skipped',
        reason: 'not-study',
      });
      expect(
        record(saveEvent({ actorProviderId: 'p-visitor', clientActionId: act('cv') }))
      ).toEqual({ status: 'skipped', reason: 'no-user' });
      expect(lossTuples()).toEqual(before);
    } finally {
      rename('rc_hidden', 'research_consent');
    }
  });

  it('a failing identity lookup is consent-unknown too (decision 17)', () => {
    rename('user_book_access', 'uba_hidden');
    let res;
    let rows;
    try {
      rows = added(() => {
        res = record(saveEvent({ clientActionId: 'act-id' }));
      });
    } finally {
      rename('uba_hidden', 'user_book_access');
    }
    expect(res).toEqual({ status: 'lost', reason: 'consent-unknown', ledgered: true });
    expect(rows).toEqual([[null, 'edit-save', 'consent-unknown', 'act-id']]);
    expect(researchLog.consentLookupFailing()).toBe(true);
    expect(record(saveEvent({ clientActionId: act('id') })).status).toBe('written');
  });

  it('a missing users table reads as a visitor: no-user, uncounted (the gap decision 17 records)', () => {
    rename('users', 'users_hidden');
    try {
      const before = lossTuples();
      expect(record(saveEvent({ clientActionId: act('ut') }))).toEqual({
        status: 'skipped',
        reason: 'no-user',
      });
      expect(lossTuples()).toEqual(before);
    } finally {
      rename('users_hidden', 'users');
    }
  });
});

describe('error classes (decision 20), end to end', () => {
  it('an unknown event type, a missing served version and a bad item claim are other losses', () => {
    const rows = added(() => {
      expect(record(saveEvent({ eventType: 'edit-teleport', clientActionId: 'k-1' }))).toEqual({
        status: 'lost',
        reason: 'other',
        ledgered: true,
      });
      expect(
        record(saveEvent({ servedVersionId: 2_000_000_000, clientActionId: 'k-2' })).reason
      ).toBe('other');
      const ev = saveEvent({ clientActionId: 'k-3' });
      ev.items = [{ ...ev.items[0], claim: 'trusted' }];
      expect(record(ev).reason).toBe('other');
    });
    expect(rows).toEqual([
      [INT1, 'edit-teleport', 'other', 'k-1'],
      [INT1, 'edit-save', 'other', 'k-2'],
      [INT1, 'edit-save', 'other', 'k-3'],
    ]);
  });

  it('a constraint failure at the insert is a constraint loss', () => {
    const h = researchDb.getHandle();
    h.exec(
      `CREATE TRIGGER planted_constraint BEFORE INSERT ON research_events
         BEGIN SELECT RAISE(ABORT, 'planted'); END`
    );
    let res;
    let rows;
    try {
      rows = added(() => {
        res = record(saveEvent({ clientActionId: 'act-cx' }));
      });
    } finally {
      researchDb.getHandle().exec('DROP TRIGGER planted_constraint');
    }
    expect(res).toEqual({ status: 'lost', reason: 'constraint', ledgered: true });
    expect(rows).toEqual([[INT1, 'edit-save', 'constraint', 'act-cx']]);
    expect(record(saveEvent({ clientActionId: act('cx') })).status).toBe('written');
  });
});

describe('a builder that threw before record is a loss for a consenting actor, and nothing for anyone else (decision 14)', () => {
  const head = {
    actorProviderId: 'p-ed1',
    eventType: 'edit-save',
    book: 'efnafraedi-2e',
    chapter: 1,
    moduleId: 'm98001',
  };

  it('consenting: one other loss, no event', () => {
    const ids = eventIds();
    const lossesBefore = losses().length;
    const res = record({ ...head, buildFailed: true });
    expect(res).toEqual({ status: 'lost', reason: 'other', ledgered: true });
    expect(losses().slice(lossesBefore)).toMatchObject([
      {
        interval_id: INT1,
        book: 'efnafraedi-2e',
        chapter: 1,
        module_id: 'm98001',
        event_type: 'edit-save',
        loss_day: '2026-11-03',
        error_class: 'other',
        client_action_id: null,
      },
    ]);
    expect(eventIds()).toEqual(ids);
    expect(record(saveEvent({ clientActionId: 'bf-ok' })).status).toBe('written');
  });

  it('declined, undecided or out of scope: nothing', () => {
    const before = losses();
    expect(record({ ...head, actorProviderId: 'p-dec', buildFailed: true })).toEqual({
      status: 'skipped',
      reason: 'not-consenting',
    });
    expect(record({ ...head, actorProviderId: 'p-und', buildFailed: true })).toEqual({
      status: 'skipped',
      reason: 'not-consenting',
    });
    expect(record({ ...head, book: 'liffraedi-2e', buildFailed: true })).toEqual({
      status: 'skipped',
      reason: 'not-study',
    });
    expect(losses()).toEqual(before);
  });
});

describe('record never throws', () => {
  it('survives no event, null, an empty event and a throwing getter', () => {
    const boom = { eventType: 'edit-save' };
    Object.defineProperty(boom, 'book', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    for (const ev of [undefined, null, {}, boom]) {
      expect(typeof record(ev)).toBe('object');
    }
  });

  it('with the ledger renamed away and the file down, the loss is unledgered', () => {
    down();
    rename('research_capture_losses', 'rcl_hidden');
    try {
      expect(record(saveEvent({ clientActionId: act('lg') }))).toEqual({
        status: 'lost',
        reason: 'unavailable',
        ledgered: false,
      });
    } finally {
      rename('rcl_hidden', 'research_capture_losses');
    }
  });

  it('a field that throws on its second read neither throws nor drops the row', () => {
    down();
    const twice = Object.defineProperty(saveEvent({ clientActionId: 'act-getter' }), 'chapter', {
      enumerable: true,
      get: ((s) => () => {
        if (s.i++) throw new Error('second');
        return 1;
      })({ i: 0 }),
    });
    let res;
    const rows = added(() => {
      res = record(twice);
    });
    expect(res).toEqual({ status: 'lost', reason: 'unavailable', ledgered: true });
    expect(rows).toEqual([[INT1, 'edit-save', 'unavailable', 'act-getter']]);
  });
});
