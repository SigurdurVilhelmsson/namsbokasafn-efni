# Item 16 — Dashboard/View Contract Repair (Batch F) — Design

**Date:** 2026-07-18 · **Campaign:** `docs/plans/2026-07-11-pre-semester-coding-campaign.md` item 16 (Batch 7)
**Sources:** audit Batch F findings 10–13, 18, 25–31 (`docs/audit/2026-07-11-server-code-review.md`), editorial dims 5/6 (`docs/audit/2026-07-11-editorial-workflow-review.md`), register I14-R9.
**Structure (lead-decided 2026-07-18): two PRs** — PR1 mechanical contract repairs, PR2 removals + appendix label sweep. PR1 ships first; PR2 is serial (same `my-work.html` regions).

## 1. Verification basis

All 13 scope items (12 audit findings + I14-R9) were re-verified **PRESENT** against main `69bea3ed` (post-#302, 2026-07-18) by a 13-agent read-only fan-out (workflow `wf_f50913a8-211`; journal in the session transcript dir). None were incidentally fixed by the ~15 PRs merged since the audit. All file:line references below are **current as of that SHA** — trust the pattern over the line number if they drift.

Root cause across the batch: none of these view↔route contracts had any test — route harnesses pin what routes do, nothing pinned what views read. PR1 therefore ships the anti-recurrence infrastructure (contract reference + static-pin suite), not just the fixes.

## 2. Lead decisions (2026-07-18, all adjudicated in the scoping conversation)

| Decision | Outcome |
|---|---|
| Timebox vs split | **Split into 2 PRs** (item-8 precedent: split by decision-dependence) |
| F10 dead picker endpoint | **Defer** to the open suggestions-family keep-vs-retire decision (B1-F1); register, no code in item 16 |
| F28 "Tímafrestur" overdue stat | **Remove** the stat (no real data source exists; revisit with throughput-roadmap Unit 5 SLA work) |
| F29 blocked-issues banner | **Remove** banner + both retired `/issues` links |
| F30 (+F25) dormant assignment tasks | **Delete** the dormant branch; register "surface real `user_chapter_assignments` on my-work" as a future feature item |

## 3. PR1 — mechanical contract repairs (7 findings)

Branch: `fix/item16-pr1-contract-repairs`. No product decisions, no authz changes, no behavior changes beyond making displays truthful.

### F11 — status.html stage badges never show "done"
- View: `server/views/status.html:641-660` reads `(data.status && data.status.stages) || data.status || {}` — but `GET /api/status/:book/:chapter` (`routes/status.js:1219`, response built at `:1254-1261` via `formatChapterStatus` `:1484-1539`) sends `stages` as a **top-level array** of `{stage, status, symbol, complete, date, editor, notes}`; the publication entry carries `mtPreview`/`faithful` sub-tracks (`:1510-1514`). No `status` key exists → `stages` collapses to `{}` forever.
- **Fix:** mirror `books.html:2129-2136`'s array→name-keyed-object conversion in `status.html`'s badge loader. No route change.
- **Rider:** delete the same dead misread in `books.html:2559-2569` (`cvLoadStatus`).

### F12 — books.html chapter activity panel fully non-functional
- View: `books.html` `loadChapterActivity` (`:2076-2117`, reads at `:2096/:2100/:2103/:2106`) and its duplicate `cvLoadActivity` (`:2516-2557`, reads at `:2536/:2540/:2543/:2546`) read `a.action`/`a.userName`/`a.details`/`a.timestamp`. Route `GET /api/activity` (`routes/activity.js:24-44`) returns `activityLog.parseRow` rows (`services/activityLog.js:251-264`): `type`/`username`/`description`/`createdAt`. Defensive fallbacks render 📌 + "Kerfi" + blanks.
- Chapter filter: client sends `&chapter=` (`:2081`, `:2521`) but the route destructure (`activity.js:25`) drops it and the search SQL (`activityLog.js:110-117`) has no chapter predicate.
- **Fix:** (a) rename the four reads to `a.type`/`a.username`/`a.description`/`a.createdAt`; (b) **dedupe** the two identical render blocks into one shared function; (c) implement the chapter filter server-side — add `chapter` to the route destructure and a `chapter = ?` predicate to `activityLog.search` **and** its count query, comparing as `String(chapter)` (activity_log stores chapter as TEXT, incl. `String(-1)` — the I14-R7 contract).
- **Not changed:** the HEAD_EDITOR gate on `GET /api/activity` stays — no authz churn in a contract batch. Consequence (plain editors see "Engin virkni") goes in the register (§7).

### F13 — term-lookup autocomplete never applies book ranking
- Route `routes/segment-editor.js:99-107` destructures `bookId` and `parseInt`s it; the only client (`public/js/segment-editor.js:2264`) sends `bookSlug`; `terminologyService.lookupTerm` (`:175`, `:181`) expects a slug string. Correct reference pattern already exists at `routes/terminology.js:86-93`.
- **Fix:** destructure `bookSlug`, drop the `parseInt`, pass `bookSlug || null`. No client change, no back-compat shim (no caller sends `bookId`).

### F18 — progress formula double-counts applied work
- `applied` is a strict subset of `approved` by SQL construction (`segmentEditorService.js:1261` vs `:1264` — applied rows keep `status='approved'`; apply stamps `applied_at` only). Two live sites sum them: `segmentEditorService.js:1333-1334` (drives `modulesComplete`) and `routes/status.js:979` (drives per-module `complete` at `:986-988` and `segmentsApproved` at `:1012`). Consumers: `status.html:496/:596/:623`.
- **Fix:** use the `approved` count alone at both sites. Record-count is currently equivalent to distinct-segment count (supersede-on-approve guarantees ≤1 approved row per segment, per #299); do **not** add DISTINCT hardening here — keep the diff minimal.
- **⚠️ Honest consequence for the PR description:** reported completion percentages and `modulesComplete` will **drop** after this ships. That is the inflation being removed, not a regression.

### F26 — my-work personal activity timestamps always blank
- `my-work.html:1655` reads `a.created_at`; `/api/my-work` returns `parseRow` rows which emit only camelCase `createdAt` (`activityLog.js:262`). `formatTimeAgo` (`my-work.html:2062`) renders `''` on missing.
- **Fix:** read `a.createdAt`. One-line view change.

### F27 — status.html timeline shows "Invalid Date" on every row
- `status.html:702` reads `new Date(a.created_at || a.timestamp)`; the route (`routes/status.js:362-375`) sends `createdAt` **plus a pre-formatted `timeAgo` string** the page ignores.
- **Fix:** render `a.timeAgo` directly (drop client-side date parsing). Preferred over reading `createdAt` because SQLite `CURRENT_TIMESTAMP` strings parse as **local** time in browsers → silent timezone skew.

### F31 — admin activity feed icon column always blank + invalid inline color
- `my-work.html:1896` `(activity.icon ? '' : '●')` is backwards, and `getActivityIcon` (`routes/status.js:1662-1691`) always returns truthy → icon never renders. `:1895` injects `getActivityColor`'s **class tokens** (`success`/`warning`/`info`/`default`, `routes/status.js:1696-1701`) into `style="background:…20;color:…"` → invalid CSS, dropped by the browser.
- **Fix:** icon → `activity.icon || '●'` (correct direction). Color → drop the inline style; apply a modifier class (`activity.color || 'default'`) on the `.admin-activity-icon` element and add four CSS rules in the existing block (`my-work.html:~804`), mirroring the attention-item-icon pattern (`:605-608`). Class-based is theme-safe (dark mode uses CSS vars; hex+`20` alpha assumes 6-digit hex).

### PR1 infrastructure (anti-recurrence)
1. **`docs/technical/view-route-contracts.md`** — short hand-written reference: actual response shape of the six endpoints these views consume (`/api/status/:book/:chapter`, `/api/status/dashboard`, `/api/activity`, `/api/my-work`, `/api/my-work/today`, `/api/terminology/lookup`), each with the consuming view(s) named. Not generated; kept honest by the tests below.
2. **Static-pin suite** — new `server/__tests__/viewRouteContracts.test.js` (style: `clientMessageContracts.test.js`): reads view/JS sources and asserts the fixed reads are present and the broken reads are absent (e.g. `formatTimeAgo(a.createdAt)` present + `a.created_at` absent in `my-work.html`; no `data.status.stages` in `status.html`; no backwards icon ternary; both activity blocks read `a.type`/`a.username`/`a.description`/`a.createdAt` — or the deduped function does).
3. **Route-harness tests** (existing per-route style): `/api/activity` response field names + chapter filtering (seed rows in two chapters, assert filter); term-lookup passes the slug through to `lookupTerm` (assert via service seam or result shape); `editorialProgress` fixture with 1-approved-and-applied of 2 segments asserting `modulesComplete === 0` (extends `editorialProgress.test.js`, which today never sets `applied_at`); status chapter route shape pin — top-level `stages` array, `body.status` undefined, publication entry carries `mtPreview`/`faithful` (extends `statusChapterRoute.test.js`).

## 4. PR2 — removals + appendix label sweep

Branch: `fix/item16-pr2-dead-code-and-labels`, cut after PR1 merges.

### F28 — remove the always-zero "Tímafrestur" stat
Delete: the tile + its label (`my-work.html:1697-1700`), its share of `totalIssues` (`:1690`), the dead overdue-item icon (`:1735`), and the `overdueCount: 0` init (`routes/status.js:125`). The `overdueItems` param threaded into `renderAttentionPanel` (`:1669`) goes too if nothing else consumes it.

### F29 — remove the unreachable blocked-issues banner
Delete: the dead read + call (`my-work.html:1254-1256`), `renderBlockedBanner` (`:1473-1498`), banner markup (`:950-957`), banner CSS (`:64-144`), and **both** retired `/issues` links — `:1493` (dies with the banner) and the admin attention click-through at `:1940`, where the fix is: remove the click affordance (the stat stays informational; no live destination exists for it today). The `/issues` 301-redirect route itself (`routes/views.js:103`) **stays** — it protects old bookmarks.
Rationale: the discuss-edits count this banner meant to surface already renders via the attention panel in the same view (`needsAttention.blockedIssues`, a number on `/api/status/dashboard` — that field is live and keeps working).

### F30 + F25 — delete the dormant assignment-task branch
Delete from `routes/my-work.js`: the `chapter_assignments` SELECT (`:242-251`) and the assignment-task builder (`:253-265`), plus any `type === 'assignment'` handling in currentTask/upNext/allTasks assembly and quick-stat counts.
Delete from `my-work.html`: the stageLabel reads (`:1381`, `:1435`), the dueDate-object reads (`:1383-1386`, `:1433-1434`), the now-unused `STAGE_LABELS` table (`:1176-1185`), the never-called `getDueDateText` (`:2078-2089`), and the dead `quickStats.overdue` read (`:1263`) — **keeping** the `changesRequested` banner wording (`:1271-1272`), which is live.
`chapter_assignments` (the table) is untouched — dropping a table is migration territory and out of scope; only the dead read goes.
**Honest consequence:** `totalTasks` (and any count that included assignment tasks) may change; that is dead weight being removed.

### I14-R9 — appendix display-label sweep
- **New `server/public/js/chapter-label.js`** (UMD, per the `segment-validation.js` precedent): exports a display helper mapping `-1`/`'appendices'` → **"Viðaukar"** (compact form **"Við."** for `K`-prefixed contexts), else `Kafli N` / `K N`. Client-side only; `server/lib/chapterLabel.js` stays conversion-only (one concern per lib — do not merge them).
- **Required adoption (live sites):** `my-work.html` (`:1377`, `:1380`, `:1428-1429`, `:1575`, `:1604`, `:1748`, `:1847` — minus any removed by F29/F30 above), `public/js/assignments.js` (`:94`, `:133-134`), `admin.html` (`:790`, `:813`, `:1334`).
- **Latent sites (default: adopt):** `books.html` (`:1786`, `:1864`, `:1871`, `:1916`, `:2325`, `:2342`) and `localization-editor.js` (`:1753`) — these cannot receive `-1` today because book registration never creates an appendices row (registered below). Default is to adopt the helper there too (mechanical one-line swaps, cheap future-proofing); skip a site only if the swap turns out non-trivial, leaving it to I16-R3.
- **Test:** helper unit test + static-pin (style: `structuralBackstopWiring.test.js`): no unguarded `'Kafli ' + raw` / `'K' + raw` concatenations remain at the swept sites; helper is referenced by each required file.

### Register updates (campaign doc, ride PR2 unless noted)
- **I16-R1** — F10 deferred: review-tab picker's dead endpoint (`localization-editor.js:1771` → nonexistent `GET /api/sections/:bookSlug/:chapterNum`) is moot-if-retired under the open suggestions-family decision (B1-F1); fix shape if kept = one book-scoped route matching the client URL.
- **I16-R2** — feature item: surface real `user_chapter_assignments` (incl. I14-R1a appendix rows) on my-work's personal dashboard; needs a shape decision (table has no due_date/stage/notes columns). This is the "finish" half of F30 the lead deferred.
- **I16-R3** — product item: appendices absent from `books.html`/loc-editor chapter lists entirely (`bookRegistration.registerBook` iterates `bookData.chapters` only — no `-1` row; overlaps I14-R4).
- **I16-R4** (rides PR1) — F12 nuance: `GET /api/activity` stays HEAD_EDITOR-gated, so the fixed chapter activity panel renders "Engin virkni" for plain editors; widening is a deliberate authz decision, not a contract repair.

## 5. Acceptance criteria

**PR1:** all 7 repairs implemented; new static-pin suite + route-harness tests green; contract reference committed; `npm test` from repo root green; PR description flags the F18 number-drop.
**PR2:** removals leave zero dangling references (static pins assert absence: no `todayData.blockedIssues`, no `/issues?` links, no `chapter_assignments` reference in `routes/my-work.js`, no `STAGE_LABELS`/`getDueDateText` orphans); label helper unit-tested and adopted at all required sites; register updates in the campaign doc; `npm test` green.
**Both:** manual QA click-through list in the PR description — status/progress page (badges show real completion, timeline shows times), book list (chapter activity panel populates for a head-editor, filtered to the chapter), personal dashboard (activity timestamps render; no undefined badges; no vanished-but-referenced UI), admin feed (icons + colors render).

## 6. Explicitly out of scope

F10 (deferred), any authz widening (activity read gate, cross-book reads), the my-work real-assignments feature (I16-R2), appendices in book registration (I16-R3), `chapter_assignments` table removal, `lib/chapterLabel.js` changes, and any renderer/pipeline/content work.

## 7. Risks & notes

- **F18 makes dashboards honest, numbers go down** — communicate, don't "fix back".
- **PR2 deletes ~150+ lines of view code** — the static-pin absence assertions are the guard that deletions are complete and nothing still references removed pieces.
- **Line numbers in this spec drift** — implementers match by pattern; the verification evidence (workflow `wf_f50913a8-211` journal) holds fuller context per finding.
- **`String(chapter)` coercion in the activity filter** — activity_log.chapter is TEXT (`String(-1)` for appendices per I14-R7); a numeric-equality predicate would silently miss rows.
