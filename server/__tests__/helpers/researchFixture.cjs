// server/__tests__/helpers/researchFixture.cjs
/**
 * Fixtures for the research-capture tests (G1.2 PR3, Task 11; Tasks 12 and 31 reuse them).
 *
 * Require this file only AFTER the test file has set SESSIONS_DB_PATH (in a mkdtemp directory)
 * and JWT_SECRET: userService fixes its database path when it loads, and the flag snapshot loads
 * auth.js, which throws at load without a secret. The research file derives from SESSIONS_DB_PATH
 * (lib/researchDbPath), so nothing here touches pipeline-output/.
 *
 * APPROVED is a test text. Only a test lists it, through researchConsentText._setTestApprovedTexts;
 * this file never calls that seam (Task 4's guard), so the consent gate stays inert until it does.
 *
 * Plain CJS so ESM vitest files can load it via createRequire.
 */
const Database = require('better-sqlite3');
const userService = require('../../services/userService');
const researchConsent = require('../../services/researchConsent');
const servedVersions = require('../../services/servedVersions');
const { resolveResearchDbPath } = require('../../lib/researchDbPath');
const { sha256Text } = require('../../lib/servedText');

const APPROVED = Object.freeze([
  Object.freeze({ version: 'prufa-1', sha256: sha256Text('prufutexti 1') }),
]);

/** @returns {number} the new users.id */
function makeUser(providerId, role = 'editor') {
  return userService.createUser({
    providerId,
    providerUsername: providerId,
    displayName: providerId,
    email: `${providerId}@example.test`,
    role,
  }).id;
}

const decide = (decision) => (userId) =>
  researchConsent.recordDecision({ userId, decision, text: APPROVED[0], nowMs: Date.now() })
    .intervalId;

/** @returns {number} the id of the interval the consent started (or renewed) */
const consent = decide('consented');
/** @returns {null} a decline starts no interval */
const decline = decide('declined');

let fixtureVersion = null;

/** A real served version of m98001:para:a, minted once per test file. @returns {number} its id */
function mintFixtureVersion() {
  if (fixtureVersion === null) {
    fixtureVersion = servedVersions.mintVersions(researchConsent.getSessionsDb(), [
      servedVersions.buildVersionRow({
        book: 'efnafraedi-2e',
        chapter: 1,
        moduleId: 'm98001',
        segmentId: 'm98001:para:a',
        occurrence: 0,
        en: 'EN a',
        is: 'IS a',
        layer: 'mt-output',
      }),
    ])[0];
  }
  return fixtureVersion;
}

/**
 * A consenting editor's save, as an emitter would hand it to record(). It mints the served
 * version itself, so any caller gets one that exists. The default clientActionId is the first
 * case's; every later writing call passes its own.
 */
function saveEvent(over = {}) {
  const servedVersionId = mintFixtureVersion();
  return {
    actorProviderId: 'p-ed1',
    eventType: 'edit-save',
    book: 'efnafraedi-2e',
    chapter: 1,
    moduleId: 'm98001',
    segmentId: 'm98001:para:a',
    occurrence: 0,
    servedVersionId,
    editingKind: 'segment_edit',
    editingId: 41,
    editingContentSha256: sha256Text('IS a breytt'),
    origin: 'editor-save',
    content: { text: 'IS a breytt', note: 'SENTINEL-NOTE frá Jóni', category: 'terminology' },
    before: null,
    detail: { displayed: { editId: null, sha256: null } },
    items: [
      {
        itemType: 'term-insert',
        source: 'termbase',
        clientTimeMs: 1000,
        detail: { term: 'hugtak' },
        claim: 'unverified',
      },
    ],
    clientActionId: 'act-1',
    clientActionTime: 1_700_000_000_000,
    replayed: false,
    sessionId: null,
    ...over,
  };
}

/** A NEW readonly, safe-integer handle on the research file; the caller closes it. */
function readResearch() {
  const db = new Database(resolveResearchDbPath().researchPath, {
    readonly: true,
    fileMustExist: true,
  });
  db.defaultSafeIntegers(true);
  return db;
}

/** @returns {object[]} every loss row, in insertion order */
function losses() {
  return researchConsent
    .getSessionsDb()
    .prepare('SELECT * FROM research_capture_losses ORDER BY rowid')
    .all();
}

/** Another editor's (or the actor's own) editing row, raw (decision 65). @returns {number} its id */
function seedEdit({
  editorId,
  moduleId = 'm98001',
  segmentId,
  text,
  status = 'pending',
  appliedAt = null,
}) {
  const res = researchConsent
    .getSessionsDb()
    .prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content,
         edited_content, status, editor_id, editor_username, applied_at)
       VALUES ('efnafraedi-2e', 1, ?, ?, 'IS a', ?, ?, ?, ?, ?)`
    )
    .run(moduleId, segmentId, text, status, editorId, editorId, appliedAt);
  return Number(res.lastInsertRowid);
}

module.exports = {
  APPROVED,
  makeUser,
  consent,
  decline,
  mintFixtureVersion,
  saveEvent,
  readResearch,
  losses,
  seedEdit,
};
