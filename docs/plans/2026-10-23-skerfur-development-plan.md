# Ritstjóri through the Skerfur year — DEVELOPMENT PLAN (proposed 2026-10-23; rev. 2, same day)

> ✏️ **PLAN, proposed 2026-10-23. None of its decisions (§8) is answered yet.** This is not status: open work and
> its state live in the active register's ⏩ RESUME block.
> **What it covers.** The development work in Ritstjóri (`server/` and the `tools/` it runs) and in the reader
> (`../namsbokasafn-vefur`) that the follow-on grant ("Skerfur") needs, from **S = 1 November 2026** to the final
> report, due **1 December 2027**. It expands one line of the chemistry finish-preparation plan
> ([`2026-10-10-chemistry-finish-preparation-plan.md`](2026-10-10-chemistry-finish-preparation-plan.md), "the
> 10-10 plan" below): *"From then: editing begins as units open; term propagation and lemma/POS alongside."* The
> 10-10 plan keeps its stages 0–5 and its decisions D0–D15. This plan cites them by number and does not restate them,
> except where SD1 proposes to change them.
> **Evidence:** a read-only review of the editorial system on 2026-10-23 at commit `3e70e4303`. Five investigators
> each covered one area (editor workflow; B1 measurement; B2/B3 terminology; outputs A, C and D; platform). An
> adversarial verifier then checked each area, re-running every "X does not exist" claim first. **Rev. 2** takes in a
> second round: five critics read rev. 1 through one lens each (facts; order; research integrity; contract and licences;
> completeness). The claims §12 lists were re-checked against the code before rev. 2 relied on them; the others are
> carried as the critics measured them.
> Code is cited as `path:line` at `3e70e4303`, or by function name. The raw review stays off the public tree because
> it quotes private grant documents.
> **Funding.** Which grant line pays for which item is in a private companion in the git-excluded `docs/grants/`.
> This repository is public: no names, no budget figures, no hours.
> **Words used.** A *unit* is one module file. Chemistry has 149; the contract's 134 are those outside ch01–ch02 (7 + 8).
> *Apply* means writing approved text into `03-faithful-translation/`. The buttons *Vista í skrár* and
> *Vista + Birta* do it, and so does `POST /reviews/:id/complete`. *The hold* is PR #556: a code-level refusal of the
> two writers of chemistry's faithful files, `applyApprovedEdits` and the faithful-track restore
> (`server/lib/applyHold.js`). Only a code change lifts it.

## 1. In brief

1. **One ordering rule outranks the rest: nothing an editor does before measurement is live can be measured later**
   (10-10 §1 point 6). Active time, the text an editor was shown and each edit's origin cannot be rebuilt afterwards.
   (Save timestamps can be recovered from `activity_log`; nothing else can.) So B1's capture is the first build after
   S, and editing waits for it.
2. **With the hold deployed, nothing an editor does writes chemistry's faithful files.** Other paths still write
   chemistry files that the two-hourly backup pushes to the public repository:
   - a head editor's pipeline panel and *Publish MT preview* inject and render `03-translated/` and `05-publication/`
     (`server/routes/pipeline.js:30`, `server/routes/publication.js:133-135`);
   - any editor with book access can change a figure's review state, which rewrites the committed figure-text sidecar
     (`server/routes/segment-editor.js:780-830`);
   - any editor can advance a chapter's stage by hand (`server/routes/pipeline-status.js:85`).

   A small held-book write guard closes those (G1.14). With it, the register's ③ list (§C203's fixes included) splits
   into **three gates instead of one** (§3):
   - **the editing gate**, before the first unit opens: measurement, consent, baseline integrity, the save-side
     defects, write and scope guards, editor privacy, and the BÍN credit;
   - **the apply gate**, before the hold is lifted: the base-text guard, per-segment "human" in the TM, concordance
     and corpus, the published sidecar's privacy, apply-path correctness, a completion rule, and SA-01;
   - **the release gate**, before the open releases (D): rights confirmed, BÍN contained, licence and credit fields.

   Editing can start at the first gate while the second is built. Approved edits wait in the database until the apply
   gate is met. **This changes the 10-10 plan's order, not only D8** (SD1).
3. **Most of what blocks editing is not funded B work.** It is apply-path safety, editor privacy and platform
   hardening for outside editors: preparation before S, in-kind development after it. The funded lines are the three
   language-technology capabilities (B1–B3) and the audio (C). Each is scoped below to the contract's minimum credible
   deliverable, inside the annex's month windows (§7).
4. **What the review and the critique found that changes the plan.**
   - **The first apply would publish each editor's username and two timestamps per segment** in the review-status
     sidecar the backup pushes (`acceptanceService.writeReviewStatusSidecar`: `by` and `at` at
     `server/services/acceptanceService.js:392-400`, and a module-level `generated` at `:408`). No sidecar has been
     committed yet. → G2.3
   - **Per-editor activity tables, timelines and a per-module event list reach any signed-in account,** auto-created
     viewers included (`server/routes/status.js:122`, `:354`, `:419`; `server/routes/activity.js:110`). That breaks
     B1's promise never to compare editors. → G1.15, SD7
   - **The editor still offers organic chemistry and the withheld books** (`server/config.js:102`; the module route
     checks role only, `server/routes/segment-editor.js:263-266`). The exposure was logged on 2026-09-23 (§C190 ③,
     ⑦) as a procedural item; this plan makes the guard code. → G1.13
   - **The reader marks a module reviewed, and drops its MT banner, as soon as a faithful file exists**
     (`../namsbokasafn-vefur/scripts/generate-toc.js:260`). Today one approved edit writes the whole module. → G2.5, SD8
   - **The BÍN credit is owed now, not in month 3.** The old `/terminology` screen already shows BÍN-derived forms
     to any signed-in account (`server/views/terminology.html:1829`), and no credit appears anywhere in the editor. → G1.16
   - **Concordance may already offer old text as "þegar samþykkt"** (already approved), with a one-click insert
     (`server/routes/segment-editor.js:1390-1396`). The index is filled at apply, with no review-status filter, and
     chemistry's June applies came after it existed. → G1.18
   - **B2's tagger and C's speech chain are Python, and B2a's design ports Nefnir into the server.** A recorded
     decision commits the project to hosted APIs "not a port" and not self-hosted Python
     (`docs/decisions/2026-08-06-mideind-toolchain-evaluation.md`). Both need a scoped exception first. → SD9
   - **Three rights questions decide what may be released, and none is on file:**
     - the MT provider's terms on its output, which covers the reviewed book too;
     - Íðorðabankinn's and the chemistry society's terms;
     - BÍN-derived data, including Nefnir's rules and the forms B3 would write.

     → SD10, before S
   - **"21,251 parallel units" has two readings** (SD5). Under the strict one, it includes ch01–ch02 (2,391), the
     appendices (2,736) and chapter 0 (107), each needing an edit or an explicit acceptance.
5. **[USER]'s time is the binding resource.** Every merge, deploy, production write and sync is [USER]'s, alongside
   full-time teaching. So the editing gate ships as about three pull requests and two production runs, not twenty-odd
   changes. While editors work, at most one deploy goes out a week (§7).

## 2. What exists today, per commitment

Measured or read on 2026-10-23. "Half-built" means some code exists, but not the part the commitment needs.

| Commitment | Works | Half-built | Absent |
|---|---|---|---|
| **A, editing** | open a unit; edit with a structural backstop; MT acceptance per segment; approve, reject or discuss per edit; apply; version history; sentence-level propagation (*Beita víðar*); chapter assignments; in-app notifications | the module review wrapper (`module_reviews`; no screen reads it); discussion threads (API, no UI); the save gate (blocks deleting `[[MATH]]`, `[[MEDIA]]`, `[[BR]]`, `[[SPACE]]` and the legacy xref/link/docref shapes; protects no lowercase `[[type:…]]` marker, §C53); assignment enforcement (chapter level, off and fail-open by default) | segment-level notes (10-10 2.2); re-attach by content (10-10 4.2); bulk approve; an editor's list of their own units |
| **A, publishing** | *Vista + Birta* for one module; the manual sync to the reader | chapter publish (all or nothing); the four ⑰ modules refuse from the editor, and the reason is hidden (§C153); the faithful track has no `glossary.json`/`index.json` (§C105) | a completion rule; per-chapter release (§C142); the follow-on's credit sentence |
| **B1** | pure MT in git; edit rows with before and after text; acceptances anchored to exact bytes; a snapshot before each apply | the baseline is client-supplied (`original_content`); `activity_log` holds event times without content | a served-version record; edit origin; revision history; active time; consent; character- and word-level distance |
| **B2** | an English-anchored term check with an Icelandic whole-word test (`terminologyService.findTermsInSegments`); BÍN paradigms for about 28% of term strings, none multi-word, and none for the house-style rulings (they were added after the only population run) | — | lemmatiser; tagger; lemma index; change classifier |
| **B3** | sentence-level propagation with preview, eligibility checks and pending edits (`propagationService`); the read side of `book_term_preference` | the terminology assistant: U2 of U1–U9 (`docs/plans/2026-09-06-editor-terminology-assistant.md`) | a term-decision writer (U4); acceptable forms (U5); replace-into-slot (U7); BÍN credit in the editor (U8) |
| **C** | inputs: LaTeX for every equation (`02-structure/*-equations.json`); prose formulas as `[[sub:]]`/`[[sup:]]` markers; source paragraph ids in rendered pages | a December 2025 reader prototype that reads Markdown (none exists now) and targets another TTS server (`../namsbokasafn-vefur/scripts/generate-audio.ts`) | everything else |
| **D** | the TMX tool (`tools/generate-tm.js`); the corpus export with per-row review status (`tools/export-corpus.js`); the resolved glossary export, pushed every two hours | the TMX pairs every faithful segment as human (§C202); the corpus lacks the selected and revised tiers | rights confirmed for the release; a chemistry-only harmonised term collection; a release step; a BÍN containment gate; licence and credit fields in the exports |

**Pre-existing at S, never claimed as follow-on work.** The S tag (10-10 §1 point 0) records them:
- U2 (2026-09-06);
- the apply hold (PR #556);
- sentence-level propagation;
- the BÍN paradigms;
- the review's read scripts;
- **the current grant's first lemmatisation trial.** Its only record is a private note, so a public record of its
  method, inputs and results (no BÍN data) is committed before the tag.

## 3. The three gates

Each item gives a size and a line. **Sizes** are build estimates in working sessions: S is one, M two to four, L five
to ten, XL more or unknown until a spike. [USER]'s review and deploy time is extra. **Lines:** B1, B2, B3, C, A and D
are the contract's work packages. *In-kind* is software development outside the funded scope. *Prep* is preparation:
the current grant before S; after S, in-kind where it fits a line and otherwise unfunded (10-10 §5).

### 3.1 The editing gate: before the first unit opens

**Exit test:**
- every item in the hard set below is on production;
- G1.6's calibration passes with values, not just rows present;
- D7 and D12 are decided;
- [USER] says go.

**Two finer gates sit beside it.**
- **Per editor:** an editor starts once three things hold:
  - their sign-in works (SD2);
  - their consent is recorded (G1.4);
  - their chapters are assigned (G1.13).
- **Per module:** a module opens once three things hold:
  - its old production rows are superseded;
  - its June human segments are re-attached by content (10-10 4.2). The re-attach must **fix §C107's
    *kalsíuminnihaldand***, never carry it forward;
  - for ch01–ch02 only, the segment-level notes exist (10-10 2.2).

**Hard set: measurement (B1, funded)**

| # | Item | Why | Size |
|---|---|---|---|
| G1.1 | **Served-version record.** One row per distinct version served, keyed on (book, module, segment id, occurrence, sha256 of the English, sha256 of the Icelandic), holding the layer, the freeze commit and the text. It is idempotent on that key, not on "first serve". The client sends the hash of the version it displays, and the server refuses a save whose hash is not current. Every edit and acceptance row stores the served-version id. Also: a committed per-unit manifest (layer, commit, per-segment hashes, the arm under D7 = b), with no editor key and no time. During the study only its hash is committed; it is published after editing ends | Today the server loads its own baseline for the marker check, discards it (`routes/segment-editor.js:394`), and stores the client's value, which defaults to `''` (`:423`). A bare segment id breaks on 285 duplicated ids, which resolve to the last occurrence (`segmentParser.js:135`), on any renumbering re-extraction, and on second-round edits once the hold lifts. The corpus export reads only disk | M–L |
| G1.2 | **Event log with origin.** An append-only log of save, withdraw, delete, approve, reject, apply and restore, with content where there is content, and an origin **per event**. The client reports each assist: repetition insert, term insert, markup wrap, propagation, re-attach, note-apply. Acceptance rows carry an origin too (single, or the keyboard stream). Every row is stamped with the deployed server commit and a feature-flag snapshot | A re-save overwrites `created_at` (`segmentEditorService.js:147`); an unchanged save deletes the row (`:111`); a propagated row differs from a typed one only by an editable note (`routes/segment-editor.js:1507`). The Pass 2 editor's `localization_edits` is the storage pattern, but not its history route, which shows other editors' revision times | M |
| G1.3 | **Active-time ticks** (§4.1 gives the content) on every page where editing, accepting, approving or a term decision happens. Each tick carries a mode derived from ownership, not from role: editing one's own unit, reviewing another's edit, term decision, propagation preview | Nothing measures time today. Under SD4 (b) every editor is a head editor, so role cannot separate editing from review | M |
| G1.4 | **Consent and retention.** The consent text covers ticks, first-save times and the event log. It states the real lifetime of backups and the secondary use in articles, and the grantee school's data protection officer reviews it before capture. An editor who declines is not used in research. Withdrawal stops capture and deletes raw rows. Raw rows are deleted on a stated date after the last planned publication. A de-identified derived dataset is kept | The promise is aggregate only and never comparing editors. With three editors, the design has to come before the data | S |
| G1.5 | **The measurement protocol, frozen** (the list is in §4.1). Committed before any data exists and cited by hash. Amendments are appended, dated and reasoned, never edited in place | A method chosen after seeing the data weakens every claim built on it | S |
| G1.6 | **Calibration, by value.** A scripted browser session with known truth: an active stretch, an idle stretch, a hidden tab, a second tab, a clock jump, a `pagehide` flush. Its computed active time must match within one tick. Hand-computed character and word distances for known edits, a duplicate-id unit and a re-served segment, using **the distance library, built here**. Then [USER] times one real unit with a stopwatch | A count can be right while the values are wrong (CLAUDE.md, the sentinel rule). Building the library last would hide a capture defect until no unit can be re-captured | M |

**Hard set: baseline, design and safety (prep and in-kind)**

| # | Item | Why | Size |
|---|---|---|---|
| G1.7 | **Freeze tag and manifest; MT re-lock** (10-10 5.1, 4.4). Run `scripts/backfill-mt-locks.js` on production | The lock hook fires only on a module's first-ever row (`segmentEditorService.js:214`), so never for the five modules with old rows; propagation never locks | S + a prod run |
| G1.8 | **10-10 4.1's three readers**, if editors start from layer 2: the editor's loader, the mt-preview publication map and the auto-advance. One neutral source label for every pre-human layer, so the screen does not show a unit's arm | The loader reads only the faithful file or pure MT (`segmentParser.js:115-120`), and the header prints the source (`segment-editor.js:1095-1100`). 4.1's reader census is larger than 10-10 §4's "about 30" | M–L |
| G1.9 | **If D7 = (b): the control draw.** After G1.13 assigns chapters, draw from a committed seed, stratified by editor and drift tercile. Commit only the hash of the seed and list until editing ends. Define the control condition. Exclude control units from any later AI layer under the slip rule. Say whether pilot units are eligible | A unit's arm cannot be assigned after it opens, and the editor is the largest nuisance factor among three | S |
| G1.10 | **Deploy the hold (PR #556), then run the 1.6 status script** (approve 10, supersede 28; [USER]'s answers of 2026-10-23) | The script is written test-first once the hold is on `main`, because its `--apply` refuses unless the hold is active | S |
| G1.11 | **§C53 save gate for the bracket dialect** | Chemistry's MT uses lowercase `[[xref:]]`, `[[link:]]`, `[[docref:]]`, `[[sub:]]`, `[[sup:]]`, `[[i:]]` and `[[term:]]` markers. None is protected (`server/public/js/segment-validation.js`) | S–M |
| G1.12 | **Duplicate segment ids.** Choose the mechanism in month 1, before the freeze. **(a) Extraction-side:** stop emitting a nested note's para twice and re-extract. This is an extraction cut, so the container rule applies: the cut and its owner move together, and a cut without an owner loses text (CLAUDE.md). **A census comes first, and zero residual is required:** every character the removed emission carries must be owned by another segment. Prove it with a controlled render pair, `01-source` rendered directly against an extract → inject round trip, compared by value. Then show byte identity for every other module and no auto-N shift. It lands before the freeze. **(b) Editor-side:** occurrence-aware DOM ids, save backstop and lookup | 285 ids are duplicated across 83 modules (measured 2026-10-23), and the 83 hold 71% of the text. The duplicates come from extraction: `m68710`'s `fs-idp153308448` occurs once in `01-source` and twice in `02-structure`. Without the fix, the pilot can only use introductions, ch18 and appendices | M |
| G1.13 | **Scope guards.** Close organic and the withheld books to editor writes (owner: §C190 ③ and ⑦). Turn on assignment enforcement for chemistry, run `backfill-appendix-sections.js` (dry-run first), assign the chapters and finish the A4 walk. Propagation checks the target chapters too | Editors have no book scope. Enforcement is off and fail-open (`userService.js:646`). Propagation checks only the source chapter (`routes/segment-editor.js:1475`) | S |
| G1.14 | **Held-book write guard.** In applyHold's style, with paired tests: refuse to non-admins, for chemistry, the pipeline inject/render/run routes and *Publish MT preview* while the whole-book re-render and the sync are held; refuse the figure-state route while figure review is closed (R-22); make the manual stage advance admin-only | §1 point 2 | S |
| G1.15 | **Editor privacy.** Restrict to admin, with no ranking by volume and never any time or distance: `/api/status/dashboard`, `/activity/timeline`, `/analytics` and `/api/activity/section/…`. Put `activity_log` under the retention rule. Check production's nginx access log for the module and telemetry routes. Give the B1 tables no read route | Section 1, point 4. The documented nginx site sets no `access_log` rule, so its defaults (IP and time per request) apply unless production overrides them | S |
| G1.16 | **BÍN credit, now.** Show the credit and modification statement wherever BÍN forms appear, or hide `inflections` on the old screen and in the old-model routes (list, `/:id`, lookups, `/export`). Probe whether the lookup-insert's `__…__` wrapper survives inject and render, and disable it until it does | `server/views/terminology.html:1829`; `server/services/terminologyService.js:2154`. The 2026-08-06 BÍN record requires the credit. The wrapper's survival is unverified (assistant plan) | S |
| G1.17 | **Terminology screen hygiene.** Hide the issue flags until the QA population is defined (§C157 book-wide, §C165; D15). Disable or relabel the old-model approve/dispute/propose buttons. They write `terminology_translations`, which neither the editor's term QA, the glossary export nor propagation reads (§C42) | About 2.81 issues per segment would meet editors on day one | S |
| G1.18 | **Existing concordance rows.** Count `tm_segments` by book on production, read-only (a committed script sent on stdin, as for §C203). If chemistry or other carried-over rows exist, [USER] purges them, or the repetitions hint is disabled until G2.2 | Editors would be offered old or unreviewed text as "already approved", and their inserts would enter B1 as assisted edits from day one | S + a prod run |
| G1.19 | **Drop credentialed CORS for reader origins** | The reader is same-site with Ritstjóri, and CORS allows credentials (`server/index.js:199-233`). Any script on a reader page can act as a signed-in editor. The reader's page-view beacon, which [USER] has ruled to remove, simply stops counting | S |
| G1.20 | **Backups sized for research data,** before editors sign the consent: `sqlite3 .backup` or `VACUUM INTO` instead of `cp` of a live WAL database (`scripts/backup-db.sh:45`); a long-lived tier and versioning for the editorial database. **B1's raw tables live in a separate database file**, outside that tier, so G1.4's deletion promise holds | Today both tiers keep the newest 30 copies, about 7.5 days | S |
| G1.21 | **The measured task, stable.** Update the row in place instead of reloading the module; save-and-next (Ctrl+Enter opens the next unhandled row) | Every save and accept reloads the module (4 requests; 6 for a head editor), and the median unit has 122 segments. A later change would be a confound | S–M |
| G1.22 | **Rewrite the editor guide** | It predates MT acceptance and Ctrl+Shift+Enter, calls saving automatic (it is a local draft), promises a reply thread that does not exist, and points at a page that now redirects | S |

**Conditional on SD4 (b), before approvals begin:**
- a per-book refusal of self-approval (head editors may approve their own edits today, `segmentEditorService.js:404`);
- approval rights without pipeline or publication rights;
- the fix for a book-scoped head editor's `/assignments` page, which returns 403 on first load (the frozen UX audit, PR #367, finding 4).

**After the first unit, as pre-registered dated interventions that reach every editor at once:**
- bulk approve per module from its diff list;
- editor and reviewer notes shown in the row;
- one module parse per save;
- an editor's home page listing their units;
- retire *Senda til yfirlestrar* or give it a list;
- SA-19 (open redirect) and SA-07 (session revocation; an `ADMIN_USERS` address is promoted before the `is_active`
  check);
- alerting: switch the February uptime monitor to a keyword check of `/api/health`'s body, because the endpoint
  answers 200 even when degraded;
- a deploy practice for working days (window, tree check, rollback);
- correcting chemistry's stale `status.json` (register ③) before the held sync, because the reader's titles come from
  it.

### 3.2 The apply gate: before the hold is lifted

**Exit test:**
- a test copy holding production's chemistry rows applies cleanly;
- every stale-base row is refused and listed;
- no unedited segment reaches the TM or concordance;
- the sidecar carries no identity and no time;
- SA-01 is closed.

| # | Item | Why | Size |
|---|---|---|---|
| G2.1 | **Base-text guard,** at apply and at approve. An edit applies only if its served version is the current one. Older rows compare `original_content` in the editor view. Refused rows are listed for the head editor. Second-round edits are checked against their own served version | `applyApprovedEdits` never compares them (§C203). Acceptances already have such a guard: `acceptanceService.lapseDrifted`, called from `applyApprovedEdits` | M |
| G2.2 | **Per-segment "human"** (10-10 4.0) in the TM, concordance and corpus. Until it lands, TM regeneration and concordance indexing stay suspended on apply, on restore and in `server/scripts/backfill-concordance.js` | The TM pairs every segment of a faithful file (`tools/lib/tm-export.cjs:258`); concordance indexes every segment (`concordanceService.indexModule`). §C202 does not name concordance | M |
| G2.3 | **Sidecar privacy.** Drop `by`, `at` and `generated`, or cut `generated` to the date; let a revoke refresh statuses without re-stamping | `tools/export-corpus.js` reads only `status`, so nothing breaks | S |
| G2.4 | **Apply-path correctness:** §C112, §C59, §C198 ① | A faithful file shadows the MT: a missing segment loads as `''` and is written back empty (`segmentParser.js:115-165`). One chapter's `chapter-metadata` apply marks other chapters' title edits as applied without writing them, and lapses their title acceptances. A restore is keyed on current ids | M |
| G2.5 | **Module completion rule** (SD8). A module counts as reviewed, publishes to the faithful track and loses its MT banner only when every segment is complete for its class under D12. The chapter's auto-advance uses the same rule | The auto-advance fires after one apply per module (`segmentEditorService.js:1148-1151`) | S–M, plus a reader check |
| G2.6 | **SA-01 at inject and at render** | An attribute typed after an allowlisted tag name survives inject's escape (`tools/cnxml-inject.js:1815-1849`) and reaches the preview and the reader's `{@html}`. Under the hold, typed text reaches no rendered page for chemistry, so the exposure starts at the lift (G1.13 closes the other books) | M |
| G2.7 | **Lift the hold:** a code change to `server/lib/applyHold.js` that names the guards making it safe | It was built so that lifting it is deliberate | S |

**Before the first reviewed publication** (later than the first apply):
- **§C105** after §C104: the faithful track's `glossary.json` and `index.json`.
- **⑰ and §C153.** The server's inject never passes `--no-annotate-en` (`pipelineService.js:197-206`), so the four
  ⑰ modules refuse from the editor, and the editor sees only an exit code.
- **The credit sentence; GoatCounter counting reader navigation; redirect rows for each batch; per-chapter release**
  (§5.1, §5.4).

### 3.3 The release gate: before the open releases

Listed with the releases in §5.2: G3.1–G3.8, with its exit test.

## 4. The funded capabilities

### 4.1 B1: measure post-editing (annex months 1–3)

**Contract.**
- Ritstjóri keeps both the unchanged MT and the approved final text of each unit.
- It measures the extent of change at character and word level, and the editors' active editing time.
- Results are published only in aggregate, and never used to compare editors.
- Metrics: edit distance for all 134 newly reviewed units; active post-editing time per 100 characters, measured
  systematically from implementation onwards.

**Deliverable.** G1.1–G1.6, the distance library included, live before the first unit opens. At the end, the
aggregate reports, which run under the analysis line.

**What a tick holds.**
- **Cadence:** one every five seconds while the editor tab is visible and focused, whether or not anything happened.
- **Content:** the seconds since the last trusted activity (keydown, click, scroll, input, and the click behind each of
  the three synthetic `input` dispatches at `segment-editor.js:881`, `:3264`, `:3325`), an activity count, the
  segment whose panel or cursor is active, the mode, and a sequence number.
- **Duration** comes from `performance.now()`, capped at the tick length.
- **Capture** continues up to a cap at least as high as the top of the sensitivity range; active time is computed only
  at analysis, so the threshold can be re-applied both ways.
- **Lookups:** a blur shorter than a pre-registered limit that returns to the same segment is counted as lookup time,
  reported as its own component.
- **Transport:** flushed on the existing five-second draft tick (`segment-editor.js:108`), and by
  `navigator.sendBeacon` on `pagehide`. It is idempotent on session and sequence, and the gaps measure loss. It never
  goes through the public `POST /api/analytics/event`.
- **The editor key** is a random value per editor, mapped in an admin-only table that no export reads.

**Two distance outputs.**
1. **The contract figure:** per-unit pure → final distance, at character and word level, over every segment of any
   origin, for each of the 134 units, with the final taken at an end-of-editing tag. It reports n complete of 134,
   plus the reviewed share of the rest.
2. **The research decomposition,** by origin, starting layer and segment type:
   - pure → served, served → final, pure → final;
   - hand effort is measured from the text after the last whole-text assist;
   - each unit as it stood at its first completion;
   - changes after completion (B3 propagation) are reported separately.

   One normalisation serves both sides: the editor view (`acceptanceService.editorViewOf`,
   `tools/lib/mt-normalize.cjs`) plus marker stripping, with each `[[MATH:n]]` as one token. The independent check is
   a second Levenshtein implementation over the same pairs. `diffsize.py` computes a similarity ratio and checks
   direction only.

**What the time figure means depends on D7.** If every unit starts from layer 2 (D7 = a), it measures post-editing of
machine-revised MT, and effort from a pure-MT start is not measured anywhere. Under (b), the control units give it.
The final report names the per-segment baseline and the D7 design as a refinement of the application's method.

**The protocol (G1.5) fixes, before any data:**
- **Units and segment classes;** 'complete' per class under D12.
- **The estimand and aggregation:** total active time over total characters, or a per-unit rate. The time metric is
  per 100 English source characters, with per source word and per 100 Icelandic characters as secondary measures.
- **Character counting:** markers, `[[MATH:n]]`, and which segments enter the denominator.
- **What "pure" means:** the API output as received. `HAND REPAIR`s and re-requests are documented steps, reported
  separately.
- **The idle threshold and its sensitivity range;** the lookup limit.
- **The normalisation and the distance definitions.**
- **B2's change categories and its validation design** (§4.2).
- **Data-quality exclusions:** a loss-rate limit, clock anomalies, overlapping tabs.
- **Exclusions:**
  - ch01–ch02 are captured, and reported as their own stratum;
  - assists are labelled by type;
  - [USER]'s own edits, if any, are a declared stratum or excluded.
- **The cell rule:**
  - only all-editor pools, or breakdowns along dimensions every editor contributes to;
  - each cell holds units from at least two editors;
  - never by chapter, chapter group or calendar period;
  - never complementary cells.
- **The pilot reads instrument health only** (loss, coverage, calibration), and its units stay in the population.
- **The intervention calendar** (B2a, U7, concordance on, the slip-rule AI layer, UI changes). Each change reaches all
  editors at once. Figures by period are descriptive only, and each unit's sequence number within its editor is a
  learning covariate.
- **No re-extraction of chemistry between the freeze and the end of editing,** except as a dated protocol event with
  an old → new id map applied to every B1 table.
- **B1 data is never used to verify, adjust or audit anyone's hours, pay or workload.** Throughput checks use pooled
  figures or unit counts.

**Done when:** G1.6 passes on production's code. At the end, both outputs reproduce from the frozen protocol.

### 4.2 B2: term detection with lemmas and POS tags (annex months 1–4)

**Contract.** Connect rule-based lemmatisation (Nefnir, built on BÍN) and POS tagging (ABLTagger) to Ritstjóri, and
use them to find terms in running text, neologisms and compounds missing from BÍN included. Metric: at least four
formal, lemma-based categories of change, classified automatically.

**What exists.** `terminologyService.findTermsInSegments` starts from an English hit, then tests whether the expected
Icelandic, or one of its stored BÍN forms, appears as a whole word.
- **The English anchor is surface-exact.** *"Atoms are small."* gets no hit, so that segment's Icelandic is never
  checked.
- **The house-style rulings have no stored paradigms.**
- **Two heuristic tools to beat:**
  - `tools/chapter-term-check.js`: plural-tolerant English, Icelandic stems that reach into solid compounds, and the
    rival words the MT used;
  - `experiments/terminology-consistency/measure.py`, with its self-test cases (`--selftest`).

**Design** (needs SD9):
- **First, a spike.**
  - Compare tag-free Nefnir with tagged Nefnir on the self-test cases and the ruled targets, with a gibberish control.
  - Lemma quality depends on the tags, and the only trial used hand-supplied ones. Tag-free mode has never been
    measured.
- **The lemma index is built offline: tag, then lemmatise.**
  - The batch runs on the project's own equipment, over the book's current text, and writes into `sessions.db`.
  - Rows are keyed on the sha256 of the segment text, carry POS tags (which U7 needs), and are never exported.
  - In the server, a port of Nefnir's rules runs tag-free only as the fallback, wherever the index is stale.
  - Nefnir's rules are derived from BÍN, so the rules file stays out of git: it is fetched at install into a
    gitignored path, as `tools/data/` is.
- **Term lookup.**
  - Single words match by lemma, compounds by their head, and multi-word terms as a lemma sequence.
  - English plurals are normalised on the English side.
  - Before B2's baseline is measured, the paradigm population is re-run for the house-style rows.
- **B2b, the classifier.**
  - **Unit:** per aligned change span, multi-label per edit, with a stated precedence for the edit-level summary.
  - **Input:** the text after the last assist, to the final.
  - **Categories** (pre-registered): inflection only (same lemma); term substitution (a ruled pair, against a named
    ruling-set snapshot); other lexical substitution; insertion or deletion; reordering; orthography or markup only.
  - **Validation:** a sample drawn at random from early edits, stratified by a pre-registered heuristic, held out
    before development, and labelled by two people blind to the classifier, with Cohen's κ reported. Per-category
    precision and recall thresholds, met by at least four categories.
  - **Timing:** built and validated in months 3–4, inside the annex window; run over complete units in months 11–12,
    under the analysis line.

**Done when:**
- (a) the term check finds ruled terms in inflected and compound forms that today's regex misses, with re-populated
  paradigms as the baseline and a negative control;
- (b) at least four categories meet their thresholds on the held-out sample.

### 4.3 B3: term decisions propagated in inflected forms (annex months 5–9)

**Contract.** New or changed term decisions propagate across the whole book automatically, in correct inflected forms.
The application also says that new term decisions made by teachers during reading flow automatically into an open
database. And it says that the chemistry society's terminology committee reviews and confirms new term decisions.

**What "automatically" means is SD12's question.** [USER]'s internal threshold (§C78) is a single flip that propagates
at least semi-automatically. The proposed reading of the contract:
- finding every occurrence and writing the correct form into it is automatic;
- approving each occurrence is the project's human-review gate, not a manual step;
- the final report states the share written automatically against the share flagged for a hand fix.

**Not the 10-10 AI pass.** That pass (layer 2) is a one-off preparation step and a separate research condition. B3 is
the Ritstjóri feature for decisions made **during** editing.

**Build order** (the assistant plan's recorded dependencies), months 5–9:
1. **U1:** capture the Icelandic form actually matched.
2. **U3:** a term-keyed occurrence finder. Only the key in `propagationService` changes.
3. **U4:** a term-decision writer, with an audit trail and a state per decision: proposed → ruled → committee-confirmed,
   with the confirmation's date. Blocked on D15.
4. **U5:** acceptable forms per term and slot, confirmed by an editor. Confirming them is A's terminology work, not
   B3's.
5. **U7:** replace-into-slot.
   - It writes one pending edit per occurrence, with origin `propagated`.
   - It uses the POS tags in B2's lemma index to resolve syncretic slots.
   - Where no confirmed form fits, it flags a hand fix and never guesses.
   - It records whether each form it writes came from an editor or from BÍN, and writes no BÍN-sourced form into text
     the backup pushes until SÁM answers (SD10).

U8's credit for **new** panels lands with U1; the old screen is covered by G1.16. U9 (BÍN tags as an auto-seeder for
U5) comes only after U5. U6 (accepting a deviation in one segment) is independent.

**Rules**
- **One read API over the four places decisions live:**
  - `server/lib/houseStyleTerms.js` (code, asserted on boot by migration 051);
  - `book_term_preference` (production);
  - the compiled ruling set (`experiments/terminology-consistency/results/2026-10-11/ruling-set-after-stage1.json`);
  - the committed concept-model scripts that production runs.
- **`book_term_preference.term_id` is `ON DELETE CASCADE`,** so a script that deletes a term silently drops the
  decisions pointing at it (`server/migrations/048-book-term-preference.js:113`). The delete scripts must refuse such a
  term, or report it, and U4's audit trail must survive the delete.
- **The 333 tied English strings** are left out of the export, so B3 has no single answer for them. Each is ruled or
  listed as open.
- **Propagate only from recorded decisions,** never from raw approved rows (§C117, §C128, §C157, §C193).
- **Preview across the whole book; apply chapter by chapter.** Every propagated edit goes through the apply gate.
- **The open database.** Once U4 writes, a decision reaches the public resolved export (`glossary-unified.json`) on the
  next two-hourly run. The Árnastofnun added-terms export reads the old model and is retargeted to the read API.
- **The committee confirms decisions in batches,** before each per-chapter release and before G3.3. Rulings are
  prepared under A's terminology line, never under the society's in-kind line.
- **The old model's writers and readers are retired or redirected before its tables are dropped:** the `/terminology`
  buttons, term mining, the JSON export and the added-terms export (§C42).

**Done when:** on a test copy, a ruled flip of a real term writes correct forms automatically into the occurrences it
can resolve, and flags the rest. It reports both shares per flip. Then an editor approves one chapter's set.

### 4.4 C: audio (annex months 7–12)

**Contract.**
- Put the national speech chain to work on science text: Regína normalisation, IceG2P transcription and a Talrómur
  voice.
- Add a pronunciation layer for chemistry symbols and formulas, linked to Ritstjóri's term base.
- Pre-generate audio for reviewed chapters and deliver it as stable files.
- Everything is self-hosted, which the application defines as run on the project's own equipment, with no third-party
  service and no per-use cost.

**Exists:** the inputs in §2. Nothing else: no efni code, no reader player (the React player was deleted in the
SvelteKit migration), and no pronunciation field in the term base (`concept_term` has none).

**Plan**
- **C.1, in month 1:** SD9's decision record names the host, a machine the project already owns and runs (the
  development box). Rented compute, if ever needed, is recorded as unfunded before use. SD10 asks the IceG2P
  maintainers, in writing, about its pronunciation dictionary and compound maps; the code's Apache-2.0 does not
  cover them.
- **C.2, a spike at the start of month 7:**
  - install the chain;
  - synthesise one reviewed section and listen with [USER];
  - time one chapter.
- **C.3, a text extractor over the reviewed layer:** reading order, headings, notes, alts, tables and inline English
  glosses.
- **C.4, the pronunciation layer:** symbols, formulas and units, read from the LaTeX and the markers, in a new table
  linked to the concepts. If IceG2P's compound maps stay unlicensed, it runs without them, and this layer covers
  chemistry compounds.
- **C.5, generation per reviewed chapter,** keyed on a content hash, so an edit marks the chapter's audio stale.
  Storage follows SD11, with a manifest.
- **C.6, the reader side:**
  - a player and manifest fields;
  - an offline policy. The offline manifest lists the pages, `glossary.json`/`index.json` and the local images they
    reference. It reports every `<source>` as unparsed, so audio needs its own entries;
  - reconciling the reader's own device-voice proposal, so readers are not offered two read-aloud features.

**Done when:** every reviewed chapter has stable audio files, regenerated when its text changes, served by the reader,
and credited (both grants, the voice, and the lexicons).

## 5. Publishing, releases, credits, statistics and reports

### 5.1 Publishing reviewed chapters (A, annex months 2–10)

**Path today:** approve → apply → inject → render → the two-hourly push → [USER]'s manual sync → the reader's deploy.

**Needed on top of the apply gate**
- **A chapter hold-back at sync time (§C142), if [USER] chooses the staged release.** The reader's record offers it:
  release all chapters except those in classroom use, which follow in mid-December. Record the choice before S. If it
  is staged, build the hold-back in month 1, with the reader's capacity booked; reviewed-chapter releases then reuse it.
- **The front-page claim, fixed before the next chemistry sync.** *"Vélþýtt og yfirlesið af starfandi
  raungreinakennurum."* (`../namsbokasafn-vefur/src/routes/+page.svelte:181`) breaks the reader's own rule
  (`src/lib/data/bookCredits.ts:19`). That sync takes readers from four "reviewed" June pages, ruled retired, to none.
- **Figure approvals.** A reviewed page also carries them (`data-figure-review`). Figure review stays closed until
  [USER] reopens it, and G1.14 makes that closure code.

**A is done when:**
- every one of the 149 modules (ch00, ch01–ch02 and the appendices included) is complete under SD8;
- every module is live on the reader's faithful track;
- the last sync is inside month 12.

**Editing ends with month 10** (the annex). A shortfall projected at the month-6 review gets the documented response:
- more unpaid editor hours, then priority by classroom use;
- a notice to the ministry under the contract's doubt clause;
- never silent editing in months 11–12.

### 5.2 The open releases (D): the release gate

**Exit test:**
- the TMX, corpus and term collection are posted and deposited under CC BY 4.0, with both grants credited;
- every release rests on rights recorded under `docs/decisions/` (SD10);
- the human-verified unit count is reported against 21,251 under the reading SD5 chose.

| # | Item | Owner · line · size | Why |
|---|---|---|---|
| G3.1 | **TMX**, human-only (G2.2), with licence, attribution, modification statement and both credits in the header | this plan · in-kind · S | The three committed June-vintage files are mostly unedited MT counted as human: measured 2026-10-23, 296 of 360 and 287 of 349 of their units equal the MT of their time. `tmCreated` counts any book-level TMX file once a chapter's review stage is complete (`server/routes/status.js:1404-1413`) |
| G3.2 | **Corpus:** selected and revised tiers; `postEdited` against the served version, read from G1.1's committed manifest; a release step. No release carries an editor key, a username, a per-segment time or a timestamp finer than the release date | this plan · in-kind · M | `postEdited` compares with pure MT today (`tools/export-corpus.js:89`) |
| G3.3 | **A chemistry-only term collection with definitions,** built from the read API (§4.3), with a source field on every term and definition, so that a row the rights allow is included with attribution and the rest are excluded | this plan · in-kind · M | `glossary-unified.json` is cross-domain (444 of its 1,748 terms are chemistry) and calls every term approved. The old `GET /api/terminology/export` carries BÍN forms and personal names. The reader `glossary.json` (June vintage) seeds the definitions once regenerated (register ②) |
| G3.4 | **BÍN containment:** a test pinning `glossary-unified.json`'s term keys; a release-time scan of every artefact; a CC BY-SA entry and a caller for `tools/lib/licence-containment.cjs`; strip the forms from `test-results/c73-retire44-manifest-2026-08-12.json` and `test-results/b4b1-bin-population-2026-08.md`, going forward (the register's "C41 manifest") | this plan · in-kind · S | No test or gate stops a one-line export change from adding BÍN forms |
| G3.5 | **Stale public lists.** Seven CSVs in `exports/` (four chemistry, three biology) carry no README or licence; two hold Íðorðabankinn rows. Label them now; supersede them at release | this plan · in-kind · S | They are already public |
| G3.6 | **The metrics:** 21,251 (SD5) and the growth in approved terms (SD3: ruled and committee-confirmed counts, from the S tag to the end) | [USER] · — · S | Each needs a definition fixed before data |
| G3.7 | **Deposit:** confirm the route against the contract's annex | [USER] · in-kind · S | No tracked document names it |
| G3.8 | **The stale claims, before the S tag.** Correct `books/efnafraedi-2e/metadata.json` (`humanVerifiedTM: true`, `catTool: Matecat`). Add a note to `books/efnafraedi-2e/tm/` that the June files are carried-over MT | this plan · prep · S | The S tag would freeze them as "what existed" |

### 5.3 Credits

**Both grants are credited everywhere the project publishes:**
- **Reader:** the per-page attribution footer, which renders on every section and chapter page
  (`../namsbokasafn-vefur/src/lib/components/BookAttribution.svelte`); `/leyfi`; the print colophon, so PDFs carry it.
- **Releases:** the TMX header, the corpus manifest, the term collection and the audio metadata.
- **Elsewhere:** reports, articles and talks.

The wording is the contract's, which [USER] supplies, and it is in place before the first reviewed publication. Today
only the reader's front page carries a credit, for the current grant alone (`src/lib/data/about.ts:42`).

### 5.4 Reader statistics

GoatCounter is installed (`../namsbokasafn-vefur/src/app.html`), but no code counts client-side navigation, so a
section view inside the reader registers only on a full page load.
- **Item, owner the reader, in-kind:** call `goatcounter.count()` on each client-side navigation (`afterNavigate`).
- **Done when** a scripted visit to N sections within one page load registers N views.
- **Timing:** before the first reviewed publication. It states which per-book and per-chapter numbers the final
  report takes.

### 5.5 The methodology report, and posting the outputs

- **The methodology report** covers time use (B1's aggregates) and cost per step:
  - MT per pass, from the invoices (§C91 ①);
  - the AI pass, per call;
  - editing hours from the timesheets, paid and in-kind, aggregated and never per editor.

  It reproduces from the frozen protocol and is posted openly under CC BY 4.0, crediting both grants, by the end of
  month 12. Owner: [USER].
- **Posting.** The grantee school posts the project's outputs on its website as each is published: a link to the
  reviewed book, the methodology and final reports, the editor guide (G1.22) and the D releases. Owner: [USER], with
  the school's web administrator.

## 6. The platform through the year

- **Node 22 → 26 before 2027-04-30,** when Node 22 loses security support (CLAUDE.md § Tech Stack).
  - It is an npm 10 → 11 lockfile migration plus a native rebuild, on a host shared with the reader and another site.
  - `deploy.sh` refuses to deploy while `.nvmrc` and `/usr/bin/node` disagree.
  - Window: the Christmas break; Easter as the fallback.
- **Dependencies.** Weekly Dependabot; the bare `>=` overrides in both `package.json` files; Actions pinned to commit
  SHAs (§C200's open items).
- **Tests.** The full suite takes about 20–25 minutes on the dev box, and each new migration lengthens the fresh-database
  tests. Budget review time for that.
- **The Greynir sidecar** was ruled for deletion on 2026-08-06 and is still in the tree. Delete it under SD9, which
  also settles the §C25/§C44 coupling.
- **Grammar and spelling help for editors.** The Málstaður grammar route was adopted on 2026-08-06 with its cost basis
  open (§C25). It is later work, done if editors ask for it.

## 7. [USER]'s part, and the calendar

**The cadence.**
- [USER] carries every merge, deploy (it needs `sudo`), production write and sync: a bus factor of one.
- The editing gate ships as three pull requests and two production runs:
  - **"B1 capture":** G1.1–G1.6;
  - **"guards":** G1.13–G1.16 and G1.19;
  - **"editor fixes":** G1.11, G1.12 if fixed editor-side, G1.17, G1.21 and G1.22;
  - **the production runs:** the 1.6 script and the re-lock, then the concordance read and the appendix backfill.
- While editors are working, at most one deploy a week, in an announced window.

**The annex's month windows** are B1 1–3, B2 1–4, A 2–10, B3 5–9, C 7–12 and the report 11–12. The calendar keeps
building inside them. Two things run later than their window, both as analysis:
- B1's aggregate reports;
- B2b's classifier run over complete units.

Reconcile the calendar with the annex once its signed version is on file.

| When | Editing | Build | [USER] |
|---|---|---|---|
| **Before S** (to 31 Oct) | none | the 1.6 script; the S-tag contents (G3.8, the lemmatisation trial's public record); this plan. If [USER]'s time allows, the non-B guard items as preparation: G1.11, G1.13–G1.16, G1.19 and G2.3 | merge and deploy PR #556; run 1.6; SD1–SD3; send SD10's letters; confirm the sign-in facts (SD2); record the staged-release choice (§5.1); D11 (register) |
| **Month 1** (Nov) | none | the 10-10 build in the same weeks (rule layer, AI harness and gate, re-request mode, full AI run, preview re-render and QC, deploy, freeze around 29 Nov–6 Dec); the editing gate's hard set in the batches above; the G1.12 choice before the freeze; SD9's decision record; the chapter hold-back if staged | D7, D12 and D13 in the first week; stage 1's remainder and the reading test; the AI pilot checks; SD4–SD7; editors' consent; the production runs; go/no-go at the gate |
| **Month 2** (Dec) | pilot units (instrument health only), then editing as each editor clears the per-editor gate | the apply gate (§3.2); the SD4 (b) conditions before approvals begin; Node 22 → 26 over the break | the mid-December reader release (register and reader); SD8 |
| **Month 3** (Jan) | full pace | the lift once the apply gate is met; B2: spike, then the offline index and the term check; the dated interventions | the lift deploy |
| **Months 4–6** (Feb–Apr) | full pace; first reviewed publications | B2b built and validated by month 4; B3 starts in month 5 (U1, U3, then U4 after D15); the credit sentence; GoatCounter navigation; Node's end of support on 30 Apr | the month-6 review: instrument health, pooled throughput, the doubt clause (§9) |
| **Months 7–9** (May–Jul) | full pace | B3 U5 and U7; C from month 7 (spike, extractor, pronunciation layer, generation); the reader's player; release machinery (§5.2) | SD11; the committee's batches |
| **Month 10** (Aug) | editing ends | C generation per reviewed chapter | — |
| **Months 11–12** (Sep–Oct) | none | B1 aggregate reports; B2b's run; releases assembled, deposited and posted; audio for every reviewed chapter; the last sync | the reports; posting |
| **By 1 Dec 2027** | | | the final report |

**The month-1 load is the plan's tightest point.** The editing gate and the 10-10 build share the same weeks and the
same reviewer. If the gate slips past the Christmas break, the pilot moves to January, and the month comes out of the
editing window (§9, risk 1).

## 8. Decisions for [USER]

None is answered. Each carries a recommendation, and everything not listed takes the default stated in its section.
The 10-10 plan's open decisions D7 (control arm), D12 (review depth for alts and table summaries) and D13 (ch01–ch02)
gate the editing gate too, in month 1's first week. **D7 also decides what the contract's time figure measures**
(§4.1). Per-chapter release (§C142) is the register's (§5.1).

**Now, before S**

| # | Decision | Recommendation |
|---|---|---|
| SD1 | Adopt the three gates (§1 point 2, §3). That amends four things: 10-10 4.4 (the register's ③ list before editors open anything); D8; 4.0's "before 4.1" (it moves to "before the hold is lifted", which is safe only while the hold stands); and the private companion's "③ before A starts". It also splits 4.2 into supersede and re-attach, both before the affected modules open. 4.0's start moves from before S to after S | **Yes.** With the hold and G1.14, editing need not wait for the apply-side fixes |
| SD2 | How editors from the other two schools sign in. The contract's metric counts three editors from three schools at the start. **First, read-only:** the app registration's supported account types (the migration checklist says single-tenant; unverified) and production's `MS_TENANT_ID` and `AUTO_CREATE_USERS`. **✏️ Measured 2026-10-24 (register, that day's entry): one tenant, but shared by several schools. A partner from one of the other schools has already signed in, with no invitation.** Then (a) guest accounts in the registering school's tenant, or (b) a multi-tenant registration, which first needs id_token validation (tid, aud, iss), users keyed on the immutable object id, an explicit tenant allowlist and `AUTO_CREATE_USERS=false` | ✏️ **2026-10-24: a school in the shared tenant needs neither (a) nor (b).** (a) remains the route for a school outside it. ~~Ask that school's IT now. Walk one guest sign-in end to end. Set `AUTO_CREATE_USERS=false` once the editors' rows exist~~: auto-create is how recruits get in, so [CODE] now recommends keeping it on (register, 2026-10-24; [USER]'s call). Record the client secret's expiry either way |
| SD3 | What counts as an "approved term" for the growth metric, and its baseline | **Report two counts:** chemistry headwords with a recorded ruling, and those the committee has confirmed. Snapshot both at the S tag, from every place a ruling lives: production's term tables (a read-only read), `server/lib/houseStyleTerms.js` at the tagged commit, and the compiled stage 1 ruling set, which also holds the record-only headwords. **A ruling dated before S counts in the baseline whether or not it has been applied yet.** *(Amended 2026-10-24 from the plan critique: the 11 October rulings reach production only after S, so a production-only read would count them as Skerfur growth.)* The export cannot serve, because it calls every term approved (`server/lib/resolvedGlossary.js:122`) |

**Before the editing gate (month 1)**

| # | Decision | Recommendation |
|---|---|---|
| SD4 | Who approves edits: (a) [USER] alone; (b) the three editors review each other's work, as chemistry head editors with self-approval refused, while [USER] spot-checks; (c) self-approval | **(b)**, with the three conditions in §3.1 built first. Under (a), [USER] is a click on every edited segment of 134 units. Review-mode time is reported separately (G1.3) |
| SD5 | The acceptance rule, and what 21,251 counts | **Keep per-segment acceptance:** the 2026-07-19 lead decision (`docs/superpowers/specs/2026-07-19-mt-acceptance-design.md`) refused accept-all, because an acceptance means "a human read this segment". G1.21 makes each acceptance cheap. **21,251 has two readings:** (i) the size of the released EN–IS parallel corpus (the metric was derived from the corpus export's rows), with the human-verified count reported beside it; (ii) 21,251 human-verified units, reachable only if every chapter is reviewed, ch01–ch02 included (D13). **Report both,** and treat (ii) as the target that a shortfall must explain |
| SD6 | Protocol parameters (G1.5): the estimand; the idle threshold and range; the lookup limit; the cell rule; whether [USER] is a participant; the consent text and its review by the school's data protection officer; the deletion date | Reading time counts. Review-mode and lookup time are reported separately. ch01–ch02 form their own stratum. Assists are their own category. Cells span at least two editors and are never by chapter or period. The threshold is fixed before any data. Raw rows are deleted on a stated date after the last planned publication, and a de-identified derived dataset is kept |
| SD7 | The per-editor tables, timelines and event lists | **Admin only, with no ranking by volume and never any time or distance.** Viewers see none. B1 data is never used to verify anyone's hours, pay or workload |

**Before the apply gate (month 2)**

| # | Decision | Recommendation |
|---|---|---|
| SD8 | The module completion rule (G2.5) | **Reviewed only when every segment is complete for its class under D12.** Until then the module stays on the MT-preview track |

**Before B2 and C are built (month 1)**

| # | Decision | Recommendation |
|---|---|---|
| SD9 | Scope the 2026-08-06 decision ("a hosted API, not a port"; no self-hosted Python) for B2 and C | **Write a decision record with `/decision-record`:** nothing new runs on the production box; B2's lemma index and C's chain run as an offline batch on the project's own equipment (the development box); a port of Nefnir's rules runs in the server only as a fallback, with its rules file outside git. Carry the correction that the 2026-08-12 record's "roughly 3%" belongs to the forms-indexing alternative, not the compounder (`test-results/b4b-matcher-cutover-2026-08.md`, B11.3 and B11.5). Mark the assistant plan's "do not re-litigate" line as superseded, and delete the Greynir sidecar |
| SD10 | **Ask the rights holders in writing, now:** (a) the MT provider: may its output, and texts post-edited from it, be redistributed under CC BY 4.0? (b) record the AI-pass provider's published terms on outputs; (c) SÁM: Íðorðabankinn's terms for terms and definitions, Nefnir's rules, and BÍN forms written into prose and released in the TMX or corpus; (d) the chemistry society: its glossary's terms and definitions; (e) the IceG2P maintainers: the dictionary and the compound maps | **Yes, before S.** Record each answer under `docs/decisions/`. Nothing is held meanwhile, except that no BÍN-sourced form enters text the backup pushes, and nothing is released, until the relevant answer is in |

**Before B3 (month 5) and C (month 7)**

| # | Decision | Recommendation |
|---|---|---|
| SD11 | Audio storage | **Outside git:** a static directory on the web host, with a committed manifest (content hash → file). Offline downloads leave audio out unless [USER] wants it |
| SD12 | Does per-occurrence propagation (automatic finding and writing, pending edits approved per occurrence, hand-fix flags) meet the application's "automatically, in correct inflected forms"? | **Yes,** reported as the share written automatically against the share flagged, per flip, in the final report |

## 9. Risks, and the contract's doubt clause

The contract asks the grantee to tell the ministry promptly when it doubts it can meet its obligations. The month-6
review is the planned check.
1. **Editing throughput.** 134 units, plus ch01–ch02 (D13), plus the alts and table summaries (38.6% more English
   than the estimate assumed; D12), must fit into months 2–10. The per-unit estimate was not measured in Ritstjóri
   (10-10 0.2).
   - **A late gate shortens the window.** If the gate slips into January, the window is a month shorter.
   - **The pilot cannot calibrate the rest.** Until G1.12 lands, the eligible modules are introductions, ch18 and
     appendix tables, which hold little of the text.

   **Response:** measure pooled throughput from month 3, by segment type and never extrapolated from the pilot's
   modules. Then apply the documented response (more unpaid editor hours, then priority by classroom use), and notify
   the ministry promptly.
2. **The month-1 load** (§7): the editing gate and the 10-10 build share one reviewer. **Response:** the three-PR
   batching, and moving every non-B guard item before S where [USER]'s time allows.
3. **Measurement starts late,** leaving units untimed for good. **Response:** no unit opens before the editing gate.
4. **Bus factor of one** for deploy, sync and production writes.
5. **The reader's capacity is already booked** by its own roadmap
   (`../namsbokasafn-vefur/docs/plans/2026-10-15-reader-v1.1-v1.2-review-plan.md`, Capacity). This plan's reader items
   compete with it: the hold-back, the front-page fix, the credit sentence, GoatCounter, redirects and the audio player.
6. **Rights answered late or refused** (SD10) would change what can be released, and possibly the licence of the
   reviewed book itself.
7. **Node 22 loses support in month 6,** on a shared host.
8. **The production box is small and shared.** B2's batch and C's synthesis run elsewhere (SD9).
9. **A lapsed OAuth secret** locks everyone out (SD2).
10. **B2 and C contradict a recorded decision** until SD9 is written.

## 10. What this plan cannot see

- Production settings and state the repository does not hold:
  - `MS_TENANT_ID`, `AUTO_CREATE_USERS` and `SMTP_*`;
  - the nginx logging;
  - what `tm_segments` holds;
  - whether the February uptime monitor still runs.
- The editors' availability over the summer, and which chapters are in classroom use when.
- Whether [USER] will edit units, and so be a participant.
- How well tag-free Nefnir works on chemistry text; the tagger's speed and memory; how well the speech chain reads
  formulas.
- The rights holders' answers (SD10).
- Live behaviour. The review read code and started no server.

## 11. Next action

The active register's ⏩ RESUME block owns it. This plan carries no open-work status.

## 12. What changed: rev. 1 → rev. 2 (2026-10-23)

Five critics read rev. 1 through one lens each and returned 74 findings, one marked as blocking.

**Re-checked against the code before rev. 2 relied on them:**
- the hold's two refusal sites;
- the pipeline, publication, figure-state and stage-advance routes;
- the activity route's guard;
- the 2026-07-19 accept-all decision;
- the sidecar's `generated` stamp;
- the concordance hint;
- the duplicate-id source (`m68710`);
- the annex windows;
- the application's obligations;
- `metadata.json`'s stale claims.

**Carried as the critics measured them:**
- the 71% text share of the duplicate-id modules;
- the nginx default logging;
- the activity route returning whole `activity_log` rows;
- the Pass 2 history route.

What changed:
- **The hold's claim is narrowed** to faithful files, and a held-book write guard (G1.14) covers the other writers.
- **SD1 names everything it amends:** 10-10 4.4, D8, 4.0's order, 4.2's split and the companion's rule.
- **The editing gate has a hard set and an exit test by value,** plus per-editor and per-module gates. The rest lands
  after the first unit as dated interventions.
- **Measurement, re-keyed (the blocking finding).** G1.1 is keyed on the served version and the occurrence, so
  duplicates, renumbering and second-round edits no longer break it.
  - G1.2 records origin per event.
  - G1.3 defines a tick and a mode.
  - The distance library moves into the gate.
  - G1.6 calibrates values.
  - The protocol list in §4.1 is complete.
  - The two distance outputs are separated.
- **Privacy:**
  - the activity route, `activity_log`'s retention and the nginx logs are added;
  - the sidecar's `generated` stamp is dropped;
  - B1's raw tables get their own database file, so the backups' long-lived tier cannot break the deletion promise;
  - the cell rule and the "never used to compare" rule now cover internal reviews too.
- **The BÍN credit and existing concordance rows move into the editing gate.**
- **SD5 withdraws "accept the rest of this section":** it contradicted the 2026-07-19 lead decision. It now sets out
  both readings of 21,251.
- **Rights become SD10, before S,** covering the MT provider, SÁM, the chemistry society and IceG2P. The human tier is
  not exempt from the MT provider's terms.
- **B2:** SD9 covers the port. A spike tests tag-free Nefnir. The index is built offline with tags. The rules file stays
  out of git, and the house-style paradigms are re-populated. The classifier gets a validation design.
- **B3:**
  - an SD12 on "automatically";
  - the committee's confirmation, from the application;
  - four decision owners and the `ON DELETE CASCADE` guard;
  - the 333 ties;
  - the open-database path;
  - B3 moved to its annex window (months 5–9).
- **C** moves to its annex window (months 7–12) and its host is the project's own equipment.
- **New:** A's and D's done-when tests, the release gate's exit test, a GoatCounter item, the methodology report's
  content, posting on the school's website, and the stale claims corrected before the S tag.
- **Wording corrected:** "nothing reads" the old term tables; single-tenancy stated as fact; "nothing polls"; the
  save gate's coverage; the offline manifest; the CSV count; first-edit time; and the "nobody had logged" framing.
