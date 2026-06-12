# Editorial Throughput & Quality Roadmap — June 2026

**Date:** 2026-06-12
**Status:** Proposed (drafted 2026-06-12 from a head-translator's analysis of the server code) — pending lead sign-off. Becomes the active development plan after the June-10 remediation roadmap's outstanding manual QA is walked.
**Predecessor:** [`docs/plans/2026-06-10-remediation-roadmap.md`](./2026-06-10-remediation-roadmap.md) (Units 0–5 all code-complete and merged, #102–#108; manual QA §0–§5 outstanding)

> **How to use this across sessions:** same conventions as the remediation roadmap — each unit is sized to roughly one working session, branch names are fixed, tick checkboxes as items land, and append to the Progress Log at the bottom.

---

## Why this roadmap: the production numbers

The June remediation made the platform safe, governed, and reversible. The production state as of 2026-06-12 says the bottleneck is now **editorial throughput**, not platform integrity:

- **250 MT-preview HTML pages** published for efnafraedi-2e — the machine side works at scale.
- **One faithful module** exists across the whole project: `m68699` (efnafraedi-2e ch03). One faithful HTML page out of 250.
- **`tm/` is empty in every book.** Zero TMX files. The human-verified translation memory — one of the project's three headline deliverables (CLAUDE.md § Purpose) — does not exist yet.
- Five more books (líffræði-2e, eðlisfræði-2e, lífræn efnafræði, örverufræði, stjörnufræði) are queued behind the same Pass 1 process.
- The glossary is the one editorial asset that's thriving: 1,117 chemistry terms (617 approved), 2,262 biology terms, with a working approve/dispute workflow.

The previous roadmap answered *"can we trust the platform?"* — yes. This one answers *"can ~5 editors get through ~150 modules per book at acceptable quality?"* Every unit below shortens the path from "250 MT pages" to "250 faithful pages + a real TM".

## What the code analysis found

**Strong already (don't touch):** the segment editor's structural QA is excellent — math placeholders, `[[i:]]`-family markers, cross-refs and links are hard-blocked on save (`server/public/js/segment-editor.js:746-845`), with override-able warnings for unbalanced formatting. Edits are versioned, restorable (Unit 1 restore), and conflict-protected (`baseEditId` → 409).

**The gaps, in impact order:**

1. **TM is never written and never read.** Nothing in the codebase reads a TM — no fuzzy matching, no concordance, no leverage of previously approved translations. Every module is reviewed in isolation; an EN sentence approved in ch03 must be re-reviewed from raw MT when it reappears in ch04. Textbooks repeat phrasing constantly ("Check Your Learning", figure-caption stems, exercise boilerplate) — this is the single biggest wasted asset.
2. **The TM-creation step is the weakest pipeline step, and probably unnecessary as designed.** It depends on a manual Matecat Align upload (`tools/prepare-for-align.js` only stages files) and has never been done once. But the pipeline *already holds aligned data*: EN segments (`02-for-mt/`) and reviewed IS segments (`03-faithful-translation/`) are paired 1:1 by segment ID. TMX can be generated directly — no external service, no manual step. The Matecat dependency dates from the markdown pipeline, when alignment was a real problem.
3. **Terminology is surfaced but advisory.** Term highlighting and the lookup popup are good, but consistency checking loads async after the module renders, issues sit in a passive sidebar, and `POST /api/terminology/check-consistency` (`server/routes/terminology.js:858`) is never called automatically. An editor can save a segment contradicting an approved term with zero friction. The "terminology" edit category is unconnected metadata.
4. **No Icelandic spell/grammar check.** The editors are chemistry teachers, not professional translators — this is the highest error-catch-rate feature available. Good open tooling exists (GreynirCorrect, hunspell-is).
5. **Team management is retrospective, not operational.** Workload panel and 7-day velocity exist (`dashboardReadModel.getEditorWorkload`), but: no aging/SLA alerts on pending edits; editors are never notified when their edits are approved/rejected; head-editors are never pinged when the queue grows; reader feedback (`feedbackService`) lands in an admin table with no routing to the module or editor it concerns.
6. **Asset durability gap:** the terminology database lives only in the gitignored production `sessions.db`. The 2h git-backup cron covers `books/` content; the glossary JSON in git is an export from **2026-03-09** — three months stale. Unapplied segment edits and discussions share the exposure.

**Deliberately out of scope:** more platform hardening (diminishing returns after remediation Units 0–5); Pass 2 localization buildout (structurally fine, and starved for input until Pass 1 produces faithful content); real-time collaboration or dashboard rewrites (wrong scale for this team).

---

## Sequencing overview

| Order | Branch | Theme | Depends on | QA gate |
|-------|--------|-------|------------|---------|
| 0 | — (no code) | Walk the outstanding remediation manual QA §0–§5 | running server | **Yes** (it *is* the QA) |
| 1 | `feat/tm-generation` | In-house TMX generation from paired segment files | — | Yes |
| 2 | `feat/concordance` | Concordance search + exact-match repetition leverage in the editor | Unit 1 (index source) | **Yes** |
| 3 | `feat/live-terminology-qa` | Terminology checks in the save/submit path | — (parallel with 2) | Yes |
| 4 | `feat/spellcheck-qa` | Icelandic spell/grammar check + number-consistency QA | **lead decision on engine** | Yes |
| 5 | `feat/team-operations` | SLA aging, editor notifications, feedback routing | — (parallel) | Light |
| 6 | `chore/asset-durability` | Terminology export to git + sessions.db backup | — (parallel) | Light |

Rationale: Unit 1 is cheap and unblocks a headline deliverable with data that already exists; Unit 2 is the biggest throughput multiplier across six books and builds on 1; Unit 3 turns the project's strongest editorial asset (the glossary) into an active quality layer; Units 4–6 raise per-editor quality and team-lead visibility and can be cherry-picked.

---

## Unit 0 — Remediation manual QA (carried over)

**Goal:** close out the June-10 roadmap. No new code.
**Pre:** needs a running server (staging or prod off-hours). Checklist: [`docs/plans/2026-06-10-qa-checklist.md`](./2026-06-10-qa-checklist.md).

- [ ] **0.1** Walk QA §0 (hotfix: path traversal, authz boundaries, render rollback, XSS escaping).
- [ ] **0.2** Walk QA §1 (restore round-trip) and §2 (localization review tier).
- [ ] **0.3** Walk QA §3 (assignment enforcement 403/503) and §4 (editor UX, two-editor conflict).
- [ ] **0.4** Walk QA §5 (page-auth redirects, fetch/CSRF posture) + regression sweep.
- [ ] **0.5** Tick the remediation roadmap's QA boxes; mark that roadmap **done**; flip this roadmap's status to active.

---

## Unit 1 — `feat/tm-generation`

**Goal:** the `tm/` deliverable exists and grows automatically — no Matecat, no manual step.
**Key insight:** `02-for-mt/ch{NN}/m{NNNNN}-segments.en.md` and `03-faithful-translation/ch{NN}/m{NNNNN}-segments.is.md` are already aligned 1:1 by `<!-- SEG: -->` id. TM generation is a read-pair-emit tool, not an alignment problem.
**Pre:** read `server/services/segmentParser.js` (marker-based parsing, post-#96) and the marker table in CLAUDE.md — TMX content should have bracket markers stripped or mapped to TMX inline tags (decide: strip for v1, it's simpler and most TM consumers want plain text). Only emit segments from *faithful* files (human-verified by definition — ★ asset).
**QA:** generate from ch03/m68699, validate TMX 1.4b against a schema, import into a free CAT tool (e.g. OmegaT) as a smoke test.

- [ ] **1.1** `tools/generate-tm.js <book> [--chapter N]` — pairs EN/IS segment files by SEG id, skips segments missing on either side (report counts), strips bracket/legacy markers, emits `tm/{book}-{date}.tmx` (TMX 1.4b, `srclang="en"`, `xml:lang` en/is, per-TU `prop` for book/chapter/module/segment-id provenance).
- [ ] **1.2** Auto-regenerate on apply: hook after `applyApprovedEdits` succeeds (server-side, per-module incremental or whole-book regen — whole-book is fine at this scale) so `tm/` stays current without anyone remembering it. The 2h git-backup cron already pushes `books/`, so TMX reaches git for free.
- [ ] **1.3** Status integration: `tmCreated` stage auto-advances when the chapter's TMX coverage is complete (parity with the `linguisticReview` auto-advance pattern).
- [ ] **1.4** Decision (lead): retire the Matecat Align path — archive `prepare-for-align.js`, repurpose `for-align/` docs, update `simplified-workflow.md` step 4 and the CLAUDE.md pipeline table + directory annotations (`tm/` becomes GENERATED-from-faithful rather than "from Matecat Align"; still treat as read-only by hand).
- [ ] **1.5** Tests: pairing, marker stripping, missing-side skip, TMX well-formedness; round-trip a TU with Icelandic diacritics and `&`/`<` escaping.

---

## Unit 2 — `feat/concordance`

**Goal:** "how did we translate this before?" answered inside the editor; identical segments never reviewed twice.
**Pre:** index source = applied faithful segment pairs (same pairing as Unit 1 — read via `segmentParser`, not the TMX file). SQLite FTS5 ships in better-sqlite3's bundled SQLite; index size at full scale (~6 books × ~150 modules × ~50 segments) is trivial. Exact-match first; fuzzy similarity is explicitly deferred.
**QA:** QA gate — index rebuild idempotence; concordance returns ch03 m68699 content; repetition suggestion appears on a module sharing an EN segment with m68699.

- [ ] **2.1** Migration 036: `tm_segments` (book, chapter, module, segment_id, en_text, is_text, en_norm for matching, applied_at) + FTS5 virtual table over en/is text. Populate on apply (same hook as 1.2) + a backfill CLI.
- [ ] **2.2** Concordance endpoint `GET /api/segment-editor/concordance?q=…&book=…` (authenticated, book-scoped) — searches EN and IS sides, returns matched pairs with module/chapter provenance, highlighted match.
- [ ] **2.3** Editor UI: concordance panel (search box + results with "opna einingu" links). Icelandic-first labels.
- [ ] **2.4** Repetition leverage: on module load, for each unreviewed segment whose normalized EN text has an applied translation elsewhere, surface a "þegar þýtt í {module}" suggestion with one-click insert into the edit box (still goes through the normal save/QA path — no silent auto-apply; Human-Review-Required policy holds).
- [ ] **2.5** Repetition report at chapter level (head-editor view): top repeated EN strings and whether their IS translations agree — cheap consistency audit.
- [ ] **2.6** Tests: normalization (whitespace/markers), FTS query escaping, suggestion excludes the segment's own module, book scoping.

---

## Unit 3 — `feat/live-terminology-qa` (parallel with Unit 2)

**Goal:** the glossary acts during editing, not after. Warnings, not blocks — terminology stays advisory in *force* but becomes impossible to miss.
**Pre:** the pieces exist and just aren't wired: `terminologyService.findTermsInSegments` (`server/services/terminologyService.js:1009-1143`, inflection-aware) and the never-called `POST /api/terminology/check-consistency` (`server/routes/terminology.js:858`). Mind save-path latency — the check must be fast or async-but-blocking-the-toast, not blocking typing.
**QA:** save a segment violating an approved term → warning names the term and expected IS form; submit-for-review on a module with violations → report listed.

- [ ] **3.1** Save-path check: on segment save, run the consistency check for that segment's matched approved terms; surface violations as a non-blocking confirm (parity with the existing formatting-marker warnings) recording `termWarningsAcknowledged` on the edit.
- [ ] **3.2** Submit-gate report: `submitModuleForReview` attaches a per-module terminology report (term → expected IS → segments violating); head-editor sees it in the review panel. No hard block — head-editor judgement decides.
- [ ] **3.3** Link the "terminology" edit category to glossary entries: when an editor fixes a term, offer "tengja við íðorð" so disputes/decisions accumulate on the headword (uses existing discussion threads, `terminologyService.addDiscussion`).
- [ ] **3.4** Glossary export freshness: regenerating `glossary-unified.json` (MT input) on terminology approve — closes the loop so newly approved terms reach `api-translate.js` without a manual export. *(Overlaps Unit 6.1 — implement once, here.)*
- [ ] **3.5** Tests: inflection match in save-path check, report aggregation, no warning for proposed-only terms, latency budget (<150ms per segment at 1,117 terms — the per-module term set is already precomputed for highlighting; reuse it).

---

## Unit 4 — `feat/spellcheck-qa`

**Goal:** catch the error classes a glossary can't — spelling, grammar, and number slips.
**Pre — lead decision required (engine):**
  - **(a) GreynirCorrect** — best Icelandic grammar coverage; Python, so it runs as a small sidecar service (new deployment surface on the Linode box);
  - **(b) hunspell-is via nodehun/nspell** — spelling only, in-process Node, no new runtime;
  - **(c) Yfirlestur.is HTTP API** — zero hosting, but external dependency + content leaves the server.
  Recommendation: start with **(b)** in-process spelling (cheap, private), design the checker interface so (a) can slot in later.
**QA:** misspelled Icelandic word underlined/listed; chemistry terms and glossary entries whitelisted (no false positives on "mól", element names); number-mismatch warning fires.

- [ ] **4.1** Checker service interface (`server/services/qaCheckService.js`): takes EN/IS pair, returns typed findings (`spelling`, `grammar`, `number-mismatch`); engines pluggable.
- [ ] **4.2** Spelling engine per the decision above; custom dictionary seeded from the book glossary + approved terminology (terms are never "misspelled").
- [ ] **4.3** Number-consistency check: digits/numeric tokens in EN present in IS (tolerant of decimal-comma conversion `3.5`→`3,5`, thousands separators, and `[[MATH:N]]` placeholders).
- [ ] **4.4** Editor surfacing: findings inline under the IS edit box on save (same visual language as terminology warnings); per-module QA summary in the review panel next to the Unit 3 terminology report.
- [ ] **4.5** Tests: decimal-comma tolerance, placeholder exclusion, dictionary whitelist, engine-absent graceful degradation (QA disabled ≠ save broken).

---

## Unit 5 — `feat/team-operations` (parallel, cherry-pickable)

**Goal:** the head editor runs a 5-editor team from the dashboard, not from memory. Infrastructure exists (`notifications.js` has channels + preferences); the triggers aren't wired.
**QA:** light — trigger each notification path once; SLA badge appears on an artificially aged pending edit.

- [ ] **5.1** Decision notifications: notify the edit's author on approve/reject/discuss (in-app always, email per existing preference categories). New notification type; wire into `segmentEditorService` decision paths.
- [ ] **5.2** Reviewer-queue signal: daily in-app digest for book head-editors when pending edits exist; "oldest pending" surfaced. (No new scheduler — piggyback the existing session-cleanup startup job pattern or a simple interval.)
- [ ] **5.3** SLA aging: the review queue and dashboard badge pending edits >24h / >48h (`hours_waiting` already computed in `dashboardReadModel.js:79`); per-editor pending spread visible at a glance.
- [ ] **5.4** Feedback routing: feedback form gains optional chapter/module context (reader-side it's "hvaða síða" — derive module from the page URL); translation-error feedback creates an in-app notification for that book's head-editor, and the admin view links feedback → module → segment editor.
- [ ] **5.5** Tests: notification fan-out (author ≠ reviewer), digest no-op when queue empty, feedback→module link resolution.

---

## Unit 6 — `chore/asset-durability` (parallel, cherry-pickable)

**Goal:** the team's irreplaceable editorial assets (terminology DB, unapplied edits) survive a disk failure.
**Pre:** check what Linode-level backups exist before building anything — this unit may shrink to documentation + one cron line.

- [ ] **6.1** Nightly terminology export: CLI (`tools/export-terminology.js` or a server endpoint hit by cron) writes `glossary-unified.{json,csv}` per book from the DB; `scripts/git-backup.sh` already stages `books/`, so exports reach git automatically. Fixes the three-months-stale export. *(If Unit 3.4 landed first, this is just the cron schedule.)*
- [ ] **6.2** `sessions.db` backup: verify/establish a backup (better-sqlite3 `.backup()` to a timestamped file + rotate, or confirm Linode disk snapshots cover it); document the restore procedure in `docs/technical/server-operations.md`.
- [ ] **6.3** Document recovery expectations in architecture.md: what's in git (content, TMX, glossary exports) vs only in the DB (pending edits, discussions, users) and the maximum data-loss window for each.

---

## Decision points for the lead (collected)

| Unit | Decision | Recommendation |
|------|----------|----------------|
| 1.4 | Retire Matecat Align path entirely? | Yes — in-house TMX makes it redundant; archive, don't delete. |
| 1.1 | TMX granularity | Paragraph-level segments as-is for v1; sentence-splitting only if a CAT-tool consumer needs it. |
| 4 (pre) | Spell-check engine | hunspell-is in-process first; GreynirCorrect sidecar as a later upgrade. |
| 2.4 | Repetition auto-fill vs suggest | Suggest-with-one-click only — preserves the human-review guarantee. |

## Progress log

| Date | Session | Unit/item | Notes |
|------|---------|-----------|-------|
| 2026-06-12 | analysis | roadmap drafted | Head-translator code analysis (segment editor, terminology/TM, dashboards/notifications/feedback) + production-state audit (1 faithful module, empty `tm/`, 250 MT pages). Roadmap drafted; pending lead sign-off. No code changed. |
