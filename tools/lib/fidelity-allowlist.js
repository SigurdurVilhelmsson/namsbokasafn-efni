import fs from 'fs';
import path from 'path';

/** Load a book's fidelity allowlist; {entries:[]} when absent (⇒ nothing is pre-explained). */
export function loadAllowlist(bookDir) {
  const p = path.join(bookDir, 'fidelity-allowlist.json');
  if (!fs.existsSync(p)) return { entries: [] };
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { entries: Array.isArray(raw.entries) ? raw.entries : [] };
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
  const out = { status: e.class, reason: e.reason };
  if (e.pointer) out.pointer = e.pointer;
  return out;
}
