/**
 * Replays the assign-gate model's two known findings (AssignGate.tla: OnlyEditorsOpen and
 * OpenerHadLicence) against the real server code, on a throwaway sessions.db. Each step is the
 * model's action, called through the function the model says it stands for. Prints one line per
 * step and a verdict; exits 0 when both findings reproduce, 1 when either does not (then the
 * model, not the code, is the first suspect).
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

/**
 * One finding's path: RecordDecision, RecordLicence, AssignReplacing, the finding's own step,
 * then Serve. Returns whether the serve opened the unit (the finding reproduced).
 */
function replay(name, { providerId, moduleId, step }) {
  const userService = require(path.join(server, 'services', 'userService'));
  const licenceClauses = require(path.join(server, 'services', 'licenceClauses'));
  const moduleOpenings = require(path.join(server, 'services', 'moduleOpenings'));
  const conn = new Database(process.env.SESSIONS_DB_PATH);
  const steps = [];
  try {
    const userId = Number(
      conn
        .prepare(
          `INSERT INTO users (provider_id, provider_username, display_name, role, created_by)
           VALUES (?, ?, ?, 'editor', 'replay')`
        )
        .run(providerId, `replay-${providerId}`, `Replay ${providerId}`).lastInsertRowid
    );
    // A declined decision is a recorded decision (spec §6.5); planted, as the approved consent
    // text list is empty until G1.4.
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
    const viewRow = conn
      .prepare(
        "SELECT 1 FROM book_switch_events WHERE book = ? AND switch_name = 'suggestion-view'"
      )
      .get(BOOK);
    if (!viewRow) {
      conn
        .prepare(
          `INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms)
           VALUES (?, 'suggestion-view', 1, ?)`
        )
        .run(BOOK, Date.now() - 1000);
    }
    userService.setChapterAssignee(userId, BOOK, CHAPTER, 'replay-admin');
    steps.push('AssignReplacing: userService.setChapterAssignee (the gate passed)');
    steps.push(step({ userService, licenceClauses, conn, userId, clauseId }));
    const result = moduleOpenings.openOnServe(conn, {
      book: BOOK,
      chapter: CHAPTER,
      moduleId,
      providerId,
      served: { mintOk: true },
      segments: [],
      edits: [],
    });
    steps.push(`Serve: moduleOpenings.openOnServe -> ${result.status}`);
    const reproduced = result.status === 'opened';
    console.log(`${name}: ${reproduced ? 'REPRODUCED' : 'NOT reproduced'}`);
    steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    return reproduced;
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
  const roleChange = replay('OnlyEditorsOpen (a role change after the assignment)', {
    providerId: '880001',
    moduleId: 'm68664',
    step: ({ userService, userId }) => {
      userService.updateUser(userId, { role: 'head-editor' });
      userService.assignBookAccess(userId, BOOK, 'head-editor', 'replay-admin');
      return 'SetRole: userService.updateUser + assignBookAccess (now head editor of the book)';
    },
  });
  const licenceRemoved = replay('OpenerHadLicence (a licence row removed after the assignment)', {
    providerId: '880002',
    moduleId: 'm68665',
    step: ({ licenceClauses, conn, userId, clauseId }) => {
      licenceClauses.removeClause(conn, { userId, rowId: clauseId });
      return 'RemoveLicence: licenceClauses.removeClause (no licence row left)';
    },
  });
  ok = roleChange && licenceRemoved;
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
process.exitCode = ok ? 0 : 1;
