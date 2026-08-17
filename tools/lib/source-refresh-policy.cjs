/**
 * §C93 — the licence-keyed `01-source` refresh gate.
 *
 * INVARIANT: a refresh may replace bytes only with identically-licensed bytes, in a book
 * whose recorded licence is on a closed refreshable allowlist, at paths on a closed write
 * allowlist, recording the superseded state append-only. Four conjunctive, fail-closed
 * conditions. COROLLARY: this tooling can never change a book's licence posture.
 *
 * ⚠️ This gate does NOT replace CLAUDE.md's three-step written consent, which is
 * unconditional and applies to every book regardless of licence. The gate converts an
 * ACCIDENT into an impossibility; consent governs the DELIBERATE act.
 */
const fs = require('fs');
const path = require('path');

/**
 * Licences whose books may be refreshed from upstream. EXACT string match, deliberately.
 * Do NOT normalise, lowercase, trim-fold or regex these — an unrecognised value must refuse,
 * and the fix is a reviewable edit to book-config.json, never a looser matcher.
 */
const REFRESHABLE = Object.freeze(new Set(['CC BY-NC-SA 4.0']));

/** Closed write allowlist. Anything not matched here is unreachable by a refresh. */
const WRITE_ALLOW = [
  /^ch\d{2}\/[^/]+\.cnxml$/,
  /^appendices\/[^/]+\.cnxml$/,
  /^media\/[^/]+$/,
];
const WRITE_ALLOW_EXACT = new Set([
  '.source-info.json',
  '.source-manifest.json',
  'collection-order.json',
]);

/**
 * G1 — the book gate. ONE argument, on purpose: there is nothing to pass, no options object,
 * no force, no env var. The write target IS the identity, so no caller can name one book and
 * write another.
 *
 * @param {string} sourceDir absolute path to a book's `01-source` directory
 * @throws if the book's recorded licence is not on the refreshable allowlist
 */
function assertRefreshable(sourceDir) {
  const configPath = path.join(sourceDir, '..', 'book-config.json');
  let code;
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const lic = cfg.licence || cfg.license;
    code = typeof lic === 'string' ? lic : lic && lic.code;
  } catch (err) {
    throw new Error(
      `§C93 G1 REFUSED: cannot read a licence for ${sourceDir} (${configPath}: ${err.message}). ` +
        `A refresh requires a recorded licence on the refreshable allowlist. This fails CLOSED ` +
        `on purpose — an unreadable config is not permission.`
    );
  }
  if (!REFRESHABLE.has(code)) {
    throw new Error(
      `§C93 G1 REFUSED: '${code}' is not refreshable. Refreshable: ${[...REFRESHABLE].join(', ')}. ` +
        `Books obtained while CC BY 4.0 (Chemistry, Biology, Microbiology) hold an IRREVOCABLE ` +
        `grant for those exact bytes; upstream is CC BY-NC-SA today, and because the per-module ` +
        `CNXML carries no licence element the substitution would be invisible in the files. ` +
        `There is no flag that overrides this.`
    );
  }
}

/**
 * G4 — the write-set gate. The ONE owner of "what a refresh may touch".
 *
 * `localOrigin` is a carve-out WITHIN the allowlist for bytes that did not come from
 * upstream and that no refetch restores — e.g. chemistry's re-authored `ch00/m68662.cnxml`.
 * It accepts file paths and directory prefixes (trailing `/`).
 *
 * @param {string} relPath path relative to `01-source`, POSIX separators
 * @param {Array<{path: string}>} localOrigin
 */
function assertWritePathAllowed(relPath, localOrigin = []) {
  if (relPath.includes('..') || path.isAbsolute(relPath)) {
    throw new Error(`§C93 G4 REFUSED: '${relPath}' escapes 01-source/.`);
  }
  const onList =
    WRITE_ALLOW_EXACT.has(relPath) || WRITE_ALLOW.some((re) => re.test(relPath));
  if (!onList) {
    throw new Error(
      `§C93 G4 REFUSED: '${relPath}' is not on the write allowlist. A refresh may touch only ` +
        `chNN/*.cnxml, appendices/*.cnxml, media/*, and the three metadata sidecars. This is ` +
        `what protects docx/ and exercises/, which sit outside every hash gate and which no ` +
        `refetch restores.`
    );
  }
  for (const entry of localOrigin || []) {
    const p = entry && entry.path;
    if (!p) continue;
    const hit = p.endsWith('/') ? relPath.startsWith(p) : relPath === p;
    if (hit) {
      throw new Error(
        `§C93 G4 REFUSED: '${relPath}' is declared localOrigin (${entry.reason || 'no reason recorded'}) ` +
          `— it did not come from upstream and a refresh must never overwrite it.`
      );
    }
  }
}

module.exports = { assertRefreshable, assertWritePathAllowed, REFRESHABLE };
