// server/__tests__/researchConsentRoutes.test.js — spec §5.14 (G1.2 PR3, Task 7)
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

// Never let anything here open the real handle under pipeline-output/.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'research-routes-'));
process.env.SESSIONS_DB_PATH = path.join(tmpRoot, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-research-routes';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const researchDb = require('../services/researchDb');
const researchConsent = require('../services/researchConsent');
const researchConsentText = require('../lib/researchConsentText');
const userService = require('../services/userService');
const { sha256Text } = require('../lib/servedText');
const { handlerFor, invoke } = require('./helpers/servedFixture');
const router = require('../routes/research');
const researchLog = require('../services/researchLog');
const researchDeletion = require('../services/researchDeletion');
const serverCommit = require('../lib/serverCommit');
const { saveEvent, losses } = require('./helpers/researchFixture.cjs');

const { researchPath, editorialPath } = resolveResearchDbPath();
const V1 = { version: 'prufa-1', sha256: sha256Text('t1') };
const V2 = { version: 'prufa-2', sha256: sha256Text('t2') };

const get = handlerFor(router, 'get', '/consent');
const post = handlerFor(router, 'post', '/consent');
const withdrawH = handlerFor(router, 'post', '/consent/withdraw');

let db;
let reader;
let m1;
let m2;

const as = (pid, body) => ({ user: { id: pid }, body: body || {} });
const rows = (u) =>
  db.prepare('SELECT * FROM research_consent WHERE user_id = ? ORDER BY id').all(u);
const snap = () => ({
  consent: db.prepare('SELECT * FROM research_consent ORDER BY id').all(),
  activity: db.prepare('SELECT * FROM activity_log ORDER BY id').all(),
});
const consent = (pid, v = 'prufa-1') =>
  invoke(post, as(pid, { decision: 'consented', textVersion: v }));

beforeAll(() => {
  runAllMigrations();
  researchDb.openAtBoot();
  db = new Database(editorialPath);
  reader = new Database(researchPath, { readonly: true });
  reader.defaultSafeIntegers(true);
  for (const [pid, name] of [
    ['p-m1', 'm1'],
    ['p-m2', 'm2'],
  ]) {
    userService.createUser({
      providerId: pid,
      providerUsername: name,
      displayName: name,
      email: `${name}@example.test`,
      role: 'editor',
    });
  }
  m1 = userService.findByProviderId('p-m1').id;
  m2 = userService.findByProviderId('p-m2').id;
});

afterEach(() => {
  researchConsentText._setTestApprovedTexts(null);
  db.prepare('DELETE FROM research_consent').run();
});

afterAll(() => {
  reader.close();
  db.close();
  researchDb._reset();
});

describe('consent routes (spec §5.14)', () => {
  it('a visitor is refused and nothing is stored (spec §5.14)', async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    const before = snap();
    const answers = [
      await invoke(get, as('p-vis')),
      await invoke(post, as('p-vis', { decision: 'consented', textVersion: 'prufa-1' })),
      await invoke(withdrawH, as('p-vis')),
    ];
    for (const a of answers) {
      expect(a.status).toBe(403);
      expect(a.body.visitor).toBe(true);
    }
    expect(snap()).toEqual(before);
    expect((await invoke(get, as('p-m1'))).status).toBe(200);
  });

  it('T8: with no approved text, the POST answers 409 NO_APPROVED_TEXT and nothing is recorded or captured', async () => {
    const before = snap();
    const r = await consent('p-m1');
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('NO_APPROVED_TEXT');
    expect(snap()).toEqual(before);
    const g = await invoke(get, as('p-m1'));
    expect(g.body).toEqual({
      state: 'undecided',
      decidedTextVersion: null,
      currentTextVersion: null,
    });
    expect(researchConsent.captureStateFor(m1)).toEqual({ capturing: false });
  });

  it('a consent starts an interval and mints its key; the key never reaches the response', async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    const before = snap();
    const r = await consent('p-m1');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      state: 'consented',
      decidedTextVersion: 'prufa-1',
      currentTextVersion: 'prufa-1',
    });
    const rs = rows(m1);
    expect(rs).toHaveLength(1);
    expect(rs[0].interval_id).toBe(rs[0].id);
    const keys = reader
      .prepare('SELECT * FROM editor_keys WHERE interval_id = ?')
      .all(BigInt(rs[0].id));
    expect(keys).toHaveLength(1);
    expect(JSON.stringify(r.body)).not.toContain(keys[0].editor_key);
    expect(snap().activity).toEqual(before.activity);
  });

  it('a stale text version is refused (decision 26)', async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    const r = await consent('p-m1', 'prufa-0');
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('CONSENT_TEXT_CHANGED');
    expect(r.body.currentTextVersion).toBe('prufa-1');
    expect(rows(m1)).toEqual([]);
  });

  it('a bad decision is 400', async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    const r = await invoke(post, as('p-m1', { decision: 'maybe', textVersion: 'prufa-1' }));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('INVALID_DECISION');
    expect(rows(m1)).toEqual([]);
  });

  it('declining while consented withdraws, in one transaction', async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    await consent('p-m1');
    const r = await invoke(post, as('p-m1', { decision: 'declined', textVersion: 'prufa-1' }));
    expect(r.status).toBe(200);
    expect(r.body.state).toBe('declined');
    const rs = rows(m1);
    expect(typeof rs[0].withdrawn_at_ms).toBe('number');
    expect(rs[1].decision).toBe('declined');
    expect(rs[1].interval_id).toBeNull();
  });

  it('T8: withdrawing through the route ends capture at once; before it the interval was live', async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    await consent('p-m2');
    const [start] = rows(m2);
    expect(researchConsent.captureStateFor(m2)).toEqual({
      capturing: true,
      intervalId: start.id,
      startedAtMs: start.given_at_ms,
    });
    const r = await invoke(withdrawH, as('p-m2'));
    expect(r.status).toBe(200);
    expect(r.body.state).toBe('withdrawn');
    const after = rows(m2);
    expect(after).toHaveLength(1);
    expect(typeof after[0].withdrawn_at_ms).toBe('number');
    expect(after[0].decision).toBe('consented');
    expect(researchConsent.captureStateFor(m2)).toEqual({ capturing: false });
    // The latest row is still the consented one, and it reads withdrawn (the Task 5 gap).
    const g = await invoke(get, as('p-m2'));
    expect(g.body.state).toBe('withdrawn');
  });

  it("after a renewal, the withdrawal marks the interval's starting row", async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    await consent('p-m1', 'prufa-1');
    researchConsentText._setTestApprovedTexts([V1, V2]);
    const renewed = await consent('p-m1', 'prufa-2');
    expect(renewed.status).toBe(200);
    await invoke(withdrawH, as('p-m1'));
    const rs = rows(m1);
    expect(rs).toHaveLength(2);
    expect([typeof rs[0].withdrawn_at_ms, rs[1].withdrawn_at_ms]).toEqual(['number', null]);
  });

  it('a withdrawal with nothing live is a harmless 200', async () => {
    const before = snap();
    const r = await invoke(withdrawH, as('p-m1'));
    expect(r.status).toBe(200);
    expect(snap()).toEqual(before);
  });

  it('a re-consent after a withdrawal gets a new interval and a new key', async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    await consent('p-m1');
    await invoke(withdrawH, as('p-m1'));
    await consent('p-m1');
    const ids = rows(m1).map((r) => r.id);
    expect(ids).toHaveLength(2);
    const keys = ids.map((id) =>
      reader.prepare('SELECT * FROM editor_keys WHERE interval_id = ?').all(BigInt(id))
    );
    expect(keys.map((k) => k.length)).toEqual([1, 1]);
    expect(keys[0][0].editor_key).not.toBe(keys[1][0].editor_key);
  });

  it('the routes are mounted before the API 404 handler', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    const mount = src.indexOf("app.use('/api/research'");
    expect(mount).toBeGreaterThan(-1);
    expect(mount).toBeLessThan(src.indexOf("app.use('/api/*path'"));
  });
});

describe('approved Icelandic strings (plan decision 64)', () => {
  const APPROVED = {
    visitor:
      'Gestir eru ekki skráðir notendur og geta ekki tekið afstöðu til rannsóknarinnar; ekkert er geymt fyrir gest.',
    noText:
      'Samþykkistexti rannsóknarinnar hefur ekki verið birtur enn, svo ekki er hægt að skrá ákvörðun.',
    changed:
      'Samþykkistextinn hefur breyst frá því að síðunni var hlaðið. Lesið nýja textann og takið afstöðu aftur.',
    invalid: 'Ákvörðun verður að vera „consented“ eða „declined“.',
    failed: 'Ekki tókst að skrá ákvörðunina.',
    // The GET's read failure: approved by [USER] 2026-11-07 (register, ③ of the (C1 built) entry).
    readFailed: 'Ekki tókst að sækja ákvörðunina.',
  };

  it('visitor 403 carries the approved message', async () => {
    const r = await invoke(get, as('p-vis'));
    expect(r.body).toEqual({ error: 'Visitor', message: APPROVED.visitor, visitor: true });
  });

  it('NO_APPROVED_TEXT 409 carries the approved message', async () => {
    expect((await consent('p-m1')).body.message).toBe(APPROVED.noText);
  });

  it('CONSENT_TEXT_CHANGED 409 carries the approved message', async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    expect((await consent('p-m1', 'prufa-0')).body.message).toBe(APPROVED.changed);
  });

  it('INVALID_DECISION 400 carries the approved message', async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    const r = await invoke(post, as('p-m1', { decision: 'maybe', textVersion: 'prufa-1' }));
    expect(r.body.message).toBe(APPROVED.invalid);
  });

  it("the GET's 500 is a read failure and carries the read message, not the recording one", async () => {
    const spy = vi.spyOn(researchConsent, 'decisionStateFor').mockImplementation(() => {
      throw new Error('boom');
    });
    try {
      const r = await invoke(get, as('p-m1'));
      expect(r.status).toBe(500);
      expect(r.body.error).toBe(APPROVED.readFailed);
    } finally {
      spy.mockRestore();
    }
  });

  it("the POST's 500 still carries decision 64's recording message (control)", async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    const spy = vi.spyOn(researchConsent, 'recordDecision').mockImplementation(() => {
      throw new Error('boom');
    });
    try {
      const r = await consent('p-m1');
      expect(r.status).toBe(500);
      expect(r.body.error).toBe(APPROVED.failed);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('T9 (PR4): a withdrawal deletes its research rows at once (spec §5.15)', () => {
  const ids = {};
  let seq = 0;
  beforeAll(() => {
    serverCommit._setTestServerCommit({
      serverCommit: 'c'.repeat(40),
      commitSource: 'deploy-file',
      codeDirty: 0,
    });
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const pid = `p-w${n}`;
      ids[pid] = userService.createUser({
        providerId: pid,
        providerUsername: `w${n}`,
        displayName: `w${n}`,
        email: `w${n}@example.test`,
        role: 'editor',
      }).id;
    }
  });
  afterAll(() => serverCommit._setTestServerCommit(null));

  const recordAs = (pid) => {
    const r = researchLog.record(
      saveEvent({ actorProviderId: pid, clientActionId: `t9-${++seq}` })
    );
    expect(r.status).toBe('written');
  };
  const lossFor = (intervalId) =>
    expect(
      researchConsent.recordLoss({
        intervalId,
        book: 'efnafraedi-2e',
        chapter: 1,
        moduleId: 'm98001',
        eventType: 'edit-save',
        errorClass: 'busy',
        clientActionId: `t9-loss-${++seq}`,
        nowMs: Date.now(),
      })
    ).toBe(true);
  const keyOf = (intervalId) =>
    reader
      .prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?')
      .get(BigInt(intervalId))?.editor_key ?? null;
  const eventIdsOf = (key) =>
    reader
      .prepare('SELECT id FROM research_events WHERE editor_key = ? ORDER BY id')
      .pluck()
      .all(key);
  const itemsOf = (eventIds) =>
    reader
      .prepare('SELECT event_id FROM research_event_items')
      .pluck()
      .all()
      .filter((id) => eventIds.includes(id));
  const lossesOf = (intervalId) => losses().filter((l) => l.interval_id === intervalId);

  it("T9: withdrawing deletes the interval's research rows at once; the response is PR3's", async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    expect((await consent('p-w1')).status).toBe(200);
    const [start] = rows(ids['p-w1']);
    recordAs('p-w1');
    recordAs('p-w1');
    lossFor(start.id);
    const key = keyOf(start.id);
    const eventIds = eventIdsOf(key);
    expect(eventIds).toHaveLength(2); // the control: present before
    expect(itemsOf(eventIds)).toHaveLength(2);
    expect(lossesOf(start.id)).toHaveLength(1);

    const r = await invoke(withdrawH, as('p-w1'));
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual([
      'currentTextVersion',
      'decidedTextVersion',
      'state',
    ]);
    expect(r.body.state).toBe('withdrawn');
    expect(eventIdsOf(key)).toEqual([]);
    expect(itemsOf(eventIds)).toEqual([]);
    expect(lossesOf(start.id)).toEqual([]);
    expect(keyOf(start.id)).toBe(key); // the key row stays for research-withdrawal.js
  });

  it('T9: posting declined while consented withdraws, and deletes at once', async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    const spy = vi.spyOn(researchDeletion, 'deleteIntervalRowsNow');
    await consent('p-w2');
    const [start] = rows(ids['p-w2']);
    recordAs('p-w2');
    const key = keyOf(start.id);
    expect(eventIdsOf(key)).toHaveLength(1);

    const r = await invoke(post, as('p-w2', { decision: 'declined', textVersion: 'prufa-1' }));
    expect(r.status).toBe(200);
    expect(r.body.state).toBe('declined');
    expect(typeof rows(ids['p-w2'])[0].withdrawn_at_ms).toBe('number');
    expect(eventIdsOf(key)).toEqual([]);
    expect(keyOf(start.id)).toBe(key);
    expect(spy.mock.calls).toEqual([[start.id]]);
    spy.mockRestore();
  });

  it("T9: after a renewal, the withdrawal marks the starting row and deletes both texts' events by the one key", async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    await consent('p-w3', 'prufa-1');
    recordAs('p-w3');
    researchConsentText._setTestApprovedTexts([V1, V2]);
    expect((await consent('p-w3', 'prufa-2')).status).toBe(200);
    recordAs('p-w3');
    const [start] = rows(ids['p-w3']);
    const key = keyOf(start.id);
    expect(eventIdsOf(key)).toHaveLength(2); // one interval, one key

    await invoke(withdrawH, as('p-w3'));
    expect(rows(ids['p-w3']).map((x) => x.withdrawn_at_ms)).toEqual([expect.any(Number), null]);
    expect(eventIdsOf(key)).toEqual([]);
  });

  it('the deletion never changes the response', async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    await consent('p-w4');
    await consent('p-w5');
    const up = await invoke(withdrawH, as('p-w4'));
    researchDb._setTestPaths({ researchPath: '/nonexistent/dir/r.db', editorialPath });
    let down;
    try {
      down = await invoke(withdrawH, as('p-w5'));
    } finally {
      researchDb._setTestPaths(null);
    }
    expect(up.status).toBe(200);
    expect(down.status).toBe(200);
    expect(down.body).toEqual(up.body);
  });

  it('T9: a later act writes no research row and no loss row', async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    await consent('p-w1');
    recordAs('p-w1');
    await invoke(withdrawH, as('p-w1'));
    const eventIds = () =>
      reader.prepare('SELECT id FROM research_events ORDER BY id').pluck().all();
    const before = { events: eventIds(), losses: losses() };

    expect(
      researchLog.record(saveEvent({ actorProviderId: 'p-w1', clientActionId: 'after-1' }))
    ).toEqual({ status: 'skipped', reason: 'not-consenting' });
    expect({ events: eventIds(), losses: losses() }).toEqual(before);
  });

  it('a decline with nothing live, and a withdraw with nothing live, delete nothing', async () => {
    researchConsentText._setTestApprovedTexts([V1]);
    const spy = vi.spyOn(researchDeletion, 'deleteIntervalRowsNow');
    const declined = await invoke(
      post,
      as('p-w6', { decision: 'declined', textVersion: 'prufa-1' })
    );
    expect(declined.body.state).toBe('declined');
    expect((await invoke(withdrawH, as('p-w6'))).status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
