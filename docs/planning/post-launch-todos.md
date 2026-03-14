# Post-Launch TODOs — Summer 2026 Sprint

Architectural improvements deferred from the March 2026 comprehensive audit. These are real concerns but not blockers for initial launch with ~5 editors. Better to launch, gather feedback, then improve.

**Context:** Reviewed during audit planning (2026-03-14). System foundation is sound for current scale (1-2 developers, ~5 editors, 3 books). These items address structural improvements for long-term maintainability.

---

## ~~Priority 1: Extract Inline JS from View Files~~ DONE (2026-03-14)

Completed in commits `3ea608c` (segment-editor) and `b75ed4b` (localization-editor). Extracted ~1,727 and ~1,685 lines of inline JS into `server/public/js/segment-editor.js` and `server/public/js/localization-editor.js`. HTML files reduced from ~2,939→1,211 and ~3,036→1,350 lines respectively. All 352 Vitest + 93 E2E tests pass.

---

## ~~Priority 2: UI String Constants File~~ DONE (2026-03-14)

Completed in commit `ef92ebf`. Created `server/public/js/ui-strings.js` with ~300 lines of organized constants (save status, dialogs, validation, pipeline, labels, term lookup, history). Replaced ~105 hardcoded strings across both editor JS files. ~30 lower-priority HTML template strings remain for future extraction.

---

## ~~Priority 3: Offline Resilience & Draft Visibility~~ ALREADY DONE

Already implemented in prior work:
- **"Last saved" timestamp** — save-status-bar shows "Síðast vistað: HH:MM"
- **Draft persistence** — localStorage with tabGuard, 5s auto-save, cross-tab detection
- **Draft recovery** — prompts on reload to restore unsaved drafts
- **Server autosave** — localization editor auto-saves every 60s
- **Retry queue** — saveRetry.js handles network failures with exponential backoff
- **IndexedDB** — not needed at current scale (~5 editors)

---

## ~~Priority 4: Cross-Repo CSS Contract Test~~ DONE (2026-03-14)

Completed in commit `4684c55`. Test: `tools/__tests__/css-contract.test.js` — 3 tests validating:
- All rendered HTML classes have matching CSS rules (9 known gaps documented)
- Dead CSS selectors (28 for future content, informational only)
- CSS parse validity (balanced braces, no empty rules)
Auto-skips if vefur repo not available.

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

## ~~Priority 6: Pipeline Status Consistency Validation~~ DONE (2026-03-14)

Completed: `tools/validate-pipeline-consistency.js` — CLI tool + importable library. Checks:
- linguisticReview marked complete but faithful files missing (error)
- Faithful files without MT output (orphan warning)
- All faithful files present but stage not marked complete (info)
- Rendering marked complete but no HTML files (error)

Admin API: `GET /api/admin/validate-pipeline[?book=slug]`. 7 unit tests.

---

## Not Planned (Decided Against)

These were considered and explicitly rejected:

- **Full i18n framework** — Overkill for a single-language app. Constants file (Priority 2) is sufficient.
- **Merge the two repos** — They serve different purposes. Sync script works fine.
- **PostgreSQL migration** — SQLite with WAL mode is perfect for this scale.
- **Frontend framework (React/Vue/etc)** — Vanilla JS with extracted modules is more maintainable for this team.
