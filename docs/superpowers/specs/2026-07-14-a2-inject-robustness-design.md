# A2-a/b — inject robustness (design)

**Date:** 2026-07-14
**Campaign item:** Phase 2, item 7 (`docs/plans/2026-07-11-pre-semester-coding-campaign.md:48`)
**Scope:** single file — `tools/cnxml-inject.js` (the only writer into `03-translated/`)
**Sizing:** S
**Status:** approved design → ready for `writing-plans`

## Problem

Two robustness gaps in `cnxml-inject.js`, logged as out-of-scope issues #3 and #4
when the A2 residue check shipped (PR #184; memory `a2-en-residue-check`, plan
`docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` register rows
A2-a / #4). Both bite on the *normal* production state — a chapter that is only
partly translated because multiple editors are mid-Pass-1.

- **A2-a — `--allow-en-fallback` is run-wide.** `args.allowEnFallback` is a single
  boolean that does two independent jobs at once: it *authorizes* EN fallback and it
  *suppresses* residue detection, for **every** module in the run. Forcing one
  stubborn module to publish EN therefore (a) silently publishes EN for every *other*
  untranslated module in the same `--chapter` run, and (b) blinds the residue detector
  for every *well-translated* module too. The 2026-06-28 audit titled this
  "silently ships English for EVERY untranslated module in the chapter."

- **A2-b — one module's failure aborts the whole chapter, and the residue manifest is
  then never written.** The `main()` module loop runs inside one big `try`; any throw
  (missing translation when not allowlisted, missing structure JSON, missing source
  CNXML, a `buildCnxml` error) propagates to the outer `catch → process.exit(1)`,
  killing the loop. The after-loop `residue-report.<track>.json` write
  (`cnxml-inject.js:4274`) sits inside that same `try`, so a single bad module means
  the manifest is not persisted **even for the modules that injected cleanly before
  the throw**.

## Goals

1. Scope the EN-fallback escape hatch to an explicit, auditable set of modules.
2. Decouple residue-suppression from authorization so a fallback run still
   residue-checks every module that has a real translation.
3. Isolate per-module failures so one broken module cannot abort a whole
   `--chapter` batch.
4. Guarantee the residue manifest is written whenever the run entered the module loop.

## Non-goals (YAGNI)

- No change to the residue **detector** (`tools/lib/residue-check.js`) — untouched.
- No change to the existing INCOMPLETE-skip path (`:4226–4245`) — already correct.
- No run-wide "fallback everything" diagnostic form — verified: no caller needs one.
- No new guarding of unrelated after-loop artifacts beyond confirming they are reached.
- No re-extract / re-MT / API spend — this is a tool-behavior change only.

## Decisions (resolved during brainstorming)

- **D1 (A2-a CLI surface) — module-scoped allowlist.** `--allow-en-fallback` changes
  from a boolean to a value-taking flag: `--allow-en-fallback m68764,m68770`. A bare
  flag with no modules is an **error**. Rationale: matches the "escape hatches can't
  reach prod" project rule; the spec wording is literally "scoping to module"; and a
  repo-wide grep confirmed **no script/runbook/automation passes the flag today**, so
  repurposing it breaks nothing.
- **D2 (A2-b blast radius) — isolate *all* per-module throws**, not just the
  missing-translation class. Kept fail-loud (not silent-swallow) by a loud per-module
  error log + preserved non-zero exit code + an end-of-run failure summary. Rejected
  alternative: isolate only the missing-file class and still hard-abort on unexpected
  throws — worse, because a real bug then aborts a 20-module batch at module 3 and
  still loses the manifest.
- **D3 (A2-b report scope) — "always written" targets `residue-report.<track>.json`.**
  `translation-errors.json` sits just after it in the same after-loop region and gets
  the benefit for free once throws are isolated; it is not specially guarded.

## Design

### Part 1 — A2-a: module-scoped EN fallback

**Arg parsing (`parseCliArgs`, `:106–122`).** Change the `allowEnFallback` option from
`type:'boolean'` to `type:'string'` (the parser already supports value-taking string
flags — `--lang`, `--source-dir`, `--track`). Parse the comma-separated value into a
`Set<string>` exposed as `args.enFallbackModules`. Trim each id; ignore empty entries.
A bare `--allow-en-fallback` (present but empty value) → print a clear error and
`process.exit(1)`: `--allow-en-fallback requires module id(s), e.g. --allow-en-fallback m68764`.
When the flag is absent, `args.enFallbackModules` is an empty `Set`.

**Authorization (`loadModuleInputs`, `:3884–3924`).** Signature changes to accept the
allowlist (a `Set`) instead of a boolean. The refusal gate at `:3904`:

```
if (!enFallbackModules.has(moduleId)) {
  throw new Error(
    `Translation not found for ${moduleId} in ${sourceDir} (${segmentsPath}). ` +
    `Refusing to publish untranslated content. ` +
    `Pass --allow-en-fallback ${moduleId} to inject English for this module.`
  );
}
```

`loadModuleInputs` **returns a new field `usedEnFallback`** — `true` only when the EN
branch (`:3910–3919`, loading `02-for-mt/.../-segments.en.md`) actually fired for this
module; `false` on the normal translated path.

**Residue-suppression (main loop, `:4181`).** Replace the run-wide expression:

```
checkResidue: args.lang !== 'en' && !args.allowEnFallback,
```

with the per-module signal:

```
checkResidue: args.lang !== 'en' && !usedEnFallback,
```

Effect: a fully-translated module in a fallback run stays residue-checked; only the
module that actually fell back skips (the check is meaningless when the content *is*
the EN source). The `--lang en` round-trip test remains covered by the `args.lang !== 'en'`
clause and does **not** need `--allow-en-fallback` (the round-trip is run with
`--source-dir 02-for-mt`, where the `-segments.en.md` file exists, so the fallback
branch never fires).

### Part 2 — A2-b: per-module failure isolation + always-write report

**Per-module try/catch.** Wrap the loop *body* (`:4093–4271`) in `try { … } catch
(moduleError) { … }`, mirroring the existing INCOMPLETE-skip idiom (`:4226–4245`). On
catch:

```
console.error(`${moduleId}: FAILED — ${moduleError.message}`);
if (args.verbose) console.error(moduleError.stack);
failedModules.push(moduleId);
process.exitCode = 1;
continue;
```

`failedModules` is an array declared before the loop.

**End-of-run failure summary.** After the loop, if `failedModules.length > 0`:

```
console.error(`\n${failedModules.length}/${modules.length} module(s) FAILED: ${failedModules.join(', ')}`);
```

This is what keeps "isolate all throws" fail-loud rather than silently-swallowing.

**Always-write the residue manifest.** No `finally` is needed. Once per-module throws
cannot escape the loop, the existing after-loop `writeFileSync(residueReportPath, …)`
at `:4274` is reached on every run that entered the loop. The thin outer `catch →
process.exit(1)` is retained **only** for pre-loop-fatal errors (`findChapterModules`
throwing, bad args, the pre-loop manifest read), where no module was processed and
there is nothing meaningful to write.

**Composition (intentional).** A missing translation for a *non-allowlisted* module now
throws inside the loop → the new per-module catch converts it to a loud skip +
`exitCode=1`, instead of the old hard abort. A2-b is what makes A2-a's "any other
missing module → loud skip" behavior graceful; neither fix is complete without the other.

## CLI contract (after)

```
--allow-en-fallback <ids>   Comma-separated module id(s) permitted to fall back to
                            untranslated EN when their translation is missing
                            (e.g. --allow-en-fallback m68764,m68770). Any OTHER
                            missing module is a loud per-module skip, never a silent
                            EN publish. Residue detection is skipped only for modules
                            that actually fell back.
```

Help text (`:146–148`) updated accordingly.

## Error-handling summary (after)

| Situation | Behavior |
|-----------|----------|
| No modules / bad args (pre-loop) | outer `catch` → `exit(1)` (unchanged) |
| Missing translation, module **not** allowlisted | throw → per-module catch → loud skip, `exitCode=1`, continue |
| Missing translation, module **allowlisted** | EN fallback, `usedEnFallback=true`, residue check skipped for that module |
| `buildCnxml` / missing structure / missing source throw | per-module catch → loud skip, `exitCode=1`, continue |
| Graceful INCOMPLETE (non-throw) | existing skip (`:4226`), `exitCode=1`, continue (unchanged) |
| End of run | residue manifest written; `translation-errors.json` updated; failure summary printed if any; exit code non-zero on any failure/incompleteness |

## Testing

Extend `tools/__tests__/cnxml-inject.test.js` or add a focused
`tools/__tests__/cnxml-inject-robustness.test.js`. Confirm the existing test harness
style (spawn CLI vs. call `main()`) during `writing-plans`.

- **A2-a:**
  - `--allow-en-fallback m1` lets m1 fall back to EN; a *different* missing module m2
    throws → skipped, `exitCode=1`, run still completes.
  - A fully-translated module m3 in the same fallback run is still residue-checked
    (`checkResidue` true / residue entry recorded).
  - Bare `--allow-en-fallback` (no ids) exits non-zero with the guidance message.
- **A2-b:**
  - A module that throws mid-loop → later modules still processed, and
    `residue-report.<track>.json` is written and contains the healthy modules;
    `exitCode=1`; failure summary printed.
- **Regression guard:** reuse `pipeline-integration.test.js` against real
  `02-mt-output` for the always-write assertion; **do not** relax the existing residue
  false-positive guards (`residue-check.test.js` must-NOT-flag cases stay intact).

## Risks

- **Parser edge case:** confirm `parseArgs` yields an empty/absent value for a bare
  `--allow-en-fallback` so the "requires ids" error fires (vs. swallowing the next
  token). Verify in `writing-plans`; a small parser probe test pins it.
- **Exit-code contract:** the run must still exit non-zero on any per-module failure or
  incompleteness, so a `set -e` wrapper (`scripts/verify-b2-idempotent.sh`) does not
  regress. Only the current chapter's *completeness* improves.
- **Manifest partial-run semantics:** with isolation, a manifest may now reflect a
  chapter where some modules failed. This is the intended, more-honest state (the
  manifest is read-merge-preserve, so healthy modules are recorded and failed ones
  simply aren't upserted this run) — call it out in the PR description.

## Success criteria

1. Forcing EN for one module no longer publishes EN for, or un-checks residue on, any
   other module in the run.
2. A single broken module no longer aborts the chapter; other modules inject and the
   residue manifest is written.
3. Any failure still yields a non-zero exit and a visible per-module + summary log.
4. `npm test` from repo root is green (the authoritative gate; no branch protection).
