# §C82 Plan B — the re-MT check battery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the §C82 check battery as a library of callable gate functions plus a CLI, so one module (and one book, and one chapter) can be judged mechanically — and so the whole battery can be validated against the *existing* corpus before any new ISK is spent.

**Architecture:** A flat set of ESM modules under `tools/lib/` exporting **pure gate functions**, a registry that gives every gate an id, tier, version and blocking flag, and a thin CLI (`tools/remt-battery.js`) that runs a tier and emits JSON. The battery **never mutates anything** and **never sequences** — Plan C's driver does both. Shape is copied from `server/scripts/verify-b4b0-gates.js`: `--self-test` plants a defective state and requires **the real gate function** to detect it; exit `0` all-passed / `1` a gate failed / `2` usage-or-environment.

**Tech Stack:** Node 22 (`.nvmrc`), ESM (root `package.json` is `"type": "module"`), Vitest. No new dependencies.

**Spec:**
- [`docs/superpowers/specs/2026-08-13-remt-check-battery.md`](../specs/2026-08-13-remt-check-battery.md) — the check list, tiering, blocking split, fixture ledger. **Read its banner AMENDMENT block first: it overrides the body where they conflict.**
- [`docs/superpowers/specs/2026-08-13-gated-per-module-remt-loop-design.md`](../specs/2026-08-13-gated-per-module-remt-loop-design.md) — architecture and validation strategy.

**Companion plan:** §C82 Plan C (driver + ledger + extraction fingerprint) consumes this battery. Build B first; C is unrunnable without it.

---

## Global Constraints

Every task's requirements implicitly include this section.

### Measured build state — do NOT rebuild these

The specs' §5 "MUST BE BUILT" list predates §C82 Plan A (merged, PR #396), §C88 (#405) and §C88 Unit A + §C115 (#410, `a9f1e457`). Re-verified against `main` on 2026-08-24:

| Spec prerequisite | Actual state |
|---|---|
| 1. §C81 figure alt into extract | ✅ **DONE** — merged; chemistry 1149/1149 and organic 2162/2162 alt segments emitted *and reaching output* |
| 2. Persist the per-module MT run record | ✅ **BUILT AND WIRED** — `tools/lib/run-record.js` `buildRunRecord()`, called at `tools/api-translate.js:1347` via `writeProvenance(..., { run })`; `tools/lib/provenance.js` is `SCHEMA_VERSION = 2` with an optional `run` key |
| 8. E4 baseline for `orverufraedi` | ✅ **VOID** — micro is dropped from the run and withdrawn from publication (§C80 re-scope, §C109). **Do not build it.** |
| Battery false-halt #1 (`orverufraedi` E4) | ✅ **VOID**, same reason |

🔴 **AND THE ONE THAT CHANGES A TASK'S ACCEPTANCE: the run record exists but NO MODULE CARRIES ONE.** Measured 2026-08-24 over both kept books: **200 provenance sidecars, 200 with `"tool"` (positive control), 0 with `schemaVersion: 2`, 0 with `"run"`.** Every existing pair predates Plan A.

▶ **Consequence, and Task 9 depends on it:** the base-rate sweep **structurally cannot** measure a base rate for any run-record-dependent check (**A2(a)**, **A4**, **A8**). They will examine **0 of 220 pairs**. They must report **SKIPPED with `examined: 0`**, never a clean zero — §C60's rule, and the design's *"every check emits the number of units it examined."* All three are already ADVISORY in the spec, so the blocking split survives intact.

### Scope — two books, and the specs are stale about it

**In scope: `efnafraedi-2e` (149 source modules) and `lifraen-efnafraedi` (342).** `liffraedi-2e`, `orverufraedi` and `edlisfraedi-2e` are dropped from the run and withdrawn from publication (§C80, §C109). Wherever the frozen specs say "physics preview shakedown" or reference micro fixtures as live gates, **the register wins**: the shakedown is organic, and micro fixtures are usable only as *static test bytes*, never as run targets.

⚠️ **Fixture bytes from withdrawn books are still legitimate test inputs** — `orverufraedi`'s `m58781` is the A3 true-positive fixture. Using its committed bytes in a Vitest fixture is fine; pointing a *run* at that book is not.

### Validation corpus, measured

**220 EN/IS pairs** exist today: `efnafraedi-2e` **170**, `lifraen-efnafraedi` **50**. (The spec's "227 across five books" is a different, older population.) ⚠️ **State this in the same breath as any pass rate**: the corpus is chemistry-shaped, every pair predates the current extractor, and the loop re-extracts first.

### Placement and the licence boundary — decided here, not per task

- **The battery lives in ESM `tools/lib/`**, flat, matching the existing convention (34 flat files, largest 960 lines). No subdirectories.
- 🔴 **DO NOT import `server/` from the battery.** `tools/` is MIT and `server/` is AGPL-3.0; root `LICENSE` carries an explicit enumeration of the existing MIT→AGPL edges and **`qaCheckService` is not among them** (verified). The spec suggests A7 reuse `server/services/qaCheckService.js:79 checkNumbers` — **do not.** Port the pure predicate into `tools/lib/` (Task 6). If a future executor instead adds the import, root `LICENSE`'s enumeration **must** be updated in the same commit — see CLAUDE.md § *THIS REPOSITORY IS PUBLIC*, gap E-2.

### Rules every gate must obey

1. **Every gate returns three things, always:** `verdict`, its own `version` stamp, and `examined` — the number of units it looked at. §C60: a check once reported `Total findings: 0` while reading zero files.
2. **`examined === 0` is never a pass.** The registry's runner converts it to `SKIPPED`. The §C82 Plan A review measured `cnxml-fidelity-check` and `cnxml-linguistic-check` exiting **0 having examined ZERO modules** on a `--module` that matched nothing.
3. **Never infer a pass from exit code 0.** `scan-residue.js` and `cnxml-render-fidelity-check.js` exit 0 *with* findings. Read `--json` and apply the battery's own threshold.
4. **A check with no known-bad fixture cannot be blocking** (the spec's mechanical derivation rule). A post-MT check that blocks must additionally have a **measured base rate ≤ ~5%**.
5. **Gates are pure.** No writes, no network, no DB. A gate takes already-read strings/objects and returns a verdict. File reading happens in the CLI or in Plan C's driver.
6. **Normalize both sides before comparing DOM-derived text to raw segment text** — the battery spec's amendment ④: E2's body comparison decoded entities on one side only and produced 10 false findings across 6 organic modules, each a false halt on a paid run.
7. **`tools/lib/parseArgs.js` silently drops unknown flags.** Declare every flag the CLI accepts; never assume a flag reached a tool because it appeared in `--help` (§C83 — `cnxml-extract --output-dir` is in `--help`, accepted, and ignored).

### Test conventions

- Vitest. Run from the **repo root** (`npm test` is `vitest run`; it does **not** run Playwright).
- `vitest.config.js` sets `fileParallelism: false` globally — tests run sequentially; a test mutating shared module state poisons every later file.
- Corpus tests read `books/*/01-source` and `books/*/02-*` directly and must assert a **control count** (e.g. `expect(files.length).toBe(149)`) so an empty walk cannot pass.
- **Never run `cnxml-extract.js`, `cnxml-inject.js`, `cnxml-render.js` or `api-translate.js` from a test.** Import the function. `api-translate` costs real money; the CNXML tools write into the real tracked tree regardless of `--output-dir` (§C83).

---

## Measured build state — the task order follows from it

Audited against `main` on 2026-08-24 (five parallel read-only agents + adversarial verification).
**Do not re-derive this from the frozen specs; their §5 list predates Plan A.**

| State | Checks | What Plan B does |
|---|---|---|
| **BUILT** — a pure, exported, driver-callable function already asserts it | `G1` `E2` `E4` `E7` `R1` `R3` `R5` `A8` | wrap in the contract, add a version stamp |
| **PARTIAL** — instrument exists, gate unwired or half-specified | `G5` `E5` `E9` `A2` `A3` `A4` `A5` `A7` `R2` `K1` `K2` | wire the missing half |
| **NOT_BUILT** | `G2` `G3` `G4` `E1` `E3` `E6` `A1` `A6` `R4` `K3` | write from scratch |
| **Plan C, not B** | `E8` (fingerprint), the driver, the ledger | out of scope here |

### File structure

`tools/lib/` is flat by convention (34 files, largest 960 lines). No subdirectories.

| File | Responsibility |
|---|---|
| `tools/lib/remt-battery.js` | **the contract**: `CheckResult` shape, `defineCheck()`, `runCheck()` (the `examined === 0` rule), `REGISTRY`, tier/blocking metadata |
| `tools/lib/remt-checks-glossary.js` | Tier 0 — `G1`–`G5` |
| `tools/lib/remt-checks-extract.js` | Tier 1 — `E1`–`E7`, `E9` |
| `tools/lib/remt-checks-mt.js` | Tier 2 — `A1`–`A8` |
| `tools/lib/remt-checks-output.js` | Tier 3 — `R1`–`R5` |
| `tools/lib/remt-checks-chapter.js` | Tier 4 — `K1`–`K3` |
| `tools/remt-battery.js` | CLI: `--book --chapter --module --tier --json --self-test`, exit 0/1/2 |
| `server/scripts/check-glossary-payload.js` | G5 only — a `--json` CLI over the AGPL producer gates, **spawned, never imported** |
| `tools/__tests__/remt-battery-*.test.js` | one test file per check module |

### The three `server/` checks — resolved, and only one was a real decision

| Check | Spec says | Resolution |
|---|---|---|
| **A2(b)(c)** | "verify against the real `segmentParser.parseSegments`" | ✅ **No edge needed.** `server/services/segmentParser.js:18-23` is a *thin wrapper over MIT `tools/lib/`*: `parseSegmentRecords` (`seg-markers.cjs`) + `normalizeWraps` (`mt-normalize.cjs`), plus a `{{SEG:…}}` → `<!-- SEG:… -->` normalization. The edge runs **AGPL→MIT**. Reproduce it in `tools/` from those two MIT modules. ⚠️ **Do NOT substitute bare `parseSegmentRecords`** — the mustache normalization and `normalizeWraps` are both load-bearing. |
| **A7** | "reuse `server/services/qaCheckService.js:79 checkNumbers`" | ✅ **Port it.** Pure, no I/O, ~20 lines. Not worth an edge. ⚠️ Do **not** also port its sibling `checkEnResidue` — it is the §C67 over-reporter. |
| **G5** | "reuse `server/lib/glossaryProducer.js`, `glossaryExportDecision.js`" | 🔴 **The only genuine E-2 edge** — both CommonJS, both AGPL, no MIT equivalent. **Resolved by SPAWN, not import:** G5 is Tier 0, per-book, once, off the hot path. A separate process is not a static import, so no edge is created and root `LICENSE` needs no change. Task 7 adds the `--json` CLI on the `server/` side. |

▶ **If any executor instead adds a static `server/` import, root `LICENSE`'s enumeration MUST be updated in the same commit** (CLAUDE.md gap E-2). These edges are unguarded static imports — a try/catch does not mitigate them; the importing tool simply cannot run without `server/`.

### Import vs spawn — the standing rule

**Import the pure `tools/lib/*` functions; spawn only what has no importable pure form.** The spawn model is `server/services/publicationService.js:124-184`, and its key property is what it does *not* do: `child.on('close', () => …)` **ignores the exit code entirely** and parses `--json` from stdout. Copy that. Also copy two details — `cwd` pinned to the repo root (a wrong cwd is exactly K1's blind spot: it prints `Total findings: 0` having read zero files), and a JSON parse failure **rejects with stderr attached** rather than reading as a pass.

---

## Task 1: The check contract

**Files:**
- Create: `tools/lib/remt-battery.js`
- Test: `tools/__tests__/remt-battery-contract.test.js`

**Interfaces:**
- Consumes: nothing (foundation).
- Produces: `defineCheck({id, tier, blocking, version, run})` → a check object; `runCheck(check, ctx)` → `Promise<CheckResult>`; `CheckResult = {id, tier, blocking, version, verdict, examined, findings, message}`; `VERDICT = {PASS, FAIL, WARN, SKIPPED}`.

🔴 **Why this is Task 1 and not an afterthought.** Both specs require *"every check emits three things, always: its verdict, its own version stamp, and the number of units it examined."* The audit measured that **none** of it exists: `server/scripts/verify-b4b0-gates.js` has no version constant (positive control — the same grep matched `RUN_RECORD_VERSION` and `SCHEMA_VERSION`), and `examined` appears ad-hoc in exactly 3 of ~12 tools, in 3 different shapes. This file is what makes the rule mechanical instead of per-gate goodwill.

- [ ] **Step 1: Write the failing test**

```javascript
import { describe, it, expect } from 'vitest';
import { defineCheck, runCheck, VERDICT } from '../lib/remt-battery.js';

describe('the check contract', () => {
  it('turns a zero-examined PASS into SKIPPED — a pass is never inferred from an empty run', async () => {
    const check = defineCheck({
      id: 'X1', tier: 1, blocking: true, version: 1,
      run: () => ({ verdict: VERDICT.PASS, examined: 0, findings: [] }),
    });
    const r = await runCheck(check, {});
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toMatch(/examined 0 units/);
  });

  it('stamps id, tier, blocking and version onto every result', async () => {
    const check = defineCheck({
      id: 'X2', tier: 0, blocking: false, version: 7,
      run: () => ({ verdict: VERDICT.PASS, examined: 3, findings: [] }),
    });
    const r = await runCheck(check, {});
    expect(r).toMatchObject({ id: 'X2', tier: 0, blocking: false, version: 7, examined: 3 });
  });

  it('a throwing check becomes FAIL, never an absent result', async () => {
    const check = defineCheck({
      id: 'X3', tier: 1, blocking: true, version: 1,
      run: () => { throw new Error('boom'); },
    });
    const r = await runCheck(check, {});
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.message).toMatch(/boom/);
  });

  it('refuses a check that declares blocking without a version', () => {
    expect(() => defineCheck({ id: 'X4', tier: 1, blocking: true, run: () => ({}) })).toThrow(
      /version/
    );
  });

  it('a FAIL with examined 0 stays FAIL — only a PASS is downgraded', async () => {
    const check = defineCheck({
      id: 'X5', tier: 1, blocking: true, version: 1,
      run: () => ({ verdict: VERDICT.FAIL, examined: 0, findings: ['bad'] }),
    });
    expect((await runCheck(check, {})).verdict).toBe(VERDICT.FAIL);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tools/__tests__/remt-battery-contract.test.js`
Expected: FAIL — `Failed to resolve import "../lib/remt-battery.js"`.

- [ ] **Step 3: Implement the contract**

```javascript
/**
 * remt-battery.js — the §C82 check contract.
 *
 * 🔴 EVERY CHECK EMITS THREE THINGS, ALWAYS: its verdict, its own version stamp,
 * and the number of units it examined. This file is what makes that mechanical.
 *
 * WHY `examined` IS NOT OPTIONAL. §C60: a check reported `Total findings: 0`
 * while reading ZERO files. The §C82 Plan A review measured cnxml-fidelity-check
 * and cnxml-linguistic-check exiting 0 having examined zero modules on a --module
 * that matched nothing. The battery spec's 2026-08-16 amendment makes it binding:
 * "Any driver this spec describes must still treat 'examined 0 units' as a failure
 * in its own right, not infer a pass from exit 0."
 *
 * WHY `version` IS NOT OPTIONAL. Design §5: "without a per-module record of which
 * instrument version judged it, a mid-campaign fix makes earlier green verdicts
 * unfalsifiable and the quarantine cannot be scoped." Decision ① (quarantine on a
 * fingerprint change) is unimplementable without it.
 */

/** @type {{PASS:'PASS', FAIL:'FAIL', WARN:'WARN', SKIPPED:'SKIPPED'}} */
export const VERDICT = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARN: 'WARN',
  SKIPPED: 'SKIPPED',
});

/**
 * @param {object} spec
 * @param {string} spec.id            battery id, e.g. 'E4'
 * @param {0|1|2|3|4} spec.tier
 * @param {boolean} spec.blocking     a FAIL halts the loop
 * @param {number} spec.version       bump whenever the JUDGEMENT changes
 * @param {(ctx:object)=>({verdict:string,examined:number,findings?:Array,message?:string})|Promise<any>} spec.run
 * @returns {object} the check
 */
export function defineCheck({ id, tier, blocking, version, run }) {
  if (!id) throw new Error('defineCheck: id is required');
  if (typeof version !== 'number') {
    // A blocking gate with no version cannot be quarantined by decision ①.
    throw new Error(`defineCheck(${id}): a numeric version is required`);
  }
  if (typeof run !== 'function') throw new Error(`defineCheck(${id}): run must be a function`);
  return { id, tier, blocking: Boolean(blocking), version, run };
}

/**
 * Run one check and normalise its result.
 *
 * 🔴 THE ONE RULE THAT IS NOT THE CHECK'S TO DECIDE: a PASS that examined 0 units
 * becomes SKIPPED. A check cannot opt out, because the checks most likely to
 * examine nothing are exactly the ones whose authors believed they could not.
 * ⚠️ A FAIL is NOT downgraded — a check that found something wrong while examining
 * zero units has a defect worth surfacing, and hiding it behind SKIPPED loses it.
 */
export async function runCheck(check, ctx) {
  const base = { id: check.id, tier: check.tier, blocking: check.blocking, version: check.version };
  let out;
  try {
    out = await check.run(ctx);
  } catch (err) {
    return { ...base, verdict: VERDICT.FAIL, examined: 0, findings: [], message: String(err && err.message ? err.message : err) };
  }
  const examined = Number(out && out.examined);
  if (!Number.isFinite(examined)) {
    return { ...base, verdict: VERDICT.FAIL, examined: 0, findings: [], message: `${check.id} returned no examined count` };
  }
  const verdict = out.verdict;
  if (verdict === VERDICT.PASS && examined === 0) {
    return { ...base, verdict: VERDICT.SKIPPED, examined: 0, findings: [], message: `${check.id} examined 0 units — a pass is not inferred from an empty run` };
  }
  return { ...base, verdict, examined, findings: out.findings || [], message: out.message || '' };
}

/** id -> check. Populated by the tier modules via registerChecks(). */
export const REGISTRY = new Map();

export function registerChecks(checks) {
  for (const c of checks) {
    if (REGISTRY.has(c.id)) throw new Error(`duplicate check id: ${c.id}`);
    REGISTRY.set(c.id, c);
  }
  return REGISTRY;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tools/__tests__/remt-battery-contract.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/remt-battery.js tools/__tests__/remt-battery-contract.test.js
git commit -m "feat(C82-B): the check contract — verdict + version + examined, with the 0-units rule"
```

---
## Task 2: The CLI skeleton — `--json`, `--tier`, exit 0/1/2

**Files:**
- Create: `tools/remt-battery.js`
- Test: `tools/__tests__/remt-battery-cli.test.js`

**Interfaces:**
- Consumes: `REGISTRY`, `runCheck`, `VERDICT` from Task 1.
- Produces: `runTier(tier, ctx)` → `{results, blockingFailures, exitCode}`; the CLI binary.

- [ ] **Step 1: Write the failing test**

```javascript
import { describe, it, expect } from 'vitest';
import { defineCheck, VERDICT } from '../lib/remt-battery.js';
import { runTier, exitCodeFor } from '../remt-battery.js';

const mk = (id, verdict, blocking, examined = 1) =>
  defineCheck({ id, tier: 1, blocking, version: 1, run: () => ({ verdict, examined, findings: [] }) });

describe('runTier', () => {
  it('exit 1 when a BLOCKING check fails', async () => {
    const r = await runTier(1, {}, [mk('B1', VERDICT.FAIL, true)]);
    expect(exitCodeFor(r)).toBe(1);
  });

  it('exit 0 when only an ADVISORY check fails', async () => {
    const r = await runTier(1, {}, [mk('B2', VERDICT.FAIL, false)]);
    expect(exitCodeFor(r)).toBe(0);
  });

  it('a SKIPPED blocking check does NOT pass silently — it is reported and exits 1', async () => {
    // §C60: examined 0 is the shape that must never read as clean.
    const r = await runTier(1, {}, [mk('B3', VERDICT.PASS, true, 0)]);
    expect(r.results[0].verdict).toBe(VERDICT.SKIPPED);
    expect(exitCodeFor(r)).toBe(1);
  });

  it('every result carries id, version and examined — the JSON contract', async () => {
    const r = await runTier(1, {}, [mk('B4', VERDICT.PASS, true)]);
    for (const res of r.results) {
      expect(res).toHaveProperty('id');
      expect(res).toHaveProperty('version');
      expect(res).toHaveProperty('examined');
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tools/__tests__/remt-battery-cli.test.js`
Expected: FAIL — cannot resolve `../remt-battery.js`.

- [ ] **Step 3: Implement**

```javascript
#!/usr/bin/env node
/**
 * remt-battery.js — run one tier of the §C82 check battery over one scope.
 *
 * ⚠️ THIS TOOL JUDGES; IT NEVER MUTATES AND NEVER SEQUENCES. Plan C's driver
 * sequences. Keeping them apart is what lets the battery be validated against the
 * EXISTING corpus before any ISK is spent (design §3).
 *
 * Exit: 0 all blocking checks passed · 1 a blocking check failed or was SKIPPED
 *       · 2 usage or environment error.
 */
import { parseArgs } from './lib/parseArgs.js';
import { REGISTRY, runCheck, VERDICT } from './lib/remt-battery.js';

export async function runTier(tier, ctx, checks) {
  const set = checks || [...REGISTRY.values()].filter((c) => c.tier === tier);
  const results = [];
  for (const c of set) results.push(await runCheck(c, ctx));
  // 🔴 A SKIPPED BLOCKING CHECK COUNTS AS A FAILURE. It examined nothing, so it
  // supplied no evidence — and a gate that supplied no evidence must not let a
  // paid module through. This is the amendment's "treat 'examined 0 units' as a
  // failure in its own right, not infer a pass from exit 0."
  const blockingFailures = results.filter(
    (r) => r.blocking && (r.verdict === VERDICT.FAIL || r.verdict === VERDICT.SKIPPED)
  );
  return { tier, results, blockingFailures };
}

export function exitCodeFor(run) {
  return run.blockingFailures.length > 0 ? 1 : 0;
}

// CLI entry — only when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(2); });
}

async function main() {
  const args = parseArgs(process.argv.slice(2), [
    { name: 'book', flags: ['--book'], type: 'string' },
    { name: 'chapter', flags: ['--chapter'], type: 'string' },
    { name: 'module', flags: ['--module'], type: 'string' },
    { name: 'tier', flags: ['--tier'], type: 'number' },
    { name: 'json', flags: ['--json'], type: 'boolean', default: false },
    { name: 'selfTest', flags: ['--self-test'], type: 'boolean', default: false },
  ]);
  if (args.selfTest) return selfTest(args);
  if (!args.book) { console.error('Error: --book is required'); process.exit(2); }
  if (args.tier == null) { console.error('Error: --tier is required'); process.exit(2); }
  const run = await runTier(args.tier, { book: args.book, chapter: args.chapter, module: args.module });
  if (args.json) console.log(JSON.stringify(run, null, 2));
  else for (const r of run.results) console.log(`${r.verdict.padEnd(7)} ${r.id} v${r.version} (examined ${r.examined}) ${r.message}`);
  process.exit(exitCodeFor(run));
}
```

⚠️ `selfTest` is defined in Task 12. Until then, stub it as `async function selfTest() { console.error('--self-test not implemented yet'); process.exit(2); }` so the CLI never silently no-ops.

- [ ] **Step 4: Run and confirm PASS** — `npx vitest run tools/__tests__/remt-battery-cli.test.js` → 4 pass.

- [ ] **Step 5: Commit**

```bash
git add tools/remt-battery.js tools/__tests__/remt-battery-cli.test.js
git commit -m "feat(C82-B): battery CLI — tier runner, JSON contract, SKIPPED-blocks-too exit rule"
```

---

## Task 3: Tier 1 — wrap the three BUILT extraction instruments (E2, E4, E7)

**Files:**
- Create: `tools/lib/remt-checks-extract.js`
- Test: `tools/__tests__/remt-checks-extract.test.js`

**Interfaces:**
- Consumes: `defineCheck`, `VERDICT` (Task 1); `checkBracketBodies` (`tools/lib/bracket-body-check.js`), `analyzeModule` (`tools/lib/extraction-coverage.js`), `compareModule` + `normalizeVisibleText` (`tools/verify-reextract-equivalence.js`).
- Produces: `E2`, `E4`, `E7` check objects; `EXTRACT_CHECKS` array.

**All three already exist as pure exported functions — verified 2026-08-24.** This task adds *only* the contract wrapper and a version stamp. Do not reimplement them.

- [ ] **Step 1: Write the failing test** — one SHOULD-TRIP and one MUST-NOT-TRIP per check, from the spec's fixture ledger.

```javascript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runCheck, VERDICT } from '../lib/remt-battery.js';
import { E2, E4, E7 } from '../lib/remt-checks-extract.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const src = (b, ch, m) => fs.readFileSync(path.join(ROOT, 'books', b, '01-source', ch, `${m}.cnxml`), 'utf8');
const seg = (b, ch, m) => fs.readFileSync(path.join(ROOT, 'books', b, '02-for-mt', ch, `${m}-segments.en.md`), 'utf8');

describe('E4 — list coverage and real duplicate seg-ids', () => {
  it('SHOULD-TRIP on orverufraedi m58781 (14 dropped lists across three modules)', async () => {
    // ⚠️ Withdrawn-book BYTES as a fixture are fine; pointing a RUN at that book is not.
    const r = await runCheck(E4, { cnxml: src('orverufraedi', 'ch24', 'm58781'), segText: seg('orverufraedi', 'ch24', 'm58781') });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.examined).toBeGreaterThan(0);
  });

  it('MUST-NOT-TRIP on a clean chemistry module', async () => {
    const r = await runCheck(E4, { cnxml: src('efnafraedi-2e', 'ch01', 'm68663'), segText: seg('efnafraedi-2e', 'ch01', 'm68663') });
    expect(r.verdict).toBe(VERDICT.PASS);
  });
});

describe('E2 — bracket-marker bodies match 01-source', () => {
  it('SHOULD-TRIP on m68733 ([[i: 3d;]] — a self-closing <emphasis/> swallow)', async () => {
    const r = await runCheck(E2, { cnxml: src('efnafraedi-2e', 'ch06', 'm68733'), segText: seg('efnafraedi-2e', 'ch06', 'm68733') });
    expect(r.verdict).toBe(VERDICT.FAIL);
  });
});

describe('the contract holds for every extract check', () => {
  it('each stamps a version and an examined count', async () => {
    for (const c of [E2, E4]) {
      const r = await runCheck(c, { cnxml: src('efnafraedi-2e', 'ch01', 'm68663'), segText: seg('efnafraedi-2e', 'ch01', 'm68663') });
      expect(typeof r.version).toBe('number');
      expect(r.examined).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails** — `npx vitest run tools/__tests__/remt-checks-extract.test.js` → cannot resolve `remt-checks-extract.js`.

- [ ] **Step 3: Implement the wrappers**

```javascript
/**
 * Tier 1 — per MODULE, PRE-MT. Free, loops until clean, GATES THE SPEND.
 * A halt here costs a re-extract, not money (design §4).
 *
 * ⚠️ VERSION STAMPS ARE NEW HERE, NOT INHERITED. None of the reused functions
 * carries one (measured 2026-08-24 across every Plan A lib). Bump a check's
 * version whenever its JUDGEMENT changes — not when its wrapper is reformatted.
 */
import { defineCheck, registerChecks, VERDICT } from './remt-battery.js';
import { checkBracketBodies } from './bracket-body-check.js';
import { analyzeModule } from './extraction-coverage.js';

export const E2 = defineCheck({
  id: 'E2', tier: 1, blocking: true, version: 1,
  run: ({ cnxml, segText }) => {
    const findings = checkBracketBodies(cnxml, segText) || [];
    // `examined` is the number of MARKER BODIES compared, not modules: a module
    // with no bracket markers examined nothing and must read SKIPPED, not clean.
    const examined = countBracketBodies(segText);
    return { verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS, examined, findings };
  },
});

export const E4 = defineCheck({
  id: 'E4', tier: 1, blocking: true, version: 1,
  run: ({ cnxml, segText }) => {
    const { listFindings, dupFindings } = analyzeModule(cnxml, segText);
    const findings = [...listFindings, ...dupFindings];
    // ⚠️ Deliberately does NOT read altFindings — that is E5, and analyzeModule
    // folds it OUT of hasFindings on purpose (extraction-coverage.js:339-343).
    return { verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS, examined: countLists(cnxml), findings };
  },
});
```

`countBracketBodies` and `countLists` are three-line local helpers over `segText`/`cnxml`; write them in the same file with a test each. **E7 is ADVISORY** (§C81 *intends* to change extraction) — same shape, `blocking: false`, wrapping `compareModule`.

- [ ] **Step 4: Run and confirm PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(C82-B): E2/E4/E7 wrapped in the battery contract"`

---

## Task 4: Tier 1 — E5, and why it is wired but red until the re-extract

**Files:**
- Modify: `tools/lib/remt-checks-extract.js`
- Test: `tools/__tests__/remt-checks-extract-alt.test.js`

🔴 **The one thing an executor must not "fix".** `checkAltCoverage` is built and driver-callable, and `analyzeModule` deliberately folds `altFindings` **out** of `hasFindings` — its comment says so verbatim at `tools/lib/extraction-coverage.js:339-343`. **Do not widen `hasFindings`.** E5 reads `altFindings.ok` directly.

**Measured 2026-08-24, and it is why:** the committed `02-for-mt` holds **0** alt SEG markers for both kept books — positive control, **21,536** (chemistry) and **7,309** (organic) total SEG markers in the same sweep. So **E5 fails 100% of modules against today's tree, correctly**: the committed vintage predates §C81. It goes green only after the loop's own step-2 re-extract.

- [ ] **Step 1: Write the test — it asserts the RED, because that is today's truth**

```javascript
it('E5 fails on the pre-re-extract vintage, and says how many alts it expected', async () => {
  const r = await runCheck(E5, { cnxml: src('efnafraedi-2e', 'ch01', 'm68663'), segText: seg('efnafraedi-2e', 'ch01', 'm68663') });
  expect(r.verdict).toBe(VERDICT.FAIL);
  // 🔴 THE VACUITY CONTROL. A figure-less module would examine 0 and read SKIPPED;
  // this one has figures, so a FAIL here is evidence and not an empty run.
  expect(r.examined).toBeGreaterThan(0);
  expect(r.message).toMatch(/expected \d+ .*reached 0/);
});

it('E5 passes on a synthetic module whose alts ARE emitted', async () => {
  // Built by running the REAL extractor over source in-process — never hand-written.
  const cnxml = src('efnafraedi-2e', 'ch01', 'm68663');
  const { segments } = (await import('../cnxml-extract.js')).extractSegments(cnxml);
  const segText = (await import('../cnxml-extract.js')).formatSegmentsMarkdown(segments);
  const r = await runCheck(E5, { cnxml, segText });
  expect(r.verdict).toBe(VERDICT.PASS);
});
```

⚠️ The second test is the positive control that proves E5 discriminates rather than always failing. It uses the **real extractor in-process** — never the CLI (§C83: `--output-dir` is accepted and ignored, and the run writes into the real tracked tree).

- [ ] **Steps 2–5:** run red → implement `E5` reading `checkAltCoverage(...).ok`, printing `expected`/`reached` in `message` → run green → commit.

---
## Task 5: Tier 1 — E1, E3, E6 (net-new, small)

**Files:** Modify `tools/lib/remt-checks-extract.js`; test `tools/__tests__/remt-checks-extract-legacy.test.js`

**Interfaces:** Produces `E1`, `E3`, `E6`.

| id | asserts | trap the spec measured |
|---|---|---|
| **E1** | zero legacy markers on the EN side, **both dialects**: `{{i\|b\|term\|fn}}` **and** `++text++` | 🔴 the naive `++[^+]+++` regex **over-counts 26%** on adjacent runs — 49 regex hits vs 39 source `<emphasis effect="underline">` across 6 chemistry modules. **Anchor the `++` count to the `01-source` element count, not to the regex.** |
| **E3** | no raw XML residue in segments: `<(emphasis\|term\|link\|note\|para\|entry\|row)\b` | widened once already — assume a next tag. Baseline is 0 on both sides, so it **needs a planted control** or it can never be shown to fire. |
| **E6** | extract emitted no unexpected files | 🔴 **`find … -name '*.backup.*'`, NEVER `git status --porcelain`** — `.gitignore:20` hides `*.backup.*`, and the 2026-08-12 run reported `??` = none while writing **67** backup files. |

- [ ] **Step 1: Write the failing tests**

```javascript
it('E1 SHOULD-TRIP on a chemistry module carrying legacy {{…}}', async () => {
  const r = await runCheck(E1, { segText: seg('efnafraedi-2e', 'ch06', 'm68734') });
  expect(r.verdict).toBe(VERDICT.FAIL);
});

it('E1 counts ++ against the SOURCE element count, not the regex', async () => {
  // The regex over-counts adjacent runs by 26%. Anchoring is the whole point.
  const cnxml = src('efnafraedi-2e', 'ch06', 'm68734');
  const r = await runCheck(E1, { segText: seg('efnafraedi-2e', 'ch06', 'm68734'), cnxml });
  expect(r.findings.find((f) => f.dialect === '++')?.sourceElements).toBeGreaterThan(0);
});

it('E3 fires on a PLANTED control — its natural base rate is 0, so without this it is unfalsifiable', async () => {
  const r = await runCheck(E3, { segText: '<!-- SEG:m1:para:p1 -->\nA <emphasis effect="bold">leak</emphasis> here\n' });
  expect(r.verdict).toBe(VERDICT.FAIL);
});

it('E6 uses the backup glob, not git status — a .gitignore'd artefact must still be seen', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e6-'));
  fs.writeFileSync(path.join(dir, 'x-segments.en.md.backup.1'), '');
  const r = await runCheck(E6, { scanDir: dir });
  expect(r.verdict).toBe(VERDICT.FAIL);
});
```

- [ ] **Steps 2–5:** red → implement → green → `git commit -m "feat(C82-B): E1/E3/E6 — legacy dialects, XML residue, backup-file sweep"`

---

## Task 6: Tier 1 — E9, the pre-flight (five legs, one built)

**Files:** Modify `tools/lib/remt-checks-extract.js`; test `tools/__tests__/remt-checks-preflight.test.js`

**Interfaces:** Consumes `isMtLocked` (`tools/lib/mt-lock.cjs`, already exported and fail-safe). Produces `E9`.

The five legs, of which **only the lock check exists**:

1. **`.locked` sibling** — ✅ reuse `isMtLocked`. Fail-safe by design: an existing-but-unreadable marker counts as locked.
2. **`git log` shows no hand edit under `02-mt-output`** — net-new. This is the *only* witness to a hand-edited MT baseline. ⚠️ Classify by **path, then by diff — never by commit subject**: `827424da` carries a `fix(…)` subject and is a re-translation, not a hand edit.
3. **every expected input exists and is non-empty** — net-new.
4. **`--force` present** — net-new; the loop always re-translates over existing output.
5. **`--force --dry-run` cost within band** — net-new. 🔴 **A bare `--dry-run` reports `~0 ISK` once output exists** — a wrong answer that looks like an answer.

🔴 **Leg 1 is a hard gate, and its fixture situation changed mid-audit — read this before writing the test.** `cnxml-extract.js` is **not** lock-aware while `api-translate.js` is (§C110), so a surviving lock splits the vintage *inside one module* and nothing reports it.

⚠️ **MEASURED 2026-08-24, AFTER the 7 chemistry markers were cleared (`cc725a62`): in-scope live locks are ZERO.** Exactly one `.locked` file remains in the tree — biology's `m66443`, deliberately kept, and biology is withdrawn. ▶ **Two consequences:**
1. **The lock leg has NO live in-scope fixture**, so by the spec's own rule (*a check with no known-bad fixture cannot be blocking*) its SHOULD-TRIP must be **synthetic** — plant a `.locked` sibling in a temp dir, as the test below does. Do not reach for a corpus path.
2. **E9 must still DETECT the lock state, never assume Phase 2.1 was done.** The clearing commit is on `main` but **must reach prod before the run**; until it does, prod still holds all 7. And the runbook marked 2.1 ✅ while all 8 were on disk — its ✅ marks are provenance, not completion.

📌 *A process note worth keeping: an audit agent reported "8 live lock files, measured today" while the clearing had already landed — it read the register's prose as a measurement. Its adversarial verifier caught it with four independent commands. **A parallel audit races a mutating tree; re-measure anything a plan will act on.***

- [ ] **Step 1: Write the failing test**

```javascript
it('E9 FAILS when a .locked sibling is present — the split-vintage guard', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e9-'));
  fs.writeFileSync(path.join(dir, 'm1-segments.is.md'), 'x');
  fs.writeFileSync(path.join(dir, 'm1-segments.locked'), '{"reason":"test"}');
  const r = await runCheck(E9, { mtOutputPath: path.join(dir, 'm1-segments.is.md'), force: true });
  expect(r.verdict).toBe(VERDICT.FAIL);
  expect(r.findings.map((f) => f.leg)).toContain('locked');
});

it('E9 FAILS without --force — the loop always writes over existing output', async () => {
  const r = await runCheck(E9, { mtOutputPath: '/nonexistent/m1-segments.is.md', force: false });
  expect(r.findings.map((f) => f.leg)).toContain('force');
});

it('E9 examines all five legs and says so', async () => {
  const r = await runCheck(E9, { mtOutputPath: '/nonexistent/m1.is.md', force: true });
  expect(r.examined).toBe(5);
});
```

- [ ] **Steps 2–5:** red → implement → green → commit.

---

## Task 7: Tier 0 — the glossary gates (G1 wrap · G2/G3/G4 new · G5 by spawn)

**Files:** Create `tools/lib/remt-checks-glossary.js`, `server/scripts/check-glossary-payload.js`; test `tools/__tests__/remt-checks-glossary.test.js`

**Why Tier 0 exists at all:** §C78 — propagation is **segment-keyed, not term-keyed**, so a bad glossary entry that reaches output *cannot be flipped back across a book*. Caught here it costs one DB edit; caught after the run it costs a re-MT.

| id | state | build |
|---|---|---|
| **G1** | ✅ BUILT | wrap `findGlossaryCollisions` (`tools/lib/glossary-collisions.js:28`). ⚠️ **Provably blind to the §C73/§C77 class** — it detects *competitions*, and a single-valued wrong entry is not a competition. Say so in the check's `message`. |
| **G2** | ❌ new | no `-ium` headword may resolve to a `-ín`/`-in` ending (must be `-íum`). 🔴 **Run it through the real `formatGlossary` (`tools/lib/malstadur-api.js:204`) so it measures the WIRE BODY, not the file** — `formatGlossary` omits contested headwords and drops comma values, so file and wire differ. Fixture: chemistry glossary at `120352b0` → **44**; at `b665c43d` → **0**. |
| **G3** | ❌ new | no headword is a common English function word. 🔴 **Derive the stoplist from an English frequency list + a min-length rule — do NOT hand-copy §C77's table**, or the check is fitted to the instances it was built from and finds no future homograph. |
| **G4** | ❌ new, **ADVISORY** | one headword must not resolve differently across books. Catches **3 of §C73's 44** — structurally blind to anything uniformly wrong. |
| **G5** | ⚠️ PARTIAL | verdict functions exist (`server/lib/glossaryProducer.js` `detectProducer`, `glossaryExportDecision.js`) but no CLI. **Add `server/scripts/check-glossary-payload.js --json` and SPAWN it.** Fixture: the 4-byte `null` payload that walked past all three gates (§C21 amendment). **⚠️ G5 as the spec writes it is HALF-UNIMPLEMENTABLE — see below.** |

🔴 **TWO G5 GAPS, BOTH CONFIRMED BY EXECUTION 2026-08-24. The spec's "reuse `glossaryProducer.js`, `glossaryExportDecision.js`" understates the work.**

1. **The absent/corrupt/ok classifier is UNREACHABLE.** `readExisting(outPath)` — the function that distinguishes a missing file from a corrupt one from a good one — is module-local at `server/scripts/export-terminology.js:234`, and that file's `module.exports = { listBooks, runGlossaryExport, parseArgs }`. **It is not exported.** ▶ The G5 wrapper must do its **own** parse-failure / non-object / null classification. Do not plan around importing it.
   - ✅ **The `null` half IS covered by the exported function** — measured: `detectProducer` returns `'unknown'` for `null`, `[]`, `42` and a JSON-parsed `null`, and `'export-terminology'` for a well-formed payload. So the §C21 type collision is caught; it is the *file-level* states that need writing.
2. **The shrink half is NOT EVALUABLE AS SPECIFIED.** `shrinkVerdict(prev, next)` is a **prev-vs-next** comparison performed at **export time**. A Tier 0 pre-run check holds **one** payload, so *"not shrunk >50%"* has no `next` to compare against. ▶ **Resolve it one of two ways and say which in the check's `message`:** (a) compare against the **git-committed prior blob** of the same path, or (b) **drop that half** and record that the halving guard is an *export-time* gate, not a battery check. **Do not silently emit PASS for a comparison that never happened** — that is §C60 with extra steps.

🔴 **G5 is the only genuine MIT→AGPL edge in the battery, and spawning is what avoids it.** Do not `import` `server/lib/glossaryProducer.js` from `tools/`. Spawn model: `server/services/publicationService.js:124-184` — pin `cwd` to the repo root, parse `--json` from stdout, **ignore the exit code**, and reject on a parse failure with stderr attached.

- [ ] **Step 1: Write the failing tests** (one per gate, each with its fixture from the table above)

```javascript
it('G2 fires on the pre-§C73 chemistry glossary and is clean after it', async () => {
  const before = JSON.parse(execFileSync('git', ['show', '120352b0:books/efnafraedi-2e/glossary/glossary-unified.json'], { encoding: 'utf8', maxBuffer: 64e6 }));
  const after = JSON.parse(execFileSync('git', ['show', 'b665c43d:books/efnafraedi-2e/glossary/glossary-unified.json'], { encoding: 'utf8', maxBuffer: 64e6 }));
  expect((await runCheck(G2, { glossary: before })).findings).toHaveLength(44);
  expect((await runCheck(G2, { glossary: after })).findings).toHaveLength(0);
});

it('G5 refuses the 4-byte null payload — the §C21 type collision', async () => {
  const r = await runCheck(G5, { payloadText: 'null' });
  expect(r.verdict).toBe(VERDICT.FAIL);
});
```

⚠️ **If `120352b0`/`b665c43d` no longer resolve, do not silently drop the fixture** — a G2 with no known-bad fixture *cannot be blocking* by the spec's own rule. Re-derive an equivalent pair from `git log` on the glossary file and record the new shas in the test.

- [ ] **Steps 2–5:** red → implement → green → commit.

---

## Task 8: Tier 2 — the free half (A1, A6, A2(b)(c))

**Files:** Create `tools/lib/remt-checks-mt.js`; test `tools/__tests__/remt-checks-mt.test.js`

| id | asserts | note |
|---|---|---|
| **A1** | EN seg-id **set** == IS seg-id set | **ADVISORY.** Cannot fail on a written file — `validateMarkers` throws at `api-translate.js:1132-1140` *before* the write. Record it; do not gate on it. |
| **A6** | zero legacy `{{…}}` / `++…++` on the **IS** side | BLOCKING. Fixture: 5,588 IS-side occurrences across 113 chemistry + 4 micro modules. Same instrument as E1, other side. |
| **A2(b)** | `parseSegments(out).length == raw marker count` | BLOCKING |
| **A2(c)** | no `<!-- SEG: ` **spaced** form | BLOCKING. Synthetic fixture only — **0 spaced-SEG occurrences corpus-wide against a positive control of 36,907 canonical markers.** |

🔴 **Reproduce `parseSegments` in `tools/`, do not import `server/`** — independently confirmed twice. **The marker RECOGNIZER is already shared across both trees**: `server/services/segmentParser.js:18` does `require('../../tools/lib/seg-markers.cjs')` and `tools/cnxml-inject.js:54` imports `SEG_MARKER, parseSegmentsMap` from that same MIT file, so a `tools/`-side A2(b) checks **the very recognizer inject uses** — not a different parser. `server/services/segmentParser.js:18-23` is a thin wrapper over MIT code: `parseSegmentRecords` from `tools/lib/seg-markers.cjs` plus `normalizeWraps` from `tools/lib/mt-normalize.cjs`, with a `{{SEG:…}}` → `<!-- SEG:… -->` normalization in front. ⚠️ **Do NOT substitute bare `parseSegmentRecords`** — both the mustache normalization and `normalizeWraps` are load-bearing, and dropping either changes what "parses" means.

```javascript
// tools/lib/remt-checks-mt.js — the MIT-side equivalent of segmentParser.parseSegments
import { parseSegmentRecords } from './seg-markers.cjs';
import { normalizeWraps } from './mt-normalize.cjs';

export function parseSegmentsMit(content) {
  const normalized = String(content).replace(/\{\{SEG:([^}]+)\}\}/g, '<!-- SEG:$1 -->');
  return parseSegmentRecords(normalized).map((r) => ({ ...r, content: normalizeWraps(r.content) }));
}
```

- [ ] **Step 1: the failing test must pin the equivalence, or the port is unverified**

```javascript
it('parseSegmentsMit agrees with the real segmentParser on a real corpus file', async () => {
  const text = fs.readFileSync(path.join(ROOT, 'books/efnafraedi-2e/02-mt-output/ch01/m68663-segments.is.md'), 'utf8');
  const mine = parseSegmentsMit(text);
  expect(mine.length).toBeGreaterThan(0);            // control: it parsed something
  // The AGPL original is imported HERE ONLY, in a test, to pin the port. Never in tools/.
  const { parseSegments } = require('../../server/services/segmentParser.js');
  expect(mine).toEqual(parseSegments(text));
});
```

⚠️ A test-only `require` of `server/` is **not** a shipped MIT→AGPL edge (root `LICENSE`'s enumeration covers the tooling, not the test suite) — but state that in a comment so a future reader does not "fix" it by deleting the pin.

- [ ] **Steps 2–5:** red → implement → green → commit.

---

## Task 9: Tier 2 — the run-record half (A2(a), A4, A8), and the SKIPPED path that matters

**Files:** Modify `tools/lib/remt-checks-mt.js`; test `tools/__tests__/remt-checks-mt-runrecord.test.js`

🔴 **MEASURED 2026-08-24 AND IT DEFINES THIS TASK'S ACCEPTANCE: the run record is wired but NO MODULE CARRIES ONE.** 200 provenance sidecars across both kept books; **200** contain `"tool"` (positive control), **0** contain `schemaVersion: 2`, **0** contain `"run"`. Every existing pair predates Plan A's writer.

▶ **So these three checks examine 0 of 220 pairs today.** The deliverable is **not** a base rate — it is the SKIPPED path. All three are ADVISORY in the spec, so the blocking split is unaffected.

| id | reads | semantics |
|---|---|---|
| **A2(a)** | `run.markersNormalized` | WARN → quarantine. A *repaired* condition: the file is clean, the counter is the only evidence. |
| **A4** | `run.unwrapped[]` | WARN → quarantine, **and it is an input to the §C82 ③ glossary-arm decision**. 🔴 A file scan is a **tautology** — `unwrapInventedMarkers` runs before the write, so post-hoc "invented markers = 0" holds whether the model invented 9 or 900. |
| **A8** | `run.chars`, `run.estimatedIsk` | record only. Compare **characters**, never estimate-vs-estimate from one function. |

- [ ] **Step 1: Write the failing test — the SKIPPED path is the assertion**

```javascript
it('A4 reports SKIPPED, not clean, on a v1 sidecar — the whole existing corpus', async () => {
  const r = await runCheck(A4, { provenance: { schemaVersion: 1, tool: 'api-translate' } });
  expect(r.verdict).toBe(VERDICT.SKIPPED);
  expect(r.examined).toBe(0);
  expect(r.message).toMatch(/no run record/i);
});

it('A4 reads the counter when a v2 sidecar IS present', async () => {
  const r = await runCheck(A4, { provenance: { schemaVersion: 2, tool: 'api-translate', run: { unwrapped: ['a', 'b'] } } });
  expect(r.examined).toBe(1);
  expect(r.findings).toHaveLength(2);
});

it('the corpus really is v1 today — the premise this task rests on', () => {
  const files = globSync('books/{efnafraedi-2e,lifraen-efnafraedi}/02-mt-output/**/*-provenance.json', { cwd: ROOT });
  expect(files.length).toBe(200);                                  // control
  const v2 = files.filter((f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')).schemaVersion === 2);
  expect(v2).toHaveLength(0);
});
```

⚠️ **The third test is a premise pin, and it is EXPECTED to go red once the run starts.** When it does, that is the corpus moving, not a defect — update it to the new count in the same commit that observes it.

- [ ] **Steps 2–5:** red → implement → green → commit.

---

## Task 10: Tier 2 — A3 gating, A5 stages, A7 port

**Files:** Modify `tools/lib/remt-checks-mt.js`; tests alongside.

**A3 — two of three prescribed changes already shipped in Plan A.** Widening ✅ and per-segment ✅ are done; **making it gating is not.** That third step is the **§C69 comparability call**, already [LEAD]-ACCEPTED: the full run is deliberately **stricter than the pilot**, and their marker results are **not comparable**. Say so wherever the two appear side by side.

Acceptance trio, all previously executed — reuse verbatim:
- `m58781` → `{"b":-2}` (true positive)
- `m68791` → `{}` with MATH 84/84, TABLE 6/6 (true negative)
- 🔴 `m68823` → `{}` while MATH went **56→54** — the **proven false negative** that the widening exists to close. Plus `m68819` 120→119, `m68832` 9→8, `m68852` 52→50.

**A5 — stage 1 is reusable as-is; stage 2 does not exist.**
- Stage 1: exact EN==IS residue beyond `residue-allowlist.json`. 🔴 **`scan-residue.js` EXITS 0 WITH FINDINGS** — read `--json`, apply the battery's own threshold.
- Stage 2: identical **and** ≥120 alphabetic chars **after stripping markers** → **9 segments corpus-wide**, 3 of them known-good `m68662` biographies, **6 genuine**. WARN → human queue, never a halt.
  - ✅ **STAGE 2 IS A LENGTH CHECK OVER AN EXISTING EXPORT, NOT A NEW INSTRUMENT** *(corrected 2026-08-24 by the audit's own adversarial pass, whose grep range had omitted the file)*: `tools/lib/residue-check.js` holds **both** halves. `normalizeForComparison` (`:32`, **exported**) is exactly strip-markers → drop digits → Unicode letters only → lowercase, so *"alphabetic chars after stripping markers"* is `normalizeForComparison(t).replace(/\s/g,'').length`; and `detectResidue` (`:155-180`) already returns `exact` (`:160`, `enNorm === isNorm`) — the "identical" half, **already marker-stripped**. ▶ **Reuse both. Do not write a second stripper**, and do not reach for the `ratio` — it is a different quantity that happens to sit in the same return object.
- ⚠️ **Raw byte-identity is useless as a predicate: 7,300 of 31,025 paired segments (23.5%) are legitimately identical.**
- 🔴 **A5 stage 1 is BLOCKING only AFTER `residue-allowlist.json` is re-derived.** It is **segmentId-keyed** and the re-extract renumbers seg-ids, so it is **wholly voided**. Until then `m68662`'s 76 residues fire. **This sequencing constraint appears in no other document.**

**A7 — port `checkNumbers` into `tools/lib/`.** ~20 lines, pure, no I/O. ADVISORY. ⚠️ `numberKey` strips non-digits so `3.5` and `35` collide — its own comment calls it a heuristic. **Do not also port `checkEnResidue`** (the §C67 over-reporter).

- [ ] **Steps 1–5** as before, with the A3 trio as the SHOULD-TRIP/MUST-NOT-TRIP fixtures.

---

## Task 11: Tier 3 — R1/R3/R5 wrap, R2 expose, R4's four defects

**Files:** Create `tools/lib/remt-checks-output.js`; modify `tools/audit-render-output.js`; tests alongside.

| id | state | build |
|---|---|---|
| **R1** | ✅ BUILT | wrap `cnxml-fidelity-check.js` (`--book --chapter --module`, and Plan A's zero-examined guard is on `main`). ⚠️ Allowlist match is exact `moduleId+tag+diff`; a re-MT moves diffs, so benign losses resurface as "new" and a still-matching entry masks a genuinely new defect. |
| **R3** | ✅ BUILT | `experiments/cnxml-validation-gate/validate-cnxml.js`, **one file per invocation** — that is what structurally defeats jing's batch-abort fail-quiet. `--allowlist allowlist.recommended.json` is effectively mandatory. |
| **R5** | ✅ BUILT | wrap `cnxml-linguistic-check.js`. **WARN only** — fires on 68 of 149 chemistry modules (~46%), far over the 5% blocking bar. |
| **R2** | ⚠️ PARTIAL | `cnxml-inject.js` computes `attrMismatches` but exposes it **only as prose on stderr**. Add it to a `--json` payload. **Read the output, never the exit code** — `complete` is computed from four conditions and `attrMismatches` is deliberately excluded. |

📐 **THE `--json` GAP IS EXACTLY THREE IDS ACROSS THREE TOOLS — R1, R2, R5** *(corrected 2026-08-24; an earlier count of "six ids across five tools" was inflated)*. **G1 needs none**: `findGlossaryCollisions` is a pure ESM export returning a structured object, so the driver imports it — `validate-glossary.js` is only its CLI wrapper. **K1/K2 need none**: their tool is chapter-only *by design* and sits in Tier 4, so it is never a per-module driver invocation. Counting either against a per-module achievability claim overstates the blocker.
| **R4** | ❌ NOT_BUILT | `audit-render-output.js` is untouched by Plan A and has **four** defects, two of them found in this audit and in no spec. |

🔴 **R4's four defects, each needing its own fix and its own test:**
1. **Exit keys on `totalErrors` only** (`:543`) — the ID-preservation issue is pushed with `severity: 'warning'` (`:367-373`), so a real ID drop prints `PASS with warnings` and exits 0. **Promote it.**
2. **`--chapter 0` is rejected** (`:476 if (!args.chapter)`) — the chapter-0 truthiness bug, **still live here**. Plan A Task 1 fixed four tools; this is a **fifth site it never enumerated**. Chemistry ch00 holds `m68662`, the only A5 fixture, and is unauditable today. Use `chapterProvided` from `tools/lib/parseArgs.js:80-84`, as Plan A did elsewhere.
3. **A `--module` that matches nothing reports success** — `--module m99999` printed `Audit complete: 1 module(s), 0 issue(s)` / `Result: PASS`, exit 0; the per-module error path at `:490-493` `continue`s without touching `totalErrors`.
4. **`--book` defaults to `efnafraedi-2e`** (`:34-40`) — omit it and you audit chemistry whichever book you meant.

- [ ] **Steps 1–5:** one failing test per defect *first* (each must go red against today's tool), then fix, then wrap.

---

## Task 12: Tier 4 — K1, K2, K3

**Files:** Create `tools/lib/remt-checks-chapter.js`; test alongside.

| id | state | build |
|---|---|---|
| **K1** | ⚠️ PARTIAL | shape-drift vs `render-fidelity-baseline.json`. 🔴 **"No baseline" MUST print as SKIPPED, never as clean** — it currently prints `Total findings: 0`, and from the wrong cwd it prints the same `0` having read **zero files** (§C60). Baselines exist for chemistry ch10-21+appendices and organic (captured at runbook 0.2) — **inert for chemistry ch1-9**. WARN. |
| **K2** | ⚠️ PARTIAL | the **baseline-free** cross-stage `>=` invariant in the same tool — this half works everywhere. BLOCKING. Fixture: physics ch04, 554 `<m:math>` → 546 (§C64). |
| **K3** | ❌ NOT_BUILT | the §C9 **producer** side shipped (`tools/lib/slug-map.js`, `publication-reconcile.js`, pinned by two test files); **the check does not exist.** |

🔴 **K3 must snapshot BEFORE the render, not after.** The slug map is **not regenerable** — entries are recorded once, at the moment a prune happens. A check that runs after the fact and finds an unaccounted rename is reporting information that is already gone. Two constraints from CLAUDE.md the check must encode: read the **track-qualified** filename (a shared `slug-map.json` collides across tracks — a `faithful` map overwrites `mt-preview`'s with `force: true`), and **skip `to === from`**.

- [ ] **Steps 1–5** as before.

---

## Task 13: `--self-test` and the base-rate sweep

**Files:** Modify `tools/remt-battery.js`; create `tools/__tests__/remt-battery-selftest.test.js`

🔴 **Copy the STRUCTURE of `server/scripts/verify-b4b0-gates.js`, not the idea.** Its comment at `:289-301` records why: the first version gave `--self-test` its own hand-written `detect` predicate, and **deleting gate 1's assertion left the gate reporting PASS on a live violation while the self-test still printed DETECTED**; gate 2's case was a tautology true on every input. **`--self-test` must plant the defective state and invoke THE REAL GATE FUNCTION.**

- [ ] **Step 1: the meta-test — the self-test must itself be shown to fail**

```javascript
it('the self-test goes RED when a gate is neutered — it is not a tautology', async () => {
  const neutered = defineCheck({ id: 'E4', tier: 1, blocking: true, version: 1,
    run: () => ({ verdict: VERDICT.PASS, examined: 99, findings: [] }) });   // always passes
  const report = await selfTest({ overrides: [neutered] });
  expect(report.failures.map((f) => f.id)).toContain('E4');
});
```

- [ ] **Step 2: the base-rate sweep** — `--sweep` runs every check over all **220** existing EN/IS pairs (chemistry **170**, organic **50**) and prints, per check: verdict distribution, base rate, and **units examined**.

**Acceptance for the sweep, and it is not "everything green":**
- **R5 ≈ 46%** and **raw A5 ≈ 23.5%** must appear over the 5% bar — they are the two the spec already disqualifies from blocking. Seeing them confirms the sweep is measuring, not reporting zeros.
- **E5 must show ≈100% FAIL** — the committed vintage predates §C81 (measured: 0 alt SEG markers against 21,536 / 7,309 total).
- **A2(a), A4, A8 must show `SKIPPED`, `examined: 0`** — no module carries a run record.
- ⚠️ **State in the same breath as any pass rate:** the corpus is **chemistry-shaped** (170 of 220), every pair predates the current extractor, and the loop re-extracts first.

- [ ] **Steps 3–5:** implement → run → commit.

---

## Self-review

**Spec coverage.** Every id in the battery spec's §1 tables has a task: Tier 0 → Task 7 · Tier 1 → Tasks 3–6 · Tier 2 → Tasks 8–10 · Tier 3 → Task 11 · Tier 4 → Task 12 · validation plan §4 → Task 13. Spec §5's items map: 1 ✅ done · 2 ✅ done (Plan A) · 3 → Task 10's A5 sequencing note · 4 → Task 10 · 5 → Task 11 defect 2 · **6 → Plan C** · 7 → Tasks 11/12 · **8 VOID** · 9 → Task 6 · 10 ✅ done · 11 ✅ done.

**Deliberately NOT in Plan B:** `E8` (the extraction fingerprint), the driver, the ledger, quarantine/staleness, halt thresholds, and the glossary-arm decision procedure. All are **Plan C**.

**Type consistency.** `CheckResult` is `{id, tier, blocking, version, verdict, examined, findings, message}` in Task 1 and used unchanged in Tasks 2–13. `VERDICT` is the frozen enum throughout. Gate constructors are `defineCheck`, registration is `registerChecks`, execution is `runCheck` — no synonyms.

**Known gaps stated rather than hidden:** roughly half the battery has **no natural known-bad fixture** (A2, A4, A7, E3, R1, R3, and the SPACE/BR/`math`/EQ marker types). By the spec's own derivation rule those stay **advisory or synthetic-only** until one exists. Do not promote them to blocking to make a sweep look tidy.
