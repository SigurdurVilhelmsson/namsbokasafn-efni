import fs from 'fs';
import path from 'path';

/** Load a book's fidelity allowlist; {entries:[]} when absent (⇒ nothing is pre-explained). */
export function loadAllowlist(bookDir) {
  const p = path.join(bookDir, 'fidelity-allowlist.json');
  if (!fs.existsSync(p)) return { entries: [] };
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { entries: Array.isArray(raw.entries) ? raw.entries : [] };
}

/**
 * The same load, but ABSENT and EMPTY are distinguishable — `null` when the file does
 * not exist. Use this wherever "no file" must not be read as "nothing is pre-explained".
 *
 * 🔴 THE THIRD INSTANCE OF §C21/§C82 L57, AND THIS ONE HAS THREE REPRESENTATIONS OF
 * "NOTHING", NOT TWO. `loadAllowlist` returns `{ entries: [] }` for a MISSING FILE, for
 * `{"entries": []}`, and for `{"entries": null}` — all byte-identical in its return
 * value. That is correct for `cnxml-fidelity-check.js` and
 * `tools/lib/update-translation-errors.js`, which want a usable object either way. It is
 * NOT correct for a consumer that must REFUSE the missing case.
 * ▶ MEASURED 2026-08-26: of the six books with an `01-source`, exactly ONE
 * (`efnafraedi-2e`, 36 entries) has a `fidelity-allowlist.json`. **`lifraen-efnafraedi`
 * — the other kept book, and a live run target — has none.** So R1 over organic would
 * load "nothing is pre-explained" and be structurally unable to tell that apart from a
 * deliberately-empty allowlist. Gates are pure (Global Constraint 5), so no check can
 * distinguish them on its own; the fix has to live at the BOUNDARY, here.
 * ▶ This is the twin of `loadResidueAllowlistOrNull` in `tools/lib/residue-allowlist.js`,
 * added for A5 one task earlier. §C82 L41: when an L-item states a RULE, sweep the other
 * modules for it — this is that sweep landing.
 *
 * @param {string} bookDir e.g. `books/efnafraedi-2e`
 * @returns {{entries: Array}|null} null iff `fidelity-allowlist.json` does not exist
 */
export function loadAllowlistOrNull(bookDir) {
  if (!fs.existsSync(path.join(bookDir, 'fidelity-allowlist.json'))) return null;
  return loadAllowlist(bookDir);
}

/** The only classes that may explain-away a discrepancy. */
const VALID_CLASSES = new Set(['benign', 'known-loss-deferred']);

/**
 * Exact-match classify one discrepancy. Unlisted, drifted, OR a matched entry
 * with an invalid `class` → `unexplained` (fail-loud). The class guard is
 * load-bearing: a typo'd class must NOT silently escape counting or slip past
 * `green` — an unrecognized class is treated as no explanation at all.
 */
export function classifyDiff(moduleId, tag, diff, allowlist) {
  const e = (allowlist.entries || []).find(
    (x) => x.moduleId === moduleId && x.tag === tag && x.diff === diff
  );
  if (!e || !VALID_CLASSES.has(e.class)) return { status: 'unexplained' };
  // A real loss must stay tracked: a known-loss-deferred entry without a pointer
  // would count as "explained" and keep the manifest green — an untracked loss,
  // i.e. a weaker silent-green. Enforce the mandatory pointer here (fail-loud).
  if (e.class === 'known-loss-deferred' && !e.pointer) return { status: 'unexplained' };
  const out = { status: e.class, reason: e.reason };
  if (e.pointer) out.pointer = e.pointer;
  return out;
}
