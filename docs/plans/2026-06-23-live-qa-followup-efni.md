# Follow-up session — efni editorial-server fixes (from 2026-06-23 live QA)

**Date:** 2026-06-23
**Scope:** Bugs/gaps in the **editorial server** (`server/`, this repo) found
during the post-deploy live QA. **efni-rooted session.**
**Sibling track:** reader-side items (objectives duplicate, `/markmid`, appendix
one-click, anchor occlusion) are specced in **namsbokasafn-vefur**
`docs/plans/2026-06-23-live-qa-followup-vefur.md`. Keep the two sessions separate
(cross-repo protocol).
**Item tracker:** [`2026-06-17-deferred-fixlist-items.md`](2026-06-17-deferred-fixlist-items.md) items B (B-1…B-4), K, L, M, N, O.

Live QA also **confirmed all of this session's pipeline fixes shipped and work**
(Item-D 404s, A1, A2, check-knowledge, intro links) — see
[`2026-06-22-qa-and-deploy-runbook.md`](2026-06-22-qa-and-deploy-runbook.md).
This doc is only the editorial-server residue.

Suggested order: **L** (dead feature) → **B-4** (editor marker safety) → **N**
(term scoping — editing quality) → **M** → **B-1/B-2/B-3** (UX polish) → **K**
(logout). **O** is design-heavy → defer to the editorial-throughput roadmap.

---

## L — ⚠️ Term-mining candidate queue is dead (route shadowing)

**Symptom.** `/terminology` console: `GET /api/terminology/mined-candidates?book=…`
→ **404**. The Unit-3.5 term-mining queue (PR #121–123) never worked in prod.

**Root cause (confirmed).** Express matches routes in registration order.
`server/routes/terminology.js`:
- `router.get('/:id', …)` at **line 250**
- `router.get('/mined-candidates', …)` at **line 962** (+ `POST /mined-candidates/:id/dismiss`, `/promote`)

`/:id` captures `mined-candidates` (treats it as a term id → not found → 404), so
the real routes are unreachable. Check the **POST** side too — a `POST /:id…`
before the mined-candidates POSTs would shadow them identically.

**Fix.** Move all `/mined-candidates*` routes **above** the parametric `/:id`
routes (group the mined-candidates block near the other specific GETs, e.g. after
`/export` at line 175). No logic change.

**Test (TDD).** Add a route test asserting `GET /api/terminology/mined-candidates`
resolves to the mined-candidates handler (e.g. 200/empty list for a head-editor,
**not** 404). A red-first test will fail on the current ordering. Mint a
head-editor JWT (`server/e2e/helpers/auth.js`) or use the existing rbac harness.

**Acceptance.** Endpoint returns the candidate list (not 404); the terminology
page's candidate queue populates; full suite green.

---

## M — Library page calls the removed `/api/images` endpoint → 404

**Symptom.** `/library`, on book change: `GET /api/images/efnafraedi-2e` → **404**
+ toast "Myndayfirlit ekki tiltækt: Villa: HTTP 404".

**Root cause.** `/api/images` was removed in the 2026-03-24 refocus. The
2026-06-10 fix dropped the bookSelector *auto-change* call, but a **residual**
call survives in `loadBookImages` (the library view, ~line 2844, fired from the
book `onchange`).

**Fix (decide).** Either (a) remove the dead `loadBookImages` call + its
image-overview UI (simplest — the feature was deliberately retired), or (b)
restore a real images endpoint if a book-image overview is actually wanted.
Recommend (a) unless the lead wants the feature back.

**Acceptance.** No `/api/images` request fired from `/library`; no console 404 /
error toast on book change.

---

## K — No logout affordance in the editorial-server UI

**Symptom.** No way to log out from the UI. Endpoint exists:
`POST /api/auth/logout` (clears `auth_token`, `server/routes/auth.js:191`).

**Fix.** Add a logout control (topbar/profile menu in
`server/public/js/layout.js`) that POSTs the endpoint (with the CSRF/fetch
posture used by other writes) and redirects to `/login`. Small frontend change.

**Acceptance.** A logout control is visible; clicking it clears the session and
lands on `/login`; re-accessing a gated page redirects to login.

---

## B — Editor UX (resolved from the §4 walk, 2026-06-23)

**Outcome.** The editor view itself is clean (§4b/c/e passed; the role-gating
de-jargon works — Q13 confirmed the screen changes appropriately per role). The
"confusing" impression was the **admin juggling Admin/Head-editor/Editor previews**,
not an editor-facing defect. The walk produced these concrete items:

### B-1 — Show Icelandic chapter/section titles, not English
Task header/breadcrumb shows the **English** title; the Icelandic title is
MT-translated and already in `moduleSections.titleIs`. Prefer `titleIs`, fall
back to `titleEn`. Check the API that feeds my-work/editor actually passes
`titleIs`. Frontend (+ maybe the task API). Small.

### B-2 — Contradictory "Today" empty-state
`/` shows "Ekkert verkefni í dag! … Slakaðu á" (driven by `currentTask`, an
*editing-assignment* concept) while the cards below show **head-editor queues**
(e.g. "14 til úrlausnar", "tilbúið að beita"). For someone with no editing
assignments but pending reviews, the page says "relax" while 14 items wait. Fix:
make the empty-state aware of the review queues (e.g. "No editing tasks — but 14
await your review"), or suppress "relax" when other queues are non-empty.
`views/my-work.html` ~line 1324.

### B-3 — "tilbúið að beita" label is unclear
Means "approved edits not yet applied/published" — opaque to a teacher-editor.
Relabel and/or add a one-line explanation/tooltip. `views/my-work.html`.

### B-4 — ⚠️ EN/MT marker mismatch + markers editable-but-unrecoverable
In the side-by-side editor, the **English** pane shows raw inline markers/tags
(terms, images, `[[…]]`-family) while the **MT** pane shows *rendered* forms
(bold/underline, camera icon) for the same things → confusing at first glance.
Worse: the MT markers are **editable**, editing one throws a save-validation
error (the existing marker hard-block), but there is **no undo** to restore the
segment. Fix direction: make inline markers **non-editable** (or move-only within
the segment) so they can't be corrupted, and/or render both panes consistently;
add an undo/revert for a segment edit. Highest-value editor item. `segment-editor.js`.

---

## N — Terminology suggestions not subject-scoped

**Symptom.** Term suggestions/matches pull from **all subjects** (biology,
physics, …), not just chemistry — e.g. `mole → moldvarpa`. Cross-subject noise is
counterproductive; chemistry editing should draw **only** from the Árnastofnun
chemistry set.

**Fix.** Scope terminology matching + mined suggestions to the **book's subject**
(efnafraedi-2e → chemistry). Ties into the multi-subject schema
(`terminology-redesign` work) and the overlapping-match handling. Verify
`resolveBookSubject` is applied to the suggestion/consistency paths, not just
lookup. Medium priority — directly affects editing quality.

---

## O — Auto-propagate recurring identical segments (enhancement)

**Ask.** Identical recurring segments ("By the end of this section, you will be
able to:", "Link to Learning", etc.) should **propagate an edit to all
occurrences** book-wide, with a clear "this changes it everywhere" warning.

**Notes.** Builds on the Unit-2 concordance/repetition work (which already
detects exact repetitions — `concordanceService.findRepetitions`). Design needed:
opt-in vs automatic, the cross-occurrence write + warning UX, and interaction
with per-segment approval. Enhancement / roadmap-level, not a quick fix — likely
belongs in the editorial-throughput roadmap rather than this QA follow-up.
