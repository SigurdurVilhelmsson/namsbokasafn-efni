# Ritstjóri through the Skerfur year — DEVELOPMENT PLAN (proposed 2026-10-23)

> ✏️ **PLAN, proposed 2026-10-23. None of its decisions (§8) is answered yet.** This is not status: open work and
> its state live in the active register's ⏩ RESUME block.
> **What it covers.** The development work in Ritstjóri (`server/` and the `tools/` it runs) and in the reader
> (`../namsbokasafn-vefur`) that the follow-on grant ("Skerfur") needs, from **S = 1 November 2026** to the final
> report, due **1 December 2027**. It expands one line of the chemistry finish-preparation plan
> ([`2026-10-10-chemistry-finish-preparation-plan.md`](2026-10-10-chemistry-finish-preparation-plan.md), "the
> 10-10 plan" below): *"From then: editing begins as units open; term propagation and lemma/POS alongside."* The
> 10-10 plan keeps its stages 0–5 and its decisions D0–D15. This plan cites them by number and does not restate them.
> **Evidence:** a read-only review of the editorial system on 2026-10-23 at commit `3e70e4303`. Five investigators
> each covered one area (editor workflow; B1 measurement; B2/B3 terminology; outputs A, C and D; platform). An
> adversarial verifier then checked each area, re-running every "X does not exist" claim first. Code is cited as
> `path:line` at that commit, or by function name. The raw review stays off the public tree because it quotes private
> grant documents.
> **Funding.** Which grant line pays for which item is in a private companion in the git-excluded `docs/grants/`.
> This repository is public: no names, no budget figures, no hours.
> **Words used.** A *unit* is one module file. Chemistry has 149; the contract's 134 are those outside ch01–ch02 (7 + 8).
> *Apply* means writing approved text into `03-faithful-translation/`. The buttons *Vista í skrár* and
> *Vista + Birta* do it, and so does `POST /reviews/:id/complete`. *The hold* is PR #556: a code-level refusal of every
> write to chemistry's faithful files (`server/lib/applyHold.js`), which is lifted only by a code change.

## 1. In brief

1. **One ordering rule outranks the rest: nothing an editor does before measurement is live can be measured later**
   (10-10 §1 point 6). Active time, the text an editor was shown, first-edit time and each edit's origin cannot be
   rebuilt afterwards. So B1's capture is the first build after S, and editing waits for it.
2. **The hold changes what "ready to edit" means.** With PR #556 deployed, saving, accepting and approving write only
   database rows; nothing writes chemistry's text files. The register's ③ list, §C203's fixes included, therefore
   splits into **three gates instead of one** (§3):
   - **the editing gate**, before the first unit opens: measurement, consent, baseline integrity, the save-side
     defects, scope guards, and sign-in for the other two schools;
   - **the apply gate**, before the hold is lifted: the base-text guard, per-segment "human" in the TM, concordance
     and corpus, editor privacy in the published sidecar, and a module completion rule;
   - **the release gate**, before the open releases (D): BÍN containment, licence and credit fields, and the stale
     June TMX files.

   Editing can start at the first gate while the second is still being built. Approved edits wait in the database
   until the apply gate is met. **This rewords D8** ("the only gate on editing is timing and baseline capture"), so it
   is [USER]'s decision (SD1).
3. **Most of what blocks editing is not funded B work.** It is apply-path safety, editor privacy and platform
   hardening for outside editors: preparation before S, in-kind development after it. The funded B1–B3 lines are the
   three language-technology capabilities. Each is scoped below to the contract's minimum credible deliverable (§4).
4. **The review found six problems nobody had logged.** Each is an item below.
   - **The first apply would publish each editor's username, and a timestamp, per segment.** They go into the
     review-status sidecar that the cron pushes to this public repository (`acceptanceService.writeReviewStatusSidecar`;
     `by` and `at` at `server/services/acceptanceService.js:392-400`). No sidecar has been committed yet. → G2.4
   - **Per-editor activity tables and timelines are served to any signed-in account**, auto-created viewers included
     (`server/routes/status.js:122`, `:354`, `:419`). That breaks B1's promise never to compare editors. → G1.4, SD7
   - **The editor offers organic chemistry and the withheld books for editing, with no code guard.** Organic is in
     `VALID_BOOKS` (`server/config.js:102`), and the module route checks role only
     (`server/routes/segment-editor.js:263-266`). → G1.13
   - **The reader marks a module reviewed, and drops its MT banner, as soon as a faithful file exists**
     (`../namsbokasafn-vefur/scripts/generate-toc.js:260`). Today one approved edit writes the whole module. → G2.6, SD8
   - **B2's tagger and C's speech chain are Python, and a recorded decision commits the project to hosted APIs rather
     than self-hosted Python** (`docs/decisions/2026-08-06-mideind-toolchain-evaluation.md`, Consequences). Both need a
     scoped exception before they are built. → SD9
   - **The TMX metric "21,251 parallel units" counts every text segment except alts and table summaries:** ch01–ch02
     (2,391), the appendices (2,736) and chapter 0 (107) included (22,591 − 1,149 − 191; measured 2026-10-23 with
     `tools/export-corpus.js`). Under the per-segment "human" rule (10-10 4.0), each one needs an edit or an explicit
     acceptance. → SD5
5. **[USER]'s time is the binding resource for development.** Every merge, deploy, production write and sync is
   [USER]'s, alongside full-time teaching. So the plan batches work by gate. While editors are working, it allows at
   most one deploy a week, and it places each decision where it costs least (§7).

## 2. What exists today, per commitment

Measured or read on 2026-10-23. "Half-built" means some code exists, but not the part the commitment needs.

| Commitment | Works | Half-built | Absent |
|---|---|---|---|
| **A, editing** | open a unit; edit with a structural backstop; MT acceptance per segment; approve, reject or discuss per edit; apply; version history; sentence-level propagation (*Beita víðar*); chapter assignments; in-app notifications | the module review wrapper (`module_reviews`; no screen reads it); discussion threads (API, no UI); the save gate (legacy marker shapes only, §C53); assignment enforcement (chapter level, off and fail-open by default) | segment-level notes (10-10 2.2); re-attach by content (10-10 4.2); bulk approve; an editor's list of their own units |
| **A, publishing** | *Vista + Birta* for one module; the manual sync to the reader | chapter publish (all or nothing); the four ⑰ modules refuse from the editor, and the reason is hidden (§C153); the faithful track has no `glossary.json`/`index.json` (§C105) | a completion rule; per-chapter release (§C142); the follow-on's credit sentence |
| **B1** | pure MT in git; edit rows with before and after text; acceptances anchored to exact bytes; a snapshot before each apply | the baseline is client-supplied (`original_content`); `activity_log` holds event times without content | the served-layer record; edit origin; revision history; active time; consent; character- and word-level distance |
| **B2** | an English-anchored term check with an Icelandic whole-word test (`terminologyService.findTermsInSegments`); BÍN paradigms for about 28% of term strings, none multi-word | — | lemmatiser; tagger; lemma index; change classifier |
| **B3** | sentence-level propagation with preview, eligibility checks and pending edits (`propagationService`); the read side of `book_term_preference` | the terminology assistant: U2 of U1–U9 (`docs/plans/2026-09-06-editor-terminology-assistant.md`) | a term-decision writer (U4); acceptable forms (U5); replace-into-slot (U7); BÍN credit in the editor (U8) |
| **C** | inputs: LaTeX for every equation (`02-structure/*-equations.json`); prose formulas as `[[sub:]]`/`[[sup:]]` markers; source paragraph ids in rendered pages | a December 2025 reader prototype that reads Markdown (none exists now) and targets another TTS server (`../namsbokasafn-vefur/scripts/generate-audio.ts`) | everything else |
| **D** | the TMX tool (`tools/generate-tm.js`); the corpus export with per-row review status (`tools/export-corpus.js`); the resolved glossary export | the TMX pairs every faithful segment as human (§C202); the corpus lacks the selected and revised tiers | a chemistry-only harmonised term collection; a release step; a BÍN containment gate; licence and credit fields in the exports |

**Pre-existing at S, never claimed as follow-on work.** The S tag (10-10 §1 point 0) records them: U2 (2026-09-06), the
apply hold (PR #556), sentence-level propagation, the BÍN paradigms, the review's read scripts.

## 3. The three gates

Each item gives its owner (a register §, a 10-10 item, or this plan), a size and a line. **Sizes** are build estimates
in working sessions: S is one, M two to four, L five to ten, XL more or unknown until a spike. [USER]'s review and
deploy time is extra. **Lines:** B1, B2, B3, C, A and D are the contract's work packages. *In-kind* is software
development outside the funded scope. *Prep* is preparation: the current grant before S; after S, in-kind where it
fits a line and otherwise unfunded (10-10 §5).

### 3.1 The editing gate: before the first unit opens

**Exit test:** G1.6's sentinel passes on production's code, then [USER] says go.
**Per-module gates:** some items block only the modules they touch. Choose the first units from modules that are clear of
them: G1.12 (83 modules with duplicate ids), 10-10 4.2 (the modules holding the 137 in-repo human segments) and
10-10 2.2 (ch01–ch02).

**Measurement (B1, funded)**

| # | Item | Why | Size |
|---|---|---|---|
| G1.1 | **Served-baseline record.** For each segment served, the server records the layer, the freeze commit, the sha256 of the English and the Icelandic, and the Icelandic text. An edit's `original_content` comes from that record, never from the client | Today the server loads its own baseline for the marker check and discards it (`routes/segment-editor.js:394`). It then stores the client's value, which defaults to `''` (`:423`) | M |
| G1.2 | **Edit history and origin.** First-save time; an origin on every edit row (hand, propagated, re-attached, note-applied, inserted suggestion, batch accept); an append-only event log | A re-save overwrites `created_at` (`segmentEditorService.js:147`), and an unchanged save deletes the row (`:111`). A propagated row looks typed, apart from an editable default note (`routes/segment-editor.js:1507`). The Pass 2 editor's `localization_edits` (migration 011) is the in-repo pattern | M |
| G1.3 | **Active-time capture.** Client ticks while the tab is visible and focused; a server route and table keyed on an internal editor key (§4.1) | Nothing measures time. `server/public/js` has no visibility, idle or beacon code | M |
| G1.4 | **Consent, retention, access.** Written consent per editor; a retention rule; no route that returns per-editor time or distance; the per-editor tables restricted (SD7) | `/api/status/dashboard`, `/activity/timeline?user=` and `/analytics` need only a sign-in. Backups keep about 7.5 days of deleted rows (30 copies, six-hourly: `scripts/backup-db.sh`), and the retention rule must say so | S |
| G1.5 | **Measurement protocol, frozen.** Units, idle threshold and sensitivity range, normalisation, the three distances, B2's change categories, exclusions, minimum cell size (SD6). Committed before any data exists | A method chosen after seeing the data weakens every claim built on it | S |
| G1.6 | **End-to-end sentinel.** On a scratch copy, open a test unit and show the whole chain: baseline row → time ticks → event rows with origin → a computed distance | A count can be right while nothing reached the table (CLAUDE.md, the sentinel rule) | S |

**Baseline and research design (prep and B1)**

| # | Item | Why | Size |
|---|---|---|---|
| G1.7 | **Freeze tag and manifest; MT re-lock** (10-10 5.1, 4.4). Run `scripts/backfill-mt-locks.js` on production | The lock hook fires only on a module's first-ever row (`segmentEditorService.js:214`). It never fires for the five modules with old rows, and propagation never locks at all | S + a prod run |
| G1.8 | **The layer-2 loader** (10-10 4.1), whenever editors start from layer 2, with or without the AI pass (the 10-10 slip rule). Whatever editors start from, G1.1 records it per segment | The loader reads only the faithful file or pure MT (`segmentParser.js:115-120`) | M |
| G1.9 | **Control units drawn and recorded** if D7 = (b) | A unit's arm cannot be assigned after it opens | S |

**Safety on the save side (prep and in-kind)**

| # | Item | Why | Size |
|---|---|---|---|
| G1.10 | **Deploy the hold (PR #556), then run the 1.6 status script** (approve 10, supersede 28; [USER]'s answers of 2026-10-23) | The hold is built and passes CI. The script is written test-first once the hold is on `main`, because its `--apply` refuses unless the hold is active | S |
| G1.11 | **§C53 save gate for the bracket dialect** | Chemistry's MT uses `[[xref:]]`, `[[link:]]`, `[[docref:]]`, `[[sub:]]`, `[[sup:]]`, `[[i:]]` and `[[term:]]`. The gate checks only legacy shapes (`server/public/js/segment-validation.js`), so deleting any of these markers still saves | S–M |
| G1.12 | **Duplicate segment ids** (register ③'s "save block on 71 segments") | Measured 2026-10-23: 285 ids are duplicated across 83 modules. The second occurrence cannot be opened (its DOM id collides), its save is validated against the first occurrence, and it shows the last occurrence's Icelandic (`segmentParser.js:135`) | M |
| G1.13 | **Scope guards.** Close organic and the withheld books to editor writes. Turn on assignment enforcement for chemistry, assign the chapters and finish the A4 walk. Propagation must check the target chapters too | Editors have no book scope. Enforcement is off and fail-open (`userService.js:646`). Propagation checks only the source chapter (`routes/segment-editor.js:1475`) | S |
| G1.14 | **Terminology screen hygiene.** Define the QA population (§C157 book-wide, §C165; D15), or hide the issue flags until then. Disable or relabel the old-model approve/dispute/propose buttons. Offer *Beita víðar* only once G1.2's origin exists | About 2.81 issues per segment would meet editors on day one. The old buttons write tables that nothing reads (§C42) | S–M |
| G1.15 | **Re-attach by content** (10-10 4.2). Before ch01–ch02 open: **segment-level notes** (10-10 2.2) | Only the id-based script exists (`scripts/reattach-segment-edits.js`). `experiments/mt-vintage-comparison/scripts/humanreview/reattach.py` is a read-only prototype of the content match | M each |

**Platform for three outside editors (in-kind)**

| # | Item | Why | Size |
|---|---|---|---|
| G1.16 | **Sign-in for the other two schools** (SD2). Record the OAuth client secret's expiry and set a reminder. Correct the editor guide's sign-in step | The app registration is single-tenant (`docs/planning/microsoft-auth-migration.md`), and the secret's expiry date there is blank. When the secret lapses, nobody can sign in | S or M |
| G1.17 | **SA-01 and credentialed CORS.** Close attribute injection at inject and at render. Drop credentialed CORS for reader origins, decided together with the reader's page-view beacon | An attribute typed after an allowlisted tag name survives inject's escape (`tools/cnxml-inject.js:1815-1849`). It reaches the preview and the reader's `{@html}`. The reader is same-site with Ritstjóri, and CORS allows credentials (`server/index.js:199-233`). Outside editors are a new trust boundary | M |
| G1.18 | **SA-19 and SA-07** | Open redirect (`routes/auth.js:70-71`). Sessions cannot be revoked: a role change waits for the next sign-in (`middleware/requireAuth.js:42-59`), and an `ADMIN_USERS` address is promoted before the `is_active` check (`services/auth.js:168`, `:196`) | S each |
| G1.19 | **Alerting that reaches a person.** An external check of `/api/health`'s body: any `status` other than `ok` | The endpoint answers 200 even when degraded (`server/index.js:383-390`). Production sends no e-mail, and nothing polls the endpoint | S |
| G1.20 | **Backups sized for a year of research data.** `sqlite3 .backup` or `VACUUM INTO` instead of `cp` of a live WAL database; a long-lived tier; bucket versioning; more frequent copies in editing months | `scripts/backup-db.sh:45` copies the live file. Both tiers keep the newest 30 copies only, about 7.5 days | S |
| G1.21 | **A deploy practice for working days.** Announce a window, check production's tree first, write down the rollback (previous commit plus the pre-deploy database copy) | `deploy.sh` stashes production's tree, and finishes even when the stash pop conflicts (`scripts/deploy.sh:61`, `:82-83`) | S |

**Editor throughput (in-kind).** Land these before the gate, so that measurement starts on a stable editor. Any
later change goes into the protocol as a dated intervention. The input is the frozen UX audit, PR #367 (register ③).

| # | Item | Why | Size |
|---|---|---|---|
| G1.22 | **Update the row in place** instead of reloading the module | Every save and accept reloads the whole module: 4 requests for an editor, 6 for a head editor, one of them a whole-module term scan. The median unit has 122 segments | S–M |
| G1.23 | **Save-and-next** (Ctrl+Enter opens the next unhandled row); **bulk approve** per module from its diff list; editor and reviewer notes shown in the row; one module parse per save | Today Ctrl+Enter only saves (`segment-editor.js:3416`), approval is one click per edit, and the reviewer's note never appears in the editor | S each |
| G1.24 | **An editor's home page lists their units.** Retire *Senda til yfirlestrar*, or give it a list | `my-work` shows only returned edits. No screen reads the `module_reviews` rows that the button creates | S |
| G1.25 | **Rewrite the editor guide** | It predates MT acceptance and Ctrl+Shift+Enter, calls saving automatic (it is a local draft), promises a reply thread that does not exist, and points at a page that now redirects | S |

### 3.2 The apply gate: before the hold is lifted

**Exit test:** a test copy holding production's chemistry rows applies cleanly. Every stale-base row is refused and
listed, and every unedited segment stays out of the TM.

| # | Item | Why | Owner | Size |
|---|---|---|---|---|
| G2.1 | **Base-text guard.** At apply (and at approve), refuse an edit whose recorded base differs from the current text, and list it for the head editor. Newer rows use G1.1's record; older rows use `original_content` in the editor view | `applyApprovedEdits` never compares the two (§C203). Acceptances already have this guard: `acceptanceService.lapseDrifted`, called from `applyApprovedEdits`. Copy its shape | §C203 (b) | M |
| G2.2 | **Supersede the old production rows** (10-10 4.2; §C114 ①), the 41 armed old-MT approvals among them | They were made on the old MT. Re-attach by content decides which ones carry over | 10-10 4.2 | S + a prod run |
| G2.3 | **Per-segment "human"** (10-10 4.0). Until it lands, suspend TM regeneration and concordance indexing on apply and on restore | The TM pairs every segment of a faithful file (`tools/lib/tm-export.cjs:258`). Concordance indexes every segment and offers it to editors as human-approved (`concordanceService.indexModule`), on restore and in `server/scripts/backfill-concordance.js` too. §C202 does not name concordance | §C202 | M |
| G2.4 | **Sidecar privacy.** Drop `by` and `at` from the review-status sidecar. Identity stays in the database | Section 1, point 4. `tools/export-corpus.js` reads only `status`, so nothing breaks | this plan | S |
| G2.5 | **Apply-path correctness:** §C112, §C59, §C198 ① | A faithful file shadows the MT: a segment missing from it loads as `''` and is written back empty (`segmentParser.js:115-165`). Applying one chapter's `chapter-metadata` marks other chapters' title edits as applied without writing them, and lapses their title acceptances. A restore is keyed on current segment ids. *(Under the hold, a restore is refused for chemistry.)* | register ③ | M |
| G2.6 | **Module completion rule** (SD8). A module publishes to the faithful track only when every segment is edited or accepted; only then does the reader drop its MT banner. The chapter's `linguisticReview` auto-advance uses the same rule | Today the first approved edit writes the whole module (§C202), and the auto-advance fires after one apply per module (`segmentEditorService.js:1148-1151`) | this plan | S–M, plus a reader check |
| G2.7 | **Lift the hold:** a code change to `server/lib/applyHold.js` that names the guards making it safe | The hold was built so that lifting it is deliberate | this plan | S |

**Before the first reviewed publication** (later than the first apply):
- **G2.8:** §C105 (the faithful track's `glossary.json` and `index.json`), after §C104.
- **G2.9:** ⑰ and §C153. The server's inject never passes `--no-annotate-en` (`server/services/pipelineService.js:197-206`), so the four ⑰
  modules refuse from the editor, and the editor sees only an exit code.
- **G2.10:** the credit sentence and per-chapter release (§5.1, §5.3).
- **G2.11:** redirect rows for each release batch. Every reviewed title fix renames a page, and the reader redirects only
  the rows copied into its table.

### 3.3 The release gate: before the open releases

Listed with the releases in §5.2: G3.1–G3.7.

## 4. The three funded capabilities and the audio

### 4.1 B1: measure post-editing

**Contract.** Ritstjóri keeps both the unchanged MT and the approved final text of each unit. It measures the extent
of change at character and word level, and the editors' active editing time. Results are published only in aggregate,
never to compare editors. Metrics: edit distance for all 134 newly reviewed units; active post-editing time per 100
characters, measured systematically from implementation onwards.

**Minimum credible deliverable.** G1.1–G1.6 live before the first unit opens; then, at the end, a distance library and
an aggregate report over complete units.

**Design points from the review**
- **Store ticks, not keystrokes.** Keystroke timing can identify a person, and stored ticks let the idle threshold be
  re-applied in a sensitivity analysis.
- **Activity** is trusted keydown, click, scroll and input in the focused, visible tab. Three of the editor's own
  actions dispatch a synthetic `input`: the repetition insert, the term insert and the markup wrap
  (`segment-editor.js:881`, `:3264`, `:3325`). Count the click that triggered each one. An `isTrusted`-only filter
  would drop real work.
- **Visits are timed by the client.** The module GET re-fires after every save and accept, so it is no visit boundary,
  and the first-serve record must be idempotent.
- **Flush** on the existing five-second draft tick (`segment-editor.js:108`), and with `navigator.sendBeacon` on
  `pagehide`. Writes are idempotent on session and sequence number, so a retry cannot count twice, and gaps in the
  sequence measure loss. Never send them through the public `POST /api/analytics/event`, which is unauthenticated.
- **Distances.** One CommonJS library in `tools/lib/`, loadable from both trees, computes character-level Levenshtein
  and word-level edit distance, as rates per 100 characters and per word.
  - **One normalisation for both sides:** the editor view (`acceptanceService.editorViewOf`, `tools/lib/mt-normalize.cjs`) plus marker
    stripping, with each `[[MATH:n]]` as one token.
  - **Three pairs:** pure → served, served → final, pure → final.
  - **Scope:** complete units and hand-origin edits only, stratified by segment type (prose, alt, table summary), since
    D12 may set different review depths for them.
  - **Independent check:** `experiments/mt-vintage-comparison/scripts/verify-carryover/diffsize.py`.
- **What can be recovered for older edits:** save timestamps, from `activity_log`; never the content of intermediate
  revisions.

**Done when:** G1.6's sentinel passes on production's code; at the end, the report reproduces from the frozen
protocol over every complete unit.

### 4.2 B2: term detection with lemmas and POS tags

**Contract.** Connect rule-based lemmatisation (Nefnir, built on BÍN) and POS tagging (ABLTagger) to Ritstjóri. Use
them to find terms in running text, neologisms and compounds missing from BÍN included. Metric: at least four
formal, lemma-based categories of change, classified automatically.

**What exists.** `terminologyService.findTermsInSegments` starts from an English hit, then tests whether the expected
Icelandic, or one of its stored BÍN forms, appears as a whole word.
- **Coverage:** BÍN paradigms cover about 28% of candidate term strings and none of the multi-word ones
  (`server/scripts/fetch-bin-inflections.js` skips them).
- **The English anchor is surface-exact.** *"Atoms are small."* gets no hit, so that segment's Icelandic is never
  checked.
- **Two heuristic tools to beat:**
  - `tools/chapter-term-check.js`: plural-tolerant English, Icelandic stems that reach into solid compounds, and the
    rival words the MT used;
  - `experiments/terminology-consistency/measure.py`, with 38 self-test cases.

**Recommended design** (needs SD9):
- **B2a, detection in the editor.**
  - **No tagger on the production box.** Nefnir's rules are ported to the server's runtime and run in a tag-free mode
    that keeps every candidate lemma, for recall.
  - **A per-segment lemma index** in `sessions.db`, keyed on the sha256 of the segment text, never exported.
  - **Term lookup:** single words by lemma; compounds by their head; multi-word terms as a lemma sequence.
  - **English plurals normalised** on the English side.
  - **Fallback:** today's regex wherever the index is stale.
  - **First check:** the licence of Nefnir's rules file, and whether it is derived from BÍN.
- **B2b, classification as a batch.**
  - **Input:** pairs of served baseline and approved final, exported without editor identity.
  - **Tagger:** runs offline on a non-production host.
  - **Categories:** pre-registered in G1.5. Proposal: inflection only (same lemma); term substitution (a ruled pair);
    other lexical substitution; insertion or deletion; reordering; orthography or markup only. That is six, against
    the contract's four.
  - **Validation:** a hand-labelled sample. Editors chose a category on 1 of 151 harvested edits, so no labelled data
    exists yet.
  - **Output:** aggregate only.
- **Why not a Python service in production.** The 2026-08-06 decision's reasons still hold: about 600 MB for one
  sidecar, on a box of about 3.9 GB that serves three sites; and a sidecar that was never deployed. An offline batch
  on another host leaves those reasons intact.
- **A correction to carry into SD9's record.** The 2026-08-12 record rejects morphology as the primary route, citing a
  compounder yield of "roughly 3%". The 2.96% belongs to the forms-indexing alternative
  (`test-results/b4b-matcher-cutover-2026-08.md`, B11.5). The compounder itself was sized at 45.1–70.5% coverage
  (B11.3, upper bounds).

**Done when:** (a) the term check finds ruled terms in inflected and compound forms that today's regex misses. This is
measured on the self-test cases and the ruled targets, with a negative control. (b) The classifier reproduces the
validation sample at the accuracy G1.5 fixed, and has been run over all complete units.

### 4.3 B3: term decisions propagated in inflected forms

**Contract.** New or changed term decisions propagate across the whole book automatically, in correct inflected forms.
[USER]'s acceptance threshold (§C78) is a single flip of a term that propagates at least semi-automatically through
the book.

**Not the 10-10 AI pass.** That pass (layer 2) is a one-off preparation step and a separate research condition. B3 is
the Ritstjóri feature for decisions made **during** editing.

**Build order** (the assistant plan's recorded dependencies):
1. **U8:** BÍN credit and a modification statement in the editor, before any panel shows an inflected form.
2. **U1:** capture the Icelandic form actually matched.
3. **U3:** a term-keyed occurrence finder. Only the key in `propagationService` changes.
4. **U4:** a term-decision writer into `book_term_preference`, with an audit trail. Blocked on D15.
5. **U5:** acceptable forms per term and slot, confirmed by an editor. They cover the compounds, multi-word terms and
   affixed forms that BÍN lacks.
6. **U7:** replace-into-slot. One pending edit per occurrence, with origin `propagated`. Where no confirmed form fits
   (a gender change, agreement, an ambiguous case), the occurrence is flagged for a hand fix, never guessed.

U9 (BÍN tags as an auto-seeder for U5) comes only after U5. U6 (accepting a deviation in one segment) is independent.

**Rules**
- **One read API over the three places decisions live:**
  - `server/lib/houseStyleTerms.js` (code, asserted on boot by migration 051);
  - `book_term_preference` (production);
  - the compiled ruling set (`experiments/terminology-consistency/results/2026-10-11/ruling-set-after-stage1.json`).
- **Propagate only from recorded decisions, never from raw approved rows** (§C117, §C128, §C157, §C193).
- **Preview across the whole book; apply chapter by chapter.** Every propagated edit is a pending edit through the
  apply gate, where G2.1's guard covers it.
- **Retire or redirect the old model's writers before its tables are dropped.** The `/terminology` screen and term
  mining write `terminology_translations`, which nothing reads (§C42).

**Done when:** on a test copy, a ruled flip of a real term produces correct per-occurrence pending edits across the
book, with every occurrence that fits no form flagged. Then an editor approves one chapter's set.

### 4.4 C: audio

**Contract.** Put the national speech chain to work on science text: Regína normalisation, IceG2P transcription and a
Talrómur voice. Add a pronunciation layer for chemistry symbols and formulas, linked to Ritstjóri's term base.
Pre-generate audio for reviewed chapters and deliver it as stable files. Everything is self-hosted.

**Exists:** the inputs in §2. Nothing else: no efni code, no reader player (the React player was deleted in the
SvelteKit migration), and no pronunciation field in the term base (`concept_term` has none).

**Plan, in order**
- **C.1 Decision record** (SD9, together with B2): an offline batch on a non-production host, with nothing new on the
  production box. *Self-hosted* means no third-party cloud voice.
- **C.2 Spike,** once the first reviewed chapters exist:
  - install the chain;
  - synthesise one reviewed section and listen with [USER];
  - time one chapter;
  - re-verify the licence of every component, lexicon and voice.
- **C.3 Text extractor** over the reviewed layer: reading order, headings, notes, alts, tables and inline English
  glosses.
- **C.4 Pronunciation layer:** symbols, formulas and units, read from the LaTeX and the markers, held in a new table
  linked to the concepts.
- **C.5 Generation per reviewed chapter,** keyed on a content hash so that an edit marks the chapter's audio stale.
  Storage per SD11, plus a manifest.
- **C.6 Reader side:** a player, manifest fields and an offline policy. The offline manifest lists only pages and two
  JSON files, and reports an `<audio><source>` as unparsed. The reader's own proposal for device-voice read-aloud is
  not the contract's deliverable; reconcile the two so readers are not offered both.

**Done when:** every reviewed chapter has stable audio files, regenerated when its text changes, served by the reader,
with credits.

## 5. Publishing, releases, credits and statistics

### 5.1 Publishing reviewed chapters (A)

The path today is approve → apply → inject → render → the two-hourly push → [USER]'s manual sync → the reader's
deploy. On top of the apply gate (§3.2), it needs the following.
- **Per-chapter release (§C142).** The sync publishes whole books, and the reader's own record puts chapter hold-back
  on a mid-December clock (`../namsbokasafn-vefur/CLAUDE.md`, the chemistry release).
- **An honest front page.** It says *"Vélþýtt og yfirlesið af starfandi raungreinakennurum."*
  (`../namsbokasafn-vefur/src/routes/+page.svelte:181`). That claims a review that has not happened, against the
  reader's own rule (`src/lib/data/bookCredits.ts:19`). Fix it in the reader.
- **Expect a dip at the next chemistry sync.** It takes readers from four "reviewed" June pages, which were ruled
  retired, to none, until new faithful modules publish.
- **Figure approvals.** A reviewed page also carries figure approvals (`data-figure-review`), which are separate from
  segment review. Figure review stays closed in production until [USER] reopens it.

### 5.2 The open releases (D): the release gate

| # | Item | Why |
|---|---|---|
| G3.1 | **TMX** human-only (G2.3), with licence, attribution, modification statement and both grants' credits in the header. Supersede the three committed June-vintage files (SD10) | Measured 2026-10-23: 296 of 360 and 287 of 349 of their units equal the MT of their time. The `tmCreated` stage counts any book-level TMX file as done once a chapter's review stage is complete (`server/routes/status.js:1404-1413`), and that stage advances after one apply per module |
| G3.2 | **Corpus:** selected and revised tiers; `postEdited` measured against the served text (G1.1); a release step (human-only subset vs the full research corpus); provenance joined from `02-mt-output/*-provenance.json` | `postEdited` compares with pure MT today (`tools/export-corpus.js:89`) |
| G3.3 | **A chemistry-only term collection with definitions,** built from the resolved model and the rulings | `glossary-unified.json` is cross-domain (444 of its 1,748 terms are chemistry) and calls every term approved. The old `GET /api/terminology/export` carries BÍN forms and personal names. The reader `glossary.json` (June vintage) is the seed for definitions once regenerated (register ②) |
| G3.4 | **BÍN containment:** a test pinning `glossary-unified.json`'s term keys; a release-time scan of every artefact; a CC BY-SA entry and a caller for `tools/lib/licence-containment.cjs`; strip the forms from `test-results/c73-retire44-manifest-2026-08-12.json` and `test-results/b4b1-bin-population-2026-08.md`; restrict `inflections` in the old-model term routes | No test or gate stops a one-line export change from adding BÍN forms. Two committed files already hold them (the register's "C41 manifest") |
| G3.5 | **Stale public lists.** Label or supersede `exports/*.csv` (committed 2026-06-19 with no README or licence) | One of them holds Íðorðabankinn-sourced rows |
| G3.6 | **Metric definitions:** 21,251 (SD5) and "approved terms" (SD3, baseline at the S tag) | Section 1, point 4 |
| G3.7 | **Deposit and posting.** Confirm the deposit route against the contract's annex, and post the outputs on the grantee's website (contract) | No tracked document names it |

### 5.3 Credits

**Both grants are credited everywhere the project publishes:**
- **Reader:** the per-page attribution footer, which renders on every section and chapter page
  (`../namsbokasafn-vefur/src/lib/components/BookAttribution.svelte`); `/leyfi`; the print colophon, so that PDFs carry
  it too.
- **Releases:** the TMX header, the corpus manifest, the term collection and the audio metadata.
- **Elsewhere:** reports, articles and talks.

The wording is the contract's, which [USER] supplies. It must be in place before the first reviewed publication. Today
only the reader's front page carries a credit, and only for the current grant (`src/lib/data/about.ts:42`).

### 5.4 Reader statistics and the methodology report

- **GoatCounter is installed** (`../namsbokasafn-vefur/src/app.html`). No code counts client-side navigation, so section
  views inside the reader may register only on full page loads. Verify on its dashboard before any number is reported.
- **A second, first-party stream** also exists: the reader's page-view beacon to `POST /api/analytics/event`, which
  writes into `sessions.db` beside the B1 data. [USER] has ruled to remove it (the reader's decision record `a64e62f`,
  on an unmerged reader branch). Land that removal together with G1.17's CORS change.
- **The methodology report** is generated from the frozen protocol (G1.5) and the aggregate reports. It covers time use
  and cost, with MT cost taken per pass from the invoices (§C91 ①).

## 6. The platform through the year

- **Node 22 → 26 before 2027-04-30,** when Node 22 loses security support (CLAUDE.md § Tech Stack).
  - It is an npm 10 → 11 lockfile migration plus a native rebuild, on a host shared with the reader and another site.
  - `deploy.sh` refuses to deploy while `.nvmrc` and `/usr/bin/node` disagree.
  - Window: the Christmas break; Easter as the fallback.
- **Dependencies.** Weekly Dependabot; five bare `>=` overrides; Actions pinned to commit SHAs (§C200's open items).
- **Tests.** The full suite takes about 20–25 minutes on the dev box, and each new migration lengthens the fresh-database
  tests. Budget review time for that.
- **The Greynir sidecar** was ruled for deletion on 2026-08-06 and is still in the tree. Delete it under SD9, which also
  settles the §C25/§C44 coupling.
- **Grammar and spelling help for editors.** The Málstaður grammar route was adopted on 2026-08-06 with its cost basis
  open (§C25). It is later work, done if editors ask for it.

## 7. [USER]'s part, and the calendar

**The cadence.**
- [USER] carries every merge, deploy (it needs `sudo`), production write and sync: a bus factor of one.
- Work is grouped by gate.
- While editors are working, at most one deploy a week, in an announced window (G1.21).
- Decisions are batched at the points in §8.

| When | Editing | Build | [USER] |
|---|---|---|---|
| **Before S** (to 31 Oct) | none | the 1.6 script; the S-tag contents; this plan's critique and revision | merge and deploy PR #556; run 1.6 on production; SD1–SD3; ask the registering school's IT (SD2); D11 (register) |
| **Month 1** (Nov) | none; the 10-10 preparation runs (layers, freeze around 29 Nov–6 Dec) | the editing gate (§3.1): B1 capture first, then safety, scope, platform and throughput; SD9's decision record | SD4–SD7; editors' consent; the production re-lock; go/no-go at the gate |
| **Month 2** (Dec) | pilot units, a few per editor, chosen clear of the per-module gates | the apply gate (§3.2); Node 22 → 26 over the break | review the pilot's data; the mid-December reader release (register and reader own it) |
| **Month 3** (Jan) | full pace | lift the hold once the apply gate is met; B2a; B3 U8, U1, U3 | the lift deploy; SD8; first throughput check against the estimate |
| **Months 4–6** (Feb–Apr) | full pace; first reviewed publications | B3 U4 (after D15), U5, U7; C spike; the credit sentence and per-chapter release; Node's end of support on 30 Apr | mid-project review in month 6: measurement health, throughput, the doubt clause (§9) |
| **Months 7–9** (May–Jul) | full pace | C production per reviewed chapter; the reader's player; release machinery (§5.2) | SD10–SD11 |
| **Month 10** (Aug) | editing ends (the application's months 2–10) | B2b classifier over complete units | — |
| **Months 11–12** (Sep–Oct) | catch-up | B1 distances and aggregate reports; releases assembled and deposited; audio for every reviewed chapter | the reports |
| **By 1 Dec 2027** | | | the final report |

## 8. Decisions for [USER]

None is answered. Each carries a recommendation, and everything not listed takes the default stated in its section.
The 10-10 plan's open decisions D7 (control arm), D12 (review depth for alts and table summaries) and D13 (ch01–ch02)
also gate the editing gate. Per-chapter release (§C142) is the register's and must be settled by mid-December.

**Now, before S**

| # | Decision | Recommendation |
|---|---|---|
| SD1 | Replace D8 with the three gates (§1 point 2, §3) | **Yes.** The hold makes it safe, and editing starts weeks earlier than it would if every ③ item came first |
| SD2 | How editors from the other two schools sign in: (a) guest accounts in the registering school's tenant; (b) a multi-tenant registration, which first needs id_token validation (tid, aud, iss), users keyed on the immutable object id, an explicit tenant allowlist and `AUTO_CREATE_USERS=false` | **(a).** It needs that school's IT, which is outside the project's control, so ask now. Record the client secret's expiry at the same time |
| SD3 | What counts as an "approved term" for the end-of-project growth metric, and its baseline | **Chemistry headwords with a recorded ruling** (code entries, chemistry preference rows, the compiled ruling set). Snapshot it at the S tag with a read-only production read. The export cannot serve, because it calls every term approved (`server/lib/resolvedGlossary.js:122`) |

**Before the editing gate (month 1)**

| # | Decision | Recommendation |
|---|---|---|
| SD4 | Who approves edits: (a) [USER] alone, with bulk approve; (b) the three editors review each other's work, as head editors for chemistry with self-approval turned off, while [USER] spot-checks; (c) self-approval | **(b).** Under (a), [USER] is a click on every edited segment of 134 units. Head editors may approve their own edits today (`segmentEditorService.js:404`). B1 counts editing and approval time separately |
| SD5 | The acceptance rule, and what 21,251 counts | **Allow "accept the rest of this section"** with the count shown, written as per-segment rows with a batch id that B1 reports separately. **21,251 counts human-verified units** (edited or accepted), reported beside the 1,340 alts and table summaries |
| SD6 | Protocol parameters (G1.5). The time metric per 100 English source characters, with per source word and per 100 Icelandic characters as secondary measures. The idle threshold. Whether reading time on accepted segments counts. Whether head-editor time counts. Whether ch01–ch02 are in the population. How assisted edits are treated. The consent text and what happens if an editor declines. Retention | Reading time **counts**. Head-editor time is reported **separately**. ch01–ch02 are **out of the B1 metric**. Assisted edits form **their own category**, outside the hand-edit distances. An editor who declines **edits untimed**. Raw ticks are **deleted once the final report is approved**. The idle threshold is fixed before any data, with a sensitivity range |
| SD7 | The per-editor tables and timelines | **Admin only, with no ranking by volume and never any time or distance.** Viewers see none |

**Before the apply gate (month 2)**

| # | Decision | Recommendation |
|---|---|---|
| SD8 | The module completion rule (G2.6) | **Reviewed only when every segment is edited or accepted.** Until then the module stays on the MT-preview track |

**Before B2 and C are built (months 1–2)**

| # | Decision | Recommendation |
|---|---|---|
| SD9 | Scope the 2026-08-06 hosted-API decision for B2's tagger and C's speech chain | **An offline batch on a non-production host, with nothing new on the production box.** Write it with `/decision-record`, carry §4.2's correction about the 2.96%, and delete the Greynir sidecar |

**Before the releases (months 7–9)**

| # | Decision | Recommendation |
|---|---|---|
| SD10 | Licences and history: (a) may the pure-MT and AI tiers go out under CC BY 4.0 (the provider's terms on output are not recorded)? (b) Íðorðabankinn-sourced terms in the collection; (c) do BÍN forms that B3 writes into edited prose count as BÍN-derived? (d) the three June TMX files; (e) stripping the two committed files of BÍN forms going forward vs rewriting history | (a) **Ask the provider in writing;** release the human tier regardless. (b) **Follow Íðorðabankinn's terms.** (c) **Ask SÁM in writing;** meanwhile U5's editor-confirmed forms make each written form an editor's choice. (d) **Supersede them.** (e) **Forward-only** |
| SD11 | Audio storage | **Outside git:** a static directory on the web host, with a committed manifest (content hash → file). Offline downloads leave audio out unless [USER] wants it |

## 9. Risks, and the contract's doubt clause

The contract asks the grantee to tell the ministry promptly when it doubts it can meet its obligations. The mid-project
review in month 6 is the planned check.
1. **Editing throughput.** 134 units, plus ch01–ch02 (D13), plus the alts and table summaries (38.6% more English
   than the estimate assumed; D12), must fit into months 2–10. The per-unit estimate was not measured in Ritstjóri (10-10 0.2).
   **Response:** measure it in month 3. If it is short, apply the documented response (more unpaid editor hours, then
   priority by classroom use) and notify the ministry promptly.
2. **Measurement starts late,** leaving units untimed for good. **Response:** no unit opens before the editing gate.
3. **Bus factor of one** for deploy, sync and production writes. **Response:** the cadence and runbooks in §7 and G1.21.
4. **The reader's capacity is already booked** by its own roadmap
   (`../namsbokasafn-vefur/docs/plans/2026-10-15-reader-v1.1-v1.2-review-plan.md`, Capacity). This plan's reader
   items compete with it: the credit sentence, chapter release, redirects, the front-page claim and the audio player.
5. **Node 22 loses support in month 6,** on a shared host.
6. **The production box is small and shared.** B2's tagger and C's synthesis run elsewhere (SD9).
7. **A lapsed OAuth secret** locks everyone out (G1.16).
8. **The 21,251 metric under the human-only rule** (SD5).
9. **B2 and C contradict a recorded decision** until SD9 is written.

## 10. What this plan cannot see

- Production settings the repository does not hold: `MS_TENANT_ID`, `AUTO_CREATE_USERS`, `SMTP_*`. It also cannot see
  whether the February uptime monitor still runs.
- The editors' availability over the summer, and which chapters are in classroom use when.
- The licence of Nefnir's rules file; the tagger's speed and memory on chemistry text; how well the speech chain
  reads formulas.
- Live behaviour. The review read code and started no server.

## 11. Next action

The active register's ⏩ RESUME block owns it. This plan carries no open-work status.
