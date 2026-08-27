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
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

/** I4's assertion, exported so N2 can drive it and so the driver can call it per unit. */
export function assertSameUnit(unit, provenance) {
  for (const [key, src] of Object.entries(provenance.sources)) {
    if (!src.path.includes(unit.module) && !src.path.includes('/glossary/')) {
      throw new Error(
        `remt-ctx: ctx key '${key}' does not belong to unit ${unit.module}: ${src.path}`
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
