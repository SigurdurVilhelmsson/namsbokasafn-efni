import fs from 'fs';
import path from 'path';

/** Load a book's residue allowlist; {entries:[]} when absent (⇒ nothing tolerated). */
export function loadResidueAllowlist(bookDir) {
  const p = path.join(bookDir, 'residue-allowlist.json');
  if (!fs.existsSync(p)) return { entries: [] };
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { entries: Array.isArray(raw.entries) ? raw.entries : [] };
}

/** The only classes that may tolerate a residue. */
const VALID_CLASSES = new Set(['proper-noun', 'homograph-unit']);

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
