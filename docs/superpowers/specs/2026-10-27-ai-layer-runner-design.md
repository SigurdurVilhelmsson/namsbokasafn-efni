# The AI-reviewed layer's runner: work list → request → harness → gate → layer 2 — DESIGN (2026-10-27)

> **FROZEN DESIGN RECORD — banner-dated 2026-10-27.** Evidence, never status. Open work and its state
> live in the active register's ⏩ RESUME block (`docs/plans/2026-07-21-post-item17-followup-campaign.md`).
> If this file disagrees with the register, the register wins. If it disagrees with the code and its tests,
> the code wins.

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
