# Product-Provenance & Durability Audit — namsbokasafn-efni

**Date:** 2026-07-11
**Lens:** the *assets*, not the code. For each MVP product the project must deliver, does the **system enforce** its survival, purity, separation, exportability, and governance — in code, not by policy or discipline?
**Relationship to the other reports:** this is a sibling to `2026-07-11-server-code-review.md` (function/interface) and `-editorial-workflow-review.md` (process). It shares their findings-first, `file:line`-evidenced grammar but traverses a different axis — a code review asks "is each path correct?"; this asks "for each product I must deliver, what can destroy, mutate, or fail to reproduce it, and is each of those blocked by the system?" That framing catches *absences* (no backup, no guard, no export) that are invisible to a review reading code that exists.
**Method:** five targeted read-only investigations over `tools/`, `server/`, `books/`, migrations, and the deploy/backup scripts, plus direct controller verification of the load-bearing claims. Every verdict cites `file:line`.
**Two requirements were clarified by the lead mid-audit and are measured as the target behaviour below:** (i) `02-mt-output` need not be immutable — it must stay *pure MT* and be re-runnable *only until a module is opened for editing*, at which point it locks; (ii) terminology lookup must prioritise the book's subject and *fall back* to other subjects on a miss (or on explicit request).

---

## 1. Verdict summary

| # | Product / invariant | Verdict | The gap in one line |
|---|---|---|---|
| 1 | `01-source/` CNXML never replaced (CC-BY provenance) | **PARTIAL** | Primary path fixed + checksum manifest; a *second* unguarded overwrite path exists; triple-consent not in code |
| 2 | `02-mt-output/` pure MT, locks on edit-open | **PARTIAL** | Purity MET; the edit-lock is **not built** — the producer is blind to editing state |
| 3 | Edited content survives, isolated from source/MT | **MET** | `.bak` + DB version snapshots + reversible restore; provably never touches 01/02 |
| 4 | Localized content kept separate; both tracks producible | **MET (architecture)** | Fully wired; no book has produced localized output yet (adoption, not code) |
| 5 | TM exportable as TMX **and** other formats | **PARTIAL** | TMX correct + auto-regenerated, but TMX-only and no user-facing export at all |
| 6a | Glossary: official (Íðorðabanki) vs added marked | **MET (with caveat)** | Reliable anchor is `idordabanki_id`, not the free-editable `source` field |
| 6b | Added terms go through review | **PARTIAL** | Propose/approve machinery exists but new terms are live immediately; queue never surfaces them |
| 6c | Added terms submittable to Árnastofnun | **NOT-MET** | No such path anywhere |
| 7 | Editing surface prioritises book's subject, falls back on miss | **PARTIAL** | Works on 3 of 4 surfaces; **fallback-on-miss not built** (it *hides* other subjects); alt-request only on a separate page |
| D | **Durability substrate** the above depend on (`sessions.db`) | **AT RISK** | Backups exist but same-disk, cron-install unverified, never restore-tested |

The through-line: **the two frozen baselines and the DB-resident products are protected by convention and partial mechanism, not by complete system enforcement.** The editorial *content* tiers (3, 4) are genuinely well-built; the *provenance and durability* guarantees around them are the soft spots.

---

## 2. Findings

### #1 — `01-source/` immutability · PARTIAL

**Fixed (PR #218):** the server fetch-source route 409s on a populated source with no `confirmed:true` bypass (`server/routes/admin.js:341-349`); the CLI `tools/download-source.js` refuses to copy over existing CNXML unless `--allow-overwrite-source` is passed (`tools/download-source.js:191-200`), and `pipelineService.runFetchSource` never passes it (regression-tested, `server/__tests__/fetchSourceGuard.test.js`). A committed **SHA-256 manifest** per book (`tools/lib/source-manifest.cjs`, `books/*/01-source/.source-manifest.json`) + a Vitest baseline gate (`tools/__tests__/source-manifest-baseline.test.js`, 32/32 green) now detects any byte drift.

**✅ RESOLVED — verified 2026-07-25 (pre-publication audit, finding E-6). Track B / PR #264 deleted the `update` subcommand; `tools/check-source-updates.js` is now read-only (`check`/`status`/`diff`), and `tools/__tests__/source-write-guard.test.js` statically enforces that `download-source.js` stays the only CNXML writer into `01-source/`. The original finding, as written at the time, follows.** ~~Still open — a second overwrite path the fix never considered:~~ `tools/check-source-updates.js update` writes upstream CNXML straight over `01-source/` (`tools/check-source-updates.js:647`) with only a timestamped `.bak`, no guard, no confirmation, no manifest check. The F2 design doc explicitly (and wrongly) asserts `download-source.js` is *"the single real overwrite path"* (`docs/plans/2026-07-02-f2-source-guard-design.md:36`). Reaching the real tree needs an explicit non-default flag, and the manifest test would flag the drift *after the fact* — but this is a live, unguarded writer on the legally load-bearing asset.

**Policy-only:** CLAUDE.md's *triple-consent* choreography (two distinct typed confirmations) is enforced **nowhere in code** — the code enforces "refuse unless a CLI flag is present," a weaker and differently-shaped guarantee. That half remains an AI/human-process guardrail.

### #2 — `02-mt-output/` pure MT + edit-lock · PARTIAL (purity MET; lock NOT-BUILT)

**Purity — MET.** Nothing writes human-edited content back into `02-mt-output`: downstream (`inject`, `render`, edit apply) only reads it (`tools/cnxml-inject.js:3676-3677`; `server/services/segmentEditorService.js:805-818` is a read-only existence check); the only content producers are `api-translate.js` and `docx-import.js`. The one upload route that *can* target the MT dir writes a non-matching filename (`server/routes/sections.js:71-75`, `1-1.is.md`) that no pipeline reader recognises — an orphaned file, not a baseline edit.

**The edit-lock — NOT BUILT.** The producer's only guard is `skip: exists && !args.force` (`tools/api-translate.js:715`). It has **zero** references to `03-faithful-translation`, `sessions.db`, `segment_edits`, `module_reviews`, or any lock, and no mt-lock concept exists anywhere in `tools/`, `server/services/`, or the migrations. So the current behaviour is misaligned with the requirement in *both* directions:
- It does **not** lock after editing opens — `--force` overwrites regardless, which is exactly the case the rule forbids. The concrete harm: you lose the pure-MT text the human actually edited *from* — the very comparison point your MT-vs-edited study rests on.
- It **over-blocks before** editing — the default skip-if-exists refuses a legitimate re-run even when no one has opened the module, where the rule says re-runs should be allowed.

**What "opened for editing" means today:** the durable signals are a `03-faithful-translation/{module}` file (written on first apply) or `segment_edits`/`module_reviews` rows in `sessions.db` (written on first open). The architectural wrinkle: the MT producer is a standalone CLI that never reads `sessions.db`, so the lock must be a signal the CLI can see — a per-module lock marker written when a module is first opened for editing, not a DB query.

### #3 — Edited content survives, isolated · MET

`applyApprovedEdits` writes **only** to `03-faithful-translation/` via `segmentParser.saveModuleSegments` (`server/services/segmentParser.js:258-282`): a timestamped `.bak` before overwrite (`:267-273`), atomic temp-file+rename (`:275-279`), preceded by a per-segment DB snapshot to `content_versions` (`server/services/contentVersionService.js:49-83`). Restore is itself reversible (snapshots current state first, `:193-199`) and nothing in `content_versions` is ever deleted (`:163`). Exhaustive grep confirms these services' filesystem writes never target `01-source` or `02-mt-output`. This is the strongest-protected product — with the load-bearing caveat that the version history lives in `sessions.db` (see **D**).

### #4 — Localized kept separate, both tracks producible · MET (architecture)

Faithful and localized have distinct paths from the start (`server/services/segmentParser.js:155-156`); `saveLocalizedSegments` (`:391-415`) is the sole writer of `04-localized-content/`, with its own `.bak` + atomic write, and `loadModuleForLocalization` reads `03-faithful-translation` only as a required reference (`:293-380`). The full `localized`-track inject→render→publish chain is wired end-to-end (`publicationService.js:289-291` → `pipelineService.js:258-283` → `TRACK_SOURCE_DIR['localized']='04-localized-content'` → `cnxml-render.js` writes `05-publication/localized/`). efni can therefore produce `faithful/` and `localized/` as physically separate HTML trees — the precondition for the reader-side choice (the toggle itself is vefur, not audited here). **Not yet exercised:** no book has produced localized output on disk (adoption, matching the roadmap's "Pass 2 out of scope").

### #5 — TM export · PARTIAL

`tools/generate-tm.js` emits correct **TMX 1.4b** (`buildTmx`, `:170-209`), auto-regenerated on every apply (`server/services/segmentEditorService.js:831` → `tmService.scheduleTmRegen`), git-committed and durable. But: **TMX-only** — no CSV/TSV/JSON writer and no `--format` flag; **no user-facing export** — no `/api/tm*` route, and the generic book-download explicitly excludes TM from its type list (`server/routes/books.js:332-339`); **1 of 7 books** actually has a TM file. The Matecat-era parallel-corpus exporter (`export-parallel-corpus`) was dropped rather than replaced. Note the pattern already exists elsewhere: the *glossary* has a real `?format=json|csv` export (`server/routes/terminology.js:166-216`) — it just wasn't built for the TM.

### #6 — Glossary provenance & governance

**6a marking — MET (caveat).** Every translation carries `source` and `idordabanki_id` (migration `032-terminology-redesign.js:52-59`); the importer stamps `source='idordabankinn'`, `status='approved'` on Árnastofnun rows (`tools/fetch_idordabanki.py:890-896`). **Caveat:** `source` is a free-editable dropdown (`updateTranslation` allows it, `terminologyService.js:374`), so the *reliable* discriminator is `idordabanki_id IS NOT NULL` (or the `idordabankinn-import` author sentinels) — those can only be written by the import script, never via the API.

**6b review — PARTIAL.** Added terms default to `status='proposed'` (`terminologyService.js:297`) and promotion needs a HEAD_EDITOR (`server/routes/terminology.js:565-568`) — but a proposed term is **live immediately** in lookup and consistency-checks (`terminologyService.js:197,1027`), and `getReviewQueue` only surfaces `disputed`/`needs_review`, never `proposed` (`:519`). The only place approval is truly enforced is MT-priming, which filters `approvedOnly` (`tools/lib/malstadur-api.js:179-180`). So the gate is real for the MT-export path but not for in-editor use, and nothing proactively shows a head-editor the new proposals.

**6c submission to Árnastofnun — NOT-MET.** No submission path exists anywhere in `server/`, `tools/`, or `docs/`. The nearest capability is the generic glossary export (`server/routes/terminology.js:175-232`) — but it has no `source` filter to isolate added-only terms and no Árnastofnun-shaped output.

### #7 — Subject-prioritised lookup · PARTIAL

Schema is present (`terminology_translation_subjects` + `book_subject_mapping`, migration `032:77-93`). Prioritisation **works on 3 of 4 surfaces** — in-text auto-highlight, save-path terminology QA, and the submit-gate report all rank by the book's subject via `req.params.book` → `findTermsInSegments` (`terminologyService.js:1064-1113`). The **4th surface** (manual quick-lookup box) is broken: the client sends `bookSlug` but the route reads `bookId` and `parseInt`s it (`server/routes/segment-editor.js:99,106`), so subject marking never fires — a regressed partial migration (git history shows the sibling `/terms` route was fixed and this one wasn't). This narrows code-review finding #13: "domain ranking never applies" is true only for that one popup.

Two genuine gaps against the requirement: **fallback-on-miss is not built** — the working path *hides* out-of-subject translations (`subjectAllowed` drops them, `:1064-1075`) rather than surfacing them when the subject glossary has no hit; and **explicit alternative-glossary request** exists only as the separate full-page Terminology Manager subject `<select>` (`server/views/terminology.html:768-769`), with no inline toggle in the editing surface.

### D — Durability substrate (`sessions.db`) · AT RISK

Products **#3 (edit history/versions), #5 (TM source relationships), and #6 (the entire glossary)** are database-resident, and `sessions.db` is gitignored. `scripts/backup-db.sh` is well-shaped (WAL checkpoint → timestamped copy → keep-30-prune) and `scripts/deploy.sh:45-47` runs it. But the durability guarantees are incomplete:
- **Same-disk only** — backups land in `pipeline-output/backups`, the same volume/instance as the live DB; a disk or Linode-instance failure takes the DB *and* its backups.
- **No off-box copy** — gitignored, so unlike `books/` content it never leaves the machine.
- **Cron unverified from the repo** — `backup-db.sh` is cron-*designed* (`0 */6 * * *` in its header) but the crontab is server config, not in the repo; `deploy.sh` only invokes it at deploy time, which is infrequent.
- **Never restore-tested** — nothing verifies a backup restores to a working DB; and keep-30 at 6h ≈ 7.5 days, so corruption unnoticed longer than that poisons every retained copy.

This is the single highest-leverage item: it silently underwrites three of the six stated products.

---

## 3. Requirements you may not have enumerated (judgment)

These follow from the stated products but aren't in the six conditions; each is a real, evidence-checked gap.

1. **Off-box, restore-tested durability for `sessions.db`.** Your conditions say the products must "survive," but survival of #3/#5/#6 reduces to this one substrate, and today it's same-disk/unverified/untested (finding **D**). *Suggested requirement: an off-machine backup on a schedule, plus a periodic automated restore-and-open check.*

2. **A first-class, exportable, three-way-aligned research corpus (MT ↔ faithful ↔ localized).** You describe using MT, edited, and localized content together in later studies — but the only aligned export is EN↔faithful TMX; `generate-tm.js` deliberately never emits MT (`tools/generate-tm.js:11-12`), and the MT-original-per-segment survives only implicitly as version 1 in `content_versions` (DB-resident, not exported, not aligned to localized). *Suggested requirement: an export that emits, per segment, {EN, MT-original, faithful, localized} aligned — the actual object your study needs.*

3. **Per-product licence metadata that travels with the artifact.** `book-config.json` carries no licence field and the renderer/page-data emit none (grep of `cnxml-render.js` + `bookDataGenerator.js` finds nothing) — which is precisely why RUN 6 found vefur hardcoding a blanket "CC BY" footer over the CC-BY-NC-SA books. The CC-BY vs CC-BY-NC-SA split is legally load-bearing and every exported/published product should self-assert it. *Suggested requirement: a per-book licence in config, propagated into published pages and every export (TM, glossary, corpus).*

4. **Destructive-action guards symmetric with the source guard.** You've hardened *overwrite* of `01-source`, but *deletion* has no equivalent friction — book-unregister and content-removal paths should not be able to irreversibly destroy a product any more easily than an overwrite can. *Suggested requirement: audit every delete/unregister path; require the same confirm-or-manifest friction; never hard-delete a populated product tree.*

5. **Reproducibility / regeneration determinism.** Derived products (TM, published HTML) should be rebuildable from their inputs so a lost derived artifact is recoverable — and, conversely, regeneration must never clobber a frozen input. The TM auto-regens (good); HTML re-renders from CNXML (good); but there's no stated guarantee, and #2's `--force` shows the "regeneration clobbers a baseline" failure mode is live. *Suggested requirement: a documented "what can be regenerated from what" map + a check that regeneration only ever writes derived tiers.*

6. **Glossary subject-tag completeness (and the untagged-leaks-everywhere behaviour).** Subject-priority (#7) is only as good as tag coverage: `subjectAllowed` treats untagged/`general` translations as allowed in *every* subject (`terminologyService.js:1064-1068`), so an untagged term silently appears across all books' editors. *Suggested requirement: measure subject-tag coverage; decide deliberately whether untagged means "global" or "unclassified — surface a warning."*

---

## 4. Risk ranking (irreversibility × likelihood)

Ordered by "how bad if it happens" × "how likely," which is the order I'd fix in.

| Rank | Item | Irreversibility | Likelihood | Why here |
|---|---|---|---|---|
| 1 | **D** `sessions.db` same-disk/untested backup | High — loses all edit history, versions, glossary | Medium — multi-year single-instance project | Underwrites 3 of 6 products; the one most-likely-to-actually-happen catastrophe |
| 2 | **#1** `check-source-updates.js update` unguarded | High — irrecoverable CC-BY provenance loss | Low — needs explicit CLI + non-default flag | Legally load-bearing; manifest only detects *after* |
| 3 | **#2** MT baseline overwritten after edit (`--force`) | Medium-High — loses the study's MT comparison point | Low-Medium — one operator flag | Directly damages the MT study; the lock simply doesn't exist |
| 4 | **New-#3** licence metadata absent in products | Medium — mis-licensed distribution is a legal exposure | Medium — already happened once (RUN 6) | Cheap to fix, real downside |
| 5 | **New-#2** no aligned research corpus export | Low (reconstructable) but blocks the study | Certain — needed the moment the study starts | The stated purpose of retaining MT/edited/localized |
| 6 | **#5 / #6c** TM export + Árnastofnun submission missing | Low — additive features | Certain when needed | Product-completeness, not data-loss |
| 7 | **#7** subject fallback-on-miss + inline alt-request | Low — quality, reversible | Ongoing editor friction | Behaviour gap, not a loss risk |
| 8 | **#6b** proposed terms live before review | Low — reversible | Ongoing governance leak | Real but bounded (never reaches MT priming) |

Findings #3 and #4 are **not** on this list — they're met; no action beyond keeping them that way (which rank 1 protects).

---

## 5. Suggested remediation order (solo-maintainer-sized)

Cheapest-highest-impact first; each is a small, self-contained unit.

1. **Protect the substrate (rank 1).** Add an off-box copy to `backup-db.sh` (rsync/scp to a second location or object storage), confirm the cron is actually installed on prod, and add a monthly automated *restore-and-open* check. Small, and it's the difference between "we have backups" and "we can recover." *Non-code prerequisite: decide the off-box destination.*
2. **Close the second source-overwrite path (rank 2).** Either delete `check-source-updates.js`'s `update` verb (keep its read-only `check`/`diff`) or give it the same `isSourcePopulated` guard as `download-source.js`. Correct the F2 design doc's "single overwrite path" claim. Tiny diff.
3. **Build the MT edit-lock (rank 3), to the clarified spec.** Write a per-module lock marker when a module is first opened for editing (a committed file the CLI can see); have `api-translate.js` *allow* re-run when unlocked and *refuse* when locked — replacing the current file-existence heuristic. This makes "pure MT, re-runnable until edit-open" a real invariant.
4. **Assert per-book licence in products (rank 4).** Add `licence` to `book-config.json`; thread it into page-data and every export. Coordinates with the vefur footer fix already logged in RUN 6.
5. **Add the research-corpus export (rank 5).** Extend the TM/export layer to emit an aligned {EN, MT, faithful, localized} corpus in TMX + CSV — reusing the glossary export's format pattern; this also delivers #5's "other formats."
6. **The governance + UX batch (ranks 6-8), when convenient.** A source-filtered "added-terms" export as the Árnastofnun-submission seed (#6c); surface `proposed` in the review queue (#6b); subject fallback-on-miss + an inline alt-subject toggle (#7).

---

## 6. Scope & confidence

- **Evidence:** every verdict is `file:line`-anchored from five read-only probes + direct controller verification of the durability, licence, and corpus-alignment claims. No code was changed.
- **Not covered / needs a running prod box:** whether the `backup-db.sh` cron is *actually installed* (server config, not in the repo — flagged, not assertable here); the reader-side faithful/localized toggle (vefur).
- **Confidence:** findings #1–#7 corroborate the just-completed code review where they overlap (e.g. the `sections.js:156` upload authz is #4 in the code review; the subject-lookup bug is #13). The durability, licence, and corpus-alignment items are new to this audit.
