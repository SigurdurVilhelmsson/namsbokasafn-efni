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
