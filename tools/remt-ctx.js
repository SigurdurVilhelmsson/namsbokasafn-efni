/**
 * tools/remt-ctx.js — the ctx loader for the re-MT check battery, TIER 0 AND TIER 1.
 *
 * ── WHY THIS FILE IS TOP-LEVEL AND NOT IN `tools/lib/` ──
 * `tools/__tests__/source-write-guard.test.js` nets top-level `tools/*.js` ONLY — its
 * `readdirSync` is non-recursive and `.endsWith('.js')` drops every directory, so `lib`
 * never survives the filter. Anything under `tools/lib/` is INVISIBLE to the tripwire
 * (12 files there name the read-only source dir today, three of them the battery's own
 * check modules). This file names that tree, so it SHOULD trip the guard: the red is the
 * review prompt it is. ▶ And because this file owns ALL source reading, `tools/remt-loop.js`
 * never touches the source tree and stays out of the guard's scope entirely.
 *
 * ⚠️ NO SHEBANG AND NO CLI, DELIBERATELY. This is a library the driver imports. A shebang
 * implies an entry point, and an entry point would bind Global Constraint 5 (hand-rolled
 * arg parsing, never `tools/lib/parseArgs.js`) for a file that parses no arguments.
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
import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';

// 🔴 SIDE-EFFECT IMPORT, AND NOT OPTIONAL. The REGISTRY is populated by the five tier-module
// imports that ONLY the top-level CLI performs; importing `lib/remt-battery.js` alone gives a
// registry of 0, and `judgeableIds` would then probe an empty tier and throw its empty-subset
// error over a set that is fully judgeable. The CLI's `main()` is guarded by
// `process.argv[1] === fileURLToPath(import.meta.url)`, so nothing runs. ⚠️ Do NOT "fix" this
// by importing the tier modules from `lib/remt-battery.js` — hoisting evaluates them before
// that module's own bindings exist and they die in the temporal dead zone.
import './remt-battery.js';
import { REGISTRY, runCheck, VERDICT } from './lib/remt-battery.js';

const require = createRequire(import.meta.url);
const { isMtLocked } = require('./lib/mt-lock.cjs');
const execFileAsync = promisify(execFile);

export const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/** A plain, non-null, non-array object. `typeof x === 'object'` is NOT this. */
export const isPlainRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Read a file, or `null` when it is absent or unreadable. Never throws.
 *
 * 🔴 A ZERO-BYTE FILE RETURNS `''`, NOT `null`, AND THAT IS DELIBERATE. This docstring used to
 * claim "never returns ''" and that was simply false — `fs.readFileSync` on an empty file
 * returns exactly that, and both callers set the ctx key on `!== null`, so `''` REACHES ctx.
 * ▶ Collapsing `''` to `null` would make ABSENT and EMPTY indistinguishable, which is the
 * anti-pattern this whole loader is built to avoid (§C21: a gate keyed on one representation
 * of "nothing" is walked past by another representation of it). Emitting `''` is what makes a
 * zero-byte source LOUD: its consumers guard `!== ''` (`skipIfCtxUnusable`), so the blocking
 * check SKIPs and the run halts — which is what a zero-byte source deserves. The invariant
 * suite's I2 table classifies `''` as a violation for the same reason, and is deliberately
 * stricter than the `!== null` guard here.
 * ▶ [Controller ruling R18, 2026-08-28: the BEHAVIOUR is correct and stays; the docstring was
 * the defect.] Do not "fix" this by returning `null`.
 */
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
 *
 * @param {string|null} text
 * @param {(v:unknown)=>boolean} shapeGuard
 * @returns {object|null}
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

/** The two kept books. NOTHING ELSE — [LEAD] 2026-08-22, indefinite and reversible. */
export const RUN_BOOKS = Object.freeze(['efnafraedi-2e', 'lifraen-efnafraedi']);

const bookDir = (book) => path.join(REPO_ROOT, 'books', book);
const glossaryPath = (book) => path.join(bookDir(book), 'glossary', 'glossary-unified.json');

/**
 * `{unit, sources: {[ctxKey]: {path, mtime, bytes}}, extractRunStartedAt}` — I4's evidence.
 *
 * ⚠️ AN ABSENT SOURCE IS OMITTED, NEVER RECORDED WITH A NULL mtime. A key present with an
 * empty value is the shape I2 exists to refuse, and `assertSameUnit` iterates what is here:
 * a placeholder entry would be checked against a path that was never read.
 *
 * @param {object} unit
 * @param {Record<string,string>} pathsByKey  ctx key -> absolute path
 * @param {{extractRunStartedAt?: string}} [opts]
 */
export function provenanceFor(unit, pathsByKey, opts = {}) {
  const sources = {};
  for (const [key, p] of Object.entries(pathsByKey)) {
    try {
      const st = fs.statSync(p);
      sources[key] = { path: p, mtime: st.mtimeMs, bytes: st.size };
    } catch {
      // absent — omitted on purpose (see the docstring)
    }
  }
  return { unit, sources, extractRunStartedAt: opts.extractRunStartedAt };
}

/** Epoch ms from either an epoch-ms number or an ISO string; `NaN` for anything else. */
const toEpochMs = (v) => (typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN);

/**
 * The earliest instant that can be a REAL run start. A parseable stamp below this is refused.
 *
 * 🔴 WHY A FLOOR AND NOT A BARE `> 0` — `Date.parse('0')` IS 2000-01-01, AND `'0'` IS THE VALUE
 * THIS FILE'S OWN PRESCRIBED LEDGER IDIOM MANUFACTURES. Measured 2026-08-29 against the vintage
 * clause, with a live positive control (a future stamp threw on the same unit):
 *   `0`  → `Number.isFinite(0)`, so it was ENFORCED against `startedAt = 0`, and `mtime >= 0`
 *          holds for every file that has ever existed — the clause was a NO-OP wearing an
 *          enforcement's clothes;
 *   `-1` → identical;
 *   `'0'`→ the nastiest of the three. It does not stand down AT zero: it is enforced against
 *          2000-01-01, a plausible-looking instant nothing in a 2026 corpus can fail, so an
 *          operator reading the error sees a real comparison and concludes the gate is live.
 * ▶ These are the FIFTH representation of "nothing" to reach this field — after absent,
 * `undefined`, `null` and unparseable — and §C21's rule is that a gate keyed on one
 * representation of nothing is walked past by another. A floor refuses the whole class by a
 * PROPERTY (*"this cannot be when a run started"*) rather than by enumerating three literals.
 *
 * ── WHY THIS PARTICULAR INSTANT ──
 * Three constraints fix it, and the value is the round date that satisfies all three with margin:
 *   1. **> 2000-01-01T00:00:00Z**, because that is exactly `Date.parse('0')` — the instant the
 *      floor exists to refuse. A floor at or below it would let `'0'` through.
 *   2. **≤ any legitimate run start.** No run of this loop can predate the repository that holds
 *      the loop and the corpus: `git log --reverse | head -1` is 2025-05-18T21:03:58Z.
 *   3. **≤ the oldest committed source mtime** (2026-07-07T09:12:25.604Z), so a declared
 *      pre-extract pass that stamps a real early instant is not refused by the floor before the
 *      vintage comparison it came for.
 * ⚠️ IT IS DELIBERATELY *NOT* THE FIRST COMMIT'S TIMESTAMP, AND NOT THE OLDEST CORPUS MTIME.
 * Pinning either would bind this constant to a value that moves: `.git` is 4.2 GB and a history
 * rewrite has been discussed in this repo, which would re-date the first commit; and the oldest
 * mtime changes on every re-extract, checkout or `git pull`. A round instant safely below both
 * is stable under both, and the floor's job is to separate 2000 from 2026 — not to be tight.
 */
export const RUN_START_FLOOR_MS = Date.parse('2025-01-01T00:00:00.000Z');

const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : String(ms));

/**
 * I4 IN ONE FUNCTION — **both halves**: same UNIT, and same extraction VINTAGE.
 *
 * 🔴 THIS DOCSTRING USED TO SAY "NOTHING IN THIS LOADER CALLS IT, BY DESIGN" — AND THAT MADE I4
 * A GATE NEVER CALLED, WHICH IS A GATE THAT DOESN'T EXIST. Measured 2026-08-28: a grep across
 * `tools/`, `server/` and `scripts/` found only this function's own definition, its own error
 * string, and test files — so I4 was enforced at TEST time only, and at runtime the loader
 * would return a cross-wired ctx without complaint. `loadTier0Ctx` and `loadTier1Ctx` now call
 * this on the provenance they just built, right before returning, as a POSTCONDITION SELF-CHECK.
 * ⚠️ THAT IS NOT A SECOND OPINION — the same module produces and validates the provenance, so a
 * defect shared between a path builder here and this predicate could still pass both. It
 * converts *"the tests found the loader correct on 220 units at test time"* into *"the loader
 * refuses to return a bad ctx, ever"* — a real strengthening, but not independent verification.
 * **The test-side sweep in `remt-ctx-invariants.test.js` remains the audit; do not delete it as
 * redundant just because this function is wired in now.**
 *
 * ── THE SAME-UNIT HALF: THREE CLAUSES, BECAUSE THE MODULE NAME ALONE IS NOT AN IDENTITY ──
 * 🔴 THE PREDICATE WAS `src.path.includes(unit.module)` AND THAT ENFORCED NOTHING FOR A
 * QUARTER OF THE CORPUS. Measured 2026-08-28: **54 of 220 units carry a module basename that
 * is a shared LITERAL** — `exercises` ×31 and `chapter-metadata` ×23 — so for those units
 * "this source belongs to that unit" was satisfied by ANY unit of the same kind, in any
 * chapter, in either book. Cross-wiring organic ch01 `exercises` with organic ch02
 * `exercises` passed silently. A module name is unique only for the 166 `module` units, and
 * an identity claim that holds for 166 of 220 is not an identity claim.
 * ▶ So a source must be under the unit's own BOOK, and — unless it is book-scoped — must name
 * the unit's own MODULE and sit in the unit's own CHAPTER DIRECTORY. The three clauses are
 * ordered widest-first so the error names the outermost thing that is wrong.
 *
 * ⚠️ THE BOOK CLAUSE APPLIES TO THE GLOSSARY TOO, AND THAT IS THE POINT OF ITS PLACEMENT.
 * Tier-0 provenance is `{glossary, payloadText}`, both under `books/<book>/glossary/`, and
 * with the module clause carved out (correctly — they are book-scoped, not module-scoped)
 * the tier-0 arm could not throw on ANY input: it was a no-op wearing a test's clothes.
 * Scoping it to the book is what makes tier 0 falsifiable — cross-wire the two books'
 * glossaries and it now throws.
 *
 * ⚠️ THE CHAPTER DIRECTORY IS RESOLVED LAZILY, PER SOURCE, AND MOVING IT TO THE TOP OF THE
 * FUNCTION BREAKS TIER 0. `chapterDirOf` THROWS on an absent chapter (by design), and a
 * legitimate tier-0 unit has none — it is book-scoped, so callers build `{book, kind, module}`
 * and nothing else. Computing it eagerly would turn every tier-0 assertion into a crash about
 * a field tier 0 does not have.
 *
 * ── THE VINTAGE HALF (added 2026-08-28) ──
 * 🔴 IT WAS DECLARED AND NEVER ENFORCED, AND BOTH VALUES IT NEEDS WERE ALREADY IN THE
 * PROVENANCE OBJECT. `EXTRACTION_DERIVED` named the population and was referenced by nothing.
 * The run is paused for most of the weeks it takes: the driver captures `emittedFilesFor(unit)`
 * at extract time T0, this loader reads `segText` from disk at T, and a re-extract, a
 * `git pull` or the 2-hourly backup cron can land in between. E6 and E2/E4 then judge a
 * mismatched pair, and nothing reports it.
 *
 * ⚠️ THE CLAUSE COVERS THE *STALE* DIRECTION, AND SAYING SO IS THE POINT: it catches a source
 * that PREDATES the run's extract (the extract silently did not write this unit, so the
 * committed vintage is still there). It does not, and cannot, catch a source that is newer
 * than the extract but older than some other artefact — that would need a per-artefact stamp
 * this provenance does not carry.
 *
 * ── THE FOUR STATES OF `extractRunStartedAt`, ALL EXPLICIT, NONE DEFAULTING ──
 *   1. no extraction-derived source in `provenance.sources` → nothing to compare (every
 *      Tier-0 provenance lands here: `glossary`/`payloadText` are not extraction-derived);
 *   2. `undefined` → **THROWS**. This is the driver having *forgotten* to thread the stamp,
 *      and `requireRunState` does not validate it, so it arrives as `undefined` silently.
 *      Letting it stand down is this repo's own "a gate keyed on one representation of
 *      nothing is walked past by another representation of nothing" (§C21);
 *   3. `null` → the driver EXPLICITLY claims no vintage. That is the legitimate **pre-extract
 *      pass**, which judges the committed vintage before the loop re-extracts anything, and
 *      whose sources therefore predate any run. It must be said, not omitted;
 *   4. a parseable epoch-ms number or ISO string **at or after `RUN_START_FLOOR_MS`** →
 *      **enforced**. Unparseable throws rather than comparing against `NaN`, which is `false`
 *      for every operand and would read as drift.
 *   5. 🔴 a parseable instant BEFORE that floor — `0`, `-1`, `'0'` — → **THROWS** (added
 *      2026-08-29). This was the FIFTH representation of "nothing" and the only one that was
 *      silent: `0` made `mtime >= 0` vacuously true, and `'0'` parses to 2000-01-01 and was
 *      *enforced* against a bar nothing in a 2026 corpus can fail. See `RUN_START_FLOOR_MS`
 *      for why it is a floor rather than a `> 0` test or a list of three literals.
 */
export function assertSameUnit(unit, provenance) {
  // The book clause reads `unit.book`, so an absent one must fail HERE, naming the field.
  // Without this it surfaces as a `path.join` TypeError from `bookDir` — which reads as a
  // loader bug rather than as the caller having handed over a unit with no book.
  if (typeof unit?.book !== 'string' || unit.book === '') {
    throw new Error(
      `remt-ctx: assertSameUnit needs unit.book to scope provenance to a book, got ` +
        `${JSON.stringify(unit?.book)}. Every source must sit under books/<unit.book>/.`
    );
  }
  const ownBookDir = bookDir(unit.book) + path.sep;
  const GLOSSARY_SEG = `${path.sep}glossary${path.sep}`;

  for (const [key, src] of Object.entries(provenance.sources)) {
    // (i) BOOK — every source, the book-scoped ones included. `startsWith` on the resolved
    // directory rather than `includes(unit.book)`: a slug can appear anywhere in a path.
    if (!src.path.startsWith(ownBookDir)) {
      throw new Error(
        `remt-ctx: ctx key '${key}' does not belong to unit ${unit.module}: wrong BOOK — ` +
          `expected a source under ${ownBookDir}, got ${src.path}`
      );
    }

    // (ii) The book-scoped carve-out. `glossary`/`payloadText` are one file per book by
    // design, so they name no module and live in no chapter directory. They have already
    // been scoped to the right book by (i), which is the whole of their identity.
    if (src.path.includes(GLOSSARY_SEG)) continue;

    // (iii) MODULE — unique for the 166 `module` units, a shared literal for the other 54.
    if (!src.path.includes(unit.module)) {
      throw new Error(
        `remt-ctx: ctx key '${key}' does not belong to unit ${unit.module}: wrong MODULE — ` +
          `the path names no '${unit.module}': ${src.path}`
      );
    }

    // (iv) CHAPTER DIRECTORY — the discriminator (iii) lacks for `exercises` and
    // `chapter-metadata`. Resolved here, per source, never at the top: see the docstring.
    const chapterSeg = `${path.sep}${chapterDirOf(unit.chapter)}${path.sep}`;
    if (!src.path.includes(chapterSeg)) {
      throw new Error(
        `remt-ctx: ctx key '${key}' does not belong to unit ${unit.module}: wrong CHAPTER ` +
          `DIRECTORY — expected ${chapterSeg} (chapter ${JSON.stringify(unit.chapter)}), got ` +
          `${src.path}. A shared module basename makes the chapter the only discriminator.`
      );
    }
  }

  const derived = Object.entries(provenance.sources).filter(([key]) => EXTRACTION_DERIVED.has(key));
  if (derived.length === 0) return; // state 1
  const claimed = provenance.extractRunStartedAt;
  if (claimed === null) return; // state 3 — an explicit "no vintage claimed"
  if (claimed === undefined) {
    throw new Error(
      `remt-ctx: unit ${unit.module} carries extraction-derived ctx (${derived
        .map(([k]) => k)
        .join(', ')}) but provenance.extractRunStartedAt is UNDEFINED, so the vintage half of ` +
        `I4 cannot be checked. The driver owes this stamp on runState. Pass the timestamp the ` +
        `extract for this unit started at, or pass an explicit \`null\` to declare a ` +
        `pre-extract pass that judges the committed vintage.`
    );
  }
  const startedAt = toEpochMs(claimed);
  // 🔴 ONE BRANCH FOR BOTH REFUSALS, ON PURPOSE. "Unparseable" and "parseable but cannot be a
  // run start" are the same operator problem — the stamp does not describe when this run began
  // — and they must not be distinguishable by a caller, or one of the two grows an exception.
  // The floor is what makes the clause refuse `0`, `-1` and `'0'`; see `RUN_START_FLOOR_MS`.
  if (!Number.isFinite(startedAt) || startedAt < RUN_START_FLOOR_MS) {
    throw new Error(
      `remt-ctx: provenance.extractRunStartedAt is not a usable run start for unit ` +
        `${unit.module}: ${JSON.stringify(claimed)} (${typeof claimed}). Expected epoch ms or ` +
        `an ISO string at or after ${iso(RUN_START_FLOOR_MS)}. REFUSED: anything unparseable, ` +
        `and any instant before that floor — which is what rules out 0, negative numbers and ` +
        `the STRING '0' (Date.parse('0') is 2000-01-01, so it would be enforced against a bar ` +
        `nothing in this corpus can fail, and the vintage half of I4 would silently stand down ` +
        `while LOOKING enforced). To declare a pre-extract pass, pass an explicit \`null\`.`
    );
  }
  for (const [key, src] of derived) {
    if (!(src.mtime >= startedAt)) {
      // Rounded: `mtimeMs` is fractional, and `4496224661.851074 ms` in an operator-facing
      // error is noise, not precision.
      const driftMs = Math.round(startedAt - src.mtime);
      throw new Error(
        `remt-ctx: ctx key '${key}' is from an OLDER extraction vintage than this run for unit ` +
          `${unit.module}: ${src.path} mtime ${iso(src.mtime)} < extractRunStartedAt ` +
          `${iso(startedAt)} — drift ${driftMs} ms (~${(driftMs / 86400000).toFixed(1)} days). ` +
          `The extract did not write this source, so ctx.${key} and the run's emittedFiles ` +
          `describe different vintages.`
      );
    }
  }
}

/**
 * The glossary payload spawn. Returns the parsed verdict, or `null` on ANY failure — never
 * partial.
 *
 * 🔴 THIS DELIBERATELY SHADOWS A DIFFERENT FUNCTION OF THE SAME NAME, AND THE TWO ARE NOT
 * INTERCHANGEABLE. `tools/lib/remt-checks-glossary.js` exports `spawnGlossaryPayloadCheck`
 * too, but it takes `(filePath, {repoRoot})`, is ASYNC, and REJECTS when the child produces
 * no parseable JSON. This one takes a book slug, is SYNCHRONOUS, and returns `null`.
 * Both differences are load-bearing:
 *   · sync — `loadTier0Ctx` is synchronous and its callers destructure `{ctx}` directly; an
 *     async spawn would hand them a Promise and `ctx` would read `undefined`.
 *   · null, not a rejection — I2. A loader that throws on a malformed child turns a Tier-0
 *     FINDING (G5's `leg-not-checked`) into a crash that reports no verdict at all.
 * ⚠️ THE EXIT CODE IS IGNORED ON PURPOSE (Global Constraint 3: never infer a pass from exit
 * 0). The verdict is stdout, and `cwd` is pinned to the repo root because a wrong cwd is the
 * blind spot that prints `Total findings: 0` having read zero files (§C60).
 *
 * ⚠️ DELIBERATELY NOT CACHED ACROSS UNITS, THOUGH TIER 0 IS BOOK-SCOPED AND THIS RUNS ONCE
 * PER UNIT. `scripts/git-backup.sh` REGENERATES `glossary-unified.json` every two hours,
 * unforced, and this loop runs for weeks — roughly 84 cron ticks a week — so a Tier-0 verdict
 * cached at the start of a book would be a claim about a file that has since been rewritten.
 * Re-spawning is what lets the ledger record a verdict beside the glossary state that produced
 * it. **Do not "optimise" this into a per-book memo.**
 *
 * @param {string} book book slug
 * @returns {object|null}
 */
export function spawnGlossaryPayloadCheck(book) {
  let res;
  try {
    res = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, 'server', 'scripts', 'check-glossary-payload.js'),
        '--file',
        glossaryPath(book),
        '--json',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
  } catch {
    return null;
  }
  if (!res || res.error) return null;
  return parseJsonStrict(res.stdout, isPlainRecord);
}

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
 *
 * ⚠️ `glossariesByBook` CARRIES BOTH KEPT BOOKS REGARDLESS OF `unit.book`, because G4's
 * subject is a RELATION between books rather than a property of one — handed a single-book
 * map it examines nothing and reads SKIPPED, reporting agreement it never tested.
 *
 * 🔴 CALLS `assertSameUnit` ON ITS OWN OUTPUT BEFORE RETURNING (R22) — a POSTCONDITION
 * SELF-CHECK, not an independent audit; see `assertSameUnit`'s docstring. Tier-0 provenance is
 * `{glossary, payloadText}`, both under `books/<book>/glossary/`, so no key is in
 * `EXTRACTION_DERIVED` and I4's vintage clause is vacuous here by construction — no
 * `extractRunStartedAt` is passed, and none should be invented for a book-scoped tier that has
 * no extraction step.
 *
 * @param {{book: string, kind?: string, module?: string}} unit
 * @returns {{ctx: object, provenance: object}}
 */
export function loadTier0Ctx(unit) {
  const gPath = glossaryPath(unit.book);
  const payloadText = readOrNull(gPath);
  const glossary = parseJsonStrict(payloadText, isPlainRecord);

  const glossariesByBook = {};
  for (const b of RUN_BOOKS) {
    const g = parseJsonStrict(readOrNull(glossaryPath(b)), isPlainRecord);
    if (g) glossariesByBook[b] = g;
  }

  const raw = spawnGlossaryPayloadCheck(unit.book);
  const payloadVerdict = isPlainRecord(raw) && typeof raw.producer === 'string' ? raw : null;

  const ctx = { book: unit.book, glossary, glossariesByBook, payloadVerdict };
  if (payloadText !== null) ctx.payloadText = payloadText;

  const provenance = provenanceFor(unit, { glossary: gPath, payloadText: gPath });
  assertSameUnit(unit, provenance);
  return { ctx, provenance };
}

/** Scope keys the loader supplies for every unit kind. */
export const BOOK_KEYS = Object.freeze([
  'book',
  // 🔴 WIDENED PAST THE TASK BRIEF'S LITERAL `['book']`, AND THE WIDENING IS LOAD-BEARING.
  // These four are book-scoped: they depend on `unit.book` alone, so the loader supplies
  // them for EVERY unit kind. Leaving them out made `CTX_CAPABILITY` untruthful, and
  // `sentinelCtxFor` — whose docstring promises "a well-formed value for every key
  // CTX_CAPABILITY[kind] declares" — would then build a probe carrying no Tier-0 key at all,
  // so G1-G5 would every one SKIP and `judgeableIds(0, kind)` would THROW on the empty subset.
  'glossary',
  'glossariesByBook',
  'payloadText',
  'payloadVerdict',
]);
export const MODULE_KEYS = Object.freeze([
  'chapter',
  'module',
  'locked',
  'handEdits',
  'inputs',
  'force',
  'costEstimate',
  'emittedFiles',
]);

/** The three unit kinds the corpus actually contains — see `unitsFor`. */
export const UNIT_KINDS = Object.freeze(['module', 'exercises', 'chapter-metadata']);

/**
 * What the loader CAN supply, per unit kind. Not a table of what each CHECK requires —
 * [LEAD] ruled against that enumeration, and `judgeableIds` probes the checks by execution.
 *
 * ⚠️ ONLY `module` CARRIES `cnxml`, AND THAT IS A MEASURED PROPERTY OF THE CORPUS, NOT A
 * SIMPLIFICATION. Exercises are NOT source-less in general — organic keeps 1,961 exercise
 * JSONs under the read-only source tree — but they have no CNXML: nothing named
 * `exercises*.cnxml` exists in either book. `chapter-metadata` units carry `SEG:chapter:…`
 * markers and have no source module at all.
 *
 * 🔴 `committedExtract` AND `freshExtract` ARE DECLARED FOR ALL THREE KINDS BECAUSE THE
 * LOADER SUPPLIES THEM FOR ALL THREE, AND THE TABLE'S ONLY JOB IS TO BE TRUE. They were
 * missing until 2026-08-28, which under-declared the table by exactly the two keys E7 reads
 * — and E7 is judgeable on ALL THREE kinds today. An N2/Task-5 author reasoning from the
 * table ("no kind declares them, so E7 cannot be judgeable anywhere, so its exclusion is
 * expected") would have written an invariant test that tolerates a blocking check being
 * dropped. ▶ Both containment directions are now pinned in `remt-ctx.test.js`; the reverse
 * one — every sentinel key is DECLARED — is the direction that actually failed.
 * ⚠️ They are listed here, beside `cnxml`/`segText`, rather than folded into `MODULE_KEYS`,
 * because this file's convention is that CONDITIONAL keys live in the per-kind table:
 * `MODULE_KEYS` names what is always set, these are set only when `isSnapshot` accepts the
 * driver's value.
 */
export const CTX_CAPABILITY = Object.freeze({
  module: new Set([
    ...BOOK_KEYS,
    ...MODULE_KEYS,
    'cnxml',
    'segText',
    'committedExtract',
    'freshExtract',
  ]),
  exercises: new Set([...BOOK_KEYS, ...MODULE_KEYS, 'segText', 'committedExtract', 'freshExtract']),
  'chapter-metadata': new Set([
    ...BOOK_KEYS,
    ...MODULE_KEYS,
    'segText',
    'committedExtract',
    'freshExtract',
  ]),
});

/** ctx keys whose value is produced by the extract step — the population I4's vintage clause covers. */
export const EXTRACTION_DERIVED = new Set(['segText', 'emittedFiles', 'freshExtract']);

/**
 * `chNN` | `appendices` — the on-disk chapter directory for a BARE chapter value.
 *
 * 🔴 ONE HELPER, CALLED BY EVERY PATH BUILDER HERE, SO THEY CANNOT DISAGREE. Two traps meet
 * in this line. `String('appendices').padStart(2,'0')` is a no-op, so the naive
 * `ch${…}` template builds `chappendices` — a directory that has never existed — and
 * chemistry keeps 12 live appendix units whose four source-side blocking checks would then
 * SKIP over source that is right there. And chapter `0` is FALSY, so `if (!chapter)` drops
 * chemistry's ch00 preface: the guard below tests for null/undefined explicitly.
 */
export function chapterDirOf(chapter) {
  if (chapter === null || chapter === undefined || chapter === '') {
    throw new Error(`remt-ctx: chapter is required, got ${JSON.stringify(chapter)}`);
  }
  const raw = String(chapter);
  return raw === 'appendices' ? 'appendices' : `ch${raw.padStart(2, '0')}`;
}

/** `books/<slug>/02-mt-output/chNN/<module>-segments.is.md` — the path isMtLocked() is given. */
export function mtOutputPathFor(unit) {
  return path.join(
    bookDir(unit.book),
    '02-mt-output',
    chapterDirOf(unit.chapter),
    `${unit.module}-segments.is.md`
  );
}

/** `books/<slug>/01-source/chNN/<module>.cnxml` — read-only, never written by this module. */
const cnxmlPathFor = (unit) =>
  path.join(bookDir(unit.book), '01-source', chapterDirOf(unit.chapter), `${unit.module}.cnxml`);

/** `books/<slug>/02-for-mt/chNN/<module>-segments.en.md`. */
const segPathFor = (unit) =>
  path.join(
    bookDir(unit.book),
    '02-for-mt',
    chapterDirOf(unit.chapter),
    `${unit.module}-segments.en.md`
  );

/**
 * Commits that touched this module's `02-mt-output` baseline -> string[] of subjects.
 * Always an array; never throws.
 *
 * 🔴 THIS CLASSIFIES BY PATH ONLY, AND THE DIFF CLASSIFICATION E9's DOCSTRING ASKS FOR IS
 * NOT MECHANICALLY DERIVABLE. E9 says "classify by path, then by DIFF — never by commit
 * subject". Measured 2026-08-27, the two shapes are indistinguishable in the diff:
 *   `6240cd64` "data(C67): HAND-REPAIR of READ-ONLY 02-mt-output" — 1 file, 1 `.is.md`,
 *              0 provenance sidecars  → a real hand edit
 *   `827424da` "fix(glossary): repair book-wide term aggregates"  — 29 files, 5 `.is.md`,
 *              0 provenance sidecars  → a re-translation
 * The provenance sidecar is not the discriminator either: it was BACKFILLED wholesale by
 * `70676f88`, so it under-reports by construction (project memory: "git is the real index").
 *
 * ▶ SO THE CEILING IS STATED RATHER THAN PAPERED OVER: on today's tree **220 of 220** units
 * have at least one such commit (control: a path with no history returns 0), so E9 will
 * report a `preflight/handEdits` finding for every unit and, being blocking, halt the run.
 * That is a DRIVER-level and runbook-L3 problem — the triage is an explicit human act — and
 * inventing a heuristic here would ship a classifier nothing validated, whose first wrong
 * permissive answer silently clobbers an edited baseline. **The loader reports what git
 * knows; it does not decide what a hand edit is.**
 *
 * @param {object} unit
 * @returns {Promise<string[]>}
 */
export async function handEditCommits(unit) {
  const p = mtOutputPathFor(unit);
  try {
    const { stdout } = await execFileAsync('git', ['log', '--oneline', '--no-merges', '--', p], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout.split('\n').filter((line) => line.trim() !== '');
  } catch {
    // A git failure is not evidence of a clean baseline, but E9 reads an ARRAY as "checked".
    // Returning [] here would report "no hand edits" from an error, so the array is empty
    // only when git genuinely reported nothing. An error surfaces as a thrown load instead.
    throw new Error(`remt-ctx: git log failed for ${p} — cannot certify the MT baseline`);
  }
}

/**
 * `[{path, exists, bytes}]` for the unit's expected inputs. Always an array; never throws.
 *
 * ⚠️ CAPABILITY-SCOPED, NOT FIXED. Listing a `cnxml` for a source-less kind reports it as
 * `missing` — E9 leg 3 raises a finding on a blocking check for a file that cannot exist,
 * i.e. a false halt manufactured by the loader. The capability table is the single place
 * that decides, so this cannot drift from what `loadTier1Ctx` actually sets.
 * ⚠️ A ZERO-BYTE INPUT IS THE DANGEROUS SHAPE, not a missing one: it passes an existence
 * check and buys a full-price translation of nothing. `bytes` is reported so E9 can see it.
 */
export function expectedInputs(unit) {
  const wanted = [segPathFor(unit)];
  if (capabilityFor(unit).has('cnxml')) wanted.unshift(cnxmlPathFor(unit));
  return wanted.map((p) => {
    try {
      const st = fs.statSync(p);
      return { path: p, exists: st.isFile(), bytes: st.size };
    } catch {
      return { path: p, exists: false, bytes: 0 };
    }
  });
}

/**
 * `CTX_CAPABILITY[unit.kind]`, refusing an unrecognised kind rather than defaulting.
 *
 * 🔴 NO GUARD MAY DEFAULT, AND THE PERMISSIVE BRANCH HERE COSTS MONEY. A bare
 * `CTX_CAPABILITY[unit.kind]?.has('cnxml')` reads `false` for a unit whose `kind` is absent
 * or misspelt, so `expectedInputs` silently drops the source file from E9's leg 3 — the
 * blocking pre-flight then certifies a module whose source it never looked for. That is this
 * repo's `parseArgs` class exactly: a misremembered key is a no-op, not an error.
 */
function capabilityFor(unit) {
  const cap = CTX_CAPABILITY[unit?.kind];
  if (!cap) {
    throw new Error(
      `remt-ctx: unit.kind must be one of ${UNIT_KINDS.join(', ')}, got ${JSON.stringify(unit?.kind)}`
    );
  }
  return cap;
}

/** E7's snapshot shape, read from remt-checks-extract.js:571-580. NOT a guess. */
export const isSnapshot = (v) =>
  isPlainRecord(v) &&
  v.segIds instanceof Set &&
  v.segText instanceof Map &&
  v.equations instanceof Map &&
  typeof v.inlineAttrs === 'string';

/** The five members `loadTier1Ctx` calls. A missing one is a driver defect, not a content one. */
const RUN_STATE_FNS = Object.freeze([
  'costEstimateFor',
  'emittedFilesFor',
  'committedExtractFor',
  'freshExtractFor',
]);

/**
 * WHAT EACH `RUN_STATE_FNS` MEMBER MAY RETURN — the value half of the seam `requireRunState`
 * guards the existence half of. Keyed by the ctx key the value becomes.
 *
 * 🔴 `requireRunState` CHECKED ONLY THAT THE FOUR MEMBERS ARE FUNCTIONS, AND A FUNCTION
 * RETURNING THE WRONG THING WAS ACCEPTED IN SILENCE — three of the four with a measured cost:
 *   · `emittedFilesFor` → non-array: E6 SKIPs at `remt-checks-extract.js:961` ("missing an
 *     emittedFiles array"). This is the N2 incident — a BLOCKING check stopped on all 220 units
 *     with 23/23 tests passing and exit 0.
 *   · `committedExtractFor` / `freshExtractFor` → not a snapshot: the value was **dropped
 *     silently** by the `isSnapshot` guard below, the key never reached ctx, and E7 — also
 *     blocking — SKIPped. Measured 2026-08-29: either one alone costs E7 on all three kinds.
 *   · `costEstimateFor` → measured harmless to judgeability (E9 answers with `leg-not-checked`
 *     findings rather than SKIPping), and validated anyway: E9's leg 5 is a spend assertion,
 *     and a shapeless cost estimate is a driver defect whichever verdict it produces.
 *
 * ⚠️ NULLISH IS TOLERATED AND WRONG-SHAPE IS NOT, AND THE DISTINCTION IS THE WHOLE DESIGN.
 * `null`/`undefined` is a driver truthfully answering *"this run has not produced that yet"* —
 * which is the honest answer for any unit the loop has not reached, and the state the subset
 * probe is built to survive (see `probeRunStateFor`). A number, a string or a half-built object
 * is a driver DEFECT, and there is no unit for which it is the truth. Collapsing the two is how
 * a defect gets read as an absence and an absence gets read as "unjudgeable".
 */
const RUN_STATE_VALUE_CONTRACT = Object.freeze({
  costEstimate: {
    fn: 'costEstimateFor',
    wellFormed: isPlainRecord,
    expected: 'a record, `{isk, withForce: true}`',
  },
  emittedFiles: {
    fn: 'emittedFilesFor',
    wellFormed: Array.isArray,
    expected: 'an ARRAY of listing entries (E6 SKIPs on anything else)',
  },
  committedExtract: {
    fn: 'committedExtractFor',
    wellFormed: isSnapshot,
    expected: '{segIds:Set, segText:Map, equations:Map, inlineAttrs:string}',
  },
  freshExtract: {
    fn: 'freshExtractFor',
    wellFormed: isSnapshot,
    expected: '{segIds:Set, segText:Map, equations:Map, inlineAttrs:string}',
  },
});

/**
 * Call one `RUN_STATE_FNS` member and hold it to `RUN_STATE_VALUE_CONTRACT`. Returns the value,
 * `null`/`undefined` unchanged, or THROWS naming the unit, the ctx key and the function.
 *
 * ⚠️ CALLED EXACTLY ONCE PER KEY PER LOAD, from `loadTier1Ctx`. A driver's accessor is
 * documented to return a value it already holds, not to compute one — but `costEstimateFor`
 * stands for `api-translate --force --dry-run`, so calling it twice to validate it separately
 * would be a second spawn per unit over a 220-unit run.
 */
function runStateValue(unit, runState, key) {
  const { fn, wellFormed, expected } = RUN_STATE_VALUE_CONTRACT[key];
  const v = runState[fn](unit);
  if (v === null || v === undefined) return v; // "this run has not produced that yet"
  if (!wellFormed(v)) {
    throw new Error(
      `remt-ctx: runState.${fn}(${unitLabel(unit)}) returned a value the loader cannot use as ` +
        `ctx.${key}: expected ${expected}, got ${Array.isArray(v) ? 'array' : typeof v} ` +
        `${JSON.stringify(v)?.slice(0, 80)}. This is a DRIVER defect, not a content one — a ` +
        `wrong shape here is dropped silently and costs a BLOCKING check its verdict, so it ` +
        `fails here instead. Return null/undefined to say the run has not produced it yet.`
    );
  }
  return v;
}

/**
 * The loader/driver seam, guarded loudly. Without this a missing member surfaces as
 * `TypeError: runState.costEstimateFor is not a function` from deep inside the loader —
 * which reads as a loader bug, and which `runCheck` would convert into a content FAIL
 * against a module nobody looked at.
 */
function requireRunState(runState) {
  if (!isPlainRecord(runState)) {
    throw new Error(`remt-ctx: loadTier1Ctx needs the driver's runState, got ${typeof runState}`);
  }
  const missing = RUN_STATE_FNS.filter((f) => typeof runState[f] !== 'function');
  if (missing.length > 0) {
    throw new Error(`remt-ctx: runState is missing ${missing.join(', ')}`);
  }
}

/**
 * TIER 1 is MODULE-scoped ([LEAD] L136: the unit is the MODULE).
 *
 * ⚠️ `chapter` TAKES THE BARE STRING FORM — '4' | '04' | '0' | 'appendices'. Measured against
 * `readChapterFromDisk`: 'ch04', 'ch4', 'ch00' and -1 all read `{cnxml:[], html:[]}`, i.e.
 * EMPTY. 🔴 CLAUDE.md's Directory-Structure section prescribes `-1` as the appendix sentinel —
 * that is right for `chapterLabel.chapterDir()` and WRONG here. Pass the string.
 * ⚠️ `locked` comes from `isMtLocked()`, NOT `fs.existsSync` — the marker is a SIBLING
 * (`-segments.is.md` -> `-segments.locked`), so the two disagree in BOTH directions.
 * ⚠️ `emittedFiles` IS A LISTING, NOT A PATH. 🔴 **ONE RULE, TWO MODES — and this paragraph
 * replaces the two instructions that used to disagree** (this line said "THIS RUN's listing
 * only"; the shared test helper listed the COMMITTED tree and called itself "an approximation",
 * so a driver author reading both was told two different things about the same key):
 *   ▶ **THE RULE: the listing must describe the SAME VINTAGE as the rest of this ctx** — the
 *     same vintage `segText`/`cnxml` were read at, which is the vintage `extractRunStartedAt`
 *     declares. That is I4's vintage half stated for a key `provenanceFor` cannot stat, and it
 *     is the whole of the contract.
 *   · **Post-extract judgement** (`extractRunStartedAt` = the run's start): THIS RUN's output,
 *     and nothing else. The generated trees hold thousands of historical backups, and E6 is
 *     BLOCKING — hand it the committed tree here and it reports a clean sweep of the wrong
 *     vintage.
 *   · **Declared pre-extract pass** (`extractRunStartedAt: null`): the COMMITTED tree listing,
 *     because that is the vintage this pass is judging. `committedEmittedFilesFor` builds it,
 *     the test helper delegates to it, and the SUBSET PROBE runs in exactly this mode.
 *   ⚠️ Neither mode is an approximation of the other, and the two are not interchangeable: the
 *   stamp says which one this ctx is, so read the stamp before judging the listing.
 * ⚠️ `costEstimate` must come from `--force --dry-run`. A bare `--dry-run` reports ~0 ISK once
 * output exists — a wrong answer that looks like an answer. E9 refuses `withForce !== true`.
 *
 * 🔴 CALLS `assertSameUnit` ON ITS OWN OUTPUT BEFORE RETURNING (R22) — a POSTCONDITION
 * SELF-CHECK, not an independent audit; see `assertSameUnit`'s docstring. `runState`'s
 * `extractRunStartedAt` is passed through UNCHANGED, never defaulted: `undefined` must reach
 * `assertSameUnit` and throw when the driver forgot to thread the stamp, and an explicit `null`
 * must reach it and stand down for a declared pre-extract pass. Substituting either would defeat
 * the very state I4 added it to catch.
 *
 * @param {{book:string, chapter:string, module:string, kind:string}} unit
 * @param {object} runState the driver's, see requireRunState
 * @returns {Promise<{ctx: object, provenance: object}>}
 */
export async function loadTier1Ctx(unit, runState) {
  requireRunState(runState);
  const cnxmlPath = cnxmlPathFor(unit);
  const segPath = segPathFor(unit);

  const ctx = {
    book: unit.book,
    chapter: String(unit.chapter), // bare form; never `ch..`, never -1
    module: unit.module,
    locked: isMtLocked(mtOutputPathFor(unit)),
    handEdits: await handEditCommits(unit),
    inputs: expectedInputs(unit),
    force: runState.force === true,
    costEstimate: runStateValue(unit, runState, 'costEstimate'), // {isk, withForce:true}
    emittedFiles: runStateValue(unit, runState, 'emittedFiles'), // this ctx's VINTAGE; see below
  };

  const cnxml = readOrNull(cnxmlPath);
  if (cnxml !== null) ctx.cnxml = cnxml; // absent for source-less kinds
  const segText = readOrNull(segPath);
  if (segText !== null) ctx.segText = segText;

  // ⚠️ `runStateValue` has already REFUSED a present-but-shapeless snapshot, so reaching the
  // `isSnapshot` guard below now means the value is well-formed or nullish. Both guards stay:
  // the throw is about a driver defect, this one is about a legitimate "not produced yet".
  const committed = runStateValue(unit, runState, 'committedExtract');
  const fresh = runStateValue(unit, runState, 'freshExtract');
  if (isSnapshot(committed)) ctx.committedExtract = committed;
  if (isSnapshot(fresh)) ctx.freshExtract = fresh;

  const provenance = provenanceFor(
    unit,
    { cnxml: cnxmlPath, segText: segPath },
    { extractRunStartedAt: runState.extractRunStartedAt }
  );
  assertSameUnit(unit, provenance);

  return { ctx, provenance };
}

/** The `02-for-mt` EN segment file a unit is derived from — the round-trip of `unitsFor`. */
export const segPathOfUnit = (unit) => segPathFor(unit);

/** Live EN segment files end in exactly this. A dated backup and a `(b)` variant do not. */
const EN_SEGMENT_SUFFIX = '-segments.en.md';

/** Which unit kind a segment-file basename describes. */
function kindOfBasename(base) {
  if (base.startsWith('chapter-metadata')) return 'chapter-metadata';
  if (base.startsWith('exercises')) return 'exercises';
  return 'module';
}

/**
 * Every unit of `book`, in stable (chapter, module) order — I3's work-list.
 *
 * 🔴 IT WALKS `02-for-mt`, NOT `01-source`, AND THAT IS THE WHOLE POINT. A source-driven walk
 * silently drops the two kinds that have no source module: organic's 31 `exercises` bundles
 * (whose source is 1,961 JSONs under the read-only tree, not CNXML) and the 23
 * `chapter-metadata` units. Those are 54 of 220 units — a quarter of the work-list, and the
 * spender's list is what I3 must equal.
 *
 * ⚠️ `endsWith('-segments.en.md')` IS LOAD-BEARING TWICE OVER. It excludes dated backups
 * (`…-segments.en.md.backup.<ISO>`) and, less obviously, the **49 committed parenthesised
 * re-extract duplicates** (`m68865-segments(b).en.md`) — which are tracked, so no
 * untracked-file or gitignore-based filter can see them.
 *
 * ⚠️ `chapter` IS THE DIRECTORY'S BARE FORM, PADDING KEPT: `ch00` -> `'00'`, `appendices` ->
 * `'appendices'`. Keeping the padding is what makes a unit round-trip through `chapterDirOf`
 * to the directory it came from; `remt-ctx.test.js` asserts that over the whole population.
 *
 * ✅ MEASURED 2026-08-27 over the two kept books: **220 units = 166 module + 31 exercises +
 * 23 chapter-metadata**, and all 220 have an `02-mt-output` IS sibling. That reproduces the
 * register's 166 module pairs and its 220 exactly-paired basenames from one honest walk.
 * The unit is the LIVE `02-for-mt` EN segment file; the denominator is the two kept books.
 *
 * @param {string} book book slug
 * @returns {Array<{book:string, chapter:string, module:string, kind:string}>}
 */
export function unitsFor(book) {
  const root = path.join(bookDir(book), '02-for-mt');
  let chapterDirs = [];
  try {
    chapterDirs = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
  const units = [];
  for (const dir of chapterDirs) {
    const chapter = dir === 'appendices' ? 'appendices' : dir.replace(/^ch/, '');
    for (const f of fs.readdirSync(path.join(root, dir)).sort()) {
      if (!f.endsWith(EN_SEGMENT_SUFFIX)) continue;
      const moduleName = f.slice(0, -EN_SEGMENT_SUFFIX.length);
      units.push({ book, chapter, module: moduleName, kind: kindOfBasename(moduleName) });
    }
  }
  return units;
}

/**
 * The files that EXIST for `unit` today in the two generated trees — the COMMITTED-vintage
 * listing, derived from the read-only corpus and from nothing the run has done.
 *
 * 🔴 THIS IS NOT A SUBSTITUTE FOR THE RUN'S OWN `emittedFiles`, AND THE TWO ARE NOT
 * INTERCHANGEABLE — see `loadTier1Ctx`'s `emittedFiles` note for the one rule that covers both.
 * It exists because the SUBSET PROBE asks a question about a unit the run has not reached, and
 * the committed tree is the only honest listing for such a unit. It is exactly what a declared
 * **pre-extract pass** (`extractRunStartedAt: null`) holds, which is what the probe declares
 * itself to be.
 *
 * ⚠️ IT DELIBERATELY INCLUDES THE UNIT'S OWN DATED BACKUPS. `safeWrite` mints one per rewritten
 * output, and E6's backup ACCOUNTING (an orphan is a finding, an accompanied backup is not) is
 * only exercised when they are present — a listing filtered down to "clean" names would probe
 * E6 against shapes the tree does not contain.
 *
 * ⚠️ SINGLE CONSTRUCTION POINT: `tools/__tests__/helpers/remt-run-state.js` DELEGATES here
 * rather than keeping its own copy. Its previous private copy was byte-identical in behaviour
 * (verified over all 220 units when it was moved); the hazard of two copies is the one that
 * file's own header names — change the chapter padding and the fixture lists from `chNN` while
 * the loader reads `chNNN`, and E6 returns a plausible verdict over another unit's directory.
 *
 * @param {{book:string, chapter:string, module:string}} unit
 * @returns {string[]} bare file names, never paths
 */
export function committedEmittedFilesFor(unit) {
  const chDir = chapterDirOf(unit.chapter);
  const out = [];
  for (const tree of ['02-for-mt', '02-structure']) {
    const dir = path.join(bookDir(unit.book), tree, chDir);
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names) if (n.startsWith(`${unit.module}-`)) out.push(n);
  }
  return out;
}

/** How many representatives the subset probe runs per unit kind. See `representativeUnitsFor`. */
export const PROBE_REPRESENTATIVES = 3;

/** `book/chapter/module`, for error messages that have to name which unit disagreed. */
const unitLabel = (u) => `${u.book}/${u.chapter}/${u.module}`;

/**
 * `count` real units of `kind`, SPREAD across the corpus. Throws if the kind has no member.
 *
 * 🔴 SPREAD, NOT THE FIRST N, AND THE DIFFERENCE IS THE WHOLE POINT. `unitsFor` sorts chapter
 * dirs lexically, so `'appendices' < 'ch00'` and the first three `module` units are three
 * chemistry APPENDIX modules from one directory — a sample that agrees with itself by
 * construction. Taking first / middle / last spans both books and three chapter shapes.
 *
 * ⚠️ A KIND WITH FEWER THAN `count` UNITS GETS WHAT EXISTS — the probe is then weaker for that
 * kind, and `judgeableIds`' agreement check degenerates to a tautology at exactly one unit.
 * Measured 2026-08-28: module 166, exercises 31, chapter-metadata 23, so all three kinds are
 * genuinely sampled today.
 */
export function representativeUnitsFor(kind, count = PROBE_REPRESENTATIVES) {
  const pool = RUN_BOOKS.flatMap((book) => unitsFor(book)).filter((u) => u.kind === kind);
  if (pool.length === 0) {
    throw new Error(
      `remt-ctx: no unit of kind '${kind}' exists in ${RUN_BOOKS.join(', ')} — the subset probe has nothing real to build a sentinel from`
    );
  }
  if (count <= 1) return [pool[0]];
  if (pool.length <= count) return pool;
  const step = (pool.length - 1) / (count - 1);
  const picked = [...new Set(Array.from({ length: count }, (_, i) => Math.round(i * step)))];
  return picked.map((i) => pool[i]);
}

/** A real unit of `kind`, from the live corpus. Throws if the kind has no member. */
export function representativeUnitFor(kind) {
  return representativeUnitsFor(kind, 1)[0];
}

/**
 * Tier-dispatching convenience used by Task N2, Task 5 and Task 6.
 *
 * 🔴 IT REFUSES EVERY TIER IT DOES NOT HANDLE. It used to be
 * `tier === 0 ? loadTier0Ctx(unit) : loadTier1Ctx(unit, runState)`, i.e. it DEFAULTED every
 * non-zero tier to Tier 1 — the exact class `chapterDirOf` and `capabilityFor` refuse, six
 * lines under a docstring that says NO GUARD MAY DEFAULT. Measured before the fix:
 * `loadCtx(2, …)`, `loadCtx(4, …)`, `loadCtx('x', …)` and `loadCtx(undefined, …)` all
 * returned a 13-key Tier-1 ctx and reported success.
 *
 * 🔴 A STRING TIER IS REFUSED, NOT COERCED, AND THAT IS THE DECISION THIS DOCSTRING EXISTS TO
 * RECORD. `'0' === 0` is false, so the old ternary sent the STRING `'0'` to Tier 1 and handed
 * back a ctx with no glossary key at all (`'glossary' in ctx` → `false`); run Tier 0 over that
 * and all five of G1-G5 SKIP, four of them blocking — the pre-spend glossary gate reporting
 * nothing while looking like a tier that found nothing to judge. That value arrives from
 * exactly one place: a resumed driver reading the tier out of the JSON ledger, which the plan
 * requires to be safe on a cold machine days apart with the ledger as the only memory.
 * ▶ Coercing it here would hide a driver defect at the one seam that can still see it, so the
 * fix belongs at the ledger boundary: `Number(entry.tier)`. The throw says so.
 *
 * @param {0|1} tier the NUMBER 0 or 1 — never a string
 */
export async function loadCtx(tier, unit, runState) {
  if (tier === 0) return loadTier0Ctx(unit);
  if (tier === 1) return loadTier1Ctx(unit, runState);
  throw new Error(
    `remt-ctx: loadCtx handles tier 0 and tier 1 only, got ${JSON.stringify(tier)} ` +
      `(${typeof tier}). Tiers 2-4 are deferred and have no loader. A STRING tier is refused ` +
      `rather than coerced — if this came from the ledger, convert it there with ` +
      `Number(entry.tier) so a bad value fails at the ledger and not silently as Tier 1.`
  );
}

/**
 * A ctx with a WELL-FORMED value for every key `CTX_CAPABILITY[kind]` declares. Used ONLY to
 * probe the judgeable subset — never in a real run.
 *
 * 🔴 IT MUST TAKE `runState`. Four of E9's five legs and ALL of E6's input come from it
 * (`costEstimate`, `emittedFiles`, `force`; plus E7's two snapshots). A probe handed no
 * runState makes E9 and E6 SKIP, excluding the two blocking checks with the most loader
 * obligations from EVERY unit kind — and the probe and the invariant would then agree with
 * each other and disagree with the run, green forever.
 *
 * 🔴 IT MERGES BOTH TIERS, WHICH THE TASK BRIEF'S `loadCtx(1, …)` DID NOT. The Tier-0 keys are
 * book-scoped, so they are supplied for every unit kind and belong in the sentinel; without
 * them `judgeableIds(0, kind)` probes G1-G5 against a Tier-1 ctx, all five SKIP, and the
 * empty-subset guard THROWS on a set that is in fact fully judgeable.
 *
 * ⚠️ Built by calling the REAL loader on a REAL unit, never by hand — with an empty or
 * hand-built population, the probe and the checks agree with each other and disagree with
 * the producer.
 */
export async function sentinelCtxFor(kind, runState) {
  return sentinelCtxForUnit(representativeUnitFor(kind), runState);
}

/**
 * The ctx keys whose value comes from THE RUN rather than from the read-only corpus. Derived
 * from `RUN_STATE_VALUE_CONTRACT` so the two cannot drift — this is the same population, named
 * for the question A3's guard asks of it.
 *
 * 🔑 THIS IS THE DISCRIMINATOR THAT MAKES "MAY THIS EXCLUSION STAND?" ANSWERABLE. A blocking
 * check may be excluded when it is STRUCTURALLY unjudgeable for a unit kind — `E1/E2/E4/E5` for
 * `exercises` and `chapter-metadata` are exactly that, and their exclusion is correct: those
 * kinds have no CNXML, a fact derived from files on disk that no run can change. It may NOT be
 * excluded because a value the RUN supplies was missing, empty or unusable, because that is a
 * statement about how far the loop has got — and the subset is cached for the process and
 * applied to every unit of the kind.
 * ▶ So the rule is about the PROVENANCE of the value, never about which check or which message.
 */
export const RUN_PROVENANCE_KEYS = Object.freeze(Object.keys(RUN_STATE_VALUE_CONTRACT));

/**
 * Is `v` a value the PROBE can decide a whole unit kind's subset on?
 *
 * 🔴 WELL-FORMED IS NOT ENOUGH — THE CONTAINER IS NOT THE PAYLOAD, AND THAT GAP IS THE MEASURED
 * DEFECT. `emittedFilesFor: () => []` returns a perfectly well-formed array; `Array.isArray`
 * accepts it, E6 classifies 0 entries, `runCheck` downgrades a zero-examined PASS to SKIPPED
 * (`remt-battery.js:187`), and E6 — BLOCKING — is recorded `excluded` for the entire kind.
 */
const usableForProbe = (key, v) =>
  RUN_STATE_VALUE_CONTRACT[key].wellFormed(v) && !(Array.isArray(v) && v.length === 0);

/**
 * The runState the PROBE loads its sentinel with: the driver's, with the two RUN-PROGRESS
 * values replaced by the corpus-derived ones a **declared pre-extract pass** holds.
 *
 * 🔴 WHY THE PROBE MUST NOT ASK THE DRIVER ABOUT RUN PROGRESS AT ALL. `probeJudgeableSubset`
 * samples `PROBE_REPRESENTATIVES` units SPREAD across the corpus — deliberately not the unit
 * being judged, because one unit deciding a whole kind is the failure the disagreement tripwire
 * exists for. At the moment the probe runs, the loop has not extracted those three units, so a
 * run-scoped driver obeying this file's own `emittedFiles` contract has **no honest answer**:
 * `[]` and `undefined` are the truthful ones, and BOTH are read as "unjudgeable". Measured on
 * this loader: `[]` costs E6 (blocking) on all three kinds, `undefined` likewise by the other
 * route, and neither ever SKIPs afterwards — an excluded check is never invoked, so I1's
 * SKIP-watching direction is structurally blind to it.
 * ▶ THE SUBSET IS A PROPERTY OF `(tier, kind, loader capability, registry)`. It is NOT a
 * property of how far the run has got — which is why it is CACHED for the process. A probe that
 * consults run progress is asking a different question from the one it caches the answer to.
 *
 * ── THE TWO SUBSTITUTIONS, AND WHY THEY ARE ONE DECISION ──
 * The probe declares itself a **pre-extract pass**, which is an existing, first-class mode of
 * this loop (`assertSameUnit` state 3), and takes both of that mode's values:
 *   · `extractRunStartedAt: null` — an explicit "no vintage claimed". Without it I4's vintage
 *     clause throws on the first real invocation: the driver's stamp is the run's start, the
 *     representatives' sources are committed and therefore older, and the probe dies before it
 *     can answer anything (measured, 3 of 3 unit kinds). The probe asks a CAPABILITY question
 *     — *can this check reach a verdict from the keys the loader can supply for this kind?* —
 *     and a capability does not have a vintage. A JUDGED unit is the opposite case and keeps
 *     the clause in full: it is about to be spent on, so its sources must be this run's.
 *   · `emittedFilesFor` → `committedEmittedFilesFor` — the committed-tree listing, which is
 *     precisely what a pre-extract pass holds, and which is derived from the corpus rather than
 *     from run progress.
 *
 * ⚠️ WHY THE TWO EXTRACT SNAPSHOTS ARE *NOT* SUBSTITUTED, THOUGH THEY ARE RUN-PROGRESS-DEPENDENT
 * TOO. The loader can DERIVE a listing from the read-only corpus; it cannot derive an extraction
 * snapshot — the real producers (`segMap`, `eqMap`, `loadCommitted`, `loadDisk`) are module-local
 * and unexported in `tools/verify-reextract-equivalence.js`, so the loader would have to INVENT
 * a fixture, and a probe built from an invented population agrees with the checks and disagrees
 * with the producer. So the rule is: **substitute what the corpus can supply; for what it
 * cannot, refuse to exclude a blocking check and say so** — which is what `probeJudgeableSubset`
 * does next. Measured 2026-08-29: withholding either snapshot costs E7, also blocking.
 *
 * 🔴 SUBSTITUTED ON THE runState, BEFORE `loadCtx` — NEVER ON THE ctx THE LOADER RETURNED.
 * Patching the returned ctx would overwrite loader-side damage with the probe's own value: the
 * N2 mutation (`emittedFiles: undefined` inside `loadTier1Ctx`) would be repaired on its way
 * out, E6 would judge, `EXPECTED_SUBSET` would stay green, and the cross-side anchor R20 exists
 * for would be gone with the suite green. Both placements pass the honest-`[]` regression test,
 * so no test here discriminates them — only this comment and the re-run of Mutation B do.
 */
function probeRunStateFor(runState) {
  return {
    ...runState,
    extractRunStartedAt: null, // state 3: an explicit "no vintage claimed"
    emittedFilesFor: committedEmittedFilesFor,
  };
}

/** The same sentinel, for a NAMED unit — what `judgeableIds` probes each representative with. */
async function sentinelCtxForUnit(unit, runState) {
  const probeState = probeRunStateFor(runState);
  const { ctx: tier0 } = await loadCtx(0, unit, probeState);
  const { ctx: tier1 } = await loadCtx(1, unit, probeState);
  return { ...tier0, ...tier1 };
}

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
 * whatever SKIPs is structurally unjudgeable for the kind — repeated over
 * `PROBE_REPRESENTATIVES` units spread across the corpus, because ONE unit deciding the subset
 * for a whole kind is how four blocking checks stop running corpus-wide in silence. See
 * `probeJudgeableSubset`, which owns the probe and the disagreement throw.
 *
 * ▶ L136 condition (a) — E3 on every source-less unit — then holds BY CONSTRUCTION rather than
 * by decree, because E3 reads only `segText`, which the loader supplies for every kind.
 * ▶ And condition (c) — exclusions REPORTED PER UNIT — is satisfied by returning them, not by
 * dropping them silently.
 *
 * ⚠️ THE CACHE IS KEYED ON `tier:kind` AND NOT ON `runState`, so the FIRST runState a process
 * probes with decides the subset for that process. That is correct for a run (one driver, one
 * runState) and is stated because it is not obvious: a test that probes with a deliberately
 * impoverished runState would poison the cache for every later call in the same file.
 * ▶ **`resetSubsetCache()` is the way back** (added 2026-08-29 — there was none before, and a
 * grep for `subsetCache` found no invalidation anywhere in `tools/`). Its docstring says what a
 * driver must call and when.
 */
const subsetCache = new Map();

/**
 * The probe itself, WITHOUT the cache — `judgeableIds` is the memoised wrapper.
 *
 * 🔴 IT PROBES `PROBE_REPRESENTATIVES` UNITS AND REFUSES TO PROCEED IF THEY DISAGREE. One
 * representative used to decide the subset for a whole unit kind, and the mechanism that would
 * hide a mistake is the same one I1 is scoped to. The failure: a module unit with an absent or
 * zero-byte `cnxml` sorts first, `skipIfCtxUnusable` makes E1/E2/E4/E5 SKIP during the probe,
 * all four are recorded `excluded`, `ids` is still non-empty so the empty-subset guard never
 * fires — and **four blocking checks silently stop running over all 166 modules**. Nothing can
 * see it after the fact: a check that was EXCLUDED is never invoked, so it never SKIPs, so an
 * invariant that watches for SKIPs is structurally blind to it.
 *
 * ▶ SO THE DISAGREEMENT IS THE SIGNAL, AND IT IS FATAL RATHER THAN AVERAGED. The union is what
 * gets cached, but a union computed from representatives that disagree would silently apply one
 * unit's ctx damage — or one unit's extra capability — to every unit of the kind. Throwing names
 * the kind, the checks, and the units on each side, which is the whole diagnosis.
 *
 * ✅ MEASURED 2026-08-28 over first/middle/last of every kind, both tiers: all three agree
 * everywhere (module `G1-G5` / `E1,E2,E3,E4,E5,E6,E7,E9`; exercises and chapter-metadata
 * `G1-G5` / `E3,E6,E7,E9`). So the throw is a tripwire on a corpus that is uniform today, not
 * a live failure.
 */
export async function probeJudgeableSubset(tier, kind, runState) {
  const tierChecks = [...REGISTRY.values()].filter((c) => c.tier === tier);
  const probes = representativeUnitsFor(kind);
  const perUnit = [];
  for (const unit of probes) {
    const sentinel = await sentinelCtxForUnit(unit, runState);
    const judged = new Set();
    for (const check of tierChecks) {
      const r = await runCheck(check, sentinel);
      if (r.verdict !== VERDICT.SKIPPED) judged.add(check.id);
    }
    // Recorded per representative, from the SENTINEL rather than from the runState, so that
    // loader-side damage counts too: under the N2 mutation the driver's value is fine and the
    // ctx key is `undefined`, and it is the ctx the checks were actually judged on.
    const unusable = RUN_PROVENANCE_KEYS.filter((k) => !usableForProbe(k, sentinel[k]));
    perUnit.push({ unit, judged, unusable });
  }

  const disagreed = tierChecks.filter(
    (c) => perUnit.some((p) => p.judged.has(c.id)) && perUnit.some((p) => !p.judged.has(c.id))
  );
  if (disagreed.length > 0) {
    const detail = disagreed
      .map((c) => {
        const yes = perUnit.filter((p) => p.judged.has(c.id)).map((p) => unitLabel(p.unit));
        const no = perUnit.filter((p) => !p.judged.has(c.id)).map((p) => unitLabel(p.unit));
        return `${c.id} judgeable on [${yes.join(' ')}] but SKIPPED on [${no.join(' ')}]`;
      })
      .join('; ');
    throw new Error(
      `remt-ctx: tier ${tier}'s judgeable subset DISAGREES across the ${perUnit.length} ` +
        `representatives of unit kind '${kind}' — ${detail}. A subset probed from ONE unit is ` +
        `cached and applied to every unit of the kind, so this is how a blocking check stops ` +
        `running corpus-wide without ever SKIPping. Fix the ctx for the representative that ` +
        `SKIPped, or split the unit kind; do not widen the sample until they agree.`
    );
  }

  const ids = tierChecks.filter((c) => perUnit.some((p) => p.judged.has(c.id))).map((c) => c.id);
  const excluded = tierChecks.filter((c) => !ids.includes(c.id)).map((c) => c.id);

  // ── A3: AN EXCLUSION MUST BE STRUCTURAL. IT MAY NEVER BE A STATEMENT ABOUT RUN PROGRESS ──
  //
  // 🔴 THE INVARIANT, NOT THE MECHANISM: a BLOCKING check may be dropped from a unit kind only
  // when the loader structurally cannot supply what it needs for that kind — a fact about files
  // on disk, which no run can change. `E1/E2/E4/E5` on `exercises`/`chapter-metadata` are
  // exactly that and are excluded correctly: those kinds have no CNXML. What may NOT drop a
  // blocking check is a value the RUN supplies (`RUN_PROVENANCE_KEYS`) arriving missing, empty
  // or unusable — that says only that the loop has not got there yet, and the subset is cached
  // for the process and applied to every unit of the kind. A blanket "never exclude a blocking
  // check" would be wrong and would fire on those four legitimate exclusions every run.
  //
  // ⚠️ DELIBERATELY CONSERVATIVE, AND SAYING SO IS THE POINT: this cannot ATTRIBUTE a given
  // SKIP to a given key — the only honest attribution would be the check's own SKIP message,
  // and a guard keyed on message text is a guard keyed on the mechanism, which the mechanism
  // then walks past. So it refuses to exclude ANY blocking check while ANY run-provenance value
  // is unusable, which is a superset of the exclusions that are actually attributable. The cost
  // of the over-refusal is a loud, immediate throw naming the key and the accessor to fix; the
  // cost of under-refusing is a blocking gate silently retired over a ~51,267 ISK spend.
  const excludedBlocking = tierChecks.filter((c) => c.blocking && excluded.includes(c.id));
  const impoverished = perUnit.filter((p) => p.unusable.length > 0);
  if (excludedBlocking.length > 0 && impoverished.length > 0) {
    const keys = [...new Set(impoverished.flatMap((p) => p.unusable))];
    throw new Error(
      `remt-ctx: tier ${tier} would EXCLUDE the blocking check(s) ` +
        `${excludedBlocking.map((c) => c.id).join(', ')} from unit kind '${kind}', but the ` +
        `probe's own ctx was impoverished in a way that depends on RUN PROGRESS, so the ` +
        `exclusion is not credible: ` +
        impoverished
          .map(
            (p) =>
              `${unitLabel(p.unit)} has no usable ${p.unusable.map((k) => `ctx.${k}`).join(', ')}`
          )
          .join('; ') +
        `. Those values come from the driver — ` +
        `${keys.map((k) => `runState.${RUN_STATE_VALUE_CONTRACT[k].fn}`).join(', ')} — and an ` +
        `EXCLUDED check is never invoked, so it never SKIPs, so nothing downstream can see it ` +
        `stop running. An exclusion may only be STRUCTURAL (this kind has no such source on ` +
        `disk, as with E1/E2/E4/E5 and CNXML). ▶ Supply the value for the probe's ` +
        `representatives, or — if the run genuinely cannot produce it yet — note that the probe ` +
        `already declares itself a PRE-EXTRACT pass and substitutes what the corpus can supply ` +
        `(see probeRunStateFor); an extraction snapshot is not one of those, by design.`
    );
  }

  if (ids.length === 0) {
    throw new Error(
      `remt-ctx: tier ${tier} has an EMPTY judgeable subset for unit kind '${kind}' over ` +
        `${probes.map(unitLabel).join(', ')}. runTier would throw over it rather than report. ` +
        `Excluded: ${excluded.join(', ')}`
    );
  }
  return { ids, excluded };
}

export async function judgeableIds(tier, kind, runState) {
  const key = `${tier}:${kind}`;
  if (!subsetCache.has(key)) {
    subsetCache.set(key, await probeJudgeableSubset(tier, kind, runState));
  }
  return subsetCache.get(key).ids;
}

/** The exclusions, for L136 condition (c) — reported per unit, never dropped silently. */
export async function excludedIds(tier, kind, runState) {
  await judgeableIds(tier, kind, runState); // populates the cache
  return subsetCache.get(`${tier}:${kind}`).excluded;
}

/**
 * Forget every probed subset, so the next `judgeableIds`/`excludedIds` re-probes from scratch.
 *
 * 🔴 WITHOUT THIS THE FIRST runState A PROCESS PROBES WITH DECIDES THE SUBSET FOR THE LIFE OF
 * THE PROCESS, WITH NO WAY BACK. `subsetCache` is keyed on `tier:kind` and nothing else — a
 * grep for it across `tools/` returned only the lines inside this file, so before 2026-08-29
 * there was no invalidation or reset anywhere. That is correct for one run with one driver, and
 * it is exactly wrong for the two cases that follow.
 *
 * ── WHAT A DRIVER MUST CALL, AND WHEN ──
 *   · **On adopting a different runState in the same process** — a resumed run reading the
 *     ledger, a second book, or a retry that rebuilt its accessors. The cached subset was probed
 *     against the old one and is a claim about it.
 *   · **NOT between units of one run.** The subset is a property of `(tier, kind, loader
 *     capability, registry)`, so re-probing per unit would cost three sentinel loads per unit
 *     and could only ever return the same answer — the caching is the point.
 * ⚠️ A TEST THAT PROBES WITH A DELIBERATELY IMPOVERISHED runState MUST EITHER CALL THIS
 * AFTERWARDS OR USE `probeJudgeableSubset`, THE UNCACHED PROBE. Otherwise it poisons the cache
 * for every later call in the same file, and — because vitest runs a file's tests in source
 * order but that order is not the order you read them in — the poisoning surfaces as an
 * unrelated test failing somewhere below.
 */
export function resetSubsetCache() {
  subsetCache.clear();
}
