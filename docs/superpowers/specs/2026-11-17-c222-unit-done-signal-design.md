# §C222: a repeatable "unit finished" signal in place of "Senda til yfirlestrar" (design)

- **Date:** 2026-11-17
- **Item:** register §C222 (the review loop, IA-5), the second option [USER] ruled on 2026-11-17; with HM-02's label
  (§C221)
- **Decided by:** [USER], in a brainstorming session on 2026-11-17. The rulings are marked *[USER]*: behaviour A (a
  recorded moment, no status), no screen for `review-complete`, approval of the proposals listed under §4, each press
  in the team's activity feed (§9 (a)), and approval of every *(Claude's call)* in this file. A call stays marked
  as Claude's so a reader can tell a proposal [USER] approved from a choice [USER] made among options.
- **Measured on:** `main` at `9be085cb2`; production read-only on 2026-11-17 (§2).
- **Status of the work:** the active register's newest ⏩ RESUME entry, never this file.

> **FROZEN DESIGN RECORD once approved.** Owned by §C222. If it disagrees with the register, the register wins.

## 1. Intent

The study needs a recorded moment at which an editor says "I'm finished with this unit." Today that moment comes from
"Senda til yfirlestrar", which writes the research event `module-submit`. The button works once per unit and then
answers "Module already has a pending review" for good (ED-07). [USER] ruled on 2026-11-17 to keep the moment and
make it repeatable.

**What it is not:** a review step. Answer 11 of 2026-11-14 stands: an edit can be reviewed as soon as it is saved,
and the head editor never waits for this button. On 2026-11-14 [USER] turned down "a real, repeatable step" because
it needs a closing rule and a status editors have to learn. This design keeps the moment and leaves out both.

## 2. What exists today (measured)

- `POST /:book/:chapter/:moduleId/submit` (`server/routes/segment-editor.js`) calls `submitModuleForReview`. That
  inserts a `module_reviews` row with status `pending`, stamps `review_id` on the unit's open edits, and refuses
  while such a row exists. Only `completeModuleReview` (`POST /reviews/:reviewId/complete`) closes the row. So every
  unit can be submitted once.
- **No browser code calls the old review routes.** A grep for `/reviews` and `review-queue` over `server/public/js`
  and `server/views` finds only the terminology page's own `/api/terminology/review-queue`. So `GET /reviews`,
  `/reviews/:id`, `/review-queue` and `POST /reviews/:id/complete` are called by tests only. Heim, Yfirlestrar
  (`GET /review-list`) and the dashboard read `segment_edits` directly.
- The route writes `module-submit` (`researchEmission.emitSubmit`, detail `{reviewId, stampedEditIds}`), and then,
  after `res.json`, an activity-log row of type `module_submitted_for_review`. The stamped ids are every editor's
  open edits in the unit. They are ids, not texts, and the 2026-11-03 design's rule on other people's texts (store a
  hash only) concerns texts.
- **The research side accepts a new detail key.** `researchVocabulary.js` lists event types only. `researchFilter.js`
  copies a detail whole and withholds text keys for `propagation` only (`DETAIL_TEXT_KEYS`). `researchLog.record`
  writes an event only for a consenting editor in a study book. So nothing an editor sees can be read from it.
- **The activity log is the team's shared record.** `activityLog.log` never throws: on failure it logs an error and
  returns `null`. Its rows are readable by everyone who works on the row's book, and by admins
  (`lib/activityScope.readableLogBooks`). The status page shows the last 24 hours to those readers, and its 30-day
  per-person figures count every row in `totalActions`. Its `submissions` figure counts saves and does not count the old
  button's type. No code deletes activity rows. No query filters by type, user and unit together.
- The client refuses a press when the unit has no pending edits (`UI.alert.noChanges`). It does not check for
  unsaved text.
- ✏️ *Found 2026-11-17 while building:* the 2026-11-03 design's §11 says **"No time of a person in a response"**, and
  `researchBoundary.test.js` (T17) enforces the module JSON's keys as an exact allowlist. The trace's date (§4,
  string 4) is such a time. Claude read §11 as scoped to research-capture times: its examples are all of that kind
  (`opened_at_ms`, `module_opening_inflight`, `switched_at_ms`); edit rows already send `created_at` and
  `reviewed_at`; and the activity timeline already sends this same row's time and name to the book's editors.
  ✅ **[USER] ruled on 2026-11-17, with §11 in view: that reading stands, and `myLastDoneAt` carries the date.** So
  `myLastDoneAt` is on T17's allowlist with that reason in a comment, and the 2026-11-03 design's amendment records
  the scoping as [USER]'s ruling.
- Heim's "Bíður yfirlestrar" rows say "Sent `<date>`" for edits that were only saved (HM-02,
  `server/views/my-work.html`).
- **Production, read-only, 2026-11-17:**
  - In `sessions.db` (control: `registered_books` = 6), 3 `module_reviews` rows, all chemistry, all `pending`,
    submitted between 2026-03-13 and 2026-07-04. 142 of 163 `segment_edits` carry a `review_id`, and no edit has been
    saved since 2026-11-01.
  - `research.db`'s `research_events` table exists and holds **0 events of any type**. No `module-submit` exists in
    the old shape, so the new detail needs no dated boundary.

## 3. Goals, non-goals, anti-goals

**Goals**
- An editor can mark a unit finished any number of times. Every press succeeds and is recorded.
- A press works with no edits open: "I read it and it needed nothing" is also a finish.
- The editor sees when they last marked the unit finished.

**Non-goals**
- A screen for `review-complete` *[USER]*. The editor's moment is enough for the study.
- Removing the old review loop's code (`submitModuleForReview`, `completeModuleReview`, `emitReviewComplete`, the
  `/reviews…` and `/review-queue` routes, the `module_reviews` table). Its service functions stay, because the
  complete route and its tests still use them. Removing it is a separate cleanup, to be logged in the register.
- The rest of HM-02 (one Heim row per unit with a count, instead of one row per edit). Only the label changes here.
- Touching the 3 stale production rows. Nothing a screen shows reads them.

**Anti-goals: it fails even if it works**
- Anything that behaves like a status: a badge on Heim or Yfirlestrar, a lock, a "done" that a later edit or a
  rejection clears, or a withdraw button. Each of these brings back the closing rule [USER] turned down.
- A list or figure of finishes per person. Research data is never used for workload, and a tally of who finished what
  would read as exactly that. The trace shows only the viewer's own press. Each press does appear, by name, in the
  team's activity feed *[USER], §9 (a)*, as the old button's press did. That is a line in a shared record, not a
  count, and the per-person figures skip it.
- One event type carrying two meanings. After the change, `module-submit` is written by one route only, with one
  detail shape.

## 4. Behaviour

Approved proposals:
- **The button** reads "Merkja sem lokið". It asks before recording, as the old button did. The draft Icelandic is
  in §7.
- **Each press** records:
  - an activity-log row of a new type, `module_marked_done`, written **before** the response. If the write returns
    `null`, the press answers an error and the editor is told that it did not record *(Claude's call)*;
  - for a consenting editor in a study book, a `module-submit` research event *(Claude's call: keep the name, so the
    study's vocabulary does not change)*. Its detail is `{ openEditIds }`: the ids of the unit's edits, by any
    editor, that are open at that moment (`pending` or `discuss`, or `approved` and not yet applied)
    *(Claude's call: the exact set, and the field name)*. There is no `reviewId`. An empty list is a press with
    nothing open. The emission stays never-throw, as every research emission is.
- **No `module_reviews` row** is created and no `review_id` is stamped. That is what makes a second press work.
- **The trace:** "Merkt sem lokið `<date>`" beside the button, showing the viewer's **own** latest press in this unit,
  read from the activity log. It is absent before a first press, and it updates after each press.
- **Heim** says "Vistað `<date>`" where it said "Sent `<date>`".
- **Access** is unchanged from the old route: `requireAuth`, `validateBookChapter`, `requireBookAccess()` (which
  refuses anyone below editor) and `validateModule`.

*(Claude's call)* **Unsaved text:** the press is refused, in the browser, while the unit holds text that is not yet
saved. That covers any pane with changed text (`paneTextChanged`), a text a refused save kept, and a save still in
flight (`savesInFlight`). The editor is told to save or discard it first. The recorded moment is "finished", and a
finish recorded before the last edit lands would come before that edit in the study's data. The press does not
save on the editor's behalf: a save has its own category, note and conflict answers.

## 5. Approaches

1. **A new route for the new act, and the old send-for-review route removed (chosen, Claude's call).** Add
   `POST /:book/:chapter/:moduleId/done`. Delete the `/submit` route, which was the only route that opened review
   rows from the browser. Keep the old loop's service functions for the complete route. Then `module-submit` comes from
   one place with one shape, and the route's name says what it does. The cost is updating five unit test files and two
   E2E specs (§6).
2. **The same route with a new body.** Keep the `/submit` URL and change what it does. It saves no test work: the
   same tests break, because they expect a review row. And it leaves a route named "submit" that submits nothing.
3. **Keep the review row, but open and close it on every press.** The event keeps its `reviewId`. Rejected: it hides
   the closing rule in code, adds a row state that the review routes do not know about, and keeps stamping `review_id`,
   which changes what `completeModuleReview` counts if an old review is ever completed.

## 6. What the change touches

- `server/routes/segment-editor.js`: the new `/done` route, and the `/submit` route removed. The module GET (or the
  `/done` response) carries the viewer's latest press, for the trace.
- `server/services/activityLog.js`: one new query, the latest row of one type by one user for one
  (book, chapter, section).
- `server/services/researchEmission.js`: `emitSubmit` takes `{openEditIds}`.
- `server/services/segmentEditorService.js` (or a small helper): the query for open edit ids.
- `server/views/segment-editor.html`, `server/public/js/segment-editor.js`, `server/public/js/ui-strings.js`: the
  button, the confirm, the trace and the unsaved-text refusal. `UI.confirm.submitForReview`, `UI.alert.noChanges`,
  `UI.segmentEditor.sentForReview` and `UI.segmentEditor.viewReview` go: the old button is their only user.
- `server/views/my-work.html`: "Sent" becomes "Vistað".
- `server/routes/status.js`: the per-person figures skip `module_marked_done` (§9 (a)), with a test that a press adds
  nothing to the presser's `totalActions`.
- **New tests:**
  - a red-first test that a second press succeeds (ED-07's symptom);
  - a press with no open edits succeeds;
  - no `module_reviews` row is created;
  - `module-submit` is recorded for a consenting editor with `openEditIds`, and is not recorded for a non-consenting
    one, while the activity row is written for both;
  - a failed activity write answers an error;
  - the trace shows only the viewer's own press, with a second editor's press as the control;
  - the press is refused while a pane holds unsaved text;
  - an E2E pass through the button, the confirm and the trace.
- **Tests to update.** Four unit files drive the `/submit` handler: `reviewRoutesNoBefore`,
  `researchConsentStates`, `researchReviewEvents` and `researchApplyEvents`. `servedBaseClientPins` pins the
  `btn-submit` listener's source. ✏️ *Corrected 2026-11-17, while planning: this listed `crossBookAuthz` too, but its
  match is `/api/sections/:id/submit-review`, a different route, so five files in all, not six.* The E2E specs `editor-workflow` and `review-cycle` drive `/submit`.
  `researchFilter.test.js` lists `module-submit` by name, and the name is kept, so it is untouched. So are the tests
  that set up a review by calling `submitModuleForReview` directly.
- **Records:**
  - an `✏️ AMENDED 2026-11-17` block in `docs/superpowers/specs/2026-11-03-served-version-and-event-log-design.md`,
    for `module-submit`'s new trigger and detail, and for `review-complete` having no screen by ruling;
  - the register: §C222's entry, HM-02's label under §C221, and the old loop's removal logged as open work.

## 7. Icelandic: Claude's drafts, approved by [USER]

✅ **[USER] approved all eight on 2026-11-17 ("all OK")**, as shown in chat. The trace's date uses the editor's
existing `toLocaleString('is-IS')`, so it reads like "Merkt sem lokið 17.11.2026, 14:05:00". Heim's uses
`toLocaleDateString('is-IS')` ("Vistað 17.11.2026"). The activity line names the unit by its id, as the old line did.

| Where | Draft |
|---|---|
| Button | Merkja sem lokið |
| Button tooltip | Skráir að þú hafir lokið við þennan hluta. Breytingar fara til yfirlestrar um leið og þær eru vistaðar. |
| Confirm | Merkja þennan hluta sem lokið? Þú getur haldið áfram að breyta honum á eftir. |
| Trace | Merkt sem lokið `<date>` |
| Refused: unsaved text | Óvistaður texti er í hlutanum. Vistaðu hann eða hentu honum áður en þú merkir hlutann sem lokið. |
| Refused: not recorded | Ekki tókst að skrá að hlutanum sé lokið. Reyndu aftur. |
| Activity log | `<user>` merkti `<module>` sem lokið |
| Heim row | Vistað `<date>` |

## 8. Left to the builder

- Whether the trace arrives in the module GET payload or in a separate call, and the date format: use the editor's
  existing date formatting.
- Whether the button is disabled while its request is in flight. A double click would otherwise record two moments a
  fraction of a second apart. *(Claude's call: disable it.)*
- What the press does after it succeeds: update the trace in place, with at most a short confirmation toast. The old
  toast's link to a review page goes, because there is no review to see.
- How `review-cycle.spec.js` seeds its review once `/submit` is gone: seed the row directly, or drop the submit step
  if the spec only needs the edits.

## 9. The activity feed (ruled)

**Does each press appear in the team's activity feed?** The old button's press did ("`<user>` sendi `<module>` til
yfirlestrar"). Everyone who works on the book reads that feed, and each row adds 1 to the presser's 30-day action
total on the status page.
- **(a) Yes, as before.** ✅ **[USER] ruled (a) on 2026-11-17.** The head editor sees when a unit is finished, which
  is the one thing the old button told them. The new type is left out of the per-person figures, so presses are never
  counted per person.
- (b) No: presses go to a small table of their own, which only the presser's trace reads (and, for consenting
  editors, the study). Not chosen.
