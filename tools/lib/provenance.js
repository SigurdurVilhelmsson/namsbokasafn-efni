import fs from 'fs';
import path from 'path';

export const SCHEMA_VERSION = 1;

// The only producers of 02-mt-output. tool -> restore policy.
//   'mutate'  -> run the web-UI restores and rewrite segments (external/docx MT can drop markers)
//   'warn'    -> compare-and-warn only; never mutate (api-translate preserves markers)
export const KNOWN_TOOLS = Object.freeze({
  'api-translate': 'warn',
  'docx-import': 'mutate',
});

export function restorePolicyFor(tool) {
  if (!Object.prototype.hasOwnProperty.call(KNOWN_TOOLS, tool)) {
    throw new Error(
      `Unknown provenance tool: ${JSON.stringify(tool)} ` +
        `(expected one of: ${Object.keys(KNOWN_TOOLS).join(', ')})`
    );
  }
  return KNOWN_TOOLS[tool];
}

export function provenancePath(mtOutputChapterDir, moduleId) {
  return path.join(mtOutputChapterDir, `${moduleId}-provenance.json`);
}

export function writeProvenance(mtOutputChapterDir, moduleId, { tool, generatedAt } = {}) {
  restorePolicyFor(tool); // validate before writing
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    tool,
    generatedAt: generatedAt || new Date().toISOString(),
  };
  fs.writeFileSync(
    provenancePath(mtOutputChapterDir, moduleId),
    JSON.stringify(payload, null, 2) + '\n',
    'utf8'
  );
  return payload;
}

export function readProvenance(mtOutputChapterDir, moduleId) {
  const p = provenancePath(mtOutputChapterDir, moduleId);
  if (!fs.existsSync(p)) return null;
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8')); // throws on malformed JSON
  restorePolicyFor(parsed.tool); // throws on unknown tool
  return parsed;
}

/**
 * Resolve the restore policy for a module from its MT origin (02-mt-output),
 * independent of which track inject is producing.
 * - sidecar present        -> its tool's policy
 * - sidecar absent + MT seg -> throw (real gap; needs backfill — never guess)
 * - no MT seg at all        -> 'warn' (content was authored directly, not via MT)
 */
export function resolveRestorePolicy({ mtOutputChapterDir, moduleId }) {
  const prov = readProvenance(mtOutputChapterDir, moduleId);
  if (prov) {
    return { policy: restorePolicyFor(prov.tool), tool: prov.tool, source: 'sidecar' };
  }
  const segPath = path.join(mtOutputChapterDir, `${moduleId}-segments.is.md`);
  if (fs.existsSync(segPath)) {
    throw new Error(
      `No provenance for ${moduleId} in ${mtOutputChapterDir}. ` +
        `Run: node tools/backfill-provenance.js --book <book> (refusing to guess producer).`
    );
  }
  return { policy: 'warn', tool: null, source: 'human-authored' };
}
