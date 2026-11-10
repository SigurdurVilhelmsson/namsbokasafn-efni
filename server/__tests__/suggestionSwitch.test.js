// server/__tests__/suggestionSwitch.test.js
//
// The per-book switch writer for the editors' AI suggestion view (G1.23 PR3 Task 1): the service's
// check order, the first-switch-on confirmation, the refusal when closures already exist (R21), and
// the two admin routes. SESSIONS_DB_PATH is set to a temp file BEFORE any server require, as a safety
// net: a slip must reach a temp file, never pipeline-output/sessions.db.
import { describe, it, expect, beforeEach, afterEach, afterAll, beforeAll, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'suggestion-switch-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const express = require('express');
const jwt = require('jsonwebtoken');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const segmentEditor = require('../services/segmentEditorService');
const activityLog = require('../services/activityLog');
const log = require('../lib/logger');
const { firstSwitchOnMs, currentSwitchValue } = require('../lib/bookSwitches');
const { setSuggestionView, getSuggestionView } = require('../services/suggestionSwitch');

const B = 'efnafraedi-2e';
const OTHER = 'liffraedi-2e';
let db;

let warn;
beforeEach(() => {
  ({ db } = freshMigratedDb());
  warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  db.close();
});
afterAll(() => {
  fs.rmSync(work, { recursive: true, force: true });
});

const events = (book = B) =>
  db.prepare('SELECT * FROM book_switch_events WHERE book = ? ORDER BY id').all(book);
const plantRejection = (book) =>
  db
    .prepare(
      `INSERT INTO suggestion_rejections
       (book, chapter, module_id, segment_id, occurrence, op_id, ruling_id, rejected_by, rejected_at_ms)
       VALUES (?, 1, 'm1', 's1', 0, 'op1', 'r1', 1, 5)`
    )
    .run(book);
const plantLeftOpen = (book) =>
  db
    .prepare(
      `INSERT INTO suggestion_left_open
       (book, chapter, module_id, segment_id, occurrence, op_id, ruling_id, finishing_act,
        finishing_kind, finishing_id, closed_by, closed_at_ms, shown_at_finish)
       VALUES (?, 1, 'm1', 's1', 0, 'op1', 'r1', 'approval', 'segment_edit', 1, 1, 5, 0)`
    )
    .run(book);
const codeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return undefined;
};
const on = (over = {}) => ({ book: B, enabled: true, confirmBook: B, nowMs: 10, ...over });

describe('setSuggestionView', () => {
  it('turning on the first time needs the typed book name', () => {
    expect(codeOf(() => setSuggestionView(db, on({ confirmBook: undefined })))).toBe(
      'CONFIRM_REQUIRED'
    );
    expect(codeOf(() => setSuggestionView(db, on({ confirmBook: 'x' })))).toBe('CONFIRM_REQUIRED');
    expect(events()).toHaveLength(0);
  });

  it('with the typed name it switches on and writes one row', () => {
    expect(setSuggestionView(db, on())).toEqual({ changed: true, enabled: true });
    expect(events().map((e) => [e.switch_name, e.value, e.switched_at_ms])).toEqual([
      ['suggestion-view', 1, 10],
    ]);
  });

  it('a repeat of the current value writes no row (off, and on)', () => {
    expect(setSuggestionView(db, { book: B, enabled: false, nowMs: 9 })).toEqual({
      changed: false,
      enabled: false,
    });
    expect(events()).toHaveLength(0);
    setSuggestionView(db, on());
    expect(setSuggestionView(db, { book: B, enabled: true, nowMs: 11 })).toEqual({
      changed: false,
      enabled: true,
    });
    expect(events()).toHaveLength(1);
  });

  it('off, then on again, needs no confirmation and leaves the first switch-on time where it was', () => {
    setSuggestionView(db, on());
    expect(setSuggestionView(db, { book: B, enabled: false, nowMs: 20 }).changed).toBe(true);
    expect(currentSwitchValue(db, B, 'suggestion-view')).toBe(false);
    expect(setSuggestionView(db, { book: B, enabled: true, nowMs: 30 })).toEqual({
      changed: true,
      enabled: true,
    });
    expect(firstSwitchOnMs(db, B, 'suggestion-view')).toBe(10);
    expect(events()).toHaveLength(3);
  });

  it.each(['lifraen-efnafraedi', OTHER])('refuses %s', (book) => {
    expect(codeOf(() => setSuggestionView(db, on({ book, confirmBook: book })))).toBe(
      'NOT_A_STUDY_BOOK'
    );
    expect(events(book)).toHaveLength(0);
  });

  it('refuses a switch-off on a non-study book too', () => {
    expect(codeOf(() => setSuggestionView(db, { book: OTHER, enabled: false, nowMs: 10 }))).toBe(
      'NOT_A_STUDY_BOOK'
    );
  });

  describe('R21: closures before the first switch-on', () => {
    it('a planted rejection refuses the first switch-on and writes no row', () => {
      plantRejection(B);
      expect(codeOf(() => setSuggestionView(db, on()))).toBe('CLOSED_BEFORE_SWITCH_ON');
      expect(events()).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(
        { book: B, rejected: 1, leftOpen: 0 },
        expect.stringContaining('refused')
      );
    });

    it('a planted left-open row refuses the first switch-on and writes no row', () => {
      plantLeftOpen(B);
      expect(codeOf(() => setSuggestionView(db, on()))).toBe('CLOSED_BEFORE_SWITCH_ON');
      expect(events()).toHaveLength(0);
    });

    it('rows for another book do not refuse (control)', () => {
      plantRejection(OTHER);
      plantLeftOpen(OTHER);
      expect(setSuggestionView(db, on()).changed).toBe(true);
      expect(events()).toHaveLength(1);
    });

    it('after the first switch-on the check never runs again', () => {
      setSuggestionView(db, on());
      plantRejection(B);
      plantLeftOpen(B);
      setSuggestionView(db, { book: B, enabled: false, nowMs: 20 });
      expect(setSuggestionView(db, { book: B, enabled: true, nowMs: 30 })).toEqual({
        changed: true,
        enabled: true,
      });
      expect(firstSwitchOnMs(db, B, 'suggestion-view')).toBe(10);
    });

    it('the confirmation check comes before the closure check', () => {
      plantRejection(B);
      expect(codeOf(() => setSuggestionView(db, on({ confirmBook: undefined })))).toBe(
        'CONFIRM_REQUIRED'
      );
    });
  });
});

describe('getSuggestionView', () => {
  it('answers book and enabled only', () => {
    expect(getSuggestionView(db, B)).toEqual({ book: B, enabled: false });
    setSuggestionView(db, on());
    expect(getSuggestionView(db, B)).toEqual({ book: B, enabled: true });
  });
});

describe('the admin routes', () => {
  let server;
  let base;
  const token = (role) =>
    jwt.sign(
      { sub: `u-${role}`, username: role, name: role, role, books: [] },
      process.env.JWT_SECRET,
      { issuer: 'namsbokasafn-pipeline', expiresIn: '10m' }
    );
  const call = (method, p, role, body) =>
    fetch(base + p, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token(role)}` },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    });
  const url = (book = B) => `/api/admin/books/${book}/suggestion-view`;
  const logRows = () =>
    db.prepare("SELECT * FROM activity_log WHERE type = 'suggestion_view_toggled'").all();

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', require('../routes/admin'));
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => server?.close());
  beforeEach(() => {
    segmentEditor._setTestDb(db);
    activityLog._setTestDb(db);
  });
  afterEach(() => {
    segmentEditor._setTestDb(null);
    activityLog._setTestDb(null);
    vi.restoreAllMocks();
  });

  it('is admin only, and an editor changes nothing (control: the admin can)', async () => {
    const denied = await call('POST', url(), 'editor', { enabled: true, confirmBook: B });
    expect(denied.status).toBe(403);
    expect(events()).toHaveLength(0);
    expect((await call('GET', url(), 'editor')).status).toBe(403);
    const ok = await call('POST', url(), 'admin', { enabled: true, confirmBook: B });
    expect(ok.status).toBe(200);
    expect(events()).toHaveLength(1);
  });

  it('answers { book, enabled } with no time, and the GET agrees', async () => {
    const res = await call('POST', url(), 'admin', { enabled: true, confirmBook: B });
    expect(await res.json()).toEqual({ book: B, enabled: true });
    const got = await call('GET', url(), 'admin');
    expect(await got.json()).toEqual({ book: B, enabled: true });
  });

  it('400 for a bad body, CONFIRM_REQUIRED and NOT_A_STUDY_BOOK, with a code', async () => {
    expect((await call('POST', url(), 'admin', { enabled: 'yes' })).status).toBe(400);
    const confirm = await call('POST', url(), 'admin', { enabled: true });
    expect(confirm.status).toBe(400);
    expect((await confirm.json()).code).toBe('CONFIRM_REQUIRED');
    const notStudy = await call('POST', url(OTHER), 'admin', { enabled: true, confirmBook: OTHER });
    expect(notStudy.status).toBe(400);
    expect((await notStudy.json()).code).toBe('NOT_A_STUDY_BOOK');
    expect(events()).toHaveLength(0);
    expect(logRows()).toHaveLength(0);
  });

  it('writes an activity_log row on a change only', async () => {
    await call('POST', url(), 'admin', { enabled: true, confirmBook: B });
    expect(logRows()).toHaveLength(1);
    await call('POST', url(), 'admin', { enabled: true });
    expect(logRows()).toHaveLength(1);
  });

  it('409 CLOSED_BEFORE_SWITCH_ON writes no switch row and no activity_log row, and sends no counts or time', async () => {
    plantRejection(B);
    const res = await call('POST', url(), 'admin', { enabled: true, confirmBook: B });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('CLOSED_BEFORE_SWITCH_ON');
    expect(Object.keys(body).sort()).toEqual(['code', 'error']);
    expect(events()).toHaveLength(0);
    expect(logRows()).toHaveLength(0);
  });
});
