/**
 * The approved research-consent texts (spec §5.14; G1.4 owns the wording).
 *
 * - This is an enforceable value, changed together with its test (CLAUDE.md
 *   § One source of truth). It is empty until [USER] lists a text, after checks
 *   G-1a, G-1b and G-1h pass and the data protection officer has reviewed it
 *   (G1.4). While it is empty, `POST /api/research/consent` answers 409
 *   `NO_APPROVED_TEXT` and `record()` captures nothing for anyone.
 * - **Append new versions at the end; the last is the current text.**
 * - **Never remove an entry while a live interval names it.** Removal silently
 *   stops that editor's capture and nothing counts it as a loss (§5.14). Before
 *   removing version V, the database administrator runs, read-only:
 *   `SELECT COUNT(*) FROM research_consent r JOIN research_consent s ON
 *   s.id = r.interval_id WHERE r.id IN (SELECT MAX(id) FROM research_consent
 *   GROUP BY user_id) AND r.decision = 'consented' AND s.withdrawn_at_ms IS
 *   NULL AND r.consent_text_version = ?` and removes V only at 0, in a commit
 *   that also edits the test's `EVER_LISTED`.
 * - `_setTestApprovedTexts` is for tests; a test fails if any other file names it.
 */

/** @typedef {{ version: string, sha256: string }} ConsentText */

/**
 * @param {ConsentText[]} list
 * @returns {string[]} problems, each prefixed by the entry's version
 */
function validateTexts(list) {
  const problems = [];
  const seen = new Set();
  for (const t of list) {
    const label = t.version ? t.version : '(empty)';
    if (typeof t.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(t.sha256)) {
      problems.push(`${label}: sha256 is not 64 lowercase hex`);
    }
    if (seen.has(t.version)) problems.push(`${label}: version listed twice`);
    seen.add(t.version);
    if (!t.version) problems.push(`${label}: version is empty`);
  }
  return problems;
}

/** @param {ConsentText[]} list @returns {readonly ConsentText[]} */
function freezeList(list) {
  return Object.freeze(list.map((t) => Object.freeze({ version: t.version, sha256: t.sha256 })));
}

/** Deliberately empty: capture stays inert until [USER] lists a text. */
const APPROVED_CONSENT_TEXTS = freezeList([]);

let override = null;

/** @returns {readonly ConsentText[]} */
function activeList() {
  return override || APPROVED_CONSENT_TEXTS;
}

/** @returns {ConsentText | null} the last listed text, or null while none is listed */
function currentConsentText() {
  const list = activeList();
  return list.length ? list[list.length - 1] : null;
}

/**
 * @param {string} version
 * @param {string} sha256
 * @returns {boolean} true only if one entry matches both
 */
function isApprovedText(version, sha256) {
  return activeList().some((t) => t.version === version && t.sha256 === sha256);
}

/**
 * Test-only. `null` restores the real list; any other list is validated and frozen.
 * @param {ConsentText[] | null} list
 */
function _setTestApprovedTexts(list) {
  if (list === null) {
    override = null;
    return;
  }
  const problems = validateTexts(list);
  if (problems.length) throw new Error(`invalid approved texts: ${problems.join('; ')}`);
  override = freezeList(list);
}

module.exports = {
  APPROVED_CONSENT_TEXTS,
  currentConsentText,
  isApprovedText,
  validateTexts,
  _setTestApprovedTexts,
};
