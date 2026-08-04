# Development Journal

Snapshots captured with /snapshot command.

---

## 2026-02-15 - MathJax 4 upgrade + appendix routing and image fixes

**Branch:** main
**Modified:**
(clean)

**Recent commits:**
b27bae5 fix(render): copy appendix images using correct CNX_Chem_00_ prefix
79bc18d Add feasibility study for expanding translation pipeline to additional OpenStax titles (#36)
0c9f03f Claude/review audit report n fr ld (#37)

**Why:** MathJax 3 TeX fonts only had 1/20 Icelandic characters, causing Helvetica fallback hacks. Upgraded to MathJax 4 (New Computer Modern) for native glyph support. Also fixed appendix pages: content loader had double appendices/ path prefix causing 404s, and image copy used wrong filename prefix (CNX_Chem_appendices_ instead of CNX_Chem_00_).

**Session summary:**
- Upgraded mathjax-full 3.2.1 -> @mathjax/src 4.1.0 with mathjax-newcm font
- Removed Helvetica width table workaround (no longer needed)
- Fixed contentLoader.ts double appendices/ path (vefur repo, 2 commits)
- Fixed copyChapterImages() to use CNX_Chem_00_ prefix for appendices (36 images)
- All 8 chapters + 13 appendices re-rendered and synced
- Site running on localhost:5174, all appendices verified working

---

## 2026-02-04 06:00 - Replaced hardcoded MODULE_SECTIONS with shared helper that derives metadata from structure/segment files

**Branch:** main
**Modified:**
?? docs/erlendur-bug-report.md
?? docs/pipeline/ch5-equations-screenshot.png
?? docs/pipeline/ch5-katex-rendered.png

**Recent commits:**
5d7bbf9 refactor(pipeline): replace hardcoded MODULE_SECTIONS with shared helper
fb34440 fix(pipeline): translate figures in notes and list items in examples/exercises
88d6409 fix(pipeline): use translated CNXML for exercises/summary/answer-key extraction

**Why:** Hardcoded constants had to be updated for every new chapter — now derived automatically from structure + segment files

---

## 2026-07-03 14:11 - Design investigation done; next = the oracle-hardening gate before biology

**Branch:** docs/integrate-clean-slate-into-plans (PR #222 open) — cut a fresh branch off main for code work

**Modified:** (working tree clean; all committed)

**Recent commits:**
d124b304 docs(plans): integrate clean-slate design decision into the plan of record
eba3f098 Merge pull request #221 (clean-slate design spec + brief)
928ed8a6 docs(design): add clean-slate investigation handoff brief

**Why:** Clean-slate rewrite question is RESOLVED — don't rewrite; finish the chemistry clean-slate + onboard biology on the current pipeline. Spec: docs/design/2026-07-03-clean-slate-translation-system-design.md. Plan updated: docs/plans/2026-07-01-chemistry-clean-slate-design.md § Amendment 2026-07-03.

**NEXT (per the integrated plan, step 2 = the oracle-hardening gate, all before biology extraction):**
  1. F4 — table double-model, fix at EXTRACTION (cnxml-extract.js; model once, mirror figuresHandledInContainers), then flip the [[TABLE:]] carve-out in assertNoMarkerResidue to hard-fail. Diagnosis: docs/plans/2026-07-02-f456-marker-residue-design.md § Split outcome.
  2. Promote the id-order/LCS check warn-only → HARD-FAIL (cnxml-fidelity-check.js:357-359).
  3. F8 — normalized math-content hash in the fidelity check (land with WS4).
  Then: F3 benign re-triage → WS5 batched re-extract/re-inject/re-render/sync → biology onboarding (gated behind 1+2+3).
  Trailing (throughput track): F9 link-attr diff, F7 allowlist track+fingerprint, F10 faithful manifest, F16 marker-sequence flag.

**Workflow (carry forward):** per item → superpowers:brainstorming → writing-plans → executing-plans; one PR off main per item; robustness>expedience; log out-of-scope finds to docs/plans/2026-06-28-...register + memory; probe-first; `npm test` from repo root is the authoritative gate (no branch protection). Merge #222 first so the plan-of-record reflects this sequencing.

---

## 2026-07-15 13:06 - Shipped item 6b pre-freeze extraction-coverage gate (PR #286); next is the processExercise fix

**Branch:** feat/6b-extraction-coverage-gate (pushed, PR #286 open) — working tree clean
**Modified:** (all committed; nothing outstanding)

**Recent commits:**
9ee648f9 docs(6b): verify container-skip on real m66534 + honest residual framing
eda42a2b docs(6b): register note — adversarial review + 11 fixes, suite 2639
0ddc9bd5 fix(6b): CLI batch isolation + json-flush + source guard + hermetic tests

**Why:** The detection gate surfaced BIO-EX3 — processExercise drops multiple-choice options across ~208/259 biology modules (34 lists/9 extracted modules flagged) + 12 dup para seg-ids in frozen chem. Mechanism = structural list-item coverage (content-coverage rejected by go/no-go: legacy marker dialects). Adversarial review found+fixed 11 issues; container-skip verified on real m66534. NEXT SESSION: the processExercise *fix* PR (recover dropped options) — FIRST run the frozen-book `<list>`-in-`<problem>` safety sweep before touching the extractor (BIO-EX2: don't renumber frozen chem seg-ids). Resume dashboard = MEMORY.md ACTIVE RESUME + [[bio-review-option-drop]].

---

## 2026-07-16 - Item 8 PR1 (B3 + semantic #15 dup gate) shipped (PR #288); next = D2 (PR2)

**Branch:** main (a7e0c746) — item 8 PR1 merged; docs branch docs/item8-pr1-shipped for this snapshot
**Modified:** (docs only: campaign plan item-8 status + this journal)

**Recent commits (item 8 PR1, merged as #288):**
- 8d79092c docs(item8/B3): @param JSDoc + module-level cancellation note (final review)
- 5ab61ad2 docs(item8/#15): document canonical dup-seg-id policy; correct register count
- 52ea6ba9 test(item8/#15): hermetic mixed real/benign dup gate test
- 4e3156f2 feat(item8/#15): gate fails on real dups only; benign reported informationally
- 6cbc36ce feat(item8/#15): classify duplicate seg-ids benign vs real by visible text
- ca77002a feat(item8/B3): per-module + run-summary bracket-marker delta reporting
- 36807d9d feat(item8/B3): countBracketMarkers + bracketMarkerDelta helpers

**Why:** Two additive boundary guards ahead of biology intake — no content re-processed. B3 surfaces inline bracket-marker loss at the MT producer (non-gating). #15 makes the pre-freeze dup-seg-id gate content-aware: fail only on `real` (different-words) drops, tolerate `benign` (same visible text, incl. `[[MATH:N]]`-only diffs).

**Key finding (drove the #15 redesign mid-plan):** the 6b register's "12 chem dups / 4 modules" was a partial observation. The live gate shows **285 rawDup / 83 modules — but ALL benign** (zero content drops). So #15 shipped as a semantic (visible-text) check with **no allowlist**; `verify-extraction-coverage --book efnafraedi-2e` now exits 0 where it false-failed before. Register + `seg-markers.cjs` corrected.

**Process:** brainstorm → spec (self-reviewed; revised on the 285-dup finding, user-signed-off) → plan (complete code per step) → subagent-driven TDD (5 impl tasks + task reviews + 1 fix for a real/benign-split test gap) → independent final review (opus, merge-ready) → PR #288. SDD ledger: `.superpowers/sdd/progress.md`.

**NEXT:** item 8 PR2 = D2 (shared HANDLED_INLINE/BLOCK lib; behavior-preserving refactor; spec §D2 written). Then Phase-2 #9 (D3 os-embed), #10 (renderer bio-watch, must-survive), #11 (vefur embed CSS, must-survive). Deferred: GATE-1 (gate modulesMissingSource:21), REEQ-1 (normalizeVisibleText nested-bracket term).
## 2026-07-20 14:05 - Item 20b accept-gate complete: MT-acceptance + both fast-follows merged; next is item 20b PR2

**Branch:** main (clean, synced)
**Modified:**
 (clean — all work merged to main)

**Recent commits:**
ccc97d7f docs(campaign): item 20b + accept-gate fast-follows merged (#308–#310)
b99c2adc Merge pull request #310 from SigurdurVilhelmsson/fix/mta-r12-shown-equals-attested
03e1a16e fix(mta-r12): shown === attested — one rule for which IS text the editor sees

**Why:** MTA-R3's written fix design was verified broken BEFORE implementing it — it would have created an attestation the editor could enter but never see or undo. Replacement enforces eligibility server-side with one shared predicate mirrored client-side; MTA-R12 then closed the last shown-vs-attested gap. Both had defects that only whole-branch adversarial review found (the new HUMAN_CONTENT guard was itself failing open on normalization).

---


## 2026-07-28 15:54 - C1d appendix write-path publish merged (#344); C1 batch code-complete

**Branch:** main (clean, synced)
**Modified:**
 (clean — all work merged to main)

**Recent commits:**
229a08b7 docs: correct what C1d falsified, and stop three facts from drifting again
8e1c877a Merge pull request #344 from SigurdurVilhelmsson/fix/appendices-writepath-publish
07366aad docs(campaign): correct the C1d register entry against the finished branch

**Why:** Appendix publish failed closed with an undiagnosable 500 — the validator's arg
parser ate the `-1` chapter, printed usage to stderr, and the server parsed empty stdout.
Fixed at all 8 dir-builders plus the arg parser and the spawn argv.

Two things worth remembering over the feature itself:

1. **The committed plan would have shipped a green suite with a broken feature.** It listed
   seven dir-building sites and omitted the eighth — the one whose value 11 validators read
   off a `context` object. Every test the plan specified would still have passed. The
   register named that site; the spec written from it dropped it; the plan inherited the
   gap. That is the closure audit's "summaries of itself" failure recurring in a document
   written because of it. **Verify a committed plan's premises against the tree first.**
2. **The whole-branch review found 2 Important defects the per-task reviews structurally
   could not see** — the new tests pinned the current content tree while presenting as
   tests of the gate, so *using the feature* (or the lead data-op the PR itself logged)
   would have turned the merge gate red. Only visible in the join with work merged 3 PRs
   earlier, which had already made appendix segment *editing* work.

Post-merge: a 5-surface doc audit found 8 stale claims — CLAUDE.md still said appendix
publish fails closed, its E-2 licence note claimed one guarded require when there were
four in three classes (LICENSE now owns that enumeration), and a migration count in prose
had drifted by 8. Memory compacted 20.5KB → 17.1KB by deleting what CLAUDE.md already owns.

**Next:** C9 — prune-on-rename (must EMIT an old→new slug map, not just delete), delete the
stale chem ch10 file, re-render the ch10 intro. Hard deadline: before the fall semester.

---
## 2026-08-04 22:37 - Off-box DB backup (register A2) activated and restore-tested

**Branch:** docs/a2-deploy-backup-followup
**Modified:**
?? .codegraph/

**Recent commits:**
3fa47934 docs(CLAUDE): CLAUDE.md's /api/health enumeration omitted the off-box backup
5b57a0a0 docs(register): log the deploy.sh local-only pre-deploy backup under A2
edc9d8be Merge pull request #351 from SigurdurVilhelmsson/fix/a2-offbox-backup-runbook

**Why:** A2 was a [LEAD] gate on the C16 clean break — after the re-MT the DB
snapshot is the only copy of the editorial work outside a gitignored SQLite file
on one host. Prod now uploads sessions.db every 6h, encrypted client-side, to
Linode Object Storage in gb-lon-1 (server is de-fra-2), plus a new monthly
restore test. Completion criterion was RESTORE VERIFY: PASS, not the cron line.

The scripts were already correct; both defects were in the *runbook* —
install-cron.sh printed a BACKUP_REMOTE the script rejects (exit 5), and the
crontab had no PATH so cron couldn't see rclone at /usr/local/bin. Same shape:
passes by hand, fails on a schedule. Fixed + pinned by tests (#351, merged).

Scope: sessions.db ONLY. books/ content still leaves the box via git alone, so
C3's two untracked TMX files are unaffected.

**Next session:** merge #352 (docs only, MERGEABLE), then the register's stated
next [CODE] item — C14 (2) the glossary export's producer/provenance guard,
which is what stands between the export and being switched back on. Prod still
carries the uncommitted #CONTAINED-2026-08-03# edit in scripts/git-backup.sh.

**Watch:** first unattended backup cron fires 00:30 UTC; /api/health should show
offbox_backup.age_hours <= 6. `degraded` is now glossary_export alone.

---
