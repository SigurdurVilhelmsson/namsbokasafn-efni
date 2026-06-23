# Follow-up session — efni editorial-server fixes (from 2026-06-23 live QA)

**Date:** 2026-06-23
**Scope:** Bugs/gaps in the **editorial server** (`server/`, this repo) found
during the post-deploy live QA. **efni-rooted session.**
**Sibling track:** reader-side items (objectives duplicate, `/markmid`, appendix
one-click, anchor occlusion) are specced in **namsbokasafn-vefur**
`docs/plans/2026-06-23-live-qa-followup-vefur.md`. Keep the two sessions separate
(cross-repo protocol).
**Item tracker:** [`2026-06-17-deferred-fixlist-items.md`](2026-06-17-deferred-fixlist-items.md) items B2, K, L, M.

Live QA also **confirmed all of this session's pipeline fixes shipped and work**
(Item-D 404s, A1, A2, check-knowledge, intro links) — see
[`2026-06-22-qa-and-deploy-runbook.md`](2026-06-22-qa-and-deploy-runbook.md).
This doc is only the editorial-server residue.

Suggested order: **L → M → K → B2** (severity, then effort).

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

## B2 — "Editor UX confusing" (needs a focused review, then concrete items)

**Symptom.** Walking the editor as `editor` (admin role-preview), the lead found
the editor UX confusing; checklist §4 did not pass. No specifics captured.

**Approach.** This is a *discovery* item, not a coded fix yet. Log in (or seed)
a **real `editor` account** (the role-preview dropdown is client-side only — it
may show more than a real editor sees) and walk a real task. Pin down which apply:
- §4a — task header reads "Chapter N · Section title" (not raw `mNNNNN`)?
- §4b — module/track/stage jargon leaking into editor URLs/labels?
- §4c — 8-stage pipeline view / track switches visible to editors (should be hidden)?
- §4e — unclear or still-English wording?
- or overall flow/navigation.

Then file concrete, testable items. **Until specifics exist, this is the one
checklist row left open.**

**Acceptance.** A short list of concrete editor-UX fixes (or "no change needed,
the confusion was the admin-preview artifact"), each independently actionable.
