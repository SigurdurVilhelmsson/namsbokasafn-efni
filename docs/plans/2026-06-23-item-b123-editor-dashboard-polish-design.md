# Items B-1/B-2/B-3 — editor & dashboard UX polish (design)

**Date:** 2026-06-23
**Items:** B-1, B-2, B-3 from [`2026-06-23-live-qa-followup-efni.md`](2026-06-23-live-qa-followup-efni.md) § B.
**Scope:** `server/public/js/segment-editor.js` + `server/routes/segment-editor.js` (B-1); `server/views/my-work.html` (B-2, B-3). No schema/contract change.

Three independent UI fixes grouped into one branch. All user-facing copy is Icelandic.

---

## B-1 — Editor header/breadcrumb shows the Icelandic title

**Problem.** The editor header (`segment-editor.js:527`) and topbar breadcrumb (`:558`) show `moduleData.title`, which is `structure.title.text` — the **English** title from extraction. The single-module API (`loadModuleForEditing`, `segmentParser.js:272`) returns only `title`, no `titleIs` — even though the module *list* already gets `titleIs` via `bookDataLoader.enrichModules`.

**Fix (scope: editor only).**
- **Backend** — `server/routes/segment-editor.js`, the `GET /:book/:chapter/:moduleId` handler (~:286): enrich the response with `titleIs` using the existing loader, without clobbering `data.title`:
  ```js
  const meta = [{ moduleId: req.params.moduleId }];
  enrichModules(req.params.book, meta); // sets meta[0].titleIs (+ title/section)
  res.json({ ...data, titleIs: meta[0].titleIs, edits: editsBySegment, stats, otherPendingSegments });
  ```
  (`enrichModules` is already imported at `:61`.)
- **Frontend** — `segment-editor.js`: header (`:527`) and breadcrumb (`:558`) use `moduleData.titleIs || moduleData.title || moduleData.moduleId`. The module-list already does this (`:228`); the header now matches.

**Out of scope:** the my-work task card (shows `module_id` for changes-requested tasks) — deliberately left as-is per the scope decision.

---

## B-2 — "Today" empty-state is queue-aware

**Problem.** `renderCurrentTask(null)` (`my-work.html:1322`) always shows "Ekkert verkefni í dag! … Slakaðu á" — even for an admin/head-editor with a non-empty review queue (the same payload carries `adminStats.globalPendingCount` and `readyToApplyCount`, shown in the quick-stats).

**Fix.** Extract the empty-state message into a pure helper and make `renderCurrentTask` queue-aware.

- New pure function (exposed on `window` for tests):
  ```js
  // Returns { heading, body, actionLabel?, actionHref? } for the no-task state.
  function buildEmptyTaskMessage(isReviewer, pendingCount, readyCount) {
    if (isReviewer && pendingCount > 0) {
      return {
        heading: 'Engin ritstjórnarverkefni í dag',
        body: pendingCount + (pendingCount === 1 ? ' breyting bíður' : ' breytingar bíða') + ' úrskurðar þíns.',
        actionLabel: 'Skoða úrlausnir',
        actionHref: '/editor?view=reviews',
      };
    }
    if (isReviewer && readyCount > 0) {
      return {
        heading: 'Engin ritstjórnarverkefni í dag',
        body: readyCount + (readyCount === 1 ? ' samþykkt breyting bíður' : ' samþykktar breytingar bíða') + ' birtingar.',
        actionLabel: 'Skoða úrlausnir',
        actionHref: '/editor?view=reviews',
      };
    }
    return {
      heading: 'Ekkert verkefni í dag!',
      body: 'Þú hefur lokið öllum verkefnum. Slakaðu á eða biddu eftir nýjum úthlutunum.',
    };
  }
  ```
- `renderCurrentTask(task, todayData)` — when `!task`, compute `isReviewer = !!todayData.adminStats && (role admin|head-editor)`, `pending = todayData.adminStats?.globalPendingCount || 0`, `ready = todayData.adminStats?.readyToApplyCount || 0`, call the helper, and render heading + body + optional action button (`<a class="btn btn-primary btn-sm" href=...>`). The celebratory 🎉 icon shows only for the relax case (no action).
- Update the call site (`:1282`) to `renderCurrentTask(todayData.currentTask, todayData)`.

---

## B-3 — Clarify the "Tilbúið að beita" label

**Problem.** The quick-stat label "Tilbúið að beita" (`my-work.html:1298`, for `readyToApplyCount`) is opaque to a teacher-editor — it means "approved edits not yet applied/published".

**Fix.**
- Quick-stat label (`:1298`): change to **`Samþykkt, bíður birtingar`**, and set a tooltip on the stat item:
  ```js
  document.querySelector('#quick-stats .quick-stat-item:nth-child(2) .quick-stat-label').textContent = 'Samþykkt, bíður birtingar';
  document.querySelector('#quick-stats .quick-stat-item:nth-child(2)').title = 'Samþykktar breytingar sem á eftir að beita og birta (Vista + Birta)';
  ```
- The matching list empty-state (`:1796`, "Ekkert tilbúið að beita") → **`Ekkert bíður birtingar`** (consistency).
- Leave the unrelated "Tilbúið til úthlutunar" heading (`:1114`) untouched — different concept (ready-for-assignment).

---

## Testing

- **B-1 (E2E, `segment-editor.spec.js`):** load efnafraedi-2e ch01, capture the first module card's displayed title (the list already shows `titleIs`), open that module, assert the editor header (`#…` title element) shows the **same** Icelandic title — and does not equal the raw `mNNNNN` id.
- **B-2 (unit via `page.evaluate`):** expose `buildEmptyTaskMessage`; on `/` assert: `(true, 14, 0)` → heading "Engin ritstjórnarverkefni í dag", body contains "14" + "úrskurðar", actionHref `/editor?view=reviews`; `(true, 0, 3)` → body contains "birtingar"; `(false, 0, 0)` and `(true, 0, 0)` → "Ekkert verkefni í dag!", no action. Singular/plural variants for count 1.
- **B-3 (E2E, `smoke.spec.js` or a my-work spec):** loginAs head-editor, goto `/`, assert the 2nd quick-stat label reads "Samþykkt, bíður birtingar" and the stat item has the tooltip `title`.

## Out of scope (YAGNI)

my-work task-card titles (B-1); any change to what counts as pending/ready (read-model untouched); restyling the quick-stats; the "Tilbúið til úthlutunar" panel.
