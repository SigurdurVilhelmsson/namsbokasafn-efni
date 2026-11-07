/**
 * T8 at route level (G1.2 PR3 Task 30; spec §10 T8, §3 anti-goals, §5.11 step 3; plan decision 61; Review Focus
 * 37): the same acts under four consent states (consented, declined, undecided, consented then withdrawn) give
 * identical HTTP responses and identical editing rows, and research rows exist only for the consenting editor.
 * A consenting reviewer's approval of an editor who declined writes no event, and exactly that is absent from the
 * rebuilt editing record.
 *
 * Drives the real handlers on a real migrated database (SESSIONS_DB_PATH in a temp dir, so the research file
 * derives into it too) over synthetic modules under a temp books root: nothing under books/ or pipeline-output/
 * is read or written. The page is never served to an actor (the served hash is computed from the file's own MT
 * text), so no module-opened event muddies the per-editor event list.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath(), the research path and the JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'research-consent-states-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const researchDb = require('../services/researchDb');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const { sha256Text } = require('../lib/servedText');
const { writeModule, handlerFor, invoke } = require('./helpers/servedFixture');
const {
  APPROVED,
  makeUser,
  consent,
  decline,
  losses,
  readResearch,
} = require('./helpers/researchFixture.cjs');
const { allEvents, eventMark, eventsSince } = require('./helpers/researchEventsFixture.cjs');
const {
  rebuildSegmentEdits,
  actualSegmentEdits,
  diffRebuild,
  keyOfProvider,
} = require('./helpers/researchRebuild.cjs');

const CHEM = 'efnafraedi-2e';
const SEGS = ['a', 'b', 'c'];
const MODULES = { 'p-c': 'm98101', 'p-d': 'm98102', 'p-u': 'm98103', 'p-w': 'm98104' };
const id = (m, x) => `${m}:para:${x}`;

// The user name differs from the provider id, so the tokenizer can tell the two apart.
const userOf = (p, role = 'editor') =>
  Object.freeze({ id: p, username: `n-${p.slice(2)}`, role, books: [] });

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let db;
let h;
let IC;
let IW;
let mark;
let lossesBefore;
let responses; // provider id -> [{ status, body }]
let projections; // provider id -> the editing rows, tokenized

beforeAll(async () => {
  runAllMigrations();
  researchDb.openAtBoot();
  researchConsentText._setTestApprovedTexts(APPROVED);
  serverCommit._setTestServerCommit({
    serverCommit: 'c'.repeat(40),
    commitSource: 'deploy-file',
    codeDirty: 0,
  });
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  for (const m of Object.values(MODULES)) {
    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch01',
      moduleId: m,
      en: SEGS.map((x) => [id(m, x), `EN ${x}`]),
      mt: SEGS.map((x) => [id(m, x), x]),
    });
  }
  IC = consent(makeUser('p-c'));
  decline(makeUser('p-d'));
  makeUser('p-u');
  IW = consent(makeUser('p-w'));
  const router = require('../routes/segment-editor');
  h = {
    save: handlerFor(router, 'post', '/:book/:chapter/:moduleId/edit'),
    accept: handlerFor(router, 'post', '/:book/:chapter/:moduleId/accept'),
    submit: handlerFor(router, 'post', '/:book/:chapter/:moduleId/submit'),
    approve: handlerFor(router, 'post', '/edit/:editId/approve'),
    comment: handlerFor(router, 'post', '/edit/:editId/comment'),
    revoke: handlerFor(router, 'post', '/acceptance/:id/revoke'),
    withdraw: handlerFor(require('../routes/research'), 'post', '/consent/withdraw'),
  };
  db = new Database(dbPath);

  // p-w consents, then withdraws through the PR3 route; the withdrawal is not an editing act.
  const w = await invoke(h.withdraw, { user: userOf('p-w'), body: {} });
  expect(w.status).toBe(200);

  mark = eventMark();
  lossesBefore = losses().length;
  responses = {};
  projections = {};
  for (const [provider, moduleId] of Object.entries(MODULES)) {
    responses[provider] = await script(userOf(provider), moduleId);
    projections[provider] = project(userOf(provider), moduleId, responses[provider]);
  }
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestBooksDir(realBooksDir);
  researchConsentText._setTestApprovedTexts(null);
  serverCommit._setTestServerCommit(null);
  researchDb._reset();
  db.close();
  rmSync(work, { recursive: true, force: true });
});

let actSeq = 0;
const act = () => `cs-act-${++actSeq}`;

/** The same six acts, through the real handlers; returns every response. */
async function script(user, m) {
  const params = { book: CHEM, chapter: '1', moduleId: m };
  const out = [];
  const call = async (handler, req) => {
    const r = await invoke(handler, { chapterNum: 1, user, ...req });
    out.push({ status: r.status, body: r.body });
    return r;
  };
  const base = sha256Text('a'); // the served hash of the MT text; a wrong one answers STALE_BASE
  const first = await call(h.save, {
    params,
    body: {
      segmentId: id(m, 'a'),
      editedContent: 'Breyttur a',
      category: 'terminology',
      editorNote: 'athugasemd',
      baseSha256: base,
      assists: [
        {
          itemType: 'term-insert',
          source: 'termbase',
          clientTimeMs: 1000,
          detail: { term: 'hugtak' },
        },
      ],
      clientActionId: act(),
    },
  });
  const editId = first.body.editId;
  await call(h.save, {
    params,
    body: {
      segmentId: id(m, 'a'),
      editedContent: 'Breyttur a aftur',
      baseSha256: first.body.baseSha256,
      baseEditId: editId,
      displayedEditId: first.body.displayedEditId,
      displayedEditSha256: first.body.displayedEditSha256,
      clientActionId: act(),
    },
  });
  const accepted = await call(h.accept, {
    params,
    body: { segmentId: id(m, 'b'), acceptedContent: 'b', clientActionId: act() },
  });
  await call(h.revoke, {
    params: { id: String(accepted.body.acceptance.id) },
    body: { clientActionId: act() },
  });
  await call(h.comment, {
    params: { editId: String(editId) },
    body: { comment: 'athugasemd um breytinguna', clientActionId: act() },
  });
  await call(h.submit, { params, body: { clientActionId: act() } });
  return out;
}

const STRING_IDS = new Set(['module_id', 'segment_id', 'editor_id', 'reviewer_id', 'user_id']);
// Which table's id space a foreign or camelCase id value lives in: ordinals are counted per table, because ids of
// different tables collide numerically and the collisions differ between scenarios.
const SPACE = Object.freeze({
  segment_edit_id: 'segment_edits',
  displayed_edit_id: 'segment_edits',
  editId: 'segment_edits',
  displayedEditId: 'segment_edits',
  stampedEditIds: 'segment_edits',
  served_version_id: 'served_text_versions',
  review_id: 'module_reviews',
  reviewId: 'module_reviews',
  commentId: 'segment_discussions',
});
const isIdKey = (k) => k === 'id' || (k.endsWith('_id') && !STRING_IDS.has(k)) || k in SPACE;
const isTimeKey = (k) => k.endsWith('_at');

/**
 * Rewrites a value so two scenarios that differ only in who and where compare equal: every id by its ordinal of
 * first appearance (per table), the provider id, user name and module id by a token, every set time by '<time>'.
 * `table` names the table a bare `id` belongs to; a response's `acceptance` object switches it.
 */
function makeTokenizer(user, moduleId) {
  const ords = new Map();
  const ordinal = (space, v) => {
    const k = `${space}|${v}`;
    if (!ords.has(k)) {
      const n = [...ords.keys()].filter((x) => x.startsWith(`${space}|`)).length + 1;
      ords.set(k, `#${n}`);
    }
    return ords.get(k);
  };
  const text = (s) =>
    s
      .split(moduleId)
      .join('<module>')
      .split(user.id)
      .join('<user>')
      .split(user.username)
      .join('<user-name>');
  const walk = (v, key = '', table = '') => {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, key, table));
    if (typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [
          k,
          walk(x, k, k === 'acceptance' ? 'segment_acceptances' : table),
        ])
      );
    }
    if (isTimeKey(key)) return '<time>';
    if (isIdKey(key)) return ordinal(SPACE[key] ?? table, v);
    if (key === 'metadata' && typeof v === 'string') {
      try {
        return walk(JSON.parse(v), key, table);
      } catch {
        return text(v);
      }
    }
    return typeof v === 'string' ? text(v) : v;
  };
  return walk;
}

/** Tokenizes the responses with the scenario's own tokenizer, so ordinals follow first appearance. */
function tokenize(user, moduleId, rs) {
  return makeTokenizer(user, moduleId)(rs);
}

/** The editing rows the script left for this module and user, tokenized. */
function project(user, moduleId) {
  const walk = makeTokenizer(user, moduleId);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const rows = {
    segment_edits: all(
      'SELECT * FROM segment_edits WHERE module_id = ? AND editor_id = ? ORDER BY id',
      moduleId,
      user.id
    ),
    segment_acceptances: all(
      'SELECT * FROM segment_acceptances WHERE module_id = ? AND accepted_by = ? ORDER BY id',
      moduleId,
      user.id
    ),
    served_text_versions: all(
      'SELECT * FROM served_text_versions WHERE module_id = ? ORDER BY id',
      moduleId
    ),
    segment_discussions: all(
      `SELECT d.* FROM segment_discussions d JOIN segment_edits e ON e.id = d.segment_edit_id
        WHERE e.module_id = ? ORDER BY d.id`,
      moduleId
    ),
    module_reviews: all(
      'SELECT * FROM module_reviews WHERE module_id = ? AND submitted_by = ? ORDER BY id',
      moduleId,
      user.id
    ),
    activity_log: all('SELECT * FROM activity_log WHERE user_id = ? ORDER BY id', user.id),
  };
  return Object.fromEntries(
    Object.entries(rows).map(([table, rs]) => [table, walk(rs, table, table)])
  );
}

const keyOf = (interval) => {
  const r = readResearch();
  try {
    return r.prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?').get(interval)
      .editor_key;
  } finally {
    r.close();
  }
};

const tokenized = () =>
  Object.fromEntries(
    Object.entries(MODULES).map(([p, m]) => [p, tokenize(userOf(p), m, responses[p])])
  );

describe('T8 at route level: the four consent states (spec §10)', () => {
  it('T8: the four consent states give identical responses and identical editing rows', () => {
    // Control that the script ran: six answered acts each, all 2xx.
    for (const p of Object.keys(MODULES)) {
      expect(responses[p].map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    }
    const t = tokenized();
    expect(t['p-d']).toEqual(t['p-c']);
    expect(t['p-u']).toEqual(t['p-c']);
    expect(t['p-w']).toEqual(t['p-c']);
    expect(projections['p-d']).toEqual(projections['p-c']);
    expect(projections['p-u']).toEqual(projections['p-c']);
    expect(projections['p-w']).toEqual(projections['p-c']);
  });

  it('T8: research rows only for the consenting editor', () => {
    const ev = eventsSince(mark);
    expect(new Set(ev.map((e) => e.editor_key))).toEqual(new Set([keyOf(IC)]));
    expect(ev.sort((a, b) => Number(a.key_seq - b.key_seq)).map((e) => e.event_type)).toEqual([
      'edit-save',
      'edit-resave',
      'mt-accept',
      'mt-accept-revoke',
      'edit-comment',
      'module-submit',
    ]);
    expect(losses().length).toBe(lossesBefore);
    // p-w consented and withdrew: its interval holds no event (control that the withdrawal took effect).
    expect(ev.some((e) => e.editor_key === (keyOfProvider(db, 'p-w') ?? 'none'))).toBe(false);
    expect(IW).not.toBe(IC);
  });

  it('control: the comparison sees a planted difference', () => {
    const planted = structuredClone(projections['p-d']);
    planted.segment_edits[0].category = 'x';
    expect(() => expect(planted).toEqual(projections['p-c'])).toThrow();
    const plantedResponses = structuredClone(tokenized()['p-d']);
    plantedResponses[0].body.research = 1;
    expect(() => expect(plantedResponses).toEqual(tokenized()['p-c'])).toThrow();
  });

  it("T8: a declining reviewer's approval of a consenting author's edit writes no event, and exactly that is absent from the rebuild", async () => {
    const m = MODULES['p-c'];
    const C = userOf('p-c');
    const saved = await invoke(h.save, {
      params: { book: CHEM, chapter: '1', moduleId: m },
      chapterNum: 1,
      user: C,
      body: {
        segmentId: id(m, 'c'),
        editedContent: 'Breyttur c',
        baseSha256: sha256Text('c'),
        clientActionId: act(),
      },
    });
    expect(saved.status).toBe(200);
    const editId = saved.body.editId;

    const kc = keyOf(IC);
    const own = (map) => new Map([...map].filter(([, r]) => r.editor_key === kc));
    const diffOwn = () =>
      diffRebuild(
        own(rebuildSegmentEdits(allEvents())),
        own(actualSegmentEdits(db, (p) => keyOfProvider(db, p)))
      );
    expect(diffOwn()).toEqual([]); // control: before the approval the rebuild agrees

    const before = eventMark();
    const approver = { id: 'p-d', role: 'head-editor', books: [CHEM], username: 'n-d' };
    const r = await invoke(h.approve, {
      params: { editId: String(editId) },
      user: approver,
      body: {},
    });
    expect(r.status).toBe(200);
    expect(db.prepare('SELECT status FROM segment_edits WHERE id = ?').get(editId).status).toBe(
      'approved'
    );
    expect(eventsSince(before)).toEqual([]);
    expect(keyOfProvider(db, 'p-d')).toBeNull();
    expect(diffOwn()).toEqual([
      { id: editId, field: 'status', rebuilt: 'pending', actual: 'approved' },
    ]);
  });
});
