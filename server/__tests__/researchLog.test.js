// server/__tests__/researchLog.test.js — spec §5.9, §5.11, §5.16 (G1.2 PR3, Task 7; extended by Task 11)
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);

// Never let anything here open the real handle under pipeline-output/. JWT_SECRET: the flag
// snapshot and the consent routes load auth.js, which throws at load without one.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'research-log-'));
process.env.SESSIONS_DB_PATH = path.join(tmpRoot, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-research-log';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const researchDb = require('../services/researchDb');
const researchLog = require('../services/researchLog');
const researchConsent = require('../services/researchConsent');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const logger = require('../lib/logger');
const { flagSnapshotJson } = require('../lib/featureFlags');
const { filterContent, buildItemRows } = require('../lib/researchFilter');
const { canonicalJson } = require('../lib/canonicalJson');
const { sha256Text } = require('../lib/servedText');
const { handlerFor, invoke } = require('./helpers/servedFixture');
const {
  APPROVED,
  makeUser,
  consent,
  decline,
  mintFixtureVersion,
  saveEvent,
  readResearch,
  losses,
  seedEdit,
} = require('./helpers/researchFixture.cjs');

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { researchPath, editorialPath } = resolveResearchDbPath();
const T = Date.UTC(2026, 10, 3, 12);
let reader;
let SV;
const uid = {};
const interval = {};

beforeAll(() => {
  runAllMigrations();
  researchDb.openAtBoot(); // no consent yet, so the file is created
  reader = new Database(researchPath, { readonly: true });
  reader.defaultSafeIntegers(true);
  researchConsentText._setTestApprovedTexts(APPROVED);
  serverCommit._setTestServerCommit({
    serverCommit: 'c'.repeat(40),
    commitSource: 'deploy-file',
    codeDirty: 0,
  });
  for (const p of ['p-ed1', 'p-ed2', 'p-ed3', 'p-ed4', 'p-ed5', 'p-dec', 'p-und', 'p-wd']) {
    uid[p] = makeUser(p);
  }
  for (const p of ['p-ed1', 'p-ed2', 'p-ed4']) interval[p] = consent(uid[p]);
  decline(uid['p-dec']);
  SV = mintFixtureVersion();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(() => {
  reader.close();
  researchDb._reset();
  researchConsentText._setTestApprovedTexts(null);
  serverCommit._setTestServerCommit(null);
});

const keyRows = (id) => reader.prepare('SELECT * FROM editor_keys WHERE interval_id = ?').all(id);

describe('ensureKey (spec §5.16)', () => {
  it('mints once per interval, a 128-bit hex key, and never returns it', () => {
    const I = 101;
    const first = researchLog.ensureKey(I);
    expect(first).toEqual({ status: 'minted' });
    expect(researchLog.ensureKey(I)).toEqual({ status: 'exists' });
    const rows = keyRows(I);
    expect(rows).toHaveLength(1);
    expect(rows[0].editor_key).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(first)).not.toMatch(/[0-9a-f]{32}/);
  });

  it('a bad interval id or an unavailable file fails without throwing', () => {
    expect(researchLog.ensureKey('x')).toEqual({ status: 'failed' });
    expect(researchLog.ensureKey(-1)).toEqual({ status: 'failed' });
    const I = 201;
    try {
      researchDb._setTestPaths({ researchPath: '/nonexistent/dir/r.db', editorialPath });
      expect(researchLog.ensureKey(I + 1)).toEqual({ status: 'failed' });
    } finally {
      researchDb._setTestPaths(null);
    }
    expect(researchLog.ensureKey(I + 1)).toEqual({ status: 'minted' });
  });
});

// ---- record (Task 11) -------------------------------------------------------------------------

// Every writing call gets its own clientActionId: record dedupes on it per key (decision 6).
let seq = 0;
const nextId = () => `n-${++seq}`;
const record = (ev) => researchLog.record(ev);
const eventRow = (id) => reader.prepare('SELECT * FROM research_events WHERE id = ?').get(id);
const eventIds = () =>
  reader
    .prepare('SELECT id FROM research_events ORDER BY id')
    .all()
    .map((r) => r.id);
const keyOf = (intervalId) =>
  reader.prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?').get(intervalId)
    ?.editor_key;
// The research file's bytes wherever SQLite has put the pages so far: the main file and its WAL.
const researchBytes = () =>
  Buffer.concat(
    [researchPath, `${researchPath}-wal`]
      .filter((p) => fs.existsSync(p))
      .map((p) => fs.readFileSync(p))
  );
const startOf = (p) => researchConsent.captureStateFor(uid[p]).startedAtMs;
const big = (v) => (typeof v === 'number' ? BigInt(v) : v);

describe("a consenting editor's act is written, every column by value (spec §5.9)", () => {
  it('the event row', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T);
    const r = record(saveEvent());
    expect(r.status).toBe('written');
    expect(typeof r.eventId).toBe('bigint');
    const key = keyOf(interval['p-ed1']);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(eventRow(r.eventId)).toEqual({
      id: r.eventId,
      key_seq: 1n,
      event_type: 'edit-save',
      editor_key: key,
      client_action_id: 'act-1',
      client_action_time_ms: 1700000000000n,
      server_time_ms: BigInt(T),
      replayed: 0n,
      session_id: null,
      book: 'efnafraedi-2e',
      chapter: 1n,
      module_id: 'm98001',
      segment_id: 'm98001:para:a',
      occurrence: 0n,
      served_version_id: BigInt(SV),
      base_is_sha256: sha256Text('IS a'), // looked up from served_text_versions, not passed
      editing_kind: 'segment_edit',
      editing_id: 41n,
      editing_content_sha256: sha256Text('IS a breytt'),
      origin: 'editor-save',
      content_json: filterContent(saveEvent().content),
      before_json: null,
      detail_json: canonicalJson(saveEvent().detail),
      flag_snapshot_json: flagSnapshotJson('efnafraedi-2e', {
        conn: researchConsent.getSessionsDb(),
      }),
      server_commit: 'c'.repeat(40),
      commit_source: 'deploy-file',
      code_dirty: 0n,
    });
  });

  it('its items', () => {
    const r = record(saveEvent({ clientActionId: nextId() }));
    expect(r.status).toBe('written');
    const rows = reader
      .prepare('SELECT * FROM research_event_items WHERE event_id = ? ORDER BY ordinal')
      .all(r.eventId);
    const expected = buildItemRows('edit-save', saveEvent().items).map((it) =>
      Object.fromEntries(
        Object.entries({ ...it, event_id: r.eventId }).map(([k, v]) => [k, big(v)])
      )
    );
    expect(expected).toHaveLength(1);
    expect(rows).toEqual(expected);
  });

  it("free text never reaches the file; the actor's own text does", () => {
    expect(record(saveEvent({ clientActionId: nextId() })).status).toBe('written');
    const bytes = researchBytes();
    expect(bytes.includes('SENTINEL-NOTE')).toBe(false);
    expect(bytes.includes('IS a breytt')).toBe(true); // the control: the scan sees stored text
  });
});

describe('T8, record level: only a consenting, live interval on an approved text captures (spec §5.11 step 3)', () => {
  it('a decliner, an undecided editor and a visitor are skipped, and nothing is written or counted', () => {
    const ids0 = eventIds();
    const l0 = losses();
    const results = ['p-dec', 'p-und', 'p-visitor'].map((p) =>
      record(saveEvent({ actorProviderId: p, clientActionId: nextId() }))
    );
    expect(results).toEqual([
      { status: 'skipped', reason: 'not-consenting' },
      { status: 'skipped', reason: 'not-consenting' },
      { status: 'skipped', reason: 'no-user' },
    ]);
    expect(eventIds()).toEqual(ids0);
    expect(losses()).toEqual(l0);
    // Control: the consenting editor's same act writes.
    expect(record(saveEvent({ clientActionId: nextId() })).status).toBe('written');
    expect(eventIds()).toHaveLength(ids0.length + 1);
  });

  it('nothing is captured for anyone while no text is approved', () => {
    const id = nextId();
    const ids0 = eventIds();
    try {
      researchConsentText._setTestApprovedTexts(null);
      expect(record(saveEvent({ clientActionId: id }))).toEqual({
        status: 'skipped',
        reason: 'not-consenting',
      });
      expect(eventIds()).toEqual(ids0);
    } finally {
      researchConsentText._setTestApprovedTexts(APPROVED);
    }
    expect(record(saveEvent({ clientActionId: id })).status).toBe('written');
  });
});

describe('T18, event half: a non-study book writes nothing and counts nothing', () => {
  it('biology is skipped at step 1; chemistry writes', () => {
    const ids0 = eventIds();
    const l0 = losses();
    expect(record(saveEvent({ book: 'liffraedi-2e', clientActionId: nextId() }))).toEqual({
      status: 'skipped',
      reason: 'not-study',
    });
    expect(eventIds()).toEqual(ids0);
    expect(losses()).toEqual(l0);
    const r = record(saveEvent({ clientActionId: nextId() }));
    expect(r.status).toBe('written');
    expect(eventRow(r.eventId).book).toBe('efnafraedi-2e');
  });
});

describe('T20, record level: times and order (spec §5.9, §5.10)', () => {
  it("a replay carries replayed 1 and the client's original time", () => {
    const at = startOf('p-ed1') + 1000;
    const r = record(saveEvent({ replayed: true, clientActionTime: at, clientActionId: 'act-r' }));
    expect(r.status).toBe('written');
    expect(eventRow(r.eventId).replayed).toBe(1n);
    expect(eventRow(r.eventId).client_action_time_ms).toBe(BigInt(at));
    // Control: a live save reads replayed 0.
    const live = record(saveEvent({ clientActionId: nextId() }));
    expect(eventRow(live.eventId).replayed).toBe(0n);
  });

  it('a replay made before consent, or with no client time, is neither captured nor counted (decision 16)', () => {
    const early = startOf('p-ed1') - 1;
    const ids0 = eventIds();
    const l0 = losses();
    const results = [
      record(saveEvent({ replayed: true, clientActionTime: early, clientActionId: nextId() })),
      record(saveEvent({ replayed: true, clientActionTime: undefined, clientActionId: nextId() })),
    ];
    expect(results).toEqual([
      { status: 'skipped', reason: 'before-consent' },
      { status: 'skipped', reason: 'before-consent' },
    ]);
    expect(eventIds()).toEqual(ids0);
    expect(losses()).toEqual(l0);
    // The rule judges replays only: a live save with the same early client time is written.
    const live = record(saveEvent({ clientActionTime: early, clientActionId: nextId() }));
    expect(live.status).toBe('written');
    expect(eventRow(live.eventId).client_action_time_ms).toBe(BigInt(early));
    // The boundary: a replay made at the interval's start is not earlier than it, so it is captured.
    const atStart = saveEvent({
      replayed: true,
      clientActionTime: early + 1,
      clientActionId: nextId(),
    });
    expect(record(atStart).status).toBe('written');
  });

  it('two saves in one second are ordered by key_seq, with distinct millisecond times', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T);
    const a = record(saveEvent({ actorProviderId: 'p-ed4', clientActionId: nextId() }));
    vi.setSystemTime(T + 5);
    const b = record(saveEvent({ actorProviderId: 'p-ed4', clientActionId: nextId() }));
    const rows = [a, b].map((r) => eventRow(r.eventId));
    expect(rows.map((r) => r.key_seq)).toEqual([1n, 2n]);
    expect(rows.map((r) => r.server_time_ms)).toEqual([BigInt(T), BigInt(T + 5)]);
  });

  it('event ids are random: distinct, not monotone in insertion order, and wider than 2^53', () => {
    const results = Array.from({ length: 16 }, () =>
      record(saveEvent({ actorProviderId: 'p-ed2', clientActionId: nextId() }))
    );
    expect(results.every((r) => r.status === 'written')).toBe(true);
    const rows = reader
      .prepare('SELECT id, key_seq FROM research_events WHERE editor_key = ? ORDER BY key_seq')
      .all(keyOf(interval['p-ed2']));
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual(results.map((r) => r.eventId));
    expect(new Set(ids).size).toBe(16);
    expect(ids.some((v, i) => i > 0 && v < ids[i - 1])).toBe(true);
    expect(ids.some((v) => v > 2n ** 53n)).toBe(true);
    // Control: key_seq IS monotone in insertion order, so the id check is not an artefact of the read.
    expect(rows.map((r) => r.key_seq)).toEqual(Array.from({ length: 16 }, (_, i) => BigInt(i + 1)));
  });

  it('each key has its own counter', () => {
    const k1 = keyOf(interval['p-ed1']);
    const k2 = keyOf(interval['p-ed2']);
    expect(k1).not.toBe(k2);
    const span = (k) =>
      reader
        .prepare(
          'SELECT MIN(key_seq) AS lo, MAX(key_seq) AS hi, COUNT(*) AS n FROM research_events WHERE editor_key = ?'
        )
        .get(k);
    // p-ed2 started at 1 although p-ed1 had written several events by then.
    expect(span(k2)).toEqual({ lo: 1n, hi: 16n, n: 16n });
    const s1 = span(k1);
    expect(s1.lo).toBe(1n);
    expect(s1.hi).toBe(s1.n);
    expect(s1.hi > 1n).toBe(true);
  });
});

describe('a replay of a recorded act is a duplicate, not a loss (spec §5.11)', () => {
  it('the same clientActionId twice: the second writes nothing and counts nothing', () => {
    const id = nextId();
    expect(record(saveEvent({ clientActionId: id })).status).toBe('written');
    const ids0 = eventIds();
    const l0 = losses();
    const replay = saveEvent({
      clientActionId: id,
      replayed: true,
      clientActionTime: startOf('p-ed1') + 1,
    });
    expect(record(replay)).toEqual({ status: 'duplicate' });
    expect(eventIds()).toEqual(ids0);
    expect(losses()).toEqual(l0);
    // Control: a new clientActionId writes.
    expect(record(saveEvent({ clientActionId: nextId() })).status).toBe('written');
  });
});

describe('append-only at run time (spec §5.9)', () => {
  it('every row already written is equal by value after ten further acts', () => {
    const before = reader.prepare('SELECT * FROM research_events ORDER BY id').all();
    expect(before.some((r) => r.client_action_id === 'act-1')).toBe(true); // the first event
    for (let i = 0; i < 10; i += 1) {
      expect(record(saveEvent({ clientActionId: nextId() })).status).toBe('written');
    }
    expect(before.map((r) => eventRow(r.id))).toEqual(before);
  });
});

describe('T14, event half: the flag snapshot on each event', () => {
  it('a switch flipped between two events changes exactly that key, false to true', () => {
    const a = record(saveEvent({ clientActionId: nextId() }));
    researchConsent
      .getSessionsDb()
      .prepare(
        'INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms) VALUES (?, ?, ?, ?)'
      )
      .run('efnafraedi-2e', 'suggestion-view', 1, T);
    const b = record(saveEvent({ clientActionId: nextId() }));
    const A = JSON.parse(eventRow(a.eventId).flag_snapshot_json);
    const B = JSON.parse(eventRow(b.eventId).flag_snapshot_json);
    const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])];
    expect(keys.filter((k) => A[k] !== B[k])).toEqual(['suggestion-view']);
    expect([A['suggestion-view'], B['suggestion-view']]).toEqual([false, true]);
  });
});

describe('T12, record level: no deferred write', () => {
  it('a new connection opened as record returns, before any timer can run, reads the row', () => {
    vi.useFakeTimers(); // every timer frozen
    const r = record(saveEvent({ clientActionId: nextId() }));
    const fresh = readResearch();
    try {
      const row = fresh
        .prepare('SELECT content_json FROM research_events WHERE id = ?')
        .get(r.eventId);
      expect(row.content_json).toBe(filterContent(saveEvent().content));
    } finally {
      fresh.close();
    }
  });
});

describe('the key minted at consent is the key record writes under (spec §5.16)', () => {
  it('record uses the minted key and mints no second one', () => {
    const I = consent(uid['p-ed3']);
    expect(researchLog.ensureKey(I)).toEqual({ status: 'minted' });
    const minted = keyRows(I);
    expect(minted).toHaveLength(1);
    const r = record(saveEvent({ actorProviderId: 'p-ed3', clientActionId: 'k-1' }));
    expect(r.status).toBe('written');
    expect(eventRow(r.eventId).editor_key).toBe(minted[0].editor_key);
    expect(keyRows(I)).toEqual(minted);
  });

  it("control: with no key minted at consent, the first event creates the interval's key (fallback)", () => {
    const I = consent(uid['p-ed5']);
    expect(keyRows(I)).toEqual([]);
    const r = record(saveEvent({ actorProviderId: 'p-ed5', clientActionId: nextId() }));
    expect(r.status).toBe('written');
    const rows = keyRows(I);
    expect(rows).toHaveLength(1);
    expect(eventRow(r.eventId).editor_key).toBe(rows[0].editor_key);
  });
});

describe('T8: an editor withdrawn through the route captures nothing (index § Test placement)', () => {
  it('consented through POST /consent writes; after POST /consent/withdraw nothing is written or counted', async () => {
    const router = require('../routes/research');
    const post = handlerFor(router, 'post', '/consent');
    const withdrawH = handlerFor(router, 'post', '/consent/withdraw');
    const as = (body) => ({ user: { id: 'p-wd' }, body });
    const consented = await invoke(post, as({ decision: 'consented', textVersion: 'prufa-1' }));
    expect(consented.status).toBe(200);
    expect(consented.body.state).toBe('consented');
    expect(record(saveEvent({ actorProviderId: 'p-wd', clientActionId: 'w-1' })).status).toBe(
      'written'
    );
    const withdrawn = await invoke(withdrawH, as({}));
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.state).toBe('withdrawn');
    const ids0 = eventIds();
    const l0 = losses();
    expect(record(saveEvent({ actorProviderId: 'p-wd', clientActionId: 'w-2' }))).toEqual({
      status: 'skipped',
      reason: 'not-consenting',
    });
    expect(eventIds()).toEqual(ids0);
    expect(losses()).toEqual(l0);
  });
});

describe('decision 65: a text another editor holds as a live edit is stored only as its hash', () => {
  const ev = (text, over = {}) =>
    saveEvent({
      content: { text, note: null, category: null },
      editingContentSha256: sha256Text(text),
      clientActionId: nextId(),
      ...over,
    });
  const contentOf = (r) => JSON.parse(eventRow(r.eventId).content_json);

  it('the content keeps only textSha256; editing_content_sha256 is unchanged', () => {
    seedEdit({ editorId: 'p-other', segmentId: 'm98001:para:a', text: 'D65-COPY' });
    const r = record(ev('D65-COPY'));
    expect(r.status).toBe('written');
    expect(contentOf(r)).toEqual({
      category: null,
      note: null,
      textSha256: sha256Text('D65-COPY'),
    });
    expect(eventRow(r.eventId).editing_content_sha256).toBe(sha256Text('D65-COPY'));
    expect(researchBytes().includes('D65-COPY')).toBe(false);
    // Control: a text no other editor holds is stored as written.
    const own = record(ev('D65-OWN'));
    expect(contentOf(own).text).toBe('D65-OWN');
    expect(researchBytes().includes('D65-OWN')).toBe(true);
  });

  it('only a live row of another editor counts', () => {
    const cases = [
      { editorId: 'p-other', status: 'rejected', text: 'D65-REJ', hashed: false },
      { editorId: 'p-other', status: 'superseded', text: 'D65-SUP', hashed: false },
      { editorId: 'p-ed1', status: 'pending', text: 'D65-MINE', hashed: false },
      { editorId: 'p-other', status: 'discuss', text: 'D65-DIS', hashed: true },
      {
        editorId: 'p-other',
        status: 'approved',
        appliedAt: '2026-11-04 11:00:00',
        text: 'D65-APP',
        hashed: true,
      },
    ];
    const seen = cases.map(({ editorId, status, appliedAt = null, text }) => {
      seedEdit({ editorId, segmentId: 'm98001:para:a', text, status, appliedAt });
      const c = contentOf(record(ev(text)));
      return [text, c.text ?? null, c.textSha256 ?? null];
    });
    expect(seen).toEqual(
      cases.map(({ text, hashed }) =>
        hashed ? [text, null, sha256Text(text)] : [text, text, null]
      )
    );
  });

  it("a before-image's own text another editor holds is hashed; a different own text is kept", () => {
    // p-other-2: p-other already holds a pending row on this segment (the one-pending index).
    seedEdit({ editorId: 'p-other-2', segmentId: 'm98001:para:a', text: 'D65-PRIOR' });
    const before = (edited) => ({
      table: 'segment_edits',
      row: {
        id: 77,
        book: 'efnafraedi-2e',
        chapter: 1,
        module_id: 'm98001',
        segment_id: 'm98001:para:a',
        status: 'pending',
        edited_content: edited,
        editor_id: 'p-ed1',
        created_at: '2026-11-04 10:00:00',
        applied_at: null,
      },
    });
    const r = record(ev('D65-NEW', { eventType: 'edit-resave', before: before('D65-PRIOR') }));
    expect(r.status).toBe('written');
    const b = JSON.parse(eventRow(r.eventId).before_json)[0].row;
    expect(b.edited_content_sha256).toBe(sha256Text('D65-PRIOR'));
    expect('edited_content' in b).toBe(false);
    expect(b.created_at).toBe('2026-11-04 10:00:00'); // the actor's own time
    expect(contentOf(r).text).toBe('D65-NEW');
    expect(researchBytes().includes('D65-PRIOR')).toBe(false); // before the control's text lands
    // Control: an own prior text nobody else holds is kept.
    const k = record(ev('D65-NEW', { eventType: 'edit-resave', before: before('D65-PRIOR-2') }));
    const b2 = JSON.parse(eventRow(k.eventId).before_json)[0].row;
    expect(b2.edited_content).toBe('D65-PRIOR-2');
    expect('edited_content_sha256' in b2).toBe(false);
  });

  it('the book-wide check binds a text as one query per text did: a lone surrogate finds the row it was stored as', () => {
    // better-sqlite3 binds a lone surrogate as U+FFFD, so one `edited_content = ?` per text matched the stored row; a
    // JSON escape of it decodes to other bytes. The batched check must bind it the same way and withhold the text as
    // the before-row carries it. Every emitter today passes rows read back from sessions.db, which are well-formed:
    // this row is built in memory, as a future emitter's could be.
    const LONE = 'D65-LONE-\ud800-SURROGATE';
    seedEdit({ editorId: 'p-other', moduleId: 'm98003', segmentId: 'm98003:para:z', text: LONE });
    const stored = researchConsent
      .getSessionsDb()
      .prepare('SELECT edited_content FROM segment_edits WHERE segment_id = ?')
      .get('m98003:para:z').edited_content;
    expect(stored).toBe(LONE.toWellFormed()); // the fixture's control: stored as U+FFFD, not as written
    expect(stored).not.toBe(LONE);
    const r = record(
      ev('D65-LONE-NEW', {
        eventType: 'edit-resave',
        before: {
          table: 'segment_edits',
          row: {
            id: 78,
            book: 'efnafraedi-2e',
            chapter: 1,
            module_id: 'm98001',
            segment_id: 'm98001:para:a',
            status: 'pending',
            origin: null, // no propagation event matches, so the book-wide check runs
            edited_content: LONE,
            editor_id: 'p-ed1',
            created_at: '2026-11-04 10:00:00',
            applied_at: null,
          },
        },
      })
    );
    expect(r.status).toBe('written');
    const b = JSON.parse(eventRow(r.eventId).before_json)[0].row;
    expect(b.edited_content_sha256).toBe(sha256Text(LONE));
    expect('edited_content' in b).toBe(false);
  });

  it('propagation: the source segment counts too, and previewText is dropped', () => {
    seedEdit({
      editorId: 'p-other',
      moduleId: 'm98002',
      segmentId: 'm98002:para:s',
      text: 'D65-SRC',
    });
    const detail = (t) => ({
      source: { moduleId: 'm98002', segmentId: 'm98002:para:s' },
      previewSource: 'own-edit',
      previewText: t,
      previewSha256: sha256Text(t),
      previewMismatch: false,
    });
    const prop = (t) =>
      ev(t, {
        eventType: 'propagation',
        origin: 'propagation',
        items: null,
        clientActionId: null,
        detail: detail(t),
      });
    const r = record(prop('D65-SRC'));
    expect(r.status).toBe('written');
    expect(contentOf(r)).toEqual({ category: null, note: null, textSha256: sha256Text('D65-SRC') });
    const kept = detail('D65-SRC');
    delete kept.previewText;
    expect(JSON.parse(eventRow(r.eventId).detail_json)).toEqual(kept);
    // Nobody holds it on the event's own segment, so only the source can have withheld it.
    expect(researchBytes().includes('D65-SRC')).toBe(false);
    // Control: a text nobody holds keeps both the content text and previewText.
    const c = record(prop('D65-SRC-2'));
    expect(contentOf(c).text).toBe('D65-SRC-2');
    expect(JSON.parse(eventRow(c.eventId).detail_json).previewText).toBe('D65-SRC-2');
  });

  it("one definition of a live edit: record uses propagationService's predicate, verbatim", () => {
    const PREDICATE = "status NOT IN ('rejected', 'superseded')";
    const src = (f) => fs.readFileSync(path.join(SERVER_ROOT, 'services', f), 'utf8');
    expect(src('researchLog.js')).toContain(PREDICATE);
    // Control: aimed at the real file (findEdit and the latest-live-edit query hold it).
    expect(src('propagationService.js').split(PREDICATE).length - 1).toBeGreaterThanOrEqual(2);
  });
});

describe('controller rulings R1 and R2: a null served version, and undefined optional fields', () => {
  it('R1: a write-refused event with no served version is written with NULL base columns', () => {
    const r = record(
      saveEvent({
        eventType: 'write-refused',
        servedVersionId: null,
        editingKind: null,
        editingId: null,
        editingContentSha256: null,
        origin: null,
        content: null,
        items: null,
        detail: { reason: 'STALE_BASE', echoedSha256: null, currentSha256: null },
        clientActionId: nextId(),
      })
    );
    expect(r.status).toBe('written');
    const row = eventRow(r.eventId);
    expect([row.served_version_id, row.base_is_sha256]).toEqual([null, null]);
    expect(row.event_type).toBe('write-refused');
  });

  it('R1 control: a non-null served version naming no row is not written', () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const ids0 = eventIds();
    const r = record(saveEvent({ servedVersionId: 9_999_999, clientActionId: nextId() }));
    expect([r.status, r.reason]).toEqual(['lost', 'other']);
    expect(eventIds()).toEqual(ids0);
    expect(spy.mock.calls.map((c) => c[0].errorCode)).toEqual(['SERVED_VERSION_MISSING']);
  });

  it('R2: an event that omits every optional field is written, with NULLs', () => {
    const r = record({
      actorProviderId: 'p-ed1',
      eventType: 'edit-save',
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm98001',
    });
    expect(r.status).toBe('written');
    const row = eventRow(r.eventId);
    const optional = [
      'segment_id',
      'occurrence',
      'served_version_id',
      'base_is_sha256',
      'editing_kind',
      'editing_id',
      'editing_content_sha256',
      'origin',
      'content_json',
      'before_json',
      'detail_json',
      'client_action_id',
      'client_action_time_ms',
      'session_id',
    ];
    expect(optional.map((c) => row[c])).toEqual(optional.map(() => null));
    expect(row.replayed).toBe(0n);
    expect(
      reader
        .prepare('SELECT COUNT(*) AS n FROM research_event_items WHERE event_id = ?')
        .get(r.eventId).n
    ).toBe(0n);
  });

  it('R2 control: an event that omits a required field is not written', () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const ids0 = eventIds();
    const results = ['chapter', 'moduleId', 'eventType'].map((field) => {
      const e = saveEvent({ clientActionId: nextId() });
      delete e[field];
      return record(e);
    });
    expect(results.map((r) => [r.status, r.reason])).toEqual([
      ['lost', 'other'],
      ['lost', 'other'],
      ['lost', 'other'],
    ]);
    expect(eventIds()).toEqual(ids0);
    // Only the loss log: a missing chapter or module also fails the ledger's own NOT NULL columns,
    // which logs once more (Task 12) and leaves `ledgered` false.
    expect(
      spy.mock.calls.filter((c) => /capture lost/.test(c[1])).map((c) => c[0].errorCode)
    ).toEqual(['TypeError', 'TypeError', 'TypeError']);
  });
});

describe('the write-only surface (spec §5.16)', () => {
  it('researchLog exports only write functions and the test seam', () => {
    expect(Object.keys(require('../services/researchLog')).sort()).toEqual([
      '_reset',
      'consentLookupFailing',
      'ensureKey',
      'record',
    ]);
  });
});

describe('an event whose fields throw when read (Review Focus 42)', () => {
  it('record neither throws nor re-reads the field to log the loss', () => {
    const bad = Object.defineProperty(saveEvent(), 'book', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    const trap = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('trap');
        },
      }
    );
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const results = [];
    expect(() => results.push(record(bad))).not.toThrow();
    expect(() => results.push(record(trap))).not.toThrow();
    expect(results).toEqual([
      { status: 'lost', reason: 'other', ledgered: false },
      { status: 'lost', reason: 'other', ledgered: false },
    ]);
    expect(spy.mock.calls.map((c) => c[0])).toEqual([
      { errorCode: 'Error', errorClass: 'other', eventType: null, book: null },
      { errorCode: 'Error', errorClass: 'other', eventType: null, book: null },
    ]);
    // Control: an ordinary event is written.
    expect(record(saveEvent({ clientActionId: 'g-ok' })).status).toBe('written');
  });
});
