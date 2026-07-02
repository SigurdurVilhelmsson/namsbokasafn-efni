import fs from 'fs';
import path from 'path';

/** Load a book's fidelity allowlist; {entries:[]} when absent (⇒ nothing is pre-explained). */
export function loadAllowlist(bookDir) {
  const p = path.join(bookDir, 'fidelity-allowlist.json');
  if (!fs.existsSync(p)) return { entries: [] };
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { entries: Array.isArray(raw.entries) ? raw.entries : [] };
}

/** Exact-match classify one discrepancy. Unlisted or drifted → unexplained (fail-loud). */
export function classifyDiff(moduleId, tag, diff, allowlist) {
  const e = (allowlist.entries || []).find(
    (x) => x.moduleId === moduleId && x.tag === tag && x.diff === diff
  );
  if (!e) return { status: 'unexplained' };
  const out = { status: e.class, reason: e.reason };
  if (e.pointer) out.pointer = e.pointer;
  return out;
}
