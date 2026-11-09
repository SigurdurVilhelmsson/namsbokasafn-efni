# G1.23: AI terminology suggestions in the segment editor — design

- **Date:** 2026-11-02
- **Item:** Skerfur plan §3.1, gate row G1.23 (the editing gate's hard set)
- **Decided by:** [USER], in a brainstorming session on 2026-11-02 (the experience, the group rule, the labels, the
  build order) and, after a builder check, on 2026-11-03 (notes for editors out of this version, open groups closed
  as *left open*). Everything marked **Claude's call** is a default for [USER] to check, not something [USER] decided.
- **Status of the work:** the active register's newest ⏩ RESUME entry, never this file.

> **FROZEN DESIGN RECORD — owned by G1.23, banner-dated 2026-11-03 ([USER] approved it as written).** It is evidence
> of what was designed and why; it carries no status. If it disagrees with the active register, the register wins.
> Do not sync it or edit it in place. Supersede it with a new record instead.

> **✏️ AMENDED 2026-11-09: six departures from this design's wording and seven answers, approved with the
> implementation plan** ([USER] 2026-11-09: "I approve all 8 points", to the plan's questions Q1–Q8). Each is stated,
> with its reason and its measurement, in the plan's index (`docs/superpowers/plans/2026-11-09-g123-suggestion-view.md`:
> "A<n>" for a departure, "decision <n>" for an answer). This block lists only what each one overrides or settles; it
> does not restate the reasons.
>
> - **§3, the ch10 non-goal:** ch10 is in scope. Its layer 2 was written by the 2026-11-08 re-buy, which put all 23
>   chapters under one condition (A1).
> - **§9 check 1:** the reference set is regenerated over all 23 chapters, as a new dated artifact built by a script
>   that does not load the view's code. The 2026-11-02 `drop-set.json` stays frozen as evidence (A2).
> - **§9 check 2:** the integrity reference is three duplicate-id chains, not two. The third is ch10's
>   `m68773:para:fs-idp76470512#0`, measured on the text the loader serves (A3).
> - **§3, the chapter-title non-goal:** chapter metadata is shown, with no special case. Its stated reason (the loader
>   does not serve chapter metadata) is false, and the change it names is in ch02, not ch05 (A4; decision 13; Q2).
> - **§4's measured shape** predates ch10 and is informational only (A5).
> - **§12, the switch's storage:** the per-book switch and its first switch-on time are G1.1 + G1.2's
>   `book_switch_events`. G1.23 builds only the writer and its route (A6).
> - **The B3 fence:** an accepted suggestion is an `ai-suggestion` item on the editor's own save, so it never carries
>   B3's `ai-pass` origin, which stays reserved for B3's automatic writes (decision 20; Q3).
> - **§7, reject:** a reject on a base that has changed since the screen loaded is flagged in its research event,
>   never refused (decision 10; Q4).
> - **§7, left open:** a group the editor typed over by the time its segment is finished is still written as left
>   open, with `shown_at_finish = 0` (decision 11; Q5).
> - **§6.2, the switch:** switching the view off hides every suggestion at once. The first switch-on time never moves,
>   so switching on again restores the same eligibility (Q6).
> - **§6.2, the switch:** only the admin role may flip it, and the first switch-on asks for the book's name, typed
>   (Q7).
> - **§4, the strings:** PR3 adds *Nota tillögu* / *Hafna tillögu* (button titles); *Ekki tókst að hafna tillögunni.
>   Reyndu aftur.* (a failed reject); *Tillögur gervigreindar í ritli* (the admin control); *Sláðu inn heiti bókarinnar
>   til að kveikja á tillögum gervigreindar. Fyrsti tíminn sem kveikt er á verður ekki færður.* (the first switch-on
>   prompt); and *Kveikt* / *Slökkt* (its states) (Q8).

## 1. The four records this design implements

Read with this file; this design does not restate their reasoning.

1. Skerfur plan, G1.23's row, with G1.1 (served-version record), G1.2 (event log with origin) and the dated G1.4
   consent notes beneath the table (`docs/plans/2026-10-23-skerfur-development-plan.md`).
2. `docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md`: decisions 1 and 3 and its consequences.
3. `docs/decisions/2026-10-28-rule-layer-edits-as-editor-suggestions.md`: rule edits share the view.
4. `docs/decisions/2026-11-02-short-look-drops-agreement-with-its-term-groups.md`: the drop filter.

## 2. Intent

Every chemistry unit starts from pure MT. The AI term pass (layer 2, `books/efnafraedi-2e/02-mt-revised/`) changed
terms where the MT used a competitor to [USER]'s ruled term. This view is **the only route** by which those changes
reach editors: as suggestions they accept or reject, inline, in the segment editor. Neither the editor's loader nor
the publication maps read layer 2 (G1.8 is shelved).

Why it matters:
- **Editors' time.** A term fix becomes one click instead of retyping, and the editor still judges every change.
- **The research.** Each accept or reject is a labelled assist under B1 (CLAUDE.md § Purpose), and editors'
  accept and reject rates per category are the precision measure after release (10-28 record, decision 4).

## 3. Goals, non-goals, anti-goals

**Goals**
- Show the term pass's kept changes inline, labelled as AI, for every eligible segment of chemistry.
- Accept or reject per ruling within a segment, in one click.
- Keep the AI label visible on accepted words until a head editor approves the edit.
- Record every accept, reject and left-open twice, for two purposes: an editing record that the screen depends on,
  and a research event in G1.2's log.

**Non-goals (this version)**
- **Rule suggestions.** There is no rule-layer producer for chemistry. The data model carries `source` (`ai` | `rule`)
  so they can be added; their display, their label and module-wide accept-all per ruling are a later design.
- **Changing what editors start from.** No loader switch, no layer-2 starting text, no publication of layer 2.
- **The chapter title change** in `02-mt-revised/ch05/chapter-metadata-changes.jsonl` (1 change). The segment loader
  does not serve chapter metadata.
- **ch10.** It has no layer 2. What it gets is an open question in the register; this view shows it nothing.
- **Duplicate-id segments** until G1.12 lands (§6.4).
- **The term pass's notes for editors** ([USER], 2026-11-03): 1,077 model flags (`compound-term` 542,
  `needs-rewrite` 484, `mistranslation-suspected` 34, `target-other-sense` 13, `sense-unclear` 4) and 268 leftover
  forms the runner found, in `books/efnafraedi-2e/ai-review/applied/<chNN>/`. They carry no change, so they need a
  different display with no *Nota*/*Hafna*. They become their own later item, tracked in the register. Until it
  ships, editors do not see them.

**Anti-goals: it fails even if it works, if**
- an editor is shown a suggestion on text the AI did not read;
- a suggestion lands somewhere other than the word it was made for;
- an accept counts as accepting or approving the segment (it is an assist; the segment still needs the human act,
  2026-07-19 lead decision, SD5);
- part of one ruling's changes in a segment can be taken without the rest;
- the screen depends on research data, so that a withdrawal of consent changes what an editor sees;
- an accept reloads the whole module (the G1.21 confound: a later change to the measured task skews B1).

## 4. What the editor sees and does ([USER], 2026-11-02)

Worked example, ch15, `m68813:problem:fs-idp10055184`:

> Stundum er jafnvægi fyrir **komplexjónir** lýst með **sundrunarföstum**, *K*d. Fyrir **komplexjónina** … er
> sundrunarhvarfið:

- ruling `complex-ion` (→ flókajón): komplexjónir → flókajónir, komplexjónina → flókajónina;
- ruling `dissociation-constant` (→ klofnunarfasti): sundrunarföstum → klofnunarföstum.

**The display.** Each change sits inline in the segment's Icelandic text as a highlighted swap: the old word struck
through, the new word beside it, and a **GG** tag (*Tillaga gervigreindar* on hover). Below the text, one line per
ruling: the ruling's English headword → its Icelandic term, and how many changes it makes.

**The group rule.** A *group* is one ruling's changes in one segment.
- A group with **one** change: **✓ Nota** and **✗ Hafna** sit on the word.
- A group with **two**: no buttons on the words. The words carry a group number, and the ruling's line offers
  **✓ Nota báðar** / **✗ Hafna báðum**.
- A group with **three or more**: **✓ Nota allar (N)** / **✗ Hafna öllum (N)**. *(The N ≥ 3 wording follows [USER]'s
  correction for two; Claude's call.)*
- The editor can **never** take some of a group's changes and reject the rest.

*Nota* echoes the existing *Nota þessa þýðingu* button; *Samþykkja* is avoided because head editors use it to approve
edits.

**Accept.** *Nota* writes the group's changes into the editor's pending text for that segment (the edit panel's text),
on the screen only. The words keep the GG tag. Nothing is sent to the server and the module is not reloaded.
*Hætta við* discards unsaved accepts like any other unsaved change; the groups are offered again.

**Save.** *Vista* is the ordinary save. The saved pending edit remembers which groups it took, and **the GG tags stay
on those words, for the editor and for a head editor reviewing, until a head editor approves the edit.** After
approval the tags leave the screen; the logs keep them.

**Reject.** *Hafna* hides the group on that segment for good and is logged at once (§7).

**Open groups survive a save.** A group left open when the editor saves stays offered on the saved text.

Mockups from the session (git-ignored, not part of this record): `.superpowers/brainstorm/991080-1793650533/content/`
`ch15-swaps-v3.html`.

**Measured shape of what will be shown** (2026-11-02, committed layer 2 at `a8807f848`, after the drop): 2,778
changes in 2,361 groups in 1,994 segments. The short-look record's 2,779 kept changes include one more, the chapter
title change, which this view does not show (§3). 2,077 groups have one change and 284 have two or more; the largest has 13.
All 3,032 change records carry `source: "ai"`.

## 5. What the view reads

Per module, in `books/<book>/02-mt-revised/<chapterDir>/` (chapter dirs are `chNN` or `appendices`, built with
`chapterLabel.chapterDir()`; the editor's routes pass appendices as the `-1` sentinel):

- **`<module>-changes.jsonl`** — one record per accepted operation per occurrence, in applied order:
  `module`, `segmentId`, `occurrence`, `key`, `opId`, `source`, `rulingId`, `category`, `find`, `replace`, `before`,
  `after`, `beforeSha256`, `afterSha256`, `runId`. Within one (segment, occurrence), each record's `before` is the
  previous record's `after`.
- **`<module>-revision.json`** — provenance: layer 1 (`02-mt-output` at its commit and sha256), `overlay`, the ruling
  set (path and sha256), the prompt, the model, the run ids.
- **The ruling set** named in `revision.json` (`experiments/terminology-consistency/results/2026-11-02/
  ruling-set-2026-11-02.json`), for the ruling line's labels: `en[0]` and `is` per ruling `id`.

**Never** `<module>-segments.is.md` (layer 2's text): editors never start from it.

**Only books with a `02-mt-revised/` tree** get suggestions, behind a per-book switch (§6.2). Chemistry is the only one.
Organic is never translated (CLAUDE.md § Organic) and has no layer 2.

**Fail-soft.** A missing, unreadable or malformed change log or revision file means no suggestions for that module and
a server-side warning, never an error page. That's the `mtFindings` precedent: an editor is never locked out of a
module by a derived artifact.

## 6. When a group is shown

A group is shown only if **all** of the following hold. Each rule is independent; none substitutes for another.

### 6.1 The drop filter ([USER], 2026-11-02)
Every (module, segmentId, rulingId) group, over all occurrences, that holds a change in a dropped category is
removed, **all of its changes**. Today the dropped categories are `['agreement']`. They are kept as a list in code,
so restoring or narrowing the drop changes one value and regenerates nothing.

### 6.2 Eligibility per unit (10-28 record)
A module gets suggestions only if the view was switched on for its book **before** the module was opened.
- **Switched on:** a per-book switch, off by default, whose first switch-on time is recorded and never moved.
- **Opened:** the module's first serve in the segment editor to a user holding an **assignment row** for that
  chapter, recorded once and never updated. Holding the role is not enough. Access that passes only because
  enforcement is off, an admin bypass, or a head editor's role does not count: `hasChapterAccess` fails open while
  enforcement is off, so a QA look by [USER] or a head editor would otherwise exclude the module for good. **This
  record belongs to the G1.1 + G1.2 project, not to G1.23** (§8). It must exist before any unit opens, so that if
  this view slips, the units opened before it are still known. *(Claude's calls: a serve, not a first save, because
  the serve is when the editor first sees the unit's starting conditions; and the assignment-row rule.)*
- A module opened before the switch-on gets no suggestions, ever, so a unit's conditions stay uniform for B1.

### 6.3 The text is the one the AI read (integrity)
The sha256 of the segment's **base text** must equal the `beforeSha256` of the **first** record in that segment's
change chain. The base text is **exactly the `is` string `segmentParser.loadModuleForEditing` returns to the
client**, after both `unescapeMtMarkers` and `normalizeTermMarkers`. It is not the editor's pending edit, and not the
raw file text. The 2,060-of-2,062 match below was measured on that returned string. A hash of the text before
normalisation would hide every segment the normalisation touches. The first record means the first in the full
chain, before the drop.
- **Measured 2026-11-02:** for 2,060 of 2,062 module chains the base text matches byte for byte. The other 2 are
  duplicate-id segments.
- Once G1.1 exists, this check uses G1.1's sha256 of the served Icelandic rather than computing a second hash: one
  mechanism, not two (§8).
- What it catches: a re-extraction, a hand repair, a re-buy, and an applied edit once the hold (§C203) lifts. In
  each case the AI's change was computed on text the editor is no longer starting from.
- **What it does not catch: human text that lives in a pending edit.** Under the hold, faithful-file writes for
  chemistry are refused, so a re-attached June segment (10-10 4.2) or an older editor row stays an in-flight
  `segment_edits` row while the base text stays pure MT. §6.3a covers that case.

### 6.3a Segments that already carry human text when the module opens
A segment with an in-flight edit (`isEditInFlight`: pending, or approved and not yet applied) **at the moment its
module is opened** gets no suggestions in that module, ever. That edit is human text the AI never read. Example:
`m68664` (ch01) holds rows [LEAD] re-entered on 2026-06-16, and also has change chains. The set of such segments
is taken once, at the serve that records the opening (§6.2; who records it: §8 item 4), and never changes. *(Claude's call: the 10-28 record's
"hidden if the segment's text has changed since the run" applies to this text too. A snapshot at opening is used
rather than the edit's `created_at`, which a re-save overwrites.)*

### 6.4 Duplicate segment ids (G1.12)
Until G1.12 lands, a segment id that occurs more than once in its module's served segments gets no suggestions, on any
occurrence. The loader resolves a duplicated id to its last occurrence, so a suggestion could land on the wrong copy.
**Measured:** this withholds 22 kept changes in 7 segments. Change records already carry `occurrence`, so lifting the
rule after G1.12 needs no data change.

### 6.5 The group applies, on its own, to the text now displayed
The *displayed text* is the editor's in-flight edit for the segment if there is one, otherwise the base text, plus any
groups accepted on the screen but not yet saved. A group is shown only if its changes, **applied in recorded order to
the displayed text**, each find their `find` **exactly once** at their step. That's the apply tool's own rule
(`chainChanges` in `tools/ai-review/term-pass-apply.js`).

**Never locate a change by searching the displayed text for its `find` on its own.** Measured: 56 kept changes have a
`find` that occurs more than once in the base text and is unique only after earlier changes in the chain are applied
(for example `ísómerum`, which also occurs inside `rúmísómerum` until the `spatial-isomers` change replaces it).
Consequences:
- A group that depends on another group's change (at most 11 kept changes do) appears only after that group is
  accepted, and stays hidden if it is rejected.
- A group whose words the editor has typed over, or which an accepted group has made ambiguous, disappears rather
  than landing in the wrong place.
- If two shown groups' spans overlap in the displayed text, only the earlier in chain order is shown *(Claude's call;
  measured: 0 cross-ruling overlaps in the base text, among the changes whose `find` is unique there; the 70 whose
  `find` is not were not measured, and this rule covers them anyway)*.

No `find` or `replace` contains a marker character (`[[`, `]]`, `**`, `__`, `<!--`, `|`) (measured over all 3,032
records), so a swap never touches inline markup. That is a property of today's data, not a guarantee. If a future
record breaks it, the group is not shown.

### 6.6 Not rejected
A group rejected on that segment is never shown again (§7).

## 7. The lifecycle of a group

| Event | Screen | Editing record (`sessions.db`) | Research event (G1.2) |
|---|---|---|---|
| Segment shown, group passes §6 | swap with GG tag and buttons | — | — |
| *Nota* | words replaced in the pending text, GG tag kept, no buttons | — (screen only) | — |
| *Hætta við* before saving | group offered again | — | — |
| *Vista* | GG tags stay on accepted words | the pending edit row records each accepted change (`opId`, `occurrence`) | the save event lists each accepted change as an `ai-suggestion` assist (§8) |
| *Hafna* | group gone | a rejection row per change | a `suggestion-reject` event per change |
| Head editor approves the edit | GG tags leave the screen; any group still open on the segment is closed as *left open* (next row) | unchanged (history kept) | the approve event, as G1.2 logs it |
| Segment finished with groups still open: *Staðfesta MT*, or a head editor's approval | open groups closed, never offered again on that segment | a *left-open* row per change, naming the finishing act and who did it | a `suggestion-left-open` event per change |
| Head editor rejects the edit | text back to the base; the group is offered again | unchanged (history kept) | the reject event, as G1.2 logs it |

**Left open ([USER], 2026-11-03).** Finishing a segment never waits on its suggestions. Neither *Staðfesta MT* nor a
head editor's approval is refused while groups are open, and `accept-eligibility.js` does not change. Instead the
open groups close, each recorded as a third outcome, *left open*: neither accepted nor rejected. The accept and
reject rates stay honest, and the report counts left-open groups separately.

Claude's calls in this table:
- **An accept is logged at *Vista*, not at the click.** An accept that is cancelled was never made. At save, the
  client lists only accepted groups whose `replace` text is still present in the saved text.
- **A reject is written at once.** It has no text change to ride on, and it must hide the group for good.
- **A reject is per segment, not per editor.** Suggestions are about the text, so one editor's reject hides the group
  for everyone. Every reject row names who made it.
- **A head editor's rejection of the edit reopens its groups.** No editor rejected them, so they are offered again on
  the base text. A second accept is a second event.
- **Re-saving a pending edit** (today's UPDATE path) keeps its accepted list plus any new accepts, minus any whose
  `replace` text is gone.
- **A closed group stays closed.** Revoking an acceptance or un-approving an edit does not reopen groups closed as
  left open. A head editor's rejection reopens only groups that were *accepted* into the rejected edit.

**GG tags after save** are re-found at display time: each accepted change's `replace` text, located in the saved text
by replaying the accepted changes the same way as §6.5. If a tag cannot be placed exactly, it is not shown; the
records still hold the accept.

**One pending edit per segment** (10-28 record) is read as: suggestions never create an edit of their own; they go
into the editor's pending edit for that segment. Today's schema keeps one pending edit per (segment, editor), and
this design does not change that. *(Claude's call.)*

**Who can act.** Anyone who can edit the segment can accept or reject; a head editor reviewing sees the same tags.

## 8. Depends on: G1.1 and G1.2, built first, in one project ([USER], 2026-11-02)

**G1.23 is not buildable until G1.1 and G1.2 are on `main`.** [USER] ruled that G1.2 is built first so research
capture starts from the first unit, and that G1.1 is built together with it. Their design is a separate brainstorm.
This section is the contract that design must honour; it does not design them. **G1.23's implementation plan is
written after the G1.1 + G1.2 spec is approved, against its real interfaces**, not against this section's wording.

**The G1.1 + G1.2 project must provide:**
1. The served-version record, with the sha256 of the served Icelandic, keyed on (book, module, segment id,
   occurrence, …) as the Skerfur plan specifies. **The hashed string is the `is` the loader returns to the client**
   (§6.3). §6.3 uses that hash.
2. **The module's opened time** (§6.2): set once, at the module's first serve to a user holding an assignment row
   for that chapter. This is a separate record from the served-version table, which is idempotent per version and
   says nothing about a first serve. If G1.1's design does not hold it, the project still delivers it. It ships
   before any unit opens.
3. A served-version id that a G1.2 event can reference.
4. **The §6.3a snapshot, or a hook for it.** At the serve that records a module's opening, the set of its segments
   whose served text came from an in-flight edit, recorded once. The served-version record's layer field can carry
   it. Otherwise the project gives G1.23 a hook on that same serve so G1.23 can take the snapshot itself.
5. **Consent text that names all three logged outcomes.** G1.4's text (and the 10-28 record's consequences) says each
   accept or reject is logged. This view also logs *left open*, which is about an editor's behaviour too, so the
   consent text must name it, as the rule-layer record did when rule suggestions joined the view.

**G1.2 must provide:**
1. **One logging call** that G1.23 makes for every event. G1.23 never checks consent itself; G1.2 captures only
   consenting editors' events (G1.4) and drops the rest.
2. **An assist type for accepted suggestions** on the save event. Each accepted change is its own item: `opId`,
   `occurrence`, `rulingId`, `category`, `source`, `runId`, and a group-action id shared by the changes taken in one
   click. Per change, because the precision measure is per category.
3. **A reject event and a left-open event** (§7), each with the same fields per change. A left-open event also names
   the finishing act (*Staðfesta MT* or approval).
4. **A reference** to the G1.1 served-version id of the base text on each such event.
5. **The server commit and a feature-flag snapshot** on every row (the Skerfur plan's G1.2), including this view's
   per-book switch.
6. **Its rows in the separate research database file** (G1.20). G1.23's editing record never lives there. That
   separation is what lets a withdrawal delete research rows without changing what any editor sees.
7. **A failed research write never fails the editor's save or reject, and every loss is countable.** The editing
   record is written first, in `sessions.db`. A research write that fails afterwards is retried or recorded as lost,
   in a way an analysis can count, as B1's ticks are ("the gaps measure loss"). It is never silent. *(Claude's call:
   it follows from the anti-goal that the screen must not depend on research data. G1.2's design may set the same
   rule for every event type.)*

**Relation to other gate items:** G1.21 (update the row in place instead of reloading) is not a prerequisite. A reject
must update the row in place whether or not G1.21 has landed. G1.12's choice decides when §6.4 is lifted.

## 9. Acceptance

Each check compares values or sets, never only counts (CLAUDE.md: a count cannot see a substitution).

1. **The drop filter reproduces the short look.** Over committed layer 2, the set of dropped (module, segmentId,
   occurrence, opId) the view computes equals the `droppedChanges` set in
   `experiments/ai-review-pilot/short-look-2026-11-02/drop-set.json`, compared as sets in both directions.
2. **Integrity agrees with the measurement.** The set of chains failing §6.3 is exactly the two duplicate-id chains
   measured on 2026-11-02 (compare their ids, not the count of 2). Appendices are loaded through the `-1` sentinel.
3. **The view applies what the tool applied.** For every segment, applying all shown groups in recorded order to the
   base text gives byte for byte the text the change chain gives with the dropped changes removed. This is the drop
   set's own replay, run through the view's code.
4. **End to end** (Playwright, `server/e2e/`, a throwaway database; CI runs it, `npm test` does not). The checks
   are keyed on the segment's element id, never found by searching for prose:
   - a fixture segment shows its swaps at the right words;
   - *Nota báðar* sets the pending text to the expected value;
   - *Vista* saves that value, and the GG tags are there after a reload;
   - approval removes the tags;
   - *Staðfesta MT* on a segment with an open group, and approval of an edit saved with one, both succeed, and the
     group is closed as left open and not shown after a reload;
   - *Hafna* hides the group after a reload, and for a second editor;
   - typing over a word hides its group;
   - a dependent group appears only after the group it depends on is accepted;
   - no module reload follows *Nota* or *Hafna* (requests counted).
5. **Eligibility.** A module opened before the switch-on shows no suggestions; one opened after shows them.
6. **A positive control in each negative test.** A test asserting "not shown" also asserts a sibling group in the same
   fixture *is* shown, so a view that shows nothing cannot pass.

## 10. Constraints the builder must respect

- **Paths:** resolve `books/` from the server file's own location, never from `process.cwd()`. The server runs with
  cwd `server/`.
- **Module systems:** the server is CommonJS. `tools/lib/mt-layers.js` is ESM. Either port the small reading and
  hashing it needs into `server/lib/`, or move shared code into a `tools/lib/*.cjs` module (that is the documented
  reason `.cjs` exists there). Server code importing MIT tooling is fine; the reverse direction is register gap E-2.
- **No layer-2 writes.** `02-mt-revised/` and `ai-review/` are tool-written research layers. This view only reads
  them.
- **A segment id's `elementId` is `[\w-]` only.** DOM ids come from `cssId()`.
- **Database changes** are migrations that never throw on boot (CLAUDE.md: `INSERT OR IGNORE` does not suppress FK
  violations; `048` is the worked example).
- **Organic:** nothing in this view may read, render or offer anything for `lifraen-efnafraedi`.

## 11. Questions [USER] answered after the builder check (2026-11-03)

1. **The term pass's notes for editors** are not in this version (§3, non-goals).
2. **Open groups when a segment is finished** close as *left open*, a third outcome (§7).

## 12. Left to the builder

- Storage shapes for the editing record (the accepted list on a pending edit, the rejection rows, the per-book switch
  and its switch-on time), inside the never-throw migration rule.
- How swaps render in the row display and the preview panel, and whether the textarea's marker backdrop (B-4) also
  shows accepted words.
- Whether change logs are read on each module load or cached per module, keyed on the files' sha256.
- The server route shapes, provided an accept stays client-side until *Vista* and a reject updates the row in place.
- Colours, the group number's look, the tooltip texts beyond those in §4.

## 13. Claude's calls, for [USER] to check

1. *Nota allar (N)* / *Hafna öllum (N)* for three or more (§4).
2. "Opened" = first serve to an assigned editor, recorded by G1.1 (§6.2).
3. Overlapping shown groups: the earlier in chain order wins (§6.5).
4. Accept logged at *Vista*; reject written at once (§7).
5. A reject is per segment, for every editor (§7).
6. A head editor's rejection of the edit reopens its groups (§7).
7. "One pending edit per segment" = suggestions go into the editor's existing pending edit (§7).
8. Duplicate-id segments get no suggestions until G1.12 (§6.4).
9. Fail-soft on a bad or missing change log (§5).
10. Only a user with an assignment row for the chapter can open a module; role and fail-open access do not count
    (§6.2).
11. A segment holding an in-flight edit when its module opens gets no suggestions there, ever (§6.3a).
12. A failed research write never blocks the editor, and losses are countable (§8 item 7).
13. A closed group stays closed when an acceptance is revoked or an edit un-approved (§7).
