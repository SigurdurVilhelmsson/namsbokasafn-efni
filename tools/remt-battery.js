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
 *   @property {string} [scanDir]      directory to sweep             (Task 5: E6)
 *
 * ▶ Until the loader lands, this CLI passes only the SCOPE keys. That is safe
 * rather than silent: a gate reading `ctx.cnxml` on an undefined ctx throws,
 * `runCheck` converts the throw to FAIL, and a blocking FAIL exits 1. The gap
 * announces itself. → active register §C82 L6.
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
 * ONLY, so the tier modules under `tools/lib/` are invisible to it. → §C82 L10.
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
 * import hoisting puts `REGISTRY` in the temporal dead zone and the process dies
 * with `ReferenceError: Cannot access 'REGISTRY' before initialization`. The CLI
 * is the right place precisely because it is downstream of the contract.
 *
 * None exist yet, so the registry is empty — and `runTier` REFUSES an empty
 * selection rather than reporting a clean run over it.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Tiers the battery defines: 0 glossary · 1 extract · 2 MT · 3 output · 4 chapter. */
export const TIER_MIN = 0;
export const TIER_MAX = 4;

/**
 * Validate a `--tier` value from its RAW STRING form.
 *
 * 🔴 THE RAW STRING IS THE ONLY PLACE THE ERROR IS STILL VISIBLE, which is why
 * `--tier` is declared `type: 'string'` below instead of `type: 'number'`.
 * `parseArgs` coerces numbers with `parseInt(raw, 10)` (parseArgs.js:178), and
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
  const blockingFailures = results.filter(
    (r) => r.blocking && (r.verdict === VERDICT.FAIL || r.verdict === VERDICT.SKIPPED)
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
  process.exit(exitCodeFor(run));
}
