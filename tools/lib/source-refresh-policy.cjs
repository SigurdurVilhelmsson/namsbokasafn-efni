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
// One-way: source-manifest.cjs requires only node builtins, so there is no cycle. The coupling
// is honest — this module's whole subject IS the state of a `01-source` directory, and "does it
// hold any CNXML" is part of that state, not a manifest concern borrowed from elsewhere.
const { listCnxmlFiles } = require('./source-manifest.cjs');

/**
 * Licences whose books may be refreshed from upstream. EXACT string match, deliberately.
 * Do NOT normalise, lowercase, trim-fold or regex these — an unrecognised value must refuse,
 * and the fix is a reviewable edit to book-config.json, never a looser matcher.
 */
const REFRESHABLE = Object.freeze(new Set(['CC BY-NC-SA 4.0']));

/** Closed write allowlist. Anything not matched here is unreachable by a refresh. */
const WRITE_ALLOW = [/^ch\d{2}\/[^/]+\.cnxml$/, /^appendices\/[^/]+\.cnxml$/, /^media\/[^/]+$/];
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
    // §C93 review M1: no book-config.json anywhere in the repo uses the American spelling
    // ("license") — the fallback that used to read `cfg.licence || cfg.license` was dead code
    // implying a second supported shape that does not exist. British spelling only.
    const lic = cfg.licence;
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
  const onList = WRITE_ALLOW_EXACT.has(relPath) || WRITE_ALLOW.some((re) => re.test(relPath));
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

/**
 * G2 — the vintage gate. `.source-info.json` must exist and carry a `commitHash`, and the new
 * upstream commit must differ from it. Absent → refuse: there is nothing to record as the OLD
 * commit. A refresh that would "supersede" itself with the commit it already holds is not a
 * refresh — it is bookkeeping for a no-op, and it would mint a `supersedes` entry that
 * describes no actual change.
 *
 * @param {string} sourceDir absolute path to a book's `01-source` directory
 * @param {string} newCommit the upstream commit sha the refresh is about to fetch — REQUIRED;
 *   an absent or empty value refuses, it does not skip the gate
 * @returns {{previousCommit: string}}
 * @throws if `newCommit` is absent or empty, or if `.source-info.json` is unreadable, has no
 *   `commitHash`, or holds a `commitHash` equal to `newCommit`
 */
function assertVintageAdvances(sourceDir, newCommit) {
  // Fail closed on an ABSENT sha. Until 2026-08-17 the only test involving `newCommit` was the
  // equality comparison at the bottom of this function — and `'<sha>' === undefined` is false,
  // so omitting the argument read as "the vintage advanced" and G2 stood down silently.
  // Measured: `undefined`, `null` and `''` all passed, while G3 refused all three. Same shape as
  // CLAUDE.md's durable rule that a gate keyed on one representation of "nothing" can be walked
  // past by another. Checked FIRST so the message names the real problem rather than blaming
  // .source-info.json.
  if (typeof newCommit !== 'string' || newCommit === '') {
    throw new Error(
      `§C93 G2 REFUSED: no upstream commit sha was supplied (received ${JSON.stringify(newCommit)}). ` +
        `A refresh must name the commit it is about to write, so the superseded vintage can be ` +
        `recorded. This fails CLOSED on purpose — a missing sha is not permission.`
    );
  }
  const infoPath = path.join(sourceDir, '.source-info.json');
  let info;
  try {
    info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  } catch (err) {
    throw new Error(
      `§C93 G2 REFUSED: cannot read ${infoPath} (${err.message}). A refresh needs a recorded ` +
        `commitHash to supersede — there is nothing to record as the OLD commit. This fails ` +
        `CLOSED on purpose — a missing or unreadable .source-info.json is not permission.`
    );
  }
  const previousCommit = info && info.commitHash;
  if (typeof previousCommit !== 'string' || previousCommit === '') {
    throw new Error(
      `§C93 G2 REFUSED: ${infoPath} has no commitHash. A refresh needs a recorded commitHash ` +
        `to supersede — there is nothing to record as the OLD commit.`
    );
  }
  if (previousCommit === newCommit) {
    throw new Error(
      `§C93 G2 REFUSED: the new commit '${newCommit}' equals the recorded commit — nothing to ` +
        `supersede. A refresh must advance the vintage, not repeat it.`
    );
  }
  return { previousCommit };
}

/**
 * Is this an unambiguous FIRST fetch — a book that has never had source at all?
 *
 * 🔴 WHY THIS EXISTS. G2 requires `.source-info.json`, and that file has exactly ONE writer:
 * `download-source.js`'s `main()`, which runs it AFTER `organizeSourceFiles` returns. So the
 * artifact G2 demands is produced by the very run G2 blocks — without this predicate, a book's
 * FIRST fetch deadlocks permanently and there is no flag that helps (`--allow-overwrite-source`
 * is checked further down and G2 never reads it). Found by whole-branch review 2026-08-17; it
 * was a REGRESSION against the merge base, and it killed the only reachable input of both
 * admin fetch endpoints.
 *
 * ⚠️ BOTH conditions are required and the conjunction is the entire safety argument:
 *   - no `.source-info.json`  AND
 *   - no `.cnxml` anywhere under `sourceDir`
 * "No record but bytes present" is **record lost**, which is dangerous and must still refuse —
 * it is exactly the state a partial delete leaves, and treating it as a first fetch would let a
 * refresh proceed with nothing to record as superseded. Only "no record AND no bytes" is
 * unambiguous, and in that state there is nothing to supersede and nothing to destroy.
 *
 * Note this does NOT weaken the other three gates: G1 still refuses every CC BY book, G3 still
 * pins the fetched licence, and G4 still confines the write set — so a first fetch into an
 * emptied directory cannot reach `docx/` or `exercises/` either.
 *
 * @param {string} sourceDir absolute path to a book's `01-source` directory
 * @returns {boolean} true only when the book has never been fetched
 */
function isFirstFetch(sourceDir) {
  if (fs.existsSync(path.join(sourceDir, '.source-info.json'))) return false;
  return listCnxmlFiles(sourceDir).length === 0;
}

/**
 * Closed URL→code enum for G3. Deliberately a fixed map, never a substring match on the
 * human-readable licence name — an unrecognised URL must refuse, the same allowlist discipline
 * G1 applies to book-config.json's licence string.
 */
const LICENCE_URL_TO_CODE = Object.freeze({
  // Measured LIVE 2026-08-17 (test-results/c93-g3-premise-2026-08-17.txt): both chemistry's
  // and organic's upstream collection.xml currently resolve their <md:license url=…> here.
  'http://creativecommons.org/licenses/by-nc-sa/4.0/': 'CC BY-NC-SA 4.0',
  // NOT independently re-observed live — nobody has re-fetched a CC BY upstream collection.
  // Sourced from docs/provenance/openstax-cnxml-licence-provenance.md §2's git-log diff of the
  // governing collection metadata BEFORE the 2026-04-23 relicense edit (the exact URL every
  // affected collection carried while still CC BY, e.g. Chemistry commit `d91a52cb`'s removed
  // line). Included so G3 can catch the direction that matters most: an upstream NC-SA→CC BY
  // flip pulling CC BY bytes into a book still recorded NC-SA, which would poison the
  // allowlist for the NEXT refresh (see the gate's own doc comment below).
  'http://creativecommons.org/licenses/by/4.0/': 'CC BY 4.0',
});

/**
 * G3 — the licence-identity gate. THE SUBTLEST GATE. G1 keys on the RECORDED licence, which
 * describes the OLD bytes, while authorising a write of NEW bytes whose licence is unknown
 * until fetched. Without G3 the allowlist self-poisons: an upstream NC-SA→CC BY flip would
 * pull CC BY bytes into a book still recorded NC-SA, and the NEXT refresh would then destroy
 * an irrevocable CC BY copy using G1 alone. G3 must refuse a DIFFERENCE IN EITHER DIRECTION —
 * NC-SA→CC BY self-poisons the allowlist; CC BY→NC-SA (or worse) would silently strip our
 * derivatives of the right to exist. An unrecognised URL refuses rather than guessing.
 *
 * Parses the LEAF `<md:license url="…">` element directly with a regex, never by walking down
 * from the metadata wrapper: the wrapper's own tag/prefix is NOT stable — chemistry's is
 * unprefixed `<metadata mdml-version="0.5">`, organic's is `<col:metadata>` — but the leaf
 * `<md:license>` keeps its `md:` prefix in both (measured live,
 * test-results/c93-g3-premise-2026-08-17.txt). A regex on the leaf element is safe; a parser
 * that assumes the wrapper's prefix is not.
 *
 * @param {string} collectionXml raw XML text of the freshly-fetched collection.xml
 * @param {string} expectedCode the code G1 already approved for this book (e.g. 'CC BY-NC-SA 4.0')
 * @throws if no `<md:license url="…">` element is found, if its URL is not in the closed enum,
 *   or if the mapped code differs from `expectedCode` in EITHER direction
 */
function assertLicenceUnchanged(collectionXml, expectedCode) {
  const match = /<md:license\b[^>]*\burl=["']([^"']+)["']/.exec(collectionXml);
  if (!match) {
    throw new Error(
      `§C93 G3 REFUSED: no <md:license url="…"> element found in the fetched collection XML. ` +
        `A refresh requires a verifiable licence on the NEW bytes before they may be written. ` +
        `This fails CLOSED — a missing element is not permission. Nothing was written.`
    );
  }
  const url = match[1];
  const foundCode = LICENCE_URL_TO_CODE[url];
  if (!foundCode) {
    throw new Error(
      `§C93 G3 REFUSED: licence URL '${url}' is not on the known-URL allowlist ` +
        `(${Object.keys(LICENCE_URL_TO_CODE).join(', ')}). An unrecognised URL refuses rather ` +
        `than guessing at a code. Nothing was written.`
    );
  }
  if (foundCode !== expectedCode) {
    throw new Error(
      `§C93 G3 REFUSED: the fetched licence is '${foundCode}' (${url}) but the recorded ` +
        `licence is '${expectedCode}'. A refresh may replace bytes only with identically- ` +
        `licensed bytes — this direction matters as much as the other, because an unnoticed ` +
        `NC-SA→CC BY flip would poison the allowlist for the NEXT refresh. Nothing was written.`
    );
  }
}

module.exports = {
  assertRefreshable,
  assertWritePathAllowed,
  assertVintageAdvances,
  assertLicenceUnchanged,
  isFirstFetch,
  REFRESHABLE,
  LICENCE_URL_TO_CODE,
};
