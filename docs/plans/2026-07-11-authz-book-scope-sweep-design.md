# Book-Scoped Authorization Sweep — Design

**Date:** 2026-07-11 · **Branch:** `fix/authz-book-scope-sweep` · **One PR.**
**Source:** 2026-07-11 server code review findings **1** (`pipeline.js:29`, High), **2** (`sections.js:627` family, High), **4** (`sections.js:156`, Medium) + **SA-11 rider** (`books.js:509`); joint-summary **Batch 1**. Campaign: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` Phase 1 item 1.
**Lead decisions (2026-07-11):** upload route → **RETIRE**; import route → **scope to head-editor-of-book**.

## Problem

Four route surfaces gate on the user's *global* role and never intersect the target book with the user's assigned books (`req.user.books[]`, populated from `userService.getHeadEditorBooks` — head-editor book slugs; plain editors carry `[]`). A head-editor (or, for two routes, any editor) of book A can act on book B.

## Changes (all verified against code 2026-07-11)

### 1. `server/routes/pipeline.js` — scope the three mutating POSTs
Keep the router-wide `router.use(requireAuth, requireRole(ROLES.HEAD_EDITOR))` at `:29` (still gates the job GETs at `:196`/`:213`). Add to each of `POST /inject` (`:66`), `POST /render` (`:110`), `POST /run` (`:153`):

```js
requireHeadEditorFor((req) => req.body?.book)
```

as route-level middleware. Behavior note (corrected 2026-07-11, whole-branch review): non-owned book → 403; absent/empty (falsy) book → 404 from the guard (middleware runs before `validateParams`' 400); a truthy-but-unowned/invalid book string still hits the ordinary membership check → 403 (not information-hiding — `requireHeadEditorFor`'s `!book` branch only fires on a falsy resolver result). Owned-but-invalid books still 400 in `validateParams`. **Job GETs stay role-gated:** job objects carry no `book` field until Batch 5's job-model fix (review finding 5) — their scoping lands there, on the record here.

### 2. `server/routes/sections.js` — head-editor action family
Routes: `assign-reviewer` (`:293`), `assign-localizer` (`:375`), `approve-review` (`:624`), `request-changes` (`:695`). Replace `requireRole(ROLES.HEAD_EDITOR)` with `requireHeadEditorFor` placed **after** `loadSection`:

```js
router.post('/:sectionId/approve-review',
  requireAuth,
  loadSection,
  requireHeadEditorFor((req) => req.sectionData?.bookSlug),
  handler)
```

**Verified field name: `bookSlug`** — `bookRegistration.getSection` (`:717`) returns a camelCase object with `bookSlug: rb.slug` (NOT `book`, NOT the numeric `bookId`); `user.books[]` holds slugs, so slug-vs-slug is the correct comparison. Internal ordering of `requireHeadEditorFor` (min-role → admin bypass → resolve → membership) preserves fast-fail for non-head-editors; the bare `requireRole` becomes redundant and is removed, not stacked. Cost: one section DB read before a plain editor's 403 — negligible. Pattern adopters to mirror: `segment-editor.js`, `localization-editor.js`.

### 3. `server/routes/sections.js` — status route's elevated branch (`:461` route, branch at `:506-514`)
The in-handler check for `review_approved`/`localization_approved` transitions becomes: ADMIN passes; HEAD_EDITOR passes only if `req.user.books?.includes(req.sectionData.bookSlug)`; otherwise 403 (same response shape as today). In-handler because the requirement is transition-conditional.

### 4. `server/routes/sections.js` — RETIRE the upload route (`:155-…`)
Delete `POST /:sectionId/upload/:uploadType` entirely, plus its now-orphaned route-local multer wiring (`multer` import `:15`, storage config `:29`, `upload` const `:78` — single consumer verified, `upload.single` at `:194` only). Rationale: zero references in `server/public/`/`server/views/`/server code; flagged by the review as a likely pre-segment-editor leftover; writes into `03-faithful-translation/`, `04-localized-content/`, and `02-mt-output/` — the last would bypass Track C's MT edit-lock (which gates only the MT CLI). Fewer write paths into protected tiers beats guarding an unused one (Track B precedent). Guard: the cross-book test asserts the route now 404s.

### 5. `server/routes/books.js` — scope the import route (`:506-…`)
`POST /:bookId/chapters/:chapter/import`: `requireEditor()` → `requireHeadEditor('bookId')`. Writes `02-for-mt/` (regenerable MT-input tier); onboarding/import is head-editor work; zero UI references today. NOTE: `:bookId` is the route param name — confirm during implementation whether its VALUE is the slug (the param is used as `bookId` in the handler; `requireHeadEditor` compares `req.params[bookParam]` against slug-holding `user.books[]`, so if the param value is numeric the guard must resolve the slug first — adjust to `requireHeadEditorFor` with a slug lookup if so).

### 6. New shared test — `server/__tests__/crossBookAuthz.test.js`
One matrix over every touched surface. Personas: head-editor-of-A (books `['book-a']`), head-editor-of-B, admin, plain editor. Cases per route: cross-book → 403; owner → passes authz (reaches next validation layer — assert NOT 401/403); admin → bypass; upload route → 404 for everyone; import route → editor 403 (was allowed before), head-editor-of-book passes authz. Mirror the established route-test setup in `server/__tests__/requireRole.test.js` / `books-routes.test.js` (JWT/user injection, no live Entra).

## Error handling
All rejections use the middleware's existing 401/403/404 JSON shapes — no new formats. No silent paths.

## Out of scope (recorded)
- Jobs GET book-scoping + job `book` field → Batch 5 (finding 5).
- Deeper sections-family retirement archaeology (beyond the upload route).
- Service-layer defense-in-depth (`pipelineService` doesn't check ownership; the review prescribes the middleware layer as the fix).

## Testing
The new matrix test + full `npm test` from repo root (authoritative gate); existing route tests must stay green.
