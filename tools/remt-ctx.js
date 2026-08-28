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

const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : String(ms));

/**
 * I4 IN ONE FUNCTION — **both halves**: same UNIT, and same extraction VINTAGE.
 *
 * Exported so N2 can drive it and so the driver can call it per unit; nothing in this loader
 * calls it, by design (a loader that asserted on its own output could not report a finding).
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
 *   4. a parseable epoch-ms number or ISO string → **enforced**. Unparseable throws rather
 *      than comparing against `NaN`, which is `false` for every operand and would read as
 *      drift.
 */
export function assertSameUnit(unit, provenance) {
  for (const [key, src] of Object.entries(provenance.sources)) {
    if (!src.path.includes(unit.module) && !src.path.includes('/glossary/')) {
      throw new Error(
        `remt-ctx: ctx key '${key}' does not belong to unit ${unit.module}: ${src.path}`
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
  if (!Number.isFinite(startedAt)) {
    throw new Error(
      `remt-ctx: provenance.extractRunStartedAt is unparseable for unit ${unit.module}: ` +
        `${JSON.stringify(claimed)} (${typeof claimed}). Expected epoch ms or an ISO string.`
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

  return { ctx, provenance: provenanceFor(unit, { glossary: gPath, payloadText: gPath }) };
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
 * ⚠️ `emittedFiles` is a LISTING, not a path, and MUST be scoped to THIS RUN's output — the
 * generated trees hold thousands of historical backups and E6 is BLOCKING.
 * ⚠️ `costEstimate` must come from `--force --dry-run`. A bare `--dry-run` reports ~0 ISK once
 * output exists — a wrong answer that looks like an answer. E9 refuses `withForce !== true`.
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
    costEstimate: runState.costEstimateFor(unit), // {isk, withForce:true}
    emittedFiles: runState.emittedFilesFor(unit), // THIS RUN's listing only
  };

  const cnxml = readOrNull(cnxmlPath);
  if (cnxml !== null) ctx.cnxml = cnxml; // absent for source-less kinds
  const segText = readOrNull(segPath);
  if (segText !== null) ctx.segText = segText;

  const committed = runState.committedExtractFor(unit);
  const fresh = runState.freshExtractFor(unit);
  if (isSnapshot(committed)) ctx.committedExtract = committed;
  if (isSnapshot(fresh)) ctx.freshExtract = fresh;

  return {
    ctx,
    provenance: provenanceFor(
      unit,
      { cnxml: cnxmlPath, segText: segPath },
      { extractRunStartedAt: runState.extractRunStartedAt }
    ),
  };
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

/** The same sentinel, for a NAMED unit — what `judgeableIds` probes each representative with. */
async function sentinelCtxForUnit(unit, runState) {
  const { ctx: tier0 } = await loadCtx(0, unit, runState);
  const { ctx: tier1 } = await loadCtx(1, unit, runState);
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
    perUnit.push({ unit, judged });
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
