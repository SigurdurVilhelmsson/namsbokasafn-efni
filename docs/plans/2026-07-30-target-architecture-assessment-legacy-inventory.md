# Target-architecture assessment — LENS A: the legacy removal inventory

**Written:** 2026-07-30 · **Branch:** `feat/c16-segment-edit-reattach` @ `d775e777` · **Status of this file:** assessment evidence, **not** status. Per CLAUDE.md § *One source of truth*, open work is owned by `docs/plans/2026-07-21-post-item17-followup-campaign.md`. Nothing here supersedes the register; where this file and the register disagree, **fix the register** and treat this as the measurement that justified the change.

**Scope:** the lead's goal 2 ("remove ALL legacy code from the retired pipeline era") plus what goals 1 and 3 cost as a consequence. Every claim below is a `file:line` or a command I ran on this tree.

---

## 0. The answer, up front

**The lead's three goals do not compose into one campaign item. They are three items with different sizes and one hard dependency direction.**

1. **Goal 1 (re-extract + re-MT everything) is the gate for most of goal 2, and it is sized by an ambiguity nobody has resolved.** "ALL current content" is either **187 modules** (what has been extracted so far) or **1192 modules** (what is in `01-source/`). That is a 6.4× difference in machine cost and a difference between **M** and **XL**. See §1.
2. **Goal 2 splits into three tranches, not one deletion PR.** A genuinely dead tranche that can go today (**S**), a curly-marker tranche that goal 1 retires (**S**, gated), and a markdown/`hasApiMarkers` tranche that **no amount of re-extraction retires** because the editor's own toolbar regenerates it (**L**, needs its own design). See §3, §4.
3. **Goal 3 (Icelandic CNXML conforming to OpenStax's spec) already half-exists and is better than the docs suggest** — chemistry's 149 reinjected modules are exactly as schema-valid as the pristine OpenStax source (`experiments/cnxml-validation-gate/FINDINGS.md:83`), biology has 13 traced defects. But **schema validity ⊥ fidelity** (CLAUDE.md), and the fidelity tail is genuinely **UNKNOWN**. See §7.

**Fit with the campaign:** this is not P1 C16 grown a bit. C16 is the *audit*; the lead is describing the *clean break plus a target architecture*, which is C16 + a re-processing campaign + an editor-vocabulary redesign. Realistically it is **its own campaign** with C16 as its first item. What is achievable in a "next heavy session in ~2 days" is: **settle the two blocking measurements (§8.1, §8.2) and ship the six decision-free rows of the S tranche (§3).** Nothing else.

---

## 1. The corpus census — the number that sizes goal 1

Measured 2026-07-30 (`find` over `books/`, backups excluded where noted):

| book | `01-source` .cnxml | `02-for-mt` EN | `02-mt-output` IS | `03-faithful` | `03-translated` | published .html |
|---|---|---|---|---|---|---|
| edlisfraedi-2e | 283 | 9 | 9 | 0 | 9 | 15 |
| efnafraedi-2e | 149 | 149 | 149 | **4** | 153 | 266 |
| liffraedi-2e | 259 | 11 | 11 | 0 | 11 | 19 |
| lifraen-efnafraedi | 342 | 8 | 8 | 0 | 8 | 13 |
| orverufraedi | 159 | 10 | 10 | 0 | 10 | 22 |
| **total** | **1192** | **187** | **187** | **4** | **191** | **335** |

⚠️ **The module column is not the whole MT input.** `api-translate.js:265` also translates a per-chapter `exercises-segments.en.md`, and `:1137` a `chapter-metadata-segments.en.md`. Neither matches an `m*` glob. In **lifraen-efnafraedi this is the majority of the book's extracted text**: 8 module files hold 55,555 chars, while **31 `exercises-segments.en.md` hold 727,183**. Any census that globs `m*-segments.en.md` undercounts organic chemistry by 14×. (It also explains the otherwise impossible 7,022-segments/56,892-chars pairing: 358 module segments + 6,664 exercise segments.)

MT volume and cost, recounted over **all** `*-segments.en.md` excluding `.backup.*` (`ISK_PER_1000_CHARS = 10`, `tools/lib/malstadur-api.js:28`; `estimateIsk` at `:37` — **a code constant, not a verified contract price; it multiplies every figure below**):

| book | EN chars (all segment files) | of which module files |
|---|---|---|
| efnafraedi-2e | 3,538,131 | 3,536,879 |
| lifraen-efnafraedi | **782,738** | 55,555 |
| liffraedi-2e | 208,902 | 208,769 |
| edlisfraedi-2e | 196,665 | 196,589 |
| orverufraedi | 177,632 | 177,518 |
| **total** | **4,904,068** | 4,175,310 |

| scope | EN chars | est. ISK |
|---|---|---|
| re-MT what is already extracted (187 modules + 31 exercise sets) | **4,904,068** | **~49,000** |
| extract + MT the whole corpus (1192 modules) | **~20.5M** | **~205,000** |

The full-corpus row is an **extrapolation, not a measurement**: per book, `(module chars ÷ modules extracted) × modules in 01-source`, plus organic's already-extracted exercises. Per-book chars/module vary 3×, and four of the five books extrapolate from a 8–11 module sample, so treat ±40% as the honest band. **Do not spend against this number** — get the real one from `--dry-run` (§8.2).

Wall-clock: `api-translate.js` has a `--rate-delay` default of **500 ms** (`tools/api-translate.js:735`) and I found **no batching** — the grep for `batch` in `api-translate.js` + `lib/malstadur-api.js` returns one unrelated comment. At one call per segment, the 30,932 segments in today's `02-mt-output` are ≈4.3 h of unattended run; the full corpus would be ≈27 h. **Confirm the call-per-segment assumption before quoting either.**

**This table is also the counter-argument to "the only editorial work to preserve is two modules in chemistry ch03."** Only 4 faithful files exist on disk *anywhere*, so the on-disk signal agrees with the lead — but §C16 already flags that "62 is a floor" and that prod's `sessions.db` may hold `pending`/`discuss` rows that never became a faithful file. **The repo cannot settle this.** See §8.

---

## 2. Independent re-derivation of §C16's marker census

I re-ran the census rather than trusting the register (CLAUDE.md's standing instruction for the MIT→AGPL enumeration applies equally here). Backups excluded; counting unit = **files containing ≥1 occurrence**.

| book / stage | `{{i}}` `{{b}}` | `{{term}}` `{{fn}}` | `{{SEG:}}` |
|---|---|---|---|
| efnafraedi `02-for-mt` | 0 | **108** | **49** |
| efnafraedi `02-mt-output` | **76** | **102** | **7** |
| efnafraedi `03-faithful-translation` | **1** | **1** | 0 |
| efnafraedi `03-translated` | 0 | 0 | 0 |
| edlisfraedi EN/IS | 0 / 0 | 8 / 8 | 0 |
| liffraedi EN/IS | 0 / 0 | 4 / 4 | 0 |
| lifraen-efnafraedi EN/IS | 0 / 0 | 6 / 6 | 0 |
| orverufraedi EN/IS | 0 / 0 | 10 / 10 | 0 |

**§C16's table reproduces exactly**, with two additions it does not cover:

- **The `03-faithful-translation` stage.** `books/efnafraedi-2e/03-faithful-translation/ch03/m68700-segments.is.md` — **one of the two ch03 modules the lead wants to preserve** — is written in the curly dialect: **7 `{{i}}` and 5 `{{term}}` opening tags** across 282 segments. `.../ch01/m68664-segments.is.md` carries **8 markdown `__x__`**. This is an ordering constraint, not a blocker (see §5, step 4).
- **`{{SEG:}}`, which §C16 does not census at all.** See §4, item 9 — the code comment that says it is backup-only is **wrong**.

**Corroboration that the curly families are not regenerated:** `tools/cnxml-extract.js` emits `[[i:` / `[[b:` (`:298-306`), `[[term:text|id]]` (`:339`), `[[fn:text|id]]` (`:407`). It emits **no** `{{…}}`. The `{{i}}text{{/i}}` prose at `cnxml-extract.js:274` is a stale comment describing code that was replaced directly below it — worth deleting on sight. So the curly families **decay** under re-extraction. This is the crucial contrast with the markdown family, which **regenerates** (§C16's 2026-07-30 correction, `server/public/js/segment-editor.js:972-977`).

**Therefore the task prompt's reasoning is CORRECT for the curly families and WRONG for the markdown family.** Re-extracting all five books flips `{{i}}`/`{{b}}`, `{{term}}`/`{{fn}}` and `{{SEG:}}` from (iii) to (i). It does not touch `hasApiMarkers` or the markdown converters.

---

## 3. Removal inventory — tranche S (no data dependency)

**Six of the eight rows below carry zero decisions and are one clean PR. Two (rows 6 and 7) are lead-gated and should NOT be in it.**

Classification: **(i)** fully dead → delete · **(ii)** partially live → replace first · **(iii)** load-bearing back-compat → retire the data first.

| # | Artifact | Class | Reachable? | Test-pinned? | What breaks | Size |
|---|---|---|---|---|---|---|
| 1 | `tools/archived/` (14 files) | **(i)** | **No** | No | Doc regeneration, see below | S |
| 2 | `books/*/for-align/` | **(i)** | No | No | Nothing | S |
| 3 | `books/efnafraedi-2e/04-localization/` | **(i)** | No | No | Nothing — **and §C16(e) is now stale** | S |
| 4 | `routes/status.js:1264` `files.json` branch | **(i)** | Yes (dead branch) | **No — verified** | A phantom `files: null` in the response contract | S |
| 5 | `tools/validate-chapter.js` `directives` check `:352-393` | **(i)** vacuous | Yes, runs | **Yes** (`validate-chapter.test.js:186,197,202,365`) | Its 4 tests | S |
| 6 | `tools/docx-import.js` + `mammoth` dep | **(ii)** ⚠️ **[LEAD]** | CLI only | **Yes** (3 suites) | `restorePolicyFor` contract | S–M |
| 7 | `terminologyService.importFromKeyTerms` (§C16(b)) | **(ii)** ⚠️ **[LEAD]** | Yes, live route | No | Nothing (already a no-op) | S |
| 8 | 26,749 `.backup.*` files, 0.69 GB | **(i)** | No | No | Nothing (gitignored) | S |

**Evidence per row:**

1. **`tools/archived/`** — I grepped every archived filename across `*.js/*.cjs/*.json/*.yml/*.sh` excluding `tools/archived/` itself: **zero `require`/`import`/exec references**. The only code-adjacent hits are constant sets in `scripts/generate-tool-inventory.js:29,37,128` (`'prepare-for-align'` in `CORE_TOOLS`, `MANUAL_DESCRIPTIONS`, and a category map) — these are `Set`/object entries keyed on a tool name that no longer resolves, so they are already inert. **Confirmed no output drift, across all three generators.** `docs:generate` runs `generate-tool-inventory.js`, `generate-route-inventory.js` **and** `update-readme-sections.js`. (a) `docs/_generated/tools.md` contains **zero** entries for any archived tool (grep for `prepare-for-align|protect-segments|unprotect|translate-markdown|join-mt-output|init-faithful` → 0 hits), because the generator reads `tools/` top-level only (`scripts/generate-tool-inventory.js:11`). (b) `update-readme-sections.js:14,26` only rewrites content between `<!-- tools-start -->` / `<!-- routes-start -->` markers, and **README.md contains neither** (`grep -c "tools-start\|routes-start" README.md` → **0**), so the whole README is hand-written and outside the gate. **`npm run docs:check` will not break.** ⚠️ Doc references remain in `ROADMAP.md:73,76,79`, `README.md:100`, and the **README pipeline table at `:135-143`, which still teaches the retired flow** (`protect-segments-for-mt` as step 1b, `prepare-for-align` + Matecat as step 4). Those are prose that will then describe deleted tools; fix them in the same PR (§ *One source of truth*: fix B, don't log it in A).
2. **`for-align/`** — one file, `books/efnafraedi-2e/for-align/.gitkeep`. The only reader was `tools/archived/prepare-for-align.js`. Delete with row 1.
3. **`04-localization/`** — one file, `books/efnafraedi-2e/04-localization/README.md`. **§C16(e) is now out of date**: it says CLAUDE.md lists this directory in two places as an active write path. It no longer does — `grep -n "04-localization" CLAUDE.md` returns **nothing**; only `04-localized-content` appears (`CLAUDE.md:211,275`), and `.claude/settings.json:9` grants `books/**/04-localized-content/**`. The doc/reality conflict was closed by the 2026-07-29 CLAUDE.md rewrite. **What remains of (e) is one stray README.** Downgrade it in the register.
4. **`files.json`** — `find books -name files.json` → **0**. The `existsSync` at `server/routes/status.js:1265` is permanently false. **Not shape-pinned:** grepped `server/__tests__/` + `server/e2e/` for `filesData|files.json|'files'` — the only hit is an unrelated multer comment (`booksFilesRoutesAppendices.test.js:199`), so no test asserts `files` in the chapter-status response body. ⚠️ **Do not confuse this with `books/<book>/chapters/`, which is emphatically live** — it holds the `status.json` read model consumed by `pipelineStatusService.js:391`, `publicationService.js:417`, and eight sites in `routes/status.js`. Only the `files.json` line goes.
5. **A new finding nobody listed.** `tools/validate-chapter.js:352-393` is a live `directives` check that scans every `.md` in `02-mt-output` / `03-faithful-translation` / `04-localized-content` (`TRACKS`, `:58-70`) for unclosed `:::` blocks. `grep -rn "^:::" books/` → **0**. It is the exact "validator that passes vacuously" shape in KEY LESSONS: it runs, it can never fire, and its remediation hint points at `tools/repair-directives.js`, **which does not exist**. This is the last live consumer of the `:::` era. Its 4 tests construct synthetic `:::` fixtures, so they pass regardless of corpus state — a green suite proves nothing here.
6. **`docx-import.js`** — **no server route**: grep for `multer|upload|\.docx|mammoth` across `server/routes/` + `server/services/` finds only the terminology glossary uploader (`routes/terminology.js:27,852,899,961`). It is a **CLI-only** path. But deleting it is **(ii), not (i)**, because of a contract: `tools/lib/provenance.js:11` maps `'docx-import' → 'mutate'`, and `restorePolicyFor` **throws** on an unknown tool (`:16-22`). Six committed sidecars in `books/liffraedi-2e/reference-translations/ch03-human-docx/*-provenance.json` say `docx-import`. **Decide the contract, don't just delete the tool.** ⚠️ **And there is a live landmine:** `books/liffraedi-2e/02-mt-output/ch03/import-report.json` still exists, but all 7 sidecars in that directory now read `api-translate` (verified). `backfill-provenance.js:23-25` keys on that file's presence. It is harmless today only because `backfillBook` skips modules that already have a sidecar (`:32-35`) — **the clean break deletes those sidecars.** If `backfill-provenance.js` is then run, that chapter is stamped `docx-import` → policy `mutate` → the web-UI restore path mutates segments that api-translate produced. **Delete `import-report.json` as part of the clean break.** ⚠️ Dropping the `mammoth` dependency regenerates `package-lock.json` — CLAUDE.md's durable rule applies (Node 22 / npm 10 via `nvm use`, `cdn.sheetjs.com` xlsx entries intact). Simplest: delete the tool, defer the dep removal.
7. **`importFromKeyTerms`** — verified at `server/services/terminologyService.js:1201-1275`, routed at `server/routes/terminology.js:1010`. Its regex is `/:::definition\{term="([^"]+)"\}\s*([\s\S]*?):::/g` (`:1254`) and there are **0** `*key-terms.md` in the repo (only `.html`). Its second, independent defect is confirmed: `:1219` builds `` `ch${String(chapterNum).padStart(2,'0')}` `` and joins it into a **publication** path (`:1220`, `:1223`), where publication dirs are **bare** — the fourth instance of the two-conventions trap, unpinned and uncommented. **Both defects must be fixed together**; the path bug survives fixing the format. Under the target architecture the whole function should go, not be repaired — but that is a product call about whether chapter glossaries should seed terminology at all.
8. **26,749 `.backup.*` files, 0.69 GB, all in generated stages** (`02-for-mt` 3,103 · `02-structure` 11,494 · `03-translated` 12,152). `git ls-files "books/**/*.backup.*"` → **0**, and `.gitignore:19-20` covers them, so this is local disk only, not repo weight. The clean break regenerates all three stages anyway.

---

## 4. Removal inventory — tranche G (gated on goal 1's re-extraction)

| # | Artifact | Class today | Class after full re-extract | Evidence |
|---|---|---|---|---|
| 9 | `{{SEG:}}` normalization, `segmentParser.js:46` + `SEG_MARKER_REGEX:30` | **(iii)** | (i) | see below |
| 10 | `{{i}}`/`{{b}}` back-compat in `cnxml-inject.js` | **(iii)** | (i) | 76 files, chemistry IS only |
| 11 | `{{term}}`/`{{fn}}` parsing, `cnxml-inject.js:1476,1484` | **(iii)** | (i) **only if all five books are done** | 131 files across 5 books |
| 12 | orphaned split files `*(b).en.md` etc. (67 files) | **(i)** already | (i) | anchored regex, below |

**9 — the one place my evidence contradicts the record.** `server/services/segmentParser.js:44-46` says: *"The shared lib is HTML-comment-only; mustache only appears in **legacy backup files**."* That is **false**. Excluding backups, `{{SEG:` appears in **56 non-backup files** — 49 in `books/efnafraedi-2e/02-for-mt/` and 7 in `02-mt-output/` (e.g. `02-for-mt/ch01/m68683-segments(b).en.md`, `02-mt-output/ch05/m68724-segments(b).is.md`). Two consequences:
   - The comment must be corrected regardless of what else happens.
   - **Deleting the normalization at `:46` does not finish the job.** `SEG_MARKER_REGEX` at `:30` is a *second*, independently mustache-aware parser, used at `:441` and **exported** at `:467`. Both must go together, and the export is a public surface — check its consumers first.

   **Mitigating measurement:** every one of those 56 files is a `(b)`/`(c)`/`(d)` **split part**, and the current pipeline cannot see them — `api-translate.js:250` filters on the anchored `/^m\d+-segments\.en\.md$/`, and `cnxml-inject.js:4057,4092` constructs `` `${moduleId}-segments.en.md` `` literally. So they are orphaned artifacts of the split-file era, not live inputs. The one live consumer of the split *convention* is `server/routes/status.js:1343-1361` via `splitFileUtils.extractBaseSectionId` — and note that on today's filenames it collapses `m68683-segments(b).is.md` to the string `"m68683-segments"` and puts it in a set called `sectionSet`, i.e. it is producing module ids where the retired model produced section ids (`1-2`). **Flag, don't fix, until someone decides what that endpoint is for.**

**10 — `{{i}}`/`{{b}}`.** §C16's "known exit" holds and I reproduced it: 76 files, all `efnafraedi-2e/02-mt-output`, zero in chemistry's own EN, zero in any other book at any stage, zero in live `03-translated` output. Chemistry's IS is simply older than its EN. **A chemistry re-MT retires this family corpus-wide.** ⚠️ Plus one file the register's table misses: `03-faithful-translation/ch03/m68700-segments.is.md` (7 occurrences) — see §5 step 4.

**11 — `{{term}}`/`{{fn}}`.** 108/102 in chemistry, 8/8 + 4/4 + 6/6 + 10/10 in the other four. **This is the family that makes goal 1's scope decision load-bearing for goal 2.** If only chemistry is re-extracted, the parsing at `cnxml-inject.js:1476,1484` must stay and physics/biology/organic/microbiology depend on it. If all five are re-extracted, it becomes (i). **There is no middle ground that lets the code go.**

**12 — split files.** 67 files matching `*([a-z]).??.md`. Delete with the clean break.

---

## 5. Removal inventory — tranche X (does NOT retire, needs its own design)

| # | Artifact | Class | Why re-MT does not help |
|---|---|---|---|
| 13 | `hasApiMarkers` guard, `cnxml-inject.js:1249-1252` | **(iii) permanent** | the blanks defect below |
| 14 | markdown converters at `:1420-1440`, `:1481-1485`, `:1553-1560` | **(ii)** | editor regenerates the input |
| 15 | `mt-normalize.cjs` `normalizeTermMarkers` | **(ii)** | *produces* `__term__` from `**term__` |

I verified all of §C16's 2026-07-30 correction and it holds. The guard at `cnxml-inject.js:1249-1252` regex-sniffs the *translated text*; when it is false, three blocks fire. Its own comment at `:1417-1419` says the guard exists to stop the legacy converters "creating false-positive markup from translated content (chemical formulas, etc.)" — **live code written to contain stale code**.

**Three independent reasons this does not retire with data:**

- **The editor writes markdown.** `segment-editor.js:972-977` binds Ctrl+T to `__term__`; `cnxml-inject.js:1484` maps `__x__` → `<term>`. The first editorial keystroke after a re-MT puts the markdown family back.
- **`normalizeTermMarkers` is a *producer*.** `tools/lib/mt-normalize.cjs` converts excess `**bold**` in IS back to `__term__` whenever EN carried `__…__`. That is a second regeneration path, in the shared server/corpus normalizer.
- **§C16's confirmed reader-visible defect is source-derived.** `orverufraedi/02-mt-output/ch01/m58782-segments.is.md:197` is a fill-in-the-blank with `________`; no bracket marker → guard false → `:1484`'s `/__([^_]+)__/g` eats the middle and publishes `<dfn class="term"> og  (e. and )</dfn>`. The blanks come from `01-source`, which is read-only by project rule. **Re-extraction reproduces the input exactly and the defect recurs.**

**Consequence for goal 2 as stated ("remove ALL legacy"):** the honest answer is that `hasApiMarkers` and the markdown converters are **not legacy** — they are the current editor's vocabulary plus the guard that keeps it from misfiring. Removing them means **changing what the editor writes** (id-anchored `[[term:text|id]]` from the toolbar) and only then deleting `:1481-1485` and the guard. That is a coupled server-UI + pipeline change touching `cnxml-inject.js`, the highest-risk file in the tree (4,512 lines, reader-facing, book-wide re-injection). **L at minimum, and it needs `brainstorming → writing-plans → SDD` with a whole-branch adversarial review**, exactly as §C16 already prescribes.

---

## 6. Removal ORDER

Data before code, and per-book. Each arrow is a hard dependency.

```
0. [LEAD] settle the two blocking measurements (§8)
   ├─ prod query: SELECT book, module_id, status, count(*) FROM segment_edits GROUP BY 1,2,3;
   └─ scope decision: 187 modules or 1192?
        ↓
1. S TRANCHE — ship now, ZERO decisions in it  .................. S
   tools/archived/ · for-align/ · 04-localization/README.md ·
   files.json branch · validate-chapter directives check ·
   the stale cnxml-extract.js:274 comment · the wrong
   segmentParser.js:46 comment · the README:135-143 pipeline table
   1b. LEAD-GATED, separate PR: docx-import (needs the
       restorePolicyFor contract decided) · importFromKeyTerms
       (needs a product call on chapter-glossary seeding)
        ↓
2. PRE-BREAK CAPTURE — irreversible if skipped  ................. S
   a. export segment_edits from prod (scripts/export-segment-edits.js)
      + render the human document (scripts/render-segment-edits-md.js)
   b. capture the published filename list per track      ← C9 slug map
   c. A2 off-box DB backup restore-tested               ← [LEAD] gate
        ↓
3. RE-EXTRACT + RE-MT, book by book  ..................... M or XL (§1)
   delete 02-for-mt / 02-mt-output / 02-structure / 03-translated /
   05-publication/<track> · also delete the 67 split files, the 26,749
   .backup.*, and books/liffraedi-2e/02-mt-output/ch03/import-report.json
        ↓
4. HAND RE-APPLICATION of the preserved editorial work  ......... S
   ⚠️ m68700's text carries 7 {{i}} + 5 {{term}}; m68664's carries 8 __x__.
   These must be hand-converted to [[i:]] / [[term:text|id]] AS they are
   re-applied, or the curly back-compat you are about to delete is
   reintroduced by the very step meant to preserve the work.
   segment-edit-reattach-rules.js already FLAGS this to the editor
   ("inniheldur úrelt snið") but deliberately never rewrites — detection
   only, so the conversion is manual and must be verified.
        ↓
5. G TRANCHE deletion PR  ....................................... S
   {{i}}/{{b}} · {{SEG:}} normalization + SEG_MARKER_REGEX ·
   {{term}}/{{fn}} ONLY IF step 3 covered all five books
        ↓
6. X TRANCHE — separate sub-project, own plan  ................... L
   editor toolbar → id-anchored term markers, THEN delete
   cnxml-inject.js:1481-1485 and the hasApiMarkers guard
```

**Two ordering traps worth spelling out:**

- **Step 2b is one-way.** §C16 and CLAUDE.md § *Durable cross-repo rules* both say it: clearing `05-publication/<track>/` destroys the old filenames, and after vefur PR #200 ours is the only side that still knows them. The before/after file lists **are** the redirect map. Capture first, or the redirects are gone permanently. (Doing this correctly also closes one of C9's three efni tasks as a side effect.)
- **Step 4 before step 5, never the reverse.** The preserved text is in the dialect being retired.

---

## 7. Goal 3 — what "OpenStax-conforming Icelandic CNXML" actually costs

Better news than the docs imply, with a caveat.

- **`experiments/cnxml-validation-gate/FINDINGS.md:83`: "Chemistry's reinjected CNXML is exactly as schema-valid as the OpenStax source it came from."** 149/149 clean. Biology has **13 real defects in 7 of 11** reinjected modules, each traced to a stage (`:90`, `:102-108`). The top three are content-drop → empty `<glossary>`/`<section>` (MT, surfaced by inject), a malformed `<entry/>` making the file un-parseable (inject), and `<figure>` emitted after its `<media>` (inject).
- The experiment already costs the remaining work: wiring the gate into inject/render + the server apply path = **0.5–1 d** (`:223`); making inject fail loud on missing segments = **0.5–1 d** and is called "highest value per hour" (`:227`). Both are **S**.
- **⚠️ Caveat, and it is CLAUDE.md's own durable rule: schema validity ⊥ fidelity.** Chemistry has 37 known fidelity discrepancies and **0** schema errors. `docs/pipeline/cnxml-fidelity-gaps.md` is the fidelity record, and it is **dated 2026-03-18 and partly stale** — its marker column still describes the markdown era (`__text__` for `<term>`, `~sub~`/`^sup^`), which extraction stopped emitting. Its headline finding (`<term>` overproduction +56 in m68664, 16→72) is **the same defect family as §C16's `__…__` blank-mangling**, seen four months earlier and never connected.

**Sizing goal 3: S for the schema gate, UNKNOWN for fidelity.** The measurement that settles fidelity is a re-run of `tools/cnxml-fidelity-check.js` over a *post-re-MT* chemistry, compared against `books/efnafraedi-2e/fidelity-allowlist.json`. Do not size the OpenStax-contribution leg before that number exists.

---

## 8. Unknowns — what the repo cannot settle, and the exact measurement

1. **How much editorial work exists.** On disk: 4 faithful files, 62 applied segments (§C16). The lead says 2 modules. §C16 says 62 is a floor. **Measurement — one read-only query on prod, and run it WITHOUT the book filter, because goal 1 re-MTs every book:**
   `SELECT book, module_id, status, count(*) FROM segment_edits GROUP BY 1,2,3;`
   ⚠️ Do **not** substitute the `.locked` markers as an oracle — §C16 measured that all four committed markers came from one dev commit (`06058a0e`) and the authoritative prod run added none, so absence of markers is not absence of edits.
2. **Goal 1's scope: 187 modules or 1192?** This single answer moves goal 1 from **M** to **XL**, moves `{{term}}`/`{{fn}}` removal from blocked to unblocked, and changes MT spend by ~4×. **Measurement:** the lead states which. Then `node tools/api-translate.js --book <slug> --dry-run` per book for a real ISK figure — ⚠️ **verify that `--dry-run` is network-free before running it** (`api-translate.js:1216` prints the estimate, `:1223` creates the client on the non-dry path, but I did not trace the branch fully and did not run it under this read-only brief). ⚠️ Whatever tool produces the figure, make sure it counts `exercises-segments.en.md` — an `m*` glob misses 727k chars in organic chemistry alone.
3. **MT wall-clock.** I found no batching, but proving "one API call per segment" needs a trace of `createClient`'s call loop, not a grep. **Measurement:** one small module through `--dry-run --verbose`, or read `tools/lib/malstadur-api.js`'s translate loop.
4. **Whether `SEG_MARKER_REGEX`'s export at `segmentParser.js:467` has consumers outside the module.** I did not enumerate them. **Measurement:** `codegraph explore "SEG_MARKER_REGEX"`.
5. **What `routes/status.js:1343-1361`'s `sectionSet` is for.** It applies split-file section logic to module-id filenames. It may be harmlessly producing module ids, or it may be feeding a stale section view. **Measurement:** call `GET` on that endpoint against a real book and read the `sections` array.
6. **Post-re-MT fidelity** — see §7.

---

## 9. Tripwires — how "clean" stays clean

Cheap, because the assets exist:

| Tripwire | Where it goes | Why |
|---|---|---|
| corpus contains **zero** `{{i}}`/`{{b}}`/`{{term}}`/`{{fn}}`/`{{SEG:}}`, backups excluded | extend `tools/lib/residue-scan.js` (already the shared corpus scanner, consumed by `tools/scan-residue.js`) or a new `tools/__tests__/` corpus test | the families decay but nothing prevents a re-import putting them back; a deletion PR with no tripwire silently regresses |
| **the `.backup.*` exclusion must be part of the assertion** | same | every census in this file changes if backups are counted; §C16's did too |
| `hasApiMarkers` behaviour pin, asserting the `________` blank case | `tools/__tests__/` against `cnxml-inject.js` | §C16's confirmed defect has **no test today**; pin it red *before* the X tranche so the fix has an oracle |
| `05-publication` old→new filename map is emitted, not just deleted | the clean-break runbook, as a checked step | one-way loss (§6) |
| `import-report.json` is deleted alongside `02-mt-output` | clean-break runbook | otherwise `backfill-provenance.js:23` mis-stamps `docx-import` → `mutate` policy |
| `books/*/chapters/**/status.json` still parses after the break | `npm run validate` (exists: `scripts/validate-status.js`) | the live status read model lives in a directory that *looks* legacy |

⚠️ **Do not lean on `tools/verify-reextract-equivalence.js` as the re-extraction gate yet** — register §C8 `REEQ-1` records that `normalizeVisibleText`'s nested-bracket handling false-flags `m68727`/`m68747` and blocks clean chemistry runs today. Fix or waive that **before** step 3, not during it.

---

## 10. Bottom line for the lead

- **Ship the six decision-free rows of the S tranche in the next session** (§3, step 1 of §6). It is a real deletion PR, it needs no prod query, it removes the last `:::` consumer, and it corrects two wrong code comments plus a README table that still teaches the retired pipeline. That is a good use of a constrained session. Leave `docx-import` and `importFromKeyTerms` out of it — both need a decision, and a PR with a decision in it is a PR that stalls.
- **The two blocking measurements (§8.1, §8.2) are five minutes of the lead's time and they resize everything else.** Do them first.
- **Do not schedule goal 2 as "one deletion PR after the re-MT."** It is three PRs with a designed sub-project at the end.
- **The single most important correction to the target statement:** "remove all legacy" cannot include `hasApiMarkers` and the markdown converters, because they are not legacy. They are the current editor's vocabulary. Retiring them is a product change to the segment editor, and it is the only part of this that is genuinely **L**.
