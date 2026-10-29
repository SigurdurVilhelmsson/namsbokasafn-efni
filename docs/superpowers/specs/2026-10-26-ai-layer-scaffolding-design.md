# The AI-reviewed layer: scaffolding, scope field, code gate and harness — DESIGN (2026-10-26)

> **FROZEN DESIGN RECORD — banner-dated 2026-10-26.** Evidence, never status. Open work and its state
> live in the active register's ⏩ RESUME block (`docs/plans/2026-07-21-post-item17-followup-campaign.md`).
> If this file disagrees with the register, the register wins. If it disagrees with the code and its tests,
> the code wins.

> **✏️ AMENDED 2026-10-26 (later that night), before the branch was pushed: homographs are restricted by SENSE,
> not by chapter.** The trigger was [USER]'s point that the AI layer exists to use the surrounding text. The
> sections below stand as first frozen; this amendment overrides them where they disagree.
> - **Withdrawn:** Unit B's two proposed widths, `group` → ch02 and `cell` → ch17 (they were MT-wire notes, not
>   rulings), and the question to [USER] about them. The chapter-scope mechanism stays (the three shapes, the
>   statuses, `scope.js` and its tests); no ruling uses it today.
> - **Unit B gains `sense`.** Every ruling carries `null`, or `{ id, gloss, otherSenses: [{id, gloss}], status:
>   'proposed'|'ruled' }`, compiled from a `senses` list in the same exceptions file. Each entry also records
>   `source` (who ruled the restriction) and `glossBy` (who drafted the wording), which go to a `sense` note.
>   `unclear` is reserved for the model's answer. Five rulings carry a sense: `addition` (the reaction; [USER]
>   2026-10-26), and `bent`, `cell`, `group` and `hole`, each taken from its `houseStyleTerms.js` why. [USER]
>   reviews the gloss wording together with the pilot's output.
> - **Unit C gains a third category, `term-sense`**, whose ops carry a `sense`, plus four codes:
>   `sense-undeclared`, `sense-mismatch`, `sense-not-applicable` and `sense-unruled`. The gate checks the
>   declared sense, never the judgement; the blind check measures the judgement, scored per category (10-10
>   plan 3.4).
> - **For the runner (not built yet):** the request gives each sensed ruling's closed list. A declared `unclear`
>   becomes a flag record for editors before the gate, so it never appears as a rejection. Where the MT used a
>   ruled target in a sense the ruling does not cover (*álagning* for adding a substance), the model flags and
>   never edits (D6).
> - Code: commits `a185a7717` (Unit B) and `a24475781` (Unit C, plus `tools/__tests__/ai-review-integration.test.js`,
>   which reads the committed ruling set through the gate).

**Implements:** pre-S plan items 1, 2 and 4 (`docs/plans/2026-10-26-pre-s-week-plan.md`, on branch
`docs/pre-s-plan-2026-10-26`); 10-10 plan §4, 1.2, 3.2, 3.3 and §6
(`docs/plans/2026-10-10-chemistry-finish-preparation-plan.md`); [USER]'s answers of 2026-10-26
(`docs/decisions/2026-10-26-pre-s-week-ai-layer-answers.md`).
**Not here:** the re-request mode, the glossary pre-screen, the 0-ISK census, the prompt, and the runner that
joins work list → request → gate → layer write. Those follow once these four units are merged.

**Measured inputs** (read-only, 2026-10-26, three readers and three adversarial verifiers; scripts and outputs
off-repo). The facts the design rests on:
- **A unit is one file**, `books/<slug>/<layerDir>/<chdir>/<stem>-segments.is.md`, with `chdir` ∈ `ch00…ch21`,
  `appendices` and `stem` ∈ `m\d+` (149) or `chapter-metadata` (21). `cnxml-inject` reads exactly that literal
  path (no directory listing, no merging), and enumerates modules from `02-structure`, so **a layer must be
  complete per chapter**.
- **Split files `<stem>-segments(b|c|d).*.md` are a dead legacy vintage:** written in the mustache
  `{{SEG:…}}` form (invisible to `tools/lib/seg-markers.cjs`), Feb 2026, superseded. Never read or copy them.
- **Duplicate segment ids are common:** 83 of 149 chemistry modules, 285 extra occurrences, all `para`, each
  duplicated exactly twice. 69 of the 75 differing IS pairs differ only in `[[MATH:n]]` numbering; 6 differ in
  wording (m68700, m68747, m68795, m68808, m68817, m68846). Inject is **first-wins**; the editor is
  **last-wins**. **The per-id ordinal pairs EN and IS 570 of 570; absolute file position does not** (8 of 570
  disagree, in 6 modules where a top-up anchored a table summary after a duplicated para).
- **Byte format:** 170 of 170 IS files have no trailing newline and 6 have irregular whitespace between
  segments, so re-serialising from trimmed records is byte-identical for **0 of 170**. A raw-block splice
  (marker text + leading whitespace + body + trailing whitespace) is identical for **170 of 170**.
- **Layer 1 means `02-mt-output` at a named commit (HEAD):** it already contains 78 hand-repaired occurrences
  (`experiments/mt-vintage-comparison/results/2026-10-10/data/carryover/handrepair_keys.json`) and 191
  separately bought top-up segments. A sidecar's `generatedAt` is the last top-up's time, not the buy's.
- **Rulings:** the compiled set (`experiments/terminology-consistency/results/2026-10-11/ruling-set-after-stage1.json`)
  has 418 rows; its 170 `before` rows have no `id`; every scope is `{kind:'book'}`; 4 `held` rows have no target.
  **D2 (2026-10-11) ruled the CLASS of exception (the `group`/`cell` homographs), not the chapters.** The widths
  in `houseStyleTerms.js` (`group` ch02, `cell` ch17) are MT-wire notes. A chapter list does not separate the
  senses (electrochemical `cell` also occurs in ch01, ch11, ch18, ch19 and the appendices).
- **18 ruled targets cannot pass a strict token gate** (digits, Greek, inner capitals, `*`, `/`: e.g.
  `sp3-blendingssvigrúm`, `σ-tengisvigrúm`, `pOH`, `(SHE)`), and in segment text `sp3` is `[[i:sp]][[sup:3]]`.
- **`usesHeadword` on raw text fires inside marker payloads** (`E[[sub:cell]]`, xref ids). Headword checks run
  on a visible-prose projection.

---

## Unit A — the layer reader/writer (`tools/lib/mt-layers.js`)

**Directories.** `LAYER_DIRS = { pure: '02-mt-output', selected: '02-mt-selected', revised: '02-mt-revised' }`.
- Layer 1 (`02-mt-output`) is **read only**. Nothing in this unit can write there.
- Layer 1s (`02-mt-selected`) is **sparse**: `<chdir>/<stem>-selected.json`, an overlay of whole segment
  bodies chosen from API runs (written later by the re-request mode). Format:
  `{ schema: 'mt-selected/1', module, entries: [{ segmentId, occurrence, text, run, commit, rule, gate }] }`.
- Layer 2 (`02-mt-revised`) is **complete per chapter**: for every unit in the chapter,
  `<stem>-segments.is.md` (full module text), `<stem>-revision.json` (provenance), `<stem>-changes.jsonl`
  (one line per change applied), and a byte copy of `<stem>-segments-links.json` where layer 1 has one.
  **Never** `*-provenance.json` (inject's restore policy and several tools glob that name) and **never** `*.log`
  (gitignored).

**Parsing and writing.**
- `parseLayerFile(text)` → `{ prefix, records }`, each record
  `{ segmentId, moduleId, segmentType, elementId, occurrence, key, markerText, lead, body, trail }`.
  It uses `SEG_MARKER` from `tools/lib/seg-markers.cjs` (MIT). It **refuses** a text holding `{{SEG:` or a marker
  not at a line start. `body` equals what `parseSegmentRecords` returns (trimmed); `lead`/`trail` hold the exact
  whitespace around it.
- `serializeLayerFile(parsed)` = `prefix + Σ(markerText + lead + body + trail)`.
- **Occurrence** = the 0-based ordinal of a marker among markers with the **same full segment id**, counted in
  that file's own sequence. String key: the bare segment id for occurrence 0, `${segmentId}#${k}` for k ≥ 1 (the
  form `tools/api-translate.js` already uses). **`seg-markers.cjs` exports the helper** (`occurrenceKey`,
  `withOccurrences`); `mt-layers` uses it; the two existing private copies are left alone and logged.
- `validateBody(body)` → problems: empty; not equal to its own `.trim()`; contains `\n`; contains a SEG marker.
- `applyBodyEdits(parsed, edits)` with edits `{ segmentId, occurrence, before, after }`: refuses if `before`
  differs from the current body (**a change record replayed onto a changed base must refuse**), validates
  `after`, and proves two things for every write — the zero-change serialisation equals the input bytes, and
  `parseLayerFile(serializeLayerFile(edited))` yields exactly the intended records.

**Reading.**
- `listChapterUnits({ bookDir, chapterDir })` → stems from `02-structure/<chdir>/*-structure.json`, plus
  `chapter-metadata` when layer 1 has `chapter-metadata-segments.is.md`. Names are built, never globbed from a
  segment directory (`02-mt-output` holds untracked `:Zone.Identifier` and `.backup.*` files).
- `readBase({ bookDir, chapterDir, stem })` → layer 1 parsed, with the layer-1s overlay applied when it exists,
  plus `{ layer1Sha256, overlaySha256 | null }`.

**Writing layer 2.** `writeRevisedChapter({ bookDir, chapterDir, units, revision })`:
- refuses unless the units cover **every** unit `listChapterUnits` returns (complete per chapter);
- refuses any destination that is not one of the **safe shapes**: inside `<bookDir>/02-mt-revised/<chdir>/` or
  `<bookDir>/02-mt-selected/<chdir>/`, with `chdir` matching `^(ch\d\d|appendices)$` and a filename matching
  `^(m\d+|chapter-metadata)-(segments\.is\.md|revision\.json|changes\.jsonl|segments-links\.json|selected\.json)$`
  (list the safe shapes; never enumerate dangerous ones);
- writes atomically (tmp + rename);
- `revision.json`: `{ schema: 'mt-revised/1', module, chapterDir, layer1: { dir, commit, sha256 },
  overlay: { sha256 } | null, rulingSet: { path, sha256 } | null, prompt: { path, sha256 } | null,
  model | null, sdk: { name, version } | null, anthropicVersion | null, harnessCommit, runIds: [],
  counts: { accepted, rejected, byCategory } }`. A unit with no changes still gets a revision file
  (rule-layer-only or zero-change), so every unit is accounted for.
- change record (one JSON object per line): `{ module, segmentId, occurrence, key, opId, source: 'rule'|'ai',
  ruleId | rulingId, category, find, replace, before, after, beforeSha256, afterSha256, runId }`.

`verifyRevision({ bookDir, chapterDir, stem, current })` compares a unit's `revision.json` with the current
inputs (layer-1 sha256, overlay sha256, ruling-set sha256, prompt sha256, model) and returns the mismatches.
**A mismatch on any of them refuses the module** (10-10 §4).

**CLAUDE.md** gains a File Permissions row for `02-mt-selected/` and `02-mt-revised/` (and the AI records,
Unit D): *tool-written data — never by hand, never regenerated, never deleted to reset.*

**Tests** (`tools/__tests__/mt-layers.test.js`): the zero-change round trip is byte-identical on **every**
committed chemistry layer-1 unit (positive control on real data); m68727's 366 markers / 358 ids yield
occurrences 0 and 1 for its 8 duplicated ids; a replayed edit on a changed base refuses; an invalid body
refuses; an unsafe destination refuses (including any path under `02-mt-output/` or `01-source/`); an
incomplete chapter refuses; `verifyRevision` reports each mismatch; the written tree round-trips through
`parseLayerFile`.

## Unit B — the scoped ruling set (`tools/ai-review/compile-ruling-set.js`, `tools/ai-review/ruling-set.js`)

✏️ *The two proposed widths below were withdrawn for senses; see the amendment at the top.*

**Input.** `experiments/terminology-consistency/results/2026-10-26/scope-exceptions-2026-10-26.json`:
`{ about, recordedAt, exceptions: [{ enNorm, scope, status: 'proposed'|'ruled', source, note }] }`.
On 2026-10-26 it holds two **proposed** rows: `group` → `{kind:'chapters', chapters:['ch02']}` and
`cell` → `{kind:'chapters', chapters:['ch17']}`, each citing its `houseStyleTerms.js` line and D2.

**Compiler.** `compileRulingSet(base, exceptions)` is pure and **deterministic** (no timestamp, no HEAD in the
output, sorted keys and rows), so a test can re-run it and require byte equality with the committed artifact.
CLI: `node tools/ai-review/compile-ruling-set.js --base <path> --exceptions <path> --out <path>`.
Output `experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json`:
`{ schema: 'ai-review-ruling-set/1', about, base: { path, sha256 }, exceptions: { path, sha256 },
counts, rulings: [...], excluded: [{ enNorm, reason }], notes: [...] }`. One **effective ruling per enNorm**,
after `supersededInBefore` is applied:
`{ id, enNorm, en: [forms], is, competitors: [...], scope, scopeStatus: 'default'|'proposed'|'ruled',
kinds: [...], sources: [...], matchable: true|false, unmatchableReason? }`.
- `id` is a slug of `enNorm` (lowercase ASCII, `-`), unique, minted here; the 170 `before` rows have none.
- `held` rows and rows without a target go to `excluded`.
- `matchable:false` with a reason for a target the gate's token rules cannot pass (digits, Greek, inner capital,
  operator or bracket characters) and for an `enNorm` carrying a placeholder (`[formula]`).
- Two rows of one enNorm with different targets (case-insensitive) refuse the compile (exit 1).
- Scope has exactly three shapes: `{kind:'book'}` · `{kind:'chapters', chapters}` · `{kind:'exclude', chapters}`.
  Chapters are the strings `chNN`/`appendices`, never integers (`0` means both ch00 and "book" in older data).
  Legacy integer chapters convert on read (`0` → book, `-1` → `appendices`, `N` → `chNN`); any other shape refuses.
- Every exception enNorm must match at least one row (else refuse); the scope applies to every row of it.

`loadRulingSet(path)` validates the artifact (schema, shapes, chapter tokens) and returns
`{ rulings, byId, sha256 }`.

**Tests** (`tools/__tests__/ai-review-ruling-set.test.js`): re-compiling the committed inputs reproduces the
committed artifact byte for byte; `group` and `cell` carry their proposed scope and `scopeStatus:'proposed'`,
and every other ruling is `{kind:'book'}`/`'default'` (non-vacuous: the non-book count is exactly 2); every
chapter token is a real directory under `books/efnafraedi-2e/02-for-mt/`; `bonding orbital` resolves to
`tengisvigrúm`; `held` rows are excluded; at least one `matchable:false` ruling exists and carries a reason; the
legacy-chapter converter maps 0/−1/N and refuses a string it does not know.

> **✏️ AMENDED 2026-10-29 — a third, optional input: amendments.** [USER]'s decisions on the 35
> glossary-vs-ruling conflicts (`docs/decisions/2026-10-29-glossary-ruling-conflicts-resolved.md`) change
> targets, and the compiler had no input that could. `--amendments <path>` reads
> `{ about, recordedAt, record, amendments: [ {op:'retarget', enNorm, from, to, decision} | {op:'add', en, is,
> decision} | {op:'remove', enNorm, from, decision} ] }`, applied after `supersededInBefore`. Why each choice:
> - **Optional, and absent rather than null when not given**, so the 2026-10-26 artifact still recompiles byte
>   for byte: its byte test is what proves the change is backward compatible. `RULING_SET_ABOUT` is unchanged;
>   a second sentence is appended only when amendments are given.
> - **A retarget or remove names the CURRENT target as `from`** (case-insensitive, as a supersession compares),
>   so an amendments file written against another set refuses instead of applying blind.
> - **A retarget's old target survives as a competitor**, like a superseded one, so the pass still recognises
>   the form it replaces; the existing gloss-free comparison drops it when only a symbol was trimmed.
> - **A removed headword stays visible**, under `excluded` with reason `removed`, so rulings + excluded still
>   cover every enNorm.
> - **One amendment per enNorm**, so the order of the list cannot change the result.
> Each amendment leaves a note citing the record and the decision, and `counts.amendments` counts each op.
> Pinned by `tools/__tests__/ai-review-ruling-amendments.test.js` (every refusal with a control; the 35 decisions
> against `experiments/terminology-consistency/results/2026-10-29/ruling-set-2026-10-29.json`).

## Unit C — the code gate (`tools/ai-review/{tokens,lexicon,scope,gate}.js`)

10-10 §3.3 applied to every operation. Pure functions; no I/O; no import from `server/`.

**Operation** (as the model returns it, after the runner maps its segment label):
`{ opId, category: 'term'|'agreement', rulingId, find, replace, reason }`.

**`tokens.js`.** A depth-aware tokenizer for segment text that mirrors `unwrapInventedMarkers`' grammar and
returns every marker token's exact text, **including bare `[[BR]]` and `[[SPACE]]`**, plus:
- `markerMultiset(text)` (exact token strings);
- `editableSpans(text)`: plain prose outside markers, and the display text of `i`, `b`, `u`, `em`, `term`, `fn`,
  `link` and `docref` labels, **except** an `i`/`b` payload with no word of 4 or more letters (variables such as
  `M`, `s`, `aq`). Protected: all marker syntax, every `|…` tail, the whole of `xref`, `MATH`, `MEDIA`,
  `TABLE`, `BR`, `SPACE`, and every `sub`/`sup` payload;
- `visibleProse(text)`: the projection used for headword checks (drops sub/sup payloads, `|…` tails, ids, URLs,
  and MATH/MEDIA/TABLE tokens).

**`lexicon.js`** (hand-curated, committed, fail-safe: a missing word only causes a refusal):
- `CLOSED_CLASS`: Icelandic article and pronoun forms (`hinn` paradigm; `sá`/`sú`/`það`; `þessi`; personal
  pronouns), the words an agreement operation may change whole;
- `BARRED`: negations (`ekki`, `eigi`, `aldrei`, the `enginn` paradigm, `hvorki`, `né`) and number words
  (cardinals and ordinals, including `einn`/`ein`/`eitt` and `annar`);
- `ELEMENT_SYMBOLS` (118). No BÍN-derived list (BÍN is CC BY-SA; `tools/` is MIT).

**`scope.js`.** `inScope(scope, chapterDir)` and the status rule: **a ruling whose `scopeStatus` is `proposed`
admits no operation** (reason `scope-unruled`) until [USER] rules its width.

**`gate.js`.** `gateSegment({ ops, en, is, chapterDir, rulingsById, limits })` →
`{ accepted, rejected: [{ op, reasons }], after }`. Term operations first, then agreement operations, each
checked against the text as the operations before it left it, and applied in order. Checks per operation:
- the ruling exists, is matchable, and is not `held`; its scope admits `chapterDir`; its status is not `proposed`;
- the English **visible prose** contains one of the ruling's English forms (word-bounded `usesHeadword`);
- `find` occurs **exactly once** in the current IS text and lies **wholly inside one editable span**;
- no forbidden token in `find` or `replace`: `[ ] |`, any digit (including sub/superscript digits), Greek
  (`greekLetters`), the operator set (`= + − – × ÷ ± / % ‰ ° ⇌ → ⟶ ← ↔ ≤ ≥ ≈ * ^ ~ $`), `& < >`, legacy
  `{{ }} __ ++`, NBSP and other non-ASCII spaces, soft hyphen, zero-width characters, C0 controls and DEL; a
  word with an uppercase letter after its first character; a word equal to an element symbol (documented
  over-refusal: sentence-initial *Er*, *Og*);
- the marker multiset of the segment is unchanged by the operation;
- a **term** operation's `replace` contains the target (stem match, `stemOf`/`containsStem`, umlaut-folded), and
  `find` does not already;
- an **agreement** operation needs an accepted term operation in the same segment, lies within
  `limits.agreementWindowWords` words of it, has the same word count in `find` and `replace`, and every changed
  word is either in `CLOSED_CLASS` on both sides or an ending change (shared prefix, both tails in the ending
  class `^[aeiouyáéíóúýöænrsmðj]{0,8}t{0,2}$` under a/ö folding); a `BARRED` word on either side refuses;
- size bounds per operation and per segment (`DEFAULT_LIMITS`, exported, test-pinned);
- `replace` differs from `find`; no two accepted operations overlap.

`gateOccurrences({ ops, en, isOccurrences, … })` applies the same operations to every occurrence of a
duplicated id and accepts an operation only if it is accepted in **all** of them (else `duplicate-divergent`
for every occurrence). Rejection reasons are a closed, exported set of codes.

**Tests:** one per check, each with a passing control beside the refusing case; real segment shapes from
`books/efnafraedi-2e/02-mt-output` as fixtures (markers, MATH placeholders inside prose, `[[i:sp]][[sup:3]]`,
`E[[sub:cell]]`).

## Unit D — the harness (`tools/ai-review/{pricing,ledger,records,transport-anthropic,harness}.js`)

**Records** (committed with the layer, [USER] 2026-10-26): `books/<slug>/ai-review/runs/<runId>/` with
`run.json` (use, model, effort, max_tokens, prompt paths and sha256, ruling-set sha256, SDK name and version
read from its `package.json`, the `anthropic-version` actually sent, harness commit, mode, cap), `requests.jsonl`
(`custom_id`, the segment key it stands for, the full request body), `responses.jsonl` (`custom_id`, the raw
response or batch result, `stop_reason`, the model that answered, usage, cost), `errors.jsonl`, and `run-end.json`.
**No API key or header is ever written.**

**Ledger** `books/<slug>/ai-review/ledger.jsonl`, append-only, shared by every use (the AI pass and the glossary
pre-screen share one cap): `reserve` (worst case) before a call or batch, `settle` (actual) after, `release` on
failure. The cap check sums settlements plus open reservations; a call whose worst case would cross the cap is
refused. `CAP_USD` = 100 ([USER] 2026-10-26) lives in one module with a test.

**Pricing** (`pricing.js`, an enforceable value with its source and date): `claude-opus-5-5` USD 4 / 20 per
million input / output tokens, cache write 1.25× (5 min) or 2× (1 h) of input, cache read USD 0.20; Batch API
× 0.5. Thinking tokens bill as output. An unknown model refuses. Invoices decide; the table is for the cap.

**Transport.** `createAnthropicTransport({ apiKey, fetch })` builds the SDK client lazily, so the module loads in CI
with no key; an injected `fetch` makes it testable offline. Methods: `send(body)`, `countTokens(body)`,
`submitBatch(requests)`, `getBatch(id)`, `batchResults(id)`. **No `fallbacks` parameter**: a refusal is recorded as
an outcome, so the recorded model is always the model that answered (and Batches reject the parameter anyway).
Every request sets `output_config.effort` explicitly.

**Harness.** `runInteractive` and `runBatch` share one record shape. `custom_id` is minted
(`[A-Za-z0-9_-]{1,64}`) and mapped to its segment key in `requests.jsonl`, never encoded from the key. A batch
run records its batch id before polling and resumes an unfinished batch instead of resubmitting. The API key comes
from `ANTHROPIC_API_KEY` or the git-ignored `.env`; with neither, the harness refuses loudly.

**Tests:** a mock transport for the flow; the live transport through an injected `fetch` (no network); the cap
refuses; reservations and settlements sum correctly; batch and interactive records have the same shape; costs
include cache and thinking tokens and the batch discount; a bogus key string appears in no record; a refusal is
recorded, not retried on another model.

---

## Logged, not built here

- `applyApprovedEdits` writes the last IS occurrence's text for every EN occurrence of a duplicated id, so an
  editor apply changes occurrence 0 (e.g. m68727 `[[MATH:20]]` → `[[MATH:21]]`).
- `spliceTopUp` anchors over a first-wins deduplicated EN sequence; that produced the 7 reordered table summaries.
- `cnxml-render` reads section titles, slugs and the chapter title from `02-mt-output` directly (via
  `module-sections`), a reader `--source-dir` does not redirect.
- The server maps track `mt-preview` → `02-mt-output` in code; `inject --source-dir 02-mt-revised` also maps to
  `mt-preview`. Which layer the preview shows is 10-10 4.1/4.5's decision.
- Two private copies of the occurrence-key helper (`api-translate.js`, `remt-checks-mt.js`) should move to the
  shared export.
