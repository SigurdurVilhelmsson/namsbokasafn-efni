# C1c — Appendix read-path stragglers + U3a assign-link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the last read-path appendix stragglers (`books.js /download` + 4 file/import routes, `admin.js:975`, `tm.js:39`) resolve appendices, and fix the all-chapter assignment-notification deep link (`sections.js`).

**Architecture:** Every site adopts the canonical `server/lib/chapterLabel.js` idiom already used across C1a/C1b (`normalizeChapter` for validators, `chapterDir` for on-disk dir names). Where a validator swap alone is a no-op, the shared downstream dir-builder (`chapterFilesService.getChapterDir`) is fixed too. The `sections.js` fix swaps a wrong id (`section_num`) for the right one (`moduleId`) in two notification links.

**Tech Stack:** Node.js 22, Express 5 (CommonJS server modules), better-sqlite3, Vitest. Run all tests from the **repo root** (`npm test`), never from `server/`.

## Global Constraints

- **Canonical form (`server/lib/chapterLabel.js`):** appendices = integer `-1` in memory; `'appendices'` only at on-disk dir names / CLI argv. `normalizeChapter('appendices'|'-1')→-1`; `normalizeChapter('0'|junk|traversal)→null`; `chapterDir(-1)→'appendices'`, `chapterDir(N)→'chNN'`. Convert only through this module.
- **No behavior change for numeric chapters (0..99):** every change is additive at a validator or a dir-build ternary; non-appendix paths must stay byte-identical. Pin byte-identity with an assertion, don't just reason (C1b lesson).
- **Fails-safe:** these are read/report/notification sites; a bug must at worst reject an appendix (status quo), never corrupt data or traverse paths.
- **Path-traversal safety preserved:** `books.js /download` has an F15 guard; `normalizeChapter` returns an integer or `null` (never a traversing string), so it is a safe replacement — keep rejecting `null`.
- **Branch:** `fix/appendices-readpath-stragglers`. Base main `2a990e67` (after C1b #324). Independent of C1d.
- **Commit trailer:** end every commit message with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- **Modify** `server/routes/books.js` — `/download` (`:347`) + 4 file/import route validators (`:218/:253/:281/:532`). *(Tasks 1, 2)*
- **Modify** `server/services/chapterFilesService.js` — `getChapterDir` (`:69-71`) dir-builder. *(Task 2)*
- **Modify** `server/routes/tm.js` — `/api/tm/export` validator + filename (`:39/:55`). *(Task 3)*
- **Modify** `server/routes/admin.js` — `removeChapterAssignment` route (`:975`). *(Task 4)*
- **Modify** `server/routes/sections.js` — two assignment-notification `link:` fields (`:123/:206`). *(Task 4)*
- **Test:** extend `server/__tests__/books-routes.test.js`; new focused tests for tm/admin/sections as needed.

---

## Task 1: `books.js /download` appendix support

**Files:**
- Modify: `server/routes/books.js` (`/download` route: validator `:375-380`, dir-build `:394-395`, zipName `:400`)
- Test: extend `server/__tests__/books-routes.test.js`

**Interfaces:**
- Consumes: `chapterLabel.normalizeChapter` (already imported in `books.js:28` `const { normalizeChapter } = require('../lib/chapterLabel');` — reuse it). Task 1 builds the appendix dir via the `config.chPrefix` ternary, so it does NOT need `chapterDir`.

- [ ] **Step 1: Write the failing test**

Extend `server/__tests__/books-routes.test.js` (reuse its `invoke(h, req)` handler-extraction harness). Point a temp book dir or reuse the fixture idiom so an `02-for-mt/appendices` dir exists. Assert that `GET /:bookId/download?chapter=appendices&type=en-md` resolves the appendix dir (not a 400 "Chapter must be 1–99", not a 404 for `ch-1`), and that a numeric chapter is unchanged. Minimal assertion on the resolved `chapterDirName` path is easiest via a unit slice; if invoking the full handler, assert status is not 400-invalid-chapter for `appendices`.

```js
// pseudo-assertion shape (adapt to the harness):
// appendices resolves the 'appendices' dir, NOT 'ch-1' / 'chappendices'
// and the zip name is `${book}-appendices-en-md.zip`, not `${book}-K-1-en-md.zip`
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- books-routes`
Expected: FAIL — `appendices` hits the `n < 1` 400 or builds `ch-1`.

- [ ] **Step 3: Implement**

In `server/routes/books.js` `/download` route:

Replace the validator (`:375-380`):
```js
// before
if (chapter !== undefined) {
  const n = Number(chapter);
  if (!/^\d+$/.test(String(chapter)) || !Number.isInteger(n) || n < 1 || n > MAX_CHAPTERS) {
    return res.status(400).json({ error: 'Invalid chapter', message: 'Chapter must be 1–99' });
  }
}
// after
let chapterNum = null;
if (chapter !== undefined) {
  chapterNum = normalizeChapter(chapter);
  // accept -1 (appendices); numeric must be 1..MAX_CHAPTERS; reject 0/junk/traversal (null)
  if (chapterNum === null || (chapterNum !== -1 && (chapterNum < 1 || chapterNum > MAX_CHAPTERS))) {
    return res.status(400).json({ error: 'Invalid chapter', message: 'Chapter must be 1–99 or appendices' });
  }
}
```

Replace the dir-build (`:394-395`):
```js
// before
const paddedChapter = chapter ? String(chapter).padStart(2, '0') : null;
const chapterDirName = paddedChapter ? `${config.chPrefix}${paddedChapter}` : null;
// after — appendices dir is 'appendices' for BOTH conventions (md chPrefix='ch', pub chPrefix='')
const chapterDirName =
  chapterNum === null
    ? null
    : chapterNum === -1
      ? 'appendices'
      : `${config.chPrefix}${String(chapterNum).padStart(2, '0')}`;
```

Replace the zipName (`:400`):
```js
// before
zipName = `${bookId}-K${chapter}-${type}.zip`;
// after
zipName = `${bookId}-${chapterNum === -1 ? 'appendices' : `K${chapterNum}`}-${type}.zip`;
```

Then replace the remaining `if (chapter)` truthiness checks (`:399`, `:415`) that gate the chapter branch with `if (chapterNum !== null)` for consistency (the raw `chapter` string `'appendices'`/`'-1'` is truthy, so behavior is unchanged, but `chapterNum !== null` is the correct predicate). Confirm `normalizeChapter` and `chapterDir` (if used) are imported.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- books-routes`
Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add server/routes/books.js server/__tests__/books-routes.test.js
git commit -m "fix(books): /download resolves appendices dir + filename (C1c A1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `books.js` file/import routes + `chapterFilesService.getChapterDir`

**Files:**
- Modify: `server/routes/books.js` (`:218`, `:253`, `:281`, `:532` — `parseInt(chapter,10)` → `normalizeChapter`)
- Modify: `server/services/chapterFilesService.js` (`getChapterDir` `:69-71` — the shared downstream dir-builder)
- Test: extend `server/__tests__/books-routes.test.js` (or a focused `chapterFilesService` test)

**Interfaces:**
- Consumes: `chapterLabel.normalizeChapter` (books.js), `chapterLabel.chapterDir` (chapterFilesService).
- Rationale: the four routes pass `chapterNum` into `chapterFilesService`, whose `getChapterDir` builds `ch${padStart}` → `ch-1` for appendices. A validator swap without fixing `getChapterDir` is a provable no-op (the C1a validator∧handler lesson).

- [ ] **Step 1: Write the failing test**

Add a focused test that `chapterFilesService.getChapterDir(book, -1)` resolves `…/02-for-mt/appendices` (not `…/ch-1`), and a numeric chapter still resolves `…/ch05`. `getChapterDir` is exported.

```js
import { getChapterDir } from '../services/chapterFilesService.js'; // adapt to CJS require in the harness
expect(getChapterDir('efnafraedi-2e', -1)).toMatch(/02-for-mt[/\\]appendices$/);
expect(getChapterDir('efnafraedi-2e', -1)).not.toContain('ch-1');
expect(getChapterDir('efnafraedi-2e', 5)).toMatch(/02-for-mt[/\\]ch05$/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- chapterFilesService`
Expected: FAIL — `getChapterDir(book,-1)` returns `…/ch-1`.

- [ ] **Step 3: Implement**

In `server/services/chapterFilesService.js` (`:69-71`), add `const { chapterDir } = require('../lib/chapterLabel');` near the other requires, then:
```js
// before
function getChapterDir(bookSlug, chapterNum) {
  const paddedChapter = String(chapterNum).padStart(2, '0');
  return path.join(BOOKS_DIR, bookSlug, '02-for-mt', `ch${paddedChapter}`);
}
// after
function getChapterDir(bookSlug, chapterNum) {
  return path.join(BOOKS_DIR, bookSlug, '02-for-mt', chapterDir(chapterNum));
}
```
`chapterDir(-1)='appendices'`, `chapterDir(5)='ch05'` — byte-identical for numeric.

In `server/routes/books.js`, swap the four bare validators (`:218`, `:253`, `:281`, `:532`):
```js
// before (each site)
const chapterNum = parseInt(chapter, 10);
// after (each site)
const chapterNum = normalizeChapter(chapter);
```
Add a guard where a route would otherwise proceed with `chapterNum === null` (junk) — mirror the route's existing error style (400/404). For the file routes that currently trusted `parseInt`, add: `if (chapterNum === null) return res.status(400).json({ error: 'Invalid chapter' });` right after the assignment. (Confirm `normalizeChapter` is imported in books.js.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- chapterFilesService books-routes`
Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add server/routes/books.js server/services/chapterFilesService.js server/__tests__/
git commit -m "fix(books): file/import routes + getChapterDir resolve appendices (C1c A2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `tm.js` `/api/tm/export` appendix support

**Files:**
- Modify: `server/routes/tm.js` (validator `:38-42`, filename `:55`)
- Test: new `server/__tests__/tmExportAppendices.test.js` (router-introspection invoke, like the admin/books route tests)

**Interfaces:**
- Consumes: `chapterLabel.normalizeChapter`. `generateTm(book, { chapter: -1 })` is already appendix-aware (`tools/lib/tm-export.cjs`).

- [ ] **Step 1: Write the failing test**

Assert `GET /api/tm/export?book=<b>&chapter=appendices&format=tmx` is accepted (does not 400 "Chapter must be 1–99"), and — when there is no faithful appendix content — 404s (empty), NOT 400-invalid. Assert the download filename for appendices contains `appendices`, not `-1`. Assert a numeric chapter above `MAX_CHAPTERS` still 400s.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tmExportAppendices`
Expected: FAIL — `appendices` hits the `!/^\d+$/` / `n < 1` 400.

- [ ] **Step 3: Implement**

In `server/routes/tm.js`, replace the validator (`:38-42`):
```js
// before
const n = Number(chapterRaw);
if (!/^\d+$/.test(String(chapterRaw)) || !Number.isInteger(n) || n < 1 || n > MAX_CHAPTERS) {
  return res.status(400).json({ error: 'Invalid chapter', message: 'Chapter must be 1–99' });
}
chapter = n;
// after
const n = normalizeChapter(chapterRaw);
// accept -1 (appendices); numeric must be 1..MAX_CHAPTERS; reject 0/junk (null)
if (n === null || (n !== -1 && (n < 1 || n > MAX_CHAPTERS))) {
  return res.status(400).json({ error: 'Invalid chapter', message: 'Chapter must be 1–99 or appendices' });
}
chapter = n;
```
Replace the filename (`:55`) so the appendix chapter reads `appendices`, not `K-1`:
```js
// before
const fname = `${book}${chapter ? `-K${chapter}` : ''}-tm.${format}`;
// after
const chapterLabelPart = chapter === -1 ? '-appendices' : chapter ? `-K${chapter}` : '';
const fname = `${book}${chapterLabelPart}-tm.${format}`;
```
(Note: `chapter` is now `-1` for appendices, so the old `chapter ?` truthiness still works — `-1` is truthy — but the label must not be `K-1`.) Add the `chapterLabel`/`normalizeChapter` require if absent.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tmExportAppendices`
Expected: PASS.

- [ ] **Step 5: Full suite** — `npm test` → all green.

- [ ] **Step 6: Commit**

```bash
git add server/routes/tm.js server/__tests__/tmExportAppendices.test.js
git commit -m "fix(tm): /api/tm/export accepts appendices + appendices filename (C1c A3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `admin.js:975` unassign + `sections.js` U3a assign-link

**Files:**
- Modify: `server/routes/admin.js` (`removeChapterAssignment` route `:975`)
- Modify: `server/routes/sections.js` (`:123` and `:206` — the `link:` `module=` param)
- Test: extend/add a focused sections test + an admin unassign test

**Interfaces:**
- Consumes: `chapterLabel.normalizeChapter` (admin.js already imports `chapterLabel`, used at `:1070/:1107`).
- U3a: `section.moduleId` (already on the section object from `bookRegistration.getSection`, `moduleId: section.module_id`).

- [ ] **Step 1: Write the failing tests**

(a) admin unassign: `DELETE /users/:id/chapters/:book/:chapter` with `chapter='appendices'` reaches `removeChapterAssignment(userId, book, -1)` (assert the service is called with `-1`, e.g. via a spy), symmetric with the assign route which already uses `normalizeChapter`.
(b) sections U3a: for a section whose `moduleId='m12345'` and `sectionNum='5.1'`, the assignment-notification `link` contains `module=m12345` (the `moduleId`), NOT `module=5.1`. Assert for a NORMAL chapter section (this proves the all-chapter fix), and also for an appendix section (`sectionNum='1'`, `moduleId='m90001'` → `module=m90001`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- sections admin`
Expected: FAIL — the link contains `module=5.1`; unassign passes `NaN` for `appendices`.

- [ ] **Step 3: Implement**

`admin.js:975`:
```js
// before
userService.removeChapterAssignment(userId, book, parseInt(chapter, 10));
// after
userService.removeChapterAssignment(userId, book, chapterLabel.normalizeChapter(chapter));
```

`sections.js` — change ONLY the `module=` query param in the two `link:` fields (`:123` reviewer, `:206` localizer). Leave the `message`/`section`/`description` fields (they legitimately display `sectionNum`):
```js
// before (:123)
link: `/segment-editor?book=${section.bookSlug}&chapter=${section.chapterNum}&module=${section.sectionNum}`,
// after (:123)
link: `/segment-editor?book=${section.bookSlug}&chapter=${section.chapterNum}&module=${section.moduleId}`,
// before (:206)
link: `/localization-editor?book=${section.bookSlug}&chapter=${section.chapterNum}&module=${section.sectionNum}`,
// after (:206)
link: `/localization-editor?book=${section.bookSlug}&chapter=${section.chapterNum}&module=${section.moduleId}`,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- sections admin`
Expected: PASS.

- [ ] **Step 5: Full suite** — `npm test` → all green.

- [ ] **Step 6: Commit**

```bash
git add server/routes/admin.js server/routes/sections.js server/__tests__/
git commit -m "fix(routes): unassign accepts appendices; assign-link uses moduleId not section_num (C1c A2/U3a)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Full-suite gate + docs/register + whole-branch review + PR

- [ ] **Step 1: Full suite from repo root** — `npm test` → all green. Any newly-red existing test is a real regression — fix, don't update.

- [ ] **Step 2: Update the campaign register**

In `docs/plans/2026-07-21-post-item17-followup-campaign.md`, under C1: mark the **C1c read-path stragglers + U3a DELIVERED in PR-3** (books.js /download + file/import routes + getChapterDir + admin.js:975 + tm.js:39 + sections.js assign-link); note U3a fixed a live all-chapter deep-link bug; leave `books.js` R2 note reflecting the now-closed sites. Note U3b (`server/data` inconsistency) still backlog and C1d write-path still open.

- [ ] **Step 3: Commit docs**

```bash
git add docs/plans/2026-07-21-post-item17-followup-campaign.md
git commit -m "docs(campaign): C1c read-path stragglers + U3a delivered (PR-3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Whole-branch adversarial review + PR**

Run a whole-branch adversarial review (the C1a/C1b pattern — lenses over correctness / path-traversal safety of the `/download` validator swap / the validator∧handler completeness (getChapterDir) / the U3a all-chapter fix / test integrity), triage, then open the PR (lead merges). **PR body MUST state:** what's delivered; that U3a is a live all-chapter fix folded in; that no data-op / re-render is needed; deploy gated by A4.

---

## Self-Review

**Spec coverage:** A1 /download (validator+dir+zipName) → Task 1; A2 four routes + downstream `getChapterDir` → Task 2; A3 tm.js validator+filename → Task 3; A4 U3a assign-links + admin.js:975 unassign → Task 4; gate+docs+review → Task 5. ✅

**Placeholder scan:** test harness details reference the concrete existing files to mirror (`books-routes.test.js` `invoke` helper, admin route test idiom) rather than reproduce boilerplate — verification pointers, not TBDs. No TODO.

**Type consistency:** `normalizeChapter` returns `number|null`; `chapterDir` returns a string; `section.moduleId` is the `m#####` string. Used consistently across tasks.
