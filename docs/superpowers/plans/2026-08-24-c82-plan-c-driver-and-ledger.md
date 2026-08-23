# §C82 Plan C — the re-MT loop driver, the ledger, and the extraction fingerprint

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

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
- ⚠️ **Resolve every path against `import.meta.url`/`__dirname`, never `process.cwd()`.** A wrong cwd is exactly K1's blind spot: it prints `Total findings: 0` having read zero files (§C60).

### File structure

| File | Responsibility |
|---|---|
| `tools/lib/import-graph.js` | walk a module's transitive local ESM imports → a sorted file list |
| `tools/lib/extraction-fingerprint.js` | hash that file set → `{fingerprint, files, bytes}` |
| `tools/lib/remt-ledger.js` | read / update / atomically write `books/<slug>/remt-ledger.json`; the status enum; quarantine-on-fingerprint-change |
| `tools/remt-loop.js` | the driver CLI: `next`, `status`, `--self-test` |
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

## Task 5: Phase 1 — pre-flight, and the quarantine transition

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

**Spec coverage.** Design §4 (the life of one module) → Tasks 5–8 · §5 (state, fingerprint) → Tasks 1–3 · §6 (failure handling, thresholds, the three repo hazards) → Tasks 7–9 · §7 (validation) → Task 11 · §8 prerequisite 6 (the driver) → Task 4 · prerequisite 9 (pre-flight) → Task 5 · decision ① (quarantine) → Tasks 2–3, 5 · decision ② (auto-gate + calibrate + sample) → Task 8 *(the calibration/sample halt: first 3 modules per book, every failure, ~1-in-10 **per chapter**)* · decision ③ (glossary arm) → Task 10 · decision ④ (organic is the shakedown) → Global Constraints.

**Deliberately NOT in Plan C:** every verdict. If a condition matters and no check covers it, **it goes in Plan B**. Also out: the term-flip capability (§C78), glossary repair beyond what Tier 0 gates, and anything outside §C80's two books.

**Type consistency.** `STATUS` is the frozen enum from Task 3 throughout. `CheckResult` is Plan B's `{id, tier, blocking, version, verdict, examined, findings, message}`, unchanged. The fingerprint is `{fingerprint, files, fileCount, bytes}` in Tasks 2, 3 and 5. Ledger accessors are `readLedger`/`updateModule`/`writeLedger`/`quarantineStale` — no synonyms.

**Two things an executor must not "tidy":**
1. **The raw NUL separator in the fingerprint hash input** is deliberate and load-bearing (the same idiom the reference's sibling uses). Note that plain `grep` goes blind on a file containing one — use `grep -a`.
2. **`quarantineStale` touching only `CLEAN` modules.** Re-labelling a `FAILED` module `STALE` loses why it failed.

**One prerequisite outside both plans, and it is an operator act:** the lock-clearing commit `cc725a62` **must reach prod before the run**. Until it does, prod holds all 7 chemistry locks — `api-translate` would skip those modules while `cnxml-extract` re-extracts them (§C110). The driver **detects** this every module via E9; it cannot fix it.
