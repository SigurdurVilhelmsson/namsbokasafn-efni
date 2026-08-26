import fs from 'fs';
import path from 'path';

/** Load a book's residue allowlist; {entries:[]} when absent (⇒ nothing tolerated). */
export function loadResidueAllowlist(bookDir) {
  const p = path.join(bookDir, 'residue-allowlist.json');
  if (!fs.existsSync(p)) return { entries: [] };
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { entries: Array.isArray(raw.entries) ? raw.entries : [] };
}

/**
 * The same load, but ABSENT and EMPTY are distinguishable — `null` when the file does
 * not exist. Use this wherever "no file" must not be read as "nothing is tolerated".
 *
 * 🔴 WHY THIS EXISTS, AND WHY `loadResidueAllowlist` IS NOT A SUBSTITUTE FOR IT.
 * `loadResidueAllowlist` returns `{ entries: [] }` for BOTH a missing file and a real
 * allowlist that tolerates nothing — the two states are byte-identical in its return
 * value. That is correct for `scan-residue.js`, which wants a usable object either way.
 * It is NOT correct for a consumer that must REFUSE the missing case: §C82 Plan B's `A5`
 * built a guard to reject an absent allowlist and the guard could never fire, because the
 * prescribed loader had already normalised "absent" into "present and empty".
 * ▶ This is CLAUDE.md's §C21 lesson verbatim — **a gate keyed on one representation of
 * "nothing" can be walked past by another representation of "nothing"** — and it cost a
 * silent zero-tolerance path where every human-triaged residue would report as a finding.
 * Found by adversarial review 2026-08-26, not by any test.
 *
 * @param {string} bookDir e.g. `books/efnafraedi-2e`
 * @returns {{entries: Array}|null} null iff `residue-allowlist.json` does not exist
 */
export function loadResidueAllowlistOrNull(bookDir) {
  if (!fs.existsSync(path.join(bookDir, 'residue-allowlist.json'))) return null;
  return loadResidueAllowlist(bookDir);
}

/**
 * The only classes that may tolerate a residue.
 * neutral-notation (item 9 follow-up): international scientific notation —
 * amino-acid sequences (Val-Tyr-Gly), chemical-formula chains — where the EN
 * bytes ARE the correct translation and no pattern can classify them safely.
 */
const VALID_CLASSES = new Set(['proper-noun', 'homograph-unit', 'neutral-notation']);

/**
 * Exact-match classify one residue segment. Unlisted, drifted, an invalid `class`,
 * or a missing `reason` → not tolerated (fail-loud, mirrors fidelity classifyDiff).
 */
export function classifyResidue(moduleId, segmentId, allowlist) {
  const e = (allowlist.entries || []).find(
    (x) => x.moduleId === moduleId && x.segmentId === segmentId
  );
  if (!e || !VALID_CLASSES.has(e.class) || !e.reason) return { tolerated: false };
  return { tolerated: true, class: e.class, reason: e.reason };
}
