// server/__tests__/researchConsent.test.js — spec §5.11, §5.14 (G1.2 PR3, Task 5)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

// Never let anything here open the real handle under pipeline-output/.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'research-consent-'));
process.env.SESSIONS_DB_PATH = path.join(tmpRoot, 'sessions.db');

const freshMigratedDb = require('./helpers/freshMigratedDb');
const researchConsent = require('../services/researchConsent');
const researchConsentText = require('../lib/researchConsentText');
const { sha256Text } = require('../lib/servedText');

const V1 = { version: 'prufa-1', sha256: sha256Text('t1') };
const V2 = { version: 'prufa-2', sha256: sha256Text('t2') };

let db;
const rows = (u) =>
  db.prepare('SELECT * FROM research_consent WHERE user_id = ? ORDER BY id').all(u);

beforeEach(() => {
  ({ db } = freshMigratedDb());
  researchConsent._setTestDb(db);
  researchConsentText._setTestApprovedTexts([V1, V2]);
});

afterEach(() => {
  researchConsent._setTestDb(null);
  researchConsentText._setTestApprovedTexts(null);
  db.close();
});

describe('decisions (spec §5.14)', () => {
  it('a first consent starts an interval whose id is its own', () => {
    const r = researchConsent.recordDecision({
      userId: 7,
      decision: 'consented',
      text: V1,
      nowMs: 1000,
    });
    const id = r.intervalId;
    expect(r).toEqual({ outcome: 'started', intervalId: id });
    expect(rows(7)).toEqual([
      {
        id,
        user_id: 7,
        decision: 'consented',
        interval_id: id,
        consent_text_version: 'prufa-1',
        consent_text_sha256: V1.sha256,
        given_at_ms: 1000,
        withdrawn_at_ms: null,
        deletion_done_at_ms: null,
      },
    ]);
  });

  it('the same decision on the same text is unchanged; a new text renews the live interval', () => {
    const id = researchConsent.recordDecision({
      userId: 7,
      decision: 'consented',
      text: V1,
      nowMs: 1000,
    }).intervalId;
    const before = rows(7);
    const again = researchConsent.recordDecision({
      userId: 7,
      decision: 'consented',
      text: V1,
      nowMs: 1500,
    });
    expect(again).toEqual({ outcome: 'unchanged', intervalId: id });
    expect(rows(7)).toEqual(before);

    const renewed = researchConsent.recordDecision({
      userId: 7,
      decision: 'consented',
      text: V2,
      nowMs: 2000,
    });
    expect(renewed).toEqual({ outcome: 'renewed', intervalId: id });
    const rs = rows(7);
    expect(rs).toHaveLength(2);
    expect(rs[1].interval_id).toBe(id);
    expect(rs[1].consent_text_version).toBe('prufa-2');
    expect(researchConsent.captureStateFor(7)).toEqual({
      capturing: true,
      intervalId: id,
      startedAtMs: 1000,
    });
  });

  it('declining during a live interval is a withdrawal, in one transaction', () => {
    const id = researchConsent.recordDecision({
      userId: 7,
      decision: 'consented',
      text: V1,
      nowMs: 1000,
    }).intervalId;
    researchConsent.recordDecision({ userId: 7, decision: 'consented', text: V2, nowMs: 2000 });
    const r = researchConsent.recordDecision({
      userId: 7,
      decision: 'declined',
      text: V2,
      nowMs: 3000,
    });
    expect(r).toEqual({ outcome: 'withdrew', intervalId: id });
    const rs = rows(7);
    expect(rs[0].withdrawn_at_ms).toBe(3000);
    expect(rs[1].withdrawn_at_ms).toBeNull();
    expect(rs[2].decision).toBe('declined');
    expect(rs[2].interval_id).toBeNull();
    expect(researchConsent.captureStateFor(7)).toEqual({ capturing: false });
    expect(researchConsent.decisionStateFor(7)).toEqual({
      state: 'declined',
      decidedTextVersion: 'prufa-2',
    });
  });

  it('withdraw marks only the starting row, inserts nothing, and sets the time once', () => {
    const id = researchConsent.recordDecision({
      userId: 8,
      decision: 'consented',
      text: V1,
      nowMs: 1000,
    }).intervalId;
    researchConsent.recordDecision({ userId: 8, decision: 'consented', text: V2, nowMs: 2000 });
    expect(researchConsent.withdraw({ userId: 8, nowMs: 3000 })).toEqual({
      withdrawn: true,
      intervalId: id,
    });
    expect(rows(8)).toHaveLength(2);
    expect(rows(8).map((r) => r.withdrawn_at_ms)).toEqual([3000, null]);
    expect(researchConsent.decisionStateFor(8).state).toBe('withdrawn');
    expect(researchConsent.withdraw({ userId: 8, nowMs: 4000 })).toEqual({
      withdrawn: false,
      intervalId: null,
    });
    expect(rows(8)[0].withdrawn_at_ms).toBe(3000);
  });

  it('a re-consent after a withdrawal starts a new interval', () => {
    const first = researchConsent.recordDecision({
      userId: 8,
      decision: 'consented',
      text: V1,
      nowMs: 1000,
    }).intervalId;
    researchConsent.withdraw({ userId: 8, nowMs: 3000 });
    const r = researchConsent.recordDecision({
      userId: 8,
      decision: 'consented',
      text: V1,
      nowMs: 5000,
    });
    expect(r.outcome).toBe('started');
    expect(r.intervalId).not.toBe(first);
  });

  it('a decline with no live interval is recorded as declined', () => {
    const r = researchConsent.recordDecision({
      userId: 13,
      decision: 'declined',
      text: V1,
      nowMs: 1000,
    });
    expect(r).toEqual({ outcome: 'declined', intervalId: null });
    expect(researchConsent.decisionStateFor(13)).toEqual({
      state: 'declined',
      decidedTextVersion: 'prufa-1',
    });
  });

  it('a repeated identical decline is unchanged and writes nothing; a decline on a new text inserts', () => {
    const decline = (text, nowMs) =>
      researchConsent.recordDecision({ userId: 14, decision: 'declined', text, nowMs });
    expect(decline(V1, 1000).outcome).toBe('declined');
    expect(decline(V1, 2000)).toEqual({ outcome: 'unchanged', intervalId: null });
    expect(rows(14)).toHaveLength(1);
    // Control: a decline on a different text is a new decision.
    expect(decline(V2, 3000)).toEqual({ outcome: 'declined', intervalId: null });
    expect(rows(14)).toHaveLength(2);
  });

  it('an undecided user reads undecided', () => {
    expect(researchConsent.decisionStateFor(99)).toEqual({
      state: 'undecided',
      decidedTextVersion: null,
    });
  });

  it('refuses an unapproved text and writes nothing', () => {
    expect(() =>
      researchConsent.recordDecision({
        userId: 9,
        decision: 'consented',
        text: { version: 'prufa-9', sha256: 'c'.repeat(64) },
        nowMs: 1000,
      })
    ).toThrow(TypeError);
    expect(rows(9)).toEqual([]);
  });

  it('refuses a bad decision and writes nothing', () => {
    expect(() =>
      researchConsent.recordDecision({ userId: 9, decision: 'maybe', text: V1, nowMs: 1000 })
    ).toThrow(TypeError);
    expect(rows(9)).toEqual([]);
  });
});

describe('captureStateFor (spec §5.11 step 3)', () => {
  it('a delisted text captures nothing; the same row with its text listed captures', () => {
    researchConsent.recordDecision({ userId: 7, decision: 'consented', text: V1, nowMs: 1000 });
    researchConsentText._setTestApprovedTexts([V2]);
    expect(researchConsent.captureStateFor(7)).toEqual({ capturing: false });
    researchConsentText._setTestApprovedTexts([V1, V2]);
    expect(researchConsent.captureStateFor(7).capturing).toBe(true);
  });

  it('the latest decision is the highest id, not the latest time', () => {
    const ins = db.prepare(
      `INSERT INTO research_consent (user_id, decision, interval_id, consent_text_version,
         consent_text_sha256, given_at_ms) VALUES (10, ?, NULL, 'prufa-1', ?, ?)`
    );
    const id = Number(ins.run('consented', V1.sha256, 5000).lastInsertRowid);
    db.prepare('UPDATE research_consent SET interval_id = id WHERE id = ?').run(id);
    ins.run('declined', V1.sha256, 4000);
    expect(researchConsent.captureStateFor(10)).toEqual({ capturing: false });
  });

  it("another user's live interval does not make this user capture", () => {
    researchConsent.recordDecision({ userId: 11, decision: 'consented', text: V1, nowMs: 1000 });
    expect(researchConsent.captureStateFor(12)).toEqual({ capturing: false });
    expect(researchConsent.captureStateFor(11).capturing).toBe(true);
  });

  it('a missing consent table throws (record turns it into consent-unknown)', () => {
    researchConsent.recordDecision({ userId: 11, decision: 'consented', text: V1, nowMs: 1000 });
    db.exec('ALTER TABLE research_consent RENAME TO rc_hidden');
    expect(() => researchConsent.captureStateFor(11)).toThrow();
    expect(() => researchConsent.anyConsentedRow()).toThrow();
    db.exec('ALTER TABLE rc_hidden RENAME TO research_consent');
    expect(researchConsent.captureStateFor(11).capturing).toBe(true);
    expect(researchConsent.anyConsentedRow()).toBe(true);
  });
});

describe('anyConsentedRow (spec §5.1 missing-file rule)', () => {
  it('is false on an empty table, true after a consent, and true after a withdrawal', () => {
    expect(researchConsent.anyConsentedRow()).toBe(false);
    researchConsent.recordDecision({ userId: 7, decision: 'consented', text: V1, nowMs: 1000 });
    expect(researchConsent.anyConsentedRow()).toBe(true);
    researchConsent.withdraw({ userId: 7, nowMs: 2000 });
    expect(researchConsent.anyConsentedRow()).toBe(true);
  });
});

describe('recordLoss (spec §5.11)', () => {
  const L = {
    intervalId: 3,
    book: 'efnafraedi-2e',
    chapter: 1,
    moduleId: 'm1',
    eventType: 'edit-save',
    errorClass: 'busy',
    nowMs: Date.UTC(2026, 10, 3, 12),
  };
  const row = (id) => ({
    interval_id: 3,
    book: 'efnafraedi-2e',
    chapter: 1,
    module_id: 'm1',
    event_type: 'edit-save',
    loss_day: '2026-11-03',
    error_class: 'busy',
    client_action_id: id,
  });
  const all = () => db.prepare('SELECT * FROM research_capture_losses ORDER BY rowid').all();

  it('writes exactly the row, with the UTC day and no time', () => {
    expect(
      researchConsent.recordLoss({
        ...L,
        clientActionId: 'a1',
        nowMs: Date.UTC(2026, 10, 3, 23, 59),
      })
    ).toBe(true);
    expect(all()).toEqual([row('a1')]);
  });

  it('one loss per act; acts without an id are each counted', () => {
    researchConsent.recordLoss({ ...L, clientActionId: 'a1' });
    researchConsent.recordLoss({ ...L, clientActionId: 'a1' });
    researchConsent.recordLoss({ ...L, clientActionId: null });
    researchConsent.recordLoss({ ...L, clientActionId: null });
    researchConsent.recordLoss({ ...L, clientActionId: 'a2' });
    expect(all()).toEqual([row('a1'), row(null), row(null), row('a2')]);
  });

  it('a repeated id returns true', () => {
    researchConsent.recordLoss({ ...L, clientActionId: 'a1' });
    expect(researchConsent.recordLoss({ ...L, clientActionId: 'a1' })).toBe(true);
  });

  it('consent-unknown carries no interval', () => {
    researchConsent.recordLoss({
      ...L,
      intervalId: null,
      errorClass: 'consent-unknown',
      clientActionId: null,
    });
    const rs = all();
    expect(rs).toHaveLength(1);
    expect(rs[0].interval_id).toBeNull();
  });

  it('never throws', () => {
    db.exec('ALTER TABLE research_capture_losses RENAME TO rcl_hidden');
    expect(researchConsent.recordLoss({ ...L, clientActionId: 'a1' })).toBe(false);
    db.exec('ALTER TABLE rcl_hidden RENAME TO research_capture_losses');
    expect(researchConsent.recordLoss(undefined)).toBe(false);
  });
});

describe('the handle', () => {
  it('getSessionsDb returns the injected handle', () => {
    expect(researchConsent.getSessionsDb()).toBe(db);
  });
});
