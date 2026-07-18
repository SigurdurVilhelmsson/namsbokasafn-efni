# Item 16 PR2 — Dead-Code Removals + Appendix Label Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove three provably-dead UI branches from the my-work dashboard (F28 Tímafrestur stat, F29 blocked-issues banner, F30+F25 chapter_assignments task branch) and replace every raw `'Kafli ' + ch` / `'K' + ch` chapter-label concatenation with a new UMD display helper so appendices render as "Viðaukar"/"Við." instead of "Kafli -1"/"K-1" (I14-R9).

**Architecture:** Each removal is TDD'd with *absence pins* (static source assertions written red-first, green after deletion) appended to `server/__tests__/viewRouteContracts.test.js`. The label sweep adds `server/public/js/chapter-label.js` (UMD, mirrors `segment-validation.js`) with a Vitest unit suite plus adoption pins in a new `server/__tests__/chapterLabelClient.test.js`. Removals land **before** the sweep because three spec'd label sites live inside code the removals delete; the sweep lands **after** the helper + `<script>` includes exist so no view ever references an undefined global (the Playwright smoke spec's zero-pageerror gate would catch it).

**Tech Stack:** Node 22 / Express 5 server, plain-JS views with inline scripts, Vitest (workspace project `server`, sequential), Playwright smoke E2E.

**Spec:** `docs/superpowers/specs/2026-07-18-item16-dashboard-contract-design.md` §4–§7 (approved design). Scouted against main `431e3612` (2026-07-18); all line numbers below are current at that SHA — **trust the pattern over the line number if they drift.**

## Global Constraints

- Branch: `fix/item16-pr2-dead-code-and-labels`, cut from current `main` (`431e3612`+). No branch protection exists — **local `npm test` from the repo root is the authoritative gate**; run it before every commit claim.
- Single-file test run: `npx vitest run --project server server/__tests__/<file>.test.js` (from repo root; workspace project name is `server`).
- **Byte-exactness:** `my-work.html`, `admin.html`, `books.html` inline JS stores emoji and some Icelandic as literal `\uXXXX` escape sequences while other Icelandic is raw UTF-8 — mixed *within the same file* (`localization-editor.js` has raw `Viðaukar` at :366 but escaped `Viðaukar` at :553). **Always Read the region and build Edit `old_string`s from the actual file bytes, never from this plan's decoded snippets.** Snippets below show decoded text for readability.
- **Do NOT touch:** the live `needsAttention.blockedIssues` producer (`routes/status.js:295-302`) and its stat tile; the `/issues` 301 redirect (`routes/views.js:103`); `server/services/notifications.js` (has its own live `STAGE_LABELS` + assignment-notification family); anything named `user_chapter_assignments`; migrations 010/012/015/016/033; the `.admin-activity-icon` CSS block (`my-work.html:804-820` — F31 pins it); the personal activity feed renderer (`my-work.html:1654-1663`) and `getActivityIcon` map (`:2108+`) — F26 pins them; `renderActivityItem` (`:1897+`) — F31 pins it; `server/lib/chapterLabel.js` (conversion-only lib, separate concern).
- **Do NOT introduce** these literal substrings into `my-work.html` (PR1 pins assert their absence): `a.created_at`, `term_propose:`, `activity.icon ? '' :`. Nor `assignment_created:`/`assignment_completed:` into `dashboard.html`.
- Canonical display strings: full = `Viðaukar` / `Kafli N`; compact = `Við.` / `KN` (no space — matches the dominant existing `K5`-style tags; the spec's "K N" notation is implemented as `KN`, and books.html's lone `K. N` variant unifies to `KN` — flag in the PR description).
- Existing truthiness guards around chapter labels (e.g. `item.chapter ? … : ''`, `if (ev.chapter)`) stay exactly as they are — the helper only replaces label *construction*, never reachability logic (chapter 0 = front-matter is real and deliberately skipped by those guards).
- After each task's commit, append a one-line progress note under the item 16 PR2 header in `.superpowers/sdd/progress.md` and stage it with that commit.
- Commit message footer (every commit): `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

| File | Role in this PR |
|---|---|
| `server/views/my-work.html` | Removals (F28/F29/F30) + 6 helper adoptions + `<script>` include |
| `server/routes/my-work.js` | Delete `chapter_assignments` SELECT + builder (F30) |
| `server/routes/status.js` | Delete `overdueCount: 0` init (F28) |
| `server/public/js/chapter-label.js` | **NEW** — UMD display helper (`full`/`compact`) |
| `server/__tests__/chapterLabelClient.test.js` | **NEW** — helper unit tests + UMD contract + adoption pins |
| `server/__tests__/viewRouteContracts.test.js` | Extend: `serverFile()` reader + 3 removal-pin describes |
| `server/views/admin.html` | 5 helper adoptions + include |
| `server/public/js/assignments.js` / `server/views/assignments.html` | 2 adoptions / include |
| `server/views/books.html` | 6 latent adoptions + include |
| `server/public/js/localization-editor.js` / `server/views/localization-editor.html` | 3 adoptions (2 are dedups of inline `-1` ternaries) / include |
| `docs/technical/view-route-contracts.md` | Update the two endpoint shapes PR2 changes |
| `.superpowers/sdd/progress.md` | Per-task progress lines |
| `docs/plans/2026-07-11-pre-semester-coding-campaign.md` | **Post-merge only** — status line, I14-R9 done-marker, new I16-R8/R9 |

---

### Task 1: Branch setup + F28 — remove the always-zero "Tímafrestur" stat

**Files:**
- Modify: `server/views/my-work.html` (~:1674, :1690, :1695, :1700-1706, :1739-1744)
- Modify: `server/routes/status.js` (:125)
- Test: `server/__tests__/viewRouteContracts.test.js` (extend)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `serverFile(name)` reader in `viewRouteContracts.test.js` (used again by Tasks 2–3); `renderAttentionPanel(attention)` single-arg signature.

Background: the stat is dead end-to-end — `GET /api/status/dashboard` initializes `overdueCount: 0` and never increments it; no `needsAttention` item ever gets `type: 'overdue'`; the `overdueItems` second parameter of `renderAttentionPanel` is never emitted by the route, never read by the function body, and has exactly one call site. Zero existing tests reference any of it.

- [ ] **Step 1: Create the branch and the progress header**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git fetch origin && git status -sb   # expect: ## main...origin/main, clean
git checkout -b fix/item16-pr2-dead-code-and-labels
```

Append to `.superpowers/sdd/progress.md` (after the current last line):

```
--- item 16 PR2 (branch fix/item16-pr2-dead-code-and-labels, plan docs/superpowers/plans/2026-07-18-item16-pr2-dead-code-and-labels.md) ---
```

- [ ] **Step 2: Write the failing absence pins**

In `server/__tests__/viewRouteContracts.test.js`, directly under the existing `view` helper (`const view = (name) => fs.readFileSync(path.join(here, '..', 'views', name), 'utf8');` at ~:16), add:

```js
const serverFile = (name) => fs.readFileSync(path.join(here, '..', name), 'utf8');
```

At the end of the file, add:

```js
describe('item16 PR2 — F28: dead Tímafrestur overdue stat removed', () => {
  it('my-work.html carries no overdue-stat remnants', () => {
    const src = view('my-work.html');
    expect(src).not.toMatch(/Tímafrestur/);
    expect(src).not.toMatch(/overdueCount/);
    expect(src).not.toMatch(/overdueItems/);
  });

  it('GET /api/status/dashboard no longer initializes overdueCount', () => {
    expect(serverFile('routes/status.js')).not.toMatch(/overdueCount/);
  });
});
```

Note: `Tímafrestur` in the pin must match the file's byte form — verify with `grep -c "Tímafrestur" server/views/my-work.html` (expect 1 before deletion). If grep finds 0, the label is stored escaped; use the escaped form in the regex instead.

- [ ] **Step 3: Run pins to verify they fail**

Run: `npx vitest run --project server server/__tests__/viewRouteContracts.test.js`
Expected: FAIL — both new tests red (Tímafrestur/overdueCount present), all pre-existing PR1 pins still green.

- [ ] **Step 4: Delete the stat (5 edits — Read each region first for exact bytes)**

(a) `my-work.html` ~:1700-1706 — remove the Tímafrestur tile from the `statsEl.innerHTML` template. The tile and the following (live, keep) `Lokað` tile are one template literal chain:

```js
// BEFORE (decoded):
      statsEl.innerHTML =
        '<div class="attention-stat">' +
          '<div class="attention-stat-value ' + ((attention.overdueCount || 0) > 0 ? 'danger' : 'zero') + '">' +
            (attention.overdueCount || 0) +
          '</div>' +
          '<div class="attention-stat-label">Tímafrestur</div>' +
        '</div>' +
        '<div class="attention-stat">' +
// AFTER:
      statsEl.innerHTML =
        '<div class="attention-stat">' +
```
(the second `'<div class="attention-stat">' +` opening the blockedIssues tile becomes the first.)

(b) `my-work.html` ~:1695 — drop the overdue term from `totalIssues`:

```js
// BEFORE:
      var totalIssues = (attention.overdueCount || 0) + (attention.blockedIssues || 0) +
                       (attention.unassignedWork || 0) + (attention.pendingReviews || 0);
// AFTER:
      var totalIssues = (attention.blockedIssues || 0) +
                       (attention.unassignedWork || 0) + (attention.pendingReviews || 0);
```

(c) `my-work.html` ~:1740 — delete the dead icon-map entry (emoji is stored as an escape sequence — match file bytes): remove the line `overdue: '⏰',` from the `var icons = { … }` map inside `renderAttentionPanel`'s item renderer. Keep `blocked`/`unassigned`/`review` entries (all live).

(d) `my-work.html` ~:1690 — signature: `function renderAttentionPanel(attention, overdueItems) {` → `function renderAttentionPanel(attention) {`

(e) `my-work.html` ~:1674 — sole caller: `renderAttentionPanel(data.needsAttention, data.overdueItems);` → `renderAttentionPanel(data.needsAttention);`

(f) `server/routes/status.js` :125 — delete the line `overdueCount: 0,` from the `needsAttention` init object (keep `pendingReviews`/`blockedIssues`/`unassignedWork`/`items`).

- [ ] **Step 5: Run pins to verify they pass**

Run: `npx vitest run --project server server/__tests__/viewRouteContracts.test.js`
Expected: PASS (all describes, old and new).

- [ ] **Step 6: Full unit suite + commit**

```bash
npm test          # from repo root; expect all green
git add server/views/my-work.html server/routes/status.js server/__tests__/viewRouteContracts.test.js .superpowers/sdd/progress.md
git commit -m "fix(item16-pr2): F28 — remove dead Tímafrestur overdue stat (absence-pinned)

Tile, totalIssues share, icon-map entry, overdueItems param+arg, and the
overdueCount:0 init were dead end-to-end (route never increments, never
emits overdueItems, no item ever gets type 'overdue'). Zero prior test
coverage; viewRouteContracts absence pins are the new guard.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: F29 — remove the unreachable blocked-issues banner + retired `/issues` links

**Files:**
- Modify: `server/views/my-work.html` (:63-145 CSS, :955-963 markup, :1258-1261 call, :1474-1503 function, :1943-1945 switch case)
- Test: `server/__tests__/viewRouteContracts.test.js` (extend)

**Interfaces:**
- Consumes: `serverFile` from Task 1 (not actually needed here; `view` suffices).
- Produces: `handleAttentionItem` without a `'blocked'` case — blocked attention items fall through to the `default:` `/progress` navigation (this is the "remove the click affordance" decision: the Skoða button is generic across all four item types, so the minimal correct fix is deleting the dead `/issues` destination, not the button).

Background: the banner reads `todayData.blockedIssues`, which `GET /api/my-work/today` never returns — the whole chain (CSS → markup → call → `renderBlockedBanner` → `/issues?id=` link) is unreachable. The second retired link is `case 'blocked': window.location.href = '/issues?category=BLOCKED'`. The **live** discuss-edits count already renders via `needsAttention.blockedIssues` on the attention panel — keep it. The `/issues` 301 redirect in `routes/views.js` also stays.

- [ ] **Step 1: Write the failing pins** (append to `viewRouteContracts.test.js`):

```js
describe('item16 PR2 — F29: unreachable blocked-issues banner removed', () => {
  it('no banner code or retired /issues links remain in my-work.html', () => {
    const src = view('my-work.html');
    expect(src).not.toMatch(/renderBlockedBanner/);
    expect(src).not.toMatch(/blocked-banner/);
    expect(src).not.toMatch(/todayData\.blockedIssues/);
    expect(src).not.toMatch(/\/issues/);
  });

  it('the live dashboard blockedIssues stat survives', () => {
    expect(view('my-work.html')).toMatch(/attention\.blockedIssues/);
  });
});
```

- [ ] **Step 2: Run to verify red**

Run: `npx vitest run --project server server/__tests__/viewRouteContracts.test.js`
Expected: FAIL — first new test red on all four patterns; survival test already green.

- [ ] **Step 3: Delete the five regions (Read each first)**

(a) CSS block `my-work.html` :63-145 — from the `/* BLOCKED ISSUES BANNER */` section comment through the closing brace of `.btn-blocked:hover`. Boundary check: the lines above (`.alert-icon`/`.alert-text`) and the `/* SECTION LABEL (sidebar-style) */` comment below MUST survive. Selectors going: `.blocked-banner .blocked-header .blocked-icon .blocked-count .blocked-list .blocked-item .blocked-item-main .blocked-item-location .blocked-item-description .btn-blocked`. Do NOT touch the shared `.attention-stat-value.danger/.zero` rules (~:561-568).

(b) Markup :955-963 — the `<!-- Blocked Issues Banner -->` comment plus the whole `<div class="blocked-banner" id="blocked-banner" …>…</div>` block. The Alert Banner div above and `<!-- Current Task Card -->` below survive.

(c) Dead call :1258-1261:

```js
        // Show blocked issues banner (highest priority)
        if (todayData.blockedIssues && todayData.blockedIssues.length > 0) {
          renderBlockedBanner(todayData.blockedIssues);
        }
```
Delete all four lines. The `// Show alert if needed` block below stays.

(d) Function + its section-header comment :1474-1503 — the three `// ====` header lines (`BLOCKED ISSUES BANNER`) and the entire `function renderBlockedBanner(blockedIssues) { … }`. This removes the first `/issues?id=` link. The `// VIEW TOGGLE` section header below survives.

(e) Switch case :1943-1945 in `handleAttentionItem`:

```js
        case 'blocked':
          window.location.href = '/issues?category=BLOCKED';
          break;
```
Delete these three lines only; `review`/`unassigned`/`default` cases stay. Do NOT touch the `blocked: '⛔'` icon-map entry (live) or the blockedIssues stat tile.

- [ ] **Step 4: Run pins → green; full suite; commit**

```bash
npx vitest run --project server server/__tests__/viewRouteContracts.test.js   # PASS
npm test                                                                     # all green
git add server/views/my-work.html server/__tests__/viewRouteContracts.test.js .superpowers/sdd/progress.md
git commit -m "fix(item16-pr2): F29 — remove unreachable blocked-issues banner + retired /issues links

/api/my-work/today never returns blockedIssues, so CSS+markup+call+
renderBlockedBanner were dead; 'blocked' attention items now use the
default /progress navigation (the Skoða button is shared across item
types — the dead /issues destination was the affordance to remove).
Live needsAttention.blockedIssues stat and the views.js 301 stay.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: F30+F25 — delete the dormant assignment-task branch

**Files:**
- Modify: `server/routes/my-work.js` (:236-269, :271)
- Modify: `server/views/my-work.html` (:1179-1190, :1268-1278, :1381-1397, :1429-1442, :2085-2096, orphan CSS)
- Test: `server/__tests__/viewRouteContracts.test.js` (extend)

**Interfaces:**
- Consumes: `serverFile` from Task 1.
- Produces: `/api/my-work/today` tasks contain **only** `type: 'changes_requested'`; `quickStats.totalTasks === changesRequested.length`. Task 5's my-work label swaps target the **collapsed** render functions produced here.

Background: the route still SELECTs from `chapter_assignments` (legacy work-task table, migration 012 — **distinct from the live RBAC table `user_chapter_assignments`**, migration 010; the table itself stays, only dead reads go). The view's consumers were doubly dead: `quickStats.overdue` was *never* returned by the route, and the builder emitted `dueDate` as a raw string while the HTML reads `dueDate.status`/`daysUntil` object fields. Zero test coverage anywhere (no server test references `routes/my-work.js` at all); the Playwright smoke spec's zero-pageerror gate on `/` is the behavioral guard against dangling references.

- [ ] **Step 1: Write the failing pins** (append to `viewRouteContracts.test.js`):

```js
describe('item16 PR2 — F30+F25: dormant assignment-task branch removed', () => {
  it('my-work.html has no assignment-task remnants', () => {
    const src = view('my-work.html');
    expect(src).not.toMatch(/STAGE_LABELS/);
    expect(src).not.toMatch(/getDueDateText/);
    expect(src).not.toMatch(/stageLabel/);
    expect(src).not.toMatch(/dueDate/);
    expect(src).not.toMatch(/overdue/i);
  });

  it('the live changes-requested alert wording survives', () => {
    expect(view('my-work.html')).toMatch(/verkefni þarfnast lagfæringa/);
  });

  it('routes/my-work.js no longer reads the legacy chapter_assignments table', () => {
    const src = serverFile('routes/my-work.js');
    expect(src).not.toMatch(/(?<!user_)chapter_assignments/);
    expect(src).not.toMatch(/'assignment'/);
  });
});
```

(The lookbehind matters: `user_chapter_assignments` contains `chapter_assignments` as a substring; `routes/my-work.js` currently has no `user_` hits, but the pin must never false-fail if the live table is referenced there later. Verify the Icelandic survival string's byte form with grep first, as in Task 1.)

- [ ] **Step 2: Run to verify red**

Run: `npx vitest run --project server server/__tests__/viewRouteContracts.test.js`
Expected: FAIL — remnant pins red; survival + route pins: survival green, route pin red on `chapter_assignments`.

- [ ] **Step 3: Route side — delete the builder block**

`server/routes/my-work.js` :236-269 — delete the whole block from `// Get active chapter assignments for this user` + `let assignedTasks = [];` through the closing `catch (err) { log.error({ err }, 'Failed to load assignments'); }` brace. Then :271:

```js
// BEFORE:
    const allTasks = [...changesRequested, ...assignedTasks];
// AFTER:
    const allTasks = [...changesRequested];
```

Leave the `needsAttention = allTasks.filter((t) => t.type === 'changes_requested')` line as-is (now an identity filter — harmless, minimal diff). `quickStats` needs no edit: `totalTasks: allTasks.length` self-corrects.

- [ ] **Step 4: View side — six regions in `my-work.html` (Read each first)**

(a) :1179-1190 — delete `STAGE_LABELS` and its 2-line comment (zero readers in this file; the notifications.js copy is live and untouched).

(b) :1268-1278 — collapse the alert-message builder, keeping the live wording:

```js
// BEFORE (decoded):
          var overdue = todayData.quickStats.overdue;
          var changes = todayData.quickStats.changesRequested;

          var alertMsg = '';
          if (overdue > 0 && changes > 0) {
            alertMsg = overdue + ' verkefni yfir tíma og ' + changes + ' með óskum um breytingar';
          } else if (overdue > 0) {
            alertMsg = overdue + (overdue === 1 ? ' verkefni er' : ' verkefni eru') + ' yfir tíma';
          } else if (changes > 0) {
            alertMsg = changes + ' verkefni þarfnast lagfæringa';
          }
// AFTER:
          var changes = todayData.quickStats.changesRequested;

          var alertMsg = '';
          if (changes > 0) {
            alertMsg = changes + ' verkefni þarfnast lagfæringa';
          }
```

(c) :1381-1392 — `renderCurrentTask`: with assignment tasks gone every task is `changes_requested`, so collapse the if/else to the first arm:

```js
// BEFORE (decoded):
      if (isChangesRequested) {
        taskTitle = task.bookLabel + ' - Kafli ' + task.chapter + ', ' + task.section;
        taskMeta = '<span class="meta-reviewer">Athugasemdir frá ' + escapeHtml(task.reviewedBy) + '</span>';
      } else {
        taskTitle = task.bookLabel + ' - Kafli ' + task.chapter;
        taskMeta = '<span class="meta-stage">' + escapeHtml(task.stageLabel) + '</span>';
        if (task.dueDate) {
          var dueDateClass = task.dueDate.status === 'overdue' ? 'due-overdue' :
                             task.dueDate.status === 'today' ? 'due-today' : '';
          taskMeta += ' <span class="meta-due ' + dueDateClass + '">' + task.priorityLabel + '</span>';
        }
      }
// AFTER:
      taskTitle = task.bookLabel + ' - Kafli ' + task.chapter + ', ' + task.section;
      taskMeta = '<span class="meta-reviewer">Athugasemdir frá ' + escapeHtml(task.reviewedBy) + '</span>';
```
(The `taskMeta +=` line inside the deleted else-branch has an unusual quote mix in the raw file — Read the exact bytes; do not reconstruct it from this plan.)

Then at ~:1396-1397 replace the now-dead ternary arm: `(isChangesRequested ? 'Breytingar óskast' : task.priorityLabel)` → `'Breytingar óskast'`.

(d) :1429-1442 — `renderUpNext`'s renderTask: collapse both ternaries to their changes_requested arms:

```js
// AFTER:
        var title = task.bookLabel + ' K' + task.chapter + '/' + task.section;

        var badge = '<span class="item-badge badge-changes">Laga</span>';
```

(e) :2085-2096 — delete the never-called `getDueDateText` function (boundaries: `formatTimeAgo` ends :2083 above — **F26-pinned, keep**; `getStatusLabel` starts :2098 below — keep).

(f) Leftover-variable + orphan-CSS sweep:

```bash
grep -n "isChangesRequested\|priorityLabel\|priorityClass" server/views/my-work.html
```
Delete any declaration whose *only* remaining reference is its own declaration (expected: `isChangesRequested` in both functions; check `priorityClass` reads before removing it — keep it if the task-card class attribute still uses it).

```bash
grep -n "meta-due\|due-overdue\|due-today\|badge-overdue\|meta-stage\|attention-item-icon.overdue" server/views/my-work.html
```
Delete the orphaned CSS rules whose producing class names died in (c)/(d)/Task 1: expected `.meta-due` variants (~:240), `.item-badge.badge-overdue` (~:326-329), `.attention-item-icon.overdue` (~:605), and `.meta-stage` if present. **Keep** `.item-badge` base + `.badge-changes` (live "Laga" badge) and `.meta-reviewer`.

- [ ] **Step 5: Run pins → green; full suite; commit**

```bash
npx vitest run --project server server/__tests__/viewRouteContracts.test.js   # PASS — incl. /overdue/i full-absence
npm test                                                                      # all green
git add server/routes/my-work.js server/views/my-work.html server/__tests__/viewRouteContracts.test.js .superpowers/sdd/progress.md
git commit -m "fix(item16-pr2): F30+F25 — delete dormant chapter_assignments task branch

Route: chapter_assignments SELECT + assignment-task builder removed
(table stays — migration territory; user_chapter_assignments RBAC is a
different, live table). View: STAGE_LABELS, getDueDateText, stageLabel/
dueDate arms, quickStats.overdue alert branches (never emitted by the
route), orphan CSS. quickStats.totalTasks now counts only real
changes-requested work — the number may drop; that is dead weight
removed, not a regression.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `chapter-label.js` UMD display helper (TDD)

**Files:**
- Create: `server/public/js/chapter-label.js`
- Create: `server/__tests__/chapterLabelClient.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: browser global `chapterLabel` + CJS export with exactly two functions — `full(value)` → `'Viðaukar' | 'Kafli N'` and `compact(value)` → `'Við.' | 'KN'`, both accepting the dialects `-1 | '-1' | 'appendices' | N | 'N'` and falling back to legacy concatenation (`'Kafli ' + String(value)` / `'K' + String(value)`) on unrecognized input. Tasks 5–7 call `chapterLabel.full(...)` / `chapterLabel.compact(...)`.

- [ ] **Step 1: Write the failing test file** `server/__tests__/chapterLabelClient.test.js`:

```js
/**
 * server/public/js/chapter-label.js — client-side chapter DISPLAY labels
 * (item 16 PR2, I14-R9). Display half of the item-14 appendices contract:
 * -1 | '-1' | 'appendices' → 'Viðaukar' (compact 'Við.'); integers →
 * 'Kafli N' (compact 'KN'); unrecognized input falls back to legacy
 * concatenation. Conversion half (dirs/argv) lives in server/lib/
 * chapterLabel.js — separate module, do not merge.
 *
 * Also carries the static adoption pins (structuralBackstopWiring style):
 * every swept view/JS file must include the helper and build labels
 * through it, never by raw concatenation.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { full, compact } = require('../public/js/chapter-label');

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

describe('full()', () => {
  it('maps every appendices dialect to Viðaukar', () => {
    expect(full(-1)).toBe('Viðaukar');
    expect(full('-1')).toBe('Viðaukar');
    expect(full('appendices')).toBe('Viðaukar');
  });

  it('renders numbered chapters as Kafli N (string or number)', () => {
    expect(full(5)).toBe('Kafli 5');
    expect(full('12')).toBe('Kafli 12');
    expect(full(0)).toBe('Kafli 0'); // ch00 front-matter is real
  });

  it('falls back to legacy concatenation on unrecognized input', () => {
    expect(full('x')).toBe('Kafli x');
  });
});

describe('compact()', () => {
  it('maps every appendices dialect to Við.', () => {
    expect(compact(-1)).toBe('Við.');
    expect(compact('-1')).toBe('Við.');
    expect(compact('appendices')).toBe('Við.');
  });

  it('renders numbered chapters as KN — no space, matching existing K5-style tags', () => {
    expect(compact(5)).toBe('K5');
    expect(compact('12')).toBe('K12');
  });

  it('falls back to legacy concatenation on unrecognized input', () => {
    expect(compact('x')).toBe('Kx');
  });
});

describe('UMD contract', () => {
  it('module is requirable from CJS and exports full + compact', () => {
    const mod = require('../public/js/chapter-label');
    expect(typeof mod.full).toBe('function');
    expect(typeof mod.compact).toBe('function');
  });
});
```

(Adoption-pin describes are appended by Tasks 5–7.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --project server server/__tests__/chapterLabelClient.test.js`
Expected: FAIL — `Cannot find module '../public/js/chapter-label'`.

- [ ] **Step 3: Write the helper** `server/public/js/chapter-label.js`:

```js
/**
 * Canonical chapter DISPLAY labels for editor UIs (item 16 PR2, I14-R9).
 *
 * Display half of the item-14 appendices contract: server memory and every
 * DB column carry the NUMBER -1 for the appendices chapter. This module
 * turns that value — plus the dialects UI code actually receives ('-1'
 * from <select> values, 'appendices' from analytics events, numeric
 * strings) — into the human labels:
 *   full():    'Viðaukar' | 'Kafli N'
 *   compact(): 'Við.'     | 'KN'
 * Unrecognized values fall back to legacy concatenation so no call site
 * renders a blank it didn't render before.
 *
 * The conversion half (disk dirs / CLI argv) is server/lib/chapterLabel.js
 * — a separate concern; do not merge the two modules.
 *
 * UMD: browser global `chapterLabel` + CommonJS module.exports,
 * same pattern as segment-validation.js.
 */
(function (root) {
  'use strict';

  // Mirrors server/lib/chapterLabel.normalizeChapter's dialect acceptance.
  function normalize(value) {
    if (value === 'appendices') return -1;
    if (typeof value === 'number') return Number.isInteger(value) ? value : null;
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
      return parseInt(value.trim(), 10);
    }
    return null;
  }

  function full(value) {
    var n = normalize(value);
    if (n === -1) return 'Viðaukar';
    return 'Kafli ' + (n === null ? String(value) : n);
  }

  function compact(value) {
    var n = normalize(value);
    if (n === -1) return 'Við.';
    return 'K' + (n === null ? String(value) : n);
  }

  var api = { full: full, compact: compact };
  if (typeof root !== 'undefined') root.chapterLabel = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run to verify green; full suite; commit**

```bash
npx vitest run --project server server/__tests__/chapterLabelClient.test.js   # PASS
npm test                                                                       # all green
git add server/public/js/chapter-label.js server/__tests__/chapterLabelClient.test.js .superpowers/sdd/progress.md
git commit -m "feat(item16-pr2): chapter-label.js UMD display helper (Viðaukar/Við.)

Client-side display half of the item-14 appendices contract; unit-tested
across all input dialects. segment-validation.js UMD pattern.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: I14-R9 adoption — `my-work.html` (6 sites + include)

**Files:**
- Modify: `server/views/my-work.html` (include ~:1167; sites at post-Task-3 positions near :1382, :1434, :1581, :1610, :1755, :1852)
- Test: `server/__tests__/chapterLabelClient.test.js` (append pins)

**Interfaces:**
- Consumes: `chapterLabel.full/compact` (Task 4); the collapsed render functions (Task 3).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing adoption pins** (append to `chapterLabelClient.test.js`):

```js
describe('adoption — my-work.html', () => {
  it('loads the helper before the inline script', () => {
    expect(read('views/my-work.html')).toMatch(/src="\/js\/chapter-label\.js"/);
  });

  it('builds every chapter label through the helper', () => {
    const src = read('views/my-work.html');
    expect(src).not.toMatch(/Kafli ' \+/);
    expect(src).not.toMatch(/' K' \+/);
    expect((src.match(/chapterLabel\.(full|compact)\(/g) || []).length).toBeGreaterThanOrEqual(6);
  });
});
```

Run: `npx vitest run --project server server/__tests__/chapterLabelClient.test.js` — Expected: FAIL (no include, raw concatenations present).

- [ ] **Step 2: Add the include** — in the `<script src>` block (~:1165-1167), after `/js/htmlUtils.js` and before the inline `<script>`:

```html
  <script src="/js/chapter-label.js"></script>
```

- [ ] **Step 3: Swap the six sites** (line numbers are pre-Task-3-drift approximations — locate by pattern):

| Site | Before (decoded) | After |
|---|---|---|
| renderCurrentTask title | `task.bookLabel + ' - Kafli ' + task.chapter + ', ' + task.section` | `task.bookLabel + ' - ' + chapterLabel.full(task.chapter) + ', ' + task.section` |
| renderUpNext title | `task.bookLabel + ' K' + task.chapter + '/' + task.section` | `task.bookLabel + ' ' + chapterLabel.compact(task.chapter) + '/' + task.section` |
| renderSubmissions (~:1581) | `'…text">Kafli ' + s.chapter + ', hluti ' + s.section + '…'` | `'…text">' + chapterLabel.full(s.chapter) + ', hluti ' + s.section + '…'` |
| renderChangesRequested (~:1610) | same pattern with `r.chapter` | `chapterLabel.full(r.chapter)` |
| attention-item meta (~:1755) | `(item.chapter ? 'Kafli ' + item.chapter : '')` | `(item.chapter ? chapterLabel.full(item.chapter) : '')` — guard unchanged |
| ready-list title (~:1852) | `'…title">Kafli ' + item.chapter + ' / ' + escapeHtml(item.moduleId) + '…'` | `'…title">' + chapterLabel.full(item.chapter) + ' / ' + escapeHtml(item.moduleId) + '…'` — the `/editor?chapter=` URL line above uses `item.chapter` as a VALUE; leave it raw |

- [ ] **Step 4: Green + full suite + commit**

```bash
npx vitest run --project server server/__tests__/chapterLabelClient.test.js   # PASS
npm test                                                                       # all green (incl. viewRouteContracts)
git add server/views/my-work.html server/__tests__/chapterLabelClient.test.js .superpowers/sdd/progress.md
git commit -m "fix(item16-pr2): I14-R9 — adopt chapter-label helper in my-work.html (6 sites)

Appendices tasks/submissions/attention items/ready list now render
Viðaukar/Við. instead of 'Kafli -1'/'K-1'.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: I14-R9 adoption — `admin.html` (5 sites) + `assignments.js` (2 sites)

**Files:**
- Modify: `server/views/admin.html` (include ~:554; sites :790, :805, :813, :1318, :1335)
- Modify: `server/public/js/assignments.js` (:95, :133-135)
- Modify: `server/views/assignments.html` (include, before the `assignments.js` line at ~:68)
- Test: `server/__tests__/chapterLabelClient.test.js` (append pins)

**Interfaces:**
- Consumes: `chapterLabel.full/compact` (Task 4).
- Produces: nothing downstream.

⚠️ `admin.html` inline JS uses literal `\uXXXX` escapes for Icelandic (e.g. `fjarlægður` is stored escaped). Modify ONLY the label-construction portion of each line; leave every surrounding byte untouched.

- [ ] **Step 1: Write the failing pins** (append to `chapterLabelClient.test.js`):

```js
describe('adoption — admin.html + assignments', () => {
  it('admin.html includes the helper and uses it at all five sites', () => {
    const src = read('views/admin.html');
    expect(src).toMatch(/src="\/js\/chapter-label\.js"/);
    expect(src).not.toMatch(/Kafli ' \+/);
    expect(src).not.toMatch(/K' \+ ev\.chapter/);
    expect(src).not.toMatch(/K' \+ item\.chapter/);
    expect(src).not.toMatch(/">K' \+/);
    expect((src.match(/chapterLabel\.(full|compact)\(/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  it('assignments.js + its view', () => {
    const js = read('public/js/assignments.js');
    expect(js).not.toMatch(/Kafli ' \+/);
    expect(js).not.toMatch(/K' \+/);
    expect((js.match(/chapterLabel\.(full|compact)\(/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(read('views/assignments.html')).toMatch(/src="\/js\/chapter-label\.js"/);
  });
});
```

Sanity note before running: `'Kafli opnaður: ' + loc` (admin.html static prefix, KEEP) does **not** match `/Kafli ' \+/` — the space after "Kafli" is followed by "o", not a quote. Run the suite — Expected: FAIL.

- [ ] **Step 2: admin.html — include + 5 swaps**

Include after `/js/htmlUtils.js` (~:554), before the inline `<script>`.

| Site | Before (decoded) | After |
|---|---|---|
| :790 chapter-tag | `'<span class="chapter-tag">K' + ch + '<span class="remove-ch" onclick="usersRemoveChapter(…',' + ch + ')"…'` | `'<span class="chapter-tag">' + chapterLabel.compact(ch) + '<span class="remove-ch" onclick=…'` — onclick keeps raw `ch` (value, not label) |
| :805 assign toast | `showToast('Kafli ' + chapter + ' úthlutaður','success')` | `showToast(chapterLabel.full(chapter) + ' úthlutaður','success')` (spec-missed twin of :813; the `min="1"` input guard means -1 can't arrive here today — swap is for consistency + the pins) |
| :813 remove toast | `showToast('Kafli ' + chapter + ' fjarlægður','success')` | `showToast(chapterLabel.full(chapter) + ' fjarlægður','success')` — the DELETE fetch URL above uses raw `chapter`; leave it |
| :1318 top-content | `(item.chapter ? ' / K' + item.chapter : '')` | `(item.chapter ? ' / ' + chapterLabel.compact(item.chapter) : '')` (spec-missed; same reader-analytics provenance as :1335) |
| :1335 anGetEventDesc | `if (ev.chapter) parts.push('K' + ev.chapter);` | `if (ev.chapter) parts.push(chapterLabel.compact(ev.chapter));` (analytics may carry `'appendices'` — normalize handles it) |

Leave untouched: `placeholder="Kafli nr."` (:746), `<th>Kafli</th>` (:383), `'Kafli opnaður: '` (:1340), `Hefur viðauka` checkbox (:481).

- [ ] **Step 3: assignments.js — 2 swaps + view include**

```js
// :95 BEFORE:
      const title = ch.titleIs || ch.title || 'Kafli ' + ch.chapter;
// AFTER:
      const title = ch.titleIs || ch.title || chapterLabel.full(ch.chapter);

// :133-135 BEFORE (prettier multiline):
        '<td>K' +
        escapeHtml(String(ch.chapter)) +
        '</td>' +
// AFTER:
        '<td>' +
        escapeHtml(chapterLabel.compact(ch.chapter)) +
        '</td>' +
```

(`ch.chapter` is `-1` for appendices in production TODAY — `segmentParser.listChapters` emits it — so this fixes a live "K-1"/"Kafli -1" rendering, not a latent one.)

In `server/views/assignments.html`, insert `<script src="/js/chapter-label.js"></script>` immediately before the `<script src="/js/assignments.js"></script>` line (~:68).

- [ ] **Step 4: Green + full suite + commit**

```bash
npx vitest run --project server server/__tests__/chapterLabelClient.test.js   # PASS
npm test                                                                       # all green
git add server/views/admin.html server/public/js/assignments.js server/views/assignments.html server/__tests__/chapterLabelClient.test.js .superpowers/sdd/progress.md
git commit -m "fix(item16-pr2): I14-R9 — adopt chapter-label helper in admin.html + assignments (7 sites)

Includes two spec-missed admin sites (assign-toast :805, top-content
:1318). assignments.js already receives chapter -1 in production —
'K-1' there was a live bug, not latent.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: I14-R9 adoption — latent sites: `books.html` (6) + `localization-editor.js` (3)

**Files:**
- Modify: `server/views/books.html` (include ~:1446; sites :1785, :1864-1866, :1871, :1916, :2304, :2321)
- Modify: `server/public/js/localization-editor.js` (:358-371, :549-553, :1749-1758)
- Modify: `server/views/localization-editor.html` (include before `/js/localization-editor.js` at ~:2078)
- Test: `server/__tests__/chapterLabelClient.test.js` (append pins)

**Interfaces:**
- Consumes: `chapterLabel.full/compact` (Task 4).
- Produces: nothing downstream.

Background: books.html sites can't receive `-1` today (book registration seeds no appendices row — register I16-R3) — mechanical future-proofing per spec §4. The two loc-editor `edLoadChapters`/`edRenderModule` sites DO receive `-1` today and already special-case it inline — the swap *dedups* those ternaries into the helper. Mixed encodings: loc-editor has raw `Viðaukar` at :366 but escaped at :553; books.html inline JS uses `\uXXXX` escapes throughout.

- [ ] **Step 1: Write the failing pins** (append to `chapterLabelClient.test.js`):

```js
describe('adoption — latent sites (books.html, localization-editor.js)', () => {
  it('books.html includes the helper and uses it at all six sites', () => {
    const src = read('views/books.html');
    expect(src).toMatch(/src="\/js\/chapter-label\.js"/);
    expect(src).not.toMatch(/Kafli ' \+/);
    expect(src).not.toMatch(/K\. ' \+/);
    expect((src.match(/chapterLabel\.(full|compact)\(/g) || []).length).toBeGreaterThanOrEqual(6);
  });

  it('localization-editor.js + its view', () => {
    const js = read('public/js/localization-editor.js');
    expect(js).not.toMatch(/Kafli ' \+/);
    expect((js.match(/chapterLabel\.(full|compact)\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(read('views/localization-editor.html')).toMatch(/src="\/js\/chapter-label\.js"/);
  });
});
```

Run — Expected: FAIL. (books.html's prettier-multiline concatenations still contain `Kafli ' +` / `K. ' +` on single lines, so the patterns match the raw source.)

- [ ] **Step 2: books.html — include + 6 swaps**

Include after `/js/htmlUtils.js` (~:1446), before the inline `<script>` at :1447.

| Site | Before (decoded, prettier multiline) | After |
|---|---|---|
| :1785 chapter-card | `'<span class="chapter-card-num">K. ' + ch.chapterNum + '</span>'` | `'<span class="chapter-card-num">' + chapterLabel.compact(ch.chapterNum) + '</span>'` — **cosmetic: "K. 5" → "K5"; flag in PR description.** The `onclick` above passes raw `ch.chapterNum` — keep |
| :1864-1866 breadcrumb | `'<span class="breadcrumb-current">Kafli ' + chapterNum + '</span>'` | `'<span class="breadcrumb-current">' + chapterLabel.full(chapterNum) + '</span>'` |
| :1871 detail title | `titleEl.textContent = 'Kafli ' + chapterNum;` | `titleEl.textContent = chapterLabel.full(chapterNum);` |
| :1916 sections title | `'Kafli ' + chapterNum + ': ' + (data.chapter.titleIs \|\| data.chapter.titleEn)` | `chapterLabel.full(chapterNum) + ': ' + (data.chapter.titleIs \|\| data.chapter.titleEn)` |
| :2304 cv option | `'<option value="' + ch.chapter + '">Kafli ' + ch.chapter + '</option>'` | `'<option value="' + ch.chapter + '">' + chapterLabel.full(ch.chapter) + '</option>'` — option *value* stays raw |
| :2321 cv title | `…textContent = 'Kafli ' + chapter;` | `…textContent = chapterLabel.full(chapter);` (arrives as a STRING from the select — normalize handles `'-1'`) |

Static text (`<th>Kafli</th>` :860, `<h3 …>Kafli</h3>` :957 placeholder, `<label>Kafli</label>` :1136, section header :1183, `Veldu kafla...`) stays.

- [ ] **Step 3: localization-editor.js — 3 swaps + view include**

(a) `edLoadChapters` :358-371 — replace the inline ternary block:

```js
// BEFORE (decoded):
          var num = ch.chapter != null ? ch.chapter : ch;
          var label = ch.titleIs || ch.title;
          var opt = document.createElement('option');
          opt.value = num;
          opt.textContent =
            num === -1
              ? label || 'Viðaukar'
              : label
                ? 'Kafli ' + num + ' — ' + label
                : 'Kafli ' + num;
// AFTER (identical semantics, helper-backed):
          var num = ch.chapter != null ? ch.chapter : ch;
          var label = ch.titleIs || ch.title;
          var base = chapterLabel.full(num);
          var opt = document.createElement('option');
          opt.value = num;
          opt.textContent = label ? (num === -1 ? label : base + ' — ' + label) : base;
```
(Semantics check: -1+label → label; -1 no label → 'Viðaukar'; N+label → 'Kafli N — label'; N alone → 'Kafli N'. The ` — ` em-dash: match the file's byte form.)

(b) `edRenderModule` :549-553:

```js
// BEFORE (the 'Viðaukar' here is stored as an escape sequence):
      (edModuleData.chapter === -1 ? 'Viðaukar' : 'Kafli ' + edModuleData.chapter) +
// AFTER:
      chapterLabel.full(edModuleData.chapter) +
```

(c) `rvLoadChapters` :1749-1758 (prettier multiline):

```js
// BEFORE:
          '">Kafli ' +
          ch.chapter +
          ': ' +
// AFTER:
          '">' +
          chapterLabel.full(ch.chapter) +
          ': ' +
```

In `server/views/localization-editor.html`, insert `<script src="/js/chapter-label.js"></script>` immediately before the `/js/localization-editor.js` include (~:2078).

- [ ] **Step 4: Green + full suite + commit**

```bash
npx vitest run --project server server/__tests__/chapterLabelClient.test.js   # PASS
npm test                                                                       # all green
git add server/views/books.html server/public/js/localization-editor.js server/views/localization-editor.html server/__tests__/chapterLabelClient.test.js .superpowers/sdd/progress.md
git commit -m "fix(item16-pr2): I14-R9 — adopt chapter-label helper at latent sites (books, loc-editor)

books.html future-proofed (no -1 rows exist yet — I16-R3); loc-editor's
two live inline -1 ternaries deduped into the helper. Cosmetic: chapter
cards now 'K5' not 'K. 5'.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Contract doc update, full verification, PR

**Files:**
- Modify: `docs/technical/view-route-contracts.md` (dashboard + my-work endpoint shapes)
- No code changes.

**Interfaces:**
- Consumes: everything above.
- Produces: the PR.

- [ ] **Step 1: Update `docs/technical/view-route-contracts.md`** (PR1 pinned this doc as the contract source of truth — it must not drift):
  - `/api/status/dashboard` section (~:54-56): remove `overdueCount` from the documented `needsAttention` shape.
  - `/api/my-work` + `/api/my-work/today` section (~:75-87): tasks now contain **only** `type: 'changes_requested'`; `quickStats.totalTasks === changesRequested count`; remove any assignment-task/`quickStats.overdue` mentions. Read the section and align it to the post-Task-3 route.

- [ ] **Step 2: Full verification**

```bash
npm test                        # repo root — expect ~2960+ green (2921 baseline + new pins/units)
cd server && npx playwright test  # full E2E; smoke 'home (my-work) loads without errors' is the
                                  # zero-pageerror gate proving no dangling references survived.
                                  # (If a narrower e2e script exists in server/package.json, full run still preferred pre-PR.)
cd ..
```
Expected: all green. If smoke fails with a ReferenceError, a deleted symbol still has a live reference — fix before proceeding (grep the symbol, re-run).

- [ ] **Step 3: Commit docs, push, open the PR**

```bash
git add docs/technical/view-route-contracts.md .superpowers/sdd/progress.md
git commit -m "docs(item16-pr2): align view-route-contracts.md with removed fields

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin fix/item16-pr2-dead-code-and-labels
```

PR title: `fix(item16): PR2 — dead-code removals (F28/F29/F30+F25) + I14-R9 appendix label sweep`

PR body must include:

**Honest consequences (intended, not regressions):**
- `quickStats.totalTasks` may drop — assignment dead weight removed (route never had live rows feeding real UI).
- Blocked attention items' "Skoða" now navigates to `/progress` (was retired `/issues`).
- books.html chapter cards render `K5` instead of `K. 5` (compact-label unification).
- Appendices render as `Viðaukar`/`Við.` instead of `Kafli -1`/`K-1` across my-work, assignments, admin (live fixes), books + loc-editor (latent).

**Manual QA click-through (spec §5):**
- Personal dashboard (`/`): console clean; changes-requested alert still appears; no Tímafrestur tile; no blocked banner; appendix work items say "Viðaukar".
- Admin attention panel: three stat tiles; blocked item click → `/progress`.
- Assignments page: appendix row shows `Við.` and `Viðaukar` fallback title.
- Admin → user chapters: appendix tag `Við.`; remove-toast says "Fjarlægt: Viðaukar" (final-review fix — agreement-free supine phrasing, not "Viðaukar fjarlægður").
- Books page: cards `K5`; chapter detail `Kafli N`; cv-panel dropdown labels unchanged.
- Loc-editor: chapter dropdowns unchanged incl. Viðaukar entries.

End the body with: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

- [ ] **Step 4: Campaign-convention final review before merge** — run the adversarial final-review pass (per-finding verify) as done for items 12–16 PR1; triage findings with the lead where product-facing.

---

### Task 9 (post-merge, on `main`): campaign-doc markers + register + memory

**Files:**
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md`
- Modify: `.superpowers/sdd/progress.md`

All I16-R1..R7 register entries ALREADY exist (PR1's commit `2c2995fd` recorded the full block — the spec §4 "ride PR2" staging is stale). PR2 adds no R1–R7 edits.

- [ ] **Step 1: Item-16 status line** (line ~102) — replace the tail
`**PR2 pending (next session): F28/F29/F30+F25 removals + I14-R9 appendix label sweep (chapter-label.js UMD helper, "Viðaukar"/"Við.").**`
with (fill in real PR#/sha/suite counts):
`**✅ MERGED PR2 #NNN (2026-07-XX, main \`sha\`, suite NNNN/NNN):** F28/F29/F30+F25 dead-UI removals (absence-pinned in viewRouteContracts) + I14-R9 chapter-label.js UMD display helper ("Viðaukar"/"Við.", compact KN) adopted at required (my-work ×6, admin ×5, assignments ×2) + latent (books ×6, loc-editor ×3) sites; view-route-contracts.md updated.`
Keep the ` Register I16-R1..R7 below.` tail.

- [ ] **Step 2: I14-R9 done-marker** (line ~137) — append to the I14-R9 register line:
` **✅ DONE — item 16 PR2 (MERGED PR #NNN, 2026-07-XX):** chapter-label.js UMD display helper adopted at all required + latent sites; pinned by chapterLabelClient.test.js.`

- [ ] **Step 3: New register entries** — add a sibling heading under the item-16 register block:

```markdown
### Register — findings/deferrals from item 16 PR2 (2026-07-XX)
- **I16-R8 `[cleanup]`** — books.html still carries 5 retired `/issues` view links (:2020, :2060, :2327, :2441, :2479) + 2 dead `/api/issues` fetches (:1997, :2418) — same retired-route class as F29, different file; the books-page issues panels have been dead since the 2026-03-24 legacy purge. Sweep with the next books.html pass.
- **I16-R9 `[ux]`** — admin `#assign-chapter` input has `min="1"` + a `chapter < 1` guard, so appendices (-1) can't be assigned from the admin modal even though the server accepts them since I14-R1a (#302). Widen when admin-side appendix assignment is wanted.
```
(plus any I16-R10+ from the final review.)

- [ ] **Step 4: progress.md merged line** — append: `PR #NNN MERGED — main <sha>, 2026-07-XX. Item 16 COMPLETE (PR1 #303 + PR2 #NNN). NEXT: <next campaign item per docs/plans/2026-07-11-pre-semester-coding-campaign.md Phase 3>.`

- [ ] **Step 5: Commit on main + push**

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md .superpowers/sdd/progress.md
git commit -m "docs(campaign): item 16 PR2 merged (#NNN); registers I16-R8/R9; I14-R9 done

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git fetch origin && git push   # fetch first — post-merge push gotcha (memory: deploy-infrastructure)
```
