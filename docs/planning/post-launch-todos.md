# Post-Launch TODOs — Summer 2026 Sprint

Architectural improvements deferred from the March 2026 comprehensive audit. These are real concerns but not blockers for initial launch with ~5 editors. Better to launch, gather feedback, then improve.

**Context:** Reviewed during audit planning (2026-03-14). System foundation is sound for current scale (1-2 developers, ~5 editors, 3 books). These items address structural improvements for long-term maintainability.

---

## ~~Priority 1: Extract Inline JS from View Files~~ DONE (2026-03-14)

Completed in commits `3ea608c` (segment-editor) and `b75ed4b` (localization-editor). Extracted ~1,727 and ~1,685 lines of inline JS into `server/public/js/segment-editor.js` and `server/public/js/localization-editor.js`. HTML files reduced from ~2,939→1,211 and ~3,036→1,350 lines respectively. All 352 Vitest + 93 E2E tests pass.

---

## Priority 2: UI String Constants File

**Problem:** All user-facing text is hardcoded Icelandic throughout 11 view files. Fixing i18n issues requires grepping across all files. Activity log descriptions are hardcoded in route handlers. No way to see all UI strings in one place.

**Solution:** Create `server/ui-strings.js` with all user-facing text organized by page/context. View files reference constants instead of inline strings. Activity log descriptions use the same constants.

**Effort:** ~2 days (mostly mechanical extraction)
**Trigger:** If i18n issues keep recurring after the audit's i18n sweep.

---

## Priority 3: Offline Resilience & Draft Visibility

**Problem:** Drafts are in `localStorage` (browser-specific, clearable). No way to work offline and sync later. If the server restarts during a save, the retry queue handles it, but the user experience is unclear.

**Solution:**
- Add a visible "last saved" timestamp in the editor
- Add a more prominent draft indicator (e.g., "Drög vistuð staðbundið" with timestamp)
- Consider IndexedDB for more reliable local storage (if localStorage proves fragile)

**Effort:** ~1 day
**Trigger:** If editors report lost work or confusion about save state.

---

## Priority 4: Cross-Repo CSS Contract Test

**Problem:** `namsbokasafn-efni` (content pipeline) and `namsbokasafn-vefur` (public website) share a CSS contract — rendered HTML relies on `/static/styles/content.css` from the vefur repo. Changes to class names or structure in either repo can break rendering.

**Solution:** A post-render smoke test that loads generated HTML with the actual CSS file and checks for:
- All expected CSS classes have matching rules
- No broken layouts (missing grid/flex parents)
- Images and math render at correct sizes

**Effort:** ~1 day
**Trigger:** If a CSS change in one repo breaks rendering in the other.

---

## Priority 5: Full Pass 2 (Localization) Polish

**Problem:** Pass 2 (localization editor) launched with minimal testing (8 E2E tests, many skip). It has a separate audit trail but no integration with the main activity log. No clear UX guidance for what localization means vs translation. No "readiness gate" — unclear when a module becomes available for localization.

**Solution:**
- Define explicit readiness criteria (e.g., all modules must have `linguisticReview: complete`)
- Add UX guidance banner explaining what localization involves
- Integrate localization_edits with the main activity_log
- Write comprehensive E2E tests for the full localization workflow
- Add localization-specific validation (unit conversions, cultural references)

**Effort:** ~3-5 days
**Trigger:** When you're ready to start localization work with editors.

---

## Priority 6: Pipeline Status Consistency Validation

**Problem:** A chapter's `linguisticReview` stage could theoretically be marked "complete" while individual modules still have pending edits. The `applyApprovedEdits()` auto-advance handles the happy path, but edge cases (manual DB edits, failed applies) could create inconsistencies.

**Solution:** Add a periodic validation function that checks all chapters: verify that `linguisticReview.complete` is only true when ALL modules in the chapter have faithful translation files. Run as a scheduled job or admin tool.

**Effort:** ~0.5 days
**Trigger:** If progress dashboard shows incorrect completion states.

---

## Not Planned (Decided Against)

These were considered and explicitly rejected:

- **Full i18n framework** — Overkill for a single-language app. Constants file (Priority 2) is sufficient.
- **Merge the two repos** — They serve different purposes. Sync script works fine.
- **PostgreSQL migration** — SQLite with WAL mode is perfect for this scale.
- **Frontend framework (React/Vue/etc)** — Vanilla JS with extracted modules is more maintainable for this team.
