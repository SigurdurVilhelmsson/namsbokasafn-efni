import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const Database = require(path.join(REPO_ROOT, 'server', 'node_modules', 'better-sqlite3'));
const {
  createSegmentEditsSchema,
} = require(path.join(REPO_ROOT, 'server', '__tests__', 'helpers', 'segmentEditsSchema.cjs'));

let tmp, dbPath, booksDir;

function seedModule(moduleId, chDir, enText, mtText) {
  const en = path.join(booksDir, 'testbook', '02-for-mt', chDir);
  const mt = path.join(booksDir, 'testbook', '02-mt-output', chDir);
  fs.mkdirSync(en, { recursive: true });
  fs.mkdirSync(mt, { recursive: true });
  fs.writeFileSync(path.join(en, `${moduleId}-segments.en.md`), enText);
  fs.writeFileSync(path.join(mt, `${moduleId}-segments.is.md`), mtText);
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c16-export-'));
  dbPath = path.join(tmp, 'sessions.db');
  booksDir = path.join(tmp, 'books');
  const db = new Database(dbPath);
  createSegmentEditsSchema(db);
  const ins = db.prepare(
    `INSERT INTO segment_edits (book, chapter, module_id, segment_id,
      original_content, edited_content, editor_id, editor_username, status)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  ins.run('testbook', 1, 'm001', 'm001:para:fs-id1', 'gamalt', 'leiðrétt', 'u1', 'Editor', 'approved');
  ins.run('testbook', 1, 'm001', 'm001:para:fs-id2', 'gamalt2', 'hafnað', 'u1', 'Editor', 'rejected');
  db.close();
  seedModule(
    'm001',
    'ch01',
    '<!-- SEG:m001:para:fs-id1 -->\nEnglish one\n<!-- SEG:m001:para:fs-id2 -->\nEnglish two\n',
    '<!-- SEG:m001:para:fs-id1 -->\ngamalt\n<!-- SEG:m001:para:fs-id2 -->\ngamalt2\n'
  );
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

// The snapshot is the ONLY record of the editorial work once Step 3 deletes the
// faithful files. A module that contributes zero rows is indistinguishable from
// a typo in --modules or --book, and every downstream gate still balances:
// reconcile() accounts only for rows the snapshot contained. So the export must
// refuse rather than write a quietly-short snapshot.
describe('runExport — a module that matched nothing is a typo until proven otherwise', () => {
  it('refuses when a requested module contributed no rows, and names it', async () => {
    const { runExport } = await import('../export-segment-edits.js');
    const out = path.join(tmp, 'snap.json');
    expect(() =>
      runExport({ book: 'testbook', modules: ['m001', 'm999'], out, dbPath, booksDir })
    ).toThrow(/m999/);
  });

  it('refuses when the book slug matched nothing at all', async () => {
    const { runExport } = await import('../export-segment-edits.js');
    const out = path.join(tmp, 'snap.json');
    expect(() =>
      runExport({ book: 'efnafradi-2e', modules: ['m001'], out, dbPath, booksDir })
    ).toThrow();
  });

  it('writes no snapshot file when it refuses — a short snapshot must not exist to be trusted', async () => {
    const { runExport } = await import('../export-segment-edits.js');
    const out = path.join(tmp, 'snap.json');
    try {
      runExport({ book: 'testbook', modules: ['m001', 'm999'], out, dbPath, booksDir });
    } catch {
      /* expected */
    }
    expect(fs.existsSync(out)).toBe(false);
  });
});

describe('runExport', () => {
  it('exports EVERY row regardless of status', async () => {
    const { runExport } = await import('../export-segment-edits.js');
    const out = path.join(tmp, 'snap.json');
    const res = runExport({ book: 'testbook', modules: ['m001'], out, dbPath, booksDir });
    expect(res.rows).toBe(2);
    const snap = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(snap.edits.map((e) => e.status).sort()).toEqual(['approved', 'rejected']);
  });

  it('captures EN and old-MT context for the report', async () => {
    const { runExport } = await import('../export-segment-edits.js');
    const out = path.join(tmp, 'snap.json');
    runExport({ book: 'testbook', modules: ['m001'], out, dbPath, booksDir });
    const snap = JSON.parse(fs.readFileSync(out, 'utf8'));
    const row = snap.edits.find((e) => e.segment_id === 'm001:para:fs-id1');
    expect(row.context.en).toBe('English one');
    expect(row.context.mtAtSnapshot).toBe('gamalt');
  });

  it('records a schema version and the book', async () => {
    const { runExport } = await import('../export-segment-edits.js');
    const out = path.join(tmp, 'snap.json');
    runExport({ book: 'testbook', modules: ['m001'], out, dbPath, booksDir });
    const snap = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(snap.schema).toBe(1);
    expect(snap.book).toBe('testbook');
  });

  it('records the main commit the snapshot was taken against', async () => {
    const { runExport } = await import('../export-segment-edits.js');
    const out = path.join(tmp, 'snap.json');
    runExport({ book: 'testbook', modules: ['m001'], out, dbPath, booksDir });
    const snap = JSON.parse(fs.readFileSync(out, 'utf8'));
    // Provenance: which tree state the old segment ids came from. A failed
    // lookup (git unavailable, not a repo) must yield null, not throw —
    // the snapshot itself is the valuable artifact.
    expect(snap.mainCommit === null || /^[0-9a-f]{40}$/.test(snap.mainCommit)).toBe(true);
  });

  it('does not modify the database', async () => {
    const { runExport } = await import('../export-segment-edits.js');
    const before = fs.statSync(dbPath).mtimeMs;
    runExport({
      book: 'testbook',
      modules: ['m001'],
      out: path.join(tmp, 's.json'),
      dbPath,
      booksDir,
    });
    const db = new Database(dbPath, { readonly: true });
    expect(db.prepare('SELECT count(*) n FROM segment_edits').get().n).toBe(2);
    db.close();
    expect(fs.statSync(dbPath).mtimeMs).toBe(before);
  });
});
