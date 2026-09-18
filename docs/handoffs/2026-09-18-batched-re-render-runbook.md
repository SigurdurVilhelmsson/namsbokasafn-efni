# Runbook — the ONE batched re-render (chemistry ch04/ch10/ch17 + organic ch03)

**BANNER — written 2026-09-18, for a fresh session.** This file owns the **procedure**. It owns
**no status**: whether this has been done, and what supersedes it, lives in the active register
(`docs/plans/2026-07-21-post-item17-followup-campaign.md`) ⏩ RESUME. **If they disagree, the
register wins.**

Read [CLAUDE.md § MANDATORY: Read Documentation Before Pipeline Operations] and
[docs/workflow/simplified-workflow.md](../workflow/simplified-workflow.md) before running anything
here. This is step 5b of the documented pipeline, nothing more.

---

## What this delivers, and what it cannot

Four merged render-side fixes have reached **no reader**: **§C148, §C146, §C154, §C149 ①**.
They land on overlapping chapters, so they go out in **ONE push** — separate pushes cost a
strand-and-deploy cycle each (see *Consequences* below).

🔴 **`cnxml-render` reads `03-translated/<track>/chNN/` — the INJECTOR's output, not `01-source`.**
So a re-render delivers **render-side** fixes only. An inject-side fix reaches a reader only after
a re-inject, and a re-inject can refuse modules whose committed MT predates the last
re-extraction (CLAUDE.md § `02-mt-output` is not a correctness reference). **The four fixes above
are render-side for these chapters, which is why a bare re-render suffices — and that was checked,
not assumed** (see the predicted delta, which was produced by rendering the real `03-translated`
input).

⚠️ **§C149 ② is NOT in this batch and must not be expected in it.** It is an extract-side fix; a
re-render does not re-extract, and chemistry m68764 is un-injectable pending ch10's re-MT. **Do not
read a clean re-render as "the ch10 exercises credit duplication is gone."** It is not.

---

## The commands

```bash
node tools/cnxml-render.js --book efnafraedi-2e      --chapter 4
node tools/cnxml-render.js --book efnafraedi-2e      --chapter 10
node tools/cnxml-render.js --book efnafraedi-2e      --chapter 17
node tools/cnxml-render.js --book lifraen-efnafraedi --chapter 3
```

⚠️ **`node tools/cnxml-render.js --help` CRASHES** with a raw `TypeError: The "path" argument must
be of type string. Received null`. That is CLAUDE.md's documented trap, **not** a broken tool or a
broken checkout. The flags are `--book`, `--chapter`, `--track`, `--lang`, `--module`.

🔴 **DO NOT PASS `--track`.** The CLI's `--track` **defaults to `mt-preview`**, which is the track
these pages live on. ⚠️ **CLAUDE.md states that the SERVER's `runRender` defaults to `faithful`** —
that is a *different* function, and inferring the CLI matches it is the trap. Passing
`--track faithful` here would render into a track that has **no pages for these chapters**:
chemistry's `faithful` covers **ch01 and ch03 only**, and organic has **no `faithful` track at
all**. Verify before believing this line:

```bash
ls books/efnafraedi-2e/05-publication/*/chapters/      # faithful: 01 03 only
ls books/lifraen-efnafraedi/05-publication/*/chapters/ # mt-preview only
```

---

## The predicted delta — check it, do not trust it

**Produced 2026-09-18 by rendering each chapter's actual `03-translated` input with `main` at
`65358be08`.** Both scripts are committed beside this file so they survive the session:

```bash
node test-results/c-batched-re-render-2026-09-18/published-page-census.mjs    # BEFORE and AFTER
node test-results/c-batched-re-render-2026-09-18/predicted-after-render.mjs   # the prediction
```

| chapter | html pages | figInP | rawCapInFig | paraInCell | raw `[[` |
|---|---|---|---|---|---|
| chemistry ch04 | 11 | 0 | 0 | **4** | 0 |
| chemistry ch10 | 12 | **1** | **1** | 0 | 0 |
| chemistry ch17 | 13 | 0 | 0 | **3** | 0 |
| organic ch03 | 13 | **4** | 0 | **1** | 0 |
| **TOTAL (before)** | **49** | **5** | **1** | **8** | **0** |
| **TOTAL (after — required)** | **49** | **0** | **0** | **0** | **0** |

▶ **The run is done when the census reads `0 0 0 0` AND the page count per chapter is still
`11 / 12 / 13 / 13`.** The page count is the **positive control**: without it, a run that deleted
pages reads as a perfect pass. A defect count of zero over an empty directory is zero.

✅ **The `figInP` total of 5 independently reproduces the register's "5 live published pages, not
1"** — two instruments, same answer, which is why that figure can be trusted.

⚠️ **`raw [[` is already 0 and must STAY 0.** §C145's gates are preventive here, not corrective;
a non-zero reading is a new defect, not an unfixed old one.

### Two counting traps already burned into those scripts

- 🔴 **The `figInP` predicate is NON-GREEDY.** A greedy `/<p[^>]*>[\s\S]*<figure/` matches a figure
  emitted **after** `</p>` and reports a **false RED on correctly-fixed output** — that instrument
  failure is what §C149 ① recorded. Do not "simplify" it.
- 🔴 **A bare `<caption` count over rendered HTML is MEANINGLESS** — `<table><caption>` is valid
  HTML that `renderTable` emits for every table label (161 corpus-wide). The script keys it on a
  `<figure>` parent, where the correct answer is 0.

---

## Where to run it — this is a real choice with opposite failure modes

**Pick one deliberately and state which you used.** The register's memory
`prod-content-push-stranding` exists for exactly this.

| | dev box | prod box |
|---|---|---|
| after render | commit + push `books/` to `main` | nothing committed until the 2-hourly cron |
| the hazard | **strands prod's content backup** until the next `deploy.sh` | the cron **never fetches first**, so if `main` has moved its push is **REJECTED** and the render sits uncommitted on prod |
| resolution | `./scripts/deploy.sh` re-bases the stranded commit | a `deploy.sh` (`git pull --rebase`) then a healthy cron tick |

🔴 **`main` MOVED on 2026-09-18 (PR #485 merged as `65358be08`), so the prod-side risk is live
right now.** If prod is rendered without first pulling, the next content tick is rejected.

▶ **Cleanest sequence given a deploy was just run: pull on prod → render on prod → `./scripts/deploy.sh`.**
That needs `sudo` and is **[USER]'s box** — an assistant cannot do it. **Ask; do not decide.**

⚠️ **Every clone needs `git config merge.ours.driver true` once** — `books/*/translation-errors.json`
is `merge=ours` and a pull will conflict on it otherwise (CLAUDE.md § durable). `deploy.sh`
re-asserts it; a manual dev pull does not.

---

## Consequences to expect, so none of them reads as a failure

1. **A `books/` push strands prod's content backup** — but **only if the cron has unpushed content
   at that moment** (the 2026-09-03 fast-forward is the worked counter-example). Watch
   `checks.content_backup` in `GET /api/health` or the `./scripts/deploy.sh` readout. ⚠️ **That
   check is `ok: !stale` and NOTHING ELSE**, so it lags reality in *both* directions and clears
   only on a healthy cron tick — never on a hand fix.
2. **A one-module render publishes the WHOLE chapter's referenced media** — `copyChapterImages`
   scans every `.html` in the track's chapter dir. A "publication hold" written in prose is not a
   code gate. → memory `render-publishes-whole-chapter-media`.
3. **Pages may be pruned and renamed.** A render that supersedes a page deletes it and records
   `old → new` in `books/<slug>/05-publication/<track>/slug-map.<track>.json`. **If that file gains
   entries, hand vefur the `from`/`to`/`moduleId` rows IMMEDIATELY** — vefur's redirect table is
   hardcoded (`src/lib/data/sectionRedirects.ts`) and its entries are inert until the target is
   published, so **landing the redirect BEFORE the sync is the only ordering with no 404 window.**
   Do not wait for the sync.
4. **`05-publication/` is a WRITE directory but only via tooling** — never hand-edit a published
   page to "fix" a defect (CLAUDE.md § MANDATORY).

---

## Verification — what to run, and what NOT to

**Run:**
- `node test-results/c-batched-re-render-2026-09-18/published-page-census.mjs` before and after;
  require `5 1 8 0 → 0 0 0 0` with page counts unchanged.
- `git diff --stat books/*/05-publication/` — read which pages actually changed; a chapter you did
  not render appearing here means the render was wider than intended.
- `npm test` if any tool changed. It did not, if you only ran the four commands above.

🔴 **DO NOT run `tools/render-oracle-check.js` or `tools/source-roundtrip-check.js` on this
output.** Both read `01-source`, extract, inject the module's **own English** and render **in
memory**; neither reads `03-translated` or `05-publication` at all, by design (CLAUDE.md § the free
source-anchored checks). **They test the pipeline CODE on the source and structurally cannot see a
defect in a prepared page.** Reaching for them here produces a confident, meaningless pass.

---

## Where it stops

⏹ **The loop stops at PREPARED. Only [USER] syncs to the reader site, timed with classroom use,
and a sync selects BOOKS, not chapters.** → [`docs/decisions/2026-09-16-chapters-prepared-sync-timed-by-classroom-use.md`](../decisions/2026-09-16-chapters-prepared-sync-timed-by-classroom-use.md)

**Before chemistry's sync** (carried forward, unchanged): vefur's 2 ch04 redirect rows →
[`2026-09-17-vefur-chemistry-ch03-ch04-redirects.md`](2026-09-17-vefur-chemistry-ch03-ch04-redirects.md);
the copper caption on faithful 3-1 stays English (§C148 reach caveat); ledger M5's two MT errors if
[USER] wants them fixed first.

⚠️ **Verifying a vefur deploy: route status codes are MEANINGLESS.** The reader site is a
client-rendered SPA with an any-path fallback — a real page, a deleted page and nonsense all return
**200** with the same ~2,940-byte shell. **Fetch `/content/<book>/chapters/<NN>/<file>.html`,**
never the page URL, and **pair it with a control you expect to still be broken** — a set of clean
results is indistinguishable from fetching something empty.
