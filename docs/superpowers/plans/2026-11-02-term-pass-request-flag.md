# `term-pass.js run --request`: re-send named requests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A runner flag, `run --request KEY` (repeatable), that sends only the named requests of a chapter's plan, so that the 2026-11-01 full run's three unusable answers can be re-sent without re-running their chapters.

**Architecture:** `--request` is a second way to choose a subset of `plan.requests`, beside `--limit`, and it records the same way: `requestKeys` holds what was sent and `plannedRequestKeys` the chapter's whole plan, so `apply` measures coverage against the whole plan. The run for a re-send is an ordinary run of its own (its own run id, ledger reservation and records), applied together with the run it repairs, the re-send listed last.

**Tech Stack:** Node 22 ES modules, `node:util` `parseArgs` (strict), Vitest.

**Spec:** no design document of its own. The requirements come from:
- `docs/decisions/2026-11-01-full-run-truncation-and-unusable-answers.md` (Consequences: the re-send of `ch07/m68742/012`, `ch07/m68742/013` and `ch08/m68747/003`; it is a retry at the same inputs; the flag is a change of condition the register records);
- `docs/superpowers/specs/2026-10-27-ai-layer-runner-design.md`, block "AMENDED 2026-11-02" (runs at different `max_tokens` are applied together; the run listed last wins);
- [USER]'s rulings of 2026-11-02, in session: keep ch07's 49 usable answers, relax `apply`'s `max_tokens` check, then plan this flag.

**Precondition:** branch `feat/ai-review-resend-requests` already carries the `apply` change from the 2026-11-02 amendment (`tools/ai-review/term-pass-apply.js`, its tests, the spec block). Commit it as its own commit before Task 1, so the two changes stay separable in history.

## Global Constraints

- **Do not change `TERM_PASS_SCHEMA` (`ai-review-term-pass/2`).** `apply`'s `checkRuns` requires each run's schema to equal it, and the 22 full-run records are `/2`; a `/3` would make `apply` refuse every one of them. The new record field is additive, under `params`.
- New record field: `params.request` in `term-pass.json` — the keys sent because of `--request`, in plan order, or `null` when the flag was not given (the shape of `params.limit`).
- Every refusal is `bad-flag` and happens before the preflight, before anything is sent or written (the `ALLOWED` table's rule: a flag is never a silent no-op).
- Requests are sent in plan order, never in command-line order.
- `apply` is not changed by this plan.
- Tests live in `tools/__tests__/ai-review-term-pass.test.js` and go through `main()`, as that file's tests do.
- Before calling a task done: `npm run lint`, `npm run format:check` and `npx vitest run tools/__tests__/ai-review` (CI also runs these; `npm test` alone is not the Lint job).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nothing committed names a grant or fund.

## Review Focus

1. **A key named twice** (`--request K --request K`) refuses; it is not sent once silently. → Task 1.
2. **A key not in its chapter's plan**, such as the unpadded `ch07/m68742/12`, refuses and names the key. → Task 1.
3. **`--request` with `--all`** refuses: every chapter of the book would need a key. → Task 1.
4. **A dry `run --request` (no `--yes`)** prints the named requests' worst case and sends nothing; that line is the operator's last look at the spend. → Task 2.
5. **A batch `--request` run whose polling stopped** is resumed and judged against its own requests (exit 0), not against the chapter's plan. → Task 1.

---

### Task 1: `run --request` sends only the named requests and records them

**Files:**
- Modify: `tools/ai-review/term-pass.js` — `OPTIONS`, `ALLOWED.run`, `usage()`, the header comment's `run` paragraph, a new internal `namedRequests`, `cmdRun`, `termPassPayload`
- Test: `tools/__tests__/ai-review-term-pass.test.js` — `setup()` and a new `describe('run --request sends only the named requests', …)`

**Interfaces:**
- Consumes: `planAll(ctx, values)` → `{ rows }`, each row `{ chapterDir, requests: [{ key, body }] }`; `refusal(code, message)`.
- Produces:
  - `function namedRequests(values, rows)` → `Map<string, Set<string>> | null`: chapter dir → the keys named for it; `null` when `values.request` is absent. Throws the refusals below.
  - `termPassPayload({ …, request })` writes `params.request: string[] | null`.
  - `setup({ chapters } = {})` in the test file passes `chapters` to `makeTempRepo` (default `['ch02']`).

- [ ] **Step 1: Write the failing tests**

Get the fixture's keys from `main(['plan', '--chapter', 'ch02', ...UNDER_SDK_LIMIT], S.deps())` → `rows[0].requests.map((r) => r.key)` (call it `keys`; ch02 plans 30 with the real ruling set). Interactive runs use `...UNDER_SDK_LIMIT`; `mockTransport()` counts sends in `t.calls.send`.

- `sends only the named requests, in plan order, and records them` — run with `--request keys[2] --request keys[0] --yes`: `t.calls.send === 2`; `term-pass.json` has `requestKeys` `[keys[0], keys[2]]`, `plannedRequestKeys` equal to `keys`, `params.request` `[keys[0], keys[2]]`; the result's `exitCode` is `0`; a dry `apply --run <id>` reports `requestsUsable: 2` and `requestsMissing` of length `keys.length - 2`.
- `control: without --request, params.request is null` — an ordinary run's `term-pass.json` has `params.request === null`.
- Refusals, each `rejects.toThrow(/bad-flag.*<phrase>/)` with `t.calls.send === 0`:
  - `--request keys[0] --limit 1` → `--request and --limit cannot be combined`
  - `--all --request keys[0]` → `--request needs --chapter, not --all`
  - `--request keys[0] --request keys[0]` → `is named twice`
  - `--request ch02/m00000/999` → `is not in ch02's plan`
  - `--request keys[0].replace(/\/0*(\d+)$/, '/$1')` (unpadded) → `is not in ch02's plan`
  - with `setup({ chapters: ['ch02', 'ch03'] })` (a ch03 key from the same `plan` call's `rows.find((r) => r.chapterDir === 'ch03')`): `--chapter ch02 --request <a ch03 key>` → `is not among --chapter`; `--chapter ch02 --chapter ch03 --request keys[0]` → `--chapter ch03 has no --request`
- `a batch --request run whose polling stopped is resumed and judged against its own requests` — `mockTransport({ batchStates: ['in_progress', 'ended'] })`, `--mode batch --max-polls 1 --request keys[0] --yes` with `sleep: async () => {}, pollIntervalMs: 0`; status `pending`; `resume --run <id>` → `status: 'complete'`, `exitCode: 0`; `run.json` `requestCount === 1`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tools/__tests__/ai-review-term-pass.test.js -t "run --request"`
Expected: FAIL — `[bad-flag] --request does not apply to run` (the flag is not yet in `ALLOWED.run`) or an unknown-option error from `parseArgs`.

- [ ] **Step 3: Implement**

- `OPTIONS.request = { type: 'string', multiple: true }`; add `'request'` to `ALLOWED.run`.
- `usage()`: the second `run` line reads `[--timeout-ms N] [--layer1-commit REF] [--limit N | --request KEY ...] [--ruling-set PATH] [--yes]`.
- Header comment, under `run`: `--request KEY` (repeatable) sends only those requests of their chapters' plans, in plan order; every `--chapter` needs at least one; the record keeps the whole plan, so `apply` measures coverage as after `--limit`. Name the 2026-11-01 decision record as its reason.
- `namedRequests(values, rows)`, refusing in this order with these messages: `--request and --limit cannot be combined`; `--request needs --chapter, not --all`; `--request ${key} is named twice`; `--request ${key}: chapter ${ch} is not among --chapter` (the chapter is the text before the key's first `/`); `--request ${key} is not in ${ch}'s plan (${n} requests)`; `--chapter ${ch} has no --request`.
- `cmdRun`: call `namedRequests` right after `planAll`, before `printPlan` and `preflight`. In the chapter loop, `plan.requests.filter((r) => named.get(chapterDir).has(r.key))` when `named` is set, else the existing `slice(0, budget)`. Pass `request: named ? requests.map((r) => r.key) : null` to `termPassPayload`, which writes it as `params.request`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tools/__tests__/ai-review-term-pass.test.js`
Expected: PASS, every test in the file (the existing `--limit` tests included).

- [ ] **Step 5: Commit**

```bash
git add tools/ai-review/term-pass.js tools/__tests__/ai-review-term-pass.test.js
git commit -m "feat(ai-review): run --request sends only the named requests of a chapter's plan"
```

---

### Task 2: the spend line and the remedies name `--request`

**Files:**
- Modify: `tools/ai-review/term-pass.js` — `cmdRun` (one line per chapter after `printPlan`), the `partial-coverage` refusal in `cmdApply`
- Test: `tools/__tests__/ai-review-term-pass.test.js` — the Task 1 `describe`, and `the partial-coverage refusal names the remedy for its cause`

**Interfaces:**
- Consumes: `namedRequests` (Task 1); `estimateRequests(requests, { model, maxTokens })` → `{ requests, inputTokensEstimate, worstCaseUsd: { interactive, batch } }`.
- Produces: nothing later tasks call.

- [ ] **Step 1: Write the failing tests**

- `without --yes, a --request run prints the named requests' worst case and sends nothing` — `run --chapter ch02 --mode interactive ...UNDER_SDK_LIMIT --request keys[0]` (no `--yes`): `result.sent === false`, `t.calls.send === 0`, and the joined output matches `new RegExp(\`sending 1 of ${keys.length} planned requests of ch02 \\(--request\\): worst case USD [\\d.]+ interactive / [\\d.]+ batch\`)`.
- In `the partial-coverage refusal names the remedy for its cause`: the truncated case matches `/--request.*--max-tokens.*listed last/`; the other case matches `/--request.*apply the runs together/`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tools/__tests__/ai-review-term-pass.test.js -t "worst case|names the remedy"`
Expected: FAIL — no `sending … (--request)` line, and the remedy text does not mention `--request`.

- [ ] **Step 3: Implement**

- After `printPlan`, when `named` is set, print one line per chapter: `sending ${sent} of ${planned} planned requests of ${chapterDir} (--request): worst case USD ${interactive} interactive / ${batch} batch`, from `estimateRequests(selected, { model: params.model, maxTokens: params.maxTokens })`. It prints before the `--yes` check, so a dry invocation shows it.
- The `partial-coverage` refusal: truncated case — `… cut off at max_tokens: re-send them with run --request at a higher --max-tokens, and apply the runs together with the re-send listed last (a cut-off answer still counts as an answer, so the run listed last decides).`; other case — `Re-send them with run --request and apply the runs together, the re-send listed last.`

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tools/__tests__/ai-review`, then `npm run lint` and `npm run format:check`
Expected: all pass; lint prints no problems; prettier reports `All matched files use Prettier code style!`

- [ ] **Step 5: Commit**

```bash
git add tools/ai-review/term-pass.js tools/__tests__/ai-review-term-pass.test.js
git commit -m "feat(ai-review): a --request run shows its own worst case; apply's remedy names --request"
```

---

### Task 3: the re-send itself — PAID, only on [USER]'s go, after this branch is merged

This task spends money (about USD 2 reserved, far less settled) and is run by hand from the main checkout on `main`. It is not part of the code review. Each step's expected output is what makes the next step safe.

**Files:**
- Create (by the runner): `books/efnafraedi-2e/ai-review/runs/<two new run ids>/`, ledger lines in `books/efnafraedi-2e/ai-review/ledger.jsonl`
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (a new top `⏭` entry)

- [ ] **Step 1: The checkout is the main one, on `main`, clean, with this branch merged**

Run: `git status --porcelain; git branch --show-current; git log -1 --oneline`
Expected: no status lines; `main`; the merge of this branch.

- [ ] **Step 2: The SDK is the one both original runs recorded**

Run: `node -p "require('./node_modules/@anthropic-ai/sdk/package.json').version"`
Expected: `1.3.0`. Both runs recorded SDK 1.3.0 and `anthropic-version` `2026-10-21`, and `apply` refuses runs whose SDK or `anthropic-version` differ (`mixed-runs`). If it differs, stop and ask [USER].

- [ ] **Step 3: The re-send's bodies match the originals' except `max_tokens` (0 USD)**

Run `node tools/ai-review/term-pass.js plan --chapter ch07 --chapter ch08 --max-tokens 64000 --out <scratch>/plan.json`, then compare each planned body with the same key's body in `books/efnafraedi-2e/ai-review/runs/20261101T190553Z-055cca97/requests.jsonl` (ch07) and `…/20261101T192016Z-c3da50df/requests.jsonl` (ch08), as canonical JSON (sorted keys, compact separators), first as is and then with `max_tokens` removed from both. Include a control: a changed `messages` must compare as different.
In the same script, compare each chapter's planned keys **as a list, in order** with `plannedRequestKeys` in the original run's `term-pass.json`: `checkRuns` compares the two plans with `sameJson`, which is order-sensitive, so the same keys in another order would also be refused. Control: a swap of two keys must compare as different.
Expected (measured 2026-11-02, before Task 1): ch07 — 51 keys, all differing only in `max_tokens`; ch08 — 26 keys, all identical; both key lists equal the recorded plans, in order; both controls see a difference. Any other result means `apply` would refuse the re-send after it was paid for: stop.

- [ ] **Step 4: Dry run — preflight and the spend line (0 USD)**

Run:
```bash
node tools/ai-review/term-pass.js run --chapter ch07 --chapter ch08 \
  --request ch07/m68742/012 --request ch07/m68742/013 --request ch08/m68747/003 \
  --mode batch --max-tokens 64000 --layer1-commit 0093d8da4
```
Expected, in this order (✏️ 2026-11-02, after the whole-branch review; measured by both reviewers on the real book):
- the plan table, whose `TOTAL` prices **whole chapters** (about USD 105 interactive / 53 batch) and says `(whole chapters, not what this run sends: see the --request lines below)`;
- `sending 2 of 51 planned requests of ch07 (--request): worst case USD 2.72 interactive / 1.36 batch` and `sending 1 of 26 planned requests of ch08 (--request): … / 0.69 batch`;
- `TOTAL (--request): sending 3 of 77 planned requests: worst case USD … / 2.05 batch` — **about what the run reserves** (an estimate; each chapter's batch reserves on counted tokens);
- `preflight passed: layer 1 at 0093d8da4…`;
- `not sending: add --yes to spend.`

The ledger's headroom on 2026-11-02 was USD 39.72 (100 − 60.28).

- [ ] **Step 5: [USER]'s go, then the paid run**

Show [USER] the dry run's output and ask. On the go, run the same command with `--yes`.
Expected: two lines, `ch07: run <id> complete … (usable 2 of 2 sent …)` and `ch08: run <id> complete … (usable 1 of 1 sent …)`, and exit 0. Exit 2 means a re-sent answer is cut off or incomplete: stop and report. An answer cut off at 64,000 is the question the decision record left open ("Not decided here"), and it is [USER]'s.

- [ ] **Step 6: Dry `apply`, the re-send listed last (0 USD)**

Run:
```bash
node tools/ai-review/term-pass.js apply --chapter ch07 --run 20261101T190553Z-055cca97 --run <ch07 re-send id>
node tools/ai-review/term-pass.js apply --chapter ch08 --run 20261101T192016Z-c3da50df --run <ch08 re-send id>
```
Expected: `coverage: 51 of 51 planned requests usable` and `coverage: 26 of 26 planned requests usable`. Anything less: stop and report; do not `--write`.

- [ ] **Step 7: Record it**

A new top `⏭` entry in the register: the two run ids; their cost from the ledger (settled, and the ledger's new total); both coverage lines; that the flag and the `apply` change are changes of runner code after the run, recorded here as the prompt-freeze record asks; and that ch07's layer 2 will come from two runs at two limits (`maxTokensByRun` in its `apply.json`), which by the 2026-11-01 decision record changes no kept answer. Commit the run records, the ledger and the register entry on a branch; push and open a PR only when [USER] asks.

Not in this plan: `apply --write` per chapter and the short look (the register's later steps).
