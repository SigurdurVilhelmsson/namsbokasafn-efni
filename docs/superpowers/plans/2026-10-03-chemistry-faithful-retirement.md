# Chemistry's faithful track — retire the stale vintage (`05-publication/faithful/` + `03-translated/faithful/`)

> **Plan for [USER]'s approval, written 2026-10-03, read-only.** Status lives in the campaign register's newest
> ⏩ RESUME, never here. Off-repo evidence: `~/.cache/namsbokasafn-audit/2026-10-03-step2/retire/` (five read-only
> researchers — code consumers, tests, the sister repo, figures, records — plus a completeness critic).

**The ruling ([USER], 2026-10-03, given in vefur's session and relayed; confirmed in this session: "yes, bring me the
retirement plan"):** retire all of `books/efnafraedi-2e/05-publication/faithful/` — ch01, ch03 and the rollups — on
condition that the clean-break backup still exists. **The condition is met** (register RESUME, 2026-10-03): the four
pre-clean-break faithful segment files are on `main` in
`books/efnafraedi-2e/reference-translations/pre-remt-editorial-2026-08-23/`, matched by blob hash, with production's
`segment_edits` harvest beside them; [USER] holds the ch01/ch02 edits in a Word document.

**What "retire" means here, and what it does not.** The faithful OVERLAY stays: it is [USER]'s model
(`docs/decisions/2026-09-05-mt-preview-baseline-faithful-overlay.md` — mt-preview is the full machine baseline,
faithful replaces a module once a human has reviewed it). This plan removes the **stale pre-clean-break vintage**
only. The next approved edit an editor publishes with *Vista + Birta* creates a fresh faithful module from the
current MT, by design.

---

## 1. What changes, and for whom

Nothing reaches readers until [USER]'s held chemistry sync. At that sync, with the retirement in efni's tree:

| | Effect on readers | Measured |
|---|---|---|
| **No URL dies** | Every one of the 14 faithful page slugs and 66 image names has a same-named mt-preview twin in the same chapter directory (same `data-module-id` on the 4 reading pages). So no redirect row is needed for the retirement. | slug and filename sets compared, both trees |
| **Gains** | The 6 affected pages' **37 image alts** become Icelandic (all 37 are English on faithful, 0 of 77 on mt-preview); **14 captions** change, including the English copper caption on 3-1 (§C148) and ibuprofen's English alt (§C140 ㊻②). **PR-B's recomposed ch01/ch03 figures can reach readers at all**: while the faithful tree exists, vefur's sync overlays every faithful image over mt-preview's (unconditionally, `force:true`). | cmp, per element |
| **Gains** | **ch01's whole chapter catches up with the 2026-09-20 re-MT.** All 5 live ch01 rollup pages (summary, key terms, exercises, answer key, key equations) are June–July faithful renders that hide the re-MT for ALL 7 ch01 modules, not only the 2 reviewed ones: the live ch01 summary differs from mt-preview in 7 of 7 paragraphs, 6 of which belong to modules nobody reviewed (critic, by element id). ch03's live rollups are older faithful vintages too. | text compared by element id |
| **Gains** | **3 dead in-page links never ship.** The faithful 1-0 introduction links to the three OLD ch01 slugs (1-2, 1-5, 1-6), which the same sync removes; vefur resolves section URLs by exact match only. mt-preview's 1-0 links to the new slugs (0 dead). | link census, both trees |
| **Gains** | The 3 June TrueType figure copies (ch01 ChemWeb, SciMethod, Archer2_img; §C140 ㊻①) leave the reader's path; their mt-preview copies equal `media/`. | `data:font/ttf` census |
| **Costs** | The **MT banner returns on 4 pages** (1-0, 1-1, 3-0, 3-1), because those pages ARE machine translations once this vintage goes: vefur marks a module `reviewed` only while its faithful file exists. Nothing is destroyed. The human edits on them were made on the OLD MT dialect, and the 2026-08-22 clean-break decision already resolved to re-apply them by hand on the new MT (runbook 4.2) from the archive and the Word document. This retirement carries out that decision on the reader's side. **Size: at least 53 approved editor edits are visible on live pages today and absent from mt-preview (31 in ch01, 22 in ch03)** — a lower bound from a 40-character matching heuristic over the archived `segment-edits-harvest-2026-08-30.json`; edits inside alt attributes are not counted. It also sizes runbook 4.2. | live `toc.json` has `reviewed:true` on exactly those 4 |
| **Costs** | vefur's reviewer claims lose their evidence base (4 reviewed modules → 0): the "for teachers" page hardcodes chemistry chapter 1 as *Yfirfarið*; `bookCredits.ts` credits chemistry with *Ritstjórn og fagyfirlestur*; the homepage says *Vélþýtt og yfirlesið af starfandi raungreinakennurum*; the FAQ says *Sumir kaflar eru merktir sem forskoðun*. vefur's own credit module states the principle "never claim yfirlestur where it has not happened". **Whether the wording stays is [USER]'s and vefur's call; a vefur follow-up, not an efni edit.** | vefur source (read-only) |
| **Costs** | A browser that cached the 3 June SVGs keeps them up to 30 days (vefur's service worker: CacheFirst, 30 days, 200 entries). Per-browser only. | `sw.js`, `vite.config.ts` |

Changes that happen at the next sync **whatever this plan does** (not attributable to it): the ch01 renames 1-2, 1-5
and 1-6, and 25 ch03 image byte changes. They belong to the register's ⏹ SYNC PRECONDITION (recompute redirect
rows from the final titles), which this plan does not change.

---

## 2. Decisions for [USER] (recommendation first) — ⚖️ DECISIONS 1–3 RULED 2026-10-03: [USER] "I agree with your three recommendations" (guard: yes; organic's removal a separate PR; its own small PR, merged before PR-B's branch is cut). ⚖️ DECISION 4 RULED 2026-10-03 (later session): "Yes, guard inject (Recommended)" — `cnxml-inject` refuses `--track faithful` unless the source directory maps to faithful, red-first, and the live docs that prescribe the bare command are corrected in the same retirement PR. Scope as ruled: the faithful track only.

1. **Guard the retirement in code? — recommended YES.** `git rm -r` leaves a directory in place when it still holds a
   gitignored file. Then `findChapterModules` returns `[]` instead of throwing, `cnxml-render` has no zero-module
   guard, and a full-chapter faithful render would rebuild `05-publication/faithful/chapters/NN/` from mt-preview's
   CNXML (its rollup fallback), which **switches vefur's overlay back on** (vefur overlays faithful while
   `faithful/chapters/` holds any `NN` directory). The fix is small: `cnxml-render` refuses a track/chapter with zero
   modules of its own, red-first. Without it, the retirement holds only while every box is kept free of ignored
   residue by hand.
2. **Order against organic's removal (§C190 ②), which moves the same test pins** (`remt-sweep.test.js`'s 161 counts
   chemistry mt-preview 149 + chemistry faithful 4 + organic 8). **Recommended: two separate PRs, whichever lands
   second re-pins.** Both are [USER]'s separate rulings; combining them mixes a rights removal with a content cleanup.
3. **When — recommended: its own small PR, merged before PR-B's branch is cut (so in practice next to PR-A).** Hard
   constraints: before the chemistry sync (otherwise stale faithful copies mask step 2's recomposes and step 3's
   re-render, while every efni-side check, reading mt-preview, looks clean); before step 3's generator runs
   (`generate-index` defaults to `--track faithful`, and with `rollups-complete` present vefur would overlay a 12-entry
   faithful `index.json` over mt-preview's 763); and **never between PR-B's branch cut and PR-B's merge** (PR-B's census
   refuses any `books/` deletion other than PerTable2's sidecar in its base..head range).

4. **From the completeness critic — widen the guard to the INJECT route back in? Recommended YES; ⚖️ RULED YES 2026-10-03 (heading above), and built (below).**
   `cnxml-inject --track faithful` run WITHOUT `--source-dir` takes its text from `02-mt-output`
   (`tools/cnxml-inject.js`: `const sourceDir = args.sourceDir || '02-mt-output'`, with nothing tying `--track` to the
   source), so it would write MACHINE text for all 7 ch01 modules into `03-translated/faithful/ch01/`. The chapter then
   has 7 modules of its own, Decision 1's zero-module guard never fires, a faithful render makes all 7 section pages
   from MT, and vefur stamps them `reviewed` — so the MT banner disappears from machine text. **Both READMEs prescribe
   exactly that command** (`README.md` around line 136, `books/efnafraedi-2e/03-faithful-translation/README.md` around
   line 27). Proposed: `cnxml-inject` refuses `--track faithful` unless the source directory maps to faithful
   (`trackFromSourceDir(sourceDir) === track`), red-first; and the two README lines are corrected in the same PR
   (CLAUDE.md: if B is wrong, fix B). Read from the code; inject was not run.

   **Built** (`e2607c5cc` guard + test, `8a8a9f342` docs; on the local branch `content/chem-faithful-retirement`,
   unpushed). The premise was proved at HEAD before the guard, not only read: on a temporary ch01 copy whose m68663
   MT title was set to a sentinel, `--module m68663 --track faithful` with no `--source-dir` exited 0, printed
   `[PERFECT fidelity]`, and wrote the MT sentinel into `03-translated/faithful/ch01/m68663.cnxml` and a fresh
   `residue-report.faithful.json`. The guard tests the EFFECTIVE track,
   `track === 'faithful' && trackFromSourceDir(sourceDir) !== 'faithful'`, right after the track is computed and
   before the residue-manifest read and every write; without `--track`, `track` IS `trackFromSourceDir(sourceDir)`,
   so it fires only on an explicit `--track faithful` against a non-faithful source. It refuses with the file's own
   `console.error` + `process.exit(1)` style (no stdout written first) and names the remedy
   (`--source-dir 03-faithful-translation`). Test: `tools/__tests__/cnxml-inject-faithful-track-guard.test.js`, two
   refusal arms (bare `--track faithful`; `--track faithful --source-dir 02-mt-output`) asserting exit 1, no output in
   either `03-translated` track, no manifest and a byte-identical `translation-errors.json`; three by-value controls
   (the server's `--source-dir 03-faithful-translation` shape, the agreeing pair, the no-flag default). Callers
   measured unaffected: `pipelineService.runInject` passes `--source-dir` and never `--track`;
   `scripts/verify-b2-idempotent.sh` passes the agreeing pair. Docs corrected at the four sites that prescribed or
   described the refused shape: `README.md`, `books/efnafraedi-2e/03-faithful-translation/README.md`,
   `books/efnafraedi-2e/05-publication/README.md`, `docs/workflow/simplified-workflow.md`. Review fix `660a60987` then
   made the two READMEs show the per-module form the server runs (`--module <moduleId>` on both inject and render;
   a full-chapter faithful inject fails each unreviewed module by design; never `--allow-en-fallback`), struck
   simplified-workflow's claim that inject falls back to `02-mt-output`, and matched `docs/technical/cli-reference.md`
   to inject's real flags (its `--output-dir` row was a flag the parser drops). Its known neighbours (the
   `--track localized` sibling, `trackFromSourceDir`'s substring test, `--track` taking any string) are outside the
   ruled scope and logged in the register (§C198).

---

## 3. Global constraints

- **0 ISK.** No `figure-run.js`, `api-translate`, `cnxml-inject`, `cnxml-render` run on chemistry in this plan (the
  guard's test uses a temporary fixture).
- **The method is `git rm`, because no pipeline tool retires a track.** CLAUDE.md § MANDATORY says not to edit
  `05-publication/` without pipeline tools; measured, none deletes a publication track (`cnxml-render`'s sweep deletes
  only within a chapter it is rendering, and needs `03-translated/<track>/chNN` to exist; `retire-translated-figure
  --prune` removes only unmapped `_IS` figure copies). §C190 ② prescribes the same method for organic. [USER]'s go
  covers the deliberate act; git history is the backup.
- **Production writes are [USER]'s** (deploy, removing an ignored file). This session runs only read-only prod checks.
- **The vefur tree is never written from here**; vefur follow-ups go to a vefur session.

---

## 4. Tasks

### Task R0 — Pre-checks (read-only, minutes)
- [ ] Dev and production: the two tree hashes are unchanged since 2026-10-03 —
  `git rev-parse HEAD:books/efnafraedi-2e/05-publication/faithful` → `29c010b1495e06fa5419b688fc6b194abdfa06a5`,
  `git rev-parse HEAD:books/efnafraedi-2e/03-translated/faithful` → `1ce3f6a66a9e3c2cc3d81cc4e5118d576a2a7f3d`
  (measured identical on dev, `origin/main` `0c2f06d01` and production `400b80224`). **A different hash means someone
  published new faithful work: STOP** — a blind `git rm -r` would delete fresh human pages.
- [ ] Production: `git status --porcelain -- books` empty; `git log --name-only --format= origin/main..HEAD -- books/efnafraedi-2e/05-publication/faithful books/efnafraedi-2e/03-translated/faithful` empty (no prod-only commit to collide with at deploy).
- [ ] Production DB (read-only, the service's own Node): no `publication.faithful` stage row for chemistry says complete
  (the dev DB has all `not_started`; production was not measured).

### Task R1 — (Decision 1) the zero-own-modules guard in `cnxml-render`, test-first · ✅ BUILT 2026-10-03 (`a020d4583`, local branch `content/chem-faithful-retirement`, unpushed)

**Executed:** the guard is in `main()` of `tools/cnxml-render.js`, immediately after
`const modules = findChapterModules(...)`: `if (!args.module && modules.length === 0) throw new Error(...)`, so it runs
before the §C145 marker-residue pre-flight, the §C9 snapshot, the sweep and every rollup write, and it applies to EVERY
track (an mt-preview chapter directory holding only residue would also have been swept and rebuilt). It is deliberately
not inside `findChapterModules`, which `main()` calls three times, the mt-preview fallback among them. The refusal goes
through `main()`'s existing catch (stderr, then exit 1; nothing on stdout first) and reads *"Refusing a full-chapter
render (track faithful, chapter 1): … exists but holds no .cnxml module of its own … NOTHING was deleted or written."*
Test: `tools/__tests__/cnxml-render-zero-own-modules.test.js`, a temp root of the 7 real mt-preview ch01 CNXML files with
the CLI's cwd redirected (the pipeline-integration idiom), so it never reads the tree R3 removes. Red at the unguarded
code for the right reasons (exit 0, the sentinel page and its `.backup` swept, all 5 rollups and `rollups-complete`
rebuilt from mt-preview CNXML). Controls green on both sides: the *Vista + Birta* shape (one own module, `--module`;
renders the section page and the union rollups, sweeps nothing), a full-chapter render with one own module (renders,
sweeps), the absent-directory arm (still `Translated directory not found`), and a non-empty pre-run snapshot. A
source-order pin (guard < pre-flight call < sweep) covers what the CLI cannot show with zero modules.
**Measured with it:** (a) on-disk census of every `03-translated/<track>/<dir>`, worktree and main checkout identical:
the only directory with zero `.cnxml` is `lifraen-efnafraedi/03-translated/mt-preview/exercises/` (JSON only), which is
not a `chNN`/`appendices` name and so is unreachable by `--chapter`; no faithful directory is residue-only today. (b)
Whole-chapter callers: `scripts/rerender-remediation-delivery.sh` (the one loop caller; it plans from
`[[ -d …/03-translated/$track/chNN ]]` and aborts on the first non-zero render, so a residue-only faithful chapter now
ABORTS it where it used to rebuild faithful rollups from mt-preview — Decision 1's fail-closed intent, a behaviour change
in a script last changed 2026-07-10); the admin chapter render (`server/routes/pipeline.js`), the one server path that can
reach the guard, as a single failed job. *(Review fix `837c0f8e9`: the refusal now also names the remedy, inject the
track's modules first or remove a retired track's leftover directory; and the delivery script plans a chapter only when
its directory holds a `*.cnxml`, R1's own predicate, so it skips such a directory instead of aborting.)* Unaffected: *Vista + Birta* (always `--module`), `publicationService`'s publish
(injects first) and `scripts/chemistry-autorun-chapter.sh` (renders right after its own inject).

- [x] Scope: refuse ONLY a full-chapter render (no `--module`) of a track whose `03-translated/<track>/chNN/` holds
  **zero modules of its own**. It must not touch the overlay's intended path: *Vista + Birta* injects ONE module into
  `03-translated/faithful/chNN/` and renders with `--module`, building the rollups from the union of that module and
  the mt-preview fallback (own-module count 1, so the guard never fires).
- [x] A red test with a temporary fixture book: `03-translated/<track>/chNN/` exists but holds only an ignored-style
  file; a full-chapter render must refuse (non-zero exit, a message naming the track and chapter) and write nothing
  under `05-publication/<track>/`. **Controls: (1) the *Vista + Birta* shape — one own module, rendered with `--module`,
  rollups from the union — still renders; (2) a full-chapter render with one own module still renders.**
- [x] The guard; the test green; `npm test` failing set unchanged by name. *(Guard and test ✅ in `a020d4583`; the whole-suite diff by name is ✅ in Task R3's gate box.)*

### Task R2 — Move this box's ignored faithful residue off-repo (never delete it) · ⚠️ BEFORE R3: the order is load-bearing · ✅ DONE on the dev box, 2026-10-03

**Executed:** 63 files (57 `*.cnxml.backup.*` + 6 `.bak`; the "58" below counted a directory line) moved to
`~/namsbokasafn-faithful-aside-dev-2026-10-03/` with `MANIFEST.sha256` (63 of 63 verified at the archive) and a
`README.txt`; 0 ignored files left in the three trees; the emptied `03-faithful-translation/ch01/` removed with `rmdir`;
`git status` unchanged. Production's one ignored file is untouched (its removal is [USER]'s write).

If R3's `git rm` runs first, the directories it empties still exist on disk (they hold the ignored files), and R2's
"absent" check would then run against a tree that was never clean.
- [ ] Dev box: 58 `*.cnxml.backup.*` files in `03-translated/faithful/ch0{1,3}/` and 6 editor-save `.bak` files in
  `03-faithful-translation/ch01/` (intermediate states of real editorial work on m68664). Move them, with a
  `MANIFEST.sha256`, to `~/namsbokasafn-faithful-aside-dev-2026-10-03/`. After Task R3, both chapter directories must
  be ABSENT on disk (`ls` fails) — that, not `git ls-files`, is what vefur's sync and `findChapterModules` see.
- [ ] Production holds one ignored file in the tree, `05-publication/faithful/chapters/03/3-summary.html.backup.2026-06-12T23-45-57`
  (and none in `03-translated/faithful/`). Removing it is [USER]'s write; with the R1 guard it is harmless either way.

### Task R3 — The retirement commit (one commit: both trees together) · ✅ DONE 2026-10-03 (`906b945d7` + `ac1a2f99d`, local branch `content/chem-faithful-retirement`, unpushed)

**Executed:** two commits. `906b945d7` added K2's in-memory replay as its own test, green while the faithful test still
stood. `ac1a2f99d` is the removal: **86 paths** (81 under `05-publication/faithful/` = 80 under `chapters/` +
`rollups-complete`; 4 CNXML under `03-translated/faithful/`, 2 in ch01 and 2 in ch03; `residue-report.faithful.json`),
taken only after the tree hashes matched R0 and `git status --porcelain --ignored` read 0 lines for the three paths;
afterwards `ls` fails (exit 2) on all three, and the parents keep `mt-preview` (`05-publication/` also its README,
`glossary.json`, `toc.json`). The same commit folds the replay into the existing "K2 discloses the margin a PASS is
sitting on, and stays silent when there is none" test in place of the faithful +23 arm, re-pins remt-sweep 161 → 157 at
both sites and K2 `evaluable` 26 → 24, and fixes the faithful-dependent prose at the listed comment sites (remt-sweep's
R4 spawns 26 → 24, the chapter cell denominator 26 → 24, the tier-3 pool 161 → 157; dated tables annotated *track retired
2026-10-03*, not rewritten). **The +31 / +3 hypothesis is confirmed on the real tree:** chemistry mt-preview ch3 is
exactly balanced (m:math 123 / mjx-container 123, image 41 / img 41), so K2 alone gives `PASS` with no margin; with
m68702's page (31 equations, 3 images, by a DOM parse independent of `marginNote`'s regex) replayed, it gives
`PASS margin math +31, image +3 (rollups re-present; not a defect)`. The test asserts the balance premise, takes its
expected count from the DOM parse (throwing if the page is missing or has 0 equations), and keeps the negative half
(ch10, no margin); review fix `a3c6e9c76` asserts the margin as one delimited clause, `PASS margin math +N, image +M (`,
because two prefix matches let an over-count by a trailing digit through. Independent corroboration of the re-pins: after the removal the units are chemistry mt-preview 149 in
23 chapters + organic mt-preview 8 = 157, faithful 0 in both books. Mutation-checked on the branch: disabling K2's
disclosure branch turns the folded test red at `PASS margin math +31`, as does R1's guard body made a no-op (6 of the
16) and D4's condition made false (both refusal arms); every file restored from a golden copy and `cmp`-identical.
⚠️ The audit-render-output `--track faithful` test still discriminates, now against an ABSENT track (7 modules
unauditable, against mt-preview's 2 errors) — weaker than before, not vacuous. Its comments, and `ac1a2f99d`'s commit
message, said faithful ch01 audited `PASS with warnings` / exit 0 before the retirement; that was false since #420 (both
tracks FAIL, on different stdout), and review fix `d369626b1` corrected the comments and dated the pre-retirement counts
(the commit message stays as written).

- [x] `git rm -r books/efnafraedi-2e/05-publication/faithful books/efnafraedi-2e/03-translated/faithful books/efnafraedi-2e/residue-report.faithful.json`
  — **85 + 1 files**: 81 under `05-publication/faithful/` (ch01 7 pages + 9 images, ch03 7 pages + 57 images,
  `rollups-complete`), 4 CNXML under `03-translated/faithful/`, and the stale inject manifest
  `residue-report.faithful.json` (2 July ratio warnings on m68700 that would badge segments the first time an editor
  creates a faithful m68700). **Both trees in ONE commit:** a faithful render prefers `03-translated/faithful` CNXML
  whenever it exists, so removing only the pages would let the next *Vista + Birta* on ch01/ch03 bring the stale
  m68663/m68664/m68699/m68700 text back into the rollups; and `remt-sweep` would record "not attempted" failures that
  suppress its R4 row.
- [x] Unchanged on purpose: `03-faithful-translation/README.md` *(except its inject line, which Decision 4 corrected in
  `8a8a9f342`)*; `image-mapping.json` (its rows carry no track and
  mt-preview needs them); everything under `reference-translations/`; and `translation-errors.json`, whose
  `tracks.faithful` section (2026-07-14, 4 modules checked, `green: false`) is left stale on purpose. Measured: no code
  reads that section; `updateTranslationErrors` replaces a track's section only on that track's own inject, so the next
  faithful inject rewrites it; and the file is written by production's cron as well as dev under `merge=ours`, so a
  hand edit of a derived manifest is the riskier move.
- [x] Test pins, measured green after the removal (only these two files go red): `tools/__tests__/remt-sweep.test.js`
  — `toBe(161)` → `toBe(157)` at both sites, and K2's `evaluable` `toBe(26)` → `toBe(24)`;
  `tools/__tests__/remt-checks-chapter.test.js` (its K2 test around lines 848–853) — the positive-margin fixture read
  faithful ch03, and no real chapter can replace it (organic mt-preview ch3, the only survivor, leaves with §C190 ②), so
  it becomes an **in-memory replay** in the file's own `ch4WithSvarDropReplayed` (§C160) pattern: chemistry mt-preview
  ch3 with its most equation-heavy page appended a second time, asserting `PASS margin math +${count}` where `count`
  comes from an independent count of that page's equations. **Measured by the tests researcher on a scratch copy:** the
  real mt-preview ch3 alone gives `PASS -` (no margin); with the page duplicated it gives `PASS margin math +31, image
  +3`; disabling K2's disclosure (`tools/lib/remt-checks-chapter.js`, the `margin ? …` branch) turns the moved test red;
  remt-sweep 43/43 and remt-checks-chapter 67/67 green after the removal. **R3 is executed implement-then-extract, as
  Part 5 was:** the replay's code is written test-first when the task runs, and this plan's text is updated from the
  commit. Update the now-stale prose comments in `tools/__tests__/audit-render-output-defects.test.js` and the nine further
  comment sites that state faithful-dependent counts (none is an assertion; each checked to exist):
  `tools/lib/remt-checks-output.js` (~426, ~654), `tools/remt-sweep.js` (~829), `tools/lib/remt-checks-chapter.js` (~137,
  ~574), `tools/__tests__/remt-sweep.test.js` (~18, ~861), `tools/audit-render-output.js` (~55, ~549), plus the K2 test's
  own comment (`remt-checks-chapter.test.js` ~835–847). ⚠️ One researcher wrote that no test reads the real faithful tree;
  that is wrong (the K2 test reads faithful ch3) — the plan follows the measured side.
- [x] Gate: `npm test` (failing FILES diffed by name against `main`), `npm run lint`, `npm run format:check`, and the
  Python suites if R1 touched any. Expect one `validate.yml` run (it checks `status.json` and the mt-preview render
  only) and one red `sync-content.yml` run (it has never worked).

  ✅ Measured 2026-10-04 at the retirement tip `436a351ba`: lint and format:check clean; `npm test` 444 of 446 files pass. The 2 red are `server/` files, and the branch changes no file under `server/`: `findTermsGolden` (a `beforeAll` 10 s hook timeout, which also fails alone on `0c2f06d01`) and `conceptMatcher` (a `beforeEach` stall while the box slept, which passes 17/17 alone on both the tip and `0c2f06d01`). `main`'s own full run failed only `cnxml-inject-robustness` (`EIO` on a full `/tmp`), which passes 6/6 alone with `TMPDIR` on disk. Logs: `~/.cache/namsbokasafn-audit/2026-10-03-step2/gate/`.

### Task R4 — The records commit
- [x] Register (status only, per § One source of truth): mark RULED 2026-10-03 and carried out in `<sha>`, reaching
  readers at the sync — the 2026-09-26 block's faithful-overlay item; §C140 ㊻ ① and ② (with the measured scope: 37
  alts and 14 captions, not one alt) and ⑤'s 4 faithful TrueType copies (re-measured today: TrueType is 25 of 1,455
  `@font-face` SVGs — 2 in `media/`, 19 in mt-preview, 4 in faithful; the register's "33 of 1,461" is stale);
  §C148's faithful-3-1 reach caveat. Re-aim M5's verify grep at `mt-preview/chapters/03` (it would pass on an empty
  glob). Note that runbook 4.2's re-application must fix *kalsíuminnihaldand* (§C107), not carry it forward, and that
  C105's fix must precede the first new faithful publication. *(Done. M5's verify was re-aimed with one change from
  this line: mt-preview ch03 is its positive control BEFORE the fix, measured to carry both errors today, because the
  editor's fix lands in `05-publication/faithful/`, never in mt-preview. After the fix the verify asserts the faithful
  glob is non-empty before grepping it. The ⑤ census was re-run and agrees: 25 of 1,455, 2 / 19 / 4.)*
- [x] `docs/plans/2026-09-05-per-chapter-loop.md`: keep the overlay rule; say chemistry's instance was retired
  2026-10-03. Frozen decisions and handoffs are cited, never edited.
- [x] PR-A plan, Part 2's "Carries into PR-B" note: "plus 7 `05-publication` copies (faithful ch03 included)" becomes 5 once the
  two faithful ch03 annotated copies leave (informational; no PR-B check counts `05-publication/faithful/`, measured by
  grep of PR-B's plan).
- [x] Log, not fix (a ③ concern, outside the retirement): `contentVersionService.restoreVersion` defaults to track `faithful` and
  keys on current segment ids; in the dev DB every m68664 snapshot id still exists, so a restore would write June text over
  72 of 76 segments without a warning. Size it with one read-only prod count of `content_versions` for chemistry/faithful
  before editors are unfrozen.
- [x] Log, not fix: `validate-pipeline-consistency.js` builds a `ch`-prefixed publication path, so it never sees any
  track's HTML for numbered chapters (predates this work). *(Both logged as register §C198 ① and ②, with Decision 4's
  neighbours as ③.)*

### Task R5 — PR, merge, deploy (with [USER])
- [x] PR (merge commit). [USER] merges, timed so the merge-to-deploy window is short.
- [x] Immediately before THAT deploy: R0's production checks again.
- [x] [USER] deploys. After: production's two paths absent from git (`git ls-files` 0), `git status --porcelain -- books`
  empty; the Ritstjóri dashboard shows ch01/ch03 `activeTrack: mt-preview` (it is computed from disk).

### Task R6 — At [USER]'s held chemistry sync (later; vefur's side)
- [ ] **Before the sync: the efni checkout vefur reads (`--source ../namsbokasafn-efni`) must CONTAIN the retirement** —
  `git -C ../namsbokasafn-efni merge-base --is-ancestor <retirement sha> HEAD && test ! -e ../namsbokasafn-efni/books/efnafraedi-2e/05-publication/faithful`.
  (On 2026-10-03 that checkout is on a feature branch and the retirement lives on another; vefur reads the disk.) Also
  confirm which vefur branch the deploy ships from.
- [ ] vefur's dry run prints `Syncing efnafraedi-2e (mt-preview)` with no overlay step.
- [ ] After the sync and deploy, fetched as `/content/…` files with a nonsense-URL 404 control: `toc.json` carries
  `reviewed:true` 0 times for chemistry; 3-1 carries Icelandic in the copper caption and no `Copper wire`; ChemWeb's live
  bytes equal efni's mt-preview copy.
- [ ] Hand vefur its follow-up: the reviewer claims listed in §1 (for-teachers, `bookCredits.ts`, homepage, FAQ).

---

## 5. Reversal

Every retired file stays in git history: `git checkout <retirement commit>^ -- <path>` restores it. The four
segment files and production's edits stay in `reference-translations/pre-remt-editorial-2026-08-23/`.
