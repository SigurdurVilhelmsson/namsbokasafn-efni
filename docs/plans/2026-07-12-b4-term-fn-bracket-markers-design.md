# B4 — bracket markers for `{{term}}`/`{{fn}}` + positional-restore hardening — Design

- **Date:** 2026-07-12 (campaign Phase 2, item 5 — `docs/plans/2026-07-11-pre-semester-coding-campaign.md`)
- **Status:** Approved (lead, 2026-07-12) — approach A, scope as below
- **Branch / PR:** `feat/b4-bracket-markers`, one PR off `main` (post-#273)
- **Register origin:** B4 in `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md:208-227`;
  roadmap #4 in `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md`;
  ADR `docs/decisions/2026-07-06-re-mt-vs-editor-fixes-and-openstax-remerge.md`

## 1. Problem

`<term>` and `<footnote>` are the last inline elements extracted as **paired mustache markers**
(`{{term}}text{{/term}}`, `{{fn}}text{{/fn}}`) — the marker family the Málstaður API drops at
~2.3% (852 `{{term}}` + 36 `{{fn}}` in efnafraedi-2e's `02-for-mt` alone; every other book carries
them too). The deeper defect is downstream: injection re-attaches term/footnote `id`/`class`
**purely by occurrence index** from the `-inline-attrs.json` sidecar
(`tools/cnxml-inject.js:1467-1497`), so one dropped marker in a 2+-term segment silently shifts
every downstream id in that segment (163 cascade-capable segments; invisible to linguistic
review). The ADR hard-requires: **anchor the id IN the marker** so restoration is
content-anchored, not positional.

Sequencing constraint (ADR): B4 must land **before the Pass-1 review push**, because B4's
re-extract changes segment boundaries and review investment is the one non-regenerable asset.
B4 gates the 6-module re-MT (m68764/770/789/791/793/829) and sweeps up RC3, RC4 and the
list-double-record family on re-extract.

## 2. Lead decisions (2026-07-12)

1. **Approach A** — real CNXML id, text-first pipe: `[[term:text|id]]`, mirroring the proven
   `[[xref:text|id]]` family. (B ordinal-anchor rejected: a mutated digit maps silently to a
   *wrong valid* sidecar slot — keeps the silent-failure class alive. C paired-bracket rejected:
   paired markers are the droppable-half class B4 exists to escape.)
2. **Post-merge re-MT set = 8 modules + probe:** core 6 (m68764, m68770, m68789, m68791,
   m68793, m68829) + m68847 (RC3) + m68860 (RC4). ≈2,284 ISK + ~30 ISK live survival probe,
   run **before** the re-MT. m68863 diagnosis resolved (Task 9): inject-stage, and the instance
   was already healed on disk by the 2026-07-07 STALE-STRUCT re-extract/re-inject — **NO re-MT
   needed, the +78 ISK follow-up ask is off the table**; see register B4-D5 for the mechanism
   and the guard shipped against the defect class. Dry-run estimates 2026-07-12:
   m68764 234 / m68770 257 / m68789 388 / m68791 466 / m68793 270 / m68829 369 /
   m68847 168 / m68860 132 (ISK; pre-B4 boundaries, id-bearing markers add a few %).
3. Design approved as presented (sections 1–6 of the session presentation).

## 3. Marker syntax

New single-token bracket markers, text-first pipe (`|` divides translatable text from the
opaque payload — same convention and comment as `tools/cnxml-extract.js:337-341`):

| CNXML | New marker | Legacy (still parses forever) |
|---|---|---|
| `<term>text</term>` | `[[term:text]]` | `{{term}}text{{/term}}` |
| `<term id="X">text</term>` | `[[term:text\|X]]` | `{{term}}…{{/term}}` + positional sidecar |
| `<term class="C" id="X">text</term>` | `[[term:text\|X]]` — class recovered from sidecar **by id** | positional sidecar |
| `<footnote id="X">text</footnote>` | `[[fn:text\|X]]` (no id → `[[fn:text]]`) | `{{fn}}…{{/fn}}` + positional sidecar |
| `<emphasis effect="underline">text</emphasis>` | `[[u:text]]` | `++text++` |
| `<emphasis class="C">text</emphasis>` | `[[em:text\|C]]` — class rides in the marker | `{=text=}` + positional sidecar (`emphases`, un-padded) |

Facts the syntax leans on (census 2026-07-12):
- **Zero class-only terms exist** across all books (1,333 term entries; 293 class+id, 0
  class-without-id) → id-keyed sidecar lookup recovers class in every real case.
- Ids are XML NCNames (`term-00001`, `fs-idp2355696`) — no `|`, `[`, `]` possible. Id charset
  for parsing: `[A-Za-z0-9_.:-]+`.
- The API translates text inside brackets and preserves delimiters + after-pipe payloads
  (`[[link:text|url]]`/`[[xref:text|id]]` proven ~100%, `test-results/api-marker-survival.md` +
  the 42-module empirical re-run, commit `de601457`). `[[term:text|id]]` is structurally
  identical; the probe re-proves it for the new types before any re-MT spend.
- **Text-first is load-bearing:** two generic strippers keep the *left* of the pipe
  (`tools/lib/residue-check.js:23`, `tools/verify-reextract-equivalence.js:19`) — with text
  first they keep the display text and need **no change** (pinned by new tests instead).
  `verify-reextract-equivalence` already pins "passes when only marker format differs".

The `-inline-attrs.json` sidecar **format and emission are unchanged** (still null-padded
per-occurrence arrays keyed by segment id, still written by extract). It remains: the class
source-of-truth, the legacy positional fallback, and byte-stable for the equivalence check.

## 4. Extraction changes (`tools/cnxml-extract.js`, all in `extractInlineText` :164-424)

- **Term** (:324-335): emit `[[term:${stripTags(inner).trim()}|${id}]]` when `parsedAttrs.id`
  exists, else `[[term:${…}]]`. Sidecar collection (`collectedTermAttrs`, null-padded) unchanged.
- **Footnote** (:394-402): same shape, keep the leading space of the current replacement.
- **Underline** (:306): `++${inner}++` → `[[u:${inner}]]`.
- **Class-emphasis** (:310-320): `{=${inner}=}` → `[[em:${inner}|${parsedAttrs.class}]]`.
  Keep pushing to `collectedEmphasisAttrs` (sidecar unchanged; inject prefers marker-carried
  class for new content).
- **RC4-m68860 fix** — title-only `<para>` inside `<example>` is dropped in `processExample`
  (:1198-1281): the first para's `<title>` is donated as the example title (:1204-1217), then
  the emptied para fails both the `if (text && text.trim())` guard (:1264) and the
  `else if (paraTitle)` fallback (:1274) and vanishes. **Surgical fix — only the pathological
  case changes:** when the example's first para contains ONLY a title (no body text), do NOT
  donate it as the example title; keep it as a para element with its `id` and para-title
  (mirroring the top-level-para behavior :957-968). Paras with title + body keep the existing
  donation behavior exactly — changing it would churn segment sets across every
  example-bearing module. Plan prerequisite: a source-wide census of the title-only-first-para
  shape (`01-source` grep) to bound the fix's blast radius — any module with that shape gets a
  changed segment set on its NEXT re-extract (only m68860 is being re-extracted in this arc).

Note replacement order inside `extractInlineText` (MATH → MEDIA → TABLE → BR/SPACE → sub/sup →
emphasis effect= → emphasis class= → **term** → links → **footnote** → stripTags): term/fn inner
content already contains resolved bracket markers (e.g. `[[sub:2]]`) — that is *by design* and
handled at inject by ordering (below).

## 5. Injection changes (`tools/cnxml-inject.js`)

### 5.1 New-format restore (content-anchored)

Insert the four new conversions **after** the second `resolveBracketEmphasis` pass (:1417) and
after the xref/docref/link conversions (:1395-1413): at that point every inner marker inside
term/fn text has resolved to XML (innermost-first — the same trick `resolveBracketEmphasis`
uses), so the new regexes only ever see bracket-free content:

- `[[term:text|id]]` → `<term id="id">text</term>`, then look up the segment's sidecar
  `terms` entry **by id**: if found and it has `class`, emit
  `<term class="…" id="…">`. **Lookup miss → loud warn** (module + segment id + the id) — that
  is the API-corrupted-id detector; the element keeps the marker-carried id.
- `[[term:text]]` → `<term>text</term>`.
- `[[fn:text|id]]` → `<footnote id="id">text</footnote>`; `[[fn:text]]` → `<footnote>…`.
- `[[u:text]]` → `<emphasis effect="underline">text</emphasis>`.
- `[[em:text|class]]` → `<emphasis class="class">text</emphasis>` (no sidecar involvement).

`assertNoMarkerResidue` (:1645-1654) already hard-fails any surviving `[[term:`/`[[fn:`/
`[[u:`/`[[em:` (it excludes only MATH:/MEDIA:) — the fail-loud backstop pre-exists; pin with a
test, no change.

### 5.2 Skip-positional flag (mixed-format guard)

If the segment's incoming text contained any new-format marker (`[[term:`/`[[fn:` pre-conversion),
**skip the positional attach block entirely** (:1467-1497). Rationale: a new-format segment with
one id-bearing and one attr-less term would otherwise feed the attr-less `<term>` into the
positional pass against a sidecar array that includes the id-bearing entry → misalignment (and a
false hardening warning). One format per segment is guaranteed (one extraction produced it), so
the flag is clean.

### 5.3 Positional hardening (the legacy path — protects every book not being re-MT'd)

In the positional block, before attaching: count bare `<term>` occurrences vs
`inlineAttrs.terms.length` (same for footnotes, and the `{=`/`emphases` restore at :1352-1365).
**On mismatch: warn with module + segment id + expected/found counts, attach NOTHING for that
family in that segment, and surface the count in the module report** (inject already has a
reporting channel). Missing attrs beat wrong attrs; the current behavior silently attaches
wrong ids. Matched counts attach exactly as today (zero behavior change for healthy content —
the 100-case inject suite must stay green untouched).

### 5.4 Awareness updates (same file)

- `hasApiMarkers` (:1177-1181): add `\[\[term:|\[\[fn:|\[\[u:|\[\[em:` so legacy false-positive
  suppression fires for bracket-era segments.
- `stripTermMarkersToText` (:785-803): add unwrap rules (keep text field) for
  `[[term:]]`/`[[fn:]]`/`[[u:]]`/`[[em:]]` **before** the catch-all at :793, which currently
  deletes any unknown `[[word:…]]` marker *wholesale* (text included).
- `annotateInlineTerms` (:823-885): extend the EN pattern (:827-828) and IS pattern (:830) with
  the bracket form; emit the `(e. english)` annotation **inside the text field**:
  `[[term:${inner} (e. ${enTerm})|${id}]]`. (EN segments re-extracted post-B4 carry brackets
  while IS carries `{{term}}` until re-MT — the patterns must accept either side in either
  dialect independently.)
- `restoreTermMarkers` (:201-292): its `{{term}}`-presence checks (:221-223) gain the bracket
  form so the API-glossary `__term__` overproduction strip still fires for bracket-era segments.
- Term-innards sub/sup rescan (:1386-1393): keep for legacy; new format doesn't need it
  (inner markers resolve before term conversion) — verify no double-processing.
- XML-escape protection whitelist (:1504): `term`/`footnote` already whitelisted — no change,
  covered by round-trip tests.

## 6. Consumer sweep (every known site outside extract/inject)

| Site | Change |
|---|---|
| `tools/generate-tm.js:108-123` `stripMarkers` | add term/fn to the pipe alternation (keep text); unwrap `[[u:]]`/`[[em:]]`. Without it, `[[term:…]]` leaks verbatim into every TMX TU. |
| `server/services/qaCheckService.js:22-35` `stripMarkers` | same (else id digits enter `extractNumbers` → false number-mismatch findings). |
| `server/services/concordanceService.js:45-66` `stripMarkers` | same (else markers pollute the FTS5 index + exact-match normalization). Three synchronized copies — dedup registered as follow-up, NOT done here. |
| `tools/lib/residue-check.js:17-29` | generic rule already keeps text-first left-of-pipe — **no change, pin with test**. |
| `tools/verify-reextract-equivalence.js:12-27` | already normalizes text-first pipes — **no change, add the `{{term}}text{{/term}}` ≡ `[[term:text\|id]]` case to its test**. Sidecar unchanged ⇒ check 4 stays byte-stable. |
| `tools/audit-render-output.js:147-170` + `tools/validate-chapter.js:716-740` | add `[[term:`/`[[fn:`/`[[u:`/`[[em:` to the placeholder-leak patterns (currently blind to them). |
| Editor marker-highlight, both panes (pinned by `server/__tests__/markerHighlight.test.js`, `termHighlight.test.js`) | add the four new types to the highlight patterns. |
| `server/services/segmentParser.js:70-95` `normalizeTermMarkers` | becomes a structural no-op for bracket-era EN (enTermCount=0) — acceptable; note in code comment. |
| `tools/lib/update-translation-errors.js:166` | cosmetic descriptive-string update. |
| `tools/__tests__/cnxml-dom-comparison.test.js:131` + any production `isApiTranslated` sniff (b2 memory) | add bracket term/fn to the API-translated detection — **plan-phase verification item** (b2's real fix is producer provenance, separate item). |
| `server/public/js/segment-validation.js` | **no change** — `[[term:…]]` neither trips nor is protected by the 8 hard blocks; a term-marker-aware rule is registered as follow-up, not scope. |
| `tools/repair-emphasis.js`, `tools/lib/seg-markers.cjs`, SEG-layer (`api-translate` validate/count/normalize/repairSegTags) | untouched (SEG-only / `{{i}}`-only). B3 per-type producer count check is campaign item 8, not this PR. |

## 7. m68863 (RC4, inject table-header dup) — diagnosis task

Timeboxed diagnosis in-plan (systematic-debugging): reproduce the duplicated table header on
m68863, locate the stage. Outcomes: **(a) inject-stage** → fix in this PR; content heals on
re-inject, no re-MT (m68863 stays out of the spend). **(b) extraction/MT-stage** → register +
bring a +78 ISK follow-up ask to add it to the re-MT set. Either way the finding goes in the
campaign register.

## 8. Acceptance (register criteria + ADR, all test-pinned)

1. **Anti-cascade:** induced-drop test — remove one marker from a 3-term new-format segment;
   the surviving two restore with **correct** ids (no positional shift).
2. **Hardening:** legacy segment with 3 sidecar entries but 2 surviving `{{term}}` markers →
   loud warn + **no attrs attached** for that family in that segment + module-report count.
3. **Backward compat:** old `{{term}}`/`{{fn}}`/`{=`/`++` content injects byte-identically —
   the existing 100 `cnxml-inject.test.js` cases pass **unmodified** (new cases are added;
   existing ones aren't edited — the same proof-by-absence used in the #9 dedup arc).
4. **Round-trip:** `[[term:H[[sub:2]]O|X]]`-style nesting; class recovery via sidecar-by-id;
   id-lookup-miss warns; `assertNoMarkerResidue` hard-fails an unconverted new marker.
5. **Survival probe:** T-cases added to `tools/test-malstadur-api.js` for all four new types
   (checks: delimiters intact, id intact byte-for-byte, text translated). Run post-merge
   (lead-authorized ~30 ISK) **before** the re-MT; gate: ≈100%.
6. **RC4-m68860:** extraction test — title-only para inside example survives as a structural
   element.
7. `npm test` from repo root green (the authoritative gate; no branch protection).

## 9. Explicitly out of scope (registered, not done)

- B3 producer per-type bracket count check (campaign item 8).
- Book-wide re-extract (only the 8 modules re-extract, post-merge).
- stripMarkers three-copy dedup into a shared lib (seg-markers precedent) — follow-up.
- `segment-validation.js` term-marker rule — follow-up.
- SR4-F1 fixture-book marker enrichment — follow-up (a `[[term:]]`-bearing fixture segment
  would let route-level tests run against committed content).
- b2 `isApiTranslated` producer-provenance fix (separate registered item).

### Register — findings discovered during design recon (feedback-log-out-of-scope-issues)

- **B4-D1 `[data]`** m68866 (appendix) carries 24 `{=…=}` class-emphasis markers that **survived**
  the API (24 in `02-for-mt` AND `02-mt-output`) — RC3 loss is probabilistic; m68847 lost its 1.
  m68866 needs **no** re-MT; its legacy markers keep injecting via the (now hardened) positional
  emphases path.
- **B4-D2 `[data]`** MT-output marker-count anomalies in other books: edlisfraedi-2e has 40
  `{{term}}` in mt-output vs 39 in source (+1); lifraen-efnafraedi 38 vs 39 (−1). Pre-existing;
  the hardening (5.3) turns any resulting misalignment from silent wrong-ids into a loud skip.
- **B4-D3 `[hygiene]`** stray duplicate source files in ch12: `m68789-segments(b).en.md`,
  `m68791-segments(b).en.md` + `(c)`, `m68793-segments(b).en.md` — clean up during the
  post-merge re-extract of those modules.
- **B4-D4 `[fix]`** the example title-donation logic also mis-donated physics-style
  "Strategy/Solution" para-headings: 287 title-only first paras across 166
  edlisfraedi-2e source files were being donated as example titles and dropped as
  paras. The Task-5 fix corrects this class for every FUTURE extraction; physics
  content heals when edlisfraedi is (re-)extracted, not in this arc.
- **B4-D5 `[fix]`** (Task 9) m68863 (appendices, RC4 second F3 member —
  `docs/audit/2026-07-06-f3-benign-retriage.md` § RC4) — table-header duplication ("ΔH (kJ/mol)"
  landing as both a translated and an untranslated copy) **reproduces in git history but is
  already healed on disk.** Current `books/efnafraedi-2e/03-translated/mt-preview/appendices/
  m68863.cnxml` is `PERFECT` (`node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter
  appendices --module m68863` → 0 discrepancies); `books/efnafraedi-2e/translation-errors.json`'s
  `diff:1 emphasis "known-loss-deferred"` entry for m68863 is **stale** (generated 2026-07-06T14:34,
  one day before the fix landed) — do not trust it; re-generate on the next full fidelity sweep.
  **Stage classification: inject-stage. No re-MT needed** — segments `m68863:entry:auto-153`/`-154`
  in `02-mt-output/appendices/m68863-segments.is.md` were always correct Icelandic
  ("Hitastig (K)" / "Δ[[i:H]] (kJ/mól)"); the defect never touched translation quality.
  **Mechanism (file:line evidence):** `buildTable` (`tools/cnxml-inject.js:2273-2361`) walks each
  row's source `<entry>` elements positionally via a `cellIdx` counter, looking up
  `row.cells[cellIdx]` from the module's `02-structure/*-structure.json`. m68863's header row has
  3 source `<entry>` elements (a blank spacer, "Temperature (K)", "ΔH (kJ/mol)") but the
  *pre-fix* `m68863-structure.json` recorded only 2 cells for that row — extraction had omitted a
  cell object for the blank leading `<entry align="left"/>`. That desynced `cellIdx` by one for
  the row's tail: entry #1 (blank) wrongly consumed `cells[0]` (the "Temperature" cell data,
  → "Hitastig (K)"), entry #2 consumed `cells[1]` (→ translated "ΔH (kJ/mól)"), and entry #3 hit
  `row.cells[2]` = `undefined`. The pre-fix code's final fallback simply `return`ed `entryMatch`
  (the untouched, untranslated source `<entry>`) whenever no cell matched — silently emitting the
  raw English "ΔH (kJ/mol)" as a phantom 3rd column. Proof: `git show 3d0c40d2 -- books/efnafraedi-2e/
  03-translated/mt-preview/appendices/m68863.cnxml` shows the fix-diff (blank `<entry>` restored,
  English-residue `<entry>` removed); `git show 689ddf3e -- books/efnafraedi-2e/02-structure/
  appendices/m68863-structure.json` shows the paired structure fix — a new
  `{"segmentId": null, "attributes": {"align": "left"}}` cell inserted as the row's first cell.
  Both commits are from the unrelated STALE-STRUCT re-extract/re-inject campaign
  (`re-extract 143 re-MT-free modules`, 2026-07-07 09:15; `re-inject 143 modules from fixed
  structure`, 2026-07-07 09:59) — m68863 was one of the 143 modules incidentally healed, a day
  *after* the F3 audit (2026-07-06) recorded the defect as still-open. The register entry was
  simply never revisited once the fix landed.
  **Residual hardening shipped this task (Outcome A):** the *mechanism* — `buildTable` silently
  passing raw source text through when `row.cells[]` under-counts a row's `<entry>` elements —
  was still live code, unrelated to whether m68863 itself was already fixed. The guard **rides the
  existing per-module incomplete idiom, it does NOT throw** (a throw at `buildTable` depth would
  bypass per-module isolation: it fires inside `buildCnxml` before the CLI's incomplete-check,
  isn't gated by `--allow-incomplete`, and would abort a whole `--chapter` batch at the first bad
  module). When a row's `<entry>` index has no matching `row.cells[cellIdx]` at all (not the
  legitimate `{segmentId: null}` placeholder case, which still passes through silently and
  correctly) **and** the uncovered entry has non-blank text, `buildTable` records the gap
  (`tools/cnxml-inject.js` `!cell && tableCellGaps` branch — `{tableId, rowIndex, entryIndex,
  recordedCells, text}` pushed to `stats.tableCellGaps`, threaded via `ctx.tableCellGaps` through
  all four call sites), still emits the source entry (pre-fix visible behavior), and
  `report.tableCellGaps` gates `report.complete` — so the CLI's established
  skip+continue+`process.exitCode=1` path handles it: module skipped unless `--allow-incomplete`,
  gap named loud on the console either way, blast radius one module not the batch. TDD:
  failing-first fixture in `tools/__tests__/cnxml-inject.test.js` (describe `"buildCnxml table
  row: undercounted structure.cells (RC4 / m68863)"`, 2 tests — gap recorded + incomplete +
  source emitted on real leaked content; no false-positive on a genuinely blank uncovered cell).
  Suites: inject + dom-comparison 351/351 green; full `tools/__tests__/` 97 files / 1495 green
  (baseline 97/1493 + this task's 2 new tests).
  **Side-findings, out of scope, logged not fixed — for the post-merge op:** live ch12/corpus
  `cnxml-inject.js` re-runs (reverted afterwards; `git status --porcelain books/` verified empty)
  show the guard fires on **two** committed ch12 modules, both already in the §10
  re-extract/re-MT queue ("m68789/791/793 ch12") — **not regressions introduced here**, their
  currently-committed output already contains the identical RC4-class defect:
  - **m68789** (table `fs-idm189410736` row 0 entry 3): committed header row
    `<entry>1</entry><entry>2</entry><entry>3</entry><entry>3</entry>` — duplicated untranslated
    "3".
  - **m68791** (table `fs-idm117482272` row 1 entry 3): committed header row carries translated
    "Núllta stig/Fyrsta stig/Annars stigs" **plus** a leftover untranslated
    `<entry align="left">Second-Order</entry>` (source has 4 entries incl. a blank spacer;
    structure recorded only 3 cells). This one was invisible to the earlier throw-version corpus
    check precisely because the batch aborted at m68789 first — found by the reworked
    skip+continue behavior.
  **What the op should expect:** a routine `--chapter 12` inject now completes the batch, writes
  m68785/786/787/793/794/795, prints `SKIPPED — incomplete injection` + `Table cell gaps
  (RC4/B4-D5, re-extract needed): 1` for m68789 and m68791, and exits 1. Verified per-module:
  m68793/794/795 inject clean (COMPLETE, no gap); m68791 writes only under `--allow-incomplete`
  (INCOMPLETE, gap named). Both heal at the §10 re-extract; until then the gate correctly refuses
  to overwrite them in a normal run.
  **THIRD gap-gated module — m66443 (liffraedi-2e ch03), added post-merge review (minor M7):** the
  design's live-corpus check was scoped to efnafraedi ch12 only, so it surfaced m68789/m68791. A
  static replay of the exact `!cell && tableCellGaps` guard across *all* books finds a third
  affected module: **liffraedi-2e ch03 m66443**, table `tab-ch03-05-01` (source row 1 has 3
  `<entry>` incl. a blank leading spacer; structure recorded only 2 cells → the trailing "RNA"
  entry hits `row.cells[2]=undefined`, non-blank). liffraedi-2e is on the **active biology
  onboarding path** (memory: NEXT = translate+inject biology chapters). The committed
  `books/liffraedi-2e/03-translated/mt-preview/ch03/m66443.cnxml` is already garbled from a March
  2026 extraction (row0="RNA", mis-shifted rows), so the gate firing is **correct** — but the
  server runs `cnxml-inject` without `--allow-incomplete` and treats non-zero exit as a failed job
  (blocking render/publish), so a `node tools/cnxml-inject.js --book liffraedi-2e --chapter 3` (or
  any Vista+Birta of that chapter/module) now exits 1 where it previously exited 0. **Add m66443's
  structure.json to the re-extract list** for the biology op; until then the operator hits an
  expected (undocumented-before-now) block.
- **B4-D6 `[gap]`** (Task 7) `localization-editor.js`'s preview renderer
  (`edRenderMarkdownPreview`, `:1318-1359`) has no arms for the whole `[[i:]]/[[b:]]/
  [[sub:]]/[[sup:]]/[[xref:]]` bracket family — confirmed absent via
  `grep -n '\[\[i:\|\[\[b:\|\[\[sub:\|\[\[sup:\|\[\[xref:' server/public/js/localization-editor.js`
  (zero matches). Task 7 ported only the four new B4 id-anchored types
  (`[[term:]]`/`[[fn:]]`/`[[u:]]`/`[[em:]]`) into this pane per its brief's scope note;
  porting the pre-existing i/b/sub/sup/xref gap is out of scope here — follow-up.
- **B4-D7 `[gap]`** (final-review minor M3, **un-fixed — census 0 today**) class-only
  `<term class="X">` with **no id** silently loses its class end-to-end. Extraction pushes
  `{class}` to the sidecar but emits the id-less bare marker `[[term:text]]`; at inject the bare
  marker sets `hasIdAnchoredMarkers`, skipping the positional block, and the bare conversion does
  no sidecar lookup — the class is dropped with no warning, no `attrMismatch` entry, invisible to
  `compareTagCounts`. Census over `books/*/01-source` = **0 occurrences today** (matches the
  design census: 0 class-without-id across 1,333 term entries), so nothing regresses now — but
  microbiology/other future intake could bring the shape and degrade silently. The one silent-loss
  path left in an otherwise fail-loud design. Fix when it appears: a one-line extract-time
  `warn(parsedAttrs.class && !parsedAttrs.id)` converts it to a loud intake signal.
- **B4-D8 `[gap]`** (final-review minor M5, **un-fixed — test-harness only**) the design's
  consumer-sweep item `tools/__tests__/cnxml-dom-comparison.test.js:129` `isApiTranslated` sniff
  was not extended for bracket-era segments. Production is fine (the CLI gates the restore trio on
  recorded producer provenance, not a content sniff — `cnxml-inject.js ~4090`), but the **test
  harness** still sniffs only `{{i}}/{{b}}/{{term}}/{{fn}}` (:129-133). After the §10 re-MT the 8
  modules' `02-mt-output` is bracket-only, so `isApiTranslated` evaluates false and the harness
  runs `restoreSupersub/Media/Newlines` over API-translated segments — the legacy `~/^`
  false-positive processing the guard exists to prevent — skewing the fidelity comparison for
  exactly the modules the op validates. No `books/` change in this PR → suite unaffected today;
  breaks silently at the data op. One-line fix: add `[[term:/[[fn:/[[u:/[[em:` (or `[[sub:/[[i:`)
  to the sniff, or read provenance like the CLI.
- **B4-D9 `[gap]`** (final-review minor M6, **un-fixed — cosmetic, preview-only**) nested-marker
  B4 terms mis-highlight in the editor EN pane (`server/public/js/marker-highlight.js:60-63`): the
  pipe rule `[^|\]]+` text group can't match a term whose text contains a nested marker (`]`
  present), so the step-3 `[[term:(.+?)]]` fallback interacts with earlier i/sub delim spans —
  ` orbitals|term-1]]` renders undimmed and delimiter spans nest wrongly for all ~128 nested terms
  once books re-extract. Character preservation holds (stripTags invariant true) — display-only.
  Related: `localization-editor.js`'s B4 arms use the same groups and that pane has **no**
  `[[i:]]/[[sub:]]` arms at all (see B4-D6), so a nested term there is partially consumed.
  `segment-editor.js` is fine for single-level nesting (sub/sup/i/b run before its B4 arms). Fix:
  a tempered-greedy pipe rule (the inject idiom) in marker-highlight; fold the loc-pane case into
  the B4-D6 follow-up.

## 10. Post-merge delivery op (own branch/PR, after lead merges the code PR)

1. **Probe** (~30 ISK): run the new T-cases live; gate ≈100% incl. byte-intact ids.
2. **Re-extract the 8** (m68764/770 ch10; m68789/791/793 ch12; m68829 ch18; m68847 ch20;
   m68860 appendices). Op detail to verify first: whether `--chapter N --module mX` re-extract
   assigns positional `sectionOrder` (the STALE-STRUCT lesson: single-module `--input`
   re-extract NULLs it; expect a `module-sections.test.js` update either way — runtime-inert
   since #250's collection-order authority).
3. **Re-MT** (~2,310 ISK) via `api-translate` — none of the 8 is `.locked` (verified; only
   ch01 m68663/m68664 + ch03 m68699/m68700 are locked, by design).
4. **Re-inject** both tracks (residue gates; the 8 are *expected* to fail
   `verify-reextract-equivalence` seg-id-set — that is why they are the re-MT set) →
   **re-render** affected chapters → regen goldens m68789/m68791 (expected, memory-noted) +
   `render-fidelity-baseline` if touched → `translation-errors.json` regenerates on inject.
5. Re-check the order gate (2 of the 6 flagged) and F8 — feeds roadmap #5/#7 gate flips.
6. Data-delivery PR; vefur sync/deploy stays in the LEAD lane (L3).

## 11. References (recon facts, 2026-07-12)

- Extract: emission map in `extractInlineText` `tools/cnxml-extract.js:164-424` (term :324-335,
  fn :394-402, underline :306, class-emphasis :310-320); sidecar write :1921-1926.
- Inject: `reverseInlineMarkup` :1166+; `{{term}}` :1367-1369, `{{fn}}` :1456-1458; positional
  attach :1467-1497; emphases positional :1352-1365; `hasApiMarkers` :1177-1181; pipe parsing
  :1395-1413; `stripTermMarkersToText` :785-803; `annotateInlineTerms` :823-885;
  `restoreTermMarkers` :201-292; `assertNoMarkerResidue` :1645-1654; sidecar load :3723-3732;
  `getSeg` :1688/:1716-1724.
- Census: 852+36 markers efnafraedi `02-for-mt`; 1,333 term entries, 293 class+id, **0
  class-only**; 64 footnote entries; 26 emphasis entries; `[[term:`/`[[fn:` = 0 repo-wide.
- Tests: `cnxml-extract.test.js:73/:83` (emission pins — these FLIP to the new format);
  `cnxml-inject.test.js` (100 cases, backward-compat pins stay); goldens read committed
  `03-translated` (code-only PR touches none).
