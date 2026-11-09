# G1.23, PR3 — the screen and the switch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax. **The tree
> wins:** where a measurement disagrees with this plan, stop, say so, and re-derive. Read
> [the index](2026-11-09-g123-suggestion-view.md), and the "Handoff" sections of
> [PR1](2026-11-09-g123-pr1-read-side.md) and [PR2](2026-11-09-g123-pr2-write-side.md), first.

**Goal:** editors see each offered group inline as a swap with a GG tag, take or refuse it in one click with no module
reload, keep the GG tags on accepted words until a head editor approves, and an admin can switch the view on for a
book, once, deliberately. This PR makes the view live only when [USER] switches it on (index, production procedure).

**Architecture:** the switch writer and its admin route and control (task 1); the client's DOM-free values in
`segment-save-state.js` (task 2); the display and *Nota* in `segment-editor.js`, reading `seg.suggestions` and
`suggestion-placement.js` (task 3); *Hafna* and the in-place redraw (task 4); the end-to-end checks (task 5). The swaps
are placed by inserting private-use sentinel characters into the displayed text before `renderMarkdownPreview` runs and
replacing them in its HTML afterwards, so a swap never splits an inline marker's syntax.

**Tech Stack:** as in the index.

**Spec:** G1.23 spec §4 (what the editor sees and does), §6.5, §7, §9.4–9.6; the G1.1 + G1.2 spec §5.13, §5.18 (drafts
carry assists), §11.

## Global Constraints

The index's Global Constraints apply. In addition:
- **Labels are the spec's** (§4): *✓ Nota*, *✗ Hafna*, *✓ Nota báðar*, *✗ Hafna báðum*, *✓ Nota allar (N)*,
  *✗ Hafna öllum (N)*, the **GG** tag with *Tillaga gervigreindar* on hover. New strings go in `ui-strings.js` under
  `UI.suggestions` and are listed in the index's Q8.
- **Inline `onclick` handlers are the house pattern** (CSP allows `script-src-attr 'unsafe-inline'`); new handlers are
  added to the `window.*` export block at the end of `segment-editor.js`.
- **The new reject button's accessible name is *Hafna tillögu*** (`title`), distinct from the head editor's *Hafna*.
  E2E locators use `exact: true`.
- **The B-4 marker backdrop is unchanged.** Accepted words are tagged in the row display and the live preview, not in
  the backdrop (spec §12 leaves this to the builder).
- **No switch time reaches a browser**: the admin route answers `{ book, enabled }` only.

## Review Focus

1. **A dirty pane on the row being rejected** (index Review Focus 1): the textarea keeps its text. → task 4.
2. **A restored draft after accepting** (index Review Focus 3): the assists come back, so the tags and the accepted
   list do too. → task 2 (values) and task 5 (end to end).
3. **A 409 after accepting** (index Review Focus 4): the typed text and its assists go to the draft. → task 5.
4. **The table rebuilt by `loadTermData` / `loadRepetitions` after a *Hafna*** must not bring the group back. → task 4.
5. **A switch request for organic or for a book that is not a study book** is refused with 400 and writes no row; **a
   repeat of the current value** answers 200 and writes no row. → task 1.

---

### Task 1: The switch writer, its route and its control

**Files:**
- Create: `server/services/suggestionSwitch.js`
- Modify: `server/routes/admin.js` (new route beside `/assignments/:book/enforcement`, `:1048`)
- Modify: `server/public/js/assignments.js` (a control beside the enforcement toggle)
- Modify: `server/lib/featureFlags.js` (`ENV_SCAN_FILES`: add `'services/suggestionSwitch.js'`)
- Modify: `server/public/js/ui-strings.js`
- Test: `server/__tests__/suggestionSwitch.test.js`

**Interfaces:**
- Consumes: `currentSwitchValue`, `firstSwitchOnMs` (`server/lib/bookSwitches.js`); `isStudyBook`.
- Produces:
  - `setSuggestionView(conn, { book, enabled, confirmBook, nowMs }) -> { changed: boolean, enabled: boolean }`.
    Throws `Object.assign(new Error(…), { code })` with `code` `NOT_A_STUDY_BOOK` (organic included),
    `CONFIRM_REQUIRED` (turning on while `firstSwitchOnMs` is null and `confirmBook !== book`). Inserts one
    `book_switch_events` row (`switch_name 'suggestion-view'`, `value` 0/1, `switched_at_ms nowMs`) only when the value
    changes.
  - `POST /api/admin/books/:book/suggestion-view`, `requireAuth, requireRole(ROLES.ADMIN)`, body `{ enabled: boolean,
    confirmBook?: string }`. `200 { book, enabled }`; `400` for a bad body, `NOT_A_STUDY_BOOK` or `CONFIRM_REQUIRED`.
    On a change it writes an `activity_log` row in the enforcement toggle's shape (`admin.js:1062-1068`), type
    `suggestion_view_toggled`.
  - `GET /api/admin/books/:book/suggestion-view` → `{ book, enabled }` for the control's initial state.

- [ ] **Step 1: Write the failing tests**

```js
it('turning on the first time needs the typed book name', () => {
  expect(() => setSuggestionView(db, { book: B, enabled: true, nowMs: 10 })).toThrow(expect.objectContaining({ code: 'CONFIRM_REQUIRED' }));
  expect(setSuggestionView(db, { book: B, enabled: true, confirmBook: B, nowMs: 10 })).toEqual({ changed: true, enabled: true });
});
it('a repeat of the current value writes no row', () => {});
it('off, then on again, needs no confirmation and leaves the first switch-on time where it was', () => {
  expect(firstSwitchOnMs(db, B, 'suggestion-view')).toBe(10);
});
it.each(['lifraen-efnafraedi', 'liffraedi-2e'])('refuses %s', (book) => {});
it('the route is admin only, and its answer carries no time', () => {});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run server/__tests__/suggestionSwitch.test.js`
Expected: FAIL, cannot find module `../services/suggestionSwitch`.

- [ ] **Step 3: Implement the service, the two routes and the control**

The control shows *Tillögur gervigreindar í ritli* with *Kveikt* / *Slökkt*. When turning on with no earlier switch-on
it asks for the book's slug with `prompt(UI.suggestions.confirmFirstOn)` and sends it as `confirmBook`.

- [ ] **Step 4: Run them and see them pass, with the flag coverage tests**

Run: `npx vitest run server/__tests__/suggestionSwitch.test.js server/__tests__/featureFlags*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/suggestionSwitch.js server/routes/admin.js server/public/js/assignments.js server/lib/featureFlags.js server/public/js/ui-strings.js server/__tests__/suggestionSwitch.test.js
git commit -m "feat(g123): the per-book switch for the suggestion view, admin only, first switch-on confirmed"
```

### Task 2: The client's values (`segment-save-state.js`)

**Files:**
- Modify: `server/public/js/segment-save-state.js`
- Modify: `server/__tests__/segmentSaveState.test.js` (the exact `ITEM_SOURCES` pin at about `:236-242`)
- Test: `server/__tests__/segmentSaveState.test.js`

**Interfaces:**
- Produces:
  - `ITEM_SOURCES['ai-suggestion'] = ['ai']` (the server table already has it; `researchEmissionFields.test.js`'s
    client-equals-server test then covers it).
  - `suggestionItems(group, groupActionId, clientTimeMs) -> item[]`: one `assistItem('ai-suggestion', 'ai', …)` per
    change, each also carrying `opId`, `occurrence`, `category`, `runId`, `rulingId`, `groupActionId`.
  - `acceptedFromAssists(assists, savedText, changesByOpId) -> [{ opId, occurrence }]`: the `ai-suggestion` items
    whose change's `replace` occurs in `savedText`, distinct by `opId`, in item order (spec §7: "only accepted groups
    whose `replace` text is still present").
  - `buildSaveBody(…)` gains the field `acceptedSuggestions` (read its current signature at `:126` and add one
    parameter field; `[]` when none).

- [ ] **Step 1: Write the failing tests**

```js
it('ITEM_SOURCES is exactly the four client types', () => { /* the existing pin, now with ai-suggestion: ['ai'] */ });
it('suggestionItems gives one item per change, sharing the group action id', () => {});
it('acceptedFromAssists keeps an op whose replace is in the saved text and drops one typed away', () => {});
it('a restored draft keeps its ai-suggestion items, so acceptedFromAssists still finds them', () => {
  // buildDraftValue → parseDraftValue → restoredAssists round trip keeps opId and groupActionId
});
it('buildSaveBody sends acceptedSuggestions beside assists, never inside it', () => {});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run server/__tests__/segmentSaveState.test.js server/__tests__/researchEmissionFields.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

If the draft round trip drops the new item keys, extend the draft's assist allowlist rather than adding a second store;
`DRAFT_VERSION` stays 2 when the change is additive.

- [ ] **Step 4: Run them and see them pass**

Run: the same command as step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-save-state.js server/__tests__/segmentSaveState.test.js
git commit -m "feat(g123): the client's suggestion items and accepted list, kept in the pane's assists"
```

### Task 3: The display and *Nota*

**Files:**
- Modify: `server/public/js/suggestion-placement.js` (add `withSentinels`)
- Modify: `server/views/segment-editor.html` (load `suggestion-placement.js` before `segment-editor.js`; CSS in the
  inline `<style>`)
- Modify: `server/public/js/segment-editor.js`
- Modify: `server/public/js/ui-strings.js` (`UI.suggestions`)
- Test: `server/__tests__/suggestionPlacement.test.js`, `server/__tests__/suggestionClientPins.test.js`

**Interfaces:**
- Consumes: `seg.suggestions` (PR1); `visibleGroups`, `placeGroup`, `tagSpans`; `suggestionItems`,
  `acceptedFromAssists` (task 2); the existing `addAssist`, `paneAssists`, `openEditPanel`, `renderMarkdownPreview`,
  `baselineTextFor`, `insertRepetition` (the precedent for a client-only insert, `segment-editor.js:1223`).
- Produces:
  - `suggestionPlacement.withSentinels(text, marks) -> string`: wraps each `{ start, end, id }` in
    `<id>…` (non-overlapping marks only); `SENTINEL` constants exported.
  - In `segment-editor.js`: `suggestionDisplay(seg, text, assists) -> { html, rulingsHtml }` (the row's IS display with
    swaps and tags, and the ruling lines); `acceptSuggestionGroup(segmentId, groupKey)` (exported on `window`).

**What it shows** (spec §4):
- For each visible group, each change as `<del class="sugg-old">find</del><ins class="sugg-new">replace</ins>` followed
  by `<span class="sugg-tag" title="Tillaga gervigreindar">GG</span>`. A one-change group puts *✓ Nota* / *✗ Hafna*
  on the word; a group of two or more puts its group number on each word and its buttons on the ruling line (*Nota
  báðar* / *Hafna báðum* for two, *Nota allar (N)* / *Hafna öllum (N)* for more).
- Below the text, one line per visible group: `en → is (n)`.
- Accepted words (from the pane's `ai-suggestion` assists while the pane is open; from `seg.suggestions.tagged` after
  a save) carry the GG tag and no buttons, placed with `tagSpans`. A tag that cannot be placed is not shown.
- The displayed text is the open pane's textarea value, else `baselineTextFor(seg, latestEdit)`. The live preview
  (`#preview-<id>`) shows the same, recomputed on each debounced input, so typing over a word hides its group.
- Groups accepted in the open pane are not offered again; *Hætta við* clears the pane's assists (existing behaviour)
  and the groups come back.

*Nota* opens the pane if it is closed (as `insertRepetition` does), sets the textarea to `placeGroup(value,
group).result`, adds `suggestionItems(group, segmentSaveState.newClientActionId(), Date.now())` through `addAssist`,
and dispatches an `input` event. **It sends nothing and does not reload.** `saveEdit` adds
`acceptedFromAssists(paneAssists(id), editedContent, changesByOpId)` to the body.

- [ ] **Step 1: Write the failing tests**

```js
// suggestionPlacement.test.js
it('withSentinels survives escapeHtml-like handling and nests nowhere', () => {});
// suggestionClientPins.test.js (fnBody pattern of servedBaseClientPins.test.js)
it('renderSegmentRow draws suggestions through suggestionDisplay', () => {
  expect(fnBody('renderSegmentRow', 'eligibilityView')).toContain('suggestionDisplay(');
});
it('acceptSuggestionGroup never calls loadModule, reloadIfOpen or fetch', () => {
  const body = fnBody('acceptSuggestionGroup', '<next function name>');
  for (const call of ['loadModule(', 'reloadIfOpen(', 'fetch', 'fetchJson(']) expect(body).not.toContain(call);
  expect(body).toContain('addAssist('); // control
});
it('saveEdit sends acceptedFromAssists', () => {});
it('segment-editor.html loads suggestion-placement.js before segment-editor.js', () => {});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run server/__tests__/suggestionPlacement.test.js server/__tests__/suggestionClientPins.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them and see them pass, and the existing client pins**

Run: `npx vitest run server/__tests__/suggestionPlacement.test.js server/__tests__/suggestionClientPins.test.js server/__tests__/servedBaseClientPins.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/suggestion-placement.js server/views/segment-editor.html server/public/js/segment-editor.js server/public/js/ui-strings.js server/__tests__/suggestionPlacement.test.js server/__tests__/suggestionClientPins.test.js
git commit -m "feat(g123): show suggestion swaps with GG tags, and take a group into the pending text"
```

### Task 4: *Hafna* and the in-place redraw

**Files:**
- Modify: `server/public/js/segment-editor.js`
- Modify: `server/public/js/ui-strings.js`
- Test: `server/__tests__/suggestionClientPins.test.js`

**Interfaces:**
- Consumes: the reject route (PR2), `rowElement`, `cssId`, `moduleData`.
- Produces: `rejectSuggestionGroup(segmentId, groupKey)` and `refreshSuggestionView(segmentId)`, both on `window`.

*Hafna* posts `{ segmentId, occurrence, groupKey, baseSha256, groupActionId, clientActionId, clientActionTime }` (the
row's `data-base-sha256` and `data-occurrence`) to `…/suggestions/reject`. On `200`, or `404 SUGGESTION_UNKNOWN`, it
removes the group from that segment's `suggestions.groups` in `moduleData` and calls `refreshSuggestionView`. On any
other failure it shows `UI.suggestions.rejectFailed` and changes nothing. `refreshSuggestionView` replaces only the
row's IS display, its ruling lines and, if the pane is open, the preview; **it never writes the textarea and never
closes the pane**.

- [ ] **Step 1: Write the failing pins**

```js
it('rejectSuggestionGroup updates moduleData and redraws in place, never reloading', () => {
  const body = fnBody('rejectSuggestionGroup', '<next function name>');
  expect(body).toContain('refreshSuggestionView(');
  for (const call of ['loadModule(', 'reloadIfOpen(', 'renderSegments(']) expect(body).not.toContain(call);
});
it('refreshSuggestionView never assigns a textarea value', () => {
  expect(fnBody('refreshSuggestionView', '<next function name>')).not.toMatch(/\.value\s*=/);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run server/__tests__/suggestionClientPins.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them and see them pass**

Run: the same command as step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-editor.js server/public/js/ui-strings.js server/__tests__/suggestionClientPins.test.js
git commit -m "feat(g123): reject a suggestion group in place, without reloading the module"
```

### Task 5: End to end (spec §9.4–9.6)

**Files:**
- Modify: `server/e2e/seed-fixture.js` (one `users` row for a dedicated editor, and its `user_chapter_assignments` row
  for `efnafraedi-2e` chapter 2; no switch row)
- Modify: `server/e2e/helpers/segments.js` (reserve chapter 2 of `efnafraedi-2e` for this spec in the ownership notes)
- Create: `server/e2e/suggestion-view.spec.js`

**The unit and its segments** (index decision 16; measured 2026-11-09, all pass §6.3):

| Check | Module | Segment | Groups after the drop |
|---|---|---|---|
| opened before switch-on (control module) | `m68684` | `m68684:para:eip-557` | `product` 1 |
| one-change group: *Nota*, *Vista*, tags after reload | `m68693` | `m68693:para:para-00002` | `molecular-structure` 1 |
| two-change group: *Nota báðar* | `m68693` | `m68693:para:fs-idm94827440` | `atom` 2 |
| left open on approval (take one, leave one) | `m68693` | `m68693:para:fs-idp29766960` | `isomers` 1, `molecular-structure` 1 |
| dependent group | `m68693` | `m68693:para:fs-idm89120384` | `spatial-isomers` 1, then `isomers` 1 |
| left open on *Staðfesta MT* | `m68693` | `m68693:para:fs-idm100378720` | `isomers` 1 |
| typing over hides the group | `m68693` | `m68693:para:fs-idm177313504` | `structural-isomer` 1, `spatial-isomers` 1 |
| *Hafna*, after a reload and for a second editor | `m68693` | `m68693:alt:fs-idp204316880-alt` | `lewis-structure` 1 |

The spec runs in serial mode, in this order: (1) the dedicated editor opens `m68684` (it opens before any switch-on);
(2) an admin switches `suggestion-view` on for `efnafraedi-2e` through the task 1 route, with `confirmBook`; (3) the
dedicated editor opens `m68693`. **Approvals are made with the admin login** (`loginAs(page, 'admin')`), which passes
`requireHeadEditorFor` without a book-access row; the second editor of the *Hafna* check is the default `editor` login,
which needs no row to view a module. Elements are located by `#segments-body tr[data-segment-id="…"]`, then by class or
by role with `exact: true`.

- [ ] **Step 1: Write the spec**, one `test` per row of the table plus:
  - `m68684` shows no suggestion while `m68693`'s `para-00002` does (eligibility, spec §9.5, with its control);
  - module GETs counted with the `page.route` counter of `served-base-client.spec.js:840-881`: no GET follows *Nota*
    or *Hafna*;
  - a reload after *Nota* and before *Vista* restores the draft, and the saved edit carries the accepted list and the
    tags;
  - a head editor approving the `para-00002` edit removes its GG tags after a reload (spec §9.4);
  - every "not shown" assertion paired with a sibling group in the same module that **is** shown (spec §9.6).

- [ ] **Step 2: Run it**

Run: `cd server && CI=1 npx playwright test e2e/suggestion-view.spec.js --config e2e/playwright.config.js`
Expected: PASS. Then the whole E2E job: `cd server && CI=1 npm run test:e2e`, expected PASS (sibling specs never use
chapter 2 or the dedicated user).

- [ ] **Step 3: Commit**

```bash
git add server/e2e/seed-fixture.js server/e2e/helpers/segments.js server/e2e/suggestion-view.spec.js
git commit -m "test(g123): end-to-end checks for the suggestion view on ch02 m68693"
```

## After PR3

Deploying PR3 changes nothing until [USER] switches the view on (index, production procedure, steps 4–6). The
register records the switch-on; G1.13's assignments follow only after it (R6).
