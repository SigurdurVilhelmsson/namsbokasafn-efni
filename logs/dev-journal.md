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

## 2026-08-05 13:21 - C14 ② step 4 shipped: export provenance guard built, merged, deployed; containment lifted

**Branch:** main
**Modified:**
(clean)

**Recent commits:**
7cd0347c Merge pull request #354 from SigurdurVilhelmsson/docs/c14-deploy-status
f1c4e5a1 docs(register): record the C14 deploy — containment lifted, and why that is safe
7c53336d Merge pull request #353 from SigurdurVilhelmsson/fix/c14-glossary-export-provenance

**Why:** The 2026-08-03 unattended glossary write happened because the guard measured file SIZE (a producer swap is not a size change) and one exit code collapsed every book's outcome (so a legitimate refusal suppressed the health signal for all). Replaced with a measured producer fingerprint + self-identifying stamp, per-book outcomes, a 7-day refusal deadline (D6), and refusals printed in the deploy readout. **Shipped ≠ switched on:** the export now runs and refuses; no book has been adopted.

**Picking up here — three things:**
1. **[LEAD] confirm + close a gap.** `curl -s http://localhost:3000/api/health | jq '.checks.glossary_export'` — expect `ok:true` and four refusals once the 2h cron has ticked (`ran:null` still means it has never run). Then delete the empty `books/stjornufraedi/glossary/` on prod: it is the ONLY book in the absent-baseline hole, and adding its `book_subject_mapping` row — the obvious fix for its refusal — is exactly what would let the next tick write it ungated.
2. **[LEAD] per-book adoption.** Chemistry ≈124 term decisions. Standing positions unchanged: biology *do not write*, organic *decide what its glossary should even be first*, chemistry *a conscious call on 408 terms*.
3. **[CODE] C19** — `archiver@8` is ESM-only, so the book-download route throws on every call; the covering test settles two lines before the throw, so the suite stayed green. Small, unblocked, editor-facing.

**⚠️ Deploy gotchas learned the hard way (now in [[deploy-infrastructure]]):** prod is `siggi@172.236.212.190:~/repos/namsbokasafn-efni` — in shell history, NOT `~/.ssh/config`. `deploy.sh` runs ON prod and is a TWO-STEP deploy from an agent session: over BatchMode SSH it pulls and installs, then aborts at `sudo systemctl restart` (no TTY), leaving the OLD code running. And a deploy over an uncommitted prod edit is a trap whose both outcomes are silent — capture, remove, deploy, re-apply BY HAND (the saved patch will not re-apply).

**Verification lesson, 13 findings, one species:** every finding across 8 tasks, 2 blind whole-branch reviews and a fix wave was *a check that could not fail* — a number verified against a copy of itself, a test green under correct AND broken behaviour, a gate-order assertion that could not discriminate, a regression guard pinning a broken string, an enumeration asserting its own completeness while correcting a false claim. **None was found by running the suite.** All were found by mutating the code and watching what stayed green.

---

## 2026-08-05 18:00 - C19 + C21 fixed, deployed and verified; C22/C23 logged from a live 504

**Branch:** docs/c22-c23-ux-and-observability
**Modified:**
(register + memory + dashboard; code all merged)

**Recent commits:**
f8f0a496 docs(register): log C22 (download button unreachable) and C23 (no request timing)
8fd82a83 Merge pull request #361 from SigurdurVilhelmsson/docs/c21-deployed
c306c179 docs(register): C21 deployed 1046a09b — and demonstrated, not merely installed

**Why:** Resumed the campaign on C19 (the only unblocked P1). It cascaded: C19's review
found C20, the follow-up sweep found C21, and trying to prove C19 end-to-end found C22
and C23. Six PRs merged (#356–#361), two fixes deployed and verified ON the box rather
than inferred from deploy logs.

**Picking up here — pick ONE:**
1. **[CODE] C23 — request-duration logging.** Highest value of the three open code items:
   right now a request that outruns nginx leaves *no* server-side trace, which is why a
   live 504 this session could not be diagnosed at all. Four hypotheses were falsified by
   measurement and are recorded in §C23 so nobody re-raises them. Adding timings makes the
   one untested lead (terminology/concordance) testable instead of speculative.
2. **[CODE] C22 — the download button can never appear.** `.complete` vs `.published`;
   two-identifier fix plus deriving the type from `activeTrack`, and it should be pinned by
   a test. Unblocks proving C19 end to end, which is currently impossible through the UI.
3. **[CODE] C20 — the archive stream has no `error` listener.** Well-specified: a
   deterministic reproducer (`chmod 000`) and a measured trap — the obvious one-line fix
   turns the crash into a *hang*, 4/4.

**[LEAD] and dated:** the per-book glossary adoption decisions (§C14 ②). D6 fires
**~2026-08-12 14:00Z**. Current server numbers, not the older note: chemistry 1117→709 with
*approved* rising 617→709; biology 2262→13561 (still "do not write"); **organic would produce
ZERO terms** — which answers "decide what its glossary should be" more bluntly than the
register did.

**⚠️ Verification lessons this session, all the same species:** three separate checks passed
for the wrong reason — the original download tests settled two lines before the crash, a
probe settled before the error ever fired, and a CI wait-loop never looped (broken `awk`).
Also: a reviewer's confident prose is **not** a measurement (a P1 register entry was nearly
written from a subagent's summary; re-running it changed the content), and `ps -o %cpu` is a
**lifetime average**, not instantaneous.

**⚠️ Do not run a fan-out review in the shared working tree.** It produced a phantom failing
test and a `UU` conflicted index mid-verification. Commit first and review the commit, or use
worktree isolation — but note `/tmp` is a 1.5 GB tmpfs against a 4.7 GB tree, so worktrees
there will ENOSPC.

---

## 2026-08-06 22:14 - C20 is spec'd + planned and next; C3 shipped but its result is stranded on prod

**Branch:** main
**Modified:**
 (clean)

**Recent commits:**
9dac3f49 docs: a dev push to main can strand prod's content backup — even a docs commit
eea11fe3 docs(register): C3's code worked on prod, its push did not; C22 settled; C27+C28 logged
f33934af docs(plan): C20 — implementation plan for the download-stream error fix

**Why:** Session covered C3 end-to-end (merged #366, deployed; the 22:00 cron proved the
pathspec by committing exactly the two June TMX files, then the push was REJECTED because
docs commits from dev left prod behind — files still only on the box, one deploy releases
them). C22 settled by querying prod: no publication.* rows exist at all, so the register's
prescribed fix was a no-op that would have looked like a fix; logged the wider cause as C27
(four dead editor controls) and C28 (health check reports ok while carrying the failure).
C20 spec + 5-task plan written; reproducer simplified to chmod 000 BEFORE the request (3/3).
⚠️ No CI on any of it — GitHub Actions was in a major_outage; local npm test was the gate.

---

## 2026-08-18 13:45 - §C9 shipped and merged; efni half of the vefur handoff done

**Branch:** docs/c9-closeout (docs-only, unpushed — rides with the next code PR per the batching rule)
**Modified:**

(clean)

**Recent commits:**
aff28d51 docs(C9): freeze the whole-branch review as evidence; log C97
9ed68159 docs(C9): RESUME — §C9 and §C93 both merged; next is a deploy, then §C88
d3607c50 §C9: prune-on-rename — a corrected section title no longer orphans the page it replaced (#404)

**Why:** The overdue reader-visible defect is fixed — chemistry ch10 no longer lists two "10.5"
entries. Corpus duplicate-module-id groups 1 → 0, published files 335 → 334.

**Carry into the next session, in order:**
1. **A DEPLOY IS OWED — two merges behind** (`c9b2aeaf` §C93, `d3607c50` §C9). Prod's next content
   tick with real content is rejected until `./scripts/deploy.sh` runs, and releasing the stranded
   commit is a separate manual push.
2. **§C88 tasks 4–11** — spec and plan written, tasks 1–3 done on `feat/c88-unreachable-figure-alt`
   (rebased onto main, 7 commits). It blocks the §C82 run.
3. **The vefur redirect consumer** — separate session in that repo; handoff already written there.

**The one lesson worth carrying:** the whole-branch review found a defect six per-task reviews and
two re-reviews all missed, because every one of them asked *"did this module move?"* and the fault
lived in *"did a filename move between modules?"*. It surfaced only when a reviewer was briefed on
the **capability** ("this deletes files — when can it delete a wrong one?") rather than the feature.
Its sibling: **a prune has consumers beyond the directory it prunes** — the repair had orphaned 8
entries in the subject index, which nothing had looked at.

---

## 2026-08-31 11:00 - Shipped §C82 action ⓪ (E9/K3 advisory) and §C116 (glossary regression: root-caused, fixed durably, applied to prod); surveyed the remaining homograph hazards as §C117

**Branch:** main
**Modified:**

(clean — everything committed and pushed)

**Recent commits:**
fdb8ecd0 docs(§C117): inventory the remaining homograph hazards; correct two CLAUDE.md prescriptions
10d15b21 docs(CLAUDE.md): correct a prescription §C116 falsified, and record the shipped matcher rule
462a00a4 §C82 action ⓪ (E9/K3 advisory) + §C116 (glossary regression: root cause, matcher fix, 19 removals applied to prod) (#424)

**Why:** Action ⓪ was the planned work. Verifying it surfaced that the 2026-08-30
glossary cleanup had been reverted overnight — it was applied as hand-run SQL to a
table migration 047 rewrites from a file on every boot. Re-diagnosing it showed the
original approach was also too blunt (1,632 of 2,021 terms dropped to fix 67), so it
was replaced with a matching rule plus 19 targeted removals. §C117 surveys what that
leaves, as an inventory rather than a fix, because the remedies split into three
classes and merging them would delete correct terms.

**Next:** ② organic container-title extractor fix → ③ the free 491-module loop at
0 ISK → ④ buy chemistry ch15. §C117 is logged, not scheduled.

---
## 2026-09-08 08:14 - Built and merged the M5 figure driver, breaking the bootstrap deadlock

**Branch:** main (feat/m5-figure-driver merged as 633f60a9, PR #457, branch deleted)
**Modified:**
(clean — everything committed; one docs commit local, pushing with the sweep results)

**Recent commits:**
0902ba89 docs: the driver is MERGED — both registers now say so, and deploy is next
633f60a9 Merge pull request #457 from SigurdurVilhelmsson/feat/m5-figure-driver
af422d02 docs(register): §C139 — 45.4% of chemistry's images cannot reach the review panel

**Why:** The editorial correction loop had been fully built for weeks and never ran,
because nothing minted the sidecar. The driver mints it. Method that paid for itself:
a read-only recon pass checked 193 of the plan's claims against the tree BEFORE any
code, and found the plan's central discriminator refuted — it keyed `unreadable-text`
on `formTextXObjects > 0`, true of the old reader, but PR #452 replaced that reader
the day after the plan was written. Building it as specified would have printed
"cannot read" over 216 figures that read perfectly, with zero true positives.
A five-lens adversarial review then raised 30 findings, 27 survived refutation,
25 were fixed and 2 were correctly refused on re-measurement. All three blocking
defects lived in seams, and each was found by RUNNING the code, not reading it.

**Next:** DEPLOY (this branch carries a server/ change and the last one did not, so
the review panel runs the old enumeration predicate until then) → then M6, the first
[USER]-authorised paid figure run. §C139 (45% of images unreachable by the review
panel; ~2/5 of that fixable without re-extraction) is its own PR after this.

---

## 2026-10-02 12:20 - Finishing chemistry's translation layer before the editor pivot: §C140 ㊵ retire, ㊸ figure test, ㊼ ring-gate verdict

**Branch:** docs/c140-c47-merged-census
**Modified:**
 M docs/plans/2026-07-21-post-item17-followup-campaign.md

**Recent commits:**
859aeb05c docs(register): §C140 ㊵ census DONE (clean, after the 12:00Z tick); ㊼ MERGED (#533, 68abfeffe)
68abfeffe Merge pull request #533 from SigurdurVilhelmsson/fix/c140-c47-ring-gate-verdict
3a6c6a16b docs(register): §C140 ㊼ — FIXED on a branch (PR #533): the run fails, the figure does not

**Why:** The figure track is the last translation-layer work before the editor phase. Today: the 6 June
figures [USER] ruled out are retired (#531, deployed, census clean after the noon tick); the figure test
finishes again (#532, deployed) — it was stuck on ONE 1.34 MB figure with ~7e24 walk paths, not on the
heavy files the register blamed; and a ring gate that cannot run now fails the run's verdict, not the
figure (#533). Status and the next action live in the register's 2026-10-02 ⏩ RESUME, not here.

---

## 2026-10-02 15:00 - §C140 ㊵'s June-figure buys: two ICE tables kept, catalyst discarded, ibuprofen kept as it was

**Branch:** docs/c140-c40-buys-merged-handoff
**Modified:**
 M docs/plans/2026-07-21-post-item17-followup-campaign.md
 M logs/dev-journal.md

**Recent commits:**
0c2f06d01 Merge pull request #534 from SigurdurVilhelmsson/content/c140-c40-recompose-buys
3e41c6001 docs(spec): §C140 ㊵ — amend "The buys" step 3 with what the buys taught (register ㊽)
19441b9ae docs(register): §C140 ㊵ — the buy track is closed; next is merging #534, then step 2's recompose pass

**Why:** The four June figures [USER] ruled should be recomposed were lined up at 0 ISK (an adversarial
review found nothing necessary) and bought one at a time. Catalyst passed every gate under `VERDICT ok`
and was still worse than its June copy: the joined MT spelled out the symbol Eₐ, one label was clipped at
the artwork's edge, another crossed a curve. [USER] kept the June copy, and the buy was undone before any
commit (media copy, sidecar and pin, then plain and `--stale` dry runs). [USER] then chose to buy only
the two ICE tables, for decimal commas, keeping each only if it beat its June copy. Both did, in Chromium
and Firefox. Ibuprofen keeps its June copy. ≈ 3.95 ISK. Status and the next action (plan step 2, the
recompose pass) live in the register's 2026-10-02 evening ⏩ RESUME, not here.

---

## 2026-10-02 20:30 - §C140 step 2 re-derived: three of six sub-items not built, five June-better copies, a design spec awaiting rulings

**Branch:** docs/c140-c40-buys-merged-handoff
**Modified:**
 M docs/plans/2026-07-21-post-item17-followup-campaign.md
 M experiments/figure-text-translation/README.md
 M experiments/figure-text-translation/REGISTER.md
 A docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-design.md
 M logs/dev-journal.md

**Why:** The recompose pass's sub-item list came from a 2026-09-26 audit that predated six PRs, so each
item was measured as a hypothesis before planning (25 read-only agents, two verifiers per item, 0 ISK).
The heavy-figure and feImage work turned out to be built and simply picked up by the bump. The comment
icons, the Nitrogen layout and the kept-English short words are not built, and PerTable2 needs a guard
no existing config kind can provide. Comparing the prepared tree with what readers are served today
showed that the held sync, not the pass, is what replaces the reader's picture, and that five prepared
copies are worse than the June ones. Several of those choices are [USER]'s, so a spec with a decision
sheet was written instead of a plan. Status and the next action live in the register's 2026-10-02 night
⏩ RESUME, not here.

---

## 2026-10-03 - §C140 step 2: rulings taken, PR-A half-planned, value sheet filled; paused at the usage limit

**Branch:** feat/c140-c49-step2-code-fixes (pushed, no PR)
**Modified:**
 A docs/superpowers/plans/2026-10-03-c140-step2-code-fixes.md
 A docs/handoffs/2026-10-03-step2-value-sheet.md
 M docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-design.md
 M docs/plans/2026-07-21-post-item17-followup-campaign.md
 M logs/dev-journal.md

**Why:** [USER] chose the recommended option on all four design questions: a keep-copy guard, PerTable2's
June raster, compose-time values for the short English words, and value edits for HetCats and Graphene. A
drafting workflow then wrote the two plans section by section, each section checked by two verifiers. The
weekly usage limit stopped it with 8 of 15 agents done, so PR-A's plan was assembled from the finished
sections (two verified, two not) and its fifth part is a stub. The verifiers caught one money-and-overwrite
ordering trap for PR-B: a kept figure's guard entry must land no later than its sidecar deletion. The value
sheet was built from real keys and filled by [USER]. It showed that the figure font cannot draw ⁰ or ⁻, so
formula values must be drawn as raised and lowered runs. Status and the next action live in the register's
2026-10-03 ⏩ RESUME, not here.

---

## 2026-10-03 (evening) - §C140 step 2: both plans complete, PR-A built on a scratch branch; chemistry faithful retirement planned

**Branch:** feat/c140-c49-step2-code-fixes (15 local commits since the last push; not pushed)
**Modified:**
 A docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md
 A docs/superpowers/plans/2026-10-03-c140-step2-code-fixes-part5.md
 A docs/superpowers/plans/2026-10-03-c140-step2-recompose-pass.md
 A docs/superpowers/plans/2026-10-03-chemistry-faithful-retirement.md
 M docs/superpowers/plans/2026-10-03-c140-step2-code-fixes.md
 M docs/plans/2026-07-21-post-item17-followup-campaign.md
 M logs/dev-journal.md

**Why:** Part 5 had to be written against the tree after Parts 1-4, and none of that code existed, so Parts 1-2 were
applied and Parts 3-4 verified first, in scratch worktrees (32 fixes folded into the plan). Part 5 was then designed by
a judge panel, built test-first, and its plan text generated from the commits; a replicate rebuilt it from the text
alone with a 0-byte diff, and a skeptic's four findings became Task 12. PR-B's plan was drafted, verified and checked
against the real Part 5 code by a consistency critic. In between, [USER] ruled Part 5's four items, and approved a plan
to retire chemistry's stale faithful vintage (its backup condition was met; a sister-session report that it was not
turned out to be a false negative). Status and the next action live in the register's newest RESUME, not here.

---
