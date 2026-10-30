# The AI-reviewed layer's runner: work list → request → harness → gate → layer 2 — DESIGN (2026-10-27)

> **FROZEN DESIGN RECORD — banner-dated 2026-10-27.** Evidence, never status. Open work and its state
> live in the active register's ⏩ RESUME block (`docs/plans/2026-07-21-post-item17-followup-campaign.md`).
> If this file disagrees with the register, the register wins. If it disagrees with the code and its tests,
> the code wins.

> **✏️ AMENDED 2026-10-29: term-pass v2, a per-segment operation budget.** It overrides the blocks below where
> they disagree.
>
> - **Why:** the flat cap of 6 bit through the PROMPT, not the gate. In the ch10 pilot (runs of 2026-10-28/29)
>   the model stopped at 6 operations and flagged `needs-rewrite` on 4 / 3 / 2 segments (medium / high / xhigh),
>   so the gate never logged a `segment-op-limit`. Raising the gate's number alone would have changed nothing.
>   Every capped segment had 5–12 English uses of its offered rulings.
> - **The budget** (`gate.js` `segmentOpBudget`, [USER] chose the formula 2026-10-29): max(6, 3 × uses), where
>   `countEnUses` counts the listed rulings' uses in the visible, hyphen-folded English, from the request alone
>   (phrase precedence among the listed rulings; overlapping forms of one ruling at one place count once;
>   satisfied rulings count too, since the budget is a bound). 3 is the flat cap's own reckoning (a term change
>   and two agreements per use). The half-segment share is unchanged and stays the stop on a rewrite: measured
>   on the pilot, it leaves room for 6–34 more operations in every capped segment.
> - **The request** is `term-pass-user/2`: each segment carries `maxOps`. The parser also reads the v1
>   documents recorded runs hold; the renderer writes v2 only.
> - **Apply** refuses a request whose format is not its run's recorded `userFormat` (`bad-record`), runs of two
>   formats together (`mixed-runs`), and a v2 `maxOps` that differs from the budget recomputed now
>   (`stale-budget`); it passes the budget to the gate as `maxAcceptedOpsPerSegment`. A v1 record keeps the
>   flat 6.
> - **The prompt** is `tools/ai-review/prompts/term-pass-v2.md`; v1 stays byte for byte (a test pins its
>   sha256 to the pilot runs' record). v2 states the budget, says to fix every use of a term including a
>   sentence-initial capital (pilot item i02), and that an everyday explanation in parentheses keeps its
>   everyday words ([USER]'s ruling on pilot item i04). Its worked examples are v2 documents whose `maxOps` the
>   test recomputes. ⚠️ `apply` checks every run against the CURRENT prompt, so the three pilot runs can be
>   re-applied only from a commit before v2.
> - **Not in this amendment:** the leftover-form check (an old form left after an accepted fix). [USER]
>   decided 2026-10-29 that it flags for the editor and never retries or rejects; it is apply-side and does
>   not change the prompt.

> **✏️ AMENDED 2026-10-27 (evening), after a final adversarial review of the afternoon's fixes** (3 lenses, 19
> findings, each checked by an independent refuter). It overrides the afternoon block where they disagree.
>
> - **"Usable" has one definition, `isUsableParse`:** no request problem AND every presented segment answered.
>   Coverage uses it (an answer that skipped segments, or answered none, used to count), records
>   `segmentsUnanswered` and `requestsTruncated`, and `run`/`resume` parse each finished chapter's answers with it and
>   stop on any unusable one. `judgeRun` also compares usable answers with `planned`, so a request that was never sent
>   stops the run.
> - **A withdrawing flag naming no ruling withdraws every operation in its segment; so does a second entry for a
>   segment.** The partial-coverage refusal names the remedy for its cause: after truncation, raise `--max-tokens`,
>   re-run the whole chapter and apply that run alone (runs with different `max_tokens` cannot be applied together).
> - **`resume --yes` closes a killed interactive run** (`interrupted`): every open reservation of the run is settled at
>   its worst case, each request left in flight is recorded as an `interrupted` error, and the run can then be applied
>   together with a fresh run of the chapter.
> - **`quantifier-agreement` also reads the word right after the TERM** (the word after `find` only when the term ends
>   `find`; a carried trailing word is checked as part of the shared run), not after a comma or full stop; and a part
>   glued to the term (`H-`) takes no place in the two-word look-back. Known under-refusals, pinned by tests and left
>   for a ruling on width: `einni eða fleiri O-frumeindum`, partitive `Ein af tvítengdu …`.
> - **The gate's English check folds hyphens as the work list does** (the helper lives in `tokens.js`), so the offers the
>   fold added are editable.
> - **The prompt** no longer says a request's segments are each other's context (only segments needing a check are
>   sent), and teaches the word-after and glued-prefix rules.
> - **Still open, beyond the afternoon list:** `--limit` exits 0 and prints no line for the chapters it skips; a
>   stop_reason other than end_turn, refusal or max_tokens still counts as `succeeded` in the harness (the parse check
>   now catches its effect); `--out`/`--report` through a hard link; the `books` component check refusing an unrelated
>   path; the 7 of 282 over-refusals of real frumeind→atóm swaps; read-only neighbour segments; an apply filter by unit,
>   ruling or category (needed for the blind check's per-category drop and for D7).

> **✏️ AMENDED AGAIN 2026-10-27 (afternoon), after the adversarial review of the built runner** (5 lenses, 37
> findings, each checked by an independent refuter; work resumed after a machine crash, nothing pushed). Where this
> block disagrees with the block below or the sections under it, this block wins; the code and its tests win over
> both.
>
> - **`term-pass.json` is written by the harness right after `run.json`** (its `extraRecords` option), before any
>   count, reservation or send. The CLI used to write it in a `finally`, so a process killed while polling a paid
>   batch left a run that neither `resume` nor `apply` could use.
> - **`resume` collects against the recorded `requests.jsonl`; it no longer re-plans.** A HAND REPAIR or a prompt fix
>   after the buy no longer strands a paid batch: `apply` is the staleness gate. `resume` reads `run.json` (use, mode)
>   before `term-pass.json`.
> - **An answer cut off at `max_tokens` has its own outcome, `truncated`,** counted apart from `succeeded`. An
>   interactive run stops after `maxConsecutiveErrors` truncations in a row (`stopped-on-truncation`). `run` stops
>   before the next chapter when any answer of a chapter is unusable (truncated, refused, errored or missing), and
>   `run`/`resume` exit 2 whenever a chapter is not complete and fully usable (0 done, 1 refused or failed).
> - **`term-pass.json` is schema `ai-review-term-pass/2`:** it adds `plannedRequestKeys`, the chapter's whole plan
>   recorded before any `--limit`. All runs given to one `apply` must share it. `apply` measures coverage against it (a
>   planned request counts only with a usable answer), records it in `apply.json` and the report, and `apply --write`
>   refuses an incomplete chapter. A recorded `--partial` was considered and NOT built: `revision.json`
>   (`mt-revised/1`, exact keys) has no field that could say a chapter is partial.
> - **A ruling the model flags in a segment with `needs-rewrite`, `compound-term`, `target-other-sense` or
>   `sense-unclear` makes no edit there** (reason `flagged-no-edit`, logged as the runner's). `mistranslation-suspected`
>   does not withdraw. A withdrawn operation also keeps the reason it first failed for, which completes the "root
>   cause" bullet of the block below.
> - **The parser (Unit U3; overrides its lists below):** `unclear` is recognised after trimming and lower-casing, on
>   an operation of any category, and becomes a `sense-unclear` flag; a segment whose senses entry for a ruling is
>   `unclear` turns that ruling's `term-sense` operations into such flags; a `term-sense` operation with no senses entry
>   for its ruling is rejected `sense-unjudged`; every flag carries `valid` (its ruling is null or offered there).
> - **The gate's term branch refuses two more shapes:** `term-op-too-wide` (apart from unchanged words at its start or
>   end, `replace` has no more words than the target) and `quantifier-agreement` (a gendered number word or quantifier
>   among the two words before `find`, or among the unchanged words; it over-refuses where genders happen to match).
>   Known under-refusals, left for a ruling: weak ordinals and collectives, `hvor`/`hver`, and a quantifier inside a
>   marker. The prompt teaches both rules and that a hyphen is a word boundary.
> - **The work list reads a hyphen that joins two letters as a space** (`Fuel-cell` matches `fuel cell`), on the
>   English side only. Unlike the three precision rules in the block below, this one ADDS offers as well as
>   withholding them. The whole-chemistry totals therefore changed: read them in the pin in
>   `tools/__tests__/ai-review-worklist.test.js` (independent recount named in its header), not in the figures below.
>   En dashes are not folded.
> - **`run` refuses from a linked git worktree** (the cap is per ledger, so it is enforced per main checkout).
>   **`--out`/`--report` are judged by where the write lands** (real path; no `books` component). **Preflight compares
>   each chapter's input files with the layer-1 commit in both directions,** so a deleted or an added input refuses.
> - **Not built, open:** a machine-wide ledger; per-unit coverage in `revision.json`; `apply` letting a later run's
>   unusable answer replace an earlier usable one; a re-buy guard; a `CODE_PATHS` check on `resume`; fingerprinting
>   `<stem>-segments-links.json`; the import-closure test's blindness to `createRequire`; the other low findings; and
>   the refused neuter agreements (`tengd` → `tengt`), deferred to the pilot's measurement.

> **✏️ AMENDED 2026-10-27, the same day, while building the glue (before the branch was pushed).** The sections
> below stand as first frozen; where they disagree, this block overrides them.
>
> - **A request shows the item's first kept occurrence,** not "the first that is a candidate". The work list keeps
>   candidacy per item, not per occurrence, and the gate applies every operation to every occurrence anyway.
> - **A revision's `harnessCommit` is the commit of the code that APPLIED the responses** (the gate and the layer
>   writer). Each run's own commit stays in its `run.json`, which `runIds` points to.
> - **The group rule reports the root cause.** A rejected operation carries its reasons from the round in which it
>   first failed (`agreement-too-far`, `duplicate-divergent`), not the consequence a later round reports once the
>   group rule has withdrawn its term operation (`agreement-without-term`).
> - **`run` spends nothing without `--yes`;** without it, it stops after the preflight and the plan.
> - **`CODE_PATHS` = `tools/ai-review`, `tools/lib`, `tools/api-translate.js`.** A paid run and a layer-2 write refuse
>   while any of them is untracked or modified. A test pins the list against the CLI's real load closure (static
>   imports, and `require` inside `.cjs` files). `tools/api-translate.js` is in it because `config.js` imports its
>   `.env` loader; its lazy, guarded `require` of a server module never runs here, so `server/` is not.
> - **Records default to `<bookDir>/ai-review`**, so an injected book can never write records into the real tree.
> - **`apply --write` refuses a non-empty `02-mt-revised/<chapterDir>/`** unless `--overwrite`, beside
>   `writeRevisedChapter`'s own per-file refusal.
> - **The work list has three more precision rules** (from the U1 and U3 reviews; all withhold, never offer):
>   - _phrase precedence_: a ruling matches a segment only where some English use of it lies outside every use of a
>     LONGER ruling's phrase. Rule 4's guard cannot see an uncatalogued rendering of the longer term: the U3 review
>     measured the real gate accepting `Vetnisrafalar` → `Vetnisker` under `cell` on ch17 text whose every "cell"
>     is inside "fuel cells". With precedence, `cell` is never offered there, so the op is `ruling-not-offered`.
>     Every ruling shadows, whatever its status, and never itself;
>   - _masked competitors_: the competitor test runs with every word headed by the target blanked, because 14
>     competitors' stems sit inside their own target (`hiti` in `hitastig`) and flagged 581 items that were
>     already right;
>   - `empty-is`, a fourth skip reason.
> - **The census under "Measured inputs" is superseded.** Its 4,435 / 6,187 came from an early probe with another
>   matcher. The implemented rule, agreed to the unit by an independent recount, gives **4,088 items, 4,105
>   candidate occurrences and 5,613 segment–ruling pairs**, which `plan --all` chunks into **591 requests** (0 ISK,
>   2026-10-27). Its worst case is USD 117 in batch for the whole book, with at most USD 10.48 (ch07) reserved at
>   once.

**Implements:** pre-S plan items 4–6's runner (`docs/plans/2026-10-26-pre-s-week-plan.md`, on branch
`docs/pre-s-plan-2026-10-26`) on top of the four units of
`docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md` (A layers, B rulings, C gate, D harness), and
the six items the register's 2026-10-27 (small hours) entry says the runner owes.
**Not here:** the rule layer (10-10 3.1; a change record already has room for `source: 'rule'`), the re-request
mode, the glossary pre-screen, and a retry-of-failed mode.

## Measured inputs (0 ISK, 2026-10-27, scripts off-repo)

- **Work-list size.** With the candidate rule below, chemistry has **4,435 candidate segment occurrences**
  (6,187 segment–ruling pairs) in 22,876 layer-1 occurrences, about 1.73M characters of English. At 8 segments a
  request that is roughly 550 requests.
- **IS = EN.** 4,184 occurrences have an Icelandic body equal to the English: 1,836 hold no word of 2+ letters
  (numbers, symbols, markers), 1,524 hold 1–2 words (units, symbols, names, short table labels), 632 are a
  whole `[[MATH:n]]`/`[[MEDIA:n]]`/`[[TABLE:n]]` placeholder and 192 hold 3+ visible words (mostly formulas and
  table entries). None is a terminology edit; editing one would be translating it, which only the MT API may do.
- **Layer directories.** `02-mt-selected/`, `02-mt-revised/` and `ai-review/` hold no tracked file for chemistry,
  so the overlay's entry shape can change without a schema bump.
- **Longer rulings exist for the compounds:** `electrolytic cell → rafker`, `galvanic cell → galvaníker`,
  `fuel cell → efnarafall`, `dry cell → þurrker`, `cell potential → kerspenna` and others, beside
  `cell → ker` (sensed). Run through the real gate:
  - `Rafgreiningarklefi er notaður` → `Rafker er notað` under `electrolytic-cell` is accepted (term + agreement);
  - `Títanfrumeindirnar eru gráar og súrefnisfrumeindirnar eru rauðar` → `Títanatómin eru grá og súrefnisatómin
eru rauð` under `atom` is accepted (two head swaps, two agreements);
  - **the gate ACCEPTS a coinage**: `vetnisefnarafala` → `vetniseldsneytiskeri` under `cell`/`electrochemical-cell`
    (the target is the head, nothing is forbidden). Only the prompt and the shadowing guard below stop it;
  - `Álfrumeindin` → `Álatómið` is refused (`term-target-missing`: the gate's documented 2-letter-modifier
    over-refusal, `ál`).

## Three rules the four units do not enforce, and one guard

1. **All or nothing per segment and ruling (`group-incomplete`).** The gate decides each operation on its own, so
   it can accept a term operation and reject the agreement it forces (a pronoun six words away), which would leave
   the segment ungrammatical. The runner withdraws every accepted operation of a ruling in a segment when any
   operation of that ruling there was rejected, and re-gates the segment without them, to a fixpoint.
2. **Never coin; a longer ruling governs.** The prompt tells the model that the longest matching ruling decides,
   that a compound is fixed only by swapping a head that renders the English term, and that where a fix would
   need a new word it makes no edit and flags `compound-term`.
3. **Skip IS = EN.** An occurrence whose Icelandic equals its English is never offered (`identical-to-en`).
4. **Shadowing guard (`shadowed-by-longer-ruling`).** An operation of ruling R is rejected when its `find` contains
   the target or a competitor of a LONGER ruling L offered for the same segment, where L's English form contains
   R's as a whole-word phrase (`fuel cell` ⊃ `cell`). The check uses the gate's loose `containsTargetStem`, so it
   refuses more rather than less. It is what stops the accepted coinage above.

## Unit U1 — the work list (`tools/ai-review/worklist.js`)

Pure; inputs are parses from `tools/lib/mt-layers.js` (`parseLayerFile` / `readBase`).

- `SKIP_REASONS = ['identical-to-en', 'no-en', 'no-is']` (frozen, sorted).
- `pairUnit({ en, is })` → `{ items, skipped }`. `en` and `is` are `ParsedLayer`s. Pair by occurrence `key`
  (`segmentId` for occurrence 0, `segmentId#k` after). An IS occurrence with no EN partner → `no-en`; an EN
  occurrence with no IS partner → `no-is`; an IS body equal to its EN body → `identical-to-en`. `skipped` counts
  per reason (every reason present, 0 when none) plus `skippedKeys: [{ key, reason }]`. `items`:
  `[{ segmentId, occurrences: [{ occurrence, key, en, is }] }]`, one item per segment id that kept at least one
  occurrence, in the IS file's order of first occurrence, occurrences ascending.
- **Eligible ruling:** `matchable === true`, `kinds` has no `held`, `inScope(scope, chapterDir)`,
  `scopeStatus !== 'proposed'`, and `sense === null || sense.status === 'ruled'`.
- **Matches an occurrence:** some form in `ruling.en` passes `usesHeadword(form, visibleProse(occ.en))`.
- **Candidate for an occurrence:** eligible, matches, and `ruling.sense !== null`, or
  `!carriesTarget(occ.is, ruling.is)`, or some competitor `c` has `containsTargetStem(occ.is, c)`.
  (`carriesTarget` is the gate's strict matcher, `containsTargetStem` its loose one, both exported from
  `gate.js`: the selection is deliberately over-inclusive; the model and the gate narrow it.)
- `offeredRulings({ item, rulings, chapterDir })` → `{ candidateIds, rulingIds }`, both sorted: `candidateIds` are
  rulings that are a candidate for at least one occurrence; `rulingIds` are ALL eligible rulings matching at least
  one occurrence — but only when `candidateIds` is non-empty (else both are empty). Satisfied rulings are offered
  as context so the model sees a longer ruling that already holds (`fuel cell → efnarafall`) before it touches a
  shorter one.
- `buildWorkList({ chapterDir, units: [{ stem, en, is }], rulings })` →
  `{ chapterDir, units: [{ stem, items: [{ segmentId, occurrences, candidateIds, rulingIds }], skipped }], counts }`.
  Items with no candidate are dropped and counted. `counts`: `{ units, occurrences, items, candidateOccurrences,
pairs, skipped: {reason: n}, noCandidate }` where `pairs` = Σ `candidateIds.length` over kept items.
- Deterministic: same input, same output (no Map iteration order leaks, no time).

## Unit U3 — the response parser (`tools/ai-review/term-pass-response.js`)

Pure. Reads one raw Messages API response for one request.

- `FLAG_KINDS = ['compound-term', 'mistranslation-suspected', 'needs-rewrite', 'sense-unclear', 'target-other-sense']`.
- `REQUEST_PROBLEMS = ['response-empty', 'response-invalid', 'response-refusal', 'response-truncated', 'response-unparseable']`.
- `RUNNER_REJECTIONS = ['group-incomplete', 'response-duplicate-segment', 'response-unknown-segment',
'ruling-not-offered', 'sense-inconsistent', 'shadowed-by-longer-ruling']` (`group-incomplete` is assigned by the
  apply step; listed here so the closed set has one home).
- `parseTermPassResponse({ message, requestKey, presented, rulingsById })`:
  - `presented`: `[{ segmentId, rulingIds }]`, the segments the request showed, in order;
  - returns `{ problem, segments, rejected, flags, senses, missing }`:
    - `problem`: `null` or one `REQUEST_PROBLEMS` code. `message` null/undefined → `response-empty`;
      `stop_reason === 'refusal'` → `response-refusal`; `'max_tokens'` → `response-truncated`; any other value
      but `'end_turn'` → `response-invalid`; no `text` block, or the concatenated text blocks do not
      `JSON.parse` → `response-unparseable`; a parse that breaks the response schema's shape (exact keys, types,
      enums; checked by hand, never trusted to the API) → `response-invalid`. With a problem, everything else is
      empty: a malformed response is never partly trusted.
    - `segments`: `Map<segmentId, GateOp[]>` for each presented segment that was answered (possibly empty).
    - `GateOp` = `{ opId, category, rulingId, sense, find, replace, reason }`, the gate's operation shape:
      `opId` = `${requestKey}.op${n}` with `n` counting ops 1-based across the whole response in response order
      (before any conversion below, so an opId always names the model's own op); `sense` = the declared string
      for `term-sense`, `null` for the other categories.
    - `rejected`: `[{ segmentId, opId, op, reasons }]`, runner-level rejections (`op` is the model's op as given):
      ops of a segment id not presented (`response-unknown-segment`), ops of a second or later entry for one
      segment id (`response-duplicate-segment`), an op whose ruling is not in that segment's `rulingIds`
      (`ruling-not-offered`), a `term-sense` op whose declared sense differs from that segment's `senses` entry for
      the same ruling (`sense-inconsistent`), and the shadowing guard (`shadowed-by-longer-ruling`, rule 4 above,
      computed over the segment's `rulingIds` with `rulingsById`).
    - `flags`: `[{ segmentId, kind, rulingId, note, opId?, proposed? }]`. The model's own flags, plus **every op
      declaring sense `'unclear'`** (any category), converted into a `sense-unclear` flag with
      `proposed: { find, replace }` and its `opId`; such an op never reaches the gate (owed item 3). Flags of an
      unknown or duplicate segment entry are dropped and their ops recorded as rejected.
    - `senses`: `[{ segmentId, rulingId, sense, valid }]`: `valid` iff the ruling is offered for that segment, has a
      sense, and `sense` is its ruled id, one of its `otherSenses` ids, or `'unclear'`.
    - `missing`: presented segment ids the response did not answer.

## Unit U6 — a resumed batch records who resumed it (`tools/ai-review/harness.js`)

Owed item 5. `resumeBatch` appends to `run.json`, before its first poll, a `resumes` array entry
`{ resumedAt, sdk, harnessCommit, harnessDirty }` (from the same injectable sources `openContext` uses; earlier
entries kept). A first run writes no `resumes` key.

## Unit U7 — an overlay entry records the base it replaced (`tools/lib/mt-layers.js`)

Owed item 6. A layer-1s overlay entry gains `beforeSha256`: the sha256 of the layer-1 body it replaces. `readBase`
refuses (`bad-overlay`) an entry without it, with a malformed value, or whose value differs from the current
layer-1 body's sha256 — so an overlay written before a later HAND REPAIR refuses instead of undoing it.

## The glue (written by the controller)

- **Prompt** `tools/ai-review/prompts/term-pass-v1.md`: the whole file is the system prompt; its one fenced
  `json` block under `## Response schema` is the structured-output schema. One file, one sha256, for both the
  harness's `prompts` list and layer 2's `prompt` reference. Tests: every object in the schema has
  `additionalProperties: false` and lists every property in `required`; numbers the prompt restates equal
  `DEFAULT_LIMITS`; every worked example runs through `gateSegment` with the committed ruling set and gets exactly
  the verdict the prompt claims.
- **Requests** `tools/ai-review/term-pass-request.js`: chunk each unit's items in file order, at most
  `segmentsPerRequest` (8) items and `charBudget` (16,000 characters of EN + IS) per request (an item above the
  budget goes alone), never across units. A request shows one occurrence per segment id (the first that is a
  candidate); the gate applies its operations to every occurrence (`gateOccurrences`). Key
  `${chapterDir}/${stem}/${nnn}`. Body: `model`, `max_tokens`, `system: [{type:'text', text: prompt,
cache_control: {type:'ephemeral'}}]`, one user message holding a JSON document (`term-pass-user/1`: chapter,
  module, the offered rulings with target, competitors and sense lists, the segments with id, rulings, en, is),
  `thinking: {type:'adaptive', display:'summarized'}` (billed the same; the summary goes into the committed
  record), and `output_config: {effort, format: {type:'json_schema', schema}}`. Deterministic.
- **Apply** `tools/ai-review/term-pass-apply.js`: per chapter, from one or more finished runs. It re-reads every
  input and refuses on any sha256 mismatch with the run's record (ruling set, prompt, layer 1, overlay, EN) and
  on any presented `en`/`is` that differs from the current base (parsed back out of the recorded request body);
  parses each response (U3); gates each segment over all its occurrences with the group rule; chains one change
  record per accepted operation per occurrence in the gate's `accepted` order; and builds every unit of the
  chapter (zero-change units included) for `writeRevisedChapter`. Gate log, flags and sense judgements go to
  `books/<slug>/ai-review/applied/<chapterDir>/`. **Dry by default;** `--report` writes a reviewer's markdown
  outside the repository. Layer 2 is written once, with `--write`, after the prompt is frozen.
- **CLI** `tools/ai-review/term-pass.js` (`node:util` `parseArgs`, strict: an unknown flag is an error):
  - `plan`: 0 ISK; work list, requests, per-chapter counts, a token estimate and the worst-case reservation each
    chapter's batch would need (a whole-book batch exceeds the cap on reservation alone, so batches run one
    chapter at a time).
  - `run --mode interactive|batch`: paid. One harness run per chapter, sequentially. Preflight before anything is
    spent: the book is the constant `efnafraedi-2e` (owed item 1); the prompt, the ruling set and the code are
    committed and clean; `layer1Commit` exists and every unit's layer-1 file, overlay and English file are
    byte-identical to that commit (owed item 2); an interactive `max_tokens` above 21,333 needs `--timeout-ms`
    (owed item 4; the SDK refuses it locally otherwise). It writes `runs/<runId>/term-pass.json` beside the
    harness's records.
  - `apply`: as above.

## Logged, not built here

- A ruling target that a request's segment already carries is offered as context; the model may still propose an
  op on it. That is intended (an uncatalogued competitor elsewhere in the segment), and the gate decides.
- The gate's 2-letter-modifier over-refusal (`ál`) refuses some correct head swaps; they surface as rejections.
