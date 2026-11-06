// server/lib/featureFlags.js — the flag registry and its snapshot (spec §5.13).
//
// A code registry: one entry per switch read on the editing path, each reader calling the
// consumer's OWN predicate (so the snapshot cannot drift from what the code does). Values are
// booleans or a fixed word, never a configured value: a URL or a password never reaches a
// snapshot. Every research event stamps flagSnapshotJson(book).
//
// Adding a flag: an entry here, its `bookSettingsColumn` or `envNames`, and (for G1.23) the
// files it reads in ENV_SCAN_FILES. Two coverage tests fail otherwise: every book_settings
// column and every environment read in ENV_SCAN_FILES is registered or listed in NOT_A_FLAG.
// This file is scanned itself, so its comments must not use the scanned phrase.

const fs = require('fs');
const path = require('path');
const { canonicalJson } = require('./canonicalJson');

// auth.js throws at load without JWT_SECRET (services/auth.js), so it loads lazily.
const lazy = (rel) => () => require(rel);

const FLAGS = Object.freeze([
  {
    name: 'apply-hold',
    source: 'lib/applyHold.faithfulWriteHold',
    read: (book) => require('./applyHold').faithfulWriteHold(book) !== null,
  },
  {
    name: 'pipeline-hold',
    source: 'lib/heldBookWrites.pipelineHold',
    read: (book) => require('./heldBookWrites').pipelineHold(book) !== null,
  },
  {
    name: 'figure-review-closed',
    source: 'lib/heldBookWrites.figureReviewClosed',
    read: (book) => require('./heldBookWrites').figureReviewClosed(book) !== null,
  },
  {
    name: 'enforce-assignments',
    source: 'services/userService.isAssignmentEnforced',
    bookSettingsColumn: 'enforce_assignments',
    read: (book) => require('../services/userService').isAssignmentEnforced(book),
  },
  {
    name: 'enforce-localization-review',
    source: 'services/localizationReviewService.isReviewEnabled',
    bookSettingsColumn: 'enforce_localization_review',
    read: (book) => require('../services/localizationReviewService').isReviewEnabled(book),
  },
  {
    name: 'auto-create-users',
    source: 'services/auth.signInPolicy',
    envNames: ['AUTO_CREATE_USERS'],
    read: () => lazy('../services/auth')().signInPolicy(process.env.AUTO_CREATE_USERS),
  },
  {
    name: 'greynir',
    source: 'services/greynirEngine.isEnabled',
    envNames: ['GREYNIR_URL'],
    read: () => require('../services/greynirEngine').isEnabled(),
  },
  {
    name: 'email',
    source: 'services/notifications.isEmailConfigured',
    envNames: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
    read: () => require('../services/notifications').isEmailConfigured(),
  },
  {
    name: 'suggestion-view',
    source: 'lib/bookSwitches (book_switch_events)',
    read: (book, { conn }) =>
      require('./bookSwitches').currentSwitchValue(conn, book, 'suggestion-view'),
  },
  {
    name: 'study-capture',
    source: 'lib/researchScope.isStudyBook',
    read: (book) => require('./researchScope').isStudyBook(book),
  },
  {
    name: 'not-minted',
    source: 'lib/servedText.isNotMintedBook',
    read: (book) => require('./servedText').isNotMintedBook(book),
  },
]);

/** Columns and environment names that are read on the path but are not flags, each with its reason. */
const NOT_A_FLAG = Object.freeze({
  bookSettings: Object.freeze({}),
  env: Object.freeze({
    SMTP_PORT: 'transport settings of the email flag; whether email is on is `email`',
    SMTP_SECURE: 'transport settings of the email flag; whether email is on is `email`',
    SMTP_FROM: 'transport settings of the email flag; whether email is on is `email`',
    BASE_URL: 'the link base in notification bodies; it changes no behaviour on the editing path',
    ADMIN_EMAIL: 'where feedback notifications go; not on the editing path',
  }),
});

/** Files scanned for environment reads, relative to server/. A listed file that is missing fails the test. */
const ENV_SCAN_FILES = Object.freeze([
  // spec §5.13's nine
  'routes/segment-editor.js',
  'services/segmentEditorService.js',
  'services/acceptanceService.js',
  'services/propagationService.js',
  'services/segmentParser.js',
  'services/servedEdit.js',
  'services/researchLog.js',
  'lib/applyHold.js',
  'lib/heldBookWrites.js',
  // where the registered flags' reads live
  'services/greynirEngine.js',
  'services/notifications.js',
  // PR2's handoff: reads nothing today; listing it guards a future read
  'services/moduleOpenings.js',
  // the research layer's own files (decision 33)
  'lib/featureFlags.js',
  'lib/bookSwitches.js',
  'lib/researchDbPath.js',
  'services/researchDb.js',
  'services/researchConsent.js',
  'lib/serverCommit.js',
]);

/**
 * @param {string} book
 * @param {{conn: import('better-sqlite3').Database}} ctx conn is sessions.db
 * @returns {Record<string, boolean|string>} Throws if a reader throws.
 */
function flagSnapshot(book, ctx) {
  const out = {};
  for (const f of FLAGS) out[f.name] = f.read(book, ctx);
  return out;
}

/** @returns {string} The snapshot in canonical JSON. */
function flagSnapshotJson(book, ctx) {
  return canonicalJson(flagSnapshot(book, ctx));
}

const NAMED_READ = /process\.env(?:\.([A-Z_][A-Z0-9_]*)|\[\s*['"]([A-Z_][A-Z0-9_]*)['"]\s*\])/g;
const ANY_READ = /process\.env\b/g;

/**
 * @param {string} root Directory the files are relative to (server/).
 * @param {readonly string[]} files
 * @returns {{file: string, name: string}[]} Every environment read; any other use is
 *   '<unparsed>', a listed file that does not exist is '<missing file>'.
 */
function scanEnvReads(root, files) {
  const found = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, file), 'utf8');
    } catch {
      found.push({ file, name: '<missing file>' });
      continue;
    }
    let named = 0;
    for (const m of text.matchAll(NAMED_READ)) {
      named += 1;
      found.push({ file, name: m[1] || m[2] });
    }
    const unparsed = (text.match(ANY_READ) || []).length - named;
    for (let i = 0; i < unparsed; i += 1) found.push({ file, name: '<unparsed>' });
  }
  return found;
}

module.exports = {
  FLAGS,
  NOT_A_FLAG,
  ENV_SCAN_FILES,
  flagSnapshot,
  flagSnapshotJson,
  scanEnvReads,
};
