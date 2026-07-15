# A2-a/b Inject Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `cnxml-inject.js` safe on partially-translated chapters — scope the EN-fallback escape hatch to explicit modules, and isolate per-module failures so one bad module can't abort a whole `--chapter` batch or lose the residue manifest.

**Architecture:** Two composable edits to one file (`tools/cnxml-inject.js`, the only writer into `03-translated/`). A2-a splits the single `allowEnFallback` boolean into a per-module allowlist (authorization) plus a per-module `usedEnFallback` signal (residue-suppression). A2-b wraps the module loop body in a per-module try/catch, which both isolates failures and makes the after-loop residue-manifest write always reachable.

**Tech Stack:** Node 22 ESM, Vitest. CLI arg parsing via `tools/lib/parseArgs.js`. Residue detector `tools/lib/residue-check.js` (consumed, not modified). Integration tests spawn the CLI against a filtered temp copy of `books/efnafraedi-2e` (the `pipeline-integration.test.js` pattern).

## Global Constraints

- Runtime: Node 22.x LTS / ESM modules. Vanilla JS (no TypeScript).
- **Authoritative gate:** `npm test` from the **repo root** must be green (no branch protection — local test is the only gate).
- **Do NOT modify** the residue detector `tools/lib/residue-check.js`.
- **Do NOT relax** the residue false-positive guards in `tools/__tests__/residue-check.test.js` or the `pipeline-integration.test.js` assertions.
- **Preserve the exit-code contract:** any per-module failure or incompleteness still yields a non-zero process exit (a `set -e` wrapper in `scripts/verify-b2-idempotent.sh` depends on this).
- **Surgical diffs:** when wrapping the loop body in try/catch, do NOT re-indent the ~170 unchanged lines — JS is whitespace-insensitive; keep the diff to the two anchor lines.
- Backups: not required — this file is a tool, not a `03-/04-/05-` content edit.

---

## File Structure

- **Modify:** `tools/cnxml-inject.js`
  - `parseCliArgs` (`:106–122`) — option def + allowlist Set + bare-flag guard; export `parseCliArgs`.
  - `printHelp` (`:146–148`) — help text for the new `--allow-en-fallback <ids>` surface.
  - `loadModuleInputs` (`:3884`, gate `:3904`, return `:3982`) — allowlist gate + `usedEnFallback` return.
  - `main` loop (`:4091–4181`, `:4271`) — pass allowlist, per-module `checkResidue`, per-module try/catch, `failedModules` summary.
- **Modify (tests):** `tools/__tests__/cnxml-inject.test.js` — add a `parseCliArgs` unit `describe` block (Task 1).
- **Create (tests):** `tools/__tests__/cnxml-inject-robustness.test.js` — integration spawn tests for A2-a (Task 1) and A2-b (Task 2).

---

## Task 1: A2-a — module-scoped EN fallback

Atomic multi-site change (parse → authorize → wire residue-suppression → help). All edits land in one commit so the tool stays working; the boolean `args.allowEnFallback` is removed and every consumer updated in the same task.

**Files:**
- Modify: `tools/cnxml-inject.js` (`:106–122`, `:146–148`, `:3884`, `:3904`, `:3919`, `:3982`, `:4098–4106`, `:4181`, export block `:4309`)
- Test (unit): `tools/__tests__/cnxml-inject.test.js`
- Test (integration): `tools/__tests__/cnxml-inject-robustness.test.js` (new)

**Interfaces:**
- Produces: `parseCliArgs(argv: string[]) → { …, enFallbackModules: Set<string> }` (the `allowEnFallback` boolean is removed).
- Produces: `loadModuleInputs(chapter, moduleId, lang, sourceDir, enFallbackModules: Set<string>) → { structure, segments, equations, originalCnxml, enSegments, inlineAttrs, restorePolicy, usedEnFallback: boolean }`.
- Consumes: `upsertResidueModule` / `detectResidue` from `residue-check.js` (unchanged); residue manifest shape `{ track, summary:{ modulesWithResidue, exactResidues, ratioWarnings, toleratedResidues }, modules:{ [id]: { exact:[], warnings:[], tolerated:[] } } }` (a clean module is absent from `modules`).

---

- [ ] **Step 1: Write the failing unit tests for `parseCliArgs`**

Add to `tools/__tests__/cnxml-inject.test.js`. First add `parseCliArgs` to the existing import block at the top of the file (the `import { … } from '../cnxml-inject.js'` list), then append this `describe` block:

```javascript
describe('parseCliArgs --allow-en-fallback (A2-a)', () => {
  it('parses a comma-separated module allowlist into a Set', () => {
    const r = parseCliArgs(['--chapter', '1', '--allow-en-fallback', 'm68764,m68770']);
    expect(r.enFallbackModules).toEqual(new Set(['m68764', 'm68770']));
    expect(r.allowEnFallback).toBeUndefined();
  });

  it('defaults to an empty Set when the flag is absent', () => {
    const r = parseCliArgs(['--chapter', '1']);
    expect(r.enFallbackModules).toEqual(new Set());
  });

  it('trims whitespace and ignores empty ids', () => {
    const r = parseCliArgs(['--allow-en-fallback', ' m68764 , ,m68770 ']);
    expect(r.enFallbackModules).toEqual(new Set(['m68764', 'm68770']));
  });

  it('exits when the flag is passed with no module ids (trailing bare flag)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('EXIT');
    });
    expect(() => parseCliArgs(['--chapter', '1', '--allow-en-fallback'])).toThrow('EXIT');
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits when the flag is immediately followed by another flag', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('EXIT');
    });
    expect(() => parseCliArgs(['--allow-en-fallback', '--verbose'])).toThrow('EXIT');
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the unit tests to verify they fail**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js -t "A2-a"`
Expected: FAIL — `parseCliArgs` is not exported (import is `undefined`), so the calls throw / assertions fail.

- [ ] **Step 3: Change the `--allow-en-fallback` option definition to a value-flag**

In `parseCliArgs` (`tools/cnxml-inject.js:115`), replace:

```javascript
    { name: 'allowEnFallback', flags: ['--allow-en-fallback'], type: 'boolean', default: false },
```

with:

```javascript
    {
      name: 'allowEnFallback',
      flags: ['--allow-en-fallback'],
      type: 'string',
      default: null,
      parse: (val) => {
        // parseArgs consumes the next token as the value; reject a flag-looking
        // token (e.g. `--allow-en-fallback --verbose`) instead of swallowing it.
        if (val.startsWith('-')) {
          console.error(
            'Error: --allow-en-fallback requires module id(s), e.g. --allow-en-fallback m68764'
          );
          process.exit(1);
        }
        return val;
      },
    },
```

- [ ] **Step 4: Build the allowlist Set + guard the trailing-bare case**

In `parseCliArgs`, after the `const result = parseArgs(args, [ … ]);` call and before the `// Invert --no-annotate-en` line (`:118`), insert:

```javascript
  // A2-a: --allow-en-fallback is a per-module allowlist, not a run-wide switch.
  // A trailing bare `--allow-en-fallback` leaves the value at its default (parseArgs
  // skips the assignment when there is no next token), so guard against it here.
  if (args.includes('--allow-en-fallback') && !result.allowEnFallback) {
    console.error(
      'Error: --allow-en-fallback requires module id(s), e.g. --allow-en-fallback m68764'
    );
    process.exit(1);
  }
  result.enFallbackModules = new Set(
    (result.allowEnFallback || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  delete result.allowEnFallback;
```

(`args` is `parseCliArgs`'s parameter — the raw argv array; confirmed at `:106`.)

- [ ] **Step 5: Export `parseCliArgs`**

In the export block (`tools/cnxml-inject.js:4309`), add `parseCliArgs,` to the exported names (e.g. right after the opening `export {`).

- [ ] **Step 6: Run the unit tests to verify they pass**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js -t "A2-a"`
Expected: PASS (all 5 cases).

- [ ] **Step 7: Write the failing integration tests for A2-a authorization + residue decoupling**

Create `tools/__tests__/cnxml-inject-robustness.test.js`:

```javascript
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { cpSync, rmSync, mkdtempSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, sep } from 'path';
import { tmpdir } from 'os';

const REAL_ROOT = join(import.meta.dirname, '..', '..');
const INJECT = join(REAL_ROOT, 'tools', 'cnxml-inject.js');

// A pristine, media-free copy of the real book, made once (fast: text-only).
let BASE;
beforeAll(() => {
  BASE = mkdtempSync(join(tmpdir(), 'efni-a2-base-'));
  cpSync(join(REAL_ROOT, 'books', 'efnafraedi-2e'), join(BASE, 'efnafraedi-2e'), {
    recursive: true,
    filter: (src) => !src.includes(`${sep}media`) && !src.includes('.backup'),
  });
}, 60_000);
afterAll(() => {
  if (BASE) rmSync(BASE, { recursive: true, force: true });
});

// Each test mutates its own throwaway working copy.
let WORK, BOOKS;
beforeEach(() => {
  WORK = mkdtempSync(join(tmpdir(), 'efni-a2-work-'));
  BOOKS = join(WORK, 'books', 'efnafraedi-2e');
  cpSync(join(BASE, 'efnafraedi-2e'), BOOKS, { recursive: true });
});
afterEach(() => {
  if (WORK) rmSync(WORK, { recursive: true, force: true });
});

function runInject(extraArgs) {
  return spawnSync('node', [INJECT, '--book', 'efnafraedi-2e', ...extraArgs], {
    cwd: WORK,
    encoding: 'utf8',
    timeout: 60_000,
  });
}

const CH01 = (stage, file) => join(BOOKS, stage, 'ch01', file);
const OUT = (mod) => join(BOOKS, '03-translated', 'mt-preview', 'ch01', `${mod}.cnxml`);

describe('A2-a: module-scoped EN fallback', () => {
  it('refuses a missing translation that is NOT allowlisted (no EN publish)', () => {
    rmSync(CH01('02-mt-output', 'm68664-segments.is.md'));
    const r = runInject(['--chapter', '1']);
    expect(r.status).toBe(1);
    expect(existsSync(OUT('m68664'))).toBe(false); // never fell back to EN
  });

  it('allows EN fallback ONLY for an allowlisted module', () => {
    rmSync(CH01('02-mt-output', 'm68664-segments.is.md'));
    const r = runInject(['--chapter', '1', '--module', 'm68664', '--allow-en-fallback', 'm68664']);
    expect(existsSync(OUT('m68664'))).toBe(true); // scoped fallback produced output
    const cnxml = readFileSync(OUT('m68664'), 'utf8');
    expect(cnxml).toContain('m68664');
  });

  it('keeps residue-checking a well-translated module during a fallback run', () => {
    // m68663 made 100% English (synthetic residue); m68664 missing → allowlisted fallback.
    writeFileSync(
      CH01('02-mt-output', 'm68663-segments.is.md'),
      readFileSync(CH01('02-for-mt', 'm68663-segments.en.md'), 'utf8')
    );
    rmSync(CH01('02-mt-output', 'm68664-segments.is.md'));
    runInject(['--chapter', '1', '--allow-en-fallback', 'm68664', '--allow-incomplete']);
    const report = JSON.parse(
      readFileSync(join(BOOKS, 'residue-report.mt-preview.json'), 'utf8')
    );
    // Under the OLD run-wide flag, a fallback run set checkResidue=false for ALL
    // modules, so m68663 would be absent. Per-module suppression keeps it checked.
    expect(report.modules.m68663).toBeDefined();
    expect(report.modules.m68663.exact.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 8: Run the integration tests to verify they fail**

Run: `npx vitest run tools/__tests__/cnxml-inject-robustness.test.js -t "A2-a"`
Expected: FAIL — the "allowlisted fallback" test fails because today's boolean flag is off (missing translation throws) and the value-flag isn't wired into `loadModuleInputs` yet; the "keeps residue-checking" test fails because the value-flag path isn't wired.

- [ ] **Step 9: Add the allowlist gate + `usedEnFallback` to `loadModuleInputs`**

In `tools/cnxml-inject.js`:

1. Change the signature (`:3884`):

```javascript
function loadModuleInputs(chapter, moduleId, lang, sourceDir, enFallbackModules = new Set()) {
```

2. Add the fallback flag. Just before `let segments;` (`:3900`), insert:

```javascript
  let usedEnFallback = false;
```

3. Change the refusal gate (`:3904`) from `if (!allowEnFallback) {` to:

```javascript
    if (!enFallbackModules.has(moduleId)) {
      throw new Error(
        `Translation not found for ${moduleId} in ${sourceDir} (${segmentsPath}). ` +
          `Refusing to publish untranslated content. ` +
          `Pass --allow-en-fallback ${moduleId} to inject English for this module.`
      );
    }
```

4. In the fallback branch, right after `segments = parseSegments(content);` (`:3919`, the line following the `Warning: Using English segments` log), insert:

```javascript
    usedEnFallback = true;
```

5. Add `usedEnFallback` to the return (`:3982`):

```javascript
  return {
    structure,
    segments,
    equations,
    originalCnxml,
    enSegments,
    inlineAttrs,
    restorePolicy,
    usedEnFallback,
  };
```

- [ ] **Step 10: Wire the allowlist + per-module residue-suppression into `main`**

In `main`'s module loop:

1. Add `usedEnFallback` to the destructuring (`:4098–4106`) and pass the allowlist (`:4106`). The block becomes:

```javascript
      const {
        structure,
        segments,
        equations,
        originalCnxml,
        enSegments,
        inlineAttrs,
        restorePolicy,
        usedEnFallback,
      } = loadModuleInputs(args.chapter, moduleId, args.lang, sourceDir, args.enFallbackModules);
```

2. Change the residue gate (`:4181`) from `checkResidue: args.lang !== 'en' && !args.allowEnFallback,` to:

```javascript
          checkResidue: args.lang !== 'en' && !usedEnFallback,
```

- [ ] **Step 11: Update the help text**

In `printHelp` (`tools/cnxml-inject.js:146–148`), replace the three `--allow-en-fallback` lines with:

```
  --allow-en-fallback <ids>  Comma-separated module id(s) permitted to fall back to
                       untranslated EN when their translation is missing
                       (e.g. --allow-en-fallback m68764,m68770). Any OTHER missing
                       module is a loud per-module skip, never a silent EN publish.
```

- [ ] **Step 12: Run the A2-a tests (unit + integration) to verify they pass**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js tools/__tests__/cnxml-inject-robustness.test.js -t "A2-a"`
Expected: PASS (5 unit + 3 integration).

- [ ] **Step 13: Run the full inject + residue + pipeline suites (no regressions)**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js tools/__tests__/residue-check.test.js tools/__tests__/residue-allowlist.test.js tools/__tests__/pipeline-integration.test.js`
Expected: PASS — no existing assertion relaxed.

- [ ] **Step 14: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject.test.js tools/__tests__/cnxml-inject-robustness.test.js
git commit -m "feat(inject): scope --allow-en-fallback to explicit modules (A2-a)

Split the run-wide boolean into a per-module allowlist (authorization) plus a
per-module usedEnFallback signal (residue-suppression), so forcing EN for one
module no longer publishes EN for, or un-checks residue on, any other module.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: A2-b — per-module failure isolation + always-write manifest

Wrap the loop body in a per-module try/catch so one throwing module can't abort the chapter; the after-loop residue-manifest write then becomes reachable on every run. Builds on Task 1.

**Files:**
- Modify: `tools/cnxml-inject.js` (`:4091` declare list, `:4093`/`:4271` try/catch wrap, post-loop summary)
- Test (integration): `tools/__tests__/cnxml-inject-robustness.test.js` (add `A2-b` describe)

**Interfaces:**
- Consumes: `args.enFallbackModules`, `loadModuleInputs(... usedEnFallback)` from Task 1.
- Produces: no new exports; behavioral contract only (isolation + always-write + non-zero exit + `N/M module(s) FAILED` summary).

---

- [ ] **Step 1: Write the failing integration tests for A2-b**

Append to `tools/__tests__/cnxml-inject-robustness.test.js` (reuses the harness from Task 1):

```javascript
describe('A2-b: per-module failure isolation + always-write manifest', () => {
  it('isolates a throwing module and still processes the rest', () => {
    rmSync(CH01('02-mt-output', 'm68664-segments.is.md')); // not allowlisted → throws
    const r = runInject(['--chapter', '1']);
    expect(r.status).toBe(1); // non-zero exit preserved
    expect(existsSync(OUT('m68664'))).toBe(false); // the failed module
    expect(existsSync(OUT('m68663'))).toBe(true); // a healthy module still injected
    expect(existsSync(OUT('m68690'))).toBe(true); // a later healthy module still injected
    expect(r.stderr).toContain('m68664: FAILED');
    expect(r.stderr).toMatch(/module\(s\) FAILED/);
  });

  it('always writes the residue manifest even when a module fails', () => {
    rmSync(CH01('02-mt-output', 'm68664-segments.is.md'));
    runInject(['--chapter', '1']);
    // Under the OLD code, one throw aborted before the after-loop write.
    expect(existsSync(join(BOOKS, 'residue-report.mt-preview.json'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/__tests__/cnxml-inject-robustness.test.js -t "A2-b"`
Expected: FAIL — today a non-allowlisted missing module throws to the outer catch, so later modules never process, stderr says `Error: Translation not found …` (not `m68664: FAILED`), and the residue manifest is not written.

- [ ] **Step 3: Declare the failed-module list before the loop**

In `main`, right after `const modules = findChapterModules(args.chapter, args.module);` (`:4091`), insert:

```javascript
    const failedModules = [];
```

- [ ] **Step 4: Wrap the loop body in a per-module try/catch**

Immediately after `for (const moduleId of modules) {` (`:4093`), insert a line:

```javascript
      try {
```

Then immediately before the loop's closing brace (the `}` at `:4271`, just above the `// A2: persist the per-book …` comment / `fs.writeFileSync(residueReportPath …)`), insert:

```javascript
      } catch (moduleError) {
        // A2-b: isolate per-module failures so one bad module can't abort the whole
        // chapter. Loud + non-zero exit keeps this fail-loud, not silent-swallow.
        console.error(`${moduleId}: FAILED — ${moduleError.message}`);
        if (args.verbose) console.error(moduleError.stack);
        failedModules.push(moduleId);
        process.exitCode = 1;
        continue;
      }
```

**Do not re-indent the ~170 unchanged body lines** — keep the diff to these two anchors (JS is whitespace-insensitive; the existing `continue` at the incomplete-skip stays valid inside the `try`).

- [ ] **Step 5: Print the end-of-run failure summary**

After the loop closes and before the residue-manifest write (`fs.writeFileSync(residueReportPath …)` at `:4274`), insert:

```javascript
    if (failedModules.length > 0) {
      console.error(
        `\n${failedModules.length}/${modules.length} module(s) FAILED: ${failedModules.join(', ')}`
      );
    }
```

- [ ] **Step 6: Run the A2-b tests to verify they pass**

Run: `npx vitest run tools/__tests__/cnxml-inject-robustness.test.js -t "A2-b"`
Expected: PASS (2 cases).

- [ ] **Step 7: Run the full robustness file + regression suites**

Run: `npx vitest run tools/__tests__/cnxml-inject-robustness.test.js tools/__tests__/cnxml-inject.test.js tools/__tests__/pipeline-integration.test.js`
Expected: PASS.

- [ ] **Step 8: Run the full suite from the repo root (authoritative gate)**

Run: `npm test`
Expected: PASS — all Vitest projects green.

- [ ] **Step 9: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject-robustness.test.js
git commit -m "feat(inject): isolate per-module failures + always write residue manifest (A2-b)

A throw in one module no longer aborts the whole --chapter batch: the loop body
is wrapped in a per-module try/catch (loud log + non-zero exit + end-of-run
FAILED summary), which also makes the after-loop residue-manifest write reachable
on every run.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-07-14-a2-inject-robustness-design.md`):
- A2-a authorization (module allowlist, D1) → Task 1 Steps 3–4, 9; tests Steps 1, 7.
- A2-a residue-suppression decoupled per-module → Task 1 Steps 9–10; test Step 7 ("keeps residue-checking").
- Bare-flag error → Task 1 Steps 3–4; tests Step 1 (cases 4–5).
- A2-b isolate all throws (D2) + failure summary → Task 2 Steps 3–5; test Step 1 ("isolates …").
- A2-b always-write residue manifest (D3) → Task 2 Step 4 (mechanism); test Step 1 ("always writes …").
- Help text + CLI contract → Task 1 Step 11.
- Exit-code contract preserved → asserted `r.status === 1` in A2-a Step 7 + A2-b Step 1.

**2. Placeholder scan:** none — every step shows exact code, exact path, exact command, expected result.

**3. Type consistency:** `enFallbackModules: Set<string>` produced by `parseCliArgs` (Task 1 Step 4), consumed by `loadModuleInputs` param (Step 9) via `args.enFallbackModules` (Step 10); `usedEnFallback: boolean` produced in the return (Step 9), consumed at `checkResidue` (Step 10). `failedModules: string[]` declared (Task 2 Step 3), pushed (Step 4), read (Step 5). Consistent.

## Notes for after both tasks land

- **Register housekeeping (not a code step):** mark A2 out-of-scope issues #3 and #4 resolved in `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (register rows A2-a / #4) and in memory `a2-en-residue-check`. Update the campaign plan (`docs/plans/2026-07-11-pre-semester-coding-campaign.md:48`) to mark item 7 shipped.
- **PR description** should call out the intended, more-honest manifest semantics: a manifest may now reflect a chapter where some modules failed (read-merge-preserve → healthy modules recorded, failed ones simply not upserted this run).
- The `translation-errors.json` after-loop write (`:4285`) also becomes reliably reachable — this is the free benefit noted in the design (D3), no separate guarding added.
