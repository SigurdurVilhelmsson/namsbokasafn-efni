# §C9 whole-branch adversarial review — frozen evidence

**Frozen 2026-08-18.** Run against `fix/c9-prune-on-rename` at `c5f16775`, before the fix
wave. 31 agents · 6 independent lenses · 26 findings → 12 verified by 2 adversarial verifiers
each → 8 survived, 4 refuted. Verdict: MERGE WITH FIXES. All four actioned findings were
fixed and independently re-verified; the branch merged as `d3607c50` (PR #404).

**This is EVIDENCE, not status.** Per CLAUDE.md § One source of truth, where this disagrees
with the active register, the register wins.

---

# Whole-branch review — `fix/c9-prune-on-rename` (c9b2aeaf..c5f16775)

## 1. VERDICT — **MERGE WITH FIXES**

The core mechanism is sound and I verified it rather than trusting the ledger: the snapshot at `cnxml-render.js:3263` genuinely precedes the sweep at `:3269`, the reconcile at `:4059` sits *below* the `catch (renderErr)` that rethrows (so a failed render deletes nothing by control flow, not by a flag), `renderedModules` is populated only at the module write and never at the rollup write, and the committed `slug-map.json` is byte-identical to what `writeSlugMap` emits. Two things stop this from being MERGE AS IS. **(a)** The prune loop never asks "is this filename one this pass just wrote?" — I reproduced a full-chapter render in which it deletes a page rendered thirty seconds earlier and then redirects that page's URL onto a *different module's* content. Latent today (0 corpus instances) but the failure is silent content substitution in the legally load-bearing publication tree, and the guard is two lines which I verified do not suppress the real ch10 prune. **(b)** The branch's own repair commit left 8 subject-index entries pointing at the page it deleted; they go dead on the next manual sync, and one command clears them plus 5 pre-existing ones. Everything else is contract precision that must be settled *before* the vefur consumer PR is written against the current shape, plus one logged durability item.

---

## 2. IMPORTANT FINDINGS

*(No Critical findings. Nothing here can corrupt `01-source`, escape the chapter directory, or run unattended.)*

### F1 — The prune deletes a page this same render just wrote, and redirects the old URL onto another module's content
**File:** `tools/lib/publication-reconcile.js:80-107` · **Refuted by 0 of 2 verifiers** (one graded Important, one Minor).

The loop tests only `renderedModules.get(moduleId)` — "did *this module* move?". It never tests whether `filename` is a member of `renderedModules.values()`, i.e. the set of files this pass wrote. That set is already in hand.

**Concrete failure, reproduced by me against the branch's own module** (`scratchpad/final/probe.mjs`, /tmp dirs, renderer never run):

```
snapshot        [10-5-alpha.html→mX, 10-6-alpha.html→mY]
renderedModules {mX→10-6-alpha.html, mY→10-7-alpha.html}
→ files after:  ['10-7-alpha.html']
→ mX's FRESH page 10-6-alpha.html exists: false
→ map: chapters/10/10-5-alpha.html → {to: chapters/10/10-7-alpha.html, moduleId: "mY"}
```

Both verifiers stopped at "a page is deleted". It is worse than that, and this is the strongest severity argument: mX's page is gone from disk, mX's old URL now redirects to **mY's page** (a live 200 serving the wrong section), and the record carries `moduleId: mY` under mX's key, so the map cannot even reconstruct what happened. That is silent content **substitution**, not a broken link. A second consequence: the surviving map entries can name a file this same call unlinked, breaking `slug-map.js:5-7`'s own headline contract.

**Reachability, stated honestly.** Needs a filename handed between two modules in one pass: module B's new `${chapter}-${section}-${slug}.html` equalling module A's pre-render filename. Measured: 0 of 31 published chapter dirs currently have two modules sharing a slug. But both halves are independently live — this branch's own ch10 repair moved section indices between modules (m68768 2→3 beside m68769 3→4), and `slugify`'s 50-char truncation already collapses two real ch18-family titles to an identical slug the moment one gains a word. One verifier's "the fixed `introduction` slug needs no collision" route is **not** supported and I am not carrying it: `documentClass` derives from immutable `01-source` and never differed across 3,355 structure vintages.

**Why the Minor vote is overruled:** the branch already paid a line and a test for the *identical* cross-module premise at Ruling 5 (`delete map.renames[to]`, `slug-map.js:74`) for the strictly lesser consequence of a stale map entry. Leaving the greater consequence — deleting a live page — unguarded on the same premise is not a coherent risk position.

**Smallest correct fix (verified):**
```js
const writtenThisPass = new Set(renderedModules.values());   // above the loop
…
if (!current || current === filename) continue;
if (writtenThisPass.has(filename)) continue;                 // skips unlink AND record
```
The `continue` must precede **both** the `unlinkSync` *and* the `pruned.push` — guarding only the unlink still records `old → new` while `old` is a live page belonging to another module, redirecting a live URL away from its current owner. I patched a scratch copy and ran both arms:

```
HANDOFF (must prune nothing extra) | pruned: 10-5-alpha→10-6-alpha | files: 10-6-alpha.html,10-7-alpha.html
CONTROL ch10 repair (must still prune) | pruned: 10-5-fast-astand-efnis→10-5-fastur-efnishamur | files: 10-5-fastur-efnishamur.html
```
mX's page survives, mX's own genuine rename is still recorded and correctly attributed, and the real ch10 case is untouched. No legitimate prune can be suppressed — a same-module rewrite is already caught by `current === filename`. Bonus: it also removes the `readdirSync`-order dependence of `pruned` (a carried-unverified finding), because with no this-pass filename prunable, two prunes can no longer interlock. Pin it with a unit test in `publication-reconcile.test.js` whose control is the ch10 case still pruning.

### F2 — The ch10 repair left 8 dead links in the subject index, in the book it was repairing
**File:** `books/efnafraedi-2e/05-publication/mt-preview/index.json` · Filed three times across two lenses; **2 of 6 verifier votes refuted**, both on attribution rather than existence.

My own census (python `json.load`, resolving `chapters/%02d/<sectionSlug>.html`): 763 entries, 750 resolve, **13 dangle in exactly two groups** — `10-5-fast-astand-efnis` ×8 (this branch) and `20-3-aldehyd-ketonar-…` ×5 (pre-existing, §C56). 0 entries carry the new slug; control `10-4-fasarit` = 4. `ls chapters/10/ | grep 10-5` returns only `10-5-fastur-efnishamur.html`. `index.json` reaches the destination verbatim (not in `SYNC_EXCLUDES`), and `atridiordasskra/+page.svelte`'s `sectionHref` turns `sectionSlug` straight into an `<a href>`; the section route 404s on a slug the regenerated toc no longer has. Nothing regenerates it: the only file outside `docs/` naming `generate-index` besides the tool and its two tests is `LICENSE` (control: the same census finds `generate-tm` mentions elsewhere).

**Why the refutations are overruled:** both argue the mechanism predates the branch (true — ch20 proves it) and that spec §10 already accepts "the old ch10 URL 404s". But §10's accepted trade is about *inbound* links a reader already holds; these are links the shipped site generates about itself, from a file sitting in the very directory the reconciler pruned. The 8 exist because of this branch's data commit.

**Fix (in-branch, one command):** `node tools/generate-index.js --book efnafraedi-2e --track mt-preview --toc <ABSOLUTE path to a regenerated toc.json>` and commit. Two caveats: `--toc`'s only default candidate is the **cwd-relative** `../namsbokasafn-vefur/static/content/<book>/toc.json` (`generate-index.js:203-205`) — pass it absolutely, per CLAUDE.md's path-resolution rule; and vefur's current toc still holds **two** `10.5` rows with `buildTocMap` last-write-wins, so today's correct result is a coincidence of row order. **Diff the regenerated file and confirm all 8 moved before committing.** Doing it here also clears ch20's 5, taking the book 13 → 0. Prefer this to "log a mandatory pre-sync step": an unenforced step recorded in prose is precisely the class CLAUDE.md § One source of truth legislates against, and nothing in the tooling gates it.

### F3 — The delivered contract is false about the *merged* destination, in two ways
**Files:** `tools/lib/slug-map.js:5-12` (the `CONTRACT` string that physically ships inside the JSON), spec §5:103 and §10:165, CLAUDE.md's new §C9 bullet. Two surviving findings (0/2 and 1/2 refuted) plus one cross-track finding (1/2 refuted), folded — they are one defect in the handoff.

Both statements are true within one efni track and false at the destination the consumer actually reads:

1. **"one file per book per track, at a fixed path."** Vefur flattens both tracks into `static/content/<book>/`. I read the overlay filter (`sync-content.js:335-364`): a non-directory falls through four branches — `isExcludedArtifact`, `ROLLUPS_COMPLETE_MARKER`, `^chapters/(\d{2})/[^/]+\.html$`, and `glossary.json|index.json` — and `slug-map.json` matches none, hitting `return true`, copied with `force: true` over the baseline's copy. Two verifiers reproduced this by running the real sync: the faithful map wins wholesale and `glossary.json`/`index.json` were correctly *held back* in the same run — the discriminating control proving the overlay is selective and this file is the one track-root name with no branch. Reachability is not exotic: `pipelineService.runRender` defaults to `track = 'faithful'` (`:234`) and `routes/pipeline.js:60` returns `track || 'faithful'`, so the editor's ordinary republish is the colliding writer. Today `05-publication/faithful/` holds only `chapters/` + `rollups-complete`, so nothing is broken yet.
2. **"Every `to` names a file that currently exists / a consumer can never redirect to a 404."** The reconciler only ever compares one track's `chapters/NN` against that render's own modules, so an mt-preview→faithful rename of the *same* module records nothing — and vefur's own `resolveChapterDuplicates` (`overlay.js:246-255`) deletes the baseline-named page from the merged tree when `reviewed.length === 1`. One verifier reproduced Case B end-to-end on the real committed artifact: after a future Pass-1 correction of m68770, vefur deletes `10-5-fastur-efnishamur.html` at the destination while the shipped map still asserts `"Every value is CURRENT"` and points at it. efni's scoping is *correct* (a faithful render must not delete mt-preview files); the contract wording is not.

**Fix — and note where it does not go.** Not the spec: it is frozen and banner-dated, and per this repo's own rule a frozen doc is evidence, never status. It goes in **CLAUDE.md's §C9 bullet** (already on this branch — one clause) and the register's vefur handoff: the invariant is per-track, the merged destination is vefur's to reconcile, and vefur's own prune can invalidate a `to`. Then **decide the destination shape before the vefur PR is written**, because both resolutions work and the choice gets more expensive later: either track-qualify the producer filename (`slug-map.<track>.json` — `SLUG_MAP_FILENAME` and `slugMapPath` are the single construction point, and exactly one committed artifact exists to rename today), or have the consumer read both per-track maps from `--efni-path`, which vefur's `generate-toc` already does. Separately flag the tradeoff on the `CONTRACT` string: it is what a consumer literally reads out of the JSON, so amending it rewrites every future map, while leaving it means the qualification lives only in CLAUDE.md. Controller's call.

### F4 — `slug-map.json` is written non-atomically and read fail-silently, so one interrupted write discards all recorded renames
**File:** `tools/lib/slug-map.js:86` · **1 of 2 verifiers refuted; adjudicated Minor.** Ship as logged unless the 2-line fix is taken now.

`writeSlugMap` is a bare `fs.writeFileSync`; `readSlugMap` returns an empty map on any parse error by design (`:48-50`). A verifier measured the composition: SIGINT during the write produced a **zero-length** file in 8 of 55 trials (sizes seen: 5774 or 0, nothing between — so the loss is deterministic given the kill, not probabilistic), after which a 40-record map reads as 0 and the next render rewrites it holding only its own entry, silently, with no shrink guard. The window is ~35 µs, and the map is git-tracked and pushed by the 2-hourly cron (RPO ≤ 2 h), which is why this is Minor and not Important. Concurrency is genuinely unguarded (`/render` guards type `render`, `/run` guards type `pipeline` then spawns its own `render` job with no guard of its own) but that is pre-existing `pipelineService` behaviour, untouched here.

**Fix:** plain `writeFileSync(<path>.tmp)` + `renameSync`. **Do not use `tools/lib/safeWrite.js`** despite it being already imported by `cnxml-render.js`: it also copies a `.backup.<timestamp>` sibling, and the backup pruner only covers paths in `writtenFiles` while the `chapters/NN` sweep never touches track root — backups would accumulate at track root indefinitely.

---

## 3. DEFERRED-MINOR TRIAGE

| # | Minor | Call |
|---|---|---|
| 1 | **Seeded-corrupt map no longer self-healing** — `delete map.renames[to]` cleans only the key the current call touches, so a hand-planted identity entry (`{x: {to: x}}`) persists. | **SHIP AS LOGGED.** Unreachable through the API (induction proof + two independent fuzz runs), so it needs external tampering. It does **not** compose with F4: that corruption produces a *zero-length* file, which reads as empty and cannot manufacture an identity entry — question foreclosed. Carry one line into the vefur handoff instead: a consumer must skip `to === from`, else an identity entry is a redirect loop. |
| 2 | **Regex takes only the first `data-module-id`; `chapterRelDir` not normalised** | **SPLIT. The `chapterRelDir` half is CLOSED** — Ruling 11 held, and I verified the single caller passes `chapters/${chapterStr}` with no trailing slash (`cnxml-render.js:4062`). **The regex half: SHIP AS LOGGED, with its reason recorded so it is not re-derived.** The ledger calls it inert (0 of 335 files carry two ids), which is true *in practice* but not *in principle*: I verified `buildHtmlDocument` emits `<title>${escapeHtml(…)}</title>` at `:807` **before** the `<article … data-module-id>` at `:814`, and `escapeHtml` (`cnxml-elements.js:430`) escapes only `& < >`, **not `"`**. So editor-controlled title text precedes the article with quotes intact, and a title containing the literal `data-module-id="…"` would win `MODULE_ID_RE.exec`. Absurd reachability; but mis-attribution is a deletion primitive, and the hardening is trivial (match after `<article`). |
| 3 | **No test exercises the composed wiring inside `main()`** (spec §8 row 7 got neither red nor green) | **SHIP AS LOGGED — and keep it distinct from F1's test.** F1's fix needs a unit test in `publication-reconcile.test.js` with the ch10 prune as its control; that does **not** discharge this gap. The composition is exactly where F1 lives (an unfiltered snapshot handed straight to the reconcile), and Task 5's real ch10 run remains the only end-to-end evidence. Log it against §C9's follow-up rather than blocking. |

---

## 4. REFUTED — one line each, for spot-checking

- **"A failed/removed module leaves a `to` naming a deleted file"** — refuted 2/2. Reproduced, but in that state the sweep deleted *both* names, so it is 404→404, not a new failure; and the implied fix (dropping the entry on a failed pass) would permanently destroy a redirect for a transient failure, against safety rule 6. *One verifier surfaced a genuinely-worse sibling route — a title reverted after an intervening failed pass leaves the map redirecting a **live** page's URL onto a dead file. Not filed here (it needs a failed pass first, and the vefur consumer's "serve the file if it exists, consult the map only on a miss" makes it inert), but it belongs in the handoff.*
- **"The register's ch10 completeness measurement is scoped to the wrong file"** — refuted 2/2. The "stale-slug refs in `10-0-introduction.html` 1 → 0" line names its file in the same breath and verifies register task 3; two of the five figures are explicitly corpus-wide. The underlying index.json observation survives as **F2**.
- **"The new CLAUDE.md bullet carries status verbs, which CLAUDE.md forbids"** — refuted 2/2, and decisively: the `✅ <change> (§Cnn)` idiom was already in CLAUDE.md at the merge base (3 occurrences), one of them added *by the merge-base commit itself*, and the rule's own author used the form one day after adopting it (`e505b530`, 2026-07-27, vs `a35a21a6`, 2026-07-26). The `⚠️ vefur consumer is not built yet` clause is true today (0 `slug-map` references in vefur; control `data-module-id` → 8 files) and load-bearing — deleting it makes the bullet read as if renames redirect now.
- **"The stated reason for track-root placement is false — neither the sweep nor `generate-toc` touches a non-`.html` file"** — refuted 2/2 on the sites that matter. The mechanics are right (a `slug-map.json` in `chapters/NN` would survive both), but CLAUDE.md and `slug-map.js` assert facts about the *directory* that are true as it actually exists (every one of its 334 files is `.html`), and the explicit counterfactual appears only in the frozen spec. No input makes the branch behave wrongly.

---

## 5. WHAT WAS NOT CHECKED

- **Only `efnafraedi-2e`'s `index.json` was censused by me.** A verifier reports 13 danglers in `edlisfraedi-2e`'s index; other books' *forward-looking* exposure to future prunes is unenumerated. F2's fix as written covers one book.
- **The crash / no-`fsync` window for F4 is unmeasured.** `writeFileSync` does not fsync, so on power loss or a WSL shutdown the window could be the writeback delay (~30 s) rather than ~35 µs. Nobody tested filesystem semantics here.
- **No lock exists between a CLI render and a server job**, and none between renders of different chapters on one book+track. Flagged, not measured, and pre-existing.
- **Every consumer-side claim is a simulation.** The vefur redirect consumer does not exist; all destination behaviour was established by running vefur's real `sync-content.js`/`overlay.js` against fixtures in `/tmp`, never by observing a shipped redirect.
- **`npm test` was not re-run** (known green on this tip: 328 files / 4,829 tests, exit 0, lint + format clean) — and note that green is for the branch **as-is**, not with the F1 guard applied. **Playwright E2E was not run at all**, and `npm test` never runs it.
- **`cnxml-render.js` was never executed**, per the hard rule; the wiring was verified by reading control flow and by probing the two libraries in isolation. Task 5's real ch10 run remains the only end-to-end evidence that the composed path behaves.
- **Ruling 14's off-by-one is closed, not open:** the ledger enumerates five non-drift ch10 files but six changed. The sixth is `10-4-fasarit.html`, and it is `0` additions / `1` removal with **0 non-empty `-` lines** — i.e. a blank line, squarely in the group Ruling 14 already characterised. No verdict was missing on a file that mattered.
- **14 findings were carried below the verification cut and are unverified**, except the two I checked myself (the `<title>`/`escapeHtml` regex route, folded into deferred-minor 2; the `readdirSync` order-dependence, foreclosed by F1's fix). The remainder — the prune-before-record ordering, the unpinned `typeof parsed.renames` clause, `snapshotModuleIds`'s untested filter and read-guard, the unpinned key sort, the `publicationAppendices` distractor dependency, the rollup-comment inaccuracy at `cnxml-render.js:3511`, and §C96's import-vs-call-site citation — are named here so they are neither silently dropped nor promoted on a single reviewer's say-so.