# G1.23 PR3 build rulings and deferred minors

**🧊 FROZEN 2026-11-13.** Evidence, never status: if anything here disagrees with the register
(`docs/plans/2026-07-21-post-item17-followup-campaign.md`), the register wins.

These are the controller's rulings, the deferred review minors and [USER]'s confirmation line from the build
ledger of G1.23 PR3 (the screen and the switch; [#669](https://github.com/SigurdurVilhelmsson/namsbokasafn-efni/pull/669),
merged as `6f5d50ce4`). The ledger was a git-ignored working file, deleted after this extract was committed. PR3's
code comments and test names cite rulings by these numbers ("controller ruling R12", "(R22)", "(R27)"). Each line
was copied verbatim from the ledger by script, except that absolute local paths are shortened to `<repo>/`.

The R-numbers are PR3's own. Where PR3's code or its spec amendment cites another PR's ruling it says so ("PR1 R15"
in a test, "PR2's R19" in the spec); a test titled "R21: closures before the first switch-on" refers to PR2's handoff R21, which R2 below implements. The rulings
that change what editors or the admin see (R2; R7 and R30; R13; R18; R25; R27; R28) were confirmed by [USER] on
2026-11-10 and are also held, with the strings word for word, in the spec's `✏️ AMENDED 2026-11-10, later` block.

Spec: `docs/superpowers/specs/2026-11-02-suggestion-view-design.md`.
Plan: `docs/superpowers/plans/2026-11-09-g123-pr3-screen-and-switch.md`.

## Rulings

- Ruling R1: implementers make NO git writes; the controller commits each task from named files with `git commit-tree` + guarded `update-ref`, after `eslint` + `prettier --check` on those files — PR2's proven route; lint-staged's stash is shared by every worktree/session; `logs/dev-journal.md` stays out by construction (fresh worktree, named-file staging) — cost if wrong: hooks skipped, mitigated by explicit lint/format and the final gate.
- Ruling R2 (R21): `setSuggestionView` REFUSES the first switch-on (enabled, `firstSwitchOnMs` null) with code `CLOSED_BEFORE_SWITCH_ON` (route 409) when `suggestion_rejections` or `suggestion_left_open` holds any row for that book; check runs inside the same IMMEDIATE transaction as the compare-and-insert; a refusal writes nothing (no switch row, no activity_log); counts go to the server log only; no in-band override. Check order: NOT_A_STUDY_BOOK → repeat of current value (200, no row) → CONFIRM_REQUIRED → CLOSED_BEFORE_SWITCH_ON → insert. Tests: a row in each table separately refuses; another book's row does not; off→on after go-live with rows present still succeeds — the first switch-on time can never move, so switching on over prior closures is the one irreversible outcome (advisor concurred) — cost if wrong: if rows ever exist before launch, switching on needs out-of-band cleanup or a follow-up PR.
- Ruling R3: T1 regenerates `docs/_generated/routes.md` (`npm run docs:generate`) and the controller commits it as its own commit — PR2 R18 precedent (generator output) — cost if wrong: one extra commit.
- Ruling R4 (R19): the control carries a visible/hover note saying switching off is a kill switch (finishing acts while off close nothing; groups come back after the next switch-on) — PR2 handoff asks for it — cost if wrong: one string to reword.
- Ruling R5: the control learns "first switch-on" only from the server: POST without `confirmBook`; on 400 `{ code: 'CONFIRM_REQUIRED' }` it prompts `UI.suggestions.confirmFirstOn` and resends with `confirmBook`. GET answers `{ book, enabled }` only — no switch time reaches a browser — cost if wrong: none (admin page).
- Ruling R6: all SQL (current value, first switch-on, R21 count, insert) lives in `server/services/suggestionSwitch.js`; `routes/admin.js` calls service functions only (incl. a getter for the GET) — keeps routes free of switch/closure-table SQL — cost if wrong: none.
- Ruling R7: new Icelandic strings beyond Q8 (R21 refusal, R19 note) are rulings for [USER], with the controller's exact drafts, listed in the PR description — cost if wrong: rewording.
- Ruling R8: `suggestionItems` puts `opId, occurrence, category, runId, rulingId, groupActionId` at the item's TOP level (`detail: {}`), matching `suggestionFields(r)`; add one cross-runtime test in `researchEmissionFields.test.js`: `suggestionItems()` output through `claimAssistItems` keeps them non-null — cost if wrong: every accept's research item loses its op.
- Ruling R9: the client sends `acceptedSuggestions` only in R16's exact shape (array ≤ 500, each `{ opId: string 1..128, occurrence: int ≥ 0 }`, distinct by opId, no extra keys), and `buildSaveBody` adds it before the assists budget is measured — R16 silently empties the whole list on one bad entry — cost if wrong: lost accepted lists.
- Ruling R10: no draft allowlist exists; T2 adds the round-trip test only; `DRAFT_VERSION` stays 2 — cost if wrong: none.
- Ruling R11: T3 creates `refreshSuggestionView(segmentId)` (in-place redraw of `#is-<id>`, the ruling lines and, if open, the preview; never writes a textarea, never closes a pane), used by Nota and the debounced input; T4 adds its `window` export and its `.value =` pin, and uses it for Hafna — T3 cannot meet its own spec without it — cost if wrong: none.
- Ruling R12: function order in `segment-editor.js`: T3's helpers BEFORE `suggestionDisplay`; then `suggestionDisplay` → `refreshSuggestionView` → `acceptSuggestionGroup` → an existing function (T3 names it). T4 inserts `rejectSuggestionGroup` immediately BEFORE `suggestionDisplay`. Pins: `fnBody('acceptSuggestionGroup', <existing>)` (T3), `fnBody('refreshSuggestionView','acceptSuggestionGroup')` and `fnBody('rejectSuggestionGroup','suggestionDisplay')` (T4) — `fnBody` slices to the next named function, so a careless insertion widens a pinned slice — cost if wrong: brittle pins.
- Ruling R13: buttons only in the row's IS display (`#is-<id>`) and its ruling lines; the preview draws swaps + GG tags without buttons. For rows with suggestions, the displayed text for both is the open pane's textarea value, else `baselineTextFor` — one set of controls, unambiguous E2E locators, and "typing over hides the group" holds on the row — cost if wrong: an editor in the pane clicks one line up.
- Ruling R14: sentinel replacement is fail-closed per mark: a mark is drawn only if both its sentinels survive in text context, in order, unnested; otherwise its sentinels are stripped and that group is not offered on screen (a tag that cannot be drawn is not shown). `replace` and labels are HTML-escaped; `groupKey` is never interpolated raw into inline `onclick` (data attributes / escaped). The implementer probes committed layer 2 for kept changes whose span falls inside a marker body or attribute capture; expected 0, recorded; nonzero → controller ruling (the server would count as offered a group the screen never drew) — cost if wrong: a swap injected into an attribute.
- Ruling R15: T3 adds PR1's placement test (an earlier change located after a later one in the text) to `suggestionPlacement.test.js`.
- Ruling R16: T5 runs on real `efnafraedi-2e` content; after the E2E run `git status --porcelain` must show no tracked change, and the implementer confirms approval writes no file under `books/` — cost if wrong: a dirty content tree.
- Ruling R17: the index's "never send a switch state to a browser" is read as the editor's serve (G1.1 + G1.2 §11); the admin control's `{ book, enabled }` is the plan's own interface — cost if wrong: none observable (admin-only).
- Ruling R18: the first switch-on prompt shows the approved Q8 sentence followed by the book's slug on its own line, so the admin knows the exact value to type (`confirmBook` must equal the slug) — the approved sentence says "heiti bókarinnar", which an admin would read as the title, not the slug — cost if wrong: none (the typed check still binds).
- Ruling R19: Task 3 renders only the Nota buttons; Task 4 adds the Hafna buttons with their handler — so no commit carries a button calling an undefined function — cost if wrong: none (same PR).
- Ruling R20: one-change buttons get title AND aria-label 'Nota tillögu' / 'Hafna tillögu' — the plan says the accessible name is set by title, but a button with visible text takes its text as its accessible name, so title alone would make the E2E exact-name locator miss — cost if wrong: none.
- Ruling R21: the fail-closed sentinel replacement is a pure function in suggestion-placement.js beside withSentinels (e.g. fromSentinels), so R14's cases are unit-tested in Node (Vitest has no DOM) — cost if wrong: one extra export.
- Ruling R22 (Task 3 concern 1): tag changes are passed to tagSpans LONGEST replace first (ties: chain order), for both pane-accepted and saved tagged; tagSpans itself unchanged — 35 changes in 25 segments go untagged under chain order because a shorter accepted word sits inside a longer one (atóm in atómum, Task 5's own two-change row); a hit blocked by a longer TAGGED word is not a standalone occurrence, and tagSpans still tags only a unique unblocked hit; the server never calls tagSpans (display only) — cost if wrong: a tag still missing, never a second wrong record. Goes into Task 3's fix round, with a re-measured untagged count.
- Ruling R23 (concern 2): keep drawSuggestions and its helpers in suggestion-placement.js and suggestionDisplay's controls option — extends R21's Node testability — cost if wrong: none.
- Ruling R24 (concern 3): keep the extra fail-closed check (nothing drawn if the sentinels change how the text renders; 0 cases on real data) — fail-closed is the spec's posture (§6.5 last paragraph) — cost if wrong: a group withheld that could have shown.
- Ruling R25 (concern 4): on rows the user may not edit, swaps and ruling lines show WITHOUT buttons (spec §7: anyone who can edit the segment can act; a head editor reviewing sees the same tags) — reviewer to confirm the Breyta-rule helper refactor preserves behaviour — cost if wrong: a viewer sees suggestions they cannot act on.
- Ruling R26 (concern 5): Task 5 scopes one-change buttons by data-group-key where a row holds two one-change groups (fs-idp29766960).
- Ruling R27 (Task 3 I2): if the rendered HTML has a tag inside a tag (a swallowed tag), draw no suggestions and no tags for that text (plain render) — a quote-toggle scan is not exact because swallowed tags carry their own quotes; exposure ≤ 8 committed segments, reachable by typing — cost if wrong: those few segments show no suggestions.
- Ruling R28 (fix-round concern 1): leave the 18 of 22 remaining untagged cases where two accepted changes share the same replace text (neither tagged) — spec §7's own fail-safe ('if a tag cannot be placed exactly, it is not shown'; records keep the accept); none in Task 4/5 rows; stated in the PR description as a known limit — cost if wrong: some accepted words show no GG tag until approval.
- Ruling R29 (final fix wave scope): one wave with M3 (E2E timeout margin), M1 CSS half (Hafna in error colours), M4 (Icelandic string on mistyped confirmation), M2 confirm half (confirm before switching off), M6 (ENV_SCAN_FILES placement), M7 (reject guard symmetry), M8 (stale docstring); NOT M1's 300 ms click guard (a click-swallowing guard risks flaky E2E; goes on the before-switch-on list), NOT M5 (Hætta við E2E; deferred per reviewer) — cost if wrong: the double-click slide stays possible until the guard lands.
- Ruling R30: two more Icelandic strings beyond Q8, for [USER] in the PR description: confirmMismatch 'Heitið passaði ekki við bókina. Ekki var kveikt á tillögum gervigreindar.' and confirmOff 'Slökkva á tillögum gervigreindar í þessari bók? Þær hverfa strax hjá öllum ritstjórum.' — cost if wrong: rewording.
- Ruling R31: keep this workspace until the PR merges (it holds the PR body draft, the ledger and the evidence), as PR1/PR2's workspaces were kept until merge + deploy — the skill says delete once the final review is clean — cost if wrong: a git-ignored directory lingers.

## Deferred minors (review findings judged safe to leave)

- Task 1: minor (deferred): a mistyped confirmation resend shows the server's ENGLISH message in a toast in an Icelandic UI (assignments.js onSuggestionViewToggle)
- Task 1: minor (deferred): admin.js:576 duplicates the service's isStudyBook check (GET)
- Task 1: minor (deferred): no route-level test for a non-string confirmBook 400, nor a route repeat 200 writing no switch row
- Task 2: minor (deferred): the 500-cap test asserts length only, not that the first 500 in item order are kept
- Task 2: minor (deferred): suggestionItems does not guard a null entry in group.changes (server data, trusted)
- Task 3: minor (deferred): a group can stay hidden behind a group that is itself not shown (plan order; hides, never misplaces)
- Task 3: minor (deferred): stale 'four call sites' docstring at segment-editor.js:1650
- Task 3: minor (deferred): preview drawn twice per typing pause
- Task 3: minor (deferred): focus lost after Nota when the pane is already open (insertRepetition calls ta.focus())
- Task 3: minor (deferred): Nota has no guard against re-applying an accepted group (unreachable from the UI)
- Task 3: minor (deferred): one negative pin has no control
- Task 3: minor (deferred): the early swallow check in drawSuggestions and R22's chain-order tie-break have no pinning test (the former is also guaranteed through fromSentinels)
- Task 4: minor (deferred): rowValues on an absent row relies on readRowValues tolerating null (unlikely: the click came from the row)
- Task 4: minor (deferred): client pins are source-text matches (brittle to reflow; a same-text regression passes) — E2E covers behaviour
- Task 4: minor (deferred): in-flight guard does not disable the button (second request blocked; group disappears on success)
- Task 5: minor (deferred): stale premise in sibling opening-unrecorded.spec.js:19 ('the E2E database holds no users row') — now false with the seeded dedicated editor
- Task 5: minor (deferred): test 13's dialog assertions are weak
- Task 5: minor (deferred): test 5 uses ~45% of the 30 s timeout under load (13.6 s)
- Task 5: minor (deferred): absence checks after a reload do not first assert the row exists (tests 8, 10, 15)
- Task 5: minor (deferred): two module-GET counter uses lack their own positive control (tests 7, 12)
- Task 5: minor (deferred): index RF1's Nota-on-a-typed-pane half is not exercised end to end
- Task 5: minor (deferred): test 15 checks a count where a set would do

## [USER]'s confirmation, as the ledger recorded it

- [USER] 2026-11-10: 'I confirm the rulings and the strings' (PR #669's list). Spec ✏️ AMENDED 2026-11-10, later block committed 3e8096c29 on the PR branch (PR1's precedent cd7586d74) and pushed; PR body updated (gh api PATCH, verified). Register entry deferred to PR3's merge/deploy entry (PR2's entry still in open #668; same spot would conflict).
