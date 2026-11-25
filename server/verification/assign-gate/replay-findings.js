/**
 * Replays the assign-gate model (AssignGate.tla) against the real server code, on a throwaway
 * sessions.db. Each step is the model's action, called through the function the model says it
 * stands for. Two paths:
 *   - the known finding OnlyEditorsOpen (a role change after the assignment): must REPRODUCE, the
 *     serve opening the unit; if it does not, the model, not the code, is the first suspect;
 *   - the closed gap behind EveryRowHolderHasLicence (a licence row removed after the assignment):
 *     must be REFUSED, licenceClauses.removeClause throwing HOLDS_CHAPTERS and keeping the row.
 * Prints one line per step and a verdict; exits 0 when both hold, 1 otherwise.
 *
 * Run from the repo root: node server/verification/assign-gate/replay-findings.js
 * Writes only to a temp directory it deletes.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'assign-gate-replay-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const server = path.resolve(__dirname, '..', '..');
const Database = require(path.join(server, 'node_modules', 'better-sqlite3'));

const BOOK = 'efnafraedi-2e';
const CHAPTER = 1;

const services = () => ({
  userService: require(path.join(server, 'services', 'userService')),
  licenceClauses: require(path.join(server, 'services', 'licenceClauses')),
  moduleOpenings: require(path.join(server, 'services', 'moduleOpenings')),
});

/**
 * The shared start of every path: RecordDecision, RecordLicence, AssignReplacing (the gate passes).
 * @returns {{ userId: number, clauseId: number }}
 */
function assignLicensedEditor(conn, { userService, licenceClauses }, providerId, steps) {
  const userId = Number(
    conn
      .prepare(
        `INSERT INTO users (provider_id, provider_username, display_name, role, created_by)
         VALUES (?, ?, ?, 'editor', 'replay')`
      )
      .run(providerId, `replay-${providerId}`, `Replay ${providerId}`).lastInsertRowid
  );
  // A declined decision is a recorded decision (spec §6.5); planted, as the approved consent text
  // list is empty until G1.4.
  conn
    .prepare(
      `INSERT INTO research_consent (user_id, decision, interval_id, consent_text_version,
         consent_text_sha256, given_at_ms) VALUES (?, 'declined', NULL, 'replay', ?, ?)`
    )
    .run(userId, '0'.repeat(64), Date.now());
  steps.push('RecordDecision: a research_consent row (declined)');
  const { id: clauseId } = licenceClauses.recordClause(conn, {
    userId,
    signedOn: '2026-11-01',
    recordedBy: 'replay-admin',
    nowMs: Date.now(),
  });
  steps.push('RecordLicence: licenceClauses.recordClause');
  userService.setChapterAssignee(userId, BOOK, CHAPTER, 'replay-admin');
  steps.push('AssignReplacing: userService.setChapterAssignee (the gate passed)');
  return { userId, clauseId };
}

function report(name, verdict, steps) {
  console.log(`${name}: ${verdict}`);
  steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
}

/** The known finding: a role change after the assignment, then a serve. True when the unit opened. */
function replayRoleChange() {
  const svc = services();
  const conn = new Database(process.env.SESSIONS_DB_PATH);
  const steps = [];
  try {
    const providerId = '880001';
    const { userId } = assignLicensedEditor(conn, svc, providerId, steps);
    svc.userService.updateUser(userId, { role: 'head-editor' });
    svc.userService.assignBookAccess(userId, BOOK, 'head-editor', 'replay-admin');
    steps.push('SetRole: userService.updateUser + assignBookAccess (now head editor of the book)');
    const result = svc.moduleOpenings.openOnServe(conn, {
      book: BOOK,
      chapter: CHAPTER,
      moduleId: 'm68664',
      providerId,
      served: { mintOk: true },
      segments: [],
      edits: [],
    });
    steps.push(`Serve: moduleOpenings.openOnServe -> ${result.status}`);
    const reproduced = result.status === 'opened';
    report(
      'OnlyEditorsOpen (a role change after the assignment)',
      reproduced ? 'REPRODUCED' : 'NOT reproduced',
      steps
    );
    return reproduced;
  } finally {
    conn.close();
  }
}

/** The closed gap: removing the licence row while the editor holds the chapter must be refused. */
function replayLicenceRemoval() {
  const svc = services();
  const conn = new Database(process.env.SESSIONS_DB_PATH);
  const steps = [];
  try {
    const { userId, clauseId } = assignLicensedEditor(conn, svc, '880002', steps);
    let code = null;
    try {
      svc.licenceClauses.removeClause(conn, { userId, rowId: clauseId });
    } catch (err) {
      code = err.code;
    }
    const kept = svc.licenceClauses.hasClause(conn, userId);
    steps.push(
      `RemoveLicence: licenceClauses.removeClause -> ${code || 'no refusal'}; licence row ${kept ? 'kept' : 'gone'}`
    );
    const refused = code === 'HOLDS_CHAPTERS' && kept;
    report(
      'EveryRowHolderHasLicence (a licence row removed after the assignment)',
      refused ? 'REFUSED (closed)' : 'NOT refused: the gap is open again',
      steps
    );
    return refused;
  } finally {
    conn.close();
  }
}

let ok = false;
try {
  const { runAllMigrations } = require(path.join(server, 'services', 'migrationRunner'));
  const migrated = runAllMigrations();
  if (migrated && Array.isArray(migrated.errors) && migrated.errors.length > 0) {
    throw new Error(`migrations failed: ${migrated.errors.length} error(s)`);
  }
  const roleChange = replayRoleChange();
  const licenceRefused = replayLicenceRemoval();
  ok = roleChange && licenceRefused;
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
process.exitCode = ok ? 0 : 1;
