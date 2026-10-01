# §C140 ㊵ — retiring a translated figure, and pinning a figure's artwork

> **FROZEN DESIGN RECORD — banner-dated 2026-10-01.** Evidence, never status: status lives in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ㊵ and its ⏩ RESUME). If this document
> disagrees with the register, the register wins. The facts it rests on are in
> [`experiments/figure-text-translation/evidence/2026-10-01-c40-design/`](../../../experiments/figure-text-translation/evidence/2026-10-01-c40-design/README.md).

**Date:** 2026-10-01 · **Item:** campaign register §C140 ㊵, step 7 of the development order: **the two tools
only** · **Cost:** 0 ISK
**Approval:** [USER] ruled ㊵ on 2026-09-30: retire 6 of the 10 June figures; recompose the other 4, three through an
alias table and `CNX_Chem_03_01_ibuprofenmass_img` from the older base-tree `.eps`, each as a small paid buy after
its pre-buy lineup. [USER] approved this design in chat on 2026-10-01, section by section, and answered two questions:
**(1) each pin is added in the commit that runs its buy, not in this PR; (2) the cleanup step prunes any orphaned
published copy, not only retired ones.**

## Scope

**This PR:** two config tables (both empty), their handling in `sources.py`, a new tool
`tools/retire-translated-figure.js`, the mapping generator honouring the retired record, the wording of
`figure-run.js`'s refusal messages, tests, docs, and fixes to the out-of-date texts listed under D12.

**Not this PR:** any retired entry or pin; deleting any figure; re-inject or re-render; any buy; anything in vefur.
Those are the steps after merge (§ Run order).

## Decisions

| # | decision | why | cost if wrong |
|---|---|---|---|
| D1 | **Two new tables in `experiments/figure-text-translation/figure-text.config.json`, beside `supersededArtwork`:** `retiredFigures` (`{basename: reason}`) and `artworkPins` (`{basename: {kind, edition, file, reason}}`). Both ship **empty**. Each entry lands in the commit that acts on it: the 6 retired entries with the retire run, each pin with its buy. | The config is the owner of "values the code reads"; a ruling lives in the file the code reads, and the tool only executes it. Landing a pin with its buy means no plain figure run can buy a pinned figure before its lineup (fact: once resolved, all 4 classify `translated`, 124–140 billable characters each). | A record without an executor, or the reverse; caught by the corpus test (D11). |
| D2 | **Resolver order: `supersededArtwork` → `retiredFigures` → pin → the normal lookup.** New refusal kinds: `retired`, `pin-conflict`, `pin-missing`, `pin-invalid`. Keys are matched the way `supersededArtwork`'s are (`sources._normkey`). | A pin cannot bring back a superseded or retired figure. Every refusal travels the existing channel: `figure-run.js` turns any truthy `refused` into a non-fatal `unresolved`. `retired` is a separate label because the autorun halts on `REFUSED — superseded` (`scripts/chemistry-autorun-chapter.sh:208`), and `retiredFigures` does not fit `supersededArtwork`'s definition ("the ONLY available vector is known to be superseded"). | A retired figure resolves again and is bought, re-creating its row and SVG. That is the failure D2 exists to stop. |
| D3 | **A pin names one exact file: a configured tree key (`edition`) plus a path inside that tree (`file`).** Never a stem, a pattern or a tree alone. | Measured: a tree-only override for ibuprofen returns the base tree's `.pdf` (2015, titled `CNX_Chem_03_01_aspirin`, H subtotal **18.114**) rather than the `.eps` (2018, **18.144**, the published value), because `SOURCE_EXTS` puts `.pdf` first. A stem or prefix could also reach `base/_session_updates_2026-06-28/` (our own June output) or a confusable sibling (`CNX_Chem_14_06_ICETable2_img.eps`). | The wrong picture, with every count green, since prepare stages any artwork as `<basename>.pdf`. |
| D4 | **Two kinds.** `alias` is valid only while the normal lookup finds nothing under the basename; if it ever finds a file (a hit, or a refused candidate), the pin is refused as `pin-conflict` and the found files are named. `override` replaces the normal lookup deliberately. A pinned file that does not exist → `pin-missing`, **never** a fall-back to the normal lookup. A pinned file passes the same paper-size check (`production-page`; `pageUnknown`). A pinned hit carries `via: 'alias' \| 'override'`. | An alias exists because the delivery has a hole; `pin-conflict` stops it outliving that reason. For ibuprofen the fall-back *is* the picture [USER] rejected (the updates-2e `.eps`, which the driver refuses as raster-bearing textless). | A stale alias keeps sourcing an old file after the delivery changes. |
| D5 | **At run time, anything malformed about a pin refuses that one figure as `pin-invalid`:** a kind other than `alias`/`override`; an `edition` not configured for the book; a `file` that is absolute, contains `..`, or crosses `_OWN_OUTPUT_DIRS`; a missing reason. A configured tree that is not mounted still raises `SystemExit`, as today. **Validation of the committed config is a CI test (D11)**, because no CI job runs the Python suites. | Fail closed per figure; a pin cannot redirect a lookup outside its tree. The translated-suffix rule (a pinned stem must not end in `DEFAULT_SUFFIX`) is checked only in CI: its owner is the JS constant, and Python must not restate it. | A malformed pin is caught at review time rather than at run time. |
| D6 | **Wiring follows `superseded=`.** `resolve_detail`, `resolve`, `resolve_report` and `human_report` gain `retired=` and `pins=`. **One helper builds all three from the config, and both command-line paths (`main` and `--json`) use it.** The four census and read-layer scripts that already ignore `superseded=` keep ignoring these (logged, not changed). | `figure-run.js`, the only thing that buys, goes through `--json`. It reads only `path`, `edition` and `pageUnknown` from a hit, and treats any truthy `refused` as `unresolved`, so its contract does not change (fact: `resolver-contract`). One helper means the two CLI paths cannot disagree. | A CLI path silently missing a table; pinned by a test of the helper. |
| D7 | **`figure-run.js` changes wording only.** `refusalReason` gains the four kinds, and its fall-back for an unknown kind includes `reason` (today it prints only the kind). The outcomes NOTE in `tools/lib/figure-outcomes.js` names the new causes. | The operator reads the reason; the spend path is untouched. | A refusal printed without its reason. |
| D8 | **The retire tool is a new file, `tools/retire-translated-figure.js`, not a flag on `generate-image-mapping.js`.** It has a strict flag parser (an unknown flag, a missing value, or `--retire` with `--prune` → exit 2), is a dry run unless `--apply` is given, and sets `process.exitCode` rather than calling `process.exit` after output. | `generate-image-mapping.js`'s parser drops unknown flags (measured: `--dryrun` *writes*), and a `--retire` typed on a checkout without the feature would run a plain merge and print "Wrote …". A missing file fails loudly. Every other tool here that deletes committed data is a dry run by default. | A typo deletes. |
| D9 | **`--retire <names>` (before the re-render).** It validates **every** name before writing anything: the name has a `retiredFigures` entry; `image-mapping.json` parses and is an array of objects; the figure has no sidecar in `figure-text/`; every file it would delete is tracked by git and unmodified. Then it removes the rows whose `originalImage` equals the name, keeps every other row exactly as it was (legacy rows with no `originalImage` included), writes `JSON.stringify(rows, null, 2) + '\n'` through a temp file and a rename, and deletes the top-level `media/<outputName>`. **It never touches `05-publication/`.** It prints the re-inject and re-render command for every module and track whose `03-translated/` file references the figure. A second run changes nothing. | The generator re-adds a row whose file is still in `media/` (measured), so row and file go together. Going through the generator would turn an unreadable mapping into `[]` and collapse biology's 34 rows into 1; inject reads a broken mapping as "no translated figures" and silently reverts every figure to English. Chemistry's mapping re-serialises byte-identically (measured), so the diff is the removed rows only. Leaving `05-publication/` alone keeps every page's image working until the re-render. | A half-retire: a broken image, a row that comes back, or a damaged mapping. |
| D10 | **`--prune` (after the re-render).** Its candidates are every file under `05-publication/*/chapters/*/images/media/` whose stem ends in `DEFAULT_SUFFIX` (imported from its owner, `generate-image-mapping.js`), found by walking the tree, never by building a chapter path. It deletes one only if **no mapping row** names it; **no other file** under `03-translated/` or `05-publication/`, in any track, contains its name (raster and font files are skipped: a JPEG's metadata can carry a basename but cannot make a browser fetch anything; copies of the same name do not count as references); and it is **tracked and unmodified**. Everything kept is listed with its reason. **The generator also skips any name in `retiredFigures`**, so a restored file cannot re-add its row. | Render never deletes under `images/media/`, so a published copy must be removed by something, and only once nothing references it. vefur lays the faithful track over mt-preview, so a reference from either track keeps a file alive. [USER] chose "any orphan" (2026-10-01); its first run also clears the 9 June leftovers (GasBurning in ch05, Ex9soln_img in ch06, 7 in ch08). With D2, both writers of mapping rows honour the record. | A page loses its image, or an orphan stays deployed. |
| D11 | **Tests.** Python (`test_sources.py`, temporary trees, run by hand before the PR): every D2–D6 rule, each with a control. Vitest (in CI): the tool (D8–D10), the generator skip, `refusalReason`, and **a corpus test over the committed config and mapping**: the three tables share no key, compared after the same fold the resolver uses; every key is **exactly** the basename of an image some `01-source` CNXML references (the resolver folds case and punctuation, so only this check catches a misspelt key); every entry has a substantive reason; every pin has a valid kind, a configured `edition` and a relative `file` that does not end in `DEFAULT_SUFFIX`; every retired figure has no row, no `media/` file, no published copy and no reference; chemistry's rows and top-level `media/` `_IS` files match one-to-one, with a floor on the row count so the check cannot pass on an empty file. Before the PR: an adversarial review and a mutation pass over the guards. | The Python suites run in no CI job, so the rules that protect committed data must also be checked in JS. | A guard that passes vacuously. |
| D12 | **Docs and out-of-date texts.** The figure-text README's source-trees section (it also lacks the case and punctuation fold and `supersededArtwork`); the config's note keys; the tool's header and `--help`; `npm run docs:generate` (CI's docs-check fails otherwise); the register's ㊵ row and RESUME. Fixed in passing: the config's Ques11ans reason ("stays mapped… a separate [USER] call", ruled and retired 2026-09-19); the comments in `sources.py`, `test_sources.py` and the config's `_paperSizes` that still describe N2O5 as a refused paper-size page (it now resolves to its `.eps`; only rvosmosis is refused); the ㊵ row's evidence pointer, which cites a README section that does not support it. | Fix the document that is wrong, not a to-do elsewhere. | — |

## Interfaces

```text
node tools/retire-translated-figure.js --book <slug> --retire <name>[,<name>…] [--apply]
node tools/retire-translated-figure.js --book <slug> --prune [--apply]
```

Exit codes: `0` done, or the dry-run plan printed with nothing refused; `1` refused (nothing written); `2` usage.
A name must match `^[A-Za-z0-9_.-]+$`, so a flag value cannot reach outside `media/`.

```json
"retiredFigures": { "<basename>": "<reason>" },
"artworkPins": {
  "<basename>": { "kind": "alias", "edition": "updates-2e", "file": "<path inside that tree>", "reason": "<reason>" }
}
```

A pinned hit from `sources.py --json`: `{"path", "edition", "via": "alias"|"override"[, "pageUnknown": true]}`.
A refusal: `{"path": null, "refused": "retired"|"pin-conflict"|"pin-missing"|"pin-invalid", "edition", "candidates", "reason"}`.

## Run order after merge (not in this PR)

**The retires (content only, 0 ISK).**
1. Add the 6 `retiredFigures` entries, with the ruling as the reason.
2. `--retire` as a dry run, then `--apply`.
3. Re-inject and re-render the modules it names: all mt-preview; ch11 `m68783`, ch18 `m68835` and `m68837`, ch19
   `m68842`, ch21 `m68854`. Expect changes beyond the swap: these chapters predate §C126 #4, so 24 table summaries turn
   Icelandic and gain `data-summary`. Compare before and after by value.
4. `--prune` as a dry run, then `--apply`.
5. Verify: `sources.py` prints `REFUSED — retired` for all 6; no file under `03-translated/` or `05-publication/`
   mentions any of them; the corpus test passes.
6. PR, merge, and deploy promptly. The prod backup cron does not stage `media/`, so prod keeps the old rows and
   files until the deploy; a prod inject or render of those chapters before it would write the old references back.
7. Readers see it only after the chemistry sync, which [USER] holds. The sync must name `efnafraedi-2e`
   (organic is still on vefur's allowlist; register §C190).

**The buys (each about 1.2–1.4 ISK).** For each figure: add its pin; check that `sources.py` returns the approved
file; run its pre-buy lineup; run `figure-run.js --figure <name>` without `--stale`; review; re-inject and re-render.
For ibuprofen, re-render **both** ch03 tracks: vefur serves the faithful copy over mt-preview's. ⚠️ **Held by ㊸:**
the figure driver's prerequisite (`test_figrings.py` must print `ALL PASS`) must be fixed first, or [USER] rules
that it may be relaxed for these runs. The retires do not run `figure-run.js`.

## Known limits

- **A sidecar records no artwork provenance** (459 of 459 checked; `isStale` compares hashes only), so a pin
  changed after a buy is invisible to `--stale`. Accepted for four hand-bought figures.
- **The census and read-layer scripts do not see the new tables**, just as they do not see `supersededArtwork`.
- **vefur:** deleting a published copy removes it from the mt-preview mirror at the next sync; faithful files are laid
  on top without deletion, so a figure with a faithful copy needs both tracks re-rendered. A same-name recompose
  reaches readers whose browser installed the site as an app (PWA) late, because vefur's service worker caches
  `/content/*.svg` for 30 days (inferred from vefur's config; vefur's to confirm).

## Found outside ㊵ (logged in the register after re-measuring, not fixed here)

- Three faithful-track ch01 figures (ChemWeb, SciMethod, Archer2_img) are older TrueType copies, while `media/` and
  mt-preview hold their recomposed woff2 versions; faithful ch01 was last rendered 2026-07-06.
- The faithful ch03 page `3-1` gives ibuprofenmass an English alt; mt-preview's is Icelandic.
- `generate-image-mapping.js`: its parser drops unknown flags; an unreadable mapping is rewritten as `[]`;
  `mergeMapping` collapses rows without `originalImage` (biology 34 → 1); the write is not atomic.
- `tools/lib/parseArgs.js` reads `--apply=false` as true.
- `LICENSE` says every tracked `@font-face` SVG embeds the OFL woff2 subset; 33 embed TrueType today (the ㊵ work
  removes 30 of them: 10 in `media/`, their 11 published copies and the 9 orphans).
- `figure-run.js`'s report does not say that a hole still has a live June copy (it computes that only for
  refusals and contests).
- `docs/plans/2026-09-09-raster-figure-manual-replacement.md` says "add row → commit → re-render"; the swap happens
  at inject, so a re-inject is missing.
