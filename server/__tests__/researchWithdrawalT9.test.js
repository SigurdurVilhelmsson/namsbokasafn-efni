/**
 * T9 end to end (G1.1 + G1.2 spec §10 T9, §3's anti-goal: a withdrawal never changes what an editor sees or can do;
 * PR4 Task 16, decision 39). A pin over Tasks 6, 8 and 10, so its first run passes; its red arm is the control case
 * below, and a mutation of the deletion service run once by hand.
 *
 * Drives the real handlers on a real migrated database (SESSIONS_DB_PATH in a temp dir, so the research file and its
 * copies derive into it) over one synthetic chemistry module under a temp books root.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath(), the research path and the JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'research-withdrawal-t9-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const { researchFilesFor } = require('../lib/researchFiles');
const researchDb = require('../services/researchDb');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const { sha256Text } = require('../lib/servedText');
const { runWithdrawal } = require('../scripts/research-withdrawal');
const { takeCopy } = require('../scripts/research-backup');
const { writeModule, handlerFor, invoke } = require('./helpers/servedFixture');
const { APPROVED, makeUser, losses, readResearch } = require('./helpers/researchFixture.cjs');

const CHEM = 'efnafraedi-2e';
const MODULE = 'm98201';
const SEGS = ['a', 'b', 'c', 'd'];
const id = (x) => `${MODULE}:para:${x}`;
const EXCLUDED = new Set(['research_consent', 'research_capture_losses', 'research_deletions']);
const userOf = (p, role = 'editor') =>
  Object.freeze({ id: p, username: `n-${p.slice(2)}`, role, books: [] });

const { researchPath } = resolveResearchDbPath();
const files = researchFilesFor(researchPath);
let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let db;
let h;
let actSeq = 0;
const act = () => `t9-act-${++actSeq}`;
const params = { book: CHEM, chapter: '1', moduleId: MODULE };

/** Every editing table, by value: each table in sqlite_master but the three a withdrawal changes by design. */
function editingSnapshot(conn) {
  const tables = conn
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .filter((t) => !EXCLUDED.has(t.name) && !t.name.startsWith('sqlite_stat'));
  const out = {};
  for (const { name, sql } of tables) {
    let order = 'rowid';
    if (/WITHOUT\s+ROWID/i.test(sql || '')) {
      order = conn
        .pragma(`table_info(${name})`)
        .filter((c) => c.pk > 0)
        .sort((x, y) => x.pk - y.pk)
        .map((c) => `"${c.name}"`)
        .join(', ');
    }
    out[name] = conn.prepare(`SELECT * FROM "${name}" ORDER BY ${order}`).all();
  }
  return out;
}
const holds = (p, s) => readFileSync(p).includes(Buffer.from(s, 'ascii'));
const liveHolds = (s) =>
  holds(researchPath, s) || (require('fs').existsSync(files.walPath) && holds(files.walPath, s));
const serve = () => invoke(h.get, { params, chapterNum: 1, user: userOf('a-admin', 'admin') });
const save = (pid, segment, text) =>
  invoke(h.save, {
    params,
    chapterNum: 1,
    user: userOf(pid),
    body: {
      segmentId: id(segment),
      editedContent: text,
      category: 'terminology',
      editorNote: 'athugasemd',
      baseSha256: sha256Text(segment), // the served hash of the MT text
      clientActionId: act(),
    },
  });
const keyOf = (intervalId) => {
  const r = readResearch();
  try {
    return r.prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?').get(intervalId)
      .editor_key;
  } finally {
    r.close();
  }
};
const eventIds = () => {
  const r = readResearch();
  try {
    return r.prepare('SELECT id FROM research_events ORDER BY id').pluck().all();
  } finally {
    r.close();
  }
};

let before;
let otherEditId;
let t9Key;
let copyPath;

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
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: MODULE,
    en: SEGS.map((x) => [id(x), `EN ${x}`]),
    mt: SEGS.map((x) => [id(x), x]),
  });
  for (const p of ['p-t9', 'p-other']) makeUser(p);
  makeUser('a-admin', 'admin');
  const router = require('../routes/segment-editor');
  const research = require('../routes/research');
  h = {
    get: handlerFor(router, 'get', '/:book/:chapter/:moduleId'),
    save: handlerFor(router, 'post', '/:book/:chapter/:moduleId/edit'),
    accept: handlerFor(router, 'post', '/:book/:chapter/:moduleId/accept'),
    consent: handlerFor(research, 'post', '/consent'),
    withdraw: handlerFor(research, 'post', '/consent/withdraw'),
  };
  db = new Database(dbPath);
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

describe('T9 end to end: a withdrawal leaves the editing record byte-identical', () => {
  it('a withdrawal changes no editing row and no byte of the module JSON, and its rows leave the research file and the next copy', async () => {
    for (const p of ['p-t9', 'p-other']) {
      const c = await invoke(h.consent, {
        user: { id: p },
        body: { decision: 'consented', textVersion: APPROVED[0].version },
      });
      expect(c.status).toBe(200);
    }
    const edit = await save('p-t9', 'a', 'SENTINEL-T9-EDIT');
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    const accepted = await invoke(h.accept, {
      params,
      chapterNum: 1,
      user: userOf('p-t9'),
      body: { segmentId: id('b'), acceptedContent: 'b', clientActionId: act() },
    });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    const other = await save('p-other', 'c', 'SENTINEL-T9-OTHER');
    expect(other.status).toBe(200);
    otherEditId = other.body.editId;
    expect((await serve()).status).toBe(200); // the first serve mints

    const t9Interval = db
      .prepare(
        "SELECT r.id FROM research_consent r JOIN users u ON u.id = r.user_id WHERE u.provider_id = 'p-t9' AND r.decision = 'consented'"
      )
      .get().id;
    t9Key = keyOf(t9Interval);
    before = { json: JSON.stringify((await serve()).body), rows: editingSnapshot(db) };
    // The control: the research file holds the edit and the key before the withdrawal.
    expect(liveHolds('SENTINEL-T9-EDIT')).toBe(true);
    expect(liveHolds(t9Key)).toBe(true);

    const w = await invoke(h.withdraw, { user: { id: 'p-t9' }, body: {} });
    expect(w.status).toBe(200);
    expect(
      runWithdrawal({
        researchPath,
        sessionsPath: dbPath,
        write: true,
        busyTimeoutMs: 100,
      }).ok
    ).toBe(true);
    const copy = await takeCopy({ files, sessionsPath: dbPath, nowMs: Date.now() });
    expect(copy.ok, copy.reason).toBe(true);
    copyPath = copy.path;

    expect(editingSnapshot(db)).toEqual(before.rows);
    expect(JSON.stringify((await serve()).body)).toBe(before.json);
    for (const s of ['SENTINEL-T9-EDIT', t9Key]) {
      expect(liveHolds(s), s).toBe(false);
      expect(holds(copyPath, s), s).toBe(false);
    }
    expect(liveHolds('SENTINEL-T9-OTHER')).toBe(true); // positive control
    expect(holds(copyPath, 'SENTINEL-T9-OTHER')).toBe(true);

    // A later act writes no research row and no loss row.
    const idsBefore = eventIds();
    const lossesBefore = losses();
    const later = await save('p-t9', 'd', 'Breyttur d');
    expect(later.status).toBe(200);
    expect(eventIds()).toEqual(idsBefore);
    expect(losses()).toEqual(lossesBefore);
  });

  it('control: the comparison sees a changed editing row', () => {
    // editor_note has no CHECK; category does (migration 039), so category = 'x' would throw instead of differing.
    db.prepare("UPDATE segment_edits SET editor_note = 'MUTATED' WHERE id = ?").run(otherEditId);
    expect(editingSnapshot(db)).not.toEqual(before.rows);
  });
});
