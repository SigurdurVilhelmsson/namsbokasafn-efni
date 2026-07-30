# Target-architecture assessment — the lead's three goals, sized

**Date:** 2026-07-30 · **For:** the lead, before the next heavy session · **Branch at time of writing:** `feat/c16-segment-edit-reattach`
**Status of this document:** **assessment evidence, not a register.** Open work is owned by
[`2026-07-21-post-item17-followup-campaign.md`](2026-07-21-post-item17-followup-campaign.md).
Where this file and the register disagree, **the register wins** — and §1 below lists the register lines
to correct, so this document does not become a second copy of them (CLAUDE.md § *One source of truth*).
Synthesised from five investigator lenses; their full narratives are the files named
`2026-07-30-target-architecture-assessment-{legacy-inventory,cnxml-roundtrip,editor-markers,exports,campaign-fit}.md`
in this directory.

---

## Verdict

**Yes for goals 1 and 2, no for goal 3(b).** Re-extracting and re-MT'ing the 245 extracted modules is **M**
— runbook written, spend measured per book with `--dry-run --force`, 4 git-tracked files to preserve.
Legacy removal splits into three tranches, two cheap. **Goal 3(b) — CNXML "contributable to OpenStax" —
is a separate campaign, not a delta**: no collection bundle exists, the schema gate is unwired, and two of
five books are CC BY-NC-SA, which OpenStax cannot republish.

**Biggest risk: the lead's own premise is wrong.** "Only two chemistry ch03 modules to preserve" omits hand
repairs committed into `02-mt-output/`, headed by `4e5be912` (m66441 *Fitusýrur* → *Lípíð*). A `--force`
re-MT re-translates that title and can silently revert it, flipping a live reader URL.

---

## 1. Register edits to apply FIRST — before any planning

These are corrections to
[the register](2026-07-21-post-item17-followup-campaign.md), each measured. Apply them in the register
itself; do not carry them forward from this file, or this file becomes the third copy that outlives the
fix (CLAUDE.md § *One source of truth*). This should be the next session's first action — one editing pass,
maybe fifteen minutes.

| # | Register line | Correct value | Evidence |
|---|---|---|---|
| R1 | §C16(a) reach: *"2 modules … 2 published pages"* | **3 published pages / 2 books.** The third is `books/liffraedi-2e/05-publication/mt-preview/chapters/03/3-exercises.html` | LENS editor-markers F1 — structural oracle (`/_<dfn class="term">|<\/dfn>_/`) over all published HTML, 3 hits; source segment `books/liffraedi-2e/02-mt-output/ch03/m66440-segments.is.md` `fs-id2024704`, `hasApiMarkers`=false confirmed by running the `cnxml-inject.js:1250` regex |
| R2 | §C16 marker table: `++text++` *"now at 0"* | **17 of 568 `*-segments.{en,is}.md`** carry the paired form (16 chemistry + 1 e2e fixture) | LENS editor-markers F3. ⚠️ The `*`, `~`, `^` rows were **not** re-derived — do not quote them in a deletion PR unverified |
| R3 | §C16(e): *"CLAUDE.md lists `04-localization/` in TWO places as an active write path"* | **No longer true.** `grep -n "04-localization" CLAUDE.md` returns nothing; the 2026-07-29 rewrite closed it. What remains is **one stray README file** — downgrade from doc/reality conflict to cosmetic | LENS legacy-inventory §3 row 3 |
| R4 | §C16: `{{term}}`/`{{fn}}` *"NOT retired by this migration"* | **True for a chemistry-only re-MT; FALSE under the lead's all-five-books scope.** All 56 non-chemistry files sit inside the 245-module extracted set, so the lead's scope rewrites every one | LENS campaign-fit §3.1, re-derived; LENS legacy-inventory §4 item 11 agrees |
| R5 | §C16's marker census covers `02-for-mt` and `02-mt-output` only | It does **not** census `03-faithful-translation` (where `m68700-segments.is.md` — a preserve-me module — carries 7 `{{i}}` + 5 `{{term}}`) and does not census `{{SEG:}}` at all (56 non-backup files) | LENS legacy-inventory §2, §4 item 9 |
| R6 | §C3 implies adding `books/*/tm/` to `PATHSPECS` is one line | `tm-export.cjs:467-470` `defaultOutPath` is **date-stamped**, and `tmService` regenerates on every debounced save → the pathspec as-is commits a new ~200 KB TMX per book per active day. Needs a fixed-name cron output or a prune step — a design call | LENS exports §2.3 |
| R7 | §C16 `:359-360` prescribes *"id-anchored `[[term:text|id]]`"* as the resolution (distinct from `:318`'s "fix direction unresolved", which is about the per-module provenance oracle) | Target the **bare** `[[term:text]]`. The bare form injects byte-identically to today's `__term__` with **zero** `cnxml-inject.js` changes (path `:1603`); a synthetic `|id` fires the `:1608-1613` warn on every editor-created term **and** writes an invented `id=` into the CNXML, colliding with goal 3(b). `|id` should stay extraction-only (`cnxml-extract.js:339` emits it only when the source `<term>` has one) | LENS editor-markers §3, verified against the real exported `reverseInlineMarkup` |

---

## 2. How this fits the campaign

### Register items the target SUBSUMES

| Item | Effect |
|---|---|
| **C16(b)** `importFromKeyTerms` · **(c)** `files.json` · **(d)** `for-align/` · **(e)** `04-localization/` | Retired by goal 2's S tranche. (c)–(e) are decision-free; (b) needs a product call on whether chapter glossaries should seed terminology at all |
| **P0-4** biology MC-options data op | Performed **by construction**. `liffraedi-2e` has 0 faithful files, so its re-extract is free; the re-MT is the cheapest of the five books. P0-4 gates P0-3, the campaign's stated reader goal |
| **C9** efni tasks 2 and 3 (delete the stale ch10 slug, re-render the intro) | Clearing and regenerating `05-publication/` closes both — **provided** Step 2's slug capture runs first. Task 1 (prune-on-rename **emitting** the map) stays open |
| **C8 REEQ-1** | Must be fixed or explicitly waived to run the re-extraction gate; the target forces the decision |

### Register items it does NOT subsume — and this is the trap

- **C16(a) `hasApiMarkers` survives the migration intact.** The register says so at `:353-356` and all three
  lenses that looked confirmed it independently: the fill-in-the-blank blanks come from read-only
  `01-source`, so a re-extract reproduces the input exactly and the converter fires again. **Goal 2 will
  feel finished when it is not** — the curly greps come back clean while `orverufraedi`'s exercises stay
  mangled on 3 published pages.
- **C5 authz-2 · C6 MTA edges · C7 terminology governance · C1 U3b · C4** — untouched. C4 gets a free
  re-test on the re-render but is not fixed by it.

### Register items it DISPLACES — finished work on disk that the break supersedes

Two things are rendered and correct on disk and are waiting only on the manual vefur sync. A clean break
re-renders both, so if they are not delivered first they are silently superseded rather than shipped.

- **C13's `liffraedi-2e` ch03+ch05 re-render** (register `:167`, [LEAD] queue item ①) — 6 section pages, no
  filename changes.
- **PR #321/#322 appendix-label re-renders** (register `:81-82`) — same posture.

**Mitigation is cheap: sync once before the break, or consciously accept they ride it.** Losing them
silently is the outcome to avoid.

⚠️ **But this is a lead decision, not a formality, because the sync is not clean.** R1's third C16(a) page —
`books/liffraedi-2e/05-publication/mt-preview/chapters/03/3-exercises.html` — sits in the **same directory
and the same sync** as the C13 fix, though it is not one of the 6 C13 pages. So:

- **Sync now** → C13 reaches readers immediately, and one known-bad exercises page ships with it.
- **Hold the sync** → both ride the break, C13 stays undelivered until phase 2 finishes, and the bad page is
  fixed by phase 4 step 2 rather than published.

Neither is obviously right; pick one deliberately.

### Prerequisites it INHERITS

| Prereq | What it actually gates | Register |
|---|---|---|
| **A5** re-MT spend authorization | Goal 1, hard. This assessment supplies the measured number (§4) | `:457` |
| **A2** off-box DB backup | **Narrower than it looks.** All 4 faithful files are tracked in git, so files cannot be lost. A2 gates only steps that **write** `segment_edits` — Step 4a supersede and Appendix A. It does **not** gate re-extract/re-MT of the unedited modules | `:305-307`, `:450` |
| **A4** manual QA walk | Gates **deploying `server/`**. Goal 2's C16(b)/(c) and all of goal 2b queue behind it. Goals 1 and 2a's `tools/`+`books/` half do not | `:451` |
| **C14** glossary dry-run on prod | **Must run BEFORE the re-MT**, not after — `api-translate.js:633` primes MT from `glossary-unified.json`, and the break re-renders everything from empty, so glossary state is baked into every page at once | `:180` |
| Manual vefur sync | The only route to readers. Nothing in goal 1 reaches a reader without it | `[[content-sync-vefur-broken]]` |
| **Gate 0** of the runbook | Editorial server stopped, backup cron paused, dev level with prod's content commit | [runbook](2026-07-29-c16-clean-break-runbook.md) `:20-51` |

---

## 3. The three goals are not equally hard

| Goal | Size | One-line justification |
|---|---|---|
| **1** — re-extract + re-MT the 245 extracted modules | **M** | Runbook written; spend measured per book; 4 git-tracked files to preserve; wall-clock is hours |
| **2a** — retire the curly families + retired-era artifacts | **S + S** (gated on 1) | Two PRs: six decision-free deletions now, curly deletions after the re-MT |
| **2b** — retire `hasApiMarkers` + the markdown converters | **L** | Not legacy: the editor's toolbar regenerates it. Editor change → deletion → `cnxml-inject.js` (4,512 lines, reader-facing) |
| **3a** — web export + glossary/TM/corpus exports keep working | **S** | Zero code change needed; verify after goal 1, don't build |
| **3b** — CNXML contributable to OpenStax | **XL — its own campaign** | No collection bundle, unwired gate, 6,882 English `alt` texts by construction, no `xml:lang`, copied `md:uuid`, and 2/5 books licence-ineligible |

**3(b) is a separate project, stated plainly.** Do not fold it into this campaign. Its acceptance criteria
belong to OpenStax and that conversation has not happened (§7 U5). What *is* worth taking from it is the
half that already works — see phase 3 below.

---

## 4. Cost and scale — what is measured, what is not

**Measured** (LENS campaign-fit ran `node tools/api-translate.js --book <slug> --dry-run --force` per book;
LENS legacy-inventory's independent character census agrees within 2%):

| book | modules the dry-run priced | ISK |
|---|---|---|
| efnafraedi-2e | 166 (+4 **locked**, refused by design) | 34,561 |
| lifraen-efnafraedi | 40 | 7,797 |
| liffraedi-2e | 13 | 2,084 |
| edlisfraedi-2e | 10 | 1,961 |
| orverufraedi | 12 | 1,770 |
| **total** | **241 + 4 locked** | **≈ 48,173** |

Add ~800 ISK for the 4 locked chemistry modules. **Budget 50,000–60,000 ISK for one pass** — a re-run of a
failed batch costs again. The rate is a code constant, not a verified contract price
(`tools/lib/malstadur-api.js:28`, unit-tested at `tools/__tests__/malstadur-api.test.js:174-184`).

**"245 vs 187" is a counting-unit artifact, not a disagreement.** 187 counts `m*-segments.en.md`; 245 counts
all `*-segments.en.md`, which is what `api-translate.js` actually translates — it also processes
`exercises-segments.en.md` (`:265`) and `chapter-metadata-segments.en.md` (`:1137`). In
`lifraen-efnafraedi` those 31 exercise files hold ~727k characters against ~56k in the 8 module files, so an
`m*` glob undercounts organic chemistry **14×**. Always price from the dry-run, never from a glob.

**NOT measured — do not quote a number:** the full-corpus follow-on (all 1,192 source modules). The two
lenses extrapolated 205,000 and 235,000 ISK from 8–11-module samples per book; they disagree ~15% and both
carry ±40% bands. **The honest entry is "unmeasured; roughly 5× this migration."** To settle it: extract one
more chapter per book, then re-run `--dry-run --force`.

**Wall-clock is bounded and the two lenses disagree — the fuller account wins.** Requests are chunked at
SEG boundaries to `DEFAULT_MAX_CHUNK_CHARS = 25000` (`tools/api-translate.js:819`) and rate-limited serially
at 500 ms (`tools/lib/malstadur-api.js:20`), so 245 modules is roughly **250–300 API calls, not one per
segment** — hours, not a day. The one-call-per-segment figure (≈4.3 h) in the legacy-inventory lens was an
explicitly-flagged assumption and is superseded. Per-call latency for chunks over the 10k `SYNC_CHAR_LIMIT`
(`translateAsync` + polling) is recorded nowhere; `time node tools/api-translate.js --book orverufraedi
--force` (1,770 ISK, 3.7% of spend) settles it and doubles as a glossary-priming smoke test.

---

## 5. Phased plan

Phases cite the [clean-break runbook](2026-07-29-c16-clean-break-runbook.md) rather than restating it — it
owns the executable steps and its checkboxes are the record.

### Phase 0 · Pre-flight — **S** · **[LEAD]** · nothing blocks it, everything blocks on it

Four measurements plus one triage, all runnable today, total machine cost 1,770 ISK.

1. **Prod query, read-only, no book filter** —
   `SELECT book, module_id, status, count(*) FROM segment_edits GROUP BY 1,2,3;`
   Settles the snapshot scope (register `:282-286`) **and** whether any non-chemistry book has editorial
   work that never reached a faithful file. ⚠️ The 4 `.locked` markers are **not** a substitute oracle: all
   four came from one dev commit `06058a0e` and the authoritative prod `--db` run added none, so absence of
   markers is not absence of edits (register `:271-281`).
2. **Triage the `02-mt-output` hand repairs** — the correction to the premise. Working command
   (⚠️ the quoted-glob form `-- 'books/*/02-mt-output/'` returns **nothing** — use explicit paths):
   ```bash
   git log --diff-filter=M --oneline -- \
     books/efnafraedi-2e/02-mt-output books/liffraedi-2e/02-mt-output \
     books/orverufraedi/02-mt-output books/edlisfraedi-2e/02-mt-output \
     books/lifraen-efnafraedi/02-mt-output
   ```
   Classify each non-`api-translate` commit as *"the pipeline now does this itself"* vs *"human judgement to
   re-apply"*. Confirmed by `git show --stat 4e5be912`: it corrected m66441's title **and** renamed
   `3-3-fitusyrur.html` → `3-3-lipid.html`. Others to read: `d440b5b8`, `7439d07e`, `edd84811`, `827424da`,
   `334d800d`. **~1 hour. Must precede Step 3.**
3. **C14 glossary `--dry-run` on prod** (register `:180`) — before the re-MT, so the MT is primed correctly.
4. **`time node tools/api-translate.js --book orverufraedi --force`** — bounds the schedule.
5. **A5 spend authorization** on §4's number.

### Phase 1 · The S tranche — **S** · **[CODE]** · no data dependency, ship it in a constrained session

One PR, six decision-free deletions, zero prod queries needed:
`tools/archived/` (14 files, zero require/import/exec references; `docs:check` verified unaffected because
README carries no `tools-start`/`routes-start` markers) · `books/efnafraedi-2e/for-align/.gitkeep` ·
`books/efnafraedi-2e/04-localization/README.md` · the `files.json` branch at `server/routes/status.js:1264-1272`
(not shape-pinned by any test) · the vacuous `:::` `directives` check at `tools/validate-chapter.js:352-393`
(**the last live `:::` consumer**; its remediation hint points at `tools/repair-directives.js`, which does not
exist; its 4 tests build synthetic fixtures so a green suite proves nothing) · two wrong comments
(`cnxml-extract.js:274` describes `{{i}}` emission the code below replaced with `[[i:]]`;
`segmentParser.js:46` claims mustache is backup-only, false — 56 non-backup files carry `{{SEG:`).
Fix `README.md:135-143` in the same PR — its pipeline table still teaches the retired flow.

**Keep out of this PR:** `tools/docx-import.js` (class (ii), not (i) — `tools/lib/provenance.js:11` maps
`docx-import` → policy `mutate` and `restorePolicyFor` **throws** on an unknown tool; 6 committed sidecars
say `docx-import`) and `importFromKeyTerms` (needs a product call). A PR with a decision in it stalls.

Two prerequisites that belong here because they block the rehearsal, not the deletion:

- **`--output-dir` is documented, registered, and never read.** Verified: `grep -n outputDir
  tools/cnxml-extract.js` returns only the doc lines and the option registration (`:23`, `:68`, `:89`).
  A lens hit it live — extracting with `--output-dir /tmp/reex` left `/tmp/reex` empty and **wrote into
  `books/efnafraedi-2e/02-for-mt/ch03/`**. The natural rehearsal for a mass re-extraction silently
  overwrites the corpus's EN tier. Implement it or remove it from `--help` **before** any rehearsal. **S.**
- **REEQ-1** (register `:425`): `normalizeVisibleText`'s nested-bracket handling false-flags `m68727`/`m68747`,
  so `verify-reextract-equivalence.js` cannot run clean on chemistry today. Fix or explicitly waive
  **before** Step 3. Its CLI block is also chemistry-hardcoded (`:134-137`, literal book, literal waiver set,
  module list from `/tmp/reextract-modules.txt`) — generalising it is **S–M**.

### Phase 2 · Goal 1, the clean break — **M** · **[LEAD]** data op

Follow the runbook: **Gate 0** (`:20-51`) → **Step 1** snapshot (`:52`) → **Step 2** slug capture (`:103`) →
**Step 3** clean break (`:120`) → **Step 4** hand re-apply (`:191`) → **Step 5** finish (`:261`).

Four things to add to the runbook's checklist, each found by this assessment:

1. **Verify the snapshot renders readably before deleting the `.locked` markers.** The 4 markers are the last
   automated guard between a `--force` and the preserved work — the dry-run reported `Locked: 4 (editing
   started — MT re-run refused)`. Run `scripts/render-segment-edits-md.js` and *read the output*; "the export
   exited 0" is not the same fact.
2. **Delete `books/liffraedi-2e/02-mt-output/ch03/import-report.json` with the break.** All 7 provenance
   sidecars in that directory now read `api-translate`, but `backfill-provenance.js:23-25` keys on that
   file's presence to stamp `docx-import`. It is harmless today only because `backfillBook` skips modules
   that already have a sidecar (`:32-35`) — **and the break deletes those sidecars.** A later backfill then
   stamps `docx-import` → policy `mutate` → the web-UI restore path mutates api-translated segments.
3. **Keep the md5sum gate** (runbook `:173-181`). A re-MT without `--force` skips every module whose
   `02-mt-output` file exists — all 170 chemistry files exist — and every checkbox ticks green while nothing
   happens. CLAUDE.md's own command table omits `--force`.
4. **Expect chemistry's fidelity and residue gates RED on the first pass.** `fidelity-allowlist.json` holds
   exact-match entries keyed `moduleId+tag+diff` with a header saying *"any drift → unexplained (red)"*;
   `render-fidelity-baseline.json` needs `fidelity --update-baseline`. Budget half a day to a day of
   re-triage. **That is the gate working. Do not debug it as a regression at 11pm.**

Also note `server/__tests__/publicationAppendices.test.js` pins a `fileCount` against the chemistry
appendices publish dir — clearing and regenerating `05-publication` is exactly what breaks it. The register
already prescribes the fix shape at `:103` (observe the directory, assert the code agrees).

### Phase 2b · The schema gate — **S to RUN here, M to WIRE later** · the best value in the whole target

This is the half of goal 3 that already works, and it belongs to the clean break rather than to a future
OpenStax campaign. **Split it by when it happens:**

- **Running the gate is a phase-2 acceptance step, not later work.** 1.5 s per book against the regenerated
  `03-translated/`, and chemistry's 149/149 zero point makes any re-MT regression visible immediately. Add it
  to the runbook's Step 3 checklist. Near-zero cost, highest-value risk reduction available. **[LEAD], during
  the break.**
- **Wiring it into inject/render, the server apply path and CI is the [CODE] tranche** — priced in
  `experiments/cnxml-validation-gate/FINDINGS.md` §6 A–E — and can land after phase 3. **M.**

Re-verified 2026-07-30: `node validate-cnxml.js --allowlist allowlist.recommended.json --quiet
../../books/efnafraedi-2e/03-translated/mt-preview` → **149 files, 0 errors, 1,470 ms**; and
`node tools/cnxml-fidelity-check.js --book efnafraedi-2e` → 149 checked / 126 perfect / 37 discrepancies /
0 unexplained / exit 0. `FINDINGS.md:83` states it directly: chemistry's reinjected CNXML is exactly as
schema-valid as the OpenStax source it came from. `jing` and `java` are on this box; the schema clone is
gitignored, so the AGPL-un-vendored constraint is already honoured by construction.

Two corrections to FINDINGS worth carrying: **biology's 13 defects are gone** (C13/#332/#333), so its
"fix biology first" prerequisite is largely paid; and **block/warn must follow measured coverage, not pass
rate** — chemistry is 149/149 injected and can BLOCK, while the other four sit at 2–6% coverage and must
WARN, or the first newly-injected failure wedges onboarding.

⚠️ **Schema validity ⊥ fidelity** (CLAUDE.md). The gate catches none of the 37 discrepancies and cannot see
`m68662`'s 23 out-of-order ids. Of the 20 deferred fidelity losses, exactly **3 are reader-visible** —
`m68826` drops a `<note>` heading ("Statue of Liberty: Changing Colors"), `m68854` drops a cross-reference,
and `m68727`/`m68818` lose `<para>` wrappers **and their `@id`s** inside `<item>` (text intact, schema-legal;
those ids are also the join key C16's re-attach relies on — that subset does not survive). Stop quoting "37"
undifferentiated. And `docs/pipeline/cnxml-fidelity-gaps.md` is dated 2026-03-18 and superseded — frozen
evidence, not status.

### Phase 3 · Goal 2a deletion PR — **S** · **[CODE]** · gated on phase 2

`{{i}}`/`{{b}}` back-compat · `{{SEG:}}` normalization at `segmentParser.js:46` **together with**
`SEG_MARKER_REGEX` at `:30` (a second, independently mustache-aware parser, used at `:441` and **exported**
at `:467` — check its consumers first) · `{{term}}`/`{{fn}}` parsing at `cnxml-inject.js:1476,1484`, **which
is safe only because the lead's scope covers all five books** (R4) · the 67 orphaned split files ·
`mt-normalize.cjs` `normalizeTermMarkers` and `cnxml-inject.js:235` `restoreTermMarkers` (both key on the EN
side, so re-extraction retires them, not the editor change).

**Add a tripwire in the same PR**, or "clean" regresses silently: extend `tools/lib/residue-scan.js` (already
the shared corpus scanner) with a corpus assertion that the curly families count zero — **and the assertion
must exclude `.backup.*`**. Every census in this assessment changes if the ~26,700 local backup files are
counted.

### Phase 4 · Goal 2b, the editor tag redesign — **L** · **[CODE]**, `server/` ⇒ A4-gated

This has **no register item today** and it is the only path to the confirmed reader-visible C16(a) defect.
Left unowned it will look subsumed by goal 1 and quietly not happen — the evaporation pattern the closure
audit named. Three ordered steps:

- **Step 1 — the editor emits brackets. S, and it is the one piece with NO gate at all.** Three emit sites,
  all in `server/public/js/segment-editor.js`: `:972-977` toolbar, `:2789-2798` shortcuts, `:2616`
  `insertTermFromLookup`. `wrapSelection(id, prefix, suffix)` at `:2656` takes prefix and suffix separately,
  so each is a two-string swap. Target the **bare** `[[term:text]]` (R7). `localization-editor.js` has no
  toolbar — it is read-only, halving client scope — but its preview is missing `[[i:`, `[[b:`, `[[sub:`,
  `[[sup:`; fold those four one-liners in.
  **This step fixes a live defect nobody had named:** `hasApiMarkers` is per-segment, and all six markdown
  dialects convert only inside the `!hasApiMarkers` blocks, so **five of the six toolbar buttons are silently
  inert in the ~28% of segments that carry a bracket marker** — the editor sees bold in the preview and the
  book gets literal `**`. Latent today (0 residue in 191 injected `.cnxml` **and** 0 in 335 published HTML —
  two tiers, so genuine absence rather than a render-path false negative). **It goes live exactly when
  editorial volume ramps, which is what the lead's target enables.** The emit sites have zero test coverage,
  so the real work is writing the tests.
- **Step 2 — delete `cnxml-inject.js:1481-1485`.** Gated on step 1 + the re-MT. This is the line that
  produces the 3 published defects. ⚠️ Step 1 alone does **not** fix them.
- **Step 3 — delete `hasApiMarkers` and its three back-compat blocks.** M; own PR; whole-branch adversarial
  review. Steps 1+2 are what make this a deletion rather than a redesign.

**Do not let "a richer, more informational tag grammar" ride along.** That is L→XL for a different reason:
marker vocabulary is consumed by three independent strippers with three different policies
(`tm-export.cjs:114`, `residue-check.js:17`, `export-corpus.js:428`), two preview renderers,
`marker-highlight.js` (whose `stripTags(highlight(t)) === escapeHtml(t)` invariant must survive),
`segment-validation.js`, extract and inject — and missing one is a **silent TM/corpus regression, not a red
test**. Design it afterwards, on a single-dialect baseline. Designing a richer grammar on a three-dialect
substrate is how the current state was reached.

### Phase 5 · Goal 3(b) — **XL**, its own campaign, do not start

Log it; do not schedule it. Blocked on a question the repo cannot answer (§7 U5).

---

## 6. Do not do this

Orderings that look reasonable and would strand editors, readers, or the corpus.

1. **Do not clear `05-publication/<track>/` before capturing the filename list.** One-way, total, and
   unreconstructable: after vefur PR #200 keyed the overlay on `data-module-id`, **efni is the only side that
   still knows the old filenames**, and the before/after lists *are* the redirect map. Chemistry alone has
   266 published HTML files. Runbook Step 2 (`:103-118`) has the command; treat it at the same severity class
   as the `01-source` overwrite rule.
2. **Do not run the re-MT before triaging the `02-mt-output` hand repairs.** This is the wrong-premise risk
   from the verdict. `4e5be912` is not hypothetical — the rename is visible in `git show --stat`.
3. **Do not delete `{{term}}`/`{{fn}}` parsing after a chemistry-only re-MT.** 56 files across physics,
   biology, organic and microbiology depend on it. It retires only when **all five** books are re-extracted.
   There is no middle ground.
4. **Do not do the re-MT and the deletion PR before phase 4 step 1.** The toolbar would then write a dialect
   inject no longer converts — taking the silent-button defect from 28% of segments to 100%, with the preview
   still showing bold. This is the single ordering to avoid.
5. **Do not re-apply the preserved ch03 work before the curly deletion, and do not skip the dialect
   conversion.** `m68700-segments.is.md` — one of the two preserve-me modules — carries 7 `{{i}}` and 5
   `{{term}}`; `m68664` carries 8 markdown `__x__`. Hand re-application must convert `{{i}}`→`[[i:]]` and
   `{{term}}`→`[[term:…]]` *as it goes*, or the very step meant to preserve the work reintroduces the
   back-compat you are deleting. `scripts/lib/segment-edit-reattach-rules.js:46-66` **detects** this and warns
   the editor in Icelandic, but `:47` says explicitly: *detection only — the text is never rewritten*.
6. **Do not "fix" the duplicate seg-id emission by changing the extract traversal.** A lens found extraction
   emitting the same id twice (`export-corpus` reports 578 for chemistry; an independent parse found 285
   collapsed, 71 with differing `[[MATH:N]]` indices), with the id occurring **once** in read-only source —
   i.e. a double visit with the MATH counter advanced between. Whatever the fix is, it is deduplication at
   emission. Changing the traversal renumbers the frozen `auto-N` ids, which CLAUDE.md bans and
   `verify-reextract-equivalence.js` exists to catch.
7. **Do not rehearse a mass re-extraction with `--output-dir`.** It writes into the corpus. See phase 1.
8. **Do not `--force` past the glossary shrink guard and then re-render.** Approved terms are substituted into
   published CNXML at inject time (`cnxml-inject.js:4127`), and the break re-renders everything at once —
   a forced shrink strips math-label substitutions from every page simultaneously. Dry-run first.
9. **Do not treat a clean `sync-content.js` exit as proof.** A duplicate warning is warn-only and does not
   change the exit code; and route status codes on the reader SPA are meaningless — verify by fetching
   `/content/<book>/chapters/<NN>/<file>.html` (CLAUDE.md).

### The seg-id stability finding — and why it is good news

The brief anticipated that re-extraction renumbers seg-ids and breaks the corpus join key. **Measured, it does
not.** `tools/cnxml-extract.js:116-121` builds `mod:type:elementId` when the source element has an id and
`mod:type:auto-N` otherwise, so the positional exposure is real — **20.9%** of 30,932 markers corpus-wide
(chemistry 28.3%, the other books 2.7–12.2%). But:

- Chemistry contains a **44-module natural experiment**: its EN tier was re-extracted while its MT was not.
  Comparing id sets gives **57 EN-only ids and 0 IS-only ids**. If a re-extraction had gained a segment ahead
  of an `auto-N` id, both the old and new numbers would appear in the symmetric difference. **IS-only = 0
  means the renumbering mechanism fired 44 times and produced no drift.** Classifying every differing id
  corpus-wide: 76 source-derived, **2 positional**.
- Re-extracting `m68700` — the module holding 282 of the project's 368 human-verified segments — produced
  **0 seg-id changes**; the only diff was marker modernisation (`{{term}}`→`[[term:…|id]]`).
- The `[[term:…|id]]` anchor is itself **source-derived** (`cnxml-extract.js:339` uses the element's own
  attribute), so C16(a)'s fix direction does not rest on a key that renumbers.

**Cheap insurance, not a blocker:** run `verify-reextract-equivalence.js` corpus-wide as step 0 and treat any
`segment-id-set changed` as a stop — it fails on that before comparing any text. But fix REEQ-1 first, and
mutation-check it: its header records validation on 2026-07-07, before several extract changes, and a
validator that early-returns on missing input passes vacuously.

### The organic-chemistry `<span>` finding — scope-conditional, and the lens headline needs correcting

A lens found the extractor drops `<span>` entirely: `walkContent` (`tools/lib/cnxml-parser.js:355-378`)
dispatches `if (handlers[tagName])` with **no else branch and no warning**, and the block handler switch has
11 cases. Loss profile: silent, text-preserving, markup-destroying — invisible to the schema gate. Also
dropped: `<foreign xml:lang="ar">`, `<iframe>` in one physics module.

**I re-measured, and the headline is wrong twice.** `1071 occurrences in 184 of 342 modules` is **all
colour-coded spans across seven classes** — `magenta-text` is **379**. And only **30** of those 1,071 sit in
the 8 organic modules that are actually extracted (`m00032`=10, `m00035`=9, `m00038`=8, `m00033`=2,
`m00037`=1, three at 0).

**Therefore:** re-doing the 245 extracted modules re-issues a loss of ~30 spans that **already exists,
unchanged** — it does **not** block goal 1 as scoped. The 1,071/184 exposure is what onboarding the rest of
organic chemistry buys, so it **does** block the 5× follow-on. In an organic-chemistry text these colours
mark the reacting functional group — pedagogy, not decoration. **Decide it before extending
`lifraen-efnafraedi`, not before goal 1.**

---

## 7. Unknowns, each with the measurement that settles it

Closeable in one session. Numbered so they can be ticked off.

- **U1 · How much editorial work actually exists, in every book.** The repo cannot see prod's gitignored
  `sessions.db`. → the read-only query in phase 0 step 1, **without** the `WHERE book=` clause, because goal 1
  re-MTs every book. Only 4 modules → current scope correct. More → snapshot scope and re-MT scope must widen
  **together** (register `:287-291`).
- **U2 · Does prod's `books/*/03-faithful-translation/` match git?** Every faithful-tier number here comes
  from the tracked tree; the cron stages that directory, so they *should* agree — but a failed push looks
  identical to agreement from here. → on prod: `git status --short books/*/03-faithful-translation/` and
  `cat pipeline-output/.last-content-backup`. Same session as U1.
- **U3 · Which `02-mt-output` hand repairs are human judgement?** → phase 0 step 2's triage. ~1 hour.
- **U4 · Has any aligned-corpus export ever left the repo?** Repo-side it is a non-issue: `books/*/corpus/`
  is gitignored (`.gitignore:130`) and `git log --all -- 'books/*/corpus/'` returns nothing. What the repo
  cannot tell you is whether a file was emailed to a researcher. → **ask the lead.** If one was distributed,
  its join key is unrecoverable after the re-extract.
- **U5 · Does OpenStax accept community translations, and in what shape?** Not answerable from the repo.
  The CC licences let us translate and publish; that is not the same as OpenStax ingesting our work.
  → ask OpenStax (support@openstax.org, or the `openstax/template-osbooks` org). **Until answered, 3(b) has
  no acceptance criteria and cannot be planned.** Note that no engineering fixes the licence half:
  `edlisfraedi-2e` and `lifraen-efnafraedi` are CC BY-NC-SA per `book-config.json`, and OpenStax publishes
  CC BY — 40% of the corpus is out before any code is written.
- **U6 · Does *today's* inject still produce physics' duplicate `@id`s?** The committed
  `edlisfraedi-2e/03-translated` output has 10 duplicate-id errors in 3 of 9 modules while its sources
  validate clean — but that output is dated 2026-04-19 and `cnxml-inject.js` last changed 2026-07-27.
  → re-inject `m42075` into a scratch tree, re-run `validate-cnxml.js` + a per-element diff. One run also
  answers physics' `emphasis 31→18` / `para 120→112` divergences. **Do not size physics before this.**
- **U7 · Would a `<span>` handler alone fix organic chemistry?** Only 8 of 342 modules were measurable.
  → extract+inject 5 more span-heavy modules in a scratch tree and re-run the per-element diff. ~1 h,
  no repo mutation. Blocks the organic follow-on, not goal 1.
- **U8 · Post-re-MT fidelity for chemistry.** → re-run `tools/cnxml-fidelity-check.js --book efnafraedi-2e`
  after the break and diff against `fidelity-allowlist.json`. Until that number exists, 3(b) cannot be sized.
- **U9 · Blast radius of the duplicate seg-id emission (578 vs 285).** → diff `export-corpus --dry-run
  --verbose`'s duplicate accounting against a `parseSegmentRecords` dump, then check which `[[MATH:N]]` index
  the injected output resolves against for `m68783:para:fs-idm9532784`. If the dropped emission's index is the
  live one, this is reader-visible fidelity loss, not a reporting artifact.
- **U10 · Does `SEG_MARKER_REGEX`'s export (`segmentParser.js:467`) have consumers outside the module?**
  → `codegraph explore "SEG_MARKER_REGEX"`. Gates phase 3.
- **U11 · What is `server/routes/status.js:1343-1361` for?** It applies split-file section logic to module-id
  filenames, collapsing `m68683-segments(b).is.md` to the string `m68683-segments` and putting it in a
  variable called `sectionSet`. May be harmless, may feed a stale section view. → `GET` that endpoint against
  a real book and read the `sections` array. **Flag, don't fix.**
- **U12 · Can a valid `collection.xml` be generated from `collection-order.json`?** We hold a reduced
  projection — chapter order, EN titles, preface, appendices — with no uuids, no version attributes, no
  nested subcollections. The upstream `collection.xml` is retained nowhere. → fetch one upstream
  `*.collection.xml` (metadata only; this does **not** touch `books/*/01-source/**.cnxml`, so the
  double-consent rule does not apply — but confirm with the lead) and diff the required attribute set.
  3(b) only.

---

## 8. Goal 3(a) — the web export, explicitly

It works and keeps working; verify after goal 1 rather than build. Three notes:

- **Corpus** is regenerable by one command and gitignored. Its own manifest records its only weakness as
  *"for modules MT'd before a re-extraction the exact bytes sent to MT may differ (dialect drift, e.g.
  m68664)"* — **the exact skew the re-MT removes.** It gets better, not worse.
- **TM** needs **zero** code change: the CLI and the route share `tools/lib/tm-export.cjs`, and every real
  book has a licence row (`stjornufraedi`/`testbook` correctly throw — they have no `02-for-mt`). But the
  committed chemistry TMX holds **3 translation units where a regen would produce 360**, `generate-tm.js`
  never writes an empty TM, `tmService` is warn-only, and `status.js:1332` marks `tmCreated` complete on mere
  file presence — **so a stale June TMX survives the break with no alarm anywhere**. Land C3 (with R6's
  design call) **before** the break, not after.
- **Render path:** `serialize→escapeAttr` double-encoding is latent in `<img alt>` and embed `title`
  (`tools/lib/cnxml-elements.js:419`, `:858`). It is dormant only because **`alt` text is untranslated by
  construction** — `cnxml-extract.js:1057-1074` stores it as a plain attribute on the structure record and
  never emits it as a segment, so it never reaches the API (6,882 `alt` attributes across 1,192 source
  modules; same for table `@summary`). **Fixing alt activates the latent bug — sequence them together.**
  That is also a live accessibility defect today, shipping English image descriptions to Icelandic students.

---

## 9. What to do in the next heavy session

1. Apply §1's seven register corrections. One editing pass.
2. Run phase 0 — two prod queries, the `02-mt-output` triage, the glossary dry-run, the timed orverufraedi
   run. Total machine cost 1,770 ISK.
3. Ship phase 1's S tranche if there is session left. It needs no prod access and no decision.

Everything else waits on phase 0's answers. Two of them — U1's scope and U3's triage — can each move the plan,
and both are cheap.
