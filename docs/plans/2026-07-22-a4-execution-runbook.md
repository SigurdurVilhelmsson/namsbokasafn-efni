# Lead execution runbook — what to do next, in order

**Date:** 2026-07-22, restructured 2026-07-30 · **For:** the lead, working without Claude.
**Register:** [`2026-07-21-post-item17-followup-campaign.md`](2026-07-21-post-item17-followup-campaign.md) — the one owner of status.
**Assessment:** [`2026-07-30-target-architecture-assessment.md`](2026-07-30-target-architecture-assessment.md) — why these tasks, in this order.

> This file was the A4 deploy-gate runbook. A4 is now **Part 2**, unchanged, because it is a
> *gate* rather than a task: it blocks deploying **server-touching** units. **Nothing in Part 1
> touches `server/`, so none of it needs A4 first.**

---

# PART 1 — do these first (in this order)

Each task states its cost, whether it writes anything, and what to record. **Tasks L1–L4 are all
read-only or local**; the first thing that writes to production is L5.

⏸️ **NOT now, by decision:**
- **liffraedi-2e ch03 vefur sync — HELD 2026-07-30.** The book is queued for re-extraction and
  re-MT; syncing now publishes a page the assessment records as known-bad and then immediately
  re-renders it. It ships with the post-re-MT sync instead.
- **The re-MT rehearsal — blocked on L3.** Do not run `api-translate --force` on any book until
  the hand-repair triage is done. ⚠️ Also note `--output-dir` is parsed but never read, so a
  "safe rehearsal into a scratch directory" silently overwrites the real `02-mt-output`.

---

## L1 — Merge the C16 tooling PR (~5 min · writes: git only)

The branch is `feat/c16-segment-edit-reattach`. It touches **only `scripts/`, `docs/` and
`LICENSE`** — zero `server/`, zero `books/` — so it needs no deploy, no A4, and no data op.

```bash
cd ~/dev/repos/namsbokasafn-efni
git fetch origin                      # ⚠️ ALWAYS first — a stale ref has caused a 2 GiB remote reject here
gh pr view --web                      # read the description, then merge in the UI
# or: gh pr merge --squash --delete-branch
```

- [ ] Merged? PR number: ______
- [ ] After merging: `git checkout main && git pull` — confirm `npm test` is green on main.

**Record:** the PR number and whether `npm test` passed on `main` after the merge.

---

## L2 — Two read-only prod queries (~10 min · writes: NOTHING)

These settle the one open **[LEAD] decision** blocking the migration's scope: does any module
outside the four known ones hold editorial work? Read-only — safe to run any time.

```bash
# on prod, from the repo root
DB=$(node -e "console.log(require('./server/lib/dbPath.js')())")
ls -l "$DB"     # must already exist and be non-trivial. If not, STOP — wrong box.

# (a) EVERY book and module with editorial work — NO book filter. This is the decision.
sqlite3 "$DB" "SELECT book, module_id, status, count(*) AS n
  FROM segment_edits GROUP BY book, module_id, status ORDER BY book, module_id;"

# (b) chemistry detail, to compare against the runbook's four modules
sqlite3 "$DB" "SELECT module_id, status, count(*) FROM segment_edits
  WHERE book='efnafraedi-2e' GROUP BY module_id, status;"
```

⚠️ Never type a relative path at `sqlite3` — it **creates** a database rather than failing, so a
wrong path silently operates on something that is not prod's DB.

**Record:** paste both result tables verbatim. If (a) shows modules beyond
`m68663, m68664, m68699, m68700`, that changes the migration's scope and I need to see it.

---

## L3 — Triage the hand repairs in `02-mt-output/` (~1h · writes: NOTHING)

**This is the highest-value task on the list.** `02-mt-output/` is marked READ ONLY, but it holds
hand corrections that exist in no faithful file — verified: commit `4e5be912` corrected
`liffraedi-2e` m66441's title *Fitusýrur → Lípíð* and renamed the published page to
`3-3-lipid.html`, **a live reader URL**. A `--force` re-MT reverts them silently.

Its `manualCorrections` provenance block indexes **one** file, but 23 commits across the five
books have fix/correct/repair subjects touching `02-mt-output` — so provenance under-reports and
git is the real index.

```bash
cd ~/dev/repos/namsbokasafn-efni
# 1. the full candidate list, per book (explicit paths — a books/*/ glob returns nothing here)
for b in efnafraedi-2e liffraedi-2e edlisfraedi-2e lifraen-efnafraedi orverufraedi; do
  echo "===== $b"; git log --oneline --no-merges -- "books/$b/02-mt-output/"
done

# 2. anything already self-declared
grep -rl "manualCorrections" books/*/02-mt-output --include='*-provenance.json'

# 3. for each commit that looks like a hand fix rather than an api-translate run:
git show --stat <sha>
git show <sha> -- 'books/*/02-mt-output/*-segments.is.md'
```

For each real hand repair, note: **book · module · what changed · did it rename a published
file?** (a rename means a live reader URL is at stake).

**Record:** the list. Even "I found none beyond `4e5be912`" is a useful, decision-changing answer.

---

## L4 — Glossary export dry-run on prod (~10 min · writes: NOTHING)

Closes register item **C14 ②**. Read the real approved-term counts before deciding anything.

```bash
# on prod, repo root
node server/scripts/export-terminology.js --dry-run
```

⚠️ **Do NOT pass `--force` yet.** The committed chemistry glossary holds 617 approved terms from
a producer whose DB table no longer exists, and the export feeds the **render** path — a silent
shrink is reader-visible. The first prod run is *expected* to refuse; that is the shrink guard
working, not a bug.

**Record:** the per-book approved-term counts it prints, and whether the guard refused.

---

## L5 — A2 off-box DB backup (larger · writes: infrastructure)

The one item that is a **hard prerequisite** for the migration, and the only Part 1 task that
changes production. Until it exists, **the git remote is the only off-box copy of editors'
reviewed translations**, and `GET /api/health` correctly reports `degraded`.

Shape (per the register): an object-storage bucket **in a different region**, `rclone crypt`
remote, and `BACKUP_REMOTE` set in the backup cron.

```bash
# verification once configured, on prod:
curl -s localhost:3000/api/health | python3 -m json.tool | grep -A3 offbox
./scripts/deploy.sh --help   # deploy.sh prints the health verdict + any not-ok checks
```

- [ ] Bucket created, different region: ______
- [ ] `rclone crypt` configured and a **restore tested** (not just a write) : ______
- [ ] `BACKUP_REMOTE` in cron: ______

**Record:** whether a restore was actually tested. A backup that has never been restored is not a
backup, and this gate exists precisely because the migration makes the snapshot irreplaceable.

---

## If you have time left over

- **The 2 nginx redirects** (register [LEAD] queue) — small, independent, no gate.
- **C12 branch protection** — decided: force-push + deletion blocking **only**. Required status
  checks are mechanically impossible here; do not enable them.

---

# PART 2 — A4 deploy gate (unchanged; run only before deploying server-touching units)

**Nothing in Part 1 requires this.** A4 blocks deploying units that touch `server/`; the C16
branch does not. Walk it when you next deploy server code.

## What this is

A4 = the manual QA §0–§5 walk plus 3 prod-only cases. This runbook runs it **automated-first**: run the suites (which machine-verify ~70% of the rows once the buildout lands), then walk the short manual residual, then the 3 prod-only cases, then deploy, then sign off.

**Legend for each step:**
- 🟢 **auto** — a passing test covers it; you just confirm green.
- 🟡 **auto-once-built** — will be 🟢 after the A4 E2E buildout PRs land; **until then, walk it by hand** (steps given).
- 🔴 **manual-always** — no test can witness it; human/on-box/prod judgment.

> ⚠️ **Sequencing:** do NOT deploy any server-touching unit while walking A4 (Phase 1–3). Deploy is Phase 4, after sign-off.
> ⚠️ **Never touch `books/*/01-source/`** in any step below — those CNXML files are legally load-bearing (see CLAUDE.md). Break only *generated* files (`03-translated/`), and restore them.

---


## Phase 0 — Pre-flight (5 min)

1. `nvm use` (reads `.nvmrc` → Node 22.x); `npm install` if dependencies changed since your last run.
2. Confirm nothing is mid-deploy and you're on a clean checkout of the tip of `main` (or the branch under test).
3. Have test intent ready: the automated suites mint their own role cookies; the manual steps below tell you which role to act as.

## Phase 1 — Automated gate (10 min, mostly waiting)

4. **Unit gate (efni):** from the repo root, `npm test` → **all green**. This is the authoritative unit gate (authz logic, restore/version service, enforcement, escaping, render rollback). 🟢
5. **E2E gate (efni):** `npm run test:e2e` (kill anything on `:3456` first). **⚠️ Known baseline: 2 PRE-EXISTING failures** — `editor-workflow.spec` + `ux-phase2.spec` (module m68664), red since 2026-07-12, tracked as campaign item **C2**, plus their deterministic serial-cascade skips. Everything else must pass; **any third failure is a real regression.**
   **Rows this turns 🟢 (delivered by buildout PR 1, merged as of this line):** **§0.1a/b/c** (preview: 200 + rendered HTML; traversal `track` → 400; malformed module → 400) · **§0.3a/c/d** (cross-book head-editor apply/publish → authz 403; admin bypass) · **§0.4a** (stored-XSS term source renders inert in the real DOM) · **§0.reg** (full editor→submit→approve→apply chain — tagged on `review-cycle.spec`) · **§1b/§1d** (restore round-trip reverts + `version_restored` activity) · **§1e** (cross-book restore → 403) · **§4c** (pipeline/apply panels role-gated) · **§5a** (anon `/admin` 302→`/login`, admin shell never sent — transport-level no-flash proof) · **§5b** (no-session state change rejected) · **console-error sweep** across `/editor`,`/localization`,`/library`,`/admin`.
   **NOT covered by PR 1 — still hand-walk these:** **§2a–f** (localization review tier) and **§3a–e** (assignment enforcement) → deferred to **PR 1b** (both need persistent per-book `book_settings` toggles on the shared E2E DB + a seeded DB user; their logic is already Vitest-covered). **§4a/§4b** → **not automatable: a real UX gap** — the my-work "current task" header renders the raw `mNNNNN` (`server/views/my-work.html:1249` uses the unresolved `module_id`), so the row's stated expectation ("Chapter N · Section title") does not exist in the app today. Treat §4a/§4b as a logged finding, not a QA failure. 🟡→🟢
6. **E2E gate (vefur):** after buildout PR 2 lands, run vefur's E2E (in `namsbokasafn-vefur`) → green. Covers **§0.4b** (published-page breakout) + reader render spot-check. 🟡→🟢
7. **Status validation:** `npm run validate` → clean (if any chapter status files changed).

> If the buildout PRs are **not yet landed**, treat rows marked 🟡 above as manual for this pass and walk them from the checklist (`2026-06-10-qa-checklist.md`) — the buildout is what removes that hand-walking.

## Phase 2 — Manual residual (🔴 never automatable — ~30 min)

8. **§0.2 on-disk render rollback (on-box smoke).** Pick a chapter that already has published pages under `books/<book>/05-publication/mt-preview/chapters/NN/`. Break **one** generated module: introduce a malformed tag in `books/<book>/03-translated/mt-preview/chNN/mNNNNN.cnxml` (a *generated* file — safe). Run `node tools/cnxml-render.js --book <book> --chapter <N>`.
   - **Expect:** the render fails on that module; the **previously-published pages are still present** on disk (not deleted); each touched file's `.backup.*` was **renamed back onto it** (restored, not left orphaned); the error message names the real failing module/phase.
   - **Restore:** re-run inject for that chapter (`node tools/cnxml-inject.js <book> <N>`) to regenerate the module you broke, then re-render. ✅ record result.
9. **§1f divergent-extraction restore.** Only if a real case exists (a module re-extracted so its segment IDs differ from a stored content version): restore that older version via the "Saga útgáfa" modal.
   - **Expect:** graceful — a warning, **no crash, no data loss**. If no divergent case is available, mark **deferred** with that reason (it's opportunistic, not blocking).
10. **§4e / §2f / §3f editorial + visual judgment.** As `head-editor`, open the editor, localization editor, terminology, and admin/assignments screens.
    - **Expect:** chemistry-teacher vocabulary throughout (no untranslated CAT/pipeline jargon on editor screens); the review queue lists Pass-1 **and** localization items sensibly; the per-book assignment grid + progress renders. ✅ record — this is your editorial sign-off, not a pass/fail script.
11. **Browser console sweep** (if buildout not yet landed): with devtools open, visit editor / localization / terminology / admin — **0 uncaught console errors**. (Becomes 🟢 in Phase 1 once built.)

## Phase 3 — The 3 prod-only cases (🔴 real production surface — ~20 min, on prod)

> These need real Entra OAuth / nginx-fronted prod / a destructive boot — synthetic sessions never exercise them, and they have caused real incidents (the #208 login loop).

12. **Prod-only 1 — real Entra OAuth login.** In a **clean browser with no existing session** (fresh incognito, or a browser that has never logged in — the #208 bug hid in already-authenticated Chrome and only surfaced in clean Edge): go to `https://namsbokasafn.is`, sign in via Microsoft.
    - **Expect:** the OAuth return lands you **logged in at `/`, with NO login loop**; the `auth_token` cookie is `SameSite=Lax`, `Secure`, `HttpOnly` (devtools → Application → Cookies). **Do not restore `SameSite=Strict`** (it re-breaks this — code comment says so). ✅
13. **Prod-only 2 — nginx security posture.** Against prod: `curl -sI https://namsbokasafn.is/` (and check a logged-in response in devtools).
    - **Expect:** the security headers (Helmet + nginx) are present as served in prod; the session cookie flags are `Secure`/`HttpOnly`/`SameSite=Lax`; mutating endpoints are POST (SameSite is the deliberate CSRF control). ✅
14. **Prod-only 3 — broken-migration boot (§5c).** On a **throwaway box / disposable DB copy — never prod data**: deliberately corrupt one legacy migration file, rebuild the DB from scratch, start the server.
    - **Expect:** it **logs the migration error and fails per the fail-loud policy** (boot aborts cleanly, no silent half-migrated DB, no unexpected hard crash). Discard the throwaway DB afterward. ✅
    - *(Adjacent UNDETERMINED cross-env facts to eyeball while you're on prod: `GREYNIR_URL` is actually set in the prod `.env`; and a reader sees a correctly-assembled "mixed" chapter page when only some modules are past mt-preview — the latter lives in vefur.)*

## Phase 4 — Deploy (gate lifts — only after Phases 1–3 pass + your sign-off)

15. Deploy the pending server units: `./scripts/deploy.sh` (DB backup → pull → `npm ci` → restart → health). Confirm `GET /api/health` = `ok` (or the expected `degraded` if A2 off-box backup isn't activated yet — that's whitelisted).
16. Run the **pending appendix backfill** (the outstanding PR #324 [LEAD] data-op): `node scripts/backfill-appendix-sections.js --db` — **dry-run first** (no flag) to review the row count, then `--db`. Add-only / idempotent.

## Phase 5 — Sign-off

17. Record pass + date in the result column of `docs/plans/2026-06-10-qa-checklist.md` for each row walked, and note any regression as a new row in the roadmap Progress Log.
18. Mark **A4 done** in the campaign register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, L5). **The deploy gate is now lifted** for the units that were behind it.

---

## Quick map: what each phase covers

| Phase | Rows / cases | Effort after buildout |
|---|---|---|
| 1 Automated | §0.1, §0.3, §0.4a, §0.reg, §1a–e, §4c, §4d, §5a/b/d + console sweep | run 2 commands, confirm green (mind the 2 known C2 reds) |
| 2 Manual residual | §0.2, §1f, §4e + **§2 and §3 until PR 1b lands**; §4a/§4b = logged UX finding, not a walk | ~45 min hand-walk (~30 once PR 1b lands) |
| 3 Prod-only | Entra OAuth · nginx posture · §5c boot | ~20 min on prod |
| 4 Deploy | — | `deploy.sh` + backfill |
| 5 Sign-off | record + lift gate | 5 min |

Before the buildout lands, Phase 1's 🟡 rows move into your hand-walk; that hand-walk is exactly what the two E2E PRs remove.

---

# PART 3 — what to send me when you are done

Paste this back, filled in. Anything you skipped, say so — a skipped step recorded is fine, a
skipped step assumed done is how a migration goes wrong.

```
L1 MERGE      PR #____ merged? ____   npm test on main after merge: pass / fail
L2 PROD QUERY (a) every book+module with segment_edits — paste the table:
              <paste>
              (b) chemistry detail — paste the table:
              <paste>
L3 TRIAGE     hand repairs found in 02-mt-output (book · module · what changed · renamed a
              published file?):
              <list, or "none beyond 4e5be912">
L4 GLOSSARY   per-book approved-term counts from --dry-run:
              <paste>
              did the shrink guard refuse? yes / no
L5 BACKUP     bucket + region: ____   rclone crypt: ____   RESTORE TESTED: yes / no
              /api/health offbox check now reads: ____
SKIPPED       <anything above you did not do, and why>
ANYTHING ODD  <errors, surprises, output that did not match what this runbook predicted>
```

**The two answers that most change what happens next** are L2(a) — whether any book holds
editorial work outside the four known chemistry modules — and L3 — whether `02-mt-output` holds
hand repairs beyond the one already found. Those two decide the migration's scope and its safety
gate respectively; everything else is sequencing.
