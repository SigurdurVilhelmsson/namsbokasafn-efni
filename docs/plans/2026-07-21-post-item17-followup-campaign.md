# Post-item-17 Follow-up Campaign — deferred & emergent findings, ordered by blocking effect × severity

**Created:** 2026-07-21 · **Baseline:** main `480fc651`, suite **3297 green** (231 files) · **Supersedes:** the pre-semester coding campaign (`docs/plans/2026-07-11-pre-semester-coding-campaign.md`), whose mandatory Phases 0–4 are **all complete** (items 1–21 merged). Only that campaign's Phase 5 (hygiene/opportunistic) remains — it is folded in here as P3.

## Purpose

The pre-semester campaign shipped 21 items and, per the standing "log every out-of-scope find" rule, accumulated a large register of deferred/emergent findings plus a Phase-5 hygiene backlog. This campaign organizes **all outstanding work** into one prioritized picture so it can be worked down in an orderly fashion.

**Ordering principle (as requested):** each item is ranked **primarily by what it blocks** (delivery to editors/readers → biology onboarding → another finding → nothing), and **secondarily by severity** (correctness → robustness/hardening → polish). Tiers P0→P3 encode that ordering.

**A structural truth worth stating up front:** the highest-blocking items are **operational**, not code — nothing merged in items 12–21 is live to editors until the server is deployed, and no content fix reaches readers until vefur is synced. Those are **[LEAD]**-executed. The efni **[CODE]** backlog that I execute is a set of medium-severity themed batches (P1–P2) plus a long low/polish tail (P3).

## How to run

- **Per item:** brainstorm → writing-plans → subagent-driven-development, **one PR per item**. `npm test` from the repo root is the **authoritative gate** (no branch protection — a red PR can still merge, so local green is the real proof). Whole-branch adversarial review before each PR (the item-17/-21 pattern).
- **Legend:** **[CODE]** = I execute. **[LEAD]** = you execute (deploy / data-op / product decision). **[decision-gated]** = a **[CODE]** item blocked on an L7-style lead decision — resolve the decision first.
- **Register provenance:** codes like `I14-R2`, `MTA-R8`, `osd-1`, `P1-R1` are defined in the pre-semester campaign's register sections (`docs/plans/2026-07-11-pre-semester-coding-campaign.md`) and the SDD ledger. This doc consolidates and re-prioritizes them; it does not restate their full history.
- **Excluded false-positives:** the inventory sweep surfaced two register lines that are **already resolved** and are NOT in this campaign: **B4-D11** (fixed #279 + data #280 — biology term round-trip is live) and **I18-R1** (closed by item-19 #306 — tag-at-approval). Re-verify any code against its register line before starting; a line *describing* a fixed problem is not open work.

---

## P0 — Unblock delivery (highest blocking; nothing merged is live until these run)

These gate whether ANY of the 21 shipped items, and all content fixes, actually reach editors and readers. Mostly **[LEAD]**.

- **P0-1 · Deploy server items 12–21** — **[LEAD]** — `./scripts/deploy.sh` + a one-time `node scripts/backfill-mt-locks.js --db` on prod. Delivers all merged server/tools work (#298–#319, incl. the `/api/tm/export` and `/api/terminology/added-terms/export` routes) to ritstjorn and activates the Track-C MT edit-lock. **Rides with it (comms/sanity):** MTA-R1 (completion metrics RISE — reviewed = approved-edit ∪ acceptance; item-16's F18 metrics DROP land in the same deploy — tell ritstjorn), item-19-comms + I21-R7 (added-terms export reads empty until an editor re-reviews terms on prod), the I12-R3 sanity query (`SELECT COUNT(*) FROM localization_pending_edits WHERE status='approved' AND applied_at IS NULL` = 0), and `tm_segments chapter='appendices' = 0`. **Sequencing:** coordinate with P0-QA below — server-touching units should not deploy mid-QA (pre-semester Unit-0 note). *[blocks: everything editor-facing]*
- **P0-2 · Vefur content sync to readers** — **[LEAD]** — in `../namsbokasafn-vefur`: `node scripts/sync-content.js --source ../namsbokasafn-efni` → build → deploy. Readers currently see **stale content** (does NOT fail safe): chem clean-slate fixes, appendix labels, glossary/answer fixes are all un-delivered. Includes the P0-1-render delivery re-render of published books + `fidelity --update-baseline` if render code changed since last publish. `[[content-sync-vefur-broken]]` (auto-sync Action unconfigured → manual is the route). *[blocks: all reader-visible fixes]*
- **P0-3 · Biology onboarding** — **[LEAD] + [CODE] support** — translate + inject `liffraedi-2e` chapters. The code foundation is complete (B2 routing, embed CSS, B4 term round-trip, 6b coverage gate). This is the campaign's reader goal; detail lives in `[[bio-review-option-drop]]` and `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`. Depends on P0-4. *[blocks: biology readers]*
- **P0-4 · Biology MC-options data op** — **[LEAD data-op]** — re-extract + re-MT biology's ~9 already-MT'd modules so the 6b·f-recovered multiple-choice answer-option lists land in `02-for-mt/`+`02-mt-output/` on disk (fix #287 is in code; on-disk delivery is pending — the on-disk 6b gate goes green only after this). `0-faithful → free re-extract, cheap re-MT`. Registers L9 / BIO-EX4. Gates P0-3. *[blocks: biology onboarding; reader-visible MC options]*

---

## P1 — Correctness backlog · **[CODE]** (real gaps, mostly reader- or integrity-affecting)

- **C1 · Appendices support batch** — appendices (`-1` / `appendices`) are rejected or silently skipped across the whole stack; fails safe today (rejects/skips, no corruption) but blocks appendix Pass-1/publication. Coherent multi-file batch:
  - **I14-R2** — inline chapter validators reject appendices: `publication.js:47` (whole publication API), `books.js:372/487` + bare unvalidated `parseInt` at `:213/248/276/522`, `admin.js:497/1067`, `status.js:1279` (`/sections`).
  - **I14-R3** — ch-prefix scans silently skip appendices: `validate-status.js:245` (`npm run validate` never checks `chapters/appendices/status.json`), `routes/status.js:148/628/826`, `pipelineService checkBookDownstream`.
  - **I14-R4 / I16-R3** — section registry omits appendices: `bookRegistration.registerBook:199` iterates `bookData.chapters` only → no appendix rows in sections / suggestions / localization-review / `books.html` / loc-editor. When `-1` rows land, also dedup the `': '+title` suffix at `books.html`.
  - **I14-R8** — zero appendices E2E coverage (`__e2e-fixture__` has no appendices dir) + a manual-QA note for the item-14 client touches.
  - *Sub-decision:* the exact canonical form (`-1` vs `appendices`) is settled by item-14's `chapterLabel` converter — follow it. *[severity: correctness · blocks: appendix editing/publication]*
- **C2 · Playwright red-on-main fix** — **I16-R14** — `editor-workflow.spec.js` + `ux-phase2.spec.js` have been RED on `main` since the SR-OOS-2 backstop (`2767b9c4`, 2026-07-12): both POST synthetic `segmentId`s the backstop now correctly 404s. Because Playwright sits outside the authoritative `npm test` gate, the red went unnoticed. Fix the specs to use real segments (or the backstop's sanctioned path). *[severity: test-integrity · blocks: trustworthy E2E signal]*
- **C3 · Corpus/TM durability gap** — **I20-R1** — `scripts/git-backup.sh` PATHSPECS stage **neither** `books/*/tm/` **nor** `books/*/glossary/`, but `docs/technical/architecture.md:431-433` claims both ride the 2h cron. So `glossary-unified.json` and the TMX reach git only if someone commits by hand — the two human-verified research assets are **not actually durable**. Add the pathspecs (or correct the doc if exclusion is intended — but the docs-claim + research-asset status argues for backing them up). *[severity: correctness/durability · blocks: research-corpus durability]*
- **C4 · Nested-para reader residue** — **P1-R1** — extract-side nested-para truncation: the outer-`<para>` segment truncates at the first inner `</para>`, so inner para `fs-idp218612096` gets no segment and its **English survives as published residue** in chem `m68710` (contained to 1 module today). **⚠️ Corpus-safety:** this touches the extract traversal, which is **load-bearing and frozen** for the export corpus (renumbering seg-ids breaks the join key — see `[[server-editor-review-2026-07]]` / the "extract-traversal is load-bearing" memory rule). Scope narrowly, prove seg-id stability, and treat as render-side-only if at all possible. *[severity: correctness · blocks: reader-visible (1 chem module)]*

---

## P2 — Hardening backlog · **[CODE]**

- **C5 · Authz batch 2** — the residual cross-book authz holes Unit-0 book-scoping never adopted; read-only leaks + one write-adjacent gap. Fails safe on writes (reads leak info, not mutation):
  - **B1-F5** + **I12-R1** — read-only cross-book leaks: `admin.js` `GET /assignments/:book` (~`:986`) exposes another book's assignments/editor-names/progress; `GET /api/pipeline/jobs` + `/jobs/:jobId` expose every book's jobs (`listJobs` already supports a `book` filter — scope by `user.books[]`).
  - **B1-F2** — `status` route non-elevated transitions are un-book-scoped: an editor of book A can drive book B's section through editor-level transitions; adopt the established `requireBookAccessForSection` pattern.
  - **B4-F1** — JWT lifetime vs DB user state: `findByProviderId` ignores `is_active` (a deactivated editor's ≤24h JWT still passes) and hard-delete ≠ revocation; consult `is_active` on the auth path.
  - **B1-F1** *[decision-gated]* — keep-vs-retire the localization-suggestions family (lead product call); if kept, ship the one-line `requireHeadEditor('bookSlug')` on `POST /scan-book/:bookSlug` + the fail-open guard. Blocks I16-R1 (dead-endpoint disposition). *[severity: hardening · blocks: none (info-leak, contained)]*
- **C6 · MT-acceptance supersede edges** — item-20b acceptance-gate follow-ups, all fail safe:
  - **MTA-R8** — `returnEditToPending` ("Opna aftur") + `unapproveEdit` don't call `acceptanceService.supersedeForEdit` (unlike `saveSegmentEdit` at `segmentEditorService.js:134/:171`), so reopening a rejected-edit segment leaves a pending acceptance.
  - **MTA-R9** — the `DISCUSS_OPEN` acceptance guard matches ANY discuss row with no recency scoping, while every clearing affordance is bound to `latestEdit` → a stranded cross-editor discuss row blocks acceptance (over-refuses). Scope via `pickLatest` or add a resolve affordance.
  - **MTA-R13** — `acceptSegment` does NOT regenerate the `-review-status.json` sidecar (though `revokeAcceptance` does), and `supersedeForEdit`'s call sites (`segmentEditorService.js:134/:171`, `propagationService.js:135`) don't either → corpus `reviewStatus` staleness (both directions under-claim). *[severity: hardening · blocks: research-corpus accuracy (fails safe)]*
- **C7 · Terminology governance** — three governance gaps, two decision-gated:
  - **I19-R1** — `translate-chapter-titles.js:118/:124` primes chapter-title MT with `approvedOnly:false` — the one consumer leaking NON-approved glossary terms to Málstaður; flip to approved-only or bless deliberately.
  - **I19-R3** *[decision-gated]* — terminology queue/mining endpoints are role-gated but NOT book-scoped (an HE of book A can act on book B's terms); deliberate posture today (glossary is subject-oriented) — decide with the lead.
  - **I19-R4** *[decision-gated]* — `PUT /translations/:id` lets any EDITOR rewrite an APPROVED translation's Icelandic text/subjects with no status reset — undermines queue trust; decide reset-on-edit vs gate. *[severity: hardening/correctness · blocks: MT-priming quality]*
- **C8 · Pipeline robustness** — assorted producer/preview hardening:
  - **I21-R2** — TM auto-regen now needs a `book-licences.cjs` (→ item-17 `book-config.json`) licence row: a valid book with faithful content but no licence entry fails regen — LOUD 500 on `/api/tm/export` but SILENT warn-only stale TM on the cron. Onboard-books-licence-first is the rule; consider a loud cron guard. *[blocks: a new book's TM durability]*
  - **GATE-1** — `verify-extraction-coverage` reports `modulesMissingSource:21` (a source-matching gap in the coverage assertion; the dup-seg-id scan is sound regardless). Weakens the pre-freeze gate for those modules. *[blocks: biology-onboarding gate confidence]*
  - **osd-1** — server live preview never rebinds `BOOKS_DIR` per book → preview-time os-embed resolution is chemistry-pinned (wrong for organic); plumb an `options` param like the D4 `embedMap` fix (#192).
  - **REEQ-1** — `normalizeVisibleText` nested-bracket term false-flags `m68727`/`m68747`, blocking clean verify-reextract-equivalence runs on chemistry (waivable → fails safe). *[severity: hardening]*

---

## P3 — Opportunistic / polish · **[CODE]**, no deadline

The pre-semester campaign's **Phase 5** (fold-in) plus a long low-severity tail. Enumerate the PR-worthy; the rest is a register pointer.

- **item 22 · Batch 9** — undeclared glob · dead-code · SR-OOS-1 · absorbs B4-F6.
- **item 23 · Batch 3** — docs authority triage + Submit-button (the Submit-button half is *[decision-gated]* on L7).
- **item 24 · Hardening-tests one-shot** — TB-OOS-1 · Track-A residuals · C3 workList.
- **item 25 · Smalls** — #29/#30 · C3-b · A2-c · TERM-1 · low-cli.
- **Notable lows worth a small PR:** vefur emphasis-class CSS (organic emphasis unstyled — cross-repo tail, `[[vefur-status-2026-07-01]]`) · M-e (generate-tm exercise pairing for organic) · I13-R4 (in-flight duplicate-request dedup via AbortController) · I16-R1 (dead endpoint keep-vs-retire, rides B1-F1) · I20-R5/R10 (corpus TM-exercise pairing + honesty stat).
- **The rest (~120 low findings):** collapsed by design — see the pre-semester campaign register sections and the SDD ledger (`.superpowers/sdd/progress.md`) for the full itemization. Pull one into a PR opportunistically; do not enumerate here.

---

## LEAD operational lane (parallel — unblock whenever convenient)

Non-coding, LEAD-executed; sequenced against P0 above.

- **A2 · Activate off-box DB backup** — Linode Object Storage bucket (recommend a DIFFERENT region than the Linode) + rclone crypt remote + `BACKUP_REMOTE` in cron. Until then `/api/health` = "degraded" (correct). Runbook `docs/technical/backup-and-restore.md`. Registers L1 / PROV-2 #262. *[fails safe today]*
- **A4 · Manual QA §0–§5 walk** — combined efni+vefur pass: authz boundaries, on-disk render rollback, restore round-trip, enforcement 403/503, stored-XSS rendering, page-auth redirects, CSRF posture + 3 prod-only cases. **Coordinate with P0-1** (don't deploy server-touching units mid-QA). Registers L5.
- **A5 · Lead decisions (L7)** — residue-report disposition · table-as-image transcription · Submit-button fate (with item 23 / C5-B1-F1) · re-MT API-spend authorization. Each unblocks a downstream item.
- **B-embed · Embed reader-visibility** — re-render embed chapters + sync + a manual nginx `frame-src` allowlist on the vefur server (0 live `.embed-responsive` today despite the CSS shipping). Includes L10 (physics ch04 `m42074` — the only translated iframe module corpus-wide; entangled with P1-R5 duplicate-equations + item-10 renumbering). ⚠️ **Standing rule:** widening vefur CSP `frame-src` ⇒ widen efni `ALLOWED_EMBED_HOSTS` too. `[[d4-iframe-embeds]]` / `[[vefur-embed-css-item11-2026-07-17]]`.
- **B5 · Physics / microbiology re-MT** — not forced now; onboard licence-first (item-17 rule) when scheduled.

---

## Parallel: Content track (referenced, not duplicated)

The content-delivery effort runs alongside this campaign and has its own live memory threads — do not restate its plans here:

- **Chem clean-slate tail** → `[[chemistry-clean-slate]]` (RESUME POINT at top). Open: **#3(c)** m68662 preface 5 segs = lead-authored Icelandic; then **#3(b)** flip the order gate (#5) + F8 math gate (#7) from warn-only → hard. Feeds P0-2 (chem fixes to readers).
- **Biology intake** → `[[bio-review-option-drop]]` + `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`. Drives P0-3/P0-4.

---

## Provenance & sizing

- **Inventory basis:** a 6-agent extraction sweep (2026-07-21) over the pre-semester campaign register + the status dashboard + the SDD ledger + CLAUDE.md + memory, then controller dedup/consolidation. Raw 189 open findings → consolidated here; two already-resolved false-positives (B4-D11, I18-R1) excluded.
- **Critical path:** P0 is the spine — until P0-1 (deploy) + P0-2 (vefur sync) run, the 21 shipped items and all content fixes are invisible to their users. The **[CODE]** backlog (P1–P3) does not gate delivery and can proceed in parallel with the LEAD lane, subject to the mid-QA deploy caveat.
- **First codeable pickups (recommended order):** C1 appendices (biggest coherent value, unblocks appendix editorial) → C2 Playwright-red (restores E2E trust) → C3 corpus/TM durability (cheap, closes a real durability lie) → then P2 batches by decision-readiness.
