# Item O — Segment Propagation (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an editor translate a recurring segment once and propagate the translation to its other occurrences book-wide, as pending edits, with a confirm warning and conflict skipping.

**Architecture:** A new `propagationService.js` isolates the first cross-module write. A pure `classifyOccurrence` decides eligible/already-matches/conflict; `createPropagatedEdits` inserts pending `segment_edits` rows for eligible occurrences; `findOccurrences` scans the book's source on demand for exact normalized-EN matches. Two EDITOR routes (preview + propagate) and a post-save confirm dialog in the editor wire it up. No auto-approve, no auto-publish.

**Tech Stack:** Node.js, better-sqlite3, Vitest (in-memory DB), Playwright E2E.

**Design:** [`2026-06-23-item-o-segment-propagation-design.md`](2026-06-23-item-o-segment-propagation-design.md)

## Global Constraints

- All user-facing copy **Icelandic**. Exact strings given in tasks.
- Propagated edits are **pending** (normal four-eyes); never auto-approved or auto-published. Each still publishes per-module via "Vista + Birta".
- **Skip + report** conflicts: only create edits where the target has no differing pending/applied edit and its current text differs from the propagated text.
- **Match = exact normalized EN** (`concordanceService.normalizeEn`, which lowercases + strips markers — already case/Unicode-robust). Whole book, including untranslated occurrences. On-demand source scan; no new standing index.
- New cross-module write lives ONLY in `propagationService`; do not widen `segmentEditorService`.
- No schema change, no new dependencies.
- Branch: `feature/item-o-segment-propagation` (create off `main`).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `server/services/propagationService.js` | `classifyOccurrence`, `createPropagatedEdits`, `findOccurrences`, `getDb`/`_setTestDb`. | **Create** |
| `server/__tests__/propagationService.test.js` | Unit tests (classify + createPropagatedEdits via in-memory DB). | **Create** |
| `server/routes/segment-editor.js` | `GET …/propagation-preview`, `POST …/propagate`. | Modify |
| `server/public/js/segment-editor.js` | Post-save propagation dialog + POST. | Modify |
| `server/e2e/segment-editor.spec.js` | E2E: preview lists occurrences; propagate creates pending edits cross-module. | Modify |

---

## Task 1: `classifyOccurrence` (pure decision)

**Files:**
- Create: `server/services/propagationService.js`
- Test: `server/__tests__/propagationService.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `classifyOccurrence(propagatedText: string, occ: { currentIs: string, existingEdit: {edited_content: string, status: string}|null }): 'eligible'|'already-matches'|'conflict'`.

- [ ] **Step 1: Write the failing tests**

Create `server/__tests__/propagationService.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const svc = require('../services/propagationService');

describe('classifyOccurrence', () => {
  const P = 'Sýra og basi'; // propagated text

  it('eligible: no edit, current text differs', () => {
    expect(svc.classifyOccurrence(P, { currentIs: '', existingEdit: null })).toBe('eligible');
    expect(svc.classifyOccurrence(P, { currentIs: 'eitthvað annað', existingEdit: null })).toBe('eligible');
  });

  it('already-matches: no edit, current text equals propagated', () => {
    expect(svc.classifyOccurrence(P, { currentIs: P, existingEdit: null })).toBe('already-matches');
  });

  it('already-matches: existing edit equals propagated', () => {
    expect(svc.classifyOccurrence(P, { currentIs: 'x', existingEdit: { edited_content: P, status: 'pending' } })).toBe('already-matches');
  });

  it('conflict: existing edit differs (pending)', () => {
    expect(svc.classifyOccurrence(P, { currentIs: 'x', existingEdit: { edited_content: 'önnur þýðing', status: 'pending' } })).toBe('conflict');
  });

  it('conflict: existing edit differs (applied)', () => {
    expect(svc.classifyOccurrence(P, { currentIs: 'x', existingEdit: { edited_content: 'önnur', status: 'applied' } })).toBe('conflict');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/propagationService.test.js -t "classifyOccurrence"`
Expected: FAIL — `Cannot find module '../services/propagationService'`.

- [ ] **Step 3: Create the service skeleton + `classifyOccurrence`**

Create `server/services/propagationService.js`:

```js
/**
 * Propagation service (item O).
 *
 * Lets an editor's translation of a recurring segment be copied to its other
 * book-wide occurrences as PENDING edits. This is the only cross-module write
 * in the editor stack; it is intentionally isolated here (segmentEditorService
 * stays single-module). No auto-approve, no auto-publish.
 */

const path = require('path');
const Database = require('better-sqlite3');
const segmentParser = require('./segmentParser');
const concordance = require('./concordanceService');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}
function _setTestDb(testDb) {
  db = testDb;
}

/**
 * Decide what to do with one occurrence given the editor's propagated text.
 * Pure — no DB/file access.
 * @returns {'eligible'|'already-matches'|'conflict'}
 */
function classifyOccurrence(propagatedText, occ) {
  const existing = occ.existingEdit;
  if (existing) {
    return existing.edited_content === propagatedText ? 'already-matches' : 'conflict';
  }
  return occ.currentIs === propagatedText ? 'already-matches' : 'eligible';
}

module.exports = { getDb, _setTestDb, classifyOccurrence };
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/__tests__/propagationService.test.js -t "classifyOccurrence"`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add server/services/propagationService.js server/__tests__/propagationService.test.js
git commit -m "feat(propagation): classifyOccurrence decision (item O task 1)"
```

---

## Task 2: `createPropagatedEdits` (cross-module write)

**Files:**
- Modify: `server/services/propagationService.js`
- Test: `server/__tests__/propagationService.test.js`

**Interfaces:**
- Consumes: `classifyOccurrence` (Task 1), the `segment_edits` table.
- Produces: `createPropagatedEdits(db, { book, editorId, editorUsername, propagatedText, category, note, occurrences })` where `occurrences: [{ chapter, moduleId, segmentId, currentIs }]`. Re-queries each occurrence's latest non-rejected edit, classifies, inserts a `pending` `segment_edit` for each eligible one. Returns `{ created: [{moduleId, segmentId}], skipped: [{moduleId, segmentId, reason}] }` (reason = 'already-matches' | 'conflict').

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/propagationService.test.js`:

```js
describe('createPropagatedEdits', () => {
  const Database = require('better-sqlite3');

  function freshDb() {
    const d = new Database(':memory:');
    d.exec(`
      CREATE TABLE segment_edits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL, chapter INTEGER NOT NULL, module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL, original_content TEXT NOT NULL, edited_content TEXT NOT NULL,
        category TEXT, editor_note TEXT, status TEXT NOT NULL DEFAULT 'pending',
        editor_id TEXT NOT NULL, editor_username TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, reviewed_at DATETIME, applied_at DATETIME
      );`);
    return d;
  }

  const base = {
    book: 'efnafraedi-2e', editorId: '42', editorUsername: 'tester',
    propagatedText: 'Sýra og basi', category: 'terminology', note: 'Sjálfvirk fjölgun',
  };

  it('creates pending edits for eligible occurrences, skips already-matches', () => {
    const d = freshDb();
    const occurrences = [
      { chapter: 1, moduleId: 'm001', segmentId: 'm001:para:a', currentIs: '' },               // eligible
      { chapter: 1, moduleId: 'm002', segmentId: 'm002:para:b', currentIs: 'Sýra og basi' },   // already-matches
    ];
    const res = svc.createPropagatedEdits(d, { ...base, occurrences });
    expect(res.created).toHaveLength(1);
    expect(res.created[0].moduleId).toBe('m001');
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0].reason).toBe('already-matches');

    const row = d.prepare(`SELECT * FROM segment_edits WHERE module_id = 'm001'`).get();
    expect(row.edited_content).toBe('Sýra og basi');
    expect(row.status).toBe('pending');
    expect(row.editor_id).toBe('42');
  });

  it('skips a target with a conflicting pending edit', () => {
    const d = freshDb();
    d.prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, editor_id, editor_username)
       VALUES (?, 1, 'm003', 'm003:para:c', 'orig', 'önnur þýðing', '99', 'someone')`
    ).run(base.book);
    const occurrences = [{ chapter: 1, moduleId: 'm003', segmentId: 'm003:para:c', currentIs: 'orig' }];
    const res = svc.createPropagatedEdits(d, { ...base, occurrences });
    expect(res.created).toHaveLength(0);
    expect(res.skipped[0].reason).toBe('conflict');
    // did not overwrite the other editor's edit
    const rows = d.prepare(`SELECT COUNT(*) c FROM segment_edits WHERE module_id = 'm003'`).get();
    expect(rows.c).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/propagationService.test.js -t "createPropagatedEdits"`
Expected: FAIL — `svc.createPropagatedEdits is not a function`.

- [ ] **Step 3: Implement `createPropagatedEdits`**

In `server/services/propagationService.js`, add before `module.exports` and export it:

```js
/**
 * For each occurrence, re-check eligibility against the latest non-rejected edit
 * and (if eligible) insert a pending segment_edit. Cross-module write.
 * @returns {{ created: Array, skipped: Array }}
 */
function createPropagatedEdits(conn, { book, editorId, editorUsername, propagatedText, category, note, occurrences }) {
  const findEdit = conn.prepare(
    `SELECT edited_content, status FROM segment_edits
     WHERE book = ? AND module_id = ? AND segment_id = ? AND status != 'rejected'
     ORDER BY id DESC LIMIT 1`
  );
  const insert = conn.prepare(
    `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        category, editor_note, editor_id, editor_username)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const created = [];
  const skipped = [];
  const tx = conn.transaction(() => {
    for (const occ of occurrences) {
      const existingEdit = findEdit.get(book, occ.moduleId, occ.segmentId) || null;
      const verdict = classifyOccurrence(propagatedText, { currentIs: occ.currentIs, existingEdit });
      if (verdict !== 'eligible') {
        skipped.push({ moduleId: occ.moduleId, segmentId: occ.segmentId, reason: verdict });
        continue;
      }
      insert.run(
        book, occ.chapter, occ.moduleId, occ.segmentId,
        occ.currentIs || '', propagatedText,
        category || null, note || null, String(editorId), editorUsername
      );
      created.push({ moduleId: occ.moduleId, segmentId: occ.segmentId });
    }
  });
  tx();
  return { created, skipped };
}
```
Add `createPropagatedEdits` to `module.exports`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/__tests__/propagationService.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add server/services/propagationService.js server/__tests__/propagationService.test.js
git commit -m "feat(propagation): createPropagatedEdits cross-module write (item O task 2)"
```

---

## Task 3: `findOccurrences` + preview/propagate routes

**Files:**
- Modify: `server/services/propagationService.js`
- Modify: `server/routes/segment-editor.js`
- Test: `server/e2e/segment-editor.spec.js`

**Interfaces:**
- Consumes: `segmentParser.listChapters(book)`, `segmentParser.listChapterModules(book, chapter)`, `segmentParser.loadModuleForEditing(book, chapter, moduleId)`, `concordance.normalizeEn(text)`, `createPropagatedEdits`, `classifyOccurrence`.
- Produces:
  - `findOccurrences(book, enNorm, { excludeModuleId, excludeSegmentId })` → `[{ chapter, moduleId, segmentId, en, currentIs, existingEdit }]`.
  - `GET /api/segment-editor/:book/:chapter/:moduleId/propagation-preview?segmentId=` → `{ enNorm, eligible: [...], skipped: [...] }`.
  - `POST /api/segment-editor/:book/:chapter/:moduleId/propagate` body `{ segmentId, editedContent, category, note }` → `{ created, skipped }`.

- [ ] **Step 1: Implement `findOccurrences`**

In `server/services/propagationService.js`, add and export:

```js
/**
 * Find all segments in the book whose source EN normalizes to enNorm
 * (excluding the source segment). On-demand scan — call only on a deliberate
 * propagation action.
 */
function findOccurrences(book, enNorm, { excludeModuleId, excludeSegmentId } = {}) {
  const conn = getDb();
  const findEdit = conn.prepare(
    `SELECT edited_content, status FROM segment_edits
     WHERE book = ? AND module_id = ? AND segment_id = ? AND status != 'rejected'
     ORDER BY id DESC LIMIT 1`
  );
  const out = [];
  for (const chapter of segmentParser.listChapters(book)) {
    for (const mod of segmentParser.listChapterModules(book, chapter)) {
      let data;
      try {
        data = segmentParser.loadModuleForEditing(book, chapter, mod.moduleId);
      } catch {
        continue;
      }
      for (const seg of data.segments) {
        if (concordance.normalizeEn(seg.en) !== enNorm) continue;
        if (mod.moduleId === excludeModuleId && seg.segmentId === excludeSegmentId) continue;
        out.push({
          chapter,
          moduleId: mod.moduleId,
          segmentId: seg.segmentId,
          en: seg.en,
          currentIs: seg.is || '',
          existingEdit: findEdit.get(book, mod.moduleId, seg.segmentId) || null,
        });
      }
    }
  }
  return out;
}
```
Add `findOccurrences` to `module.exports`.

- [ ] **Step 2: Add the routes**

In `server/routes/segment-editor.js`, near the other `/:book/:chapter/:moduleId/*` routes (after the `repetitions` route ~:819), require the service at the top (`const propagation = require('../services/propagationService');`) and add:

```js
// GET propagation preview — occurrences of this segment's EN across the book.
router.get(
  '/:book/:chapter/:moduleId/propagation-preview',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const { segmentId } = req.query;
      if (!segmentId) return res.status(400).json({ error: 'segmentId is required' });
      const data = segmentParser.loadModuleForEditing(req.params.book, req.chapterNum, req.params.moduleId);
      const seg = data.segments.find((s) => s.segmentId === segmentId);
      if (!seg) return res.status(404).json({ error: 'segment not found' });
      const enNorm = concordance.normalizeEn(seg.en);
      const propagatedText = seg.is || '';
      const occ = propagation.findOccurrences(req.params.book, enNorm, {
        excludeModuleId: req.params.moduleId,
        excludeSegmentId: segmentId,
      });
      const eligible = [];
      const skipped = [];
      for (const o of occ) {
        const verdict = propagation.classifyOccurrence(propagatedText, o);
        (verdict === 'eligible' ? eligible : skipped).push({
          moduleId: o.moduleId,
          chapter: o.chapter,
          segmentId: o.segmentId,
          reason: verdict === 'eligible' ? undefined : verdict,
        });
      }
      res.json({ enNorm, eligible, skipped });
    } catch (err) {
      log.error({ err }, 'propagation-preview failed');
      res.status(500).json({ error: err.message });
    }
  }
);

// POST propagate — create pending edits on eligible occurrences.
router.post(
  '/:book/:chapter/:moduleId/propagate',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  requireBookAccess(),
  validateModule,
  (req, res) => {
    try {
      const { segmentId, editedContent, category, note } = req.body || {};
      if (!segmentId || !editedContent) {
        return res.status(400).json({ error: 'segmentId and editedContent are required' });
      }
      const enNorm = concordance.normalizeEn(
        segmentParser
          .loadModuleForEditing(req.params.book, req.chapterNum, req.params.moduleId)
          .segments.find((s) => s.segmentId === segmentId)?.en || ''
      );
      if (!enNorm) return res.status(404).json({ error: 'segment not found' });
      const occurrences = propagation.findOccurrences(req.params.book, enNorm, {
        excludeModuleId: req.params.moduleId,
        excludeSegmentId: segmentId,
      });
      const result = propagation.createPropagatedEdits(propagation.getDb(), {
        book: req.params.book,
        editorId: req.user.id,
        editorUsername: req.user.username,
        propagatedText: editedContent,
        category,
        note: note || 'Sjálfvirk fjölgun',
        occurrences,
      });
      res.json(result);
    } catch (err) {
      log.error({ err }, 'propagate failed');
      res.status(500).json({ error: err.message });
    }
  }
);
```
Confirm `concordance` is required in the route file (it is, for repetitions); if not, add `const concordance = require('../services/concordanceService');`.

- [ ] **Step 3: Write the E2E test**

Add to `server/e2e/segment-editor.spec.js` a new describe block. Use a recurring EN string known to appear in multiple efnafraedi-2e modules (the objectives intro "By the end of this section"). First confirm a real recurring segment id with:
`grep -rl "By the end of this section" books/efnafraedi-2e/02-for-mt/` — pick a module/segment for the test, or assert generically that preview returns ≥1 occurrence for a segment that recurs.

```js
test.describe('O segment propagation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('preview returns occurrences for a recurring objectives intro', async ({ page }) => {
    // m68664 ch01 segment auto-2 is the "By the end of this section…" abstract,
    // which recurs across chapter intro modules.
    const res = await page.request.get(
      '/api/segment-editor/efnafraedi-2e/1/m68664/propagation-preview?segmentId=' +
        encodeURIComponent('m68664:abstract:auto-2')
    );
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('eligible');
    expect(body).toHaveProperty('skipped');
    expect(Array.isArray(body.eligible)).toBe(true);
    // the EN recurs, so at least one occurrence (eligible or skipped) exists
    expect(body.eligible.length + body.skipped.length).toBeGreaterThan(0);
  });
});
```
(Verify the chosen segmentId exists and its EN recurs before finalizing — adjust the id from the grep if needed. If no exact-recurring abstract exists in ch01, pick a segment/EN that does and update the test.)

- [ ] **Step 4: Run RED then implement-already-done, verify GREEN**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js -g "segment propagation" --reporter=line`
Expected: with the routes added, PASS. (If RED is wanted first, run before Step 2.)

- [ ] **Step 5: Run the full server unit suite + the spec**

Run: `npm test` → green (propagationService unit tests included).
Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js --reporter=line` → green.
Run: `npx eslint server/services/propagationService.js server/routes/segment-editor.js` → clean.

- [ ] **Step 6: Commit**

```bash
git add server/services/propagationService.js server/routes/segment-editor.js server/e2e/segment-editor.spec.js
git commit -m "feat(propagation): findOccurrences + preview/propagate routes (item O task 3)"
```

---

## Task 4: Editor "Beita víðar" propagation button

**Files:**
- Modify: `server/public/js/segment-editor.js` (`renderSegmentRow` edit-controls ~:877; new `propagateSegment` fn; `window` expose ~:2472)
- Modify: `server/public/js/ui-strings.js` (propagation strings)
- Test: `server/e2e/segment-editor.spec.js`

**Interfaces:**
- Consumes: the preview + propagate routes (Task 3); `saveEdit` (to save first).
- Produces: a manual "Beita víðar" button in the edit panel; on click → save (if dirty) → preview → confirm dialog → propagate → toast. **Not** automatic per-save (avoids the O(book) scan on every save).

- [ ] **Step 1: Add UI strings**

In `server/public/js/ui-strings.js`, in the `segmentEditor` block, add:

```js
    propagateButton: 'Beita víðar',
    propagateTooltip: 'Beita þessari þýðingu á aðra eins búta í bókinni',
    propagateNone: 'Þessi texti finnst hvergi annars staðar.',
    propagateConfirm: (n) => `Þessi texti birtist á ${n} öðrum stað/stöðum. Beita þýðingunni þar líka?`,
    propagateResult: (created, skipped) =>
      `Fjölgað á ${created} stað/staði` + (skipped ? `, sleppt ${skipped} (þegar breytt)` : ''),
```

- [ ] **Step 2: Write the failing E2E test (drives the API the button uses)**

Add to the `O segment propagation` describe block in `server/e2e/segment-editor.spec.js`:

```js
  test('propagate endpoint creates pending edits on other occurrences', async ({ page }) => {
    const preview = await page.request.get(
      '/api/segment-editor/efnafraedi-2e/1/m68664/propagation-preview?segmentId=' +
        encodeURIComponent('m68664:abstract:auto-2')
    );
    const { eligible } = await preview.json();
    test.skip(eligible.length === 0, 'no eligible occurrences in this data state');

    const res = await page.request.post('/api/segment-editor/efnafraedi-2e/1/m68664/propagate', {
      data: {
        segmentId: 'm68664:abstract:auto-2',
        editedContent: 'Þegar þú hefur lokið þessum hluta [e2e-propagation-test]',
        category: 'readability',
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.created.length).toBeGreaterThan(0);
  });
```
**Note:** this test writes edits into real content's `sessions.db` (provenance-marked `[e2e-propagation-test]`); revert in Step 5 (the project's existing E2E-mutates-real-data pattern). It also exercises the exact endpoints the button calls.

- [ ] **Step 3: Add the button to the edit controls**

In `server/public/js/segment-editor.js` `renderSegmentRow`, in the `.edit-controls` block (after the "Vista" button, before "Hætta við" ~:877), add:

```js
                <button class="btn btn-sm btn-secondary btn-propagate" onclick="propagateSegment('${seg.segmentId}')" title="${UI.segmentEditor.propagateTooltip}">${UI.segmentEditor.propagateButton}</button>
```

- [ ] **Step 4: Add `propagateSegment` and expose it**

Add near `saveEdit` in `server/public/js/segment-editor.js`:

```js
  /**
   * Save the segment (if needed), then offer to propagate the translation to
   * its other book-wide occurrences. Manual — the O(book) scan runs only here,
   * never on an ordinary save. (Item O)
   */
  async function propagateSegment(segmentId) {
    if (!moduleData?.segments) return;
    // Ensure the current edit is persisted first so the propagated text is the
    // saved text. saveEdit reloads the module on success.
    if (dirtyEdits.has(segmentId)) {
      await saveEdit(segmentId);
    }
    const editedContent = document.getElementById('textarea-' + cssId(segmentId))?.value;
    const category = document.getElementById('cat-' + cssId(segmentId))?.value;
    if (!editedContent) return;
    try {
      const pv = await fetchJson(
        `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/propagation-preview?segmentId=${encodeURIComponent(segmentId)}`
      );
      if (!pv || !pv.eligible || pv.eligible.length === 0) {
        saveRetry.showToast(UI.segmentEditor.propagateNone, 'info');
        return;
      }
      if (!confirm(UI.segmentEditor.propagateConfirm(pv.eligible.length))) return;
      const pr = await fetchJson(
        `${API_BASE}/${currentBook}/${currentChapter}/${currentModuleId}/propagate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ segmentId, editedContent, category: category || undefined }),
        }
      );
      saveRetry.showToast(
        UI.segmentEditor.propagateResult(pr.created.length, pr.skipped.length),
        'success'
      );
    } catch (err) {
      saveRetry.showToast('Villa við fjölgun: ' + err.message, 'error');
    }
  }
```
Expose it near the other `window.*` assignments (~:2472): `window.propagateSegment = propagateSegment;`

- [ ] **Step 5: Run the E2E + full spec, revert content, lint**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js -g "segment propagation" --reporter=line` → PASS.
Run: `CI=1 npx playwright test segment-editor.spec.js --reporter=line` → green.
Run: `git checkout -- books/` (discard E2E content writes).
Run: `npx eslint server/public/js/segment-editor.js server/public/js/ui-strings.js` → clean.

- [ ] **Step 6: Commit**

```bash
git add server/public/js/segment-editor.js server/public/js/ui-strings.js server/e2e/segment-editor.spec.js
git commit -m "feat(editor): Beita víðar propagation button (item O task 4)"
```

---

## Final verification

- [ ] `npm test` → green (incl. `propagationService.test.js`).
- [ ] `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js --reporter=line` → green.
- [ ] `npx eslint server/services/propagationService.js server/routes/segment-editor.js server/public/js/segment-editor.js server/public/js/ui-strings.js` → clean.
- [ ] Manual smoke (`npm run server:dev`): edit a recurring objectives-intro segment, Vista → dialog offers propagation with a count → confirm → toast reports created/skipped → other modules show a pending edit on that segment (not auto-approved/published).
- [ ] Confirm no `books/` content changes are committed (E2E writes reverted).

## Self-review notes (coverage vs. spec)

- Spec "MVP: pending edits + confirm, no auto-approve/publish" → Tasks 2 (pending insert) + 4 (confirm dialog). ✅
- Spec "skip + report conflicts" → `classifyOccurrence` (Task 1) + `createPropagatedEdits` skip list (Task 2). ✅
- Spec "whole-book, incl. untranslated, on-demand scan" → `findOccurrences` (Task 3) via listChapters/listChapterModules/loadModuleForEditing; matches untranslated (currentIs '' still eligible). ✅
- Spec "cross-module write isolated in propagationService" → all writes in Task 2's service fn; segmentEditorService untouched. ✅
- Spec "match = normalizeEn (case/Unicode-robust)" → Task 3. ✅
- Spec out-of-scope (auto-approve, fuzzy, cross-book, standing index) → none added. ✅
