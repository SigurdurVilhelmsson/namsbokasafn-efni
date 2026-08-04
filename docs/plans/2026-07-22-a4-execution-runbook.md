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

- [x] Merged? PR number: 345
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

✅ **ANSWERED 2026-08-03 — it did, and the answer is analysed in the register: see §C16's
"✅ ANSWERED" block and the new §C17.** Headline: 7 chemistry module_ids / 148 rows (not 4 / 62),
plus a second book (`liffraedi-2e m66443`, 12 pending). Two follow-up queries are listed there.
*(Per CLAUDE.md § One source of truth this runbook records the raw output only — the register
owns what it means and what happens next.)*



### ✅ RESULTS — run on prod 2026-08-03, re-verified the same day

Box confirmed prod: DB at `/home/siggi/repos/namsbokasafn-efni/pipeline-output/sessions.db`,
16,470,016 bytes, mtime `Aug 3 10:42`. *(The box's `hostname` is literally `localhost`, which is
why the shell prompt looks local — the DB path is the reliable discriminator, as this step says.)*

**(a) + (b) combined, with the `chapter` column added — every book and module with editorial work:**

| Book | Ch | Module | Status | Rows |
|---|---:|---|---|---:|
| efnafraedi-2e | 1 | `m68663` | approved | 2 |
| efnafraedi-2e | 1 | `m68664` | approved | 44 |
| efnafraedi-2e | 1 | `m68664` | ~~rejected~~ | 1 |
| efnafraedi-2e | 1 | `m68667` | **pending** | 1 |
| efnafraedi-2e | 1 | `m68674` | **pending** | 1 |
| efnafraedi-2e | 3 | `m68699` | approved | 2 |
| efnafraedi-2e | 3 | `m68700` | approved | 59 |
| efnafraedi-2e | 3 | `m68700` | **pending** | 37 |
| efnafraedi-2e | 5 | `chapter-metadata` | approved | 1 |
| **liffraedi-2e** | 3 | `m66443` | **pending** | **12** |

**Totals: 160 rows, 159 restorable** (only the single `rejected` row is excluded —
`RESTORABLE_STATUSES = {approved, pending, discuss}`). Split: **chemistry 148 / 147 restorable**,
**biology 12 / 12**.

**The answer is YES — and it is 2.4× the assumption.** The register assumed **4 modules / 62
applied segments**. Prod holds **7 distinct chemistry `module_id`s across THREE chapters (1, 3,
5)** — not one — plus **a whole second book**. The four new rows the faithful-file signal could
never see are `m68667`, `m68674`, `chapter-metadata`, and `m68700`'s 37 pending.

**Follow-up queries run the same day (all read-only), which close the two open sub-questions:**

- **`chapter-metadata` is `chapter:title:ch05`** → `02-mt-output/ch05/chapter-metadata-segments.is.md`
  exists (all of ch01–ch21 do; only `ch00` and `appendices` lack one), so `readNewMt` resolves it
  and **the re-attach tool's exit-2 gate will NOT fire.**
- **No other pseudo-modules exist.** `SELECT DISTINCT book, module_id … WHERE module_id NOT GLOB
  'm[0-9][0-9][0-9][0-9][0-9]'` returns only `chapter-metadata`.
- **No duplicate restore keys.** Grouping restorable rows by `(book, module_id, segment_id,
  editor_id)` and filtering `HAVING count(*) > 1` returns **nothing** — so `m68700`'s 59 approved
  + 37 pending do **not** collide, and **the exit-4 gate will NOT fire either.**
- **Biology's 12 rows: 5 sit on drift-prone ids.** `m66443:entry:auto-44` … `auto-48` are
  positional; the other 7 are stable `fs-id*`. All 12 are `pending`, all from one editor.
  → this is what **register §C17** is about.

**→ Analysis and what happens next live in the register (§C16 "✅ ANSWERED", §C17). This section
records the raw result only.**



---

## L3 — Triage the hand repairs in `02-mt-output/` (~1h · writes: NOTHING)

**This is the highest-value task on the list.** `02-mt-output/` is marked READ ONLY, but it holds
hand corrections that exist in no faithful file — verified: commit `4e5be912` corrected
`liffraedi-2e` m66441's title *Fitusýrur → Lípíð* and renamed the published page to
`3-3-lipid.html`, **a live reader URL**. A `--force` re-MT reverts them silently.

Its `manualCorrections` provenance block indexes **one** file, but **19 unique commits** (out of
30 that touch `02-mt-output` at all) have fix/correct/repair subjects — so provenance
under-reports and git is the real index.

⚠️ **Corrected 2026-08-03: this line said "23 commits", which was the PER-BOOK SUM.** Three
commits span several books (`70676f88`, `f594336f`, `7aca8fd0`), so looping per book counts them
repeatedly: 15+3+1+1+3 = 23. *(Counting unit: unique commits, subject-substring match on
fix/correct/repair.)*

⚠️ **Run step 1 on the DEV box, not prod.** Prod's checkout is divergent (see register §C11(d)),
so its log both misses recent `main` commits and may contain a commit `origin` has never seen.

```bash
cd ~/dev/repos/namsbokasafn-efni
# 1. the full candidate list, per book (explicit paths — a books/*/ glob returns nothing here)
for b in efnafraedi-2e liffraedi-2e edlisfraedi-2e lifraen-efnafraedi orverufraedi; do
  echo "===== $b"; git log --oneline --no-merges -- "books/$b/02-mt-output/"
done

# 2. anything already self-declared
grep -rl "manualCorrections" books/*/02-mt-output --include='*-provenance.json'

# 3. for each commit that looks like a hand fix rather than an api-translate run.
#    ⚠️ SET THE VARIABLE FIRST — pasting the line with a literal <sha> is a bash syntax error,
#    which is exactly how this step silently did not run on 2026-08-03.
SHA=334d800d                      # <- replace with one sha from the step-1 list, then re-run
git show --stat "$SHA"
git show "$SHA" -- 'books/*/02-mt-output/*-segments.is.md'
```

Do that once per candidate. A quick way to see them all at a glance first:

```bash
# every fix/correct/repair commit touching 02-mt-output, with its files, in one pass.
# ⚠️ Paths are spelled out ON PURPOSE — see the pathspec trap below.
git log --no-merges --format='%n===== %h %s' --name-only \
  --grep='fix' --grep='correct' --grep='repair' -i -- \
  books/efnafraedi-2e/02-mt-output books/liffraedi-2e/02-mt-output \
  books/edlisfraedi-2e/02-mt-output books/lifraen-efnafraedi/02-mt-output \
  books/orverufraedi/02-mt-output
```

⚠️ **The pathspec trap, measured 2026-08-03 — the two glob forms differ, and BOTH mislead.**
A **quoted** `'books/*/02-mt-output/'` returns **0 commits** (git's pathspec wildcard does not
cross `/` here) — a silent empty result, not an error. An **unquoted** `books/*/02-mt-output/`
works, but the shell expands it to include `books/__e2e-fixture__/`, inflating the count by 3
test-scaffolding commits (`1c0e22e9`, `89eec2e1`, `fc7259de`). The real figure across the five
content books is **30 commits, 19 of them fix/correct/repair**. Spell the paths out.

For each real hand repair, note: **book · module · what changed · did it rename a published
file?** (a rename means a live reader URL is at stake).

**Record:** the list. Even "I found none beyond `4e5be912`" is a useful, decision-changing answer.

### ✅ RESULTS — triage completed on the DEV box 2026-08-03

⚠️ **The first attempt (also 2026-08-03) did NOT produce a triage.** Step 1's candidate list ran,
but step 3 was pasted with the literal `<sha>` and died on a bash syntax error, so no commit was
ever inspected. It was also run on **prod**, whose checkout is divergent. Both are fixed above;
what follows is the real triage, from the dev box.

**ANSWER: NOT "none beyond `4e5be912`". Six clear hand repairs, 13 modules, 2 books — and TWO of
them changed a title, so two live reader URLs are at stake, not one.**

| # | Commit | Book · modules | What was hand-repaired | Renames a published page? |
|---|---|---|---|---|
| 1 | `4e5be912` | bio ch03 `m66441` | title *Fitusýrur → Lípíð* | **✅ YES** — `3-3-lipid.html` (already known) |
| 2 | `827424da` | chem ch05 `chapter-metadata`, `m68723/24/26/27` | book-wide term aggregates + ch5 enthalpy terminology — **492+/528−**, by far the largest | **✅ YES — NEWLY FOUND.** It changed the **ch05 chapter title** `Varmefnafræði` → `Varma**e**fnafræði` (a missing *a*). A title drives the slug (§C9), so this renames rendered ch05 files. |
| 3 | `edd84811` | chem `appendices/m68866` | `{=…=}` emphasis markers (ionizable H notation), 24+/24− | no |
| 4 | `7439d07e` | chem ch14 `m68803`, ch18 `m68831`, ch19 `m68842` | API null-byte degree-sign corruption | no |
| 5 | `d440b5b8` | chem ch16 `m68818`, ch17 `m68823` | 2 lost `[[docref:]]` markers | no |
| 6 | `334d800d` | chem `appendices/m68865` | MT marker relabel `auto-342 → auto-338` — **edits a segment id, i.e. a join key** | no |

**Two borderline cases, small and symmetric — inspect before any `--force`:** `e251c134`
(orverufraedi, 3 files, 11+/11−, "chapter outline, note lists, protection artifacts") and
`97f41735` (10 files, 19+/19−, "preserve lost CNXML tag attributes"). Both *may* be pipeline
output rather than hand edits.

**Everything else is a pipeline run, not a hand repair** — re-extract / re-MT / provenance
backfill, identifiable by size (hundreds to tens of thousands of lines): `30efea88`, `0c2bd270`,
`a343dfe4`, `e0024f46`, `0b2defd1`, `70676f88`, `05cb1b2b`, `f594336f`, `d589f2e8`, `7aca8fd0`,
`1db4fcf2`, `5bbfdbe4`, `de601457`, `7658de89`, `602e2fbc`, `c43026f4`, `c733eae4`, `575aab84`,
`4d24f3ba`, `3c39e161`, `57467ce3`, `06058a0e`.

**⚠️ Two consequences for the re-MT:**
1. **A `--force` re-MT reverts all six**, including both title corrections — which would rename
   two live reader URLs *back* to their uncorrected slugs.
2. **`827424da` and the DB collide on one segment.** It hand-edited
   `ch05/chapter-metadata-segments.is.md`, and prod's DB holds an **approved** edit on
   `chapter:title:ch05` — the same segment. That is the one place where a hand repair in the
   READ-ONLY tree and an editorial edit in the DB target the same text.

**Provenance self-declaration remains a single file** — `grep -rl "manualCorrections"` returns
only `books/liffraedi-2e/02-mt-output/ch03/m66441-provenance.json`. **So provenance indexes 1 of
6.** Git is the real index, exactly as this step says.

<details>
<summary>Step-1 raw candidate list (per book, as pasted)</summary>

```
===== efnafraedi-2e
3cb70d1b (HEAD -> main) auto-backup: 2026-07-21 14:00
334d800d fix(m68865): relabel MT marker auto-342→auto-338 — un-block the appendix (roadmap #23)
a343dfe4 data(b4): re-MT 6 term-bearing modules with B4-D11 fix (paired-bracket round-trip, ~1,353 ISK)
e0024f46 data(b4): re-MT 8 modules via Málstaður API (bracket markers, ~1.73k ISK)
06058a0e feat(mt-lock): stage markers in git-backup + backfill already-edited modules
0b2defd1 content(efnafraedi-2e): re-MT + re-inject m68710/m68764/m68818 on improved Erlendur API
70676f88 chore(B2): backfill producer provenance for existing 02-mt-output content
7439d07e fix(mt): repair API null-byte degree-sign corruption + fail-loud guard
05cb1b2b feat(content): translate + publish Chemistry 2e preface (m68662); ch00 pipeline fix
827424da fix(glossary): repair book-wide term aggregates + ch5 enthalpy terminology
f594336f feat: chapter title pipeline, nested list fix, config documentation
57467ce3 chore: re-extract and re-inject ch05 after list-stripping fix
d440b5b8 fix(segments): restore 2 lost [[docref:]] markers in IS segments
1db4fcf2 chore: re-extract/re-translate m68818,m68823,m68854 (link fix) + m68727,m68805
5bbfdbe4 feat(pipeline): fidelity fixes — 110→113 PERFECT, 141→85 discrepancies
de601457 feat(pipeline): bracket markers [[i:]] [[link:]] + re-translation → 110 PERFECT (was 102)
7658de89 feat(pipeline): full-book MT translation + nested list fix + multi-math rendering
602e2fbc fix(inject): equation dedup, footnote regex, math restoration + ch02/ch12 re-translated
c43026f4 fix(inject+translate): CNXML fidelity fixes — ch01 7/7 perfect from API pipeline
edd84811 fix: repair {=...=} emphasis markers in m68866 MT output (ionizable H notation)
97f41735 feat: preserve lost CNXML tag attributes through translation pipeline
4d24f3ba fix: consolidate MT output — remove duplicate 02-machine-translated directory
3c39e161 refactor: rename efnafraedi → efnafraedi-2e, remove liffraedi
===== liffraedi-2e
3cb70d1b (HEAD -> main) auto-backup: 2026-07-21 14:00
4e5be912 fix(bio): correct m66441 title Fitusýrur -> Lípíð before the vefur sync
30efea88 fix(bio): re-extract + machine-translate ch03 — recovers 55% of the chapter
70676f88 chore(B2): backfill producer provenance for existing 02-mt-output content
f594336f feat: chapter title pipeline, nested list fix, config documentation
7aca8fd0 feat: add preview chapters for 4 new books (biology, microbiology, organic chemistry, physics)
575aab84 feat: add Biology 2e book setup and docx-import tool
===== edlisfraedi-2e
70676f88 chore(B2): backfill producer provenance for existing 02-mt-output content
f594336f feat: chapter title pipeline, nested list fix, config documentation
7aca8fd0 feat: add preview chapters for 4 new books (biology, microbiology, organic chemistry, physics)
===== lifraen-efnafraedi
0c2bd270 data(item9): MT output for all 31 organic exercises files — 443,565 chars ≈ 4,436 ISK (61% of estimate; ch06 retried after transient API async failure)
70676f88 chore(B2): backfill producer provenance for existing 02-mt-output content
f594336f feat: chapter title pipeline, nested list fix, config documentation
7aca8fd0 feat: add preview chapters for 4 new books (biology, microbiology, organic chemistry, physics)
===== orverufraedi
70676f88 chore(B2): backfill producer provenance for existing 02-mt-output content
f594336f feat: chapter title pipeline, nested list fix, config documentation
d589f2e8 content(orverufraedi): re-extract and re-translate ch01 with list fix
7aca8fd0 feat: add preview chapters for 4 new books (biology, microbiology, organic chemistry, physics)
e251c134 fix: chapter outline, note lists, and protection artifacts in rendering
c733eae4 feat: add orverufraedi (Microbiology) source and pipeline files
```

⚠️ Note the first line of the `efnafraedi-2e` and `liffraedi-2e` lists in that paste:
`3cb70d1b (HEAD -> main) auto-backup: 2026-07-21 14:00`. **That commit exists only on prod** —
it is the stranded content backup, now register **§C11(d)**. It adds four `.locked` MT-lock
markers and no content, so it does not change this triage; but its presence is why step 1 must
run on the dev box, and why "git is the real index" needs the qualifier that *part of git lives
only on production until that push lands*.

</details>

---

## L4 — Glossary export dry-run on prod (~10 min · writes: NOTHING)

Closes register item **C14 ②**. Read the real approved-term counts before deciding anything.

```bash
# on prod, repo root
node server/scripts/export-terminology.js --dry-run
```

⚠️ **Do NOT pass `--force` yet.** The export feeds the **render** path — approved terms are
substituted into published CNXML/HTML — so a bad write is reader-visible.

⚠️ **Corrected 2026-08-03 after the run — this paragraph predicted the wrong book.** It said the
first prod run was *expected* to refuse, on the strength of "the committed chemistry glossary
holds 617 approved terms from a producer whose DB table no longer exists". **Chemistry did not
refuse** (approved *grows* 617 → 709). **`lifraen-efnafraedi` refused** — and only because its
committed glossary is a **byte-identical copy of chemistry's** (same md5, same 445,395 bytes),
which is where the 617 figure actually lives.

⚠️ **The guard is a HALVING threshold, not an any-shrink threshold, and it is SHRINK-ONLY**
(`server/lib/glossaryExportDecision.js`, `SHRINK_RATIO = 0.5`). Two consequences the original
paragraph did not anticipate: chemistry sheds **408 terms** (1117 → 709, −36.5%) without a
refusal, and biology's **approved 0 → 13,561** is pure growth, so nothing checks it at all.
**Per-book `--force` positions now live in the register** (§C14 ②) — read them before deciding.

**Record:** the per-book approved-term counts it prints, and whether the guard refused.



### ✅ RESULTS — run on prod 2026-08-03, re-run the same day with identical output (exit 1)

| Book | Total terms | Approved | Guard | Verdict |
|---|---|---|---|---|
| `efnafraedi-2e` | 1117 → **709** (−408, −36.5%) | 617 → **709** | passed (under the 50% halving threshold) | would write |
| `liffraedi-2e` | 2262 → **13561** | **0 → 13561** | **not applicable — the guard is shrink-only** | would write |
| `lifraen-efnafraedi` | 1117 → **0** | 617 → 0 | **REFUSED** | blocked |
| `orverufraedi` | 0 → 0 | 0 → 0 | n/a | no-op |
| `stjornufraedi` | — | — | **REFUSED** — no `book_subject_mapping` row | blocked |
| `edlisfraedi-2e` | — | — | **never evaluated** | **silently absent** |

**🔴 The decisive finding is not in that table — it is in the DB behind it.**

`terminology_translations` holds **28,903 rows**, every one `status='approved'`,
`source='idordabankinn'`, `proposed_by = approved_by = 'idordabankinn-import'`, all stamped
inside a **26-minute window on 2026-03-25**. Subject split — `biology 13561 · mathematics 9137 ·
physics 5496 · chemistry 709` — matches the table above exactly.

⚠️ **CORRECTED 2026-08-04 — an earlier version of this section read that as provenance-laundering
and told you not to `--force` anything. That was wrong.** The bulk import is a deliberate,
sound decision: Íðorðabankinn is **canon**, and provenance is already recorded separately in
`source` + `idordabanki_id`. Nothing was disguised.

**What the bulk stamp actually broke is a *selector*.** `status` is the chooser between
**competing translations of one headword**, and **7,601 of 20,272 headwords have more than one**
(`atom` = *frumeind* **and** *atóm*, both approved). With every candidate approved,
`buildGlossaryMap`'s English-keyed `Map` **silently last-write-wins**, so database row order
decides which word reaches readers — and `formatGlossary` sends both, contradicting itself, to
the MT API. **→ register §C18** (the code defect) and **§C14 ②** (the data model).

**The chemistry row still means a producer swap**, not growth: 617 `merge-glossary.js` terms
replaced by 709 Íðorðabankinn ones, 408 dropped. That part stands.

⚠️ **Current position: the export leg is DISABLED on prod and the write has been reverted**
(register §C14 ②). Do not lift the containment until §C18's determinism guard lands —
`--force` is a red herring, because **the cron's export is unforced and runs every 2 hours.**

⚠️ **`--dry-run` is verifiably write-free** (`export-terminology.js:315` `continue`s before the
`writeFileSync` at `:324`; `:338` gates the heartbeat on `!dryRun`) — confirmed on prod: the
working tree and the absent heartbeat were unchanged after the run.

<details>
<summary>Raw output</summary>

```
[dry-run] efnafraedi-2e: would write terms 1117 → 709 (approved 617 → 709)
[dry-run] liffraedi-2e: would write terms 2262 → 13561 (approved 0 → 13561)
lifraen-efnafraedi: REFUSING to write — terms would fall 1117 → 0 (approved 617 → 0). The committed file may come from a different producer (tools/merge-glossary.js). Investigate, then pass --force if the shrink is intended.
[dry-run] orverufraedi: would write terms 0 → 0 (approved 0 → 0)
stjornufraedi: no book_subject_mapping row — refusing to export an unscoped, all-subjects glossary. Add a book_subject_mapping row for this book (see migration 032) before exporting.
```

</details>

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

### 📋 BASELINE — prod state read 2026-08-03 (read-only; nothing configured yet)

`GET /api/health` → **`degraded`**, with three not-ok checks. Two are expected; **one is new.**

| Check | State | Reading |
|---|---|---|
| `db` | ok — 5 users | |
| `migrations` | ok — 43 total | |
| `books` | ok — **6**: efnafraedi-2e, liffraedi-2e, orverufraedi, lifraen-efnafraedi, edlisfraedi-2e, **stjornufraedi** | astronomy is registered; it has no `book_subject_mapping` row, hence L4's loud refusal |
| `auth` | ok | |
| `offbox_backup` | **not ok** — `age_hours: null` | expected: this task is not started |
| `glossary_export` | **not ok** — `age_hours: null` | expected per C14 until a first successful prod export |
| `content_backup` | **🔴 not ok** — `age_hours: null`, `last_status: "no_changes"` | **NOT expected — see below** |

**🔴 The premise of this task is currently WORSE than it states, and that raises its urgency.**
This section says *"the git remote is the only off-box copy of editors' reviewed translations"*.
Measured on prod:

- **`git rev-list --count origin/main..HEAD` = 1, behind = 0.** One commit
  (`auto-backup: 2026-07-21 14:00`) has been stranded on production for **13 days**. Its
  `.last-content-backup` heartbeat file **does not exist at all**.
- It is carried forward by every `git pull --rebase`, so its **hash changes on each deploy**
  (authored `2026-07-21T14:00:02Z`, last committed `2026-08-03T10:41:26Z`) — which is why it
  cannot be found by hash in the dev repo and why it looks new while being two weeks old.
- **Two TMX files have never reached git at all** — `efnafraedi-2e-2026-06-{16,23}.tmx`,
  untracked since June, because `git-backup.sh`'s `PATHSPECS` has no `books/*/tm/` entry
  (register **§C3**, now with live evidence).

So right now there is **no current off-box copy of the content this task exists to protect**.
Mechanism, and why the alarm had not fired, → register **§C11(d)**.

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
    - **✅ HEADER HALF CHECKED 2026-08-03 (read-only `curl -sI`; the cookie half still needs a real login).** Both hosts are served by `nginx/1.24.0 (Ubuntu)` and both carry a full header set.
      **`ritstjorn.namsbokasafn.is`** → `302 → /login?redirect=%2F` for an anonymous request (correct), with Helmet's CSP, `strict-transport-security: max-age=31536000; includeSubDomains`, `x-frame-options: SAMEORIGIN`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `cross-origin-opener-policy: same-origin`, plus live rate limiting (`ratelimit-policy: 500;w=900`).
      **`namsbokasafn.is`** (reader) → `200`, `x-frame-options: DENY`, CSP with `frame-ancestors 'none'`, HSTS `max-age=63072000; includeSubDomains; preload`, `permissions-policy: camera=(), microphone=(), geolocation=(), payment=()`.
      ⚠️ **One thing to note, not a finding:** ritstjorn's CSP carries `script-src 'self' 'unsafe-inline'` (and `style-src` likewise) — pre-existing, and the reason the `§0.4a` stored-XSS E2E row matters.
      📌 **Incidental but useful:** the reader site's `last-modified` is **Sun, 26 Jul 2026 11:58:34 GMT** — independent confirmation that no content has reached readers since the 2026-07-26 sync, consistent with the ⏸️ hold at the top of this runbook.
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
