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
