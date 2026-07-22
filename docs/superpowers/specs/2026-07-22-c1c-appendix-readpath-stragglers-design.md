# C1c — Appendix read-path stragglers + assignment-link fix (design)

**Date:** 2026-07-22 · **Campaign item:** C1 (Appendices support batch), **PR-3** · **Register:** I14-R2 stragglers + `tm.js:39` follow-up + U3a assign-link
**Baseline:** main `2a990e67` (C1b PR-2 #324 merged) · **Plan:** `docs/plans/2026-07-21-post-item17-followup-campaign.md`
**Predecessors:** C1a read-path (#323), C1b registration (#324) — both merged.

## Problem

C1a made most read-path sites appendix-aware and C1b registered appendix rows, but a handful of **read-path validators + dir-builders** still `parseInt('appendices')→NaN` (reject) or build `ch-1` (wrong dir), and one non-appendix editorial bug that C1b's usability verify surfaced is worth fixing alongside them because it lives in the same assignment surface:

1. **`server/routes/books.js` — 5 sites still reject/mis-handle appendices:**
   - `GET /:bookId/download` (`:347`): builds `chapterDirName = \`${config.chPrefix}${paddedChapter}\`` where `paddedChapter = String(chapter).padStart(2,'0')` → `ch-1` (md tracks) / `-1` (pub tracks) for appendices.
   - Bare unvalidated `parseInt(chapter,10)` on four chapter sub-routes: `GET …/files` (`:218`), `POST …/files/scan` (`:253`), `DELETE …/files` (`:281`), `POST …/import` (`:532`).
2. **`server/routes/admin.js:975`** — `removeChapterAssignment(userId, book, parseInt(chapter,10))` (the assign/unassign pair already uses `normalizeChapter` at `:1070/:1107`; this one straggler does not).
3. **`server/routes/tm.js:39`** — `GET /api/tm/export` validator `!/^\d+$/.test(...) || n < 1 || n > MAX_CHAPTERS` rejects appendices, although its lib `tools/lib/tm-export.cjs` (via `generateTm`) is already appendix-aware. The download filename `…-K${chapter}…` (`:55`) would render `-K-1` for appendices.
4. **U3a (non-appendix, but same surface) — `server/routes/sections.js:123/206`:** assignment-notification deep links are built as `…&module=${section.sectionNum}`. `section.sectionNum` is the `book_sections.section_num` (`"5.1"` for a chapter, `"1"` for an appendix), but the segment-editor route that consumes `module=` is guarded by `validateModule`'s `^(m\d{5}|chapter-metadata)$` — so **every assignment/localization notification deep link 400s, for every chapter**, not just appendices. The section object already carries the correct id as `section.moduleId` (`bookRegistration.getSection` maps `moduleId: section.module_id`). The in-app module-card click path uses the real `moduleId` and works; only these notification deep links are broken.

## Canonical form (unchanged)

Appendices = integer `-1` in server memory; `'appendices'` only at on-disk dir names / CLI argv. Convert through `server/lib/chapterLabel.js`: `normalizeChapter('appendices'|'-1')→-1` (rejects `'0'`/junk→`null`); `chapterDir(-1)→'appendices'`.

## Approach

### A1. `books.js /download` (`:347`)
Replace `paddedChapter = String(chapter).padStart(2,'0')` + `chapterDirName = \`${config.chPrefix}${paddedChapter}\`` with a `normalizeChapter` + `chapterDir` build: for the appendix chapter (`-1`) the dir is **`appendices`** for BOTH conventions (md tracks whose `chPrefix='ch'` must NOT become `chappendices`; pub tracks whose `chPrefix=''` are already bare). Concretely: `chapterNum === -1 ? 'appendices' : \`${config.chPrefix}${paddedChapter}\``. Reject `normalizeChapter(...) === null` with the existing 400/404. Numeric chapters byte-identical.

### A2. `books.js` four file/import routes (`:218/:253/:281/:532`) + `admin.js:975`
Adopt `normalizeChapter` at each validator (accept `-1`/`appendices`, reject `0`/junk). **Then trace each handler's downstream dir/path build** — a validator swap that leaves a downstream `ch${padStart}` builder is a provable no-op (the C1a validator∧handler lesson): fix any downstream builder to `chapterDir`. Keep each route's existing non-appendix behavior and its 400/404 on junk.

### A3. `tm.js:39` `/api/tm/export`
Adopt `normalizeChapter` (accept `-1`/`appendices`, keep the `> MAX_CHAPTERS` upper bound for numeric, reject `0`/junk). The download filename uses **`appendices`** for the appendix chapter: `…-appendices-tm.${format}` (not `-K-1`). `generateTm(book, { chapter: -1 })` is already appendix-aware (`tm-export.cjs`). 404-on-empty is unchanged (no faithful appendix content → 404 today — correct, not a regression).

### A4. U3a — `sections.js:123/206` assignment deep links
Change ONLY the `module=` query param in the two `link:` fields from `${section.sectionNum}` → `${section.moduleId}`. Leave the human-readable `message`/`section`/`description` fields (which legitimately display the section number) untouched. This fixes the deep link for **all** chapters + appendices. `getSection` already returns `moduleId` — no new query.

## Testing

Root `npm test` (Vitest) is the authoritative gate.
- **Route validators (A1–A3):** each route resolves `chapter='appendices'` (200/expected, not 400/404) once the underlying data/dir exists, still rejects `'0'`/junk, unchanged for numeric chapters. Reuse the router-introspection `invoke(h,req)` harness in `books-routes.test.js` / the admin test idiom.
- **`/download` (A1):** the appendix chapter builds dir `appendices` for both an md track and a pub track (no `chappendices`, no `ch-1`).
- **`tm.js` (A3):** `chapter='appendices'` is accepted; filename contains `appendices` not `-1`; a numeric chapter still 400s above `MAX_CHAPTERS`.
- **U3a (A4):** the assignment-notification `link` contains `module=<m#####>` (the `moduleId`), not `module=<section_num>`; assert for a normal chapter section (proving the all-chapter fix) and an appendix section.

## Out of scope
- **U1 write-path publish enablement** (`validate-chapter.js` + `validateBeforePublish`) — sibling sub-project **C1d** (`2026-07-22-c1d-appendix-writepath-publish-design.md`).
- **U3b** `server/data/*.json` appendices inconsistency (save-path drops `appendices` → `books.js:190` soft no-op for 4/6 books) — logged backlog item, low value (no UI caller).
- Any new appendix CONTENT, re-render, or vefur delivery.

## Risks / constraints
- **No behavior change for numeric chapters** — every change is additive at a validator or a dir-build ternary; non-appendix paths byte-identical.
- **Fails-safe** — these are read/report/notification sites; a bug at worst rejects an appendix (status quo before this PR), never corrupts data.
- **U3a is not appendix-specific** — it is a live all-chapter bug folded in because it shares the assignment surface and is a two-line fix with a clear root cause; its test asserts the fix for a normal chapter too.
