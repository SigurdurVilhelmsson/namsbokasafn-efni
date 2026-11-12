/**
 * g112-unserved-copies.js — the loader for a book's FROZEN list of Icelandic segment copies that
 * the re-MT battery must expect to be unserved.
 *
 * Why the list exists (design docs/superpowers/specs/2026-11-12-g112-duplicate-segment-ids-design.md
 * §3, §5.2-§5.3; ledger Ruling 10): the G1.12 re-extract emits each of chemistry's 285 nested-note
 * paragraphs ONCE in English, while the bought machine translation (`02-mt-output`, which is never
 * edited) keeps BOTH Icelandic copies. The editor serves the first copy, so the second is
 * unserved. A2b's `cross-side` leg and A3's unpaired list compare the two sides and would read
 * every such copy as damage.
 *
 * 🔴 THE KEY IS THE LIST, NEVER A SHAPE RULE. Nothing at run time can tell a paragraph that was
 * bought twice from one the paid MT duplicated, so "a surplus Icelandic copy of an id English has
 * is fine" would pass real damage. The list names each (moduleId, segmentId) exactly; a pair that
 * is not on it is judged as before. It is pinned BOTH ways against the committed corpus by
 * `tools/__tests__/g112-unserved-copies.test.js`, so a re-buy that drops a copy retires entries
 * loudly. It is generated, never hand-edited:
 * `test-results/g112-duplicate-ids-2026-11-12/make-unserved-list.mjs`.
 *
 * 🔴 ABSENT AND EMPTY ARE DIFFERENT STATES — the `loadAllowlistOrNull` pattern
 * (`tools/lib/fidelity-allowlist.js`, whose docstring records why: a loader that returns the same
 * value for "no file" and for "a file that lists nothing" makes the two indistinguishable to a
 * pure gate). So `null` means the book has no list; `{entries: []}` means it has one that lists
 * nothing. Both leave A2b and A3 judging every pair strictly, which is the fail-closed direction:
 * the list can only RELAX a comparison, never tighten one.
 *
 * 🔴 A FILE THAT EXISTS BUT IS MALFORMED THROWS. It is never coerced to "no list" or "empty", and
 * a wrong shape is not filtered entry by entry: a list that is half-readable is not a list.
 */
import fs from 'node:fs';
import path from 'node:path';

/** The book-level file name, beside `fidelity-allowlist.json`. */
export const UNSERVED_COPIES_FILE = 'g112-unserved-copies.json';

/** The only schema this loader reads. */
export const UNSERVED_COPIES_SCHEMA = 1;

const FIELDS = ['chapterDir', 'moduleId', 'segmentId'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Load a book's unserved-copies list.
 *
 * @param {string} bookDir e.g. `books/efnafraedi-2e`
 * @returns {{entries: Array<{chapterDir: string, moduleId: string, segmentId: string}>}|null}
 *   null iff `g112-unserved-copies.json` does not exist
 * @throws {Error} when the file exists but is not valid JSON, its `schema` is not 1, `entries` is
 *   not an array, or an entry is not an object of three non-empty strings whose `segmentId`
 *   belongs to its `moduleId`, or an entry is listed twice
 */
export function loadUnservedCopiesOrNull(bookDir) {
  const p = path.join(bookDir, UNSERVED_COPIES_FILE);
  if (!fs.existsSync(p)) return null;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`${p}: not valid JSON (${e.message})`);
  }
  const bad = (why) => new Error(`${p}: ${why}`);
  if (!isPlainObject(raw)) throw bad('the top level is not an object');
  if (raw.schema !== UNSERVED_COPIES_SCHEMA)
    throw bad(`schema must be ${UNSERVED_COPIES_SCHEMA}, got ${JSON.stringify(raw.schema)}`);
  if (!Array.isArray(raw.entries)) throw bad('entries is not an array');
  const seen = new Set();
  const entries = raw.entries.map((e, i) => {
    if (!isPlainObject(e)) throw bad(`entries[${i}] is not an object`);
    for (const f of FIELDS) {
      if (typeof e[f] !== 'string' || e[f] === '')
        throw bad(`entries[${i}].${f} must be a non-empty string`);
    }
    if (!e.segmentId.startsWith(`${e.moduleId}:`))
      throw bad(`entries[${i}].segmentId ${e.segmentId} is not in module ${e.moduleId}`);
    const key = `${e.moduleId}\t${e.segmentId}`;
    if (seen.has(key)) throw bad(`entries[${i}] lists ${e.segmentId} a second time`);
    seen.add(key);
    return { chapterDir: e.chapterDir, moduleId: e.moduleId, segmentId: e.segmentId };
  });
  return { entries };
}

/**
 * The listed segment ids of one module.
 *
 * @param {{entries: Array<{moduleId: string, segmentId: string}>}|null|undefined} list a value
 *   from `loadUnservedCopiesOrNull`; `null`/`undefined` means no list
 * @param {string} moduleId
 * @returns {Set<string>} empty for no list or an unlisted module
 * @throws {TypeError} when `list` is neither nullish nor an object with an `entries` array
 */
export function unservedIdsForModule(list, moduleId) {
  if (list == null) return new Set();
  if (!isPlainObject(list) || !Array.isArray(list.entries))
    throw new TypeError('unservedIdsForModule: the list has no entries array');
  return new Set(list.entries.filter((e) => e.moduleId === moduleId).map((e) => e.segmentId));
}
