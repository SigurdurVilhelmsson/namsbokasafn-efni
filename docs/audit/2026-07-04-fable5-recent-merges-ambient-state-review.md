<!--
Fable-5 adversarial review — RUN 2 (target #2: recent-merges ambient-state re-review)
Date: 2026-07-04
Model: claude-fable-5 (all agents). Workflow wf_8bbd446a-0d1.
Scope: biology-foundation (#184-#200) + hardening (#208-#213) merges, base ab2d3f25..36968984
  (84 code files, ~4900 insertions; excludes already-opus-reviewed chemistry #215-#228).
Lens: hard-to-detect ambient-state correctness (the #210/#213 class: cwd/global/fail-open).
Method: 5 finders → dedup (9→8) → 3 skeptics/finding refute-by-default → 5 survivors → synth.
Stats: 30 agents, 0 errors, 1.77M subagent tokens. Verdicts adversarially verified.
Provenance memo: memory fable5-review-strategy.md (RUN 2).
-->

# Fable-5 Adversarial Review — Final Report
**Scope:** biology-foundation + hardening merges, hunting ambient-state correctness bugs (the #210/#213 class). Each finding below survived 3-skeptic adversarial verification.

## Executive summary

Five findings survived verification: four CONFIRMED (0/3 skeptics refuted, most with live repros) and one PLAUSIBLE (1/3 refuted). The most important is **Finding 1**: `cnxml-render.js` keeps `BOOK_SLUG`, `TITLE_TRANSLATIONS`, and `BOOKS_DIR` as module globals set only by the CLI `main()`, so the server's in-process live preview silently renders *every* book as chemistry — a preview/published divergence reproducible **today** on m68700 (the project's one faithful module) and guaranteed to break biology previews the moment onboarding starts. All skeptics agreed severity is **medium, not high** — published HTML is unaffected because the publish path spawns the CLI — but it is silent, prod-server-only, structurally invisible to the test suite, and is the exact residue the #213 sweep missed inside `cnxml-render.js` itself.

Findings 3 and 4 are the two concrete legs of Finding 1 (independently verified with their own repros); Finding 2 is an unrelated deploy-wedge with a near-certain WS5 trigger.

---

## 1. Server live preview renders every book with stale chemistry globals — `BOOK_SLUG`, `TITLE_TRANSLATIONS`, `BOOKS_DIR` never set in-process

- **File:** `tools/cnxml-render.js:424` (per-call options block; globals at lines 79, 119–120, set only in `main()` at 3328–3335)
- **Verdict:** CONFIRMED (0/3 refuted; two skeptics reproduced it empirically)
- **Severity:** medium (claimed high; all three skeptics downgraded — preview-only, published output correct)

**Failure (prod only):** `renderService.js` dynamic-imports `cnxml-render.js` once and reuses it; `main()` never runs under import (argv guard at ~4128). The D6/D4 per-call block wires only `BOOK_CONFIG`/`NOTE_TYPE_LABELS`/`EMBED_MAP`. Three consequences:
1. `TITLE_TRANSLATIONS` stays `{}` → `translateTitle()` is a no-op in every server preview. **Reproducible today:** faithful m68700 has 8 `<title>Answer:</title>`; published HTML shows `Svar:` ×8, server preview shows `Answer:` — this can mislead editors into "fixing" segment text.
2. `BOOK_SLUG` stays `'efnafraedi-2e'` → all non-chemistry previews emit `/content/efnafraedi-2e/...` image srcs and `/efnafraedi-2e/kafli/...` cross-module hrefs (lines 482, 1236, 1298). liffraedi-2e/edlisfraedi-2e/lifraen/orverufraedi all already have mt-preview modules with `<image>`.
3. `BOOKS_DIR` stays `'books/efnafraedi-2e'` — stale **and** cwd-relative (see Finding 3).

**Why tests can't catch it:** each test run is a fresh process and calls `_loadBookConfigForTest()`, which sets exactly the globals the server path never sets.

**Repro:** Render m68700 in-process from `cwd=server/` with renderService's exact options → `Answer:` ×8; the committed `05-publication` HTML for the same module has `Svar:` ×8. Or open live preview for any liffraedi-2e mt-preview module with a figure and inspect the `<img src>`.

**Fix:** Add `options.bookSlug` and wire `TITLE_TRANSLATIONS` from `options.bookConfig.titleTranslations` in the same per-call block D6 added — or better, thread all three through `context` instead of module globals. Have `renderService.js` pass the slug it already knows.

---

## 2. `residue-report.<track>.json` (A2, #184) missing both deploy protections that `translation-errors.json` got — WS5 will wedge prod's `git pull --rebase`

- **File:** `scripts/git-backup.sh:64` (also `.gitattributes`; writer at `tools/cnxml-inject.js:3789`)
- **Verdict:** CONFIRMED (0/3 refuted; one claimed path softened by all three skeptics — noted below)
- **Severity:** medium

**Failure (prod deploy/cron interaction only — no unit test can see it):** `cnxml-inject.js:3789` unconditionally writes `books/<book>/residue-report.<track>.json` per run; the mt-preview one is already committed. The repo fixed this exact class twice for `translation-errors.json` (#95 staged it in git-backup.sh, #162 added `merge=ours`), but the residue report — added after both fixes — got neither.

- **Softened path (skeptic correction, honest note):** a dirty *tracked* report does not block the pull outright — `deploy.sh` stashes tracked changes first. Worst case is a stash-pop conflict, whose leftover conflict markers then trigger a confirmed aggravator: inject's manifest read resets to `{track}` on any JSON parse error (`cnxml-inject.js:~3604`), silently discarding all other chapters' residue records.
- **Unmitigated path:** prod "Vista + Birta" faithful injects create `residue-report.faithful.json` **untracked** on prod (`git stash push` without `-u` ignores it; the cron never stages it). The moment dev commits that path — the planned WS5 re-inject will produce it, and the committed mt-preview twin proves these get committed — `git pull --rebase` fails with "untracked working tree files would be overwritten" and `set -euo pipefail` aborts the deploy before `npm ci`/restart.

**Repro:** `grep residue scripts/git-backup.sh .gitattributes` → no hits, while `git ls-files 'books/*residue-report*'` shows the tracked file. Simulate: on a prod-like clone, create an untracked `residue-report.faithful.json`, commit the same path upstream, run `deploy.sh`'s pull → refused.

**Fix:** Add `books/*/residue-report.*.json` to git-backup.sh's `git add` list and to `.gitattributes` `merge=ours`, mirroring `translation-errors.json`. Separately consider making inject's manifest parse-error path fail loud instead of resetting to `{track}`.

---

## 3. Live preview silently drops os-embed exercise content — `resolveOsEmbed` reads cwd-relative, chemistry-hardcoded `BOOKS_DIR` (unswept #213 sibling)

- **File:** `tools/cnxml-render.js:148` (`BOOKS_DIR` default at line 119; silent fallthrough at ~1711)
- **Verdict:** CONFIRMED (0/3 refuted; all three reproduced it live)
- **Severity:** medium — the concrete `BOOKS_DIR` leg of Finding 1, with its own repro

**Failure (prod only; fires today):** In server context (`cwd=server/`), `resolveOsEmbed` resolves `path.join(BOOKS_DIR, '01-source', 'exercises', ...)` — wrong cwd **and** wrong book — `existsSync` misses, returns `null`, and `buildExercise` (line 1673) silently falls through: the preview renders without cached questions/solutions, emitting the raw unresolved `<link class="os-embed" url="#exercise/..."/>` (invisible in a browser). Doubly wrong: even from repo root, efnafraedi-2e has no `01-source/exercises/` at all. Fires today for lifraen-efnafraedi (1,961 cached exercise JSONs, ch03 mt-preview modules with `#exercise/` refs) and will fire for biology's identical os-embed format. CLI render from repo root is correct, masking the divergence — verified: in-process render of m00033/m00034 yields **0** `exercise-part` divs vs 10 in the committed published HTML.

**Repro:** From `cwd=server/`, call `renderCnxmlToHtml` with renderService's exact options on `books/lifraen-efnafraedi/03-translated/mt-preview/ch03/m00034.cnxml`; diff against `node tools/cnxml-render.js --book lifraen-efnafraedi --chapter 3` output — preview lacks all exercise stems.

**Fix:** Resolve the exercises dir from the render options' book slug against an intrinsic root (`import.meta.url`), same pattern as `tools/lib/embed-mapping.js`; take the book from options, not the module global. Also add a warning log on the null-fallthrough so it can never be silent again.

---

## 4. Non-chemistry previews get chemistry image srcs and cross-module hrefs (`BOOK_SLUG`) plus untranslated headings (`TITLE_TRANSLATIONS`)

- **File:** `tools/cnxml-render.js:120`
- **Verdict:** CONFIRMED (0/3 refuted)
- **Severity:** medium-to-low — the `BOOK_SLUG`/`TITLE_TRANSLATIONS` legs of Finding 1; one skeptic argued low because the preview origin serves no `/content` route at all, so images 404 in preview for chemistry too and the wrong slug swaps one dead URL for another. The wrong-book *hrefs* and the heading divergence remain genuine.

**Failure (prod only):** Detailed under Finding 1. Reachable now — the preview route (`segment-editor.js:1365`) accepts all five books and four non-chemistry books already have `03-translated/mt-preview` content with images.

**Repro / Fix:** Same as Finding 1 (`options.bookSlug` + `titleTranslations` wiring). Fixing Finding 1 closes this and Finding 3 together — treat 1/3/4 as **one patch**.

---

## 5. `backfill-provenance.js` resolves `books/` against `process.cwd()` and reports success on a missing directory — silent no-op from any cwd but repo root

- **File:** `tools/backfill-provenance.js:46` (fail-open guard at line ~19)
- **Verdict:** PLAUSIBLE (1/3 skeptics refuted)
- **Severity:** low

**Failure:** `requireBook()` validates against the intrinsic `REPO_ROOT`, but `bookDir` is built cwd-relative — so from `server/` (or a cron hook) validation passes, the `existsSync(mtRoot)` guard fail-opens, and the tool prints `stamped 0, skipped 0` as success. A user sent here by inject's fail-closed "No provenance … Run: node tools/backfill-provenance.js" error is told the backfill worked while inject keeps refusing. **The surviving skeptic doubt:** the tool is CLI-only (not server-imported), all documented commands run from repo root, and a user who reached inject's error message was necessarily *at* repo root (inject's own cwd-relative reads would have failed earlier) — so the mixed-cwd loop may be contrived. Downstream stays fail-closed either way; no data corruption possible.

**Repro:** `cd server && node ../tools/backfill-provenance.js --book efnafraedi-2e` → prints `stamped 0, skipped 0` (a repo-root run reports skipped ≥149).

**Fix:** Cheap and worth doing during the same sweep: resolve `bookDir` against the same `REPO_ROOT` parseArgs uses, and make `backfillBook` throw (or warn loudly) when `mtRoot` is absent.

---

## Suggested action order

1. **One patch for Findings 1+3+4:** thread `bookSlug`, `titleTranslations`, and the exercises dir through `renderCnxmlToHtml` options / context; kill the last three CLI-only module globals. Add a regression test that renders in-process *without* calling `_loadBookConfigForTest()`.
2. **One patch for Finding 2** (two lines: git-backup.sh add-list + `.gitattributes`) — **land before WS5 re-inject**, which is the concrete trigger.
3. **Finding 5** as a drive-by in either patch.
4. Sweep check: `grep -rn "process.cwd()\|path.join('books'" tools/ server/` — Findings 1/3/5 show the #213 sweep covered `tools/lib/` but not `tools/*.js` module-level state; worth one pass over the remaining top-level tools.
