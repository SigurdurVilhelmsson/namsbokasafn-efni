/**
 * T21, the MT lock (G1.1; spec §5.19, §10 T21; plan Task 15): in a study-book unit that already
 * holds a freeze marker, the first save and the first accept leave every file under books/
 * unchanged. Without the marker, the first save and the first accept each write exactly one file,
 * the marker (today's behaviour).
 *
 * These are pins: `writeMtLock` is a no-op once a marker exists (`tools/lib/mt-lock.cjs`), so they
 * pass before Task 15. They exist so that the accept's new transaction (mint + INSERT) and the
 * save's (mint + saveSegmentEdit) cannot start writing beside a freeze marker, and their controls
 * prove the tree snapshot sees a write at all.
 *
 * A real migrated database (SESSIONS_DB_PATH in a temp dir) and a temp books root: the snapshot
 * covers every file under that root, and nothing under the repository's books/ is read or written.
 */
import { mkdtempSync, rmSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'mt-lock-freeze-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const { writeModule, handlerFor, invoke, EDITOR } = require('./helpers/servedFixture');

const STUDY = 'efnafraedi-2e'; // the study book's slug (researchScope.STUDY_BOOKS)
const MODULES = ['m95001', 'm95002', 'm95003', 'm95004'];
const FROZEN = ['m95001', 'm95003'];
const FREEZE = JSON.stringify({ reason: 'freeze', freezeCommit: '0'.repeat(40) });

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let servedEdit;
let accept;

/** Every file under the books root, by relative path, mapped to the sha256 of its bytes. */
function tree() {
  const out = {};
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        out[path.relative(root, p).split(path.sep).join('/')] = createHash('sha256')
          .update(readFileSync(p))
          .digest('hex');
      }
    }
  };
  walk(root);
  return out;
}

/** The keys added or changed from `before` to `after`, with their after-values. */
function changed(before, after) {
  const out = {};
  for (const [k, v] of Object.entries(after)) if (before[k] !== v) out[k] = v;
  for (const k of Object.keys(before)) if (!(k in after)) out[k] = null;
  return out;
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  servedEdit = require('../services/servedEdit');
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  for (const m of MODULES) {
    writeModule(root, {
      book: STUDY,
      chapterDir: 'ch01',
      moduleId: m,
      en: [[`${m}:para:a`, 'EN a']],
      mt: [[`${m}:para:a`, 'IS a']],
    });
  }
  for (const m of FROZEN) {
    writeFileSync(path.join(root, STUDY, '02-mt-output', 'ch01', `${m}-segments.locked`), FREEZE);
  }
  accept = handlerFor(
    require('../routes/segment-editor'),
    'post',
    '/:book/:chapter/:moduleId/accept'
  );
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

function firstSave(moduleId) {
  return servedEdit.saveOnServedBase({
    book: STUDY,
    chapter: 1,
    moduleId,
    segmentId: `${moduleId}:para:a`,
    editedContent: 'IS a breytt',
    category: 'accuracy',
    editorId: EDITOR.id,
    editorUsername: EDITOR.username,
    origin: 're-attach',
    requireEcho: false,
  });
}

function firstAccept(moduleId) {
  return invoke(accept, {
    params: { book: STUDY, chapter: '1', moduleId },
    chapterNum: 1,
    user: EDITOR,
    body: { segmentId: `${moduleId}:para:a`, acceptedContent: 'IS a' },
  });
}

const lockOf = (m) => `${STUDY}/02-mt-output/ch01/${m}-segments.locked`;

describe('T21: the MT lock beside a freeze marker (spec §5.19)', () => {
  it('with a freeze marker, the first save leaves every file under books/ unchanged', () => {
    const before = tree();
    expect(before[lockOf('m95001')]).toBeDefined();
    const r = firstSave('m95001');
    expect(r.outcome).toBe('inserted'); // the save really wrote its first row
    expect(tree()).toEqual(before);
  });

  it('with a freeze marker, the first accept leaves every file under books/ unchanged', async () => {
    const before = tree();
    expect(before[lockOf('m95003')]).toBeDefined();
    const r = await firstAccept('m95003');
    expect(r.status).toBe(200);
    expect(r.body.alreadyAccepted).toBe(false); // the accept really wrote its first row
    expect(tree()).toEqual(before);
  });

  it('control: without the marker, the first save writes exactly the marker', () => {
    const before = tree();
    expect(before[lockOf('m95002')]).toBeUndefined();
    const r = firstSave('m95002');
    expect(r.outcome).toBe('inserted');
    const diff = changed(before, tree());
    expect(Object.keys(diff)).toEqual([lockOf('m95002')]);
    expect(diff[lockOf('m95002')]).toEqual(expect.any(String));
  });

  it('control: without the marker, the first accept writes exactly the marker', async () => {
    const before = tree();
    expect(before[lockOf('m95004')]).toBeUndefined();
    const r = await firstAccept('m95004');
    expect(r.status).toBe(200);
    expect(r.body.alreadyAccepted).toBe(false);
    const diff = changed(before, tree());
    expect(Object.keys(diff)).toEqual([lockOf('m95004')]);
    expect(diff[lockOf('m95004')]).toEqual(expect.any(String));
  });
});
