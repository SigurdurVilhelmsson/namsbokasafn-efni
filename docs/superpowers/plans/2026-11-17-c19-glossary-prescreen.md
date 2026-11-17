# c19 Glossary Pre-screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag the clear wrong-sense errors among the approved glossary rows the segment editor shows on chemistry, so [USER] rules only the flagged rows.

**Architecture:** A read-only census script runs the editor's own matcher on production and prints every row it shows. A tools-side population step removes what a person already decided and mixes in named controls. A new pass on the existing `tools/ai-review` harness then pilots on two models, runs a batch, collects one verdict per row and builds the data for a private review page.

**Tech Stack:** Node 22 (tools: ESM; server: CommonJS), better-sqlite3 (server tree only), the Anthropic SDK through `tools/ai-review/transport-anthropic.js`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-c19-glossary-prescreen-design.md`

## Global Constraints

- Book `efnafraedi-2e` only; `assertBookSlug` refuses organic. Nothing reads, renders or sends organic.
- Every paid call goes through `runInteractive` / `runBatch` on the shared ledger `books/efnafraedi-2e/ai-review/ledger.jsonl` under `CAP_USD` (`tools/ai-review/config.js`). Paid commands run from the **main checkout only** (`assertMainCheckout`).
- Models: `claude-fable-5-2` and `claude-opus-5-5` only. Effort `high`. Default `max_tokens` 16000. No `fallbacks` field (the harness refuses it; batches reject it).
- Harness `use`: `glossary-prescreen`. Prompt: `tools/ai-review/prompts/glossary-prescreen-v1.md`. Ruling set: `experiments/terminology-consistency/results/2026-11-02/ruling-set-2026-11-02.json`.
- Production is read-only: the census script is sent on stdin over `ssh -o BatchMode=yes`, opens the database `{ readonly: true, fileMustExist: true }`, and leaves no file. No `sudo`.
- **Public/private:** no committed file carries concept-model data beyond `english`, `icelandic`, `domain`, `conceptId` (plus our own flags, counts and segment ids). `alternatives` and `ifRemoved` exist only in files **outside the repository**.
- `tools/` code never imports from `server/` (the MIT→AGPL boundary, CLAUDE.md E-2).
- Never `process.exit()` after writing stdout; set `process.exitCode` (CLAUDE.md). CLI flags parse strictly (`node:util` `parseArgs`, `strict: true`).
- Nothing writes `01-source/`, `02-mt-output/` or the concept model.
- Tests: Vitest. Server tests import `vitest` and use `createRequire(import.meta.url)` for server modules (copy the header of `server/__tests__/importConcepts.test.js`). Run `npm test` from the repo root; CI also runs `npm run lint` and `npm run format:check`.
- Commits end with the session's attribution lines. No grant or fund names anywhere.

## Review Focus

1. **A truncated census.** The census output is captured through an ssh pipe; a payload over 64 KB is cut if the script exits with output in flight. Expect: the script ends via `process.exitCode`, and `reduce` refuses a file that does not parse or has no rows. (Task 2 and Task 6 tests.)
2. **Production's English differs from this checkout's.** The census names segment ids on production's tree; sentences are read locally. Expect: a match whose segment is missing locally is skipped and counted; a row left with no sentence is excluded as `no-sentence`, never sent empty. (Task 3 test.)
3. **A row with no single expected word.** A tie has `icelandic: null`. Expect: it is excluded as `tie`, never sent with an empty word. (Task 3 test.)
4. **Collecting twice, or a resend overlapping a run.** Expect: a resend sends only ids still unjudged; an id answered by two runs is an error unless the earlier run left it unjudged. (Task 7 test.)
5. **The ledger close to the cap.** Expect: `run` and `collect --resend` refuse before submitting when the worst case would leave less than USD 5 of the cap. (Task 7 test.)

---

### Task 1: Shared response reader and checkout guard (no behaviour change)

**Files:**
- Create: `tools/ai-review/response-document.js`
- Modify: `tools/ai-review/term-pass-response.js` (move `isPlainObject`, the schema-keyword set, `conforms`, `IGNORED_BLOCKS`, `readDocument`, `REQUEST_PROBLEMS` out; import them back; keep re-exporting `REQUEST_PROBLEMS`)
- Modify: `tools/ai-review/provenance.js` (add `assertMainCheckout`), `tools/ai-review/term-pass.js` (import it; delete its local copy)
- Test: `tools/__tests__/ai-review-response-document.test.js`

**Interfaces:**
- Produces: `readDocument(message: object, schema: object) -> { problem: string|null, document?: object }`; `conforms(schema, value) -> boolean`; `REQUEST_PROBLEMS: readonly string[]` (same five codes); `assertMainCheckout(git) -> void`, throwing an Error with `code: 'linked-worktree'`.

- [ ] **Step 1: Write the failing tests** — `readDocument` with a one-property schema `{type:'object', properties:{a:{type:'string'}}, required:['a'], additionalProperties:false}`:
  - `stop_reason:'refusal'` → `{ problem: 'response-refusal' }`
  - `stop_reason:'max_tokens'` → `'response-truncated'`
  - a `thinking` block then a text block `'{"a":"x"}'` with `end_turn` → `{ problem: null, document: { a: 'x' } }`
  - text `'{"a":1}'` → `'response-invalid'`; text `'not json'` → `'response-unparseable'`
  - `assertMainCheckout` with a git stub returning two different dirs → throws with `code === 'linked-worktree'`.
- [ ] **Step 2:** `npx vitest run tools/__tests__/ai-review-response-document.test.js` → FAIL (module not found).
- [ ] **Step 3:** Create `response-document.js` by moving the code as is, with `readDocument` taking `schema` instead of reading `RESPONSE_SCHEMA`. `term-pass-response.js` calls `readDocument(message, RESPONSE_SCHEMA)`. Move `assertMainCheckout` to `provenance.js` with its own `refusal` helper of the same shape (`Object.assign(new Error(\`[${code}] ${message}\`), { code })`).
- [ ] **Step 4:** Run the new test plus `ai-review-term-pass-response`, `ai-review-term-pass`, `ai-review-provenance` → all PASS unchanged.
- [ ] **Step 5:** Commit: `refactor(ai-review): share the response reader and the main-checkout guard`.

### Task 2: The census script (production, read-only)

**Files:**
- Create: `server/scripts/read-firing-rows.js` (CommonJS)
- Test: `server/__tests__/readFiringRows.test.js`

**Interfaces:**
- Produces: `collectFiringRows({ db, book, chapters, loadSegments }) -> { rows: CensusRow[] }` where `loadSegments(chapter) -> Array<{ moduleId, segments: Array<{ segmentId, enContent, isContent }> }>`; and the CLI printing `{ schema: 'c19-census/1', book, head, readAt, dbPath, rows }`.
- `CensusRow = { english, icelandic: string|null, domain: string|null, conceptId: number|null, isFallback, isTied, reason: string|null, alternatives: string[], ifRemoved: { text, domain }|null, chapters: number[], matchCount, issueCount, matches: Array<{ chapter, moduleId, segmentId }> }`, one per (english, icelandic) pair across all chapters.

- [ ] **Step 1: Write the failing tests** on `freshMigratedDb()` + `seedBooks()` + `seedC24Concepts()` (as `server/__tests__/findTermsGolden.test.js` builds them), with segments from `server/__tests__/fixtures/c24-segments.json`, after `terminologyService._setTestDb(db)`:
  - `rows.length > 0` (the control), and every match `findTermsInSegments` returns for those segments appears as exactly one row's match;
  - a match that `findTermsInSegments` marks `isFallback` gives a row with `isFallback: true`, and a tied match gives `isTied: true, icelandic: null`;
  - each row's `reason` equals `resolve(buildScope(db, book, chapter), english).reason`;
  - the CLI, spawned with stdout as a **pipe** on a fixture whose output exceeds 64 KB, prints JSON that parses completely.
- [ ] **Step 2:** Run `npx vitest run server/__tests__/readFiringRows.test.js` → FAIL.
- [ ] **Step 3:** Implement. The CLI follows `server/scripts/read-term-resolutions.js`: `new Database(resolveDbPath(), { readonly: true, fileMustExist: true })`, `terminologyService._setTestDb(db)`, chapters from `segmentParser.listChapters(book)`, modules from `segmentParser.listChapterModules`, segments from `segmentParser.loadModuleForEditing` (`enContent: s.en, isContent: s.is`). Per chapter: call `findTermsInSegments(segments, book, chapter)`, then memoise `resolve(buildScope(db, book, chapter), english)` per English string for `reason`, `conceptId`, `alternatives` (`scope.stmts.terms.all(conceptId)`) and `ifRemoved` (the first of `alsoInScope`, else `outOfScope[0]`, else `null`). The header comment states the stdin invocation exactly as `read-term-resolutions.js` does. End with `process.exitCode = 0`.
- [ ] **Step 4:** Re-run the test → PASS.
- [ ] **Step 5:** Commit: `feat(server): a read-only census of the glossary rows the editor shows (c19)`.

### Task 3: Population, controls and sentences

**Files:**
- Create: `tools/ai-review/prescreen-population.js`
- Test: `tools/__tests__/ai-review-prescreen-population.test.js`

**Interfaces:**
- Consumes: `CensusRow` (Task 2) as JSON.
- Produces:
  - `CENSUS_SCHEMA = 'c19-census/1'`; `reduceCensus(full) -> object`, which drops `alternatives` and `ifRemoved` from every row, sets `reduced: true` and keeps everything else;
  - `loadUnits(bookDir) -> Array<{ chapter, moduleId, segments: Array<{ segmentId, en }> }>`, reading every `*-segments.en.md` under `02-for-mt/` with `parseLayerFile` (`tools/lib/mt-layers.js`, the parser `term-pass-apply.js` reads English with);
  - `buildPopulation({ census, rulingSet, exportTerms, units, seed }) -> { rows: Array<{ english, icelandic, matchCount, sentences }>, excluded: { ruled, fallback, tie, decided, physicsBiology, notInExport, noSentence } }`, each count a number;
  - `CONTROLS` (frozen): `positives` (the 8 pairs of spec §5, each `{ name, english, icelandic, expected: 'flag' }`, `name` being the English), `homograph` (`addition → álagning`, the two halves `addition-adding` expecting `flag` and `addition-reaction` expecting `fine`), `fixedNegative` (`atom → atóm`);
  - `pickNegatives(rulingSet, units, n = 5) -> Array<{ english, icelandic }>`;
  - `buildControls({ rulingSet, units, seed }) -> Array<{ english, icelandic, sentences, name, expected }>`: the positives, the two homograph halves (each half's sentences only from occurrences `classifyAddition` puts in its class), the fixed negative and `pickNegatives`' five (`name` = the English, `expected: 'fine'`);
  - `findOccurrences(english, units) -> Array<{ chapter, moduleId, segmentId, en }>`;
  - `sampleSentences(occurrences, { n = 5, seed }) -> string[]`; `extractSentence(text, english) -> string`; `classifyAddition(sentence) -> 'reaction'|'adding'|null`;
  - `assembleItems({ population, controls, seed, minGap = 8 }) -> { items: Array<{ id, english, icelandic, sentences }>, key: Record<id, { kind: 'population'|'control', name?, expected? }> }`.

Values and rules:
- Exclusion order, each row counted once, in the first class that applies: `ruled` (the English, lowercased, is one of the ruling set's `en`) → `fallback` → `tie` (`isTied` or `icelandic` null or empty) → `decided` (`reason` is `book-preference`, `chapter-preference` or `house-style`) → `physicsBiology` (`domain` is `physics` or `biology`) → `notInExport` (the pair is not in `glossary-unified.json`'s `terms`) → `noSentence` (no match yields a sentence locally).
- `pickNegatives`: the rulings with `scope.kind === 'book'`, `sense === null`, `matchable === true`, a non-empty `is`, `enNorm !== 'atom'` and at least 5 whole-word occurrences in chemistry's English, sorted by `enNorm`; take the indices `floor(k * len / n)` for k = 0…n−1.
- `findOccurrences`: whole-word and case-folded, with a word character defined as `[\p{L}\p{N}_]` (as in `server/lib/wordBoundary.js`; write it locally, do not import it).
- `sampleSentences`: group by chapter in chapter order; within a chapter, order by `sha256(seed + '\0' + segmentId)`; take one per chapter round-robin until `n`.
- `extractSentence`: replace each `[[type:content|attr]]` with its content; replace opaque `[[MATH:…]]`, `[[MEDIA:…]]` and `[[TABLE:…]]` with `…`; split on `(?<=[.!?])\s+`; return the sentence holding the first whole-word match, cut to at most 400 characters centred on it.
- `classifyAddition`: `/\baddition (reactions?|polymer)/i` → `'reaction'`; otherwise `/\baddition of\b/i` → `'adding'`; otherwise `null`.
- `assembleItems`: ids `r001`, `r002`, … assigned after sorting all rows by `sha256(seed + '\0' + english + '\0' + icelandic + '\0' + name)`. Two items with the same (English, Icelandic) pair (the homograph halves) must sit at least `minGap` positions apart, so they never share a request: if they are closer, move the later one to position `(i + floor(len / 2)) mod len`. Population and control items have the same keys and nothing marks a control.

- [ ] **Step 1: Write the failing tests:**
  - on a hand-built census with one row per exclusion class plus two keepers: `excluded` is all 1s and `rows` holds the two keepers;
  - a row whose `icelandic` is null counts as `tie`, never as a population row;
  - a match whose segment id is absent from `units` is skipped; a row with no remaining sentence counts as `noSentence`;
  - `reduceCensus` removes `alternatives` and `ifRemoved` from every row and leaves the other fields deep-equal;
  - `CONTROLS.positives.map(p => p.english)` equals `['balanced','reduce','depression','vessel','phases','terms','rays','moles']`;
  - `pickNegatives` gives the same 5 on two calls, never includes a ruling with a `sense`, and never `atom`;
  - `sampleSentences` over 3 chapters with `n = 5` covers all 3 chapters;
  - `extractSentence('A [[b:bold]] word. The [[term:atom|t1]] is small.', 'atom')` → `'The atom is small.'`;
  - `classifyAddition('The addition of HCl to the buffer')` → `'adding'`; `('in addition reactions, atoms add')` → `'reaction'`;
  - `assembleItems`: ids are unique, every item has exactly the keys `id, english, icelandic, sentences`, the same input gives the same order, and the two homograph halves sit at least 8 positions apart;
  - `buildControls` gives the `addition-adding` half no sentence that `classifyAddition` calls `'reaction'`, and the reverse.
- [ ] **Step 2:** `npx vitest run tools/__tests__/ai-review-prescreen-population.test.js` → FAIL.
- [ ] **Step 3:** Implement to the rules above.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit: `feat(ai-review): pre-screen population, controls and sentence sampling (c19)`.

### Task 4: The prompt and the requests

**Files:**
- Create: `tools/ai-review/prompts/glossary-prescreen-v1.md`, `tools/ai-review/prescreen-request.js`
- Test: `tools/__tests__/ai-review-prescreen-request.test.js`

**Interfaces:**
- Consumes: `items` from `assembleItems` (Task 3); `loadPrompt` from `term-pass-request.js`.
- Produces: `USE = 'glossary-prescreen'`, `PROMPT_PATH`, `USER_FORMAT = 'glossary-prescreen-user/1'`, `ROWS_PER_REQUEST = 8`, `DEFAULT_EFFORT = 'high'`, `DEFAULT_MAX_TOKENS = 16000`, `MODELS = ['claude-fable-5-2', 'claude-opus-5-5']`, `FLAG_KINDS = ['wrong-sense', 'some-senses-only', 'wrong-register', 'not-a-word', 'other-error']`; `renderUserMessage(items) -> string`; `buildRequests({ items, prompt, model, effort, maxTokens, rowsPerRequest }) -> Array<{ key, body, presented: string[] }>`.

The prompt is short and plain (Fable's guidance: over-prescriptive prompts lower quality). It states:
- what the rows are for: the Icelandic word a chemistry editor is shown as the expected translation at every match;
- the task: for each row, decide whether the Icelandic is a **clear error** for how these chemistry sentences use the English;
- that a defensible alternative word, or a matter of style or preference, is **not** a flag;
- the five kinds, one line each, as spec §7 defines them;
- a reason of at most two sentences, proposed Icelandic words where it has some, and the senses where the row is right for `some-senses-only`;
- answer every row id exactly once.

It ends with a `## Response schema` section holding one JSON block. `rows` is an array of objects with the required keys `id` (string), `verdict` (enum `fine`, `flag`), `kind` (enum of `FLAG_KINDS`, or null), `reason` (string), `proposed` (array of strings) and `rightSenses` (string or null), and `additionalProperties: false`. Use only the keywords `conforms` understands. One worked example (a request and its answer) follows the schema section, as `term-pass-v2.md` does.

- `renderUserMessage`: `JSON.stringify({ format: USER_FORMAT, rows: items.map(({ id, english, icelandic, sentences }) => ({ id, en: english, is: icelandic, sentences })) }, null, 2)`.
- `buildRequests`: chunks of `rowsPerRequest` in item order; keys `g001`, `g002`, …; body exactly as `term-pass-request.js` builds it (system text with `cache_control: {type:'ephemeral'}`, `thinking: {type:'adaptive', display:'summarized'}`, `output_config: { effort, format: { type: 'json_schema', schema: prompt.schema } }`); `presented` is the chunk's ids.

- [ ] **Step 1: Write the failing tests:**
  - `loadPrompt(PROMPT_PATH)` succeeds, and its schema's `kind` enum equals `FLAG_KINDS` plus null;
  - the prompt's example answer conforms to its own schema (`conforms`);
  - every body passes `validateRequestBody(body, { model, effort, maxTokens })` with `[]` problems, for both models;
  - 17 items with `rowsPerRequest: 8` give 3 requests with keys `g001`, `g002`, `g003`, and each id appears in exactly one `presented`;
  - a chunk holding the same (English, Icelandic) pair twice makes `buildRequests` throw;
  - the user message contains none of the strings `domain`, `control`, `population`.
- [ ] **Step 2:** `npx vitest run tools/__tests__/ai-review-prescreen-request.test.js` → FAIL.
- [ ] **Step 3:** Write the prompt and the module.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit: `feat(ai-review): the pre-screen prompt (v1) and its requests (c19)`.

### Task 5: Parsing answers and judging the controls

**Files:**
- Create: `tools/ai-review/prescreen-response.js`
- Test: `tools/__tests__/ai-review-prescreen-response.test.js`

**Interfaces:**
- Consumes: `readDocument` (Task 1); the schema from `loadPrompt(PROMPT_PATH)` (Task 4); `key` from `assembleItems` (Task 3).
- Produces:
  - `parsePrescreenResponse({ message, presentedIds, schema }) -> { problem: string|null, verdicts: Map<string, Verdict>, missing: string[], dropped: Array<{ id, reason }> }`, where `Verdict = { verdict: 'fine'|'flag', kind: string|null, reason: string, proposed: string[], rightSenses: string|null }`;
  - `judgeControls({ verdicts, key }) -> { pass: boolean, results: Array<{ id, name, expected, got: string, ok: boolean }> }`.

Rules: an entry is dropped as `unknown-id`, `duplicate-id`, `flag-without-kind` (`verdict` `flag` with `kind` null) or `fine-with-kind`. Presented ids with no kept entry are `missing`. A control expects: the positives any flag; `addition-adding` a flag of kind `wrong-sense` or `some-senses-only`; `addition-reaction` and every negative `fine`. A control with no verdict has `got: 'unjudged'` and `ok: false`.

- [ ] **Step 1: Write the failing tests:** a refusal → `problem: 'response-refusal'` and empty verdicts; a conforming answer → one verdict per id; each of the four drop reasons; a missing id; `judgeControls` all as expected → `pass: true`; a positive answered `fine` → `pass: false`, with that row `ok: false`; `addition-adding` answered `wrong-register` → `ok: false`; an unjudged control → `ok: false`.
- [ ] **Step 2:** `npx vitest run tools/__tests__/ai-review-prescreen-response.test.js` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit: `feat(ai-review): parse pre-screen answers and judge the controls (c19)`.

### Task 6: The runner: `reduce`, `plan`, `pilot`

**Files:**
- Create: `tools/ai-review/prescreen.js`
- Test: `tools/__tests__/ai-review-prescreen.test.js`

**Interfaces:**
- Consumes: Tasks 1–5; `estimateRequests` from `term-pass.js`; `runInteractive` from `harness.js`; `makeGit`, `cleanTrackedProblems` from `provenance.js`; `loadRulingSet` from `ruling-set.js`; `summarizeLedger`, `readLedger` from `ledger.js`.
- Produces: `main(argv, deps = {}) -> Promise<{ exitCode }>`, with `deps` injectable as `term-pass.js`'s are (`transport`, `now`, `git`, `harnessCommit`, `harnessDirty`, `out`); `PRESCREEN_RECORD = 'prescreen.json'` with payload `{ schema: 'c19-prescreen/1', runId, phase: 'pilot'|'run'|'resend', model, effort, census: { path, sha256 }, rulingSet: { path, sha256 }, prompt: { path, sha256 }, items: Array<{ id, english, icelandic, kind, name?, expected? }>, rowsPerRequest }`; `PILOT_POPULATION_ROWS = 24`; `POPULATION_STOP = 450`; `PILOT_FLAG_STOP = 0.25`.

Subcommands, with exit codes 0 done · 1 refused · 2 stop and ask (or gate failed):
- `reduce --census-full <abs path outside the repo> --out <repo path under experiments/terminology-consistency/results/>`: refuses a file that does not `JSON.parse`, has the wrong `schema`, or has no rows; writes `reduceCensus` output.
- `plan --census <repo path>`: 0 ISK. Prints the population count, each exclusion count, the control count, the request count and the worst-case USD (interactive and batch) from `estimateRequests`. If the population exceeds `POPULATION_STOP`, prints a stop-and-ask line and exits 2.
- Every subcommand that builds items uses the committed reduced census's sha256 as the `seed`, so a re-plan gives the same items, ids and requests.
- `pilot --census <path> --model <m> [--yes]`: items = every control + `PILOT_POPULATION_ROWS` population rows (population sorted by `matchCount`, indices `floor(k * len / 24)`), assembled together. Preflight: `assertMainCheckout`; `cleanTrackedProblems` over the prompt, the ruling set, the census and `tools/ai-review`. Without `--yes` it prints the plan and sends nothing. With `--yes` it calls `runInteractive` with `extraRecords: [{ name: PRESCREEN_RECORD, payload }]`, parses every recorded response, prints `judgeControls`' table and the pilot's population flag rate, and exits 0 if the gate passes and the rate is at most `PILOT_FLAG_STOP`, otherwise 2.

- [ ] **Step 1: Write the failing tests** (fake transport and a records dir outside the repo, as `ai-review-term-pass.test.js` does):
  - `reduce` refuses truncated JSON (exit 1) and writes a reduced census for a valid file;
  - `plan` prints the population and each exclusion count; a census over 450 population rows exits 2;
  - `pilot` without `--yes` makes zero transport calls;
  - `pilot --yes` with a transport answering every control as expected exits 0 and writes `prescreen.json`;
  - a transport answering `balanced` as `fine` exits 2 and prints `balanced`;
  - a git stub reporting a linked worktree refuses with exit 1 before any transport call.
- [ ] **Step 2:** `npx vitest run tools/__tests__/ai-review-prescreen.test.js` → FAIL.
- [ ] **Step 3:** Implement, following `term-pass.js`'s `main`, `contextFrom`, `preflight` and `cmdRun` shapes.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit: `feat(ai-review): pre-screen runner, census reduce, plan and pilot (c19)`.

### Task 7: The runner: `run`, `resume`, `collect`

**Files:**
- Modify: `tools/ai-review/prescreen.js`
- Test: `tools/__tests__/ai-review-prescreen.test.js` (extend)

**Interfaces:**
- Consumes: Task 6; `runBatch` and `runInteractive` from `harness.js`.
- Produces: `COST_MARGIN_USD = 5`; the verdicts file `{ schema: 'c19-prescreen-verdicts/1', runs: string[], model, prompt: { path, sha256 }, excluded, controls: <judgeControls result>, population: Array<{ english, icelandic, verdict: 'fine'|'flag'|'unjudged', kind, reason, proposed, rightSenses }> }`.

Subcommands:
- `run --census <path> --model <m> --pilot <runId> [--split <n>] [--max-tokens <n>] [--accept-large-population] --yes`: refuses unless the pilot run's `prescreen.json` names the same model and prompt sha256 and its controls pass. Refuses a population over `POPULATION_STOP` unless `--accept-large-population` (that flag records [USER]'s answer). Refuses if the batch worst case exceeds `CAP_USD − committedUsd − COST_MARGIN_USD`, naming `--split` and `--max-tokens` as remedies. Sends all population rows plus every control through `runBatch`, as `n` sequential batches with `--split`, and stops at the first that does not end `complete`.
- `resume --run <runId>`: rebuilds the run's options from its `prescreen.json` and calls `runBatch`, which resumes and never resubmits.
- `collect --run <runId> [--run …] --out <dir> --isk-rate <n> --isk-rate-source <text> [--resend --yes]`: loads each run's records, parses every response, and merges verdicts by item id. An id answered in two runs is an error unless the earlier run left it unjudged. With `--resend --yes`, the population ids still unjudged go one per request through `runInteractive` (phase `resend`) under the same cost check. Writes `prescreen-verdicts.json` and `prescreen-report.md` into `--out`, which must be under `experiments/terminology-consistency/results/`. The report gives counts by verdict and kind, the exclusion counts, the control table, each run's model, effort and cost in USD (from its `run-end.json`) and in ISK at the given rate with its source, and the prompt sha256.

- [ ] **Step 1: Write the failing tests:**
  - `run` without a passing pilot exits 1;
  - `run` with a ledger whose committed USD leaves less than the worst case plus 5 exits 1 and names `--split`;
  - `collect` over a run whose one request was refused lists that request's population rows as `unjudged`;
  - `collect --resend` sends only the unjudged ids, and refuses (exit 1) with a ledger too close to the cap;
  - the same id answered in two runs, the first not unjudged, exits 1;
  - the report holds the control table and a cost line in USD and ISK.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; `resume` mirrors `term-pass.js`'s `cmdResume`.
- [ ] **Step 4:** Re-run → PASS, then the whole suite: `npm test`, `npm run lint`, `npm run format:check` → clean.
- [ ] **Step 5:** Commit: `feat(ai-review): pre-screen batch run, resume and collect (c19)`.

### Task 8: Review page data

**Files:**
- Create: `tools/ai-review/prescreen-page.js`
- Test: `tools/__tests__/ai-review-prescreen-page.test.js`

**Interfaces:**
- Consumes: the verdicts file (Task 7); the full census (Task 2, private).
- Produces: `buildPageData({ verdicts, privateCensus, mtTextFor }) -> { generated, instrumentNote, rows: Array<{ id, english, icelandic, kind, reason, proposed, rightSenses, sentences, alternatives, ifRemoved, matchCount, mt: { current: number, proposed: Record<string, number> } }> }`, where `mtTextFor(chapter, moduleId, segmentId) -> string|null` reads `02-mt-output`. The CLI `--verdicts <repo path> --census-private <abs path outside the repo> --out <abs path outside the repo>` writes `page-data.json`.

Values: only rows with verdict `flag`. An MT count is the number of the row's matching segments whose MT text matches `stemPattern(icelandicStem(word))` (from `tools/compute-glossary-subset.js`). `instrumentNote` says in plain words that the count is a stem match and misses compounds.

- [ ] **Step 1: Write the failing tests:** only flagged rows appear; for a word present in 2 of 3 matching segments' MT text, the count is 2; an `--out` path inside the repository exits 1.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit: `feat(ai-review): pre-screen review-page data (c19)`.

### Task 9: Run it (operational)

No new code. Each step names its command and the result that lets the next one start. Paid steps need [USER]'s go in the session that runs them.

- [ ] **Step 1: Census on production (0 ISK, read-only).** Run `ssh -o BatchMode=yes siggi@172.236.212.190 'free -m'` and confirm at least 1 GB available. Then send the script on stdin:
  `ssh -o BatchMode=yes siggi@172.236.212.190 "cd ~/repos/namsbokasafn-efni/server/scripts && node - efnafraedi-2e" < server/scripts/read-firing-rows.js > <private dir>/census-full-<date>.json`
  Done when the file `JSON.parse`s, ends with `}` and holds rows. The private directory is outside the repository; record its path in project memory, as the 2026-10-31 full file's is.
- [ ] **Step 2: Reduce and commit.** `node tools/ai-review/prescreen.js reduce --census-full <private file> --out experiments/terminology-consistency/results/<date>/prescreen-census.json`; commit it.
- [ ] **Step 3: Plan.** `node tools/ai-review/prescreen.js plan --census <that path>`. Exit 2 (population over 450) → stop and ask [USER].
- [ ] **Step 4: Pilot on both models** (paid, small). Run `pilot --model claude-fable-5-2 --yes`, then `pilot --model claude-opus-5-5 --yes`. Decide per spec §6:
  - Fable passes → Fable;
  - only Opus passes → stop and ask [USER];
  - neither passes → stop and report each miss with the model's reason;
  - an account refusal for Fable (an `invalid_request_error` naming data retention) → stop and report.
  Report the two models' agreement on the 24 population rows.
- [ ] **Step 5: Full run.** `run --model <chosen> --pilot <runId> --yes` (batch). If polling stops, `resume --run <runId>`.
- [ ] **Step 6: Collect.** `collect --run <runId> --resend --yes --out experiments/terminology-consistency/results/<date> --isk-rate <rate> --isk-rate-source "<source, date>"`. A control missed in the full run → report it before anything else.
- [ ] **Step 7: Commit the evidence:** the run records under `books/efnafraedi-2e/ai-review/runs/`, the ledger, the verdicts and the report.
- [ ] **Step 8: The page.** `node tools/ai-review/prescreen-page.js …` writes `page-data.json` privately. Load the `artifact-design` and `artifact-capabilities` skills, write the page from that data with a `db` collection `answers` (one doc per row id: `choice` ∈ `keep|replace|remove|phrases|unsure`, `text`, `comment`, `savedAt`) and one `confirm` doc per batch of rows, and publish it privately. An unanswered row is open.
- [ ] **Step 9: Register and PR.** In the register's 2026-11-10 c19 block, record what ran and its result, pointing to the report. Add two new numbered entries (re-derive the next free § number): the editor's warnings are sense-blind (`addition → álagning` is offered on "the addition of HCl"; read from the code); and §C129's coverage cannot be re-derived (only its removal set was frozen; 1,297 physics and biology rows today against 1,213 kept). Then open the PR on [USER]'s go.
