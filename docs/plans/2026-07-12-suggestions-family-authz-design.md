# Suggestions Route Family — Book-Scoping + Audit-Log Fix — Design

**Date:** 2026-07-12 · **Branch:** `fix/suggestions-family-authz` (off `main` `41105021`) · **One PR via SDD.**
**Resolves:** B1-F1 (suggestions cross-book write + activityLog shape) **and folds in B1-F2/F3** (editor-level book-scoping) *for this route family* — lead approved 2026-07-12 ("fix properly"; "if folding this in with B1-F2/F3 is simpler, do that").
**Lead decisions (2026-07-12):** Full scope (book-scope ALL routes, not just the head-editor one). Mechanism = a new `requireBookAccessForSection(resolveSectionId)` middleware. Fix, do NOT retire (the family is UI-live except `scan-book`).

## Problem (verified against code 2026-07-11/12)

`server/routes/suggestions.js` (389 lines, 10 routes) has two defects across the family:

1. **Cross-book WRITE hole (important):** `POST /scan-book/:bookSlug` (`:57`) gates on GLOBAL `requireRole(ROLES.HEAD_EDITOR)`. `scanBook(bookSlug)` (`localizationSuggestions.js:460`) selects every faithful section of that book and `scanSection` each → `DELETE FROM localization_suggestions WHERE section_id=? AND status='pending'` then re-INSERTs (`:415`). A head-editor of book A can regenerate book B's pending suggestions. (Low blast radius: advisory/regenerable/pending-only rows; but a real access-control-invariant break of the Batch-1 class.)
2. **activityLog shape bug (all 7 mutating sites):** every `activityLog.log({action, entityType, entityId, details})` call violates the service contract (`{type, userId, username, book?, chapter?, section?, description, metadata}` with `type`/`description` NOT NULL) → throws → route 500s AFTER its DB mutation already committed. Same bug + same fix as `sections.js` commit `07cd26e0`.
3. **Editor routes are un-book-scoped (B1-F2/F3 class):** the 7 EDITOR-gated routes take `:sectionId` or a suggestion `:id` and never check the owning book against the caller.

## Route inventory + target gating

| Route | Current gate | Target gate | Key |
|---|---|---|---|
| `POST /scan/:sectionId` (`:28`) | `requireRole(EDITOR)` | `requireBookAccessForSection(bySectionParam)` | sectionId |
| `POST /scan-book/:bookSlug` (`:57`) | `requireRole(HEAD_EDITOR)` | `requireHeadEditor('bookSlug')` | bookSlug |
| `GET /patterns` (`:90`) | `requireAuth` | **unchanged** (global static pattern list, no book) | — |
| `GET /:sectionId` (`:111`) | `requireRole(EDITOR)` | `requireBookAccessForSection(bySectionParam)` | sectionId |
| `GET /:sectionId/stats` (`:137`) | `requireRole(EDITOR)` | `requireBookAccessForSection(bySectionParam)` | sectionId |
| `POST /:id/accept` (`:160`) | `requireRole(EDITOR)` | `requireBookAccessForSection(bySuggestionParam)` | suggestion id |
| `POST /:id/reject` (`:196`) | `requireRole(EDITOR)` | `requireBookAccessForSection(bySuggestionParam)` | suggestion id |
| `POST /:id/modify` (`:235`) | `requireRole(EDITOR)` | `requireBookAccessForSection(bySuggestionParam)` | suggestion id |
| `POST /:sectionId/bulk` (`:289`) | `requireRole(EDITOR)` | `requireBookAccessForSection(bySectionParam)` | sectionId |
| `POST /:sectionId/sync-log` (`:342`) | `requireRole(EDITOR)` | `requireBookAccessForSection(bySectionParam)` | sectionId |

**Route ordering (must preserve):** `/patterns` (`:90`) is registered BEFORE `/:sectionId` (`:111`) so it isn't shadowed by the bare param. Do not reorder.

## New middleware — `requireBookAccessForSection(resolveSectionId)` (in `server/middleware/requireRole.js`)

Mirrors the existing `requireHeadEditorFor(resolveBook)` pattern but resolves a **section** → book+chapter, then delegates to the SAME editor chapter-assignment logic `requireBookAccess` already implements. Signature + behavior:

```js
/**
 * Book-scope a route keyed by a section (or an entity that resolves to a section).
 * resolveSectionId(req) -> a section id (number|string) or falsy/throw if absent.
 * Resolves the section's owning book+chapter via bookRegistration.getSection,
 * then applies requireBookAccess semantics: admin pass; head-editor-of-book pass;
 * editor -> chapter-assignment check (fail-open when the book has no assignments,
 * fail-closed 503 when the assignment table is unavailable).
 */
function requireBookAccessForSection(resolveSectionId) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required', ... });
    if (!hasRole(req.user.role, ROLES.EDITOR)) return res.status(403).json({ ... }); // min-role fast-fail
    let sectionId;
    try { sectionId = resolveSectionId(req); } catch (err) { return res.status(404).json({ error: err.message }); }
    if (!sectionId) return res.status(404).json({ error: 'Target not found' });
    const section = bookRegistration.getSection(parseInt(sectionId, 10));
    if (!section) return res.status(404).json({ error: 'Section not found' });
    // Populate what requireBookAccess reads, then delegate to its exact logic.
    req.params.book = section.bookSlug;
    req.chapterNum = section.chapterNum;
    return requireBookAccess()(req, res, next);
  };
}
```

**Design notes:**
- **Reuse, don't reimplement:** the admin/head-editor/editor-chapter-assignment branching + the `ASSIGNMENT_TABLE_UNAVAILABLE` → 503 fail-closed path all live in `requireBookAccess` (`requireRole.js:172`). This middleware only adds the *section→book+chapter resolution* in front of it. One new unit, no logic duplication.
- **`getSection` fields (verified):** returns `{ id, bookId, bookSlug, chapterNum, ... }` (`bookRegistration.js:738`). `bookSlug` matches `user.books[]`; `chapterNum` is what `hasChapterAccess(dbUserId, book, chapter)` expects.
- **`bookRegistration` require:** add it to `requireRole.js`'s imports (it already requires `userService`). Watch for a circular-require risk (bookRegistration → ... → requireRole?); if one exists, `require('./…')` lazily inside the function body. **The implementer must check this** (`node -e "require('./server/middleware/requireRole')"` after the edit).

## Resolvers (in `suggestions.js`)

```js
const bySectionParam = (req) => req.params.sectionId;
const bySuggestionParam = (req) => {
  const s = suggestions.getSuggestion(parseInt(req.params.id, 10)); // localizationSuggestions.js:549
  if (!s) return null;            // -> middleware 404
  return s.sectionId;             // getSuggestion returns { …, sectionId } (accept handler already uses this)
};
```

## activityLog shape fix (all 7 sites)

Mirror the `sections.js` correction (`07cd26e0`) exactly: `action`→`type`, `entityType`/`entityId`→`metadata`, `details.*`→`metadata.*`, add a human `description`, and promote `book`/`chapter`/`section` to the real top-level columns where available (queryable by `getByBook`/`getBySection`). Sites: `:34` scan, `:63` scan-book, `:166` accept, `:202` reject, `:254` modify, `:315` bulk, `:370` sync-log. **Also correct the `type` strings to real `ACTIVITY_TYPES` enum members** where one fits (avoid re-creating the B1-F7/B1-F9 off-enum-vocabulary class — check `activityLog.js` `ACTIVITY_TYPES`; if no enum member fits, add one rather than inventing an off-enum string).

## Testing

Extend the established cross-book matrix pattern (`server/__tests__/crossBookAuthz.test.js` — `app.use('/api/suggestions', require('../routes/suggestions'))` in `beforeAll`; it self-inits its `localization_suggestions` table via the service, and `activity_log`/notifications tables self-init too). New `describe` blocks:
- **scan-book:** cross-book HE → 403; owner HE → clears authz (`not-401/403` + `<500`); admin → clears; editor → 403.
- **A section-keyed route (e.g. `POST /scan/:sectionId`) and an id-keyed route (e.g. `POST /:id/accept`):** cross-book (a section/suggestion of `liffraedi-2e`, caller HE_A) → 403; owner HE_B → clears; admin → clears; **plain editor with NO assignments** → clears (fail-open — document this is the project's model, `enforce_assignments` OFF); non-existent section/suggestion id → 404.
- **activityLog regression:** an owner-case that reaches a genuine 200 proves the corrected shape actually inserts (the `type` NOT NULL column would 500 a reverted shape — same regression-insurance mechanism verified in the batch-1 review). A static guard asserting no `activityLog.log({ action:` / `entityType:` remains in `suggestions.js`.
- Seed a `book_id=2` (efnafraedi-2e) section so an HE_A-owns-it case discriminates the section resolver from a constant (mirrors the batch-1 §47 discrimination case).

Full `npm test` from repo root is the authoritative gate.

## Out of scope (record)
- B1-F2/F3's OTHER surfaces (`sections.js` status/submit-review editor-level transitions, `books.js files/scan`) — this PR resolves the editor-scoping *for the suggestions family* and establishes the reusable `requireBookAccessForSection` middleware; the sections/books surfaces adopt it in a follow-up (note in the register that the middleware now exists).
- B1-F7/B1-F9 notification/activity type-vocabulary alignment — separate batch (but DO use enum-correct `type` strings for the new suggestions activityLog calls, per above, to avoid adding to it).

## Self-review
- Every route in the inventory has a target gate; `/patterns` justified unchanged. ✅
- Mechanism reuses `requireBookAccess` (no authz-logic duplication); only adds section resolution. ✅
- Circular-require risk flagged for the implementer to verify. ✅
- Test plan covers the security property (cross-book 403), the fail-open editor model (documented), the resolver discrimination, and activityLog regression-insurance. ✅
