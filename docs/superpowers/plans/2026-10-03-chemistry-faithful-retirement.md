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
| **Gains** | The 3 June TrueType figure copies (ch01 ChemWeb, SciMethod, Archer2_img; §C140 ㊻①) leave the reader's path; their mt-preview copies equal `media/`. | `data:font/ttf` census |
| **Costs** | The **MT banner returns on 4 pages** (1-0, 1-1, 3-0, 3-1): vefur marks a module `reviewed` only while its faithful file exists. On those pages the human edits leave the website until they are re-applied by hand (runbook 4.2) from the archive and the Word document. | live `toc.json` has `reviewed:true` on exactly those 4 |
| **Costs** | vefur's "for teachers" page hardcodes chemistry chapter 1 as *Yfirfarið* (reviewed); after this, chapter 1 has 0 reviewed modules. **A vefur follow-up**, not an efni edit. | vefur source |
| **Costs** | A browser that cached the 3 June SVGs keeps them up to 30 days (vefur's service worker: CacheFirst, 30 days, 200 entries). Per-browser only. | `sw.js`, `vite.config.ts` |

Changes that happen at the next sync **whatever this plan does** (not attributable to it): the ch01 renames 1-2, 1-5
and 1-6, and 25 ch03 image byte changes. They belong to the register's ⏹ SYNC PRECONDITION (recompute redirect
rows from the final titles), which this plan does not change.

---

## 2. Decisions for [USER] (recommendation first)

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

### Task R1 — (Decision 1) the zero-own-modules guard in `cnxml-render`, test-first
- [ ] A red test with a temporary fixture book: a track whose `03-translated/<track>/chNN/` exists but holds only an
  ignored-style file; a full-chapter render must refuse (non-zero exit, a message naming the track and chapter) and
  write nothing under `05-publication/<track>/`. Control: a chapter with one module still renders.
- [ ] The guard; the test green; `npm test` failing set unchanged by name.

### Task R2 — Move this box's ignored faithful residue off-repo (never delete it)
- [ ] Dev box: 58 `*.cnxml.backup.*` files in `03-translated/faithful/ch0{1,3}/` and 6 editor-save `.bak` files in
  `03-faithful-translation/ch01/` (intermediate states of real editorial work on m68664). Move them, with a
  `MANIFEST.sha256`, to `~/namsbokasafn-faithful-aside-dev-2026-10-03/`. After Task R3, both chapter directories must
  be ABSENT on disk (`ls` fails) — that, not `git ls-files`, is what vefur's sync and `findChapterModules` see.
- [ ] Production holds one ignored file in the tree, `05-publication/faithful/chapters/03/3-summary.html.backup.2026-06-12T23-45-57`
  (and none in `03-translated/faithful/`). Removing it is [USER]'s write; with the R1 guard it is harmless either way.

### Task R3 — The retirement commit (one commit: both trees together)
- [ ] `git rm -r books/efnafraedi-2e/05-publication/faithful books/efnafraedi-2e/03-translated/faithful books/efnafraedi-2e/residue-report.faithful.json`
  — **85 + 1 files**: 81 under `05-publication/faithful/` (ch01 7 pages + 9 images, ch03 7 pages + 57 images,
  `rollups-complete`), 4 CNXML under `03-translated/faithful/`, and the stale inject manifest
  `residue-report.faithful.json` (2 July ratio warnings on m68700 that would badge segments the first time an editor
  creates a faithful m68700). **Both trees in ONE commit:** a faithful render prefers `03-translated/faithful` CNXML
  whenever it exists, so removing only the pages would let the next *Vista + Birta* on ch01/ch03 bring the stale
  m68663/m68664/m68699/m68700 text back into the rollups; and `remt-sweep` would record "not attempted" failures that
  suppress its R4 row.
- [ ] Unchanged on purpose: `03-faithful-translation/README.md`, `image-mapping.json` (its rows carry no track and
  mt-preview needs them), `translation-errors.json` (it carries only the mt-preview track), everything under
  `reference-translations/`.
- [ ] Test pins, measured green after the removal (only these two files go red): `tools/__tests__/remt-sweep.test.js`
  — `toBe(161)` → `toBe(157)` at both sites, and K2's `evaluable` `toBe(26)` → `toBe(24)`;
  `tools/__tests__/remt-checks-chapter.test.js` — the K2 positive-margin fixture read faithful ch03, and no real chapter
  can replace it (organic mt-preview ch3, the only survivor, leaves with §C190 ②), so it becomes an **in-memory
  replay** in the file's own `ch4WithSvarDropReplayed` (§C160) pattern, predicting the margin from an independent
  count. Update the now-stale prose comments in `tools/__tests__/audit-render-output-defects.test.js` (no assertion
  changes).
- [ ] Gate: `npm test` (failing FILES diffed by name against `main`), `npm run lint`, `npm run format:check`, and the
  Python suites if R1 touched any. Expect one `validate.yml` run (it checks `status.json` and the mt-preview render
  only) and one red `sync-content.yml` run (it has never worked).

### Task R4 — The records commit
- [ ] Register (status only, per § One source of truth): mark RULED 2026-10-03 and carried out in `<sha>`, reaching
  readers at the sync — the 2026-09-26 block's faithful-overlay item; §C140 ㊻ ① and ② (with the measured scope: 37
  alts and 14 captions, not one alt) and ⑤'s 4 faithful TrueType copies (re-measured today: TrueType is 25 of 1,455
  `@font-face` SVGs — 2 in `media/`, 19 in mt-preview, 4 in faithful; the register's "33 of 1,461" is stale);
  §C148's faithful-3-1 reach caveat. Re-aim M5's verify grep at `mt-preview/chapters/03` (it would pass on an empty
  glob). Note that runbook 4.2's re-application must fix *kalsíuminnihaldand* (§C107), not carry it forward, and that
  C105's fix must precede the first new faithful publication.
- [ ] `docs/plans/2026-09-05-per-chapter-loop.md`: keep the overlay rule; say chemistry's instance was retired
  2026-10-03. Frozen decisions and handoffs are cited, never edited.
- [ ] Log, not fix: `validate-pipeline-consistency.js` builds a `ch`-prefixed publication path, so it never sees any
  track's HTML for numbered chapters (predates this work).

### Task R5 — PR, merge, deploy (with [USER])
- [ ] PR (merge commit). [USER] merges, timed so the merge-to-deploy window is short.
- [ ] Immediately before THAT deploy: R0's production checks again.
- [ ] [USER] deploys. After: production's two paths absent from git (`git ls-files` 0), `git status --porcelain -- books`
  empty; the Ritstjóri dashboard shows ch01/ch03 `activeTrack: mt-preview` (it is computed from disk).

### Task R6 — At [USER]'s held chemistry sync (later; vefur's side)
- [ ] vefur's dry run prints `Syncing efnafraedi-2e (mt-preview)` with no overlay step.
- [ ] After the sync and deploy, fetched as `/content/…` files with a nonsense-URL 404 control: `toc.json` carries
  `reviewed:true` 0 times for chemistry; 3-1 carries Icelandic in the copper caption and no `Copper wire`; ChemWeb's live
  bytes equal efni's mt-preview copy.
- [ ] Hand vefur its follow-up: the "for teachers" page's chapter-1 *Yfirfarið* claim.

---

## 5. Reversal

Every retired file stays in git history: `git checkout <retirement commit>^ -- <path>` restores it. The four
segment files and production's edits stay in `reference-translations/pre-remt-editorial-2026-08-23/`.
