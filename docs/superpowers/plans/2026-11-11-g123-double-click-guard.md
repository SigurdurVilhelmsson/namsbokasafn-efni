# G1.23 double-click guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** *Nota* and *Hafna* ignore a click that comes within 500 ms of another click or of a redraw the editor did not click for, so a double click or an impatient click cannot land on a neighbouring group's *Hafna*.

**Architecture:** One capture-phase `click` listener on `document` in `segment-editor.js` starts the pause on any control click and stops a suggestion-button click during the pause before its inline `onclick` runs. The redraws that come without a click (Hafna's answer, `renderSegments`, the Escape close, `closeEditPanel`) start the pause by a direct call. `<html data-sugg-paused>` marks the pause; CSS dims the buttons; the E2E waits on it.

**Tech Stack:** browser JavaScript (the editor's IIFE), CSS in `server/views/segment-editor.html`, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-11-02-suggestion-view-design.md`, block `✏️ AMENDED 2026-11-11`.

## Global Constraints

- The pause is `SUGGESTION_PAUSE_MS = 500`, page-wide, for every `.sugg-btn` (both pairs).
- Triggers: a click on `button, a[href], [onclick], [role="button"]`; Hafna's answer (success or `SUGGESTION_UNKNOWN`); every `renderSegments()` that renders; Escape closing a pane; `closeEditPanel` (Ctrl+S reaches it with no click). Typing (`refreshSuggestionView`) does not trigger it.
- A click during the pause is stopped (`stopPropagation`, `preventDefault`) and restarts the pause. No keyboard exemption.
- Dimmed only (opacity); never `pointer-events: none`.
- Source-text pins in `server/__tests__/suggestionClientPins.test.js` stay green: keep `clearPaneState(segId);` directly followed by `refreshSuggestionView(segId);`; keep `suggestionDisplay → refreshSuggestionView → acceptSuggestionGroup` contiguous.
- Mutation proofs restore from a `cp` golden copy and `cmp` after each round, never `git checkout --` (CLAUDE.md).

## Review Focus

1. A background `renderSegments` (terms, repetitions) landing between a test's check and its click swallows the click: the helper must detect a swallow and retry, or serial tests fail far from the cause. → Task 1's `clickSuggestion`.
2. A swallowed click must reach no handler at all: no request, no pane, no draft. → Task 2's tests assert "seen at window capture, never delivered" and no request.
3. A slow CI runner could make a "fast" second click slow; the test must say so rather than blame the guard. → Task 2's precondition on the measured gap.
4. The pause marker must never outlive the time check (a click refused with no dim showing). → the clearing timer reschedules itself until the time has passed; every test waits on the marker.
5. A failed Hafna (alert) must not start the pause after the alert. → the stamp sits after the error return, so only an answer that redraws starts it (existing test "a failed reject alerts" stays green).

---

### Task 1: E2E harness that survives the pause

**Files:**
- Modify: `server/e2e/suggestion-view.spec.js` (helpers near `backgroundLoads`; the nine suggestion clicks)

**Interfaces:**
- Produces: `paused(page)` (locator `html[data-sugg-paused]`); `suggClicks(page) → {seen: number[], pausedAt: boolean[], delivered: number}`; `clickSuggestion(page, button)`; a `test.beforeEach` that installs the recorder with `page.addInitScript`.

- [ ] **Step 1:** `backgroundLoads` waits for each response's body (`response.finished()`), not its headers.
- [ ] **Step 2:** recorder init script: a capture `click` listener on `window` pushes `e.timeStamp` and whether `<html>` has `data-sugg-paused` for a click whose target is inside `.sugg-btn`; a bubble listener on `window` counts the delivered ones.
- [ ] **Step 3:** `clickSuggestion`: up to 3 attempts of { wait for `paused(page)` count 0; click; poll until `seen` grew by 1; return if `delivered` grew by 1 }, else throw "swallowed three times".
- [ ] **Step 4:** route the nine suggestion clicks through it (the failed-reject test starts it without `await`, then answers the alert, as it does today).
- [ ] **Step 5:** run `cd server && CI=1 npx playwright test e2e/suggestion-view.spec.js`. Expected: every existing test passes on code that has no guard yet.

### Task 2: The guard, test first

**Files:**
- Modify: `server/e2e/suggestion-view.spec.js` (five tests appended, last in the serial block)
- Modify: `server/public/js/segment-editor.js` (guard beside the suggestion buttons; stamps in `rejectSuggestionGroup`, `renderSegments`, the Escape close, `closeEditPanel`)
- Modify: `server/views/segment-editor.html` (`[data-sugg-paused] .sugg-btn` style)

**Interfaces:**
- Consumes: Task 1's helpers.
- Produces: `pauseSuggestionButtons(): void` and `SUGGESTION_PAUSE_MS` inside the IIFE (not on `window`).

- [ ] **Step 1: Write the five tests** (raw clicks only; rows are m68693 segments no other test uses; none writes the DB: rejects are stubbed, nothing is saved):
  - **click:** Nota on `caption:CNX_Chem_02_04_Isomers-caption`, then at once Hafna on `caption:CNX_Chem_02_04_Isomers2-caption`. First assert the two clicks were < 500 ms apart (message: runner too slow). Then: the Hafna was seen, not delivered, no reject request, its swap still offered. Control: `clickSuggestion` on the same Hafna sends exactly one (stubbed) request and its swap leaves.
  - **Hafna's answer:** reject on `alt:fs-idm155370112-alt` held behind a test-controlled gate; wait for the pause to clear; release; `waitForFunction` (per frame) for the marker to reappear; at once Nota on `glossary-term:fs-idm54570400-term`. Assert seen while paused, not delivered, its pane closed. Control: after the pause the same Nota opens the pane with the replaced text.
  - **full redraw:** no click since the open; wait for the pause to clear; `#filter-type` → `title` → `all`; at once Nota allar (3) on `para:fs-idp51085424`. Gap from the redraw < 500 ms first; then not delivered, pane closed. Control: after the pause it works.
  - **Escape:** `.btn-edit` on `solution:fs-idm187478032`; wait for the pause to clear; Escape (clean pane closes); at once Nota on `glossary-term:fs-idp1084128-term`. Gap < 500 ms first; then not delivered. Control: after the pause it works.
  - **Ctrl+S on a pane with nothing to save:** the same, with Ctrl+S in place of Escape (`saveEdit` closes the pane through `closeEditPanel` and sends nothing).
  - **The dim:** in the first test, a suggestion button has opacity 1 before the pause and 0.45 during it.
  - **Hætta við after Nota on a typed pane** (§C216's minor), on `solution:fs-idm187478032`: `.btn-edit`, type `<is> rf2`, Nota → textarea holds the replacement; Hætta við → no dialog, pane closed, textarea back to the served text, swap offered again, no tag, no draft entry, no rejection or left-open row, no edit.
- [ ] **Step 2:** run the spec. Expected: the four guard tests FAIL (delivered); Hætta við passes (it pins existing behaviour).
- [ ] **Step 3: Implement** the listener, `pauseSuggestionButtons()` (sets `pauseUntil = performance.now() + SUGGESTION_PAUSE_MS`, sets the marker, and a timer that clears it only once `performance.now() >= pauseUntil`, rescheduling otherwise), the three stamps, and the CSS (opacity 0.45, `cursor: default`).
- [ ] **Step 4:** run the spec. Expected: all pass.
- [ ] **Step 5: Mutation proof**, one round per trigger (click listener's stamp, reject stamp, `renderSegments` stamp, Escape stamp, `closeEditPanel` stamp, the dim rule in CSS), plus `closeEditPanel`'s `refreshSuggestionView` for the Hætta við test: golden `cp`, remove one, run the spec's guard tests, expect exactly that test red, restore, `cmp`.

### Task 3: Gate

- [ ] `npm test` (root), `npm run lint`, `npm run format:check`, `npm run docs:check`, `cd server && CI=1 npm run test:e2e`; then `git status --porcelain books/` (remove a leftover `m68693-segments.locked`).
- [ ] Commit locally; ask [USER] before pushing or opening the PR.
