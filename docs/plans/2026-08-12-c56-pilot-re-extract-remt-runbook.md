# §C56 pilot — re-extract + re-MT runbook (2 chapters, 2 books)

**Date:** 2026-08-12 · **For:** whoever runs the pilot.
**Register item:** §C56, in [`2026-07-21-post-item17-followup-campaign.md`](2026-07-21-post-item17-followup-campaign.md) — **the register owns status; this runbook owns the procedure.**
**Predecessor:** [`2026-07-29-c16-clean-break-runbook.md`](2026-07-29-c16-clean-break-runbook.md) — **still valid, not superseded.** This document reuses its Gate 0 and its scripts; it does not replace them.
**Related:** [`2026-07-06-re-mt-vs-editor-fixes-and-openstax-remerge.md`](../decisions/2026-07-06-re-mt-vs-editor-fixes-and-openstax-remerge.md) · §C16 · §C53

⚠️ Steps are ordered. Do not reorder. Each gate is verifiable — **verify it, do not assume it.**
⚠️ **Run every command from the repo root.**
⚠️ **Never glob a module id across `books/`** — `books/__e2e-fixture__/` holds files at the same relative paths with the same module ids.

---

## Why this document exists, and what it adds

The 2026-07-29 runbook is sound and its detail is hard-won. It is **not sufficient for §C56** for three measured reasons:

1. 🔴 **It predates the hand-repair finding by one day.** It is dated 2026-07-29; project memory `mt-output-hand-repairs` was written **2026-07-30**, *"while assessing a full re-extract/re-MT of every book"*, and records that the premise in use then — *"the only editorial work to preserve is two chemistry ch03 modules"* — **turned out to be incomplete.** Gate A below is the missing step.
2. **It is chemistry-only.** Its own warning: *"Every destructive step is scoped to `books/efnafraedi-2e/`."* §C56 is whole-corpus.
3. **It has no pilot mode.** It is a single all-at-once night run.

**What this runbook does NOT change:** the standing safety gates, the export/re-attach scripts, and the lock semantics. Those are delegated, not rewritten.

---

## Gate A — the hand-repair triage · **NEW, HARD GATE, blocks everything**

**The problem, measured 2026-08-12.** `books/*/02-mt-output/` is marked READ-ONLY in CLAUDE.md, **yet it holds hand corrections that exist in no faithful file and under no `.locked` marker.** A re-MT reverts them silently.

**The machine-readable signal is not an index.** `manualCorrections` appears in **exactly one** provenance file across the whole corpus — measured — while **43 commits** touch `02-mt-output`, **23 of them with `fix`/`correct`/`repair`/`manual` subjects:

| book | commits | with repair-shaped subject |
|---|---|---|
| efnafraedi-2e | 23 | 15 |
| liffraedi-2e | 7 | 3 |
| orverufraedi | 6 | 3 |
| lifraen-efnafraedi | 4 | 1 |
| edlisfraedi-2e | 3 | 1 |

**git is the real index.** A `books/*/` glob returns nothing here — iterate the books explicitly:

```bash
for b in efnafraedi-2e liffraedi-2e edlisfraedi-2e lifraen-efnafraedi orverufraedi; do
  echo "===== $b"; git log --oneline --no-merges -- "books/$b/02-mt-output/"
done
grep -rl "manualCorrections" books/*/02-mt-output --include='*-provenance.json'
```

- [ ] **A1.** Every repair-shaped commit classified: **book · module · what changed · did it rename a published file.**
- [ ] **A2.** The reader-visible subset listed separately. **One is already known:** `4e5be912` (2026-07-26) corrected `liffraedi-2e` ch03 `m66441` *Fitusýrur → Lípíð* directly in `02-mt-output`; the re-render renamed the published page `3-3-fitusyrur.html` → `3-3-lipid.html`. **That is a live reader URL** — reverting it flips the URL back and re-triggers C9 prune-on-rename.
- [ ] **A3.** For every repair inside a **pilot** chapter: either re-apply it after the run, or exclude that module. **Record which.**
- [ ] **A4.** Triage output committed as evidence before any run.

⚠️ **The generalisable shape, from the memory:** *"a convention adopted once, never enforced, and later trusted as an index. The signal looks authoritative precisely because it exists at all."*

## Gate B — the lock inventory · **NEW**

**8 `.locked` files exist, not 4** — measured 2026-08-12. All carry `reason: "backfill-db-segment-edits"`, locked 2026-07-21:

```
efnafraedi-2e/ch01  m68663  m68664  m68667  m68674
efnafraedi-2e/ch03  m68699  m68700
efnafraedi-2e/ch05  chapter-metadata
liffraedi-2e/ch03   m66443
```

The often-quoted "only 4" is **locked *and* faithful-reviewed** — `03-faithful-translation` holds exactly four files (`m68663 m68664 m68699 m68700`). **Four locks therefore protect something with no faithful file.**

- [ ] **B1.** Established what the four faithful-less locks protect (DB segment edits? a hand repair? nothing left?).
- [ ] **B2.** Confirmed no pilot chapter contains a `.locked` module. *(The recommended pilot chapters contain none — see Appendix A.)*

✅ **Locks are enforced absolutely and beat `--force`.** `mtRunDecision` (`tools/api-translate.js`) returns `'locked-skip'` **before** it considers `force`, with the comment *"absolute: editing has begun, never clobber"*. This is a real mechanism, not a convention.

## Gate C — acceptance criteria · **NEW, and the point of a pilot**

**Write these down before running, so the pilot can fail.** A pilot with no falsifiable prediction is a rehearsal.

- [ ] **C1.** Baseline captured for every criterion below, on the pilot chapters, **before** anything is regenerated.
- [ ] **C2.** Criteria agreed:

| # | Criterion | How measured |
|---|---|---|
| 1 | **zero** `{{i}} {{b}} {{term}} {{fn}}` in regenerated output | `grep -aoE '\{\{/?(i\|b\|term\|fn)\}\}'` — baseline is non-zero, see Appendix A |
| 2 | **zero** malformed `[[type: ` markers | `grep -rao '\[\[[a-zA-Z]\+: '` |
| 3 | per-type marker counts preserved EN→IS | **`bracketMarkerDelta`** from `tools/api-translate.js` — already live and tested; **do not write a new checker** |
| 4 | inject + render succeed | tool exit codes |
| 5 | `fidelity:render` no worse than baseline | `npm run fidelity:render` |
| 6 | every published-file rename accounted for | slug map from predecessor Step 2 (C9 contract) |
| 7 | cost within estimate | `--dry-run` vs actual |

🔴 **C3 — the falsifiable prediction that makes this an experiment.** `edlisfraedi-2e` ch04 `m42075` carries **4 of §C53's 5 malformed markers**. §C53's design assumes a re-MT regenerates them away. **If they survive, §C53's allowlist decision changes** — and a surviving defect is more informative than a clean pass.
- [ ] Prediction recorded before the run: *"m42075's four `[[b: ` markers are gone afterwards."*

## Gate D — standing safety gates · **delegated to the predecessor**

Run **[`2026-07-29-c16-clean-break-runbook.md`](2026-07-29-c16-clean-break-runbook.md) Gate 0 verbatim**, substituting the pilot's book scope. Do not paraphrase it here — it carries traps that matter, notably that `sqlite3` **creates** a database rather than failing on a wrong path (measured: an empty path exits 0 and writes a 4096-byte backup-shaped file containing nothing).

- [ ] `$DB` resolved via `node -e "console.log(require('./server/lib/dbPath.js')())"` and confirmed to exist at a non-trivial size
- [ ] Off-box DB backup taken
- [ ] **Editorial server stopped** — confirm the process is down, not merely idle
- [ ] **`git-backup.sh` cron paused on prod** — it commits `books/` every 2h and would commit a half-migrated tree
- [ ] `VACUUM INTO` snapshot taken, destination size sanity-checked
- [ ] **Slug map captured** (predecessor Step 2) **before** anything is cleared — C9 needs old→new to serve redirects, and the old filename ceases to exist the moment we prune

## Step 1 — cost check

```bash
node tools/api-translate.js --book efnafraedi-2e --dry-run
node tools/api-translate.js --book edlisfraedi-2e --dry-run
```

⚠️ **`tools/lib/parseArgs.js` silently drops unknown flags** — a misremembered flag is a no-op, not an error. Confirm any flag you use appears in that tool's `--help` before relying on it. **There is no `--output-dir`.**

- [ ] Pilot cost recorded: ______________ ISK *(whole-corpus estimate for context: ~4.93M chars ≈ ~49,300 ISK, 72% chemistry — not a `--dry-run` figure)*

## Step 2 — re-extract the pilot chapters

```bash
node tools/cnxml-extract.js --book efnafraedi-2e  --chapter 20
node tools/cnxml-extract.js --book edlisfraedi-2e --chapter 4
```

⚠️ **These are FLAGS, not positionals** — `--book`/`--chapter`. The positional form fails.
✅ **`01-source` is not a blocker**: extraction *reads* source and writes `02-for-mt`/`02-structure`. The no-redownload rule governs *replacing* source, not reading it.

- [ ] Diff of `02-for-mt` reviewed — **expect segment-boundary changes** (measured on one module previously: 51 insertions / 108 deletions)

## Step 3 — re-MT

```bash
node tools/api-translate.js --book efnafraedi-2e  --chapter 20
node tools/api-translate.js --book edlisfraedi-2e --chapter 4
```

- [ ] Any `.locked` module reported as `locked-skip` — **expected to be none in the pilot**
- [ ] Marker delta reported by `bracketMarkerDelta` reviewed per module

## Step 4 — inject + render

```bash
node tools/cnxml-inject.js --book <book> --chapter <n>
node tools/cnxml-render.js --book <book> --chapter <n>
```

- [ ] Both succeed
- [ ] `npm run fidelity:render` compared against the Gate C baseline

## Step 5 — evaluate

- [ ] All seven Gate C criteria evaluated and recorded — **including failures**
- [ ] **C3's prediction resolved**: did `m42075`'s four malformed markers survive? ______
- [ ] Result written to §C56 in the register

## Step 6 — decide

- [ ] **[LEAD]** Proceed to the full run, adjust, or stop
- [ ] If proceeding: the full run needs Gate A completed for **all five books**, not just the pilot's two
- [ ] **§C53's corpus-check baseline is taken from the post-migration corpus** — if it comes back clean, no allowlist is built

## Afterwards

- [ ] Restart the editorial server; unpause `git-backup.sh`
- [ ] Re-establish MT edit-locks where appropriate (predecessor Step 5a)
- [ ] **§C53's save gate should ship before editing resumes at volume** — editors will be working on regenerated text

---

# Appendix A — pilot chapter selection, and why

Selected **2026-08-12** on three criteria: contains the thing being eliminated, contains no protected edits, and is small enough for fast feedback.

| Chapter | Modules | Legacy markers | `.locked` | Repair-shaped commits | Why |
|---|---|---|---|---|---|
| **`efnafraedi-2e` ch20** | 6 | **80** | none | 2 | Chemistry is 72% of the eventual bill — pilot where the money is. Lowest repair exposure of any chemistry chapter. |
| **`edlisfraedi-2e` ch04** | 10 | **80** | none | 1 | 🔴 Holds **4 of §C53's 5 malformed markers** (`m42075`), making Gate C3 falsifiable. |

**Pilot total: 16 modules** — `efnafraedi-2e` ch20 (`chapter-metadata`, `m68845`–`m68849`) and `edlisfraedi-2e` ch04 (`chapter-metadata`, `m42069`, `m42073`, `m42074`, **`m42075`**, `m42076`, `m42129`, `m42130`, `m42132`, `m42137`). All counts measured 2026-08-12; **an earlier draft of this table said ch04 held 1 module — it holds 10**, and the number came from an inference rather than a measurement.

**Both carry legacy markers**, so elimination is demonstrable — a pilot on a clean chapter proves nothing about the migration's purpose. **Neither contains a locked module**, so the protected edits stay out of scope entirely rather than needing careful handling.

⚠️ **Chemistry ch01 was rejected despite having no legacy markers**: it holds four `.locked` modules.
⚠️ **`liffraedi-2e` ch03 was rejected**: it holds a lock *and* the known reader-visible hand repair (`m66441`).

# Appendix B — what this pilot does NOT establish

- **Nothing about the four protected modules.** They are excluded by design; their hand re-application is a separate, later step.
- **Nothing about books not in the pilot.** `lifraen-efnafraedi` and `orverufraedi` are untouched.
- **Nothing about `{{term}}`/`{{fn}}` in the four non-chemistry books** unless the pilot chapters happen to carry them — check before claiming corpus-wide elimination.
- **Nothing about the `lb`/`rb` imbalance.** §C53 §2.4 predicts it **survives** any re-extract, being a source-content asymmetry transcribed 1:1. `lifraen-efnafraedi` ch12 is not in the pilot; that prediction stays untested here.
