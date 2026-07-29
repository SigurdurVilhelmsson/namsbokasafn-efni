# Segment-edit Re-attach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two one-shot scripts that carry 62+ human-edited segments across C16's re-extract + re-MT clean break, plus the runbook that sequences the migration.

**Architecture:** Pure decision rules live in one testable ESM lib with no I/O. `export-segment-edits.js` reads `sessions.db` and writes a JSON snapshot (read-only). `reattach-segment-edits.js` matches snapshot rows to the new extraction by exact `(module_id, segment_id)` and restores live ones as **pending** through the real `saveSegmentEdit()` write path. No heuristics, no fallback matching.

**Tech Stack:** Node 22 ESM · better-sqlite3 (from `server/node_modules`) · Vitest (`scripts/__tests__/*.test.mjs`)

**Spec:** [`docs/superpowers/specs/2026-07-29-segment-edit-reattach-design.md`](../specs/2026-07-29-segment-edit-reattach-design.md) · **Register:** C16 (P1) · **Baseline:** main `29d59a1e`

## Global Constraints

- **Root is ESM** (`"type": "module"`). Scripts are `.js` using `import`; reach CJS server code via `const require = createRequire(import.meta.url)`.
- **`better-sqlite3` resolves from `server/node_modules`** — the root has no dependency on it.
- **Tests are `.mjs`** under `scripts/__tests__/`, matching `backfill-mt-locks.test.mjs` and `backfillAppendixSections.test.mjs`.
- **Dry-run is the default.** `--db` is the only flag that permits a write, per `backfill-mt-locks.js` (`process.argv.includes('--db')`).
- **Never write to `books/*/01-source/` or `books/*/02-mt-output/`.** Both scripts are read-only against `books/`.
- **Restorable statuses are exactly `approved`, `pending`, `discuss`.** `rejected` and `superseded` are exported but never restored. The schema enum is `pending · approved · rejected · discuss · superseded` — there is no `applied` status; application is the `applied_at` timestamp on an `approved` row.
- **Matching is exact `(module_id, segment_id)`.** No English-text matching, no fuzzy matching, no fallback. Ever.
- **Retired markers are flagged, never rewritten.**
- Run `npm test` from the repo root.

---

### Task 1: Pure re-attach rules

Mirrors `server/lib/glossaryExportDecision.js` — the decision rules extracted from the script so they are testable without a DB or filesystem.

**Files:**
- Create: `scripts/lib/segment-edit-reattach-rules.js`
- Test: `scripts/__tests__/segmentEditReattachRules.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `RESTORABLE_STATUSES: Set<string>`
  - `classifyByStatus(status: string) => 'restore' | 'skip-status'`
  - `detectRetiredMarkers(text: string) => string[]` — subset of `['curly-emphasis','curly-term-fn','markdown']`, stable order
  - `composeEditorNote({ flags, oldMt, editorNote, reviewerNote }) => string`
  - `reconcile({ total, restored, converged, skippedByStatus, unmatched }) => { ok: boolean, message: string }`

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/segmentEditReattachRules.test.mjs`:

```javascript
import { describe, it, expect } from 'vitest';
import {
  RESTORABLE_STATUSES,
  classifyByStatus,
  detectRetiredMarkers,
  composeEditorNote,
  reconcile,
} from '../lib/segment-edit-reattach-rules.js';

describe('classifyByStatus', () => {
  it('restores live editorial work', () => {
    expect(classifyByStatus('approved')).toBe('restore');
    expect(classifyByStatus('pending')).toBe('restore');
    expect(classifyByStatus('discuss')).toBe('restore');
  });

  it('never resurrects a rejected edit', () => {
    expect(classifyByStatus('rejected')).toBe('skip-status');
  });

  it('never restores superseded history', () => {
    expect(classifyByStatus('superseded')).toBe('skip-status');
  });

  it('treats an unknown status as skip, not restore', () => {
    expect(classifyByStatus('banana')).toBe('skip-status');
  });

  it('exposes exactly the three restorable statuses', () => {
    expect([...RESTORABLE_STATUSES].sort()).toEqual(['approved', 'discuss', 'pending']);
  });
});

describe('detectRetiredMarkers', () => {
  it('finds curly emphasis', () => {
    expect(detectRetiredMarkers('a {{i}}b{{/i}} c')).toEqual(['curly-emphasis']);
  });

  it('finds curly term and footnote', () => {
    expect(detectRetiredMarkers('{{term}}mól{{/term}}')).toEqual(['curly-term-fn']);
  });

  it('finds markdown shapes', () => {
    expect(detectRetiredMarkers('H~2~O')).toEqual(['markdown']);
  });

  it('returns every class present, in stable order', () => {
    expect(detectRetiredMarkers('{{i}}x{{/i}} {{fn}}y{{/fn}} ^z^')).toEqual([
      'curly-emphasis',
      'curly-term-fn',
      'markdown',
    ]);
  });

  it('does not flag current bracket markers', () => {
    expect(detectRetiredMarkers('[[i:hratt]] [[term:mól|term-42]] [[sub:2]]')).toEqual([]);
  });

  it('returns empty for plain prose', () => {
    expect(detectRetiredMarkers('Venjulegur íslenskur texti.')).toEqual([]);
  });
});

describe('composeEditorNote', () => {
  it('leads with the retired-marker flags', () => {
    const note = composeEditorNote({ flags: ['curly-emphasis'], oldMt: 'gamalt' });
    expect(note).toMatch(/^⚠️ ENDURFLUTT/);
    expect(note).toContain('curly-emphasis');
  });

  it('carries the old MT text so the editor can compare', () => {
    expect(composeEditorNote({ flags: [], oldMt: 'gamla vélþýðingin' })).toContain(
      'gamla vélþýðingin'
    );
  });

  it('preserves an existing editor note', () => {
    const note = composeEditorNote({ flags: [], oldMt: 'x', editorNote: 'upprunaleg athugasemd' });
    expect(note).toContain('upprunaleg athugasemd');
  });

  it('preserves a reviewer note from a discuss row', () => {
    const note = composeEditorNote({ flags: [], oldMt: 'x', reviewerNote: 'spurning yfirlesara' });
    expect(note).toContain('spurning yfirlesara');
  });
});

describe('reconcile', () => {
  it('accepts a run whose buckets sum to the snapshot total', () => {
    const r = reconcile({ total: 10, restored: 6, converged: 1, skippedByStatus: 2, unmatched: 1 });
    expect(r.ok).toBe(true);
  });

  it('rejects a run that loses rows, and names the gap', () => {
    const r = reconcile({ total: 10, restored: 6, converged: 0, skippedByStatus: 0, unmatched: 1 });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('3');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/__tests__/segmentEditReattachRules.test.mjs`
Expected: FAIL — `Failed to resolve import "../lib/segment-edit-reattach-rules.js"`

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/segment-edit-reattach-rules.js`:

```javascript
/**
 * Pure decision rules for the C16 segment-edit re-attach (spec §7).
 *
 * No DB, no filesystem, no argv — so every rule is unit-testable in isolation.
 * Mirrors the split in server/lib/glossaryExportDecision.js.
 */

/**
 * Statuses that represent LIVE editorial work and therefore re-enter the
 * review queue. `rejected` is excluded on purpose: restoring it as pending
 * would resurrect an edit a head editor deliberately turned down.
 * `superseded` is history — a later row already replaced it.
 */
export const RESTORABLE_STATUSES = new Set(['approved', 'pending', 'discuss']);

/** @returns {'restore'|'skip-status'} */
export function classifyByStatus(status) {
  return RESTORABLE_STATUSES.has(status) ? 'restore' : 'skip-status';
}

const MARKER_CLASSES = [
  ['curly-emphasis', /\{\{\/?[ib]\}\}/],
  ['curly-term-fn', /\{\{\/?(term|fn)\}\}/],
  ['markdown', /(?<!\*)\*[^*\n]{1,60}\*(?!\*)|~[^~\n]{1,60}~|\^[^^\n]{1,60}\^|__[^_\n]{1,40}__|\+\+[^+\n]{1,40}\+\+/],
];

/**
 * Which retired marker classes a piece of edited text still carries.
 * Detection only — the text is never rewritten. A {{term}} → [[term:]]
 * rewrite is lossy (the curly form has no id, the bracket form is
 * id-anchored), so the editor resolves these against the new baseline.
 *
 * @returns {string[]} stable order, empty when clean
 */
export function detectRetiredMarkers(text) {
  const src = text || '';
  return MARKER_CLASSES.filter(([, re]) => re.test(src)).map(([name]) => name);
}

/**
 * The note an editor sees on a restored edit. Flags lead, because they are
 * the only part that needs an action beyond ordinary review.
 */
export function composeEditorNote({ flags = [], oldMt = '', editorNote = '', reviewerNote = '' }) {
  const parts = [];
  parts.push(
    flags.length
      ? `⚠️ ENDURFLUTT (C16) — inniheldur úrelt snið: ${flags.join(', ')}. Berðu saman við nýju vélþýðinguna og lagfærðu sniðið.`
      : '⚠️ ENDURFLUTT (C16) — staðfestu gegn nýrri vélþýðingu.'
  );
  if (oldMt) parts.push(`Fyrri vélþýðing: ${oldMt}`);
  if (reviewerNote) parts.push(`Athugasemd yfirlesara: ${reviewerNote}`);
  if (editorNote) parts.push(`Fyrri athugasemd: ${editorNote}`);
  return parts.join('\n\n');
}

/**
 * Every snapshot row must land in exactly one bucket. An unexplained gap is
 * the one outcome that would let editorial work disappear quietly, so it is
 * a hard failure rather than a warning.
 */
export function reconcile({ total, restored, converged, skippedByStatus, unmatched }) {
  const accounted = restored + converged + skippedByStatus + unmatched;
  if (accounted === total) {
    return { ok: true, message: `All ${total} snapshot rows accounted for.` };
  }
  return {
    ok: false,
    message: `RECONCILIATION FAILED: ${total} snapshot rows but ${accounted} accounted for (${Math.abs(total - accounted)} unexplained).`,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/__tests__/segmentEditReattachRules.test.mjs`
Expected: PASS, 17 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/segment-edit-reattach-rules.js scripts/__tests__/segmentEditReattachRules.test.mjs
git commit -m "feat(c16): pure decision rules for segment-edit re-attach

Status routing (rejected/superseded never restore), retired-marker
detection (flag, never rewrite), editor-note composition, and bucket
reconciliation. No I/O, so every rule is unit-testable."
```

---

### Task 2: `export-segment-edits.js`

**Files:**
- Create: `scripts/export-segment-edits.js`
- Test: `scripts/__tests__/exportSegmentEdits.test.mjs`

**Interfaces:**
- Consumes: nothing from Task 1 (the export is deliberately unfiltered).
- Produces: `runExport({ book, modules, out, dbPath, booksDir }) => { rows: number, path: string }` — exported for tests; the CLI wrapper calls it. Snapshot shape is spec §6.

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/exportSegmentEdits.test.mjs`:

```javascript
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

  it('does not modify the database', async () => {
    const { runExport } = await import('../export-segment-edits.js');
    const before = fs.statSync(dbPath).mtimeMs;
    runExport({ book: 'testbook', modules: ['m001'], out: path.join(tmp, 's.json'), dbPath, booksDir });
    const db = new Database(dbPath, { readonly: true });
    expect(db.prepare('SELECT count(*) n FROM segment_edits').get().n).toBe(2);
    db.close();
    expect(fs.statSync(dbPath).mtimeMs).toBe(before);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/__tests__/exportSegmentEdits.test.mjs`
Expected: FAIL — cannot resolve `../export-segment-edits.js`

- [ ] **Step 3: Write the implementation**

Create `scripts/export-segment-edits.js`:

```javascript
#!/usr/bin/env node
/**
 * C16 clean break, step 1 of 2 (spec §6).
 *
 * Snapshots every segment_edits row for the named modules to a JSON file,
 * BEFORE the re-extract + re-MT that renumbers segments. Read-only: it never
 * writes to sessions.db and never writes under books/.
 *
 * Every row is exported whatever its status — exporting only the applied ones
 * would silently drop an editor's in-flight work, and that failure has no
 * symptom. reattach-segment-edits.js decides what re-enters the queue.
 *
 *   node scripts/export-segment-edits.js --book <slug> --modules m1,m2 --out <path>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Segment id → text, from a `<!-- SEG: id -->` file. Returns {} when absent. */
function readSegmentMap(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const { parseSegments } = require(path.join(REPO_ROOT, 'server', 'services', 'segmentParser.js'));
  const out = {};
  for (const seg of parseSegments(fs.readFileSync(filePath, 'utf8'))) {
    out[seg.segmentId] = seg.content;
  }
  return out;
}

function chapterDirName(chapter) {
  return chapter === -1 ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
}

export function runExport({ book, modules, out, dbPath, booksDir }) {
  const Database = require(path.join(REPO_ROOT, 'server', 'node_modules', 'better-sqlite3'));
  const db = new Database(dbPath, { readonly: true });

  const placeholders = modules.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT * FROM segment_edits WHERE book = ? AND module_id IN (${placeholders})
       ORDER BY module_id, segment_id, id`
    )
    .all(book, ...modules);
  db.close();

  const cache = new Map();
  const contextFor = (row) => {
    const key = `${row.chapter}/${row.module_id}`;
    if (!cache.has(key)) {
      const chDir = chapterDirName(row.chapter);
      cache.set(key, {
        en: readSegmentMap(
          path.join(booksDir, book, '02-for-mt', chDir, `${row.module_id}-segments.en.md`)
        ),
        mt: readSegmentMap(
          path.join(booksDir, book, '02-mt-output', chDir, `${row.module_id}-segments.is.md`)
        ),
      });
    }
    const c = cache.get(key);
    return { en: c.en[row.segment_id] || '', mtAtSnapshot: c.mt[row.segment_id] || '' };
  };

  const snapshot = {
    schema: 1,
    takenAt: new Date().toISOString(),
    book,
    modules,
    edits: rows.map((r) => ({ ...r, context: contextFor(r) })),
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n');
  return { rows: rows.length, path: out };
}

function parseArgs(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  return { book: get('--book'), modules: (get('--modules') || '').split(',').filter(Boolean), out: get('--out') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { book, modules, out } = parseArgs(process.argv.slice(2));
  if (!book || !modules.length || !out) {
    console.error('Usage: node scripts/export-segment-edits.js --book <slug> --modules m1,m2 --out <path>');
    process.exit(1);
  }
  const resolveDbPath = require(path.join(REPO_ROOT, 'server', 'lib', 'dbPath.js'));
  const res = runExport({
    book,
    modules,
    out,
    dbPath: resolveDbPath(),
    booksDir: path.join(REPO_ROOT, 'books'),
  });
  console.log(`Exported ${res.rows} segment_edits rows → ${res.path}`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/__tests__/exportSegmentEdits.test.mjs`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/export-segment-edits.js scripts/__tests__/exportSegmentEdits.test.mjs
git commit -m "feat(c16): export segment_edits snapshot before the clean break

Read-only. Exports EVERY row whatever its status, plus the EN source and
old MT text per segment so the re-attach report can show a human what an
unmatched edit was made against. Context is for the report only, never
for matching."
```

---

### Task 3: `reattach-segment-edits.js` — matching, classification, report

Dry-run behaviour only. Task 4 adds the write.

**Files:**
- Create: `scripts/reattach-segment-edits.js`
- Test: `scripts/__tests__/reattachSegmentEdits.test.mjs`

**Interfaces:**
- Consumes: `classifyByStatus`, `detectRetiredMarkers`, `composeEditorNote`, `reconcile` from Task 1; the snapshot shape from Task 2.
- Produces: `planReattach({ snapshot, booksDir }) => { restore: [], converged: [], skippedByStatus: [], unmatched: [], missingModules: [], reconciliation: {ok, message} }`. Each `restore` entry is `{ row, newMt, flags, editorNote }`.

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/reattachSegmentEdits.test.mjs`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmp, booksDir;

function writeMt(moduleId, chDir, text) {
  const dir = path.join(booksDir, 'testbook', '02-mt-output', chDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${moduleId}-segments.is.md`), text);
}

function snapshotWith(edits) {
  return { schema: 1, takenAt: '2026-07-29T00:00:00Z', book: 'testbook', modules: ['m001'], edits };
}

function edit(over = {}) {
  return {
    id: 1, book: 'testbook', chapter: 1, module_id: 'm001',
    segment_id: 'm001:para:fs-id1', original_content: 'gamalt',
    edited_content: 'leiðrétt', editor_id: 'u1', editor_username: 'Editor',
    status: 'approved', category: null, editor_note: null, reviewer_note: null,
    context: { en: 'English one', mtAtSnapshot: 'gamalt' },
    ...over,
  };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c16-reattach-'));
  booksDir = path.join(tmp, 'books');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('planReattach', () => {
  it('restores an edit whose segment id survives re-extraction', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    const plan = planReattach({ snapshot: snapshotWith([edit()]), booksDir });
    expect(plan.restore).toHaveLength(1);
    expect(plan.restore[0].newMt).toBe('ný vélþýðing');
  });

  it('reports an unmatched id instead of guessing', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:DIFFERENT -->\nný vélþýðing\n');
    const plan = planReattach({ snapshot: snapshotWith([edit()]), booksDir });
    expect(plan.restore).toHaveLength(0);
    expect(plan.unmatched).toHaveLength(1);
    expect(plan.unmatched[0].segment_id).toBe('m001:para:fs-id1');
    expect(plan.unmatched[0].context.en).toBe('English one');
  });

  it('never restores a rejected edit', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    const plan = planReattach({ snapshot: snapshotWith([edit({ status: 'rejected' })]), booksDir });
    expect(plan.restore).toHaveLength(0);
    expect(plan.skippedByStatus).toHaveLength(1);
  });

  it('counts an edit the new MT already matches as converged, not lost', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nleiðrétt\n');
    const plan = planReattach({ snapshot: snapshotWith([edit()]), booksDir });
    expect(plan.converged).toHaveLength(1);
    expect(plan.restore).toHaveLength(0);
  });

  it('flags retired markers in the restored text', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný\n');
    const plan = planReattach({
      snapshot: snapshotWith([edit({ edited_content: '{{i}}skáletrað{{/i}}' })]),
      booksDir,
    });
    expect(plan.restore[0].flags).toEqual(['curly-emphasis']);
    expect(plan.restore[0].editorNote).toContain('curly-emphasis');
  });

  it('treats a whole missing module as fatal, not as unmatched rows', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    const plan = planReattach({ snapshot: snapshotWith([edit()]), booksDir });
    expect(plan.missingModules).toEqual(['m001']);
  });

  it('reconciles every snapshot row into exactly one bucket', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný\n');
    const plan = planReattach({
      snapshot: snapshotWith([
        edit(),
        edit({ id: 2, segment_id: 'm001:para:gone', status: 'approved' }),
        edit({ id: 3, status: 'superseded' }),
      ]),
      booksDir,
    });
    expect(plan.reconciliation.ok).toBe(true);
  });
});

describe('formatReport', () => {
  it('names every unmatched segment id — the report must FIRE, not merely omit a row', async () => {
    const { planReattach, formatReport } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:DIFFERENT -->\nný\n');
    const plan = planReattach({ snapshot: snapshotWith([edit()]), booksDir });
    const report = formatReport(plan);
    expect(report).toContain('m001:para:fs-id1');
    expect(report).toContain('English one');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/__tests__/reattachSegmentEdits.test.mjs`
Expected: FAIL — cannot resolve `../reattach-segment-edits.js`

- [ ] **Step 3: Write the implementation**

Create `scripts/reattach-segment-edits.js`:

```javascript
#!/usr/bin/env node
/**
 * C16 clean break, step 2 of 2 (spec §7).
 *
 * Restores the snapshot's LIVE editorial work as PENDING edits against the
 * re-extracted, re-translated tree.
 *
 * Matching is exact (module_id, segment_id). There is no fallback and no
 * heuristic: 56 of 62 edits key on a CNXML source element id, which comes
 * from read-only 01-source and cannot drift. An edit attached to the WRONG
 * segment is far worse than one not attached, so a miss is reported and
 * skipped, never guessed.
 *
 *   node scripts/reattach-segment-edits.js --snapshot <path> [--db]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import {
  classifyByStatus,
  detectRetiredMarkers,
  composeEditorNote,
  reconcile,
} from './lib/segment-edit-reattach-rules.js';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function chapterDirName(chapter) {
  return chapter === -1 ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
}

function readNewMt(booksDir, book, chapter, moduleId) {
  const file = path.join(
    booksDir, book, '02-mt-output', chapterDirName(chapter), `${moduleId}-segments.is.md`
  );
  if (!fs.existsSync(file)) return null;
  const { parseSegments } = require(path.join(REPO_ROOT, 'server', 'services', 'segmentParser.js'));
  const map = new Map();
  for (const seg of parseSegments(fs.readFileSync(file, 'utf8'))) map.set(seg.segmentId, seg.content);
  return map;
}

export function planReattach({ snapshot, booksDir }) {
  const plan = {
    restore: [], converged: [], skippedByStatus: [], unmatched: [], missingModules: [],
  };
  const mtCache = new Map();

  for (const row of snapshot.edits) {
    if (classifyByStatus(row.status) === 'skip-status') {
      plan.skippedByStatus.push(row);
      continue;
    }
    const key = `${row.chapter}/${row.module_id}`;
    if (!mtCache.has(key)) {
      mtCache.set(key, readNewMt(booksDir, snapshot.book, row.chapter, row.module_id));
    }
    const mt = mtCache.get(key);
    if (mt === null) {
      if (!plan.missingModules.includes(row.module_id)) plan.missingModules.push(row.module_id);
      plan.unmatched.push(row);
      continue;
    }
    if (!mt.has(row.segment_id)) {
      plan.unmatched.push(row);
      continue;
    }
    const newMt = mt.get(row.segment_id);
    // saveSegmentEdit treats edited === original as a withdraw and writes no
    // row. After a re-MT that is a real and CORRECT outcome — the new draft
    // already says what the editor wrote — but it must be counted, or the
    // totals would not reconcile and the gap would look like a loss.
    if (newMt === row.edited_content) {
      plan.converged.push(row);
      continue;
    }
    const flags = detectRetiredMarkers(row.edited_content);
    plan.restore.push({
      row,
      newMt,
      flags,
      editorNote: composeEditorNote({
        flags,
        oldMt: row.context?.mtAtSnapshot || row.original_content,
        editorNote: row.editor_note,
        reviewerNote: row.reviewer_note,
      }),
    });
  }

  plan.reconciliation = reconcile({
    total: snapshot.edits.length,
    restored: plan.restore.length,
    converged: plan.converged.length,
    skippedByStatus: plan.skippedByStatus.length,
    unmatched: plan.unmatched.length,
  });
  return plan;
}

export function formatReport(plan) {
  const lines = [];
  lines.push('=== C16 segment-edit re-attach ===');
  lines.push(`restored          : ${plan.restore.length}`);
  lines.push(`converged         : ${plan.converged.length}  (new MT already matched the edit)`);
  lines.push(`skipped by status : ${plan.skippedByStatus.length}  (rejected / superseded)`);
  lines.push(`unmatched         : ${plan.unmatched.length}`);
  if (plan.unmatched.length) {
    lines.push('', '--- UNMATCHED (place these by hand) ---');
    for (const r of plan.unmatched) {
      lines.push(`  ${r.module_id}  ${r.segment_id}`);
      lines.push(`    EN : ${r.context?.en || '(no EN captured)'}`);
      lines.push(`    IS : ${r.edited_content}`);
    }
  }
  const flagged = plan.restore.filter((r) => r.flags.length);
  if (flagged.length) {
    lines.push('', '--- FLAGGED: retired markers, editor must fix during review ---');
    for (const r of flagged) lines.push(`  ${r.row.segment_id}  [${r.flags.join(', ')}]`);
  }
  if (plan.missingModules.length) {
    lines.push('', `FATAL: modules absent from the new extraction: ${plan.missingModules.join(', ')}`);
  }
  lines.push('', plan.reconciliation.message);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--snapshot');
  const snapshotPath = i >= 0 ? argv[i + 1] : null;
  if (!snapshotPath) {
    console.error('Usage: node scripts/reattach-segment-edits.js --snapshot <path> [--db]');
    process.exit(1);
  }
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const plan = planReattach({ snapshot, booksDir: path.join(REPO_ROOT, 'books') });
  console.log(formatReport(plan));

  if (plan.missingModules.length) process.exit(2);
  if (!plan.reconciliation.ok) process.exit(3);
  if (!argv.includes('--db')) {
    console.log('\nDRY RUN — nothing written. Re-run with --db to apply.');
    process.exit(plan.unmatched.length ? 1 : 0);
  }
  console.log('\n--db given but the write path lands in Task 4.');
  process.exit(plan.unmatched.length ? 1 : 0);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/__tests__/reattachSegmentEdits.test.mjs`
Expected: PASS, 8 tests

- [ ] **Step 5: Mutation-check the report pin**

Temporarily delete the `if (plan.unmatched.length) { ... }` block inside `formatReport`, re-run the suite, and confirm **`formatReport > names every unmatched segment id`** is the test that goes red. Restore the block.

This proves the pin asserts the reporting path *fires*, rather than passing vacuously because no row was written.

- [ ] **Step 6: Commit**

```bash
git add scripts/reattach-segment-edits.js scripts/__tests__/reattachSegmentEdits.test.mjs
git commit -m "feat(c16): re-attach planning, classification and report (dry run)

Exact (module_id, segment_id) matching with no fallback. Buckets every
snapshot row into restore/converged/skipped-by-status/unmatched and fails
if they do not sum to the total. A whole missing module is fatal (exit 2),
not a pile of unmatched rows — that means re-extraction failed.

Mutation-checked: removing the unmatched block turns the report pin red."
```

---

### Task 4: The `--db` write path

**Files:**
- Modify: `scripts/reattach-segment-edits.js` (replace the Task-3 `--db` stub)
- Test: `scripts/__tests__/reattachSegmentEditsWrite.test.mjs`

**Interfaces:**
- Consumes: `planReattach` from Task 3.
- Produces: `applyReattach({ plan, saveSegmentEdit }) => { written: number, reverted: number }`. `saveSegmentEdit` is injected so the test can use `segmentEditorService._setTestDb`.

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/reattachSegmentEditsWrite.test.mjs`:

```javascript
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

let tmp, db, booksDir, service;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c16-write-'));
  booksDir = path.join(tmp, 'books');
  const mtDir = path.join(booksDir, 'testbook', '02-mt-output', 'ch01');
  fs.mkdirSync(mtDir, { recursive: true });
  fs.writeFileSync(
    path.join(mtDir, 'm001-segments.is.md'),
    '<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n'
  );
  db = new Database(path.join(tmp, 'test.db'));
  createSegmentEditsSchema(db);
  service = require(path.join(REPO_ROOT, 'server', 'services', 'segmentEditorService.js'));
  service._setTestDb(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const snapshot = {
  schema: 1, book: 'testbook', modules: ['m001'],
  edits: [{
    id: 1, book: 'testbook', chapter: 1, module_id: 'm001',
    segment_id: 'm001:para:fs-id1', original_content: 'gamalt',
    edited_content: 'leiðrétt', editor_id: 'u1', editor_username: 'Editor',
    status: 'approved', category: null, editor_note: null, reviewer_note: null,
    context: { en: 'English one', mtAtSnapshot: 'gamalt' },
  }],
};

describe('applyReattach', () => {
  it('writes the restored edit as PENDING', async () => {
    const { planReattach, applyReattach } = await import('../reattach-segment-edits.js');
    const plan = planReattach({ snapshot, booksDir });
    applyReattach({ plan, saveSegmentEdit: service.saveSegmentEdit });
    const row = db.prepare('SELECT * FROM segment_edits').get();
    expect(row.status).toBe('pending');
    expect(row.edited_content).toBe('leiðrétt');
  });

  it('sets original_content to the NEW MT so the editor diff is meaningful', async () => {
    const { planReattach, applyReattach } = await import('../reattach-segment-edits.js');
    applyReattach({
      plan: planReattach({ snapshot, booksDir }),
      saveSegmentEdit: service.saveSegmentEdit,
    });
    expect(db.prepare('SELECT original_content c FROM segment_edits').get().c).toBe('ný vélþýðing');
  });

  it('preserves the original editor attribution', async () => {
    const { planReattach, applyReattach } = await import('../reattach-segment-edits.js');
    applyReattach({
      plan: planReattach({ snapshot, booksDir }),
      saveSegmentEdit: service.saveSegmentEdit,
    });
    const row = db.prepare('SELECT editor_id, editor_username FROM segment_edits').get();
    expect(row.editor_id).toBe('u1');
    expect(row.editor_username).toBe('Editor');
  });

  it('carries the composed note, old MT included', async () => {
    const { planReattach, applyReattach } = await import('../reattach-segment-edits.js');
    applyReattach({
      plan: planReattach({ snapshot, booksDir }),
      saveSegmentEdit: service.saveSegmentEdit,
    });
    expect(db.prepare('SELECT editor_note n FROM segment_edits').get().n).toContain('gamalt');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/__tests__/reattachSegmentEditsWrite.test.mjs`
Expected: FAIL — `applyReattach is not a function`

- [ ] **Step 3: Write the implementation**

In `scripts/reattach-segment-edits.js`, add after `formatReport`:

```javascript
/**
 * Write the plan's restorable edits as PENDING rows.
 *
 * Goes through saveSegmentEdit rather than a raw INSERT on purpose: that path
 * re-establishes the MT edit-lock on a module's first row (which matters,
 * because the locks were cleared to permit the re-MT) and carries the
 * supersede and acceptance invariants a parallel INSERT would have to
 * reimplement and keep in sync. One real code path.
 *
 * @param {{plan: object, saveSegmentEdit: Function}} args
 */
export function applyReattach({ plan, saveSegmentEdit }) {
  let written = 0;
  let reverted = 0;
  for (const item of plan.restore) {
    const { row, newMt, editorNote } = item;
    const res = saveSegmentEdit({
      book: row.book,
      chapter: row.chapter,
      moduleId: row.module_id,
      segmentId: row.segment_id,
      originalContent: newMt,
      editedContent: row.edited_content,
      category: row.category,
      editorNote,
      editorId: row.editor_id,
      editorUsername: row.editor_username,
    });
    if (res && res.reverted) reverted += 1;
    else written += 1;
  }
  return { written, reverted };
}
```

Then replace the Task-3 CLI stub:

```javascript
  console.log('\n--db given but the write path lands in Task 4.');
  process.exit(plan.unmatched.length ? 1 : 0);
```

with:

```javascript
  const { saveSegmentEdit } = require(
    path.join(REPO_ROOT, 'server', 'services', 'segmentEditorService.js')
  );
  const res = applyReattach({ plan, saveSegmentEdit });
  console.log(`\nWrote ${res.written} pending edits (${res.reverted} withdrew as identical).`);
  process.exit(plan.unmatched.length ? 1 : 0);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/__tests__/reattachSegmentEditsWrite.test.mjs`
Expected: PASS, 4 tests

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all files pass, with the new tests included

- [ ] **Step 6: Commit**

```bash
git add scripts/reattach-segment-edits.js scripts/__tests__/reattachSegmentEditsWrite.test.mjs
git commit -m "feat(c16): --db write path via saveSegmentEdit

Restores as pending through the real write path, so the MT edit-lock is
re-established and the supersede/acceptance invariants hold. original_content
is the NEW MT text, which is what makes the editor's diff view meaningful.
Attribution survives the status reset."
```

---

### Task 5: Migration runbook

The scripts are two steps of a longer sequence whose ordering constraints are the dangerous part. Spec §4, §5 and §12 exist as prose; this turns them into a checklist someone follows at 9pm.

**Files:**
- Create: `docs/runbooks/2026-07-29-c16-clean-break.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/2026-07-29-c16-clean-break.md`:

````markdown
# C16 clean break — migration runbook

**Spec:** [`docs/superpowers/specs/2026-07-29-segment-edit-reattach-design.md`](../superpowers/specs/2026-07-29-segment-edit-reattach-design.md)
**Register:** C16 (P1) · **Scripts:** `scripts/export-segment-edits.js`, `scripts/reattach-segment-edits.js`

⚠️ Steps are ordered. Do not reorder. Each gate is verifiable — verify it, do not assume it.

## Gate 0 — preconditions (all four, before anything else)

- [ ] **Off-box DB backup (A2) exists AND a restore has been tested.** After the re-MT the
      snapshot is the only representation of the editorial work outside a gitignored SQLite
      file on one host. This is a hard gate, not a recommendation.
- [ ] **Editorial server stopped.** No concurrent `segment_edits` writes; no reader can see a
      half-written `02-mt-output`. Confirm the process is down, not merely idle.
- [ ] **`git-backup.sh` cron paused on prod.** It commits `books/` every 2h while the file work
      happens on dev; left running it commits a half-migrated tree.
- [ ] **Fresh `sessions.db` copy taken with the server stopped.** Use
      `sqlite3 sessions.db "VACUUM INTO '<dest>'"` — the DB is in WAL mode and a plain `cp` can
      omit committed data.

## Step 1 — snapshot the editorial state (prod, read-only)

```bash
node scripts/export-segment-edits.js \
  --book efnafraedi-2e \
  --modules m68663,m68664,m68699,m68700 \
  --out /path/off-box/c16-snapshot.json
```

- [ ] Row count recorded here: ______
- [ ] ⚠️ **If it is much larger than 62, stop and re-size the review pass.** 62 counts only
      *applied* edits visible on disk; the DB may hold pending/discuss rows that never reached a
      faithful file. The export is the authority.
- [ ] Snapshot copied off-box.

## Step 2 — capture the slug map (dev, BEFORE clearing anything)

```bash
find books/*/05-publication -name '*.html' | sort > /path/off-box/published-before.txt
```

- [ ] ⚠️ **This is the only moment the old filenames exist.** After the regeneration they are
      gone, and vefur needs the old→new map for redirects — since its PR #200 ours is the only
      side that still knows them. Do not skip this.

## Step 3 — the clean break (dev)

- [ ] Delete the 4 faithful files (they hold old-extraction content under old ids):
      `books/efnafraedi-2e/03-faithful-translation/ch01/m6866{3,4}-segments.is.md` and
      `.../ch03/m687{99,00}-segments.is.md`
- [ ] Clear the `.locked` markers for those 4 modules — **the irreversible step**, and only
      after Gate 0 and Step 1 are both verified
- [ ] Delete each book's `05-publication/<track>/` before re-rendering (spec §12.1) — do **not**
      render on top; that is what leaves stale files like the chemistry ch10 duplicate
- [ ] Re-extract → re-MT → re-inject → re-render
- [ ] Commit and push

## Step 4 — re-attach (prod)

- [ ] `git pull` on prod. **No restart, no deploy** — content is read from disk per request, and
      a real deploy is A4-gated.
- [ ] Dry run: `node scripts/reattach-segment-edits.js --snapshot <path>`
- [ ] Read the report. Unmatched count: ______ (expect ≤ 6)
- [ ] ⚠️ Exit code 2 means a module is missing from the new extraction — **re-extraction failed**.
      Stop; do not continue.
- [ ] ⚠️ Exit code 3 means the buckets did not reconcile. Stop; rows are unaccounted for.
- [ ] Apply: `node scripts/reattach-segment-edits.js --snapshot <path> --db`
- [ ] Place any unmatched edits by hand, using the EN text in the report.

## Step 5 — finish

- [ ] After the regeneration: `find books/*/05-publication -name '*.html' | sort > published-after.txt`
- [ ] Diff before/after — **that pair is the slug map**; hand it to the vefur redirect work
- [ ] Restart the editorial server
- [ ] Resume the `git-backup.sh` cron
- [ ] Tell the editor: their work is back as **pending** and needs re-confirmation against the
      new machine draft; segments flagged in `editor_note` also need a marker fix
- [ ] Reader delivery is separate and manual — vefur sync, then verify by fetching
      `/content/<book>/chapters/<NN>/<file>.html`, **never** a page URL

## Afterwards

Verify the corpus is clean, then the deletion PR (spec §13): remove the Markdown-era converters
and the `hasApiMarkers` guard from `cnxml-inject.js`, **shipping a corpus tripwire with them** so
clean stays clean.
````

- [ ] **Step 2: Verify every path and command named in the runbook exists**

```bash
ls scripts/export-segment-edits.js scripts/reattach-segment-edits.js
ls books/efnafraedi-2e/03-faithful-translation/ch01/ books/efnafraedi-2e/03-faithful-translation/ch03/
find books -name '*.locked'
```

Expected: both scripts present; 4 faithful files; exactly 4 `.locked` markers.

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/2026-07-29-c16-clean-break.md
git commit -m "docs(c16): migration runbook for the clean break

Turns the spec's preconditions, host split and publication-regeneration
sequencing into an ordered checklist with verifiable gates. Captures the
slug map before clearing 05-publication — the only moment the old
filenames exist."
```

---

## Self-Review

**Spec coverage.** §4 preconditions → Task 5 Gate 0. §5 topology → Task 5 Steps 1–4. §6 export → Task 2. §7 matching, pending restore, status routing, marker flagging, note composition, report → Tasks 1, 3, 4. §8 failure handling → Task 3 (exit codes, reconciliation, fatal missing module) and Task 2 (read-only). §9 testing → Tasks 1–4, with the mutation check at Task 3 Step 5. §12 publication regeneration + slug map → Task 5 Steps 2 and 5. §13 → runbook "Afterwards" only; the deletion PR is out of scope by §3.

**Placeholder scan.** No TBD/TODO. Every code step carries real code. The two blanks in the runbook (`______`) are operator-recorded measurements, not unwritten plan content.

**Type consistency.** `classifyByStatus` returns `'restore'|'skip-status'` in Task 1 and is consumed with those exact values in Task 3. `detectRetiredMarkers` returns the same three class names throughout. `planReattach`'s `restore[]` elements are `{row, newMt, flags, editorNote}` in Task 3 and destructured identically in Task 4. `saveSegmentEdit`'s parameter names match `server/services/segmentEditorService.js` (`moduleId`, `segmentId`, `originalContent`, `editedContent`, `editorId`, `editorUsername`, `editorNote`, `category`).

**Known gap, deliberate.** Task 3's CLI prints a `--db` stub that Task 4 replaces. Tasks 3 and 4 must land in order; the stub never reaches `main` as shipped behaviour because both are in the same PR.
