# §C140 ㊵ — final whole-branch review (plan/spec alignment, seams, readiness, docs, deferred-minor triage)

**Range:** `25f8b15f0..c2a4d5f74` (30 commits) on `feat/c140-c40-retire-and-alias` · **Reviewer seat:** plan/spec alignment,
cross-task seams, integration, documentation truth, triage. The four deep-hunt lenses (resolver order/pins, deletion
safety, predicate false negatives, test vacuity) were left to the parallel review and not duplicated.

**Method (two passes, read-only).** Pass 1 read the code package, the binding spec in full, the plan's Global
Constraints and Review Focus, the ledger and the 57 deferred lines. Pass 2 measured each seam the caller named, plus
the run order on the real tree. Everything I ran was read-only. Scratch files went only under `<scratch>/c40-final/`.
- Focused gates at HEAD: `npx vitest run` over the 7 ㊵ test files → **7 files, 216 tests, exit 0**;
  `test_sources.py` → **ALL PASS**.
- **Real-tree dry runs** (`run()` with the six names injected as the retired set, no `--apply`):
  - `--retire` on the 6 → 1 row and 1 top-level copy each; each is referenced only from mt-preview
    `03-translated` and `05-publication` (2 files each); exit 0.
  - `--prune` → 754 copies / 9 to delete / 745 kept, all 745 still mapped. The 9 are GasBurning ch05, Ex9soln_img
    ch06, and 7 in ch08.
- **Reference probe** with the tool's own `findReferences` across the 6 retire figures, Ques11ans and the 4 pin
  figures: the 6 are referenced only from mt-preview, Ques11ans has 0 references, and ibuprofenmass also from
  faithful. The scan took 0.35 s.
- **Owners probe** (`indexBookSourceBasenames` over every `books/*`): each of the 7 planned retire keys and the 4 pin
  basenames is an exact basename in `efnafraedi-2e` only, by exact match and by fold.
- **Fold differential:** JS `normkey` against Python `_normkey` over 194,528 code points.
- **`GIT_*` environment probe** in throwaway repos.
- **Repro of `--retire` with a missing mapping**, fixture built with `fs` after the 01-source guard hook (correctly)
  refused a shell redirect.

---

### Strengths

- **Every spec decision is implemented as written or as a dated ✏️ amendment.** I diffed the spec from its approved
  revision (`cf3c6f697`) to HEAD. Every substantive change carries a dated ✏️ note: Terms, D9, D10 (twice), D11, D13,
  D14 and run-order step 5. The only unmarked edit is run-order step 3's "(no row and no translated copy for any of
  the 7)", which restates the ✏️-marked D11 amendment. There is one unexplained deviation, D9's missing-mapping
  precondition (Important I1 below).
- **Seam (a), `sources.py --json` → `figure-run.js` / `figure-outcomes.js`, holds.**
  - A hit is `{path, edition, via?, pageUnknown?}`. `figure-run` reads only `path`, `edition` and `pageUnknown`, in
    both the first resolve loop and the de-hash loop.
  - Any truthy `refused` becomes `artworkRefusal`, and from there a non-fatal `unresolved`.
  - Summarise prints `⚠️ REFUSED — <kind>: <basename>: <reason>` generically, and `refusalReason` names all four new
    kinds, with a reason-carrying fall-back.
  - `run_cli`/`policy()` puts the three tables on both CLI modes, and the test drives both modes with a control
    (D6).
- **Seam (b): a retire is durable against the next bare generator run.**
  - After `--retire --apply` there is no row and no copy, so `mergeMapping` has nothing to resurrect.
  - A restored copy is skipped exactly by `buildMappingEntries` (`skippedRetired`).
  - `publish-figure-svg` refuses `unmapped`.
  - figure-run's own row writer (`mintMappingEntry`) is reachable only with `rec.artwork`, which is set only from a
    `sources.py` hit (`figure-run.js:2026`, `:2065`). A retired figure never gets one, so D10's "both writers honour
    the record" is true for chemistry.
- **Seam (c): `normkey` and `_normkey` agree, by measurement.** A differential over every code point
  0x20–0x2FFFF (194,528, surrogates excluded) disagrees on **359**. All 359 are category `Cn` (unassigned) in
  Python 3.14's UCD **16.0** and assigned in Node 22's UCD **17.0**. The two folds agree on every code point both
  runtimes know, and none of the 359 is in Latin-1 or ASCII.
- **Seam (d): the validator corpus and the retire tool's corpus are the same set by construction.** Both use
  `indexBookSourceBasenames`, `readMappingOrRefuse`, `topLevelTranslatedCopies` and rows with
  `originalImage === key`. The validator's retired-state check measures exactly what `--retire` removes. The
  non-book directories (`__e2e-fixture__`, `testbook`, `_slug-maps`) hold 0 basenames, so they cannot disturb the
  exactly-one-book rule.
- **The run order works on the real tree.** All 7 planned keys pass the exactly-one-book rule, and none of the 6 has
  a sidecar. Each of the 6 is referenced only from the mt-preview track, so ②'s mt-preview re-inject and re-render
  can clear every reference, and the census will read clean. No test pins chemistry's row count or the 6 rows; the
  render goldens cover ch01–07 and ch12, none of the affected chapters. `cnxml-render`'s `copyChapterImages` only
  warns on a missing source image and leaves the published copy in place, so a render between the retire and ②
  cannot break a page.
- **The MIT boundary holds.** No new `tools/` file imports `server/`. `retire-translated-figure.js` does not contain
  the literal `01-source`. `process.exitCode` has a failure default (`=1`) set before `run()`. `REPO_ROOT` comes from
  `import.meta.url`. That was checked by reading the code, not measured: M6 explains why the `--help` test does not
  prove it. The CLI's exit codes behave as specified, measured: `--help` 0, a usage error 2, a refusal 1.
- **The docs largely say what the code does.** That covers the README "four rules" section (rule 4 now says "not
  found, not refused"), the generator header's basename-keyed paragraph, the config note keys, the `resolve_detail`
  docstring, the `_paperSizes` per-candidate rule, the `docs/_generated/tools.md` row, and the register's ㊵, ㊷ and
  ㊻ rows. The ㊻ re-measurements are recorded with their instruments.

### Issues

#### Critical

None.

#### Important

**I1 — `--retire` treats a tracked mapping that is missing from the working tree as "no rows". It deletes the
translated copy, removes no row, prints `Done` and exits 0.**
`tools/retire-translated-figure.js:137` (`readMappingOrRefuse(mappingPath, { allowMissing: true })`). The plan
scripted this (`docs/superpowers/plans/2026-10-01-c140-c40-retire-and-pins.md:2500`).

- **What is wrong.** Spec D9 requires that "`image-mapping.json` parses as an array of objects" before anything is
  written. No ruling in the ledger relaxes that for `--retire`.
- **Reproduced** in a scratch git repo (mapping and copy tracked; mapping removed from the working tree):

  ```text
  removing: 0 mapping row(s); media/CNX_A_IS.svg … deleted … Done … EXIT 0
  ```

  After `git checkout -- …/image-mapping.json`: 1 row still names CNX_A, and the copy is gone.
- **Why it matters.** It is the mirror of the hole the Task 9 reviewer found in `--prune`, which was fixed with an
  explicit ruling (`46c21aa62`: refuse a missing mapping whenever there is a copy to judge). The destructive mode
  reports success on a retire it did not complete, and restoring the mapping leaves a row without its copy (a
  half-retire).
- **Blast radius, stated honestly.** It is limited to the named figures' tracked copies, and git can restore them.
  If the deletion were committed, CI's one-to-one test (`figure-config-validate.test.js:556`) would throw ENOENT and
  go red. The defect is the false "Done" and the hidden half-retire, not mass loss.
- **Fix.** Use the prune's rule: `allowMissing` only when nothing would be deleted. That keeps the census dry run
  working on a mapping-less book. Add one test: a tracked mapping removed from the working tree, `--retire --apply`
  exits 1, and the snapshot is unchanged.

#### Minor

**M1 — Text this PR wrote will go false at the retire commit, and no fix list names it.**
- The text is the new "Today only rvosmosis is refused: N2O5's .eps sibling resolves." It appears in three places:
  `sources.py:32-33`, `test_sources.py:193`, and `figure-text.config.json:38` (`_paperSizes`, "today only…").
- Measured today: rvosmosis is `production-page`, and N2O5 resolves to its base-tree `.eps`. After the retire
  commit, both are refused as `retired`, before any paper check, so the sentence becomes false.
- Neither spec D12's retire-commit list nor the register's step-7 list (four comments) includes these three.
- The ㊵ row's "After ㊴ (2026-10-01), `--stale` SELECTS all 10, because each has a mapping row"
  (`docs/plans/2026-07-21-post-item17-followup-campaign.md:3036`) also changes at the retire: it becomes 4.
- **Fix:** date the three sentences now ("On 2026-10-01, before any ㊵ retirement, only rvosmosis was refused…"),
  and add the `--stale` sentence to the register's step-7 retire-commit list. See triage L52.

**M2 — What the chemistry autorun does with the new refusal kinds.** Informational; one log line is needed.
- **Mechanism.** `scripts/chemistry-autorun-chapter.sh:207-208` echoes and halts only on `REFUSED — superseded`.
- **`retired`:** no halt, by D2's design, and the autorun summary does not echo the line either. The figure shows
  only in the `unresolved` bucket count and the NOTE; the full line is in `$CHD.fig.log`.
- **`pin-conflict` / `pin-missing` / `pin-invalid`:** neither halt nor echo. A pin that stopped holding would leave
  the figure English inside an exit-0, DONE=ok chapter run.
- **Exposure is narrow.** Once a pinned figure is bought, a plain run files it `skipped-current` before resolving it
  (`figure-run.js:2010-2015`). The autorun never passes `--stale`, and pins are bought by hand with `--figure`.
- **The decision is unlogged.** The ledger's Task 4 note says to decide this before the first pin. It is not in the
  register.
- **Chapter-level effect.** D2's autorun benefit is nil in chemistry today. In ch07, Morse is superseded and stays
  so; in ch19, Pattern_img does. Both chapters' autorun will keep halting after Ques11ans and BlastFurn are retired.
  No one should expect the retire to unblock those two chapters.
- **Fix:** log the decision ("before the first pin: should the autorun echo or halt on `REFUSED — pin-*`?") in the
  ㊵ row or ㊻, with the ch07/ch19 note.

**M3 — Two measured gaps from the ledger are not in the register.**
- **(i) Biology false all-clear** (Task 8, branch-level). On `liffraedi-2e`, `--retire` would report "nothing to
  retire: no mapping row, no translated copy" while a copy and its row exist.
  - Measured: 34 rows, 0 with `originalImage`, all with an `_is` suffix.
  - The validator's retired-state check would read 0/0 there for the same reason.
- **(ii) Cross-book fold twins** (Task 7 observation). The tables are global, the validator's exactly-one-book rule
  matches exactly, and `sources.py` folds.
  - Measured: 22 basenames (11 groups, physics against biology) are each exactly in one book but fold onto a
    different spelling in the other.
  - A retired or pinned key on one of them passes CI and is applied to the other book's figure at run time.
  - Chemistry has 0 such basenames.
- Both are outside ㊵'s chemistry scope; together they are triage L41 and the addendum. **Fix:** log both as ㊻
  items. Optionally make the owner rule also count fold owners.

**M4 — The spec says "(logged)" for a limit nobody logged.** The Known-limits line at
`docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md:121-122` says the retire tool's mapping helpers
copy `figure-run.js`'s module-local ones "(logged)". No register line carries that; ㊻ has ①–⑩ and none is this.
**Fix:** add one clause to ㊻. The spec is frozen, so the register is the right owner.

**M5 — The retire tool restates the sidecar path instead of calling its owner.**
- `tools/retire-translated-figure.js:157` builds `path.join(bookDir, 'figure-text', `${name}.is.json`)` by hand.
- The owner is `sidecarPath` in `tools/lib/figure-text-sidecar.cjs`. figure-run states the rule: "Derived from
  `sidecarPath`, never spelled out" (`figure-run.js:733`).
- **Why it matters:** if the layout ever moved, the tool's "has a sidecar" refusal would fail open and retire a
  bought figure.
- **Fix:** `createRequire(import.meta.url)('./lib/figure-text-sidecar.cjs').sidecarPath`, which
  `publish-figure-svg.js` already does.

**M6 — Review Focus 4's test cannot fail on the property it names.**
- The focus asks that the CLI run from another cwd find the repo by its own location. The test that covers it is
  `retire-translated-figure.test.js:354`, which spawns only `--help`.
- `--help` returns before any repo path is used, so a `REPO_ROOT = process.cwd()` mutant survives. The code is right
  by inspection.
- The mutation pass's target list does not include `REPO_ROOT`.
- **Fix:** spawn `--book __no_such_book__ --prune` with `cwd: os.tmpdir()`. Assert exit 1 and that stderr names
  `<repo>/books/__no_such_book__`, derived from the test file's location.

**M7 — figure-run mislabels a pinned production page.**
- `refusalReason` (`figure-run.js:1656-1664`) builds the production-page text itself: "the only artwork in
  ${edition} is a production page". For a pin, `sources.py` refuses its exact pinned file as `production-page`, so
  that sentence is false.
- It also drops `sources.py`'s own reason ("the pinned file in X is a Letter-size page").
- This is a ㊵ × ⑦ seam that no ledger line caught. It is contrived, because nobody pins a sheet, and the pre-buy
  check reads `sources.py`'s human report.
- **Fix (optional):** append `refusal.reason` when present.

**M8 — `supersededArtwork` does not act by presence.**
- D2 says "A key acts by its presence", and `retired` and pins do act that way. `sources.py:317-318`
  (`reason = folded.get(...)`, `if reason is not None`) does not refuse a superseded entry whose value is JSON `null`.
- The validator's reason rule catches it in CI. The code is pre-existing.
- **Fix (optional):** `if _normkey(basename) in folded`, with retired's "(no reason recorded)" fall-back. It is one
  line and makes the three tables uniform.

### Deferred-minor triage

**The rule I applied.**
- **(a)** only when the fix is cheap and at least one of these holds: it is safety-relevant (the delete direction, or
  the real repo's data); it is PR-authored text that will go false or mislead about which picture wins; or the
  controller already ruled it for the final fix wave.
- **(c)** for anything that fails closed and loud, is unreachable by every current caller, or is already resolved.
- **(b)** for real work that belongs in the register.
- Two (a) items are known surviving mutants. They are marked **→ mutation pass**, so they are fixed once, not twice.

| # | ledger line (abridged) | class | reason |
|---|---|---|---|
| L1 | T1 `retiredFigureNames` empty Set when cfg not an object | (c) | A non-object config fails `figure-text-config.test.js`'s plain-object check in CI, and crashes `sources.py` at import first. |
| L2 | T1 five-row fold table shared only once T2 lands | (c) | Resolved: `test_sources.py` `_NORMKEY_CASES` carries the same five rows, including `'Ö_Ð-þ²'`. |
| L3 | T1 config notes are forward references | (c) | Resolved: every tool the notes name now exists. |
| L4 | T1 two asserts looped in one `it`; `endsWith().toBe(true)` | (c) | Affects failure diagnostics only. |
| L5 | T1 `readFile` seam / invalid-JSON throw untested | (c) | No caller passes the seam, and the throw is `JSON.parse`'s own. |
| L6 | T1 RED evidence thin; no mutants run | (c) | Process note; the scheduled mutation pass covers it. |
| L7 | T2 page-less candidate branch untested until T3 | (c) | Resolved: "a candidate with no page size is printed as its path alone" exists and passes. |
| L8 | T2 checks crash instead of FAIL; check 1 doesn't pin `candidates: []` | (c) | A crash still denies `ALL PASS` loudly; same idiom as ⑦. |
| L9 | T2 fold-and-lookup repeated per table (DRY) | (c) | The three blocks deliberately differ (presence, `is not None`, duplicate detection). The one real asymmetry is M8. |
| L10 | T3 `fa421d68c` body credits T2's change | (c) | Commit history; not worth a rewrite. |
| L11 | T3 `run_cli --json` pin test lacks rc 0 | (c) | The retired `run_cli --json` test asserts rc 0 on the same code path. |
| L12 | T3 alias `pin-conflict` candidates unsorted | (c) | Affects message order only. |
| L13 | T3 "refuse on ANY fold-duplicate" mutant survives | **(a) → mutation pass** | Known survivor; Task 12 Step 2 requires every survivor killed. Add a non-folding third key and an unpinned fall-through assertion. |
| L14 | T3 wrong-typed truthy `artworkPins` falls through | (c) | Only a string shape is silent; the validator's must-be-an-object rule catches it, and the run order runs the validator before any buy. |
| L15 | T4 no-reason fall-back untested; four kinds interpolate unguarded | (c) | `sources.py` always supplies a reason for these kinds (retired defaults to "(no reason recorded)"). |
| L16 | T4 `pin-missing` wording contradicts "not missing" | (c) | Record-only text; stdout uses summarise's generic line with `sources.py`'s reason. |
| L17 | T4 "found a file" framing in the docstring/NOTE | (c) | The NOTE names every cause, and the per-figure REFUSED line carries the reason; no operator action changes. |
| L18 | T4 `via` guard: `[basename, outcome]` only, first loop only | (c) | `via` is read in neither loop (`figure-run.js:2026`, `:2065`). |
| L19 | T4 no retired/pin-* test through `summarise` | (c) | The line is kind-generic (`REFUSED — ${r.refused}`); a regression could only make the autorun halt more. |
| L20 | T5 `beforeEach` returns the mock (teardown) | (c) | Harmless: the extra call runs after each test's assertions, and the next `beforeEach` resets it. |
| L21 | T5 "NEVER mapped" means "no new row" | (c) | A retired figure that keeps a row fails the validator in CI ("run … --retire"), so the overstatement cannot persist. |
| L22 | T5 generator dry-run test lacks a positive control | (c) | Pre-existing behaviour; affects test strength only. |
| L23 | T5 `vi.mock` replaces the whole module | (c) | A newly imported name would be `undefined` and fail loudly. |
| L24 | T5 "Skipped … retired" print untested | (c) | Print only; the data level is pinned. |
| L25 | T5 bare ENOENT/SyntaxError; chapter arg cannot address appendices | (c) | ENOENT names the path; no consumer passes a chapter; pre-existing. |
| L26 | T6 a needle without the marker reads as "no references" | (c) | Unreachable: both callers build needles ending in `<suffix>.` by construction. |
| L27 | T6 non-ENOENT rethrow in `findReferences` untested | **(a) → mutation pass** | It guards the delete direction: an unreadable referrer must not make a copy look orphaned. A catch-continue mutant is a known survivor (T9). Inject EACCES via `readFile`. |
| L28 | T6 git-fixture inherits `GIT_*` env | **(a)** | Measured. An absolute `GIT_INDEX_FILE`, as `git commit -a` or a partial commit gives hooks, makes the fixture's `git add -A` overwrite the outer repo's index. A relative one, as in a plain pre-commit, is safe; `rebase --exec` exports none. The helper is new in this PR, and the fix is a 3-line env scrub. |
| L29 | T6 `isDir` EACCES; half tmp; `restoreFromHead` throw untested | (c) | Fails safe on every deleting path; the tmp file is gitignored; the throw is now tested ("RESTORE ALSO FAILED: git restore failed …"). |
| L30 | T6 header count and the unpinned D13 premise | (b) | Log a corpus pin of "0 external references in translated SVGs" against composer changes; it is the only premise the prune's exclusion rests on. The count itself is a dated measurement. |
| L31 | T6 `--relative` with a `..`-escaping rel | (c) | Unreachable: `repoRoot` is the top-level and every rel is built under `booksRoot`; a rel outside the repo makes git fail, which refuses. |
| L32 | T7 `editionPrecedence` shape trusted | (c) | A non-array breaks `sources.py`'s lookup first. |
| L33 | T7 `retiredState` inherited properties | (c) | Such a key also fails the one-book rule, and the throw turns CI red. |
| L34 | T7 partial mirror of `_pin_invalid` (`./`) | (c) | Every gap fails closed at run time as `pin-invalid`. |
| L35 | T7 `MIN_REASON` naming | (c) | `<=` with an "over 40" message is correct. |
| L36 | T8 CLI guard false through a symlink | (c) | Silent but safe (nothing runs); the idiom is shared by 23 tools; the repo path here is not symlinked (`realpath` checked). |
| L37 | T8 name rule ignores a KEPT row naming the file | (c) | Unreachable: the generator and figure-run's mint both derive `outputName` from the same basename (`figure-run.js:383`); 0 such rows exist. |
| L38 | T8 "restored" decided by an empty joined string | (c) | Every throw site in the rollback carries a message. |
| L39 | T8 named-file comparisons; refusal rows don't pin the file | (c) | Test strength; the vacuity lens covers it. |
| L40 | T8 `retired ?? new Set()` mutant; repeated `--book` | (c) | The mutant fails closed and loud ("no retiredFigures entry") at first use, and run-order step 2's dry run exercises the real config. A wrong `--book` is refused by the basename check. |
| L41 | T8 biology "nothing to retire" | (b) | A false all-clear for both the tool and the validator on a withheld book (see M3). |
| L42 | T9 no `deleted …` list on part-way failure | (c) | It matters only in a double fault, where `git status` lists exactly the deleted tracked files. |
| L43 | T9 corpus scan error is uncaught | (c) | Loud, exit 1, nothing deleted. |
| L44 | T9 outside-repo `existsSync` proves nothing alone | (c) | Test strength; the `toThrow` discriminates. |
| L45 | T9 plan lines printed, never `result.done`; test :692 title | (c) | After a failed `--apply`, stderr says every deleted file was restored. |
| L46 | T9 `planPrune` returns `{refusals}` alone | (c) | Fails safe. |
| L47 | T9 rethrow unpinned (whole-branch) | **(a) → mutation pass** | Same fix as L27; one test closes both. |
| L48 | T9 referrer identity, a plural, the ignored-file form | (c) | Test strength and grammar; a `.backup.<ts>` file is ignored through the same `--exclude-standard` path. |
| L49 | T9 EACCES published dir + invalid mapping → stack trace | (c) | Fails closed, nothing deleted. |
| L50 | T10 generator `main()` stderr "no matching `<figure>`" | (c) | Already logged as ㊻⑩. Fixing it in the wave and striking ⑩ would be cheaper, but it is optional. |
| L51 | T10 literal suffix in the README / generator header | (c) | Pre-existing; the generator owns the value, and the README line predates ㊵. |
| L52 | T10 ✏️ markers; 0.2 vs 0.4 s; **undated "Today only rvosmosis"**; `PLAIN_NAME` restated; literal suffixes | **(a)** for "Today" only | That sentence goes false at the retire commit and is on no fix list (M1); date it. The rest is (c): step 3 restates the ✏️-marked D11 amendment, every D10 edit is marked, both timings are dated "about" measurements (I measured 0.35 s), and the `PLAIN_NAME` copy sits in the constant's own file. |
| L53 | T10 the plan still scripts "re-adds any row" | (c) | Resolved by `c2a4d5f74` (plan :1202 and :3002 now carry the corrected sentence). |
| L54 | Ruling: correct the plan's two copies in Task 11 | (c) | Done in `c2a4d5f74`. |
| L55 | T10 README:91-92 lookup reads "flat" | **(a)** | PR-authored text describing which picture wins, earmarked for the final fix wave. One phrase fixes it: "for each edition in order: its exact names in `SOURCE_EXTS` order, then a fold within that edition". |
| L56 | T10 ambiguous fold above a lower-tree Letter page → `production-page` | (c) | Contrived; ⑦ documents the refusal, and ㊻⑨ logs the fall-through class. |
| L57 | T11 the plan's Task 5 header still has the figure-id paragraph | **(a)** | Controller ruling: banner the plan as executed ("where this plan's scripted text differs from the tree, the tree wins"). It is still unbannered at HEAD (`plan:1194-1195` keeps `loadImageMapping` and `<figure id>`). |

**Totals: (a) 7 lines (6 distinct fixes, since L27 and L47 are one) · (b) 2 · (c) 48 = 57.**

**Addendum: ledger lines outside the 57.** The deferred-minors file was cut at 00:33. The ledger runs to 00:48, and a
few earlier "observation" and "log" lines were not exported. I saw each of these:
- **T4 observation, "autorun halts only on `REFUSED — superseded`; decide before the first pin" → (b).** Not in the
  register; see M2.
- **T7 observation, "the exactly-one-book rule is exact while Python folds; 11 fold-twin groups" → (b).** Measured as
  22 basenames, physics against biology, 0 in chemistry; see M3.
- **T8 out-of-scope, "`Error: Unknown command 'update'` noise from `source-write-guard.test.js`" → (b).** The ledger
  said "log"; the register has 0 hits for it.
- **T11 "(deferred → final fix wave)": the measurements ran 2026-10-02 00:07–00:30 UTC → (a).** Ruled for the final
  wave. The stale strings are ㊻'s "re-measured 2026-10-01" (`:3042`) and ㊷'s "re-run 2026-10-01" (`:3038`), and
  `a46344111` is dated 2026-10-02 00:30Z. §C163's "re-measured 2026-10-01" (`:7455`) is correct and must stay: it
  comes from `765f0a77e`, 2026-10-01 11:44Z.
- **T11 plan residuals (Task 5's header, "Seven findings", the Opus trailer lines) → (a).** Covered by the same
  executed-plan banner as L57.
- **T11 "(no action)": the ㊵ cell's "measured: values…" claim sits one hop away in `facts.json` → (c).**

### Declined to judge

- **`tools/docx-import.js` as a third writer of `image-mapping.json`.** It overwrites the whole file and ignores
  `retiredFigures`. It is biology's legacy figure-id route, outside ㊵'s chemistry scope, and D10's "both writers"
  means the generator and figure-run.
- **figure-run's `mappingPreflight` calls `buildMappingEntries` without `retired`.** D7 scopes figure-run to wording
  only, and D2's resolver refuses a retired figure before it can get artwork, so the mint is unreachable.
- **`--prune --apply` run before ② would already delete the 9 leftovers.** That is safe, because nothing references
  them. The "after ②" in the run order is ordering advice that the tool need not enforce.
- **A per-module Vista + Birta of ch11/18/19/21 on prod after the deploy and before ②.** This is the pre-existing D14
  concern. It is not specific to ㊵, and a render does not break a page (measured above).
- **The autorun halting on already-ruled superseded entries (Morse, Pattern_img).** Pre-existing autorun behaviour,
  noted in M2 only so nobody expects the retire to change it.
- **Twin paths that are symlinks or differ only in case inside the delivery trees.** The twin check compares path
  strings. Out of scope: Linux, and the deliveries are read-only.
- **D13's skip list includes `.pdf` and `.zip` beyond "raster and font".** Harmless: those formats embed images and
  do not reference a figure by name.
- **The generator's `process.exit` after its help text.** Pre-existing, and ㊻③ territory.
- **The by-hand census in human mode exits 1 when all 7 are refused.** That is its documented semantics ("non-zero
  whenever a name did not resolve").
- **figure-run discards `via` (`resolvedVia = 'basename'` for a pinned hit).** This is the D6 contract, and the
  lineup reads the pin from `sources.py`'s human report.
- **The four census and read-layer scripts ignore all three tables.** D6 says logged, not changed, and ㊻⑧ logs it.
- **vefur's service-worker caching of a recompose with the same name.** The spec's Known limits leave this for vefur
  to confirm.
- **The faithful-track ibuprofen copy and ㊻①/②.** They wait on the [LEAD] faithful-overlay ruling, as the register
  says.
- **The deep hunts on resolver order and pins, deletion safety, predicate false negatives and test vacuity.** Left to
  the parallel adversarial review and the mutation pass, by the caller's instruction.

### Recommendations

1. **One fix wave before the PR:**
   - I1 and its test.
   - The six distinct (a) fixes:
     - the L13 mutant row (→ mutation pass);
     - the L27/L47 EACCES rethrow test (→ mutation pass);
     - the L28 `GIT_*` scrub in `git-fixture.js`;
     - L52, dating the three "Today only rvosmosis" sentences;
     - L55, the README rule-4 phrase;
     - L57, the executed-plan banner, which also covers the T11 plan residuals.
   - The T11 register dates.
2. **Log in ㊻, in one docs commit:**
   - the M2 autorun decision for pins, with the ch07/ch19 note;
   - M3 (i), biology, and (ii), cross-book fold twins;
   - M4, the spec's "(logged)" mapping helpers;
   - L30, the D13 premise pin;
   - the `Unknown command 'update'` test noise;
   - the `--stale` "SELECTS all 10 → 4" change in the step-7 retire-commit list (M1).
3. **Optional and cheap, worth taking in the same wave:**
   - M5, importing `sidecarPath` (the owner; it fails open otherwise);
   - M6, a cwd test that can fail;
   - M7, the pinned production-page wording;
   - M8, superseded acting by presence.
4. **For the retire commit,** the text fix list is D12's four comments plus the ㊵ row's `--stale` sentence. Add the
   three "Today" sentences too if they are not dated now. The full basenames of the 6 are:
   - `CNX_Chem_11_04_rvosmosis`
   - `CNX_Chem_18_07_N2O5`
   - `CNX_Chem_18_07_molecreso`
   - `CNX_Chem_18_09_Cl2OClO2`
   - `CNX_Chem_19_01_BlastFurn`
   - `CNX_Chem_21_03_RadioDecay-e619`

   With `CNX_Chem_07_04_Ques11ans_img`, each is an exact single-book key.
5. **After the fix wave,** re-run the full gate the way CI runs it: `npm test`, lint, `format:check`, `docs:check`,
   and the composer Python suites that import `sources.py`, before asking [USER] to push.

### Assessment

**Ready to merge? With fixes.**

- **The design is implemented faithfully.** D1–D14 hold as written or as dated amendments. I measured each cross-task
  seam the caller named:
  - the JSON contract;
  - generator durability, including figure-run's mint;
  - fold agreement (identical on every code point both runtimes know);
  - corpus identity between the validator and the retire tool;
  - the autorun's response to the new kinds.
- **It works on the real tree.** The run order produces the planned plan; the census can come out clean after ②;
  nothing in CI pins the 6 rows.
- **No Critical.** There is one Important item: an unexplained D9 deviation in the destructive mode (I1). Its blast
  radius is bounded and git can restore it, but it reports a false "Done". It is a one-line fix plus a test, mirroring
  a ruling already made for `--prune`.
- **The rest is small.** The six (a) items are cheap, and two of them are known mutation-pass survivors. The Minor
  items are a few lines each, or one-line register entries.
- **Once the wave lands, and the gate and mutation pass are green, this is ready for [USER]'s push decision.**

`git status --porcelain` at the end of the review: *(empty)*
