# §C82 Plan C — the re-MT loop driver, the ledger, and the extraction fingerprint

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ## 🔴 REVISED 2026-08-27 — THE ctx LOADER WAS MISSING FROM THIS PLAN, AND IS NOW TASKS N1-N3.
> **This plan as first written named `loader`, `ctx`, `CheckContext` and `buildCtx` ZERO times**
> (measured; the file holds no NUL bytes and plain `grep` agrees with `grep -a`, so those zeros
> are real and not an artefact of a blinded search). Its file-structure table named five files,
> **none a loader** — while its tests passed verdicts straight in (`tier1: failing('E2')`).
> ▶ **So every box in this plan could be ticked, with every test green, and no check would ever
> have seen real data.** The battery would have been wired to nothing.
>
> **Design record:** `docs/superpowers/specs/2026-08-27-c82-ctx-loader-design.md` — **read its
> ⏱ AMENDMENT block first; it is newer than the sections beneath it and adds a FOURTH invariant.**
> **Ruling:** §C82 **L136** (Option C, per-unit-kind population; the MODULE as the unit).
>
> **What changed here:** three new tasks (**N1** the loader · **N2** the invariants as tests ·
> **N3** the Tier-1 partial-state sweep), inserted between Tasks 4 and 5, and **seven amendments**
> to the existing eleven. The eleven tasks' driver logic is structurally sound and is NOT rewritten.
>
> ⚠️ **The revision was applied HERE rather than in a companion document on purpose.** CLAUDE.md
> § *One source of truth* records that the first attempt to fix this repo's drift problem
> *"declared a **second** source of truth and said 'consult both' — that is the same failure one
> level up, and it produced a live disagreement **within one day**."* **This file is the plan.**

**Goal:** Build `remt-loop` — the driver that sequences one module through extract → gate → pay → gate → inject/render → record, halts on a blocking failure, and keeps `books/<slug>/remt-ledger.json` as the run's only state. Plus the extraction fingerprint that makes [LEAD] decision ① (quarantine) mechanical.

**Architecture:** A CommonJS-or-ESM single-file driver shaped exactly like `server/scripts/verify-b4b0-gates.js`: gates are **plain functions**, `record()` collects verdicts, `--self-test` plants a defective state and invokes **the real gate**, exit `0`/`1`/`2`. The driver **sequences and records; it never judges** — every verdict comes from Plan B's battery. State lives in one committed JSON ledger per book.

**Tech Stack:** Node 22 (`.nvmrc`), ESM (`tools/` is `"type": "module"`), Vitest, `node:crypto`. No new dependencies — in particular **no `acorn`, `es-module-lexer`, `madge` or `dependency-cruiser`** (measured: none is present, and the import graph we need is small enough to walk with a regex over `import`/`from` lines plus `node:` filtering).

**Spec:**
- [`docs/superpowers/specs/2026-08-13-gated-per-module-remt-loop-design.md`](../specs/2026-08-13-gated-per-module-remt-loop-design.md) — §4 the life of one module, §5 state, §6 failure handling.
- [`docs/superpowers/specs/2026-08-13-remt-check-battery.md`](../specs/2026-08-13-remt-check-battery.md) — read its banner AMENDMENT block; item 2 binds this plan directly.

**Companion plan:** [§C82 Plan B](2026-08-24-c82-plan-b-check-battery.md) — the battery. **Plan B must land first**; Plan C imports its registry and calls nothing else to reach a verdict.

**Procedure this serves:** [`docs/plans/2026-08-23-clean-break-re-mt-runbook.md`](../../plans/2026-08-23-clean-break-re-mt-runbook.md) step 3.1.

---

## Global Constraints

Every task's requirements implicitly include this section.

### Scope and budget — the numbers the driver enforces

| | |
|---|---|
| Books | **`efnafraedi-2e`** (149 source modules) and **`lifraen-efnafraedi`** (342). Nothing else. |
| Budget | ceiling **65,583 ISK**, expectation **≈51,267** (§C80, [LEAD]-approved 2026-08-22) |
| Abort: cost | cumulative ISK > **125%** of the book's estimate |
| Abort: failures | **3** consecutive module failures |
| Abort: writes | **any** attempted write outside the expected trees — **no tolerance** |
| Shakedown | **organic first**, not chemistry — a broken loop costs less to discover there, *and* organic carries live positive controls chemistry lacks |

🔴 **THE BINDING CONSTRAINT IS NOT ISK — IT IS EDITORIAL CAPACITY, AND THE DRIVER MUST BE BUILT FOR IT.** Organic's review burden goes **643 → 10,608** segments; the two-book total is **33,074**, against **368 segments applied, ever**. ▶ **The loop will run for weeks, paused most of the time.** Resumability is not a nicety: `remt-loop next <book>` must be safe to invoke on a cold machine, days apart, with the ledger as the only memory.

### What the driver may never do

1. **The paid step is attempted ONCE per module per invocation.** Free steps may retry; **MT never does.** A re-run is always an explicit human act. There is no auto-retry, no backoff-and-repeat, no "it was probably a blip".
2. **The driver never judges.** Every verdict comes from Plan B's `runCheck()`. If a condition matters and no check covers it, **add the check to Plan B** — do not inline a predicate here. (This is why `verify-b4b0-gates.js` is the model: its own comment at `:289-301` records a `--self-test` with a hand-written predicate reporting DETECTED while the real gate reported PASS on a live violation.)
3. **Never infer a pass from exit code 0.** `scan-residue.js` and `cnxml-render-fidelity-check.js` exit 0 *with* findings. Read `--json`, apply the battery's threshold. The model is `server/services/publicationService.js:124-184`, whose defining property is that `child.on('close', …)` **ignores the exit code entirely**.
4. **`examined: 0` is a failure, not a pass.** The battery spec's amendment item 2 is binding on this plan by name: *"Any driver this spec describes must still treat 'examined 0 units' as a failure in its own right."* Plan B's `runCheck()` already converts a zero-examined PASS to `SKIPPED`; **the driver must treat a `SKIPPED` blocking check as a halt.**
5. **Use a hand-rolled arg parser, not `tools/lib/parseArgs.js`.** 🔴 `parseArgs` **silently drops unknown flags** (§C83), so a mistyped `--module` on a paid run is a no-op that translates the whole book. Copy `verify-b4b0-gates.js:110`, which calls `usage()` on an unrecognised argument.

### Repo hazards this driver runs straight into

- 🔴 **`lint-staged`'s pre-commit hook STASHES UNSTAGED TRACKED CHANGES.** The ledger is a tracked data file, so an edit made in one step and committed in another can be **silently dropped**. ▶ **The loop commits the ledger in the SAME step that writes it.** Non-negotiable.
- 🔴 **Pushing to `main` strands prod's content backup.** ▶ **Batch commits and push at BOOK boundaries only, coordinated with a deploy — never per module.**
- 🔴 **`cnxml-extract.js` is NOT lock-aware while `api-translate.js` IS (§C110).** A surviving `.locked` marker means extract re-extracts while MT skips — **a split vintage inside one module, which nothing reports.** The 7 chemistry markers were cleared 2026-08-24 (`cc725a62`), but **that commit must reach prod before the run**. ▶ **E9 must DETECT the lock state every module. Never assume Phase 2.1 was done** — the runbook marked it ✅ while all 8 markers were still on disk.
- ⚠️ **Chapter 0 is falsy.** Fixed in four tools by Plan A; **still live in `tools/audit-render-output.js:476`** (Plan B Task 11 fixes it). Chemistry ch00 holds `m68662`. The driver must pass chapter 0 through correctly and must not use `if (!chapter)`.
- ⚠️ **`api-translate.js --module` requires `--chapter`** (`:1454`). Verified present and consumed: `--module`, `--force`, `--dry-run`, `--no-glossary` are all real flags in its parseArgs spec.
- ⚠️ **A bare `--dry-run` reports `~0 ISK` once output exists** — a wrong answer that looks like an answer. The pre-flight estimate must be `--force --dry-run`.
- 🔴 **`source-write-guard` AND PROV-1 — THIS PLAN NAMED NEITHER (0 occurrences of each, measured).** `tools/__tests__/source-write-guard.test.js` nets **top-level `tools/*.js` only** and forces a reviewer to classify every top-level tool that names the read-only source tree. Its ALLOW set is **23 entries — 20 read-only + THREE writers** (`download-source.js`, `generate-source-manifest.js`, `resolve-os-embed.js`; the "only guarded CNXML **writer**" comment on the first is easy to misread as "the only writer"). ▶ **`tools/remt-ctx.js` trips this guard ON PURPOSE** — the red is the review prompt it is. ⚠️ **Do NOT add it to the ALLOW set before the read-only classification is TRUE**; listing a non-toucher dilutes the tripwire for the one moment it exists to catch. ⚠️ **And the classification is a reviewer's call, never self-approved.**
- 🔴 **TIER 0's INPUT IS REGENERATED BY AN UNATTENDED 2-HOURLY CRON, AND EVERY DOCUMENT IN THIS CAMPAIGN SAYS OTHERWISE.** The standing line — *"Tier 0 is the only tier whose input the re-MT loop does not regenerate"* — is **literally true and its implication runs only ONE way.** Measured: Tier 0's four ctx keys all resolve to **one** physical file per book, `books/<slug>/glossary/glossary-unified.json`, and in the four loop tools' transitive closures it appears exactly twice, **both reads** (`api-translate.js:893-900`, `math-label-substitute.js:141-146`). **But `scripts/git-backup.sh` regenerates it every two hours, unforced** (`:141` invokes `server/scripts/export-terminology.js`; `:169` stages `books/*/glossary/`). ▶ **So: a Tier-0 FAIL will not be fixed by the run — correct, it is a precondition. But a Tier-0 PASS CAN BE INVALIDATED MID-RUN.** This plan's own Global Constraints say the loop *"will run for weeks, paused most of the time"* — roughly **84 cron ticks a week**. ▶ **THE LEDGER MUST RECORD THE GLOSSARY'S CONTENT HASH BESIDE EACH MODULE'S TIER-0 VERDICT** (Task 3 amendment), so a verdict can be told from a stale one. **Do not add a fetch or a rebase to that cron to "fix" this** — CLAUDE.md forbids it, and the cron is also the only channel by which a run's own content reaches the remote.
- ⚠️ **Resolve every path against `import.meta.url`/`__dirname`, never `process.cwd()`.** A wrong cwd is exactly K1's blind spot: it prints `Total findings: 0` having read zero files (§C60).

### File structure

| File | Responsibility |
|---|---|
| **`tools/remt-ctx.js`** | 🆕 **THE LOADER (Tasks N1-N2).** Reads the world and builds one `CheckContext` per unit for **Tier 0 and Tier 1**. **TOP-LEVEL ON PURPOSE** — `tools/__tests__/source-write-guard.test.js` nets top-level `tools/*.js` **only** (proved structurally: its `readdirSync` is non-recursive and `.endsWith('.js')` drops every directory, so `lib` never survives the filter). Placing it here forces a reviewer to classify it. ▶ **Second and better reason: if the loader owns ALL source reading, `tools/remt-loop.js` never touches the source tree and stays out of the guard's scope entirely.** ⚠️ The guard's blind spot is LIVE — **12 files under `tools/lib/` name `01-source` and are invisible to it, three of them the battery's own check modules.** |
| `tools/lib/import-graph.js` | walk a module's transitive local ESM imports → a sorted file list |
| `tools/lib/extraction-fingerprint.js` | hash that file set → `{fingerprint, files, bytes}` |
| `tools/lib/remt-ledger.js` | read / update / atomically write `books/<slug>/remt-ledger.json`; the status enum; quarantine-on-fingerprint-change |
| `tools/remt-loop.js` | the driver CLI: `next`, `status`, `--self-test` |
| **`tools/__tests__/remt-ctx.test.js`** | 🆕 the loader's own unit tests (Task N1) |
| **`tools/__tests__/remt-ctx-invariants.test.js`** | 🆕 **I1 · I2 · I3 · I4 (Task N2)** — the inverse-direction gate that does not exist today. `remt-ctx-contract.test.js` enforces only *checks ⊆ contract*; **nothing enforces loader ⊇ what checks require.** |
| `tools/__tests__/import-graph.test.js`, `extraction-fingerprint.test.js`, `remt-ledger.test.js`, `remt-loop-*.test.js` | tests |

---

## Task 1: The ESM import-graph walker

**Files:**
- Create: `tools/lib/import-graph.js`
- Test: `tools/__tests__/import-graph.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `localImportGraph(entryPath, {repoRoot}) => string[]` — repo-relative paths, **sorted**, entry included, transitively closed, **excluding** `node:*` and bare package specifiers.

🔴 **Why this is its own task.** The design forbids a hand-listed file set: *"derived from the real import graph of `cnxml-extract.js`, never hand-listed. A hand-maintained list is the defect class this repo has logged repeatedly (§C75, §C76)."* And **nothing in this repo walks ESM imports** — measured: no `acorn`, `es-module-lexer`, `madge` or `dependency-cruiser`. So this is a build, not a wiring job.

⚠️ **A regex walker is adequate HERE and would not be in general.** The graph is `tools/cnxml-extract.js` plus `tools/lib/*`, all first-party, all static `import` at the top of the file. **It must fail LOUD on anything it cannot resolve** rather than silently omitting it — an omitted file is a fingerprint that does not change when it should, which is decision ①'s failure mode.

- [ ] **Step 1: Write the failing test**

```javascript
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { localImportGraph } from '../lib/import-graph.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

describe('localImportGraph', () => {
  it('includes the entry and its transitive local imports', () => {
    const g = localImportGraph(path.join(ROOT, 'tools/cnxml-extract.js'), { repoRoot: ROOT });
    expect(g).toContain('tools/cnxml-extract.js');
    expect(g).toContain('tools/lib/cnxml-parser.js');   // direct
    expect(g).toContain('tools/lib/alt-segments.js');   // direct
    expect(g).toContain('tools/lib/mathml-to-latex.js');
  });

  it('excludes node: builtins and bare package specifiers', () => {
    const g = localImportGraph(path.join(ROOT, 'tools/cnxml-extract.js'), { repoRoot: ROOT });
    expect(g.some((f) => f.startsWith('node:'))).toBe(false);
    expect(g.some((f) => f.includes('node_modules'))).toBe(false);
  });

  it('is SORTED and deduplicated — the hash must not depend on walk order', () => {
    const g = localImportGraph(path.join(ROOT, 'tools/cnxml-extract.js'), { repoRoot: ROOT });
    expect(g).toEqual([...new Set(g)].sort());
  });

  it('resolves .cjs siblings — mt-lock.cjs is a real import of the extractor', () => {
    const g = localImportGraph(path.join(ROOT, 'tools/cnxml-extract.js'), { repoRoot: ROOT });
    expect(g).toContain('tools/lib/mt-lock.cjs');
  });

  it('THROWS on an unresolvable local specifier — it must never silently omit', () => {
    // A silently-omitted file is a fingerprint that fails to change when the code
    // it hashes changes. That is decision ①'s exact failure mode.
    const dir = mkTmp({ 'a.js': "import './missing.js';\n" });
    expect(() => localImportGraph(path.join(dir, 'a.js'), { repoRoot: dir })).toThrow(/missing\.js/);
  });

  it('terminates on a cycle', () => {
    const dir = mkTmp({ 'a.js': "import './b.js';\n", 'b.js': "import './a.js';\n" });
    expect(localImportGraph(path.join(dir, 'a.js'), { repoRoot: dir })).toEqual(['a.js', 'b.js']);
  });
});
```

`mkTmp(files)` is a four-line helper writing an object of `{name: contents}` into `fs.mkdtempSync`.

✅ **THE WALKER WAS PROTOTYPED AGAINST THE REAL GRAPH BEFORE THIS PLAN WAS WRITTEN — these are measured, not predicted.** `tools/cnxml-extract.js` closes over **8 files / 178,089 bytes**, with **0 unresolved specifiers**:

```
tools/cnxml-extract.js        tools/lib/mathml-to-latex.js
tools/lib/alt-segments.js     tools/lib/mt-lock.cjs
tools/lib/chapter-modules.js  tools/lib/parseArgs.js
tools/lib/cnxml-parser.js     tools/lib/safeWrite.js
```

Three things this confirms, each of which a test above depends on:
- **`.cjs` resolves** — `mt-lock.cjs` is a real import (`cnxml-extract.js:44`), so the graph is not ESM-only.
- **The multi-line `import { a, b, c } from '…'` form is matched** — `cnxml-parser.js` reaches the closure only through one, which is why the pattern spans lines rather than anchoring to a single one.
- 🔑 **`cnxml-render.js` is NOT in the graph**, which is exactly what makes the "does not change when a file outside the graph changes" test meaningful rather than decorative.

- [ ] **Step 2: Run it and confirm it fails** — `npx vitest run tools/__tests__/import-graph.test.js` → cannot resolve `../lib/import-graph.js`.

- [ ] **Step 3: Implement**

```javascript
/**
 * import-graph.js — the transitive LOCAL ESM import closure of one entry file.
 *
 * 🔴 EXISTS BECAUSE A HAND-LISTED FILE SET IS THE DEFECT CLASS THIS REPO KEEPS
 * LOGGING (§C75, §C76, and CLAUDE.md's own "do not trust any enumeration here —
 * re-derive it"). The §C82 extraction fingerprint hashes what this returns, so a
 * file that belongs in the graph and is missing from it produces a fingerprint
 * that does NOT change when the extractor changes — and decision ①'s quarantine
 * silently stops working.
 *
 * ⚠️ REGEX, DELIBERATELY, AND ONLY BECAUSE OF THIS GRAPH'S SHAPE: first-party
 * files, static top-of-file imports, no dynamic specifiers. It FAILS LOUD on
 * anything it cannot resolve rather than skipping it. Do not reuse it as a
 * general-purpose module analyser.
 */
import fs from 'node:fs';
import path from 'node:path';

const SPEC = /^\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;

export function localImportGraph(entryPath, { repoRoot }) {
  const seen = new Set();
  const stack = [path.resolve(entryPath)];
  while (stack.length) {
    const abs = stack.pop();
    const rel = path.relative(repoRoot, abs);
    if (seen.has(rel)) continue;          // cycle-safe: visit each file once
    seen.add(rel);
    const src = fs.readFileSync(abs, 'utf8');
    SPEC.lastIndex = 0;
    let m;
    while ((m = SPEC.exec(src)) !== null) {
      const spec = m[1] || m[2];
      if (!spec || !spec.startsWith('.')) continue;   // node: builtins + bare packages
      const target = path.resolve(path.dirname(abs), spec);
      if (!fs.existsSync(target)) {
        throw new Error(`import-graph: ${rel} imports '${spec}' which does not resolve (${target})`);
      }
      stack.push(target);
    }
  }
  return [...seen].sort();
}
```

- [ ] **Step 4: Run and confirm PASS** — 6 tests.
- [ ] **Step 5: Commit** — `git commit -m "feat(C82-C): transitive local ESM import-graph walker, fail-loud on unresolvable"`

---

## Task 2: The extraction fingerprint

**Files:**
- Create: `tools/lib/extraction-fingerprint.js`
- Test: `tools/__tests__/extraction-fingerprint.test.js`

**Interfaces:**
- Consumes: `localImportGraph` (Task 1).
- Produces: `extractionFingerprint({repoRoot}) => {fingerprint: string, files: string[], fileCount: number, bytes: number}`.

🔴 **RETURN THE NON-VACUITY COUNTERS ALONGSIDE THE DIGEST — this is copied from the reference, and the reason is exact.** `verify-b4b0-gates.js`'s `oldInflectionsDigest` returns `{digest, nonNull, rows}` because **the digest alone cannot distinguish "unchanged" from "zero rows".** A fingerprint over an empty file list is a stable, plausible, meaningless hash. `fileCount` and `bytes` are what make it falsifiable.

- [ ] **Step 1: Write the failing test**

```javascript
it('is stable across two calls and covers a plausible file count', () => {
  const a = extractionFingerprint({ repoRoot: ROOT });
  const b = extractionFingerprint({ repoRoot: ROOT });
  expect(a.fingerprint).toBe(b.fingerprint);
  expect(a.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  // 🔴 THE VACUITY CONTROL. An empty graph hashes to a perfectly stable value.
  expect(a.fileCount).toBeGreaterThan(5);        // measured today: 8
  expect(a.bytes).toBeGreaterThan(50_000);       // measured today: 178,089
});

it('CHANGES when a file in the graph changes', () => {
  const before = extractionFingerprint({ repoRoot: ROOT }).fingerprint;
  const dir = copyTreeToTmp(ROOT, ['tools']);           // scratch copy, never the real tree
  fs.appendFileSync(path.join(dir, 'tools/lib/alt-segments.js'), '\n// touch\n');
  expect(extractionFingerprint({ repoRoot: dir }).fingerprint).not.toBe(before);
});

it('does NOT change when a file OUTSIDE the graph changes', () => {
  // The discriminator. A fingerprint that moves on any repo edit quarantines
  // everything on every commit and decision ① becomes noise.
  const dir = copyTreeToTmp(ROOT, ['tools']);
  const a = extractionFingerprint({ repoRoot: dir }).fingerprint;
  fs.appendFileSync(path.join(dir, 'tools/cnxml-render.js'), '\n// touch\n');
  expect(extractionFingerprint({ repoRoot: dir }).fingerprint).toBe(a);
});
```

⚠️ **The third test is the one that earns the fingerprint its keep.** `cnxml-render.js` is not in the extractor's import graph, so touching it must not quarantine a book.

- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement** — `localImportGraph(tools/cnxml-extract.js)`, then a single sha256 over `path + '\0' + contents` per file in sorted order, truncated to 16 hex. ⚠️ **A raw NUL separator here is deliberate and load-bearing** — the same idiom `verify-b4b0-gates.js`'s sibling uses; do not "clean" it, and note that plain `grep` goes blind on files containing one (use `grep -a`).
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit.**

---
## Task 3: The ledger

> ### ⏱ AMENDMENT 2026-08-27 — the ledger must record the GLOSSARY HASH beside each Tier-0 verdict
> **Tier 0's input is regenerated by an unattended 2-hourly cron**, which every other document
> in this campaign implicitly denies. Measured: Tier 0's four ctx keys all resolve to ONE file
> per book (`books/<slug>/glossary/glossary-unified.json`); the re-MT loop's four tools only
> **read** it; but `scripts/git-backup.sh` **regenerates it every two hours, unforced**
> (`:141` → `server/scripts/export-terminology.js`, `:169` stages `books/*/glossary/`).
> ▶ **A Tier-0 FAIL is a precondition the run cannot fix — correct. But a Tier-0 PASS can be
> INVALIDATED MID-RUN**, and this plan's Global Constraints say the loop *"will run for weeks,
> paused most of the time"* (≈84 cron ticks a week).
> ▶ **Add `glossaryHash` to the per-module ledger record**, written in the same step as the
> verdict, so a stale Tier-0 PASS is distinguishable from a live one. This is the same
> discipline the extraction fingerprint already applies to the extractor's CODE, extended to
> Tier 0's DATA. ⚠️ **Do not add a fetch or a rebase to that cron to "fix" it** — CLAUDE.md
> forbids it, and it is also the only channel by which the run's own content reaches the remote.

**Files:**
- Create: `tools/lib/remt-ledger.js`
- Test: `tools/__tests__/remt-ledger.test.js`

**Interfaces:**
- Produces: `STATUS` (frozen enum), `readLedger(bookSlug, {repoRoot})`, `updateModule(ledger, moduleId, patch)`, `writeLedger(ledger, bookSlug, {repoRoot})` (atomic), `quarantineStale(ledger, currentFingerprint)`.

**Design §5 requires, verbatim, per module:** `verdict` · glossary `arm` · `isk` · `status` ∈ `pending | clean | stale | failed | skipped-locked` · `extractionFingerprint` · **the version of every gate that judged it**.

**And three things it must NOT be, also §5:**
1. **not a third pipeline-status model** — two already exist and CLAUDE.md warns they silently disagree. The ledger records *the run*, never the pipeline stage.
2. **not a restatement of scope** — scope is §C80's.
3. **not silent about skips** — a module whose `.locked` marker survives records `skipped-locked`, never nothing.

🔴 **`gateVersions` is not bookkeeping.** Design §5: *"without a per-module record of which instrument version judged it, a mid-campaign fix makes earlier green verdicts unfalsifiable and the quarantine cannot be scoped."* Store the whole `{checkId: version}` map that Plan B's results carry.

- [ ] **Step 1: Write the failing test**

```javascript
it('a fingerprint change flips every CLEAN module to STALE and leaves the others alone', () => {
  const led = { fingerprint: 'aaaa', modules: {
    m1: { status: STATUS.CLEAN,  extractionFingerprint: 'aaaa' },
    m2: { status: STATUS.FAILED, extractionFingerprint: 'aaaa' },
    m3: { status: STATUS.CLEAN,  extractionFingerprint: 'bbbb' },
    m4: { status: STATUS.SKIPPED_LOCKED, extractionFingerprint: 'aaaa' },
  } };
  const out = quarantineStale(led, 'bbbb');
  expect(out.modules.m1.status).toBe(STATUS.STALE);   // cleared under the old vintage
  expect(out.modules.m2.status).toBe(STATUS.FAILED);  // a failure is not made stale
  expect(out.modules.m3.status).toBe(STATUS.CLEAN);   // already on the new vintage
  expect(out.modules.m4.status).toBe(STATUS.SKIPPED_LOCKED);
});

it('records a skip explicitly — never by omission', () => {
  const led = updateModule(emptyLedger('efnafraedi-2e'), 'm68663', { status: STATUS.SKIPPED_LOCKED, reason: '.locked present' });
  expect(led.modules.m68663.status).toBe(STATUS.SKIPPED_LOCKED);
  expect(led.modules.m68663.reason).toMatch(/locked/);
});

it('carries the gate versions that judged the module', () => {
  const led = updateModule(emptyLedger('x'), 'm1', { gateVersions: { E4: 1, A3: 2 } });
  expect(led.modules.m1.gateVersions).toEqual({ E4: 1, A3: 2 });
});

it('writes atomically — a crashed write must not leave a truncated ledger', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-'));
  fs.mkdirSync(path.join(dir, 'books/x'), { recursive: true });
  writeLedger(emptyLedger('x'), 'x', { repoRoot: dir });
  expect(fs.existsSync(path.join(dir, 'books/x/remt-ledger.json'))).toBe(true);
  expect(fs.readdirSync(path.join(dir, 'books/x')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
});

it('rejects an unknown status — the enum is closed', () => {
  expect(() => updateModule(emptyLedger('x'), 'm1', { status: 'done' })).toThrow(/status/);
});
```

- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement.** `writeLedger` is `.tmp` + `fs.renameSync` (the same atomic idiom `slug-map.js` uses). `STATUS` is `Object.freeze`. `quarantineStale` **only** touches `CLEAN` modules carrying the *old* fingerprint — a `FAILED` module is already not clean, and re-labelling it `STALE` would lose why it failed.
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit.**

---

## Task 4: The driver skeleton — `verify-b4b0-gates.js` shape, exit 0/1/2

**Files:**
- Create: `tools/remt-loop.js`
- Test: `tools/__tests__/remt-loop-cli.test.js`

**Interfaces:**
- Consumes: `REGISTRY`/`runCheck`/`VERDICT` (Plan B Task 1), `runTier` (Plan B Task 2), the ledger (Task 3), the fingerprint (Task 2).
- Produces: `main(argv)`, `parseArgs(argv)`, `record(id, verdict, measured)`, `usage(msg)`; subcommands `next <book>` and `status <book>`.

**Copy this structure from `server/scripts/verify-b4b0-gates.js`** (804 lines, read it before starting):

| element | reference | why it matters here |
|---|---|---|
| file docstring carrying the caveats the script also **prints at runtime** | `:1-45` | evidence and disclaimer cannot be separated |
| `const results = []` + `record(id, verdict, measured)` — pushes, prints one line, returns `verdict === 'PASS'` | `:86-91` | one place decides what a verdict looks like |
| `usage(msg)` → `process.exit(2)` | — | 2 is usage/environment, distinct from 1 = a gate failed |
| **hand-rolled `parseArgs`** calling `usage()` on an unrecognised argument | `:110` | 🔴 **NOT `tools/lib/parseArgs.js`** — it silently drops unknown flags, and a mistyped `--module` on a paid run translates the whole book |
| fail-fast at **exactly two** points, everything else runs regardless | `:425`, `:445` | here: pre-flight and Tier 1. A Tier 3 failure must not suppress Tier 4's report |
| `if (require.main === module)` + `module.exports` | `:797` | importable for tests without executing |

- [ ] **Step 1: Write the failing test**

```javascript
it('exits 2 on an unrecognised flag — never silently ignores it', async () => {
  await expect(main(['next', 'efnafraedi-2e', '--moduel', 'm68663'])).rejects.toMatchObject({ exitCode: 2 });
});

it('exits 2 when the book is out of scope', async () => {
  // §C80: two books. A typo must not start a paid run against a withdrawn book.
  await expect(main(['next', 'edlisfraedi-2e'])).rejects.toMatchObject({ exitCode: 2 });
});

it('status is read-only — it never writes the ledger', async () => {
  const before = fs.statSync(ledgerPath).mtimeMs;
  await main(['status', 'efnafraedi-2e']);
  expect(fs.statSync(ledgerPath).mtimeMs).toBe(before);
});

it('--dry-run performs no paid step and says so', async () => {
  const r = await main(['next', 'lifraen-efnafraedi', '--dry-run']);
  expect(r.paidStepAttempted).toBe(false);
});
```

- [ ] **Steps 2–5:** red → implement (stub every phase to `throw new Error('not implemented')` so no phase can silently no-op) → green → commit.

---

## Task N1: `tools/remt-ctx.js` — the ctx loader (Tier 0 + Tier 1)

**Files:**
- Create: `tools/remt-ctx.js` (top level — see the file-structure table for why)
- Test: `tools/__tests__/remt-ctx.test.js`

**Interfaces:**
- Consumes: `REGISTRY`, `runCheck` from `tools/lib/remt-battery.js`; `isMtLocked` from `tools/lib/mt-lock.cjs:14`.
- Produces, for Task N2, Task 5, Task 6 and Task 8:
  - `unitsFor(book) -> Unit[]`, `Unit = {book, chapter, module, kind}`, `kind ∈ UNIT_KINDS`
  - `loadTier0Ctx(unit) -> {ctx, provenance}`
  - `loadTier1Ctx(unit, runState) -> {ctx, provenance}`
  - `judgeableIds(tier, kind) -> string[]` (non-empty; throws if it would be empty)
  - `CTX_CAPABILITY`, `UNIT_KINDS`
  - `Provenance = {unit, sources: {[ctxKey]: {path, mtime, bytes}}, extractRunStartedAt}`

**Scope:** Tier 0 and Tier 1 only — **13 checks, 11 of the battery's 19 blocking**, and exactly the set that runs **before money is spent**. Tiers 2-4 are deferred; see the Task 8 amendment for what that leaves open.

🔴 **BUILD IT TO THE `@typedef` AT `tools/remt-battery.js:22-353`, NOT TO ANY LIST IN THIS PLAN.** That typedef states, per key, where the value comes from, **which loader function to use**, and the tri-state hazards. It is the contract. **This task is closer to transcription than to design.** ⚠️ **And do not trust a key list you derive with `grep 'ctx\.'`** — see Step 3.

⚠️ **`residueAllowlist` IS NOT A TIER-0/1 KEY.** The design spec's §6 lists it among the Tier-0/1 obligations; measured, it appears **zero** times in `remt-checks-glossary.js` and `remt-checks-extract.js` and is read at `remt-checks-mt.js:1323` — **A5 only, Tier 2**. Its `loadResidueAllowlistOrNull` obligation is real but belongs to the deferred half. **Do not load it here.**

### The complete helper surface — every name the steps below use

Nothing here is a placeholder; each is a named export of `tools/remt-ctx.js`.

```javascript
/** The two kept books. NOTHING ELSE — [LEAD] 2026-08-22, indefinite and reversible. */
export const RUN_BOOKS = Object.freeze(['efnafraedi-2e', 'lifraen-efnafraedi']);

/** Scope keys the loader supplies for every unit kind. */
export const BOOK_KEYS   = Object.freeze(['book']);
export const MODULE_KEYS = Object.freeze(['chapter', 'module', 'locked', 'handEdits',
                                          'inputs', 'force', 'costEstimate', 'emittedFiles']);

/** ctx keys whose value is produced by the extract step — the population I4's vintage clause covers. */
export const EXTRACTION_DERIVED = new Set(['segText', 'emittedFiles', 'freshExtract']);

/** E7's snapshot shape, read from remt-checks-extract.js:571-580. NOT a guess. */
export const isSnapshot = (v) =>
  isPlainRecord(v) && v.segIds instanceof Set && v.segText instanceof Map &&
  v.equations instanceof Map && typeof v.inlineAttrs === 'string';

/** `books/<slug>/02-mt-output/chNN/<module>-segments.is.md` — the path isMtLocked() is given. */
export function mtOutputPathFor(unit) { /* path.join(bookDir, '02-mt-output', chDir, `${unit.module}-segments.is.md`) */ }

/** git log over 02-mt-output for THIS module -> string[] of commit subjects. Always an array. */
export async function handEditCommits(unit) { /* execFile('git', ['log','--oneline','--', mtOutputPathFor(unit)]) */ }

/** [{path, exists, bytes}] for the module's expected inputs. Always an array. */
export function expectedInputs(unit) { /* stat each of cnxml/segText path; never throws */ }

/** The glossary payload spawn. Returns the parsed verdict, or null on ANY failure — never partial. */
export function spawnGlossaryPayloadCheck(book) { /* spawnSync -> parseJsonStrict(stdout, isPlainRecord) */ }

/** {unit, sources: {[ctxKey]: {path, mtime, bytes}}, extractRunStartedAt} — I4's evidence. */
export function provenanceFor(unit, pathsByKey) { /* statSync each; omit absent */ }

/** I4's assertion, exported so N2 can drive it and so the driver can call it per unit. */
export function assertSameUnit(unit, provenance) {
  for (const [key, src] of Object.entries(provenance.sources)) {
    if (!src.path.includes(unit.module) && !src.path.includes('/glossary/')) {
      throw new Error(`remt-ctx: ctx key '${key}' does not belong to unit ${unit.module}: ${src.path}`);
    }
  }
}

/** A ctx with a WELL-FORMED value for every key CTX_CAPABILITY[kind] declares. Used ONLY to
 *  probe the judgeable subset — never in a real run. */
export async function sentinelCtxFor(kind) { /* real values from a representative unit of that kind */ }

/** The run's mutable state, owned by tools/remt-loop.js and passed in. Kept OUT of the loader
 *  so the loader stays pure-read: {force, costEstimateFor, emittedFilesFor,
 *  committedExtractFor, freshExtractFor, extractRunStartedAt}. In tests, `runState()` is a
 *  small factory in the test file returning that shape. */
```

⚠️ **`runState` is the DRIVER's, not the loader's.** The loader must not compute the cost estimate itself: `costEstimate` comes from `api-translate --force --dry-run`, **which costs money on a non-dry path and which no test may reach**. The driver produces it; the loader passes it through; the gate stays pure.

- [ ] **Step 1: Write the failing test — the loader distinguishes the three states of "nothing"**

This is **I2** in its smallest form, and it is the invariant a shapeless-but-truthy value defeats.

```javascript
// tools/__tests__/remt-ctx.test.js
import { describe, it, expect } from 'vitest';
import { parseJsonStrict, isPlainRecord } from '../remt-ctx.js';

it('parseJsonStrict returns null for a missing file, not {}', () => {
  expect(parseJsonStrict(null, isPlainRecord)).toBe(null);
});

it('parseJsonStrict returns null for malformed JSON, and does NOT throw', () => {
  expect(parseJsonStrict('{not json', isPlainRecord)).toBe(null);
});

it('🔴 parseJsonStrict returns null for the four bytes `null` — the §C21 type collision', () => {
  // A committed glossary holding literal `null` PARSED, so a gate keyed on `kind !== absent`
  // stood down while `null` was also the sentinel for "no previous producer". Measured: all
  // three glossary gates stood down and the cron WROTE.
  expect(parseJsonStrict('null', isPlainRecord)).toBe(null);
});

it('parseJsonStrict returns null for a well-formed value of the WRONG SHAPE', () => {
  expect(parseJsonStrict('[]', isPlainRecord)).toBe(null);
  expect(parseJsonStrict('42', isPlainRecord)).toBe(null);
});

it('POSITIVE CONTROL — a well-formed record survives, so the nulls above mean something', () => {
  expect(parseJsonStrict('{"entries":[]}', isPlainRecord)).toEqual({ entries: [] });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/remt-ctx.test.js`
Expected: FAIL — `Failed to resolve import "../remt-ctx.js"`.

- [ ] **Step 3: Implement the loader's spine**

```javascript
#!/usr/bin/env node
/**
 * tools/remt-ctx.js — the ctx loader for the re-MT check battery, TIER 0 AND TIER 1.
 *
 * ── WHY THIS FILE IS TOP-LEVEL AND NOT IN `tools/lib/` ──
 * `tools/__tests__/source-write-guard.test.js` nets top-level `tools/*.js` ONLY — its
 * `readdirSync` is non-recursive and `.endsWith('.js')` drops every directory, so `lib`
 * never survives the filter. Anything under `tools/lib/` is INVISIBLE to the tripwire
 * (12 files there name `01-source` today, three of them the battery's own check modules).
 * This file names the read-only source tree, so it SHOULD trip the guard: the red is the
 * review prompt it is. ▶ And because this file owns ALL source reading, `tools/remt-loop.js`
 * never touches the source tree and stays out of the guard's scope entirely.
 *
 * ── THE FOUR INVARIANTS (design spec §3 + its 2026-08-27 amendment) ──
 * I1  no blocking Tier-0/1 check SKIPs over a unit this loader emitted
 * I2  every spawn/parse value is well-formed or null/absent — NEVER a partial object
 * I3  the unit count equals the spender's work-list
 * I4  same-unit, same-vintage provenance — no ctx mixes modules or extraction vintages
 *
 * 🔴 READ-ONLY. This module performs NO writes. Its only fs calls are existsSync,
 * readFileSync, readdirSync and statSync.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isMtLocked } = require('./lib/mt-lock.cjs');

export const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const bookDir = (book) => path.join(REPO_ROOT, 'books', book);

/** A plain, non-null, non-array object. `typeof x === 'object'` is NOT this. */
export const isPlainRecord = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Read a file, or null. Never throws, never returns ''. */
export const readOrNull = (p) => {
  try {
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  } catch {
    return null;
  }
};

/**
 * I2 IN ONE FUNCTION. Parse `text` and return it ONLY if `shapeGuard` accepts it.
 * Every other outcome — absent, malformed, literal `null`, right-type-wrong-shape —
 * collapses to `null`. There is no partial return.
 */
export function parseJsonStrict(text, shapeGuard) {
  if (typeof text !== 'string' || text === '') return null;
  let v;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  return shapeGuard(v) ? v : null;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tools/__tests__/remt-ctx.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/remt-ctx.js tools/__tests__/remt-ctx.test.js
git commit -m "feat(C82): remt-ctx spine — I2's three states of nothing, collapsed to null"
```

- [ ] **Step 6: Write the failing test for the Tier-0 ctx**

```javascript
it('Tier-0 ctx: payloadVerdict is a well-formed object or absent — never a bare {}', () => {
  const { ctx } = loadTier0Ctx({ book: 'lifraen-efnafraedi', kind: 'module' });
  if ('payloadVerdict' in ctx) expect(isPlainRecord(ctx.payloadVerdict)).toBe(true);
});

it('🔴 G5 does NOT return PASS over the ctx this loader builds', async () => {
  // G5 is BLOCKING and its verdict path hardcodes `examined: 1`, so runCheck's
  // "PASS + examined 0 -> SKIPPED" backstop is STRUCTURALLY DISABLED for it. Measured:
  // {} , {error: msg}, [] and {kind:'ok'} ALL make G5 PASS. Absent and null both FAIL.
  // [LEAD] ruled: work AROUND it in the loader, do not repair the check (L137).
  const { ctx } = loadTier0Ctx({ book: 'lifraen-efnafraedi', kind: 'module' });
  const g5 = REGISTRY.get('G5');
  const r = await runCheck(g5, ctx);
  expect(r.verdict).not.toBe(VERDICT.PASS);   // FAIL or a real judged verdict; never a shapeless pass
});
```

- [ ] **Step 7: Implement `loadTier0Ctx`**

```javascript
/**
 * TIER 0 is BOOK-scoped: all four keys resolve to ONE file,
 * books/<slug>/glossary/glossary-unified.json.
 *
 * 🔴 `payloadVerdict` IS THE I2 CASE THAT MOTIVATED THE INVARIANT. G5 reads it, is BLOCKING,
 * and PASSes over `{}`, `{error: msg}`, `[]` and `{kind:'ok'}` — while `examined` is a literal
 * on its verdict path, so runCheck's zero-examined backstop cannot save it. G5 FAILs correctly
 * only on ABSENT and on `null`. ▶ So this loader emits the spawn's verdict ONLY when it is a
 * well-formed record carrying a `producer`; anything else is emitted as `null`, which G5 reads
 * as the finding it is. [LEAD] ruled work-around, not repair (L137).
 */
export function loadTier0Ctx(unit) {
  const gPath = path.join(bookDir(unit.book), 'glossary', 'glossary-unified.json');
  const payloadText = readOrNull(gPath);
  const glossary = parseJsonStrict(payloadText, isPlainRecord);

  const glossariesByBook = {};
  for (const b of RUN_BOOKS) {
    const g = parseJsonStrict(
      readOrNull(path.join(bookDir(b), 'glossary', 'glossary-unified.json')),
      isPlainRecord
    );
    if (g) glossariesByBook[b] = g;
  }

  const raw = spawnGlossaryPayloadCheck(unit.book);
  const payloadVerdict = isPlainRecord(raw) && typeof raw.producer === 'string' ? raw : null;

  const ctx = { book: unit.book, glossary, glossariesByBook, payloadVerdict };
  if (payloadText !== null) ctx.payloadText = payloadText;

  return { ctx, provenance: provenanceFor(unit, { glossary: gPath, payloadText: gPath }) };
}
```

- [ ] **Step 8: Run, commit**

```bash
npx vitest run tools/__tests__/remt-ctx.test.js
git add -A tools/remt-ctx.js tools/__tests__/remt-ctx.test.js
git commit -m "feat(C82): remt-ctx Tier 0 — payloadVerdict emitted only when well-formed (L137)"
```

- [ ] **Step 9: Write the failing test for the Tier-1 ctx and E9's five legs**

```javascript
it('E9 reports NO leg-not-checked finding over a ctx this loader built', async () => {
  // E9 is the POSITIVE EXEMPLAR the invariants are written against: it emits
  // {kind:'leg-not-checked', leg, why} for every input it could not use, and its verdict is
  // `findings.length ? FAIL : PASS` — so a PARTIALLY loaded ctx becomes a FAIL, loud, and a
  // wholly absent one becomes SKIPPED with the LOADER named as the cause.
  const unit = { book: 'lifraen-efnafraedi', chapter: '1', module: 'm00033', kind: 'module' };
  const { ctx } = await loadTier1Ctx(unit, runState());
  const r = await runCheck(REGISTRY.get('E9'), ctx);
  const notChecked = (r.findings || []).filter((f) => f.kind === 'leg-not-checked');
  expect(notChecked.map((f) => f.leg)).toEqual([]);
});

it('chapter is the BARE string form — `ch01` and -1 both read EMPTY', async () => {
  const unit = { book: 'efnafraedi-2e', chapter: '01', module: 'm68662', kind: 'module' };
  const { ctx } = await loadTier1Ctx(unit, runState());
  expect(ctx.chapter).toBe('01');
  expect(String(ctx.chapter).startsWith('ch')).toBe(false);
  expect(ctx.chapter).not.toBe(-1);
});

it('POSITIVE CONTROL — chapter 0 survives, and it is FALSY', async () => {
  // Chemistry ch00 holds m68662, the only A5 fixture. `if (!chapter)` drops it.
  const unit = { book: 'efnafraedi-2e', chapter: '0', module: 'm68662', kind: 'module' };
  const { ctx } = await loadTier1Ctx(unit, runState());
  expect(ctx.chapter).toBe('0');
  expect(ctx.cnxml).toBeTypeOf('string');
});
```

- [ ] **Step 10: Implement `loadTier1Ctx`**

```javascript
/**
 * TIER 1 is MODULE-scoped ([LEAD] L136: the unit is the MODULE).
 *
 * ⚠️ `chapter` TAKES THE BARE STRING FORM — '4' | '04' | '0' | 'appendices'. Measured against
 * `readChapterFromDisk`: 'ch04', 'ch4', 'ch00' and -1 all read `{cnxml:[], html:[]}`, i.e.
 * EMPTY. 🔴 CLAUDE.md's Directory-Structure section prescribes `-1` as the appendix sentinel —
 * that is right for `chapterLabel.chapterDir()` and WRONG here. Pass the string.
 * ⚠️ `locked` comes from `isMtLocked()`, NOT `fs.existsSync` — the marker is a SIBLING
 * (`-segments.is.md` -> `-segments.locked`), so the two disagree in BOTH directions.
 * ⚠️ `emittedFiles` is a LISTING, not a path, and MUST be scoped to THIS RUN's output — the
 * generated trees hold thousands of historical backups and E6 is BLOCKING.
 * ⚠️ `costEstimate` must come from `--force --dry-run`. A bare `--dry-run` reports ~0 ISK once
 * output exists — a wrong answer that looks like an answer. E9 refuses `withForce !== true`.
 */
export async function loadTier1Ctx(unit, runState) {
  const dir = bookDir(unit.book);
  const chDir = `ch${String(unit.chapter).padStart(2, '0')}`;
  const cnxmlPath = path.join(dir, '01-source', chDir, `${unit.module}.cnxml`);
  const segPath = path.join(dir, '02-for-mt', chDir, `${unit.module}-segments.en.md`);

  const ctx = {
    book: unit.book,
    chapter: String(unit.chapter),          // bare form; never `ch..`, never -1
    module: unit.module,
    locked: isMtLocked(mtOutputPathFor(unit)),
    handEdits: await handEditCommits(unit),
    inputs: expectedInputs(unit),
    force: runState.force === true,
    costEstimate: runState.costEstimateFor(unit),   // {isk, withForce:true}
    emittedFiles: runState.emittedFilesFor(unit),   // THIS RUN's listing only
  };

  const cnxml = readOrNull(cnxmlPath);
  if (cnxml !== null) ctx.cnxml = cnxml;             // absent for source-less kinds
  const segText = readOrNull(segPath);
  if (segText !== null) ctx.segText = segText;

  const committed = runState.committedExtractFor(unit);
  const fresh = runState.freshExtractFor(unit);
  if (isSnapshot(committed)) ctx.committedExtract = committed;
  if (isSnapshot(fresh)) ctx.freshExtract = fresh;

  return { ctx, provenance: provenanceFor(unit, { cnxml: cnxmlPath, segText: segPath }) };
}
```

⚠️ **`isSnapshot` is the real shape, not a guess: `{segIds: Set, segText: Map, equations: Map, inlineAttrs: string}` (`tools/lib/remt-checks-extract.js:571-580`).** A hand-built `{segIds, byId}` makes **all five** E7 arms SKIP with the same message — an absence you manufactured.

- [ ] **Step 11: Run, commit**

```bash
npx vitest run tools/__tests__/remt-ctx.test.js
git add -A tools/remt-ctx.js tools/__tests__/remt-ctx.test.js
git commit -m "feat(C82): remt-ctx Tier 1 — E9's five legs, bare chapter, run-scoped emittedFiles"
```

- [ ] **Step 12: Write the failing test for the judgeable subset (Option C)**

```javascript
it('every unit kind gets a NON-EMPTY judgeable subset — an empty one THROWS in runTier', async () => {
  // 🔴 `runTier(tier, ctx, checks)` refuses a clean run over an empty set BY DESIGN, and `[]`
  // is TRUTHY, so `checks || [...]` passes it straight through to the throw. If the loader ever
  // computes an empty subset for a unit kind, the tier does not report — it DIES.
  for (const kind of UNIT_KINDS) {
    expect((await judgeableIds(1, kind)).length).toBeGreaterThan(0);
  }
});

it('L136 (a): E3 is judgeable on EVERY source-less unit kind', async () => {
  for (const kind of UNIT_KINDS.filter((k) => !CTX_CAPABILITY[k].has('cnxml'))) {
    expect(await judgeableIds(1, kind)).toContain('E3');
  }
});

it('POSITIVE CONTROL — the `module` kind gets MORE checks than a source-less kind', async () => {
  // Without this, "every kind gets a non-empty subset" is satisfied by giving them all the
  // same set, and Option C would be unimplemented while both assertions above passed.
  const sourceless = UNIT_KINDS.find((k) => !CTX_CAPABILITY[k].has('cnxml'));
  expect((await judgeableIds(1, 'module')).length).toBeGreaterThan(
    (await judgeableIds(1, sourceless)).length
  );
});
```

- [ ] **Step 13: Implement the judgeable subset — BY PROBE, NOT BY TABLE**

```javascript
/**
 * OPTION C (L136): a per-unit-kind check population.
 *
 * 🔴 THE SUBSET IS PROBED BY EXECUTION, NOT DECLARED IN A TABLE. A table would be an
 * enumeration of what each CHECK requires — which [LEAD] ruled against (property, not
 * enumeration) and which cannot be derived mechanically anyway: the contract test's
 * `/ctx\??\.(NAME)/` arm is blind to all six aliased-access forms, and E9 — the blocking
 * check with the most loader obligations — reads ALL FIVE of its keys through
 * `const c = ctx || {}`, its key names appearing as `ctx.<key>` ONLY inside error strings.
 *
 * What the loader legitimately DOES know is its OWN capability: which keys it can supply for
 * a unit kind. So: build a sentinel ctx from that capability, run every check in the tier, and
 * whatever SKIPs is structurally unjudgeable for the kind.
 *
 * ▶ L136 condition (a) — E3 on every source-less unit — then holds BY CONSTRUCTION rather than
 * by decree, because E3 reads only `segText`, which the loader supplies for every kind.
 * ▶ And condition (c) — exclusions REPORTED PER UNIT — is satisfied by returning them, not by
 * dropping them silently.
 */
export const UNIT_KINDS = Object.freeze(['module', 'exercises', 'chapter-metadata']);

export const CTX_CAPABILITY = Object.freeze({
  module: new Set([...BOOK_KEYS, ...MODULE_KEYS, 'cnxml', 'segText']),
  exercises: new Set([...BOOK_KEYS, ...MODULE_KEYS, 'segText']),
  'chapter-metadata': new Set([...BOOK_KEYS, ...MODULE_KEYS, 'segText']),
});

const subsetCache = new Map();

export async function judgeableIds(tier, kind) {
  const key = `${tier}:${kind}`;
  if (!subsetCache.has(key)) {
    const sentinel = await sentinelCtxFor(kind);     // well-formed values for every capable key
    const ids = [];
    const excluded = [];
    for (const c of [...REGISTRY.values()].filter((c) => c.tier === tier)) {
      const r = await runCheck(c, sentinel);
      (r.verdict === VERDICT.SKIPPED ? excluded : ids).push(c.id);
    }
    if (ids.length === 0) {
      throw new Error(
        `remt-ctx: tier ${tier} has an EMPTY judgeable subset for unit kind '${kind}'. ` +
          `runTier would throw over it rather than report. Excluded: ${excluded.join(', ')}`
      );
    }
    subsetCache.set(key, { ids, excluded });
  }
  return subsetCache.get(key).ids;
}

/** The exclusions, for L136 condition (c) — reported per unit, never dropped silently. */
export async function excludedIds(tier, kind) {
  await judgeableIds(tier, kind);                    // populates the cache
  return subsetCache.get(`${tier}:${kind}`).excluded;
}

/** Tier-dispatching convenience used by Task N2, Task 5 and Task 6. */
export async function loadCtx(tier, unit, runState) {
  return tier === 0 ? loadTier0Ctx(unit) : loadTier1Ctx(unit, runState);
}
```

- [ ] **Step 14: Run, commit**

```bash
npx vitest run tools/__tests__/remt-ctx.test.js
git add -A tools/remt-ctx.js tools/__tests__/remt-ctx.test.js
git commit -m "feat(C82): remt-ctx Option C — judgeable subset probed by execution, never tabled"
```

- [ ] **Step 15: Trip `source-write-guard` ON PURPOSE and hand the classification to a reviewer**

Run: `npx vitest run tools/__tests__/source-write-guard.test.js`
Expected: **RED**, naming `tools/remt-ctx.js`. **That red is the review prompt the guard exists to be.**

🔴 **DO NOT add the filename to the ALLOW set yourself.** Verify the read-only classification first — `grep -n "writeFileSync\|appendFileSync\|rmSync\|unlinkSync\|mkdirSync\|renameSync\|createWriteStream" tools/remt-ctx.js` must return **nothing**, and pair that null with a positive control (the same pattern fires 8× on `download-source.js`, proving it works). **Then a REVIEWER adds the entry, not the implementer.** Listing a non-toucher dilutes the tripwire for the one moment it exists to catch.

---

## Task N2: I1, I2, I3, I4 as tests — the inverse-direction gate

**Files:**
- Create: `tools/__tests__/remt-ctx-invariants.test.js`

**Interfaces:** Consumes everything Task N1 produces.

🔴 **`tools/__tests__/remt-ctx-contract.test.js` enforces ONE direction only — *no check reads a key the contract does not document* (checks ⊆ contract). NOTHING enforces `loader ⊇ what checks require`.** That is this task, and it is the whole reason the loader can otherwise ship silently incomplete.

- [ ] **Step 1: Write I1 — no blocking check SKIPs over a unit the loader emitted**

```javascript
it('I1 — no blocking Tier-0/1 check SKIPs, and none reports leg-not-checked', async () => {
  const units = unitsFor('lifraen-efnafraedi').slice(0, 5);
  const offences = [];
  for (const unit of units) {
    for (const tier of [0, 1]) {
      const { ctx } = await loadCtx(tier, unit, runState());
      for (const id of await judgeableIds(tier, unit.kind)) {
        const c = REGISTRY.get(id);
        if (!c.blocking) continue;
        const r = await runCheck(c, ctx);
        if (r.verdict === VERDICT.SKIPPED) offences.push(`${unit.module}/${id}: SKIPPED`);
        for (const f of r.findings || []) {
          if (f.kind === 'leg-not-checked') offences.push(`${unit.module}/${id}: leg ${f.leg}`);
        }
      }
    }
  }
  expect(offences).toEqual([]);
});

it('🔴 CONTROL — I1 is NOT vacuous: the loop above examined a non-zero number of pairs', async () => {
  // An equivalence pin comparing [] to [] passes whatever the code does. This repo shipped
  // exactly that bug. Assert the comparison was NON-EMPTY.
  let pairs = 0;
  for (const unit of unitsFor('lifraen-efnafraedi').slice(0, 5)) {
    for (const tier of [0, 1]) {
      pairs += (await judgeableIds(tier, unit.kind)).filter((id) => REGISTRY.get(id).blocking).length;
    }
  }
  expect(pairs).toBeGreaterThan(10);
});
```

- [ ] **Step 2: Write I2 — never a partial object from a spawn or a parse**

```javascript
it('I2 — every spawn/parse-sourced value is well-formed or null; never shapeless-but-truthy', async () => {
  const { ctx } = loadTier0Ctx({ book: 'lifraen-efnafraedi', kind: 'module' });
  for (const key of ['glossary', 'payloadVerdict']) {
    const v = ctx[key];
    if (v === null || v === undefined) continue;
    expect(isPlainRecord(v)).toBe(true);
    expect(Object.keys(v).length).toBeGreaterThan(0);   // {} is truthy and is the bug
  }
});

it('🔴 CONTROL — the G5 trap still exists, so I2 is guarding something live', async () => {
  // If G5 were ever repaired, this control goes red and I2's rationale must be re-read.
  // [LEAD] ruled work-around, not repair (L137) — so this SHOULD stay red-if-changed.
  const base = { book: 'lifraen-efnafraedi', payloadText: '{}' };
  const r = await runCheck(REGISTRY.get('G5'), { ...base, payloadVerdict: {} });
  expect(r.verdict).toBe(VERDICT.PASS);   // the trap, asserted so its disappearance is loud
});
```

- [ ] **Step 3: Write I3 — the loader's unit count equals the spender's work-list**

```javascript
it('I3 — the loader emits exactly the units the spender pays for', () => {
  // 🔴 ASSERT THE COUNTS; DO NOT IMPORT api-translate's discovery so the two agree "by
  // construction". Measured: there is NO exported work-list builder there at all —
  // `discoverModules` (166) and `discoverExercisesFile` (31) are exported, `discoverChapters`
  // is NOT, and the work-list is assembled inline in main(). The exported surface CANNOT
  // enumerate the corpus, so importing it is not merely lossy — it is unavailable.
  const emitted = unitsFor('efnafraedi-2e').length + unitsFor('lifraen-efnafraedi').length;
  expect(emitted).toBe(220);          // 197 module+exercise units + 23 chapter-metadata
});

it('🔴 CONTROL — the 23 chapter-metadata units are PRESENT, since they are what a naive import drops', () => {
  const all = [...unitsFor('efnafraedi-2e'), ...unitsFor('lifraen-efnafraedi')];
  expect(all.filter((u) => u.kind === 'chapter-metadata')).toHaveLength(23);
});
```

⚠️ **Every rate carries its own denominator.** §C82 L106/L126 records **five** live counts of "the corpus" — 166 module pairs · 197 IS segment files · 220 exactly-paired basenames · 227 · 112 chapter×track cells — **none wrong and none interchangeable.** `220` above is the spend-unit denominator; do not compare it to any of the other four.

- [ ] **Step 4: Write I4 — same-unit, same-vintage provenance**

```javascript
it('I4 — every source a ctx read belongs to THAT unit', async () => {
  // 🔴 WHY THE OTHER THREE CANNOT SEE THIS. E3 is BLOCKING, reads ONLY segText, and cannot
  // detect that it was handed another module's text: it answers CORRECTLY ABOUT THE WRONG
  // MODULE and returns PASS. I1 sees no SKIP. I2 sees a well-formed string. I3 sees the right
  // count. `remt-checks-extract.js:795` assigns this to the loader by name: "That is the
  // LOADER's contract (§C82 L21), not a guard's."
  for (const unit of unitsFor('lifraen-efnafraedi').slice(0, 5)) {
    const { provenance } = await loadTier1Ctx(unit, runState());
    for (const [key, src] of Object.entries(provenance.sources)) {
      expect(src.path, `${unit.module}/${key}`).toContain(unit.module);
    }
  }
});

it('I4 — no ctx mixes extraction vintages', async () => {
  // §C82 keeps TWO extraction vintages live for weeks, so a mixed-vintage ctx is a normal
  // accident, not an exotic one. Every extraction-derived source must postdate this run's
  // extract step.
  const unit = unitsFor('lifraen-efnafraedi')[0];
  const state = runState();
  const { provenance } = await loadTier1Ctx(unit, state);
  for (const [key, src] of Object.entries(provenance.sources)) {
    if (!EXTRACTION_DERIVED.has(key)) continue;
    expect(src.mtime, `${key}`).toBeGreaterThanOrEqual(provenance.extractRunStartedAt);
  }
});

it('🔴 CONTROL — I4 FAILS on a deliberately cross-wired ctx', async () => {
  // Without this, I4 passes on a loader that records no sources at all.
  const [a, b] = unitsFor('lifraen-efnafraedi');
  const crossed = { ...(await loadTier1Ctx(a, runState())).provenance };
  crossed.sources = (await loadTier1Ctx(b, runState())).provenance.sources;
  expect(() => assertSameUnit(a, crossed)).toThrow(/does not belong to/);
});
```

- [ ] **Step 5: Run all four, commit**

```bash
npx vitest run tools/__tests__/remt-ctx-invariants.test.js
git add tools/__tests__/remt-ctx-invariants.test.js
git commit -m "feat(C82): I1-I4 as tests — the loader-side direction nothing enforced"
```

---

## Task N3: the Tier-1 partial-state sweep

**Files:**
- Create: `test-results/c82-tier1-partial-state-sweep-<date>.mjs` and its `.md` report

**A deliverable, not a prerequisite** — it may run any time after N1, but it **must** run before the plan is done.

🔴 **THE TECHNIQUE, AND WHY THE OBVIOUS VERSION IS WORTHLESS.** A probe of the ALL-EMPTY case cannot see a partial-state hole, and **partial is the state a loader actually produces.** Measured: supplying only scope keys to all 13 Tier-0/1 checks returned `SKIPPED, examined=0` for **every one** — a correct measurement that licensed a false generalisation (*"the pre-spend half fails uniformly loud"*), because every key was absent **together**. Vary one key against a populated ctx and G5 PASSes over four different shapeless values.

▶ **Enumerate the ctx STATES — absent · `null` · shapeless-but-truthy (`{}`, `[]`, `{error}`, `{kind:'ok'}`) · well-formed — and probe the MIXED ones.** The committed harness to copy is `test-results/c82-ctx-state-probe-2026-08-27.mjs`.

⚠️ **Carry the right prior.** Tier 0 yielded a blocking silent-pass on the first attempt (G5). **Tier 1 is in better shape and the sweep should expect fewer hits, not none:** `skipIfCtxUnusable` (`remt-checks-extract.js:165`) guards E1/E2/E4/E5; E3 opts out **with its reason stated at `:795`**; E6 guards on `Array.isArray(emittedFiles)`; E9 emits `leg-not-checked` per leg. **A clean sweep here is a plausible result — which is exactly why it needs a positive control that fires.**

- [ ] **Step 1: Write the sweep with a built-in positive control**

```javascript
// One arm per (check × key × state). The CONTROL is arm 0: a fully-populated ctx that must
// produce a NON-SKIPPED verdict before any varying arm means anything.
const STATES = {
  absent: () => undefined,
  null: () => null,
  emptyObject: () => ({}),
  emptyArray: () => [],
  errorShape: () => ({ error: 'spawn failed' }),
  wrongShape: () => ({ kind: 'ok' }),
  emptyString: () => '',
};
```

- [ ] **Step 2: Run it and read the arms where a BLOCKING check returned PASS**

Run: `node test-results/c82-tier1-partial-state-sweep-<date>.mjs > /tmp/sweep.json; echo $?`

🔴 **REDIRECT WITH `>`; NEVER PIPE.** `process.exit()` discards queued stdout on a **pipe** — measured on `remt-battery.js`, 150,342 valid bytes through `>` and exactly **65,536** through `| cat`. A `>` redirect is synchronous and stays clean, which is why a hand check misses this entirely.

- [ ] **Step 3: Log every finding to the register (§C82), then commit both files**

```bash
git add test-results/c82-tier1-partial-state-sweep-*.mjs test-results/c82-tier1-partial-state-sweep-*.md
git commit -m "test(C82): N3 — the Tier-1 partial-state sweep, with its positive control"
```

---

## Task 5: Phase 1 — pre-flight, and the quarantine transition

> ### ⏱ AMENDMENT 2026-08-27 — pre-flight builds its ctx through the LOADER
> Step 3 names E9's five inputs parenthetically (*".locked, git log on 02-mt-output, expected
> inputs, --force, --force --dry-run cost band"*). **Those are `tools/remt-ctx.js`'s obligations
> (Task N1), not inline reads here.** The driver must not touch the source tree — that is what
> keeps it out of `source-write-guard`'s scope.
> ⚠️ **`runPreflight({mtOutputPath: lockedFixture()})` implies a ctx-building step this plan
> named as neither a file nor a task.** It is now N1. **Rewrite the test to pass a `unit` and
> let the loader build the ctx**, so the assertion exercises the real `isMtLocked()` path rather
> than a fixture path the harness interprets:
> ```javascript
> const r = await runPreflight({ unit: lockedUnit(), loadCtx: loadTier1Ctx });
> expect(r.halt).toBe(true);
> expect(r.haltingCheck).toBe('E9');
> ```
> ▶ **And assert E9's message names the LEG, not just the check** — E9's whole value is that it
> says *which* input was missing and *how* it should have been produced.

**Files:** Modify `tools/remt-loop.js`; test `tools/__tests__/remt-loop-preflight.test.js`

Order, from design §4:

1. compute the **extraction fingerprint**;
2. **if it changed → `quarantineStale()` the ledger, commit, and CONTINUE** (not halt — decision ① is a re-run at the book's end, not an abort);
3. run Plan B's **E9** (`.locked`, `git log` on `02-mt-output`, expected inputs, `--force`, `--force --dry-run` cost band);
4. a blocking failure here **halts before any ISK**.

🔴 **The fingerprint-change report is a MODEL, and the reference wrote it for us.** `verify-b4b0-gates.js`'s Gate 0 failure says: *"This is a DATA SWAP, not a code regression — do not 'fix' the code to match."* The equivalent here: **"the extractor changed; N modules cleared under the old vintage are now STALE and will be re-MT'd in this book's end-of-run batch. This is decision ① working, not a defect."** Without that sentence a future operator will try to make the fingerprint match again.

- [ ] **Step 1: Write the failing test**

```javascript
it('a changed fingerprint quarantines and CONTINUES — it does not halt', async () => {
  const r = await runPreflight({ ledger: ledgerWith({ m1: 'clean' }, 'oldhash'), fingerprint: 'newhash' });
  expect(r.halt).toBe(false);
  expect(r.ledger.modules.m1.status).toBe(STATUS.STALE);
  expect(r.message).toMatch(/decision ①|not a defect/i);
});

it('a surviving .locked marker HALTS before any ISK', async () => {
  // §C110: extract is not lock-aware, api-translate is — a split vintage inside
  // one module, which nothing reports.
  const r = await runPreflight({ mtOutputPath: lockedFixture() });
  expect(r.halt).toBe(true);
  expect(r.haltingCheck).toBe('E9');
});
```

- [ ] **Steps 2–5** as before.

---

## Task 6: Phases 2–3 — extract, Tier 1, and the spend gate

> ### 🔴 ⏱ AMENDMENT 2026-08-27 — **THIS IS THE AMENDMENT THAT CLOSES THE ORIGINAL GAP.**
> The three tests below inject synthetic verdicts — `tier1: failing('E2')`, `skipped('E4')`,
> `alwaysFailing('E3')`. **Every one of them passes with `tools/remt-ctx.js` NEVER EXISTING and
> no check ever seeing real data.** They are correct statements about the driver's control flow
> and they must stay. **But they are not sufficient, and on their own they made this whole plan
> satisfiable with the battery wired to nothing.**
>
> ▶ **ADD a fourth test that drives the REAL `REGISTRY` through the REAL loader:**
> ```javascript
> it('drives the real REGISTRY through the real loader — no injected verdicts', async () => {
>   const unit = { book: 'lifraen-efnafraedi', chapter: '1', module: 'm00033', kind: 'module' };
>   const { ctx } = await loadTier1Ctx(unit, runState());
>   const ids = await judgeableIds(1, unit.kind);
>   expect(ids.length).toBeGreaterThan(0);          // an EMPTY list makes runTier THROW
>   const results = await runTier(1, ctx, ids.map((id) => REGISTRY.get(id)));
>   expect(results).toHaveLength(ids.length);       // CONTROL: non-vacuous
>   for (const r of results) {
>     if (!r.blocking) continue;
>     expect(r.verdict, `${r.id} SKIPPED over a unit the loader emitted`).not.toBe(VERDICT.SKIPPED);
>   }
> });
> ```
>
> ### 🔴 CORRECTION — **PLAN B's `runTier` HAS NO EMPTY-SET THROW. `main`'s DOES.**
> The design spec's Option C bullet rests on *"an empty check list throws — `runTier` refuses a
> clean run over an empty set by design."* **That is true of merged `main` and FALSE of Plan B's
> text**: Plan B:358 writes the same `runTier(tier, ctx, checks)` signature with the same
> `checks || [...]` fallback and goes **straight from `const set = ...` to the result loop** —
> no refusal. ▶ **A literal Plan B transcription returns a clean run over an EMPTY SET**, the
> exact failure the guard exists to prevent. **Verify the throw against `main` before relying on
> it, and do not treat Plan B as the contract.**
> ⚠️ **The JS edge is real:** `[]` is **truthy**, so `[] || fallback` yields `[]` — an empty
> array reaches the throw path while `undefined`/`null` reach the fallback. Three inputs, two
> destinations.
>
> ### ⏱ L136 (Option C) — the judgeable subset, and reporting exclusions
> Tier 1 runs `runTier(1, ctx, judgeableIds(1, unit.kind).map((id) => REGISTRY.get(id)))`.
> **Exclusions are REPORTED PER UNIT**, never dropped silently — L136 condition (c). And the
> subset must be **non-empty**: L136 condition (a), *E3 on every source-less unit*, is what keeps
> it so, which makes that condition load-bearing for more than coverage — **it is what stops
> Option C from throwing.**

**Files:** Modify `tools/remt-loop.js`; test alongside.

- **Step 2 EXTRACT** — `cnxml-extract.js`, free. ⚠️ Spawn it; do **not** import and call it. And **never pass `--output-dir`** expecting isolation: it is accepted, in `--help`, and **ignored** (§C83).
- **TIER 1** — Plan B's tier 1. **Loops until clean**, because a halt here costs a re-extract and not money. This is the design's sharpest structural finding: *most checks belong BEFORE the paid step.*

🔴 **The loop-until-clean must be bounded and must not loop on its own.** Re-extracting cannot fix a source defect, so a second identical Tier-1 failure is a **halt for a human**, not a third attempt. Bound it at **2** attempts and report the diff between them.

- [ ] **Step 1: Write the failing test**

```javascript
it('a Tier 1 blocking failure halts BEFORE the paid step', async () => {
  const r = await runModule({ book: 'lifraen-efnafraedi', module: 'm00033', tier1: failing('E2') });
  expect(r.paidStepAttempted).toBe(false);
  expect(r.status).toBe(STATUS.FAILED);
});

it('a Tier 1 SKIPPED blocking check also halts — 0 units examined is not a pass', async () => {
  const r = await runModule({ tier1: skipped('E4') });
  expect(r.paidStepAttempted).toBe(false);
});

it('re-extract is attempted at most twice, then halts for a human', async () => {
  const r = await runModule({ tier1: alwaysFailing('E3') });
  expect(r.extractAttempts).toBe(2);
  expect(r.status).toBe(STATUS.FAILED);
});
```

- [ ] **Steps 2–5** as before.

---

## Task 7: Phase 3 — the paid step, attempted exactly once

**Files:** Modify `tools/remt-loop.js`; test alongside.

🔴 **THE HARD SAFETY RULE, AND IT IS THE MOST IMPORTANT ASSERTION IN THIS PLAN: the paid step is attempted ONCE per module per invocation. Never auto-retried, under any error.** A timeout, a 500, a truncated body — all halt. A re-run is an explicit human act.

Invocation: `node tools/api-translate.js --book <slug> --chapter <n> --module <id> --force [--no-glossary]`.
- `--module` **requires** `--chapter` (`api-translate.js:1454`).
- ⚠️ **Chapter 0 must survive the call** — do not build the argv with `if (!chapter)`.
- The book's arm comes from the ledger (Task 12); module 1 of each book runs **both** arms.

- [ ] **Step 1: Write the failing test — this is the one to write first and never weaken**

```javascript
it('calls the paid step EXACTLY once, even when it throws', async () => {
  const calls = [];
  const spawnStub = (...a) => { calls.push(a); throw new Error('502 from Málstaður'); };
  const r = await runModule({ module: 'm68663', spawn: spawnStub });
  expect(calls).toHaveLength(1);          // 🔴 not 2, not "retry once on 5xx"
  expect(r.status).toBe(STATUS.FAILED);
  expect(r.halt).toBe(true);
});

it('never calls the paid step when a blocking pre-MT gate failed', async () => {
  const calls = [];
  await runModule({ tier1: failing('E1'), spawn: (...a) => calls.push(a) });
  expect(calls).toHaveLength(0);
});

it('passes chapter 0 through — chemistry ch00 holds the only A5 fixture', async () => {
  const calls = [];
  await runModule({ book: 'efnafraedi-2e', chapter: 0, module: 'm68662', spawn: (...a) => { calls.push(a); return ok(); } });
  expect(calls[0].join(' ')).toMatch(/--chapter 0\b/);
});
```

- [ ] **Steps 2–5** as before.

---

## Task 8: Phases 4–6 — Tier 2, inject/render, Tier 3/4, and the ledger write

> ### 🔴 ⏱ AMENDMENT 2026-08-27 — **TASK 8 DOES NOT CLOSE ITS OWN GAP, AND THAT IS DELIBERATE.**
> `tools/remt-ctx.js` covers **Tier 0 and Tier 1 only** ([LEAD], the pre-spend half — 13 checks,
> 11 of the battery's 19 blocking). **Tiers 2, 3 and 4 have NO loader.** So this task's third
> test — `recordModule({ provenance: { schemaVersion: 1, ... } })` — **injects its Tier-2 input
> exactly as Task 6's did before the amendment above.** ▶ **The gap Task 6 closes stays OPEN
> here, one layer over, in the POST-SPEND half.**
>
> **This is recorded rather than fixed, on three grounds:** the money is already spent by the
> time Tier 2 runs, so a false PASS here costs review time rather than ISK; the Tier 3/4 audits
> **never reached disk** (0 of 5 reader agents wrote a file unprompted), so their contract is
> un-surveyed; and the design spec's §10 lists **four un-executed typedef claims** about Tiers
> 3-4 that must be executed before a loader for them is designed.
>
> ▶ **DO NOT mark Task 8 complete as though its gates were live.** Its ledger-write and
> no-push assertions are real and must pass. **Its Tier-2/3/4 verdicts are injected**, and the
> task's completion note must say so in those words, so a later executor can tell an open gap
> from a closed one. **A second loader task is owed and is not in this plan.**

**Files:** Modify `tools/remt-loop.js`; test alongside.

- **TIER 2** reads the module's **run record** from the v2 provenance sidecar (`tools/lib/provenance.js` `readProvenance`). ⚠️ **On a v1 sidecar the run-record checks report `SKIPPED`, not clean** — and that is the whole existing corpus today (200 sidecars, 0 with a run record).
- **INJECT / RENDER run per CHAPTER, not per module**, so these steps re-render the chapter each time. Free and accepted: the alternative defers reader-visible feedback until acting on it is expensive.
- **TIER 3** post-inject/render. **TIER 4 at chapter close only.**
- **Step 6 LEDGER + RUN RECORD** — verdict, arm, fingerprint, ISK, **gate versions**.

🔴 **COMMIT THE LEDGER IN THE SAME STEP THAT WRITES IT.** `lint-staged`'s pre-commit hook stashes unstaged tracked changes, so a ledger written now and committed later can be **silently dropped**. ⚠️ **Commit only; do NOT push** — push at book boundaries, coordinated with a deploy, because a push to `main` strands prod's content backup.

- [ ] **Step 1: Write the failing test**

```javascript
it('writes AND commits the ledger in one step', async () => {
  const r = await recordModule({ book: 'lifraen-efnafraedi', module: 'm00033', verdict: 'PASS' });
  expect(r.committed).toBe(true);
  expect(execFileSync('git', ['status', '--porcelain', 'books/lifraen-efnafraedi/remt-ledger.json'], { encoding: 'utf8' })).toBe('');
});

it('does NOT push — pushing per module strands prod content backup', async () => {
  const gitCalls = [];
  await recordModule({ git: (...a) => gitCalls.push(a.join(' ')) });
  expect(gitCalls.some((c) => c.includes('push'))).toBe(false);
});

it('run-record checks report SKIPPED on a v1 sidecar, and the module still records a verdict', async () => {
  const r = await recordModule({ provenance: { schemaVersion: 1, tool: 'api-translate' } });
  expect(r.results.find((x) => x.id === 'A4').verdict).toBe('SKIPPED');
  expect(r.status).toBe(STATUS.CLEAN);   // an advisory SKIPPED is not a halt
});
```

- [ ] **Steps 2–5** as before.

---

## Task 9: The three abort thresholds

**Files:** Modify `tools/remt-loop.js`; test alongside.

| threshold | default | why that number |
|---|---|---|
| cumulative ISK > **125%** of the book's §C80 estimate | 1.25 | deliberately **above** the ±15–26% projection error band, so it fires on a *pricing surprise*, not on the known uncertainty |
| **3** consecutive module failures | 3 | a systematic fault, not bad luck |
| **any** attempted write outside the expected trees | 0 | **no tolerance** |

**All three configurable, all three with a stated default** — the design's requirement is that *the loop is never started with an unstated threshold*. Print all three at start-up.

- [ ] **Step 1: Write the failing test**

```javascript
it('halts when cumulative ISK exceeds 125% of the book estimate', async () => {
  const r = await checkAborts({ book: 'lifraen-efnafraedi', spentIsk: est('lifraen-efnafraedi') * 1.26 });
  expect(r.abort).toBe(true);
  expect(r.reason).toMatch(/125%|pricing/i);
});

it('does NOT halt at 120% — the band is deliberately above the projection error', async () => {
  expect((await checkAborts({ spentIsk: est('lifraen-efnafraedi') * 1.2 })).abort).toBe(false);
});

it('halts on 3 consecutive failures but not on 3 non-consecutive ones', async () => {
  expect((await checkAborts({ recent: ['failed', 'failed', 'failed'] })).abort).toBe(true);
  expect((await checkAborts({ recent: ['failed', 'clean', 'failed', 'clean', 'failed'] })).abort).toBe(false);
});

it('halts on ANY write outside the expected trees — zero tolerance', async () => {
  expect((await checkAborts({ writes: ['books/efnafraedi-2e/01-source/ch01/m68663.cnxml'] })).abort).toBe(true);
});
```

⚠️ The last one is the sharpest: `01-source` is **READ-ONLY and legally load-bearing**. A write there is not a threshold to tune.

- [ ] **Steps 2–5** as before.

---

## Task 10: The glossary-arm decision (§C82 ③)

**Files:** Modify `tools/remt-loop.js`; test alongside.

**Module 1 of each book runs BOTH arms** (~400 ISK across two books). The winner criterion, from the battery spec, in order:

1. **A3** total per-segment marker-delta magnitude — the glossary arm is *expected* worse (§C67 class 3 is glossary-driven);
2. **A4** `unwrapped[]` count — glossary-driven by construction;
3. glossary target-word occurrence count in the output — a **compliance proxy, not a correctness measure**;
4. a **blind side-by-side human read** of the same N segments.

🔴 **(1) and (2) can only DISQUALIFY the glossary arm. If they tie, (4) decides — a human, not the driver.** The driver's job is to compute (1)–(3), record them, and **halt for the read**. It must never pick a winner on (3) alone.

🔴 **Record the winning arm AND the glossary CONTENT HASH** (`glossaryContentHash` in `tools/lib/run-record.js`, already built). A later glossary change invalidates the decision, and without the hash nothing can tell.

⚠️ **`arm` records INTENT; `chunksWithGlossary`/`chunksTotal` record what actually went on the wire.** `filterGlossaryForText` returns `null` when no term matches a chunk, and the truncation retry drops the glossary entirely — so a module can record `arm: 'glossary'` while **every** API call carried none. Use the wire counters for the comparison, not the intent.

- [ ] **Step 1: Write the failing test**

```javascript
it('halts for the human read when A3 and A4 tie', async () => {
  const r = await decideArm({ glossary: { a3: 5, a4: 2 }, noGlossary: { a3: 5, a4: 2 } });
  expect(r.decided).toBe(false);
  expect(r.haltForHumanRead).toBe(true);
});

it('disqualifies the glossary arm when its marker delta is worse', async () => {
  const r = await decideArm({ glossary: { a3: 9, a4: 2 }, noGlossary: { a3: 4, a4: 2 } });
  expect(r.winner).toBe('no-glossary');
});

it('never decides on the compliance proxy alone', async () => {
  const r = await decideArm({ glossary: { a3: 5, a4: 2, hits: 99 }, noGlossary: { a3: 5, a4: 2, hits: 0 } });
  expect(r.decided).toBe(false);
});

it('records the glossary CONTENT HASH with the winner', async () => {
  const r = await decideArm({ glossary: { a3: 1, a4: 0 }, noGlossary: { a3: 9, a4: 0 }, glossaryHash: 'abc123' });
  expect(r.glossaryHash).toBe('abc123');
});

it('uses the WIRE counters, not the declared arm', async () => {
  // A module can record arm:'glossary' while every call carried none.
  const r = await decideArm({ glossary: { a3: 1, a4: 0, chunksWithGlossary: 0, chunksTotal: 8 } });
  expect(r.usable).toBe(false);
  expect(r.reason).toMatch(/wire|chunksWithGlossary/i);
});
```

- [ ] **Steps 2–5** as before.

---

## Task 11: `--self-test`

> ### ⏱ AMENDMENT 2026-08-27 — two rows of the planted-state table have no stated mechanism
> The table plants *"a blocking Tier-1 `FAIL`"* and *"a blocking Tier-1 `SKIPPED` (examined 0)"*.
> **It does not say HOW.** Real broken data, or an injected verdict? The two are not equivalent,
> and this task's own opening rule — *"plant each defective state and invoke THE REAL driver
> phase"* — settles it: **plant REAL data and let the REAL check fail.**
> - **Tier-1 FAIL:** plant a module whose `02-for-mt` segments carry legacy `{{…}}` markers.
>   **A natural fixture exists** — E1's base rate is 62.7% and **104 of 170 chemistry EN files
>   still carry the legacy form**, which is E1's FAIL count exactly.
> - **Tier-1 SKIPPED:** hand the loader a unit whose `segText` is absent, so `E3` SKIPs
>   genuinely. **Do not stub the verdict** — a hand-written predicate reporting DETECTED while
>   the real gate reported PASS is the precise failure `verify-b4b0-gates.js:289-301` records,
>   and it is why this task exists at all.
>
> ⚠️ **`selfTest({ overrides: { skipE9: true } })` is fine** — that neuters the DRIVER's gate,
> which is what the meta-test is for. The distinction: **override the driver, never the check.**

**Files:** Modify `tools/remt-loop.js`; test `tools/__tests__/remt-loop-selftest.test.js`

🔴 **Copy the STRUCTURE, not the idea — the reference records exactly how this goes wrong.** `verify-b4b0-gates.js:289-301`: the first version gave `--self-test` its own hand-written `detect` predicate, and **deleting gate 1's assertion left the gate reporting PASS on a live violation while the self-test still printed DETECTED**; gate 2's case was a tautology true on every input.

**`--self-test` must plant each defective state and invoke THE REAL driver phase.** States to plant, one per rule this plan exists to enforce:

| planted state | the real behaviour it must force |
|---|---|
| a `.locked` sibling | pre-flight halts before any ISK |
| a changed fingerprint over a `clean` ledger | those modules become `stale`, and the run **continues** |
| a blocking Tier-1 `FAIL` | the paid step is **never** called |
| a blocking Tier-1 `SKIPPED` (examined 0) | the paid step is **never** called |
| a paid step that throws | called **exactly once**, module `failed`, halt |
| spend at 126% of estimate | abort |
| a write to `01-source` | abort |

- [ ] **Step 1: the meta-test — the self-test must itself be shown to fail**

```javascript
it('goes RED when the once-only rule is neutered — it is not a tautology', async () => {
  const report = await selfTest({ overrides: { payOnce: false } });   // allow a retry
  expect(report.failures.map((f) => f.id)).toContain('paid-step-once');
});

it('goes RED when the pre-flight lock gate is neutered', async () => {
  const report = await selfTest({ overrides: { skipE9: true } });
  expect(report.failures.map((f) => f.id)).toContain('preflight-lock');
});
```

- [ ] **Steps 2–5:** red → implement → green → commit.

---

## Self-review

> ### ⏱ AMENDMENT 2026-08-27 — coverage of the ctx-loader design spec
> **Spec coverage** (`docs/superpowers/specs/2026-08-27-c82-ctx-loader-design.md`, **read its
> ⏱ AMENDMENT block first**): §2 scope → **N1** · §3 `I1`/`I2`/`I3` + the amendment's **`I4`** →
> **N2** · §4 placement → **N1 Step 15** (the guard is tripped on purpose; the classification is
> a REVIEWER's call) · §5 the partial-state technique → **N3** · §6 the typedef obligations →
> **N1 Steps 7/10** · §7 amendment 1 → **the Task 6 amendment** · §7 amendment 2 (L136 Option C)
> → **N1 Steps 12-13 + the Task 6 amendment** · §7 amendments 3-4 → **the file-structure table
> and Global Constraints** · the gate's ruling ② → **the Task 8 amendment** · the gate's
> correction ① → **the Task 6 correction block**.
>
> **Type consistency across the new tasks.** `Unit = {book, chapter, module, kind}` throughout.
> `loadTier0Ctx` / `loadTier1Ctx` / `loadCtx` all return **`{ctx, provenance}`** — never a bare
> ctx. `judgeableIds` and `excludedIds` are **async** (the subset is probed by executing checks,
> and `runCheck` is async) and `judgeableIds` returns a **string[]**, not the cache record.
> `runState` is the **driver's** object, not the loader's.
>
> 🔴 **THREE THINGS THIS REVISION DELIBERATELY DOES NOT ABSORB**, each owed separately — **do
> not fold any of them in, and do not count G1/G3 twice:**
> | owed | owner | why not here |
> |---|---|---|
> | the per-module `exercise-extract.js` reshape | §C82 L136 ② | changes an output shape; its own PR |
> | Tier 0's `G1`/`G3` failing on live glossary data | runbook **1.4** | a PRECONDITION on the run, not loader work — **no amount of loader work reaches them** |
> | the `G5` guard repair | §C82 L137 | [LEAD] ruled *work around it in the loader*, not fix it |
>
> ⚠️ **And a fourth, newly owed by this revision: a Tier-2/3/4 loader.** See the Task 8
> amendment. It is not in this plan and Task 8 must not be reported as though it were.


**Spec coverage.** Design §4 (the life of one module) → Tasks 5–8 · §5 (state, fingerprint) → Tasks 1–3 · §6 (failure handling, thresholds, the three repo hazards) → Tasks 7–9 · §7 (validation) → Task 11 · §8 prerequisite 6 (the driver) → Task 4 · prerequisite 9 (pre-flight) → Task 5 · decision ① (quarantine) → Tasks 2–3, 5 · decision ② (auto-gate + calibrate + sample) → Task 8 *(the calibration/sample halt: first 3 modules per book, every failure, ~1-in-10 **per chapter**)* · decision ③ (glossary arm) → Task 10 · decision ④ (organic is the shakedown) → Global Constraints.

**Deliberately NOT in Plan C:** every verdict. If a condition matters and no check covers it, **it goes in Plan B**. Also out: the term-flip capability (§C78), glossary repair beyond what Tier 0 gates, and anything outside §C80's two books.

**Type consistency.** `STATUS` is the frozen enum from Task 3 throughout. `CheckResult` is Plan B's `{id, tier, blocking, version, verdict, examined, findings, message}`, unchanged. The fingerprint is `{fingerprint, files, fileCount, bytes}` in Tasks 2, 3 and 5. Ledger accessors are `readLedger`/`updateModule`/`writeLedger`/`quarantineStale` — no synonyms.

**Two things an executor must not "tidy":**
1. **The raw NUL separator in the fingerprint hash input** is deliberate and load-bearing (the same idiom the reference's sibling uses). Note that plain `grep` goes blind on a file containing one — use `grep -a`.
2. **`quarantineStale` touching only `CLEAN` modules.** Re-labelling a `FAILED` module `STALE` loses why it failed.

**One prerequisite outside both plans, and it is an operator act:** the lock-clearing commit `cc725a62` **must reach prod before the run**. Until it does, prod holds all 7 chemistry locks — `api-translate` would skip those modules while `cnxml-extract` re-extracts them (§C110). The driver **detects** this every module via E9; it cannot fix it.
