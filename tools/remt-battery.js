#!/usr/bin/env node
/**
 * remt-battery.js — the §C82 re-MT check battery CLI.
 *
 * Runs one tier of the battery over one book/chapter/module and reports every
 * check's verdict, version and examined count, as text or JSON.
 *
 * ⚠️ THIS TOOL JUDGES; IT NEVER MUTATES AND NEVER SEQUENCES. Plan C's driver
 * sequences. Keeping them apart is what lets the battery be validated against the
 * EXISTING corpus before any ISK is spent (design §3).
 *
 * Exit: 0 all blocking checks passed · 1 a blocking check failed or was SKIPPED
 *       · 2 usage or environment error.
 *
 * ── THE ctx CONTRACT, AND WHY IT IS DOCUMENTED HERE BUT NOT YET BUILT ──────────
 * Global Constraint 5: gates are pure — "a gate takes already-read strings/objects
 * and returns a verdict. File reading happens in the CLI or in Plan C's driver."
 * So the loader belongs on this side. It is deliberately NOT written yet, because
 * no gate exists to consume it (Tasks 3-12) and a loader guessing at keys would be
 * fiction. What IS fixed here is the shape every gate may rely on:
 *
 *   @typedef {object} CheckContext
 *   @property {string}  book          slug, e.g. 'efnafraedi-2e'          (scope)
 *   @property {string} [chapter]      'ch01' | '0' | 'appendices'          (scope)
 *   @property {string} [module]       'm68663'                             (scope)
 *   @property {string} [cnxml]        read-only source CNXML text    (Task 3: E2/E4)
 *   @property {string} [segText]      02-for-mt EN segments          (Task 3: E2/E4)
 *   @property {string} [isText]       02-mt-output IS segments       (Task 8: A2/A6)
 *   @property {object} [provenance]   the parsed sidecar             (Task 9: A4/A8)
 *   @property {object} [glossary]     parsed glossary-unified.json   (Task 7: G1-G4)
 *   @property {string} [payloadText]  raw glossary bytes             (Task 7: G5)
 *   @property {string} [mtOutputPath] path, for the .locked sibling  (Task 6: E9)
 *   @property {string[]} [emittedFiles] filenames the extract emitted (Task 5: E6)
 *                                     ⚠️ A LISTING, NOT A PATH — gates are pure, so the
 *                                     loader walks the directory. It must scope the list
 *                                     to THIS RUN's output: the two kept books' generated
 *                                     trees already hold 14,634 historical backup files
 *                                     (2026-03-08 → 2026-08-12), and E6 is blocking.
 *
 * ▶ Until the loader lands, this CLI passes only the SCOPE keys, so every other key
 * reads as plain `undefined`. 🔴 THAT IS NOT STRUCTURALLY LOUD, AND AN EARLIER
 * VERSION OF THIS COMMENT CLAIMED IT WAS. Reading `ctx.cnxml` does not throw — it
 * yields `undefined` — and what happens next is PER-GATE. Measured over the real
 * instruments, called with `undefined`:
 *     THREW (loud)   checkBracketBodies · analyzeModule · isMtLocked
 *     RETURNED EMPTY checkAltCoverage · detectResidue · findGlossaryCollisions
 * Three of six. For the quiet half the only backstop is `runCheck`'s
 * `PASS + examined 0 → SKIPPED` rule, and that fires ONLY if the gate keyed
 * `examined` to content it actually read.
 * ▶ SO, GATE AUTHORS OF TASKS 3-12: KEY `examined` TO CONTENT, NEVER TO A FIXED LEG
 * COUNT. A gate reporting a constant — Plan B's own E9 test asserts
 * `expect(r.examined).toBe(5)`, its five legs — reports PASS with examined 5 over a
 * ctx carrying nothing, and the CLI exits 0. → active register §C82 L6.
 *
 * 🔴 WHOEVER BUILDS THAT LOADER: IT WILL READ THE READ-ONLY OPENSTAX SOURCE TREE,
 * AND THAT MAKES THIS TOOL A PROV-1 TOUCHER. `tools/__tests__/source-write-guard.test.js`
 * keeps an ALLOW set of top-level `tools/*.js` naming that directory, each entry
 * classified read-only or writer; a new name goes red until a reviewer classifies
 * it. **Expect that red, and treat it as the review prompt it is — do not silence
 * it by adding the filename before the classification is true.** This file is
 * deliberately NOT in the set today: it performs no I/O at all (no `fs` import),
 * and listing a non-toucher would dilute the tripwire for the one moment it exists
 * to catch. ⚠️ Note the guard's own SCOPE comment: it nets top-level `tools/*.js`
 * ONLY, so the tier modules under `tools/lib/` are invisible to it.
 * → active register **§C82 L10** — cite it qualified, always: an unrelated `L10`
 * already exists in that file under the embed backlog (physics `m42074`), because
 * the L-numbers are item-scoped rather than global.
 */
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/parseArgs.js';
import { REGISTRY, runCheck, VERDICT } from './lib/remt-battery.js';

/* ── THE REGISTRY WIRING POINT ────────────────────────────────────────────────
 * 🔴 IMPORT EACH TIER MODULE HERE AS IT IS BUILT. Nothing else does.
 *
 *   import './lib/remt-checks-glossary.js';   // Task 7  — G1-G5
 *   import './lib/remt-checks-extract.js';    // Tasks 3-6 — E1-E7, E9
 *   import './lib/remt-checks-mt.js';         // Tasks 8-10 — A1-A8
 *   import './lib/remt-checks-output.js';     // Task 11 — R1-R5
 *   import './lib/remt-checks-chapter.js';    // Task 12 — K1-K3
 *
 * Each module calls `registerChecks()` at import time; importing it here is the
 * ONLY thing that puts its checks in the REGISTRY. Measured (register §C82 L3):
 * no task in either plan ever calls `registerChecks()` — Plan B's two occurrences
 * of `registerChecks(` are its doc comment and its definition, and the third
 * mention is an import BINDING, which a keyword grep cannot tell from a call.
 *
 * ⚠️ DO NOT instead import the tier modules from `lib/remt-battery.js`. Measured:
 * import hoisting evaluates the tier module BEFORE this module's own top-level
 * bindings exist, so the first binding it touches dies in the temporal dead zone:
 * `ReferenceError: Cannot access '<binding>' before initialization`. WHICH binding
 * depends on the tier module's shape — with Task 3's (a top-level `defineCheck`
 * call) it is `MIN_TIER`; a top-level `VERDICT` read names `VERDICT`. State the
 * class, not one identifier. The CLI is the right place precisely because it is
 * downstream of the contract.
 *
 * ⚠️ EACH IMPORT BELOW CHANGES WHAT `--tier N` SELECTS, AND THIS FILE'S OWN PROCESS
 * TESTS SPAWN WITH `--tier 1`. Measured when Tier 1 was wired: THREE went red — the
 * empty-registry test (the registry is no longer empty at tier 1) and the two
 * positive controls that expect exit 0, because E2/E4 now run beside the probe's
 * check over a scope-only ctx and read SKIPPED, which for a blocking check is a
 * blocking failure.
 * 🔴 AND TWO MORE WENT QUIETLY WRONG RATHER THAN RED, which is the half worth
 * remembering: the tests expecting exit 1 kept passing — E2/E4 now supply that 1 no
 * matter what the probe returns, so they had stopped discriminating. A red count is
 * not the measure of this change; every probe test needed its synthetic check to be
 * the SOLE determinant again.
 * ▶ Register §C82 L11 predicted this class for Tasks 11/12 and named the wrong task:
 * it fires at the FIRST tier wired. Its prescribed fix — save/clear/restore of
 * `REGISTRY` around the tests — works only for the in-process half, because a spawned
 * CLI has its own module instance the parent cannot reach into. The preload clears on
 * the child's own side; see the `probe` helper's comment for why the clear must
 * follow an import rather than precede it.
 * ─────────────────────────────────────────────────────────────────────────── */
import './lib/remt-checks-extract.js'; // Tasks 3-4 — E2, E4, E5, E7 (tier 1)

/** Tiers the battery defines: 0 glossary · 1 extract · 2 MT · 3 output · 4 chapter. */
export const TIER_MIN = 0;
export const TIER_MAX = 4;

/**
 * Validate a `--tier` value from its RAW STRING form.
 *
 * 🔴 THE RAW STRING IS THE ONLY PLACE THE ERROR IS STILL VISIBLE, which is why
 * `--tier` is declared `type: 'string'` below instead of `type: 'number'`.
 * `parseArgs` coerces numbers with `parseInt(raw, 10)` — at parseArgs.js:179 (the
 * spaced `--tier 1` form) and :165 (the inline `--tier=1` form), with a third in
 * CHAPTER_OPTION at :65. (This cited one site, ":178", which is the `else if`
 * ABOVE the call rather than the call.) And
 * `parseInt` TRUNCATES: `parseInt('1.5')` is 1 and `parseInt('1abc')` is 1. By the
 * time a numeric guard runs, both look like a legitimate tier 1. `parseInt('abc')`
 * is NaN, and the plan's guard `if (args.tier == null)` misses it because
 * `NaN == null` is false — after which `c.tier === NaN` selects nothing and the run
 * exits 0. → active register §C82 L4.
 *
 * @param {unknown} raw
 * @returns {number|null} the tier, or null if absent or not a bare 0-4
 */
export function parseTier(raw) {
  if (typeof raw !== 'string' || !/^[0-4]$/.test(raw)) return null;
  return Number(raw);
}

/**
 * Run every check in a tier over one scope.
 *
 * 🔴 AN EMPTY SELECTED SET THROWS. It is the tier-level twin of the contract's
 * `examined 0` rule: a run that judged nothing must not report clean. It throws
 * rather than returning a flag because Plan C's driver decides from
 * `blockingFailures`, and a `selected: 0` field is one a consumer can simply not
 * read — an exception is not. The CLI maps it to exit 2, so `exitCodeFor` keeps its
 * documented 0/1 contract.
 *
 * @param {number} tier
 * @param {object} ctx     see the CheckContext typedef above
 * @param {Array}  [checks] explicit set, for tests; otherwise selected from REGISTRY
 */
export async function runTier(tier, ctx, checks) {
  const set = checks || [...REGISTRY.values()].filter((c) => c.tier === tier);
  if (set.length === 0) {
    throw new Error(
      `tier ${tier}: no checks selected (registry holds ${REGISTRY.size}) — refusing to report a clean run over an empty set`
    );
  }
  const results = [];
  for (const c of set) results.push(await runCheck(c, ctx));
  // 🔴 A SKIPPED BLOCKING CHECK COUNTS AS A FAILURE. It examined nothing, so it
  // supplied no evidence — and a gate that supplied no evidence must not let a
  // paid module through. This is the amendment's "treat 'examined 0 units' as a
  // failure in its own right, not infer a pass from exit 0."
  //
  // ⚠️ `examined === 0` IS ITS OWN CLAUSE, NOT A RESTATEMENT OF `SKIPPED`. The rule
  // above is general; the verdicts are not symmetrical under it. PASS+0 is downgraded
  // to SKIPPED upstream in `runCheck`, and FAIL+0 is caught by the FAIL clause — but
  // **WARN+0 was the one green cell**, measured: `WARN W0 v1 (examined 0)` … exit 0,
  // a blocking gate that looked at nothing letting a paid module through.
  // ▶ Two other repairs were considered and are WRONG. Downgrading WARN→SKIPPED in
  // `runCheck` ERASES the check's findings and message. And `defineCheck` cannot
  // decide at construction whether a check may return WARN — the spec has R3 blocking
  // *and* WARN-returning at once. Widening this filter is the only repair that keeps
  // the evidence intact; a WARN that DID examine still exits 0.
  const blockingFailures = results.filter(
    (r) =>
      r.blocking &&
      (r.verdict === VERDICT.FAIL || r.verdict === VERDICT.SKIPPED || r.examined === 0)
  );
  return { tier, results, blockingFailures };
}

/** 0 all blocking checks passed · 1 a blocking check failed or was SKIPPED. */
export function exitCodeFor(run) {
  return run.blockingFailures.length > 0 ? 1 : 0;
}

// CLI entry — only when invoked directly. This is the repo's dominant idiom
// (18 sites); the `file://${process.argv[1]}` spelling breaks on any path needing
// URL escaping, and would silently turn the CLI into a no-op import.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(2);
  });
}

/** Usage or environment error. Always exit 2 — never 1, which means "a gate failed". */
function usage(message) {
  console.error(`Error: ${message}`);
  process.exit(2);
}

async function selfTest() {
  // Defined in Task 13. Stubbed loudly so the CLI never silently no-ops: a
  // --self-test that prints nothing and exits 0 is indistinguishable from one that
  // planted a defect and found it.
  usage('--self-test is not implemented yet (Plan B Task 13)');
}

async function main() {
  // 🔴 FAILURE DEFAULT. A run that never reaches a verdict must not exit 0, and the
  // way it gets there is not a hang: a check returning `new Promise(() => {})` holds
  // NO handle, so Node's event loop empties and the process exits NORMALLY with 0,
  // having produced no output, run no later checks, and never computed
  // `blockingFailures`. Measured under `timeout 8` — it returned 0, not 124. Standing
  // at 2 until a verdict overwrites it is what makes that shape visible.
  process.exitCode = 2;

  const args = parseArgs(process.argv.slice(2), [
    { name: 'book', flags: ['--book'], type: 'string' },
    // `--chapter` is a STRING on purpose: chapter 0 is falsy as a number (the
    // truthiness bug Plan A fixed in four tools and audit-render-output still has),
    // and `appendices` is a legitimate value that is not a number at all.
    { name: 'chapter', flags: ['--chapter'], type: 'string' },
    { name: 'module', flags: ['--module'], type: 'string' },
    { name: 'tier', flags: ['--tier'], type: 'string' },
    { name: 'json', flags: ['--json'], type: 'boolean', default: false },
    { name: 'selfTest', flags: ['--self-test'], type: 'boolean', default: false },
  ]);

  if (args.selfTest) return selfTest(args);
  if (!args.book) usage('--book is required (e.g. --book efnafraedi-2e)');
  if (args.tier == null) usage(`--tier is required (${TIER_MIN}-${TIER_MAX})`);

  const tier = parseTier(args.tier);
  if (tier === null) {
    usage(
      `--tier must be a bare integer ${TIER_MIN}-${TIER_MAX}, got ${JSON.stringify(args.tier)}`
    );
  }

  const run = await runTier(tier, {
    book: args.book,
    chapter: args.chapter,
    module: args.module,
  });

  if (args.json) {
    console.log(JSON.stringify(run, null, 2));
  } else {
    for (const r of run.results) {
      console.log(
        `${r.verdict.padEnd(7)} ${r.id} v${r.version} (examined ${r.examined}) ${r.message}`
      );
    }
  }
  // 🔴 `process.exitCode`, NEVER `process.exit()`, WITH OUTPUT IN FLIGHT. Node writes
  // stdout to a PIPE asynchronously, so `process.exit()` discards whatever is still
  // queued: measured at exactly 65,536 bytes (the pipe buffer), 3 runs of 3, against
  // 150,342 valid bytes through a `>` redirect — with the exit code correct in both.
  // `--json` exists to be piped and the standing rule is "read --json, apply the
  // battery's threshold", so a consumer doing exactly the right thing received a
  // truncated document. A `>` redirect is synchronous and stays clean, which is why a
  // hand check misses this entirely.
  // ⚠️ DO NOT extend this to `usage()` or the `main().catch` — measured: `usage()`
  // then falls through to the rest of main and the run exits 0. Those two keep
  // `process.exit(2)`.
  // ⚠️ TRADE-OFF, stated rather than discovered later: `process.exitCode` waits for
  // the event loop to drain, so a future ctx loader leaving a handle open would make
  // this hang instead of exiting. A hang is louder than a wrong 0 — that is the trade
  // being accepted here.
  process.exitCode = exitCodeFor(run);
}
