#!/usr/bin/env node
/**
 * READ-ONLY: the production checks that must be answered before the module-opening step ships
 * and before any research capture (G1.1 + G1.2; spec 2026-11-03 §9; index decision 14).
 *
 * Each section answers one §9 check and runs on its own: a section that fails reports
 * `{ ok: false, error, message }` and the others still run.
 *   G-1d  `enforce_assignments` per book; the study book's `user_chapter_assignments` rows, as
 *         (user id, chapter); the `users` rows, as (id, role, active); and AUTO_CREATE_USERS as the
 *         server reads it (systemd's Environment= and EnvironmentFile=, then server/.env where
 *         unset). It decides whether units would open the moment the opening step ships.
 *   G-1e  the study book's segments holding an in-flight edit (pending, or approved and not yet
 *         applied), with counts by state, and its applied rows whose faithful file is gone. It
 *         gives the size of the opening snapshots (§5.5).
 * The system half (G-1c, G-1f, G-1g) is added beside these.
 *
 * The output names no editor: users and assignment rows by id, segments by id with counts, and
 * from the service configuration and server/.env only the value of AUTO_CREATE_USERS. It may be
 * pasted into the register.
 *
 * An EnvironmentFile= this user cannot read is listed `readable: false`; a readable one without the
 * key has `value: null` and no `readable`. `autoCreateUsers.effective` counts only the files read,
 * so it is unconfirmed when a `readable: false` file outranks its source (every file outranks
 * Environment= and server/.env, a later file an earlier one): that file may set the key, and only a
 * run that can read it settles the value.
 *
 * It runs where neither PR1 nor PR2 is deployed: it requires only modules present on production
 * before PR1 (its test pins the list; the study-book allowlist is not one of them, so the book is
 * an argument), and it reads PR1's `segment_edits.origin` only when the column exists.
 *
 * The database is opened `readonly: true, fileMustExist: true`.
 *
 * Usage (prints one JSON object on stdout; exit 0 every section read, 1 a section failed, 2 usage):
 *   node server/scripts/read-research-preconditions.js efnafraedi-2e
 * On production, where this file is not deployed, send it on stdin from server/scripts, so `../lib` and
 * better-sqlite3 resolve (the route read-pending-edits.js describes):
 *   ssh <prod> "cd <repo>/server/scripts && node - efnafraedi-2e" \
 *     < server/scripts/read-research-preconditions.js > preconditions.json
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const USAGE = 'usage: read-research-preconditions.js <book>';
const SERVICE_UNIT = 'ritstjorn'; // the unit scripts/deploy.sh restarts
const KEY = 'AUTO_CREATE_USERS'; // its meaning: signInPolicy in server/services/auth.js, never restated here

/** A command's output, or what stopped it. Never throws; a missing command is { ran: false }. */
function execNeverThrow(cmd, args) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ran: true, code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      ran: err.code !== 'ENOENT',
      code: typeof err.status === 'number' ? err.status : null,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || ''),
    };
  }
}

function runSection(read) {
  try {
    return { ok: true, ...read() };
  } catch (err) {
    return { ok: false, error: err.code || err.name, message: err.message };
  }
}

/** Only AUTO_CREATE_USERS leaves this function; every other key of the text is dropped here. */
function pickKey(text) {
  const parsed = require('dotenv').parse(text);
  return Object.hasOwn(parsed, KEY) ? parsed[KEY] : null;
}

function readAutoCreateUsers({ serverDir, exec }) {
  let dotEnv;
  try {
    dotEnv = {
      present: true,
      value: pickKey(fs.readFileSync(path.join(serverDir, '.env'), 'utf8')),
    };
  } catch {
    dotEnv = { present: false, value: null }; // no .env: the server reads none either
  }
  const env = exec('systemctl', ['show', SERVICE_UNIT, '--property=Environment', '--value']);
  const token =
    env.ran && env.code === 0
      ? env.stdout.split(/\s+/).find((t) => t.startsWith(`${KEY}=`))
      : undefined;
  const service = {
    ran: env.ran && env.code === 0,
    value: token === undefined ? null : token.slice(KEY.length + 1),
  };
  const files = exec('systemctl', ['show', SERVICE_UNIT, '--property=EnvironmentFiles', '--value']);
  const environmentFiles = (files.ran && files.code === 0 ? files.stdout.split('\n') : [])
    .map((l) => l.trim().split(/\s+/)[0])
    .filter(Boolean)
    .map((p) => {
      try {
        return { path: p, value: pickKey(fs.readFileSync(p, 'utf8')) };
      } catch {
        // Unreadable to this user: reported as such, not guessed, and so never mistaken for a file
        // without the key.
        return { path: p, readable: false, value: null };
      }
    });
  // systemd: an EnvironmentFile= assignment overrides Environment=, a later file a former one; dotenv
  // (server/index.js) fills a variable from server/.env only where the process environment does not set it.
  // `effective` counts only the files read: beside a `readable: false` file it is unconfirmed (see the header).
  const fromFile = environmentFiles
    .map((f) => f.value)
    .filter((v) => v !== null)
    .at(-1);
  let effective;
  if (fromFile !== undefined) effective = { value: fromFile, source: 'EnvironmentFile' };
  else if (service.value !== null) effective = { value: service.value, source: 'Environment' };
  else if (dotEnv.value !== null) effective = { value: dotEnv.value, source: 'server/.env' };
  else effective = { value: null, source: 'unset' };
  return { dotEnv, service, environmentFiles, effective };
}

function readG1d({ db, book, serverDir, exec }) {
  const conn = db();
  const enforcement = conn
    .prepare('SELECT book, enforce_assignments FROM book_settings ORDER BY book')
    .all()
    .map((r) => ({ book: r.book, enforceAssignments: !!r.enforce_assignments }));
  // isAssignmentEnforced's rule (userService.js): truthiness, and no row is not enforced, so the study book
  // is never absent.
  const own = enforcement.find((e) => e.book === book);
  const studyBookEnforced = own ? own.enforceAssignments : false;
  const assignments = conn
    .prepare(
      'SELECT user_id, chapter FROM user_chapter_assignments WHERE book_slug = ? ORDER BY chapter, user_id'
    )
    .all(book)
    .map((r) => ({ userId: r.user_id, chapter: r.chapter }));
  const users = conn
    .prepare('SELECT id, role, is_active FROM users ORDER BY id')
    .all()
    .map((r) => ({ id: r.id, role: r.role, active: !!r.is_active })); // truthiness, as the sign-in gate (auth.js)
  return {
    enforcement,
    studyBookEnforced,
    assignments,
    assignedChapters: [...new Set(assignments.map((a) => a.chapter))].sort((a, b) => a - b),
    users,
    autoCreateUsers: readAutoCreateUsers({ serverDir, exec }),
  };
}

function readG1e({ db, book, booksDir }) {
  const conn = db();
  const { chapterDir } = require('../lib/chapterLabel');
  const originColumn = conn.pragma('table_info(segment_edits)').some((c) => c.name === 'origin');
  // In flight is isEditInFlight's rule (accept-eligibility.js), in its SQL twin's words (acceptanceService.js).
  // reattach uses CASE, not SUM(origin = 're-attach'): origin is NULL on every pre-PR1 row, and SUM over NULLs is NULL.
  const inflight = conn
    .prepare(
      `SELECT chapter, module_id, segment_id,
              SUM(status = 'pending') AS pending,
              SUM(status = 'approved' AND applied_at IS NULL) AS approvedUnapplied
              ${originColumn ? ", SUM(CASE WHEN origin = 're-attach' THEN 1 ELSE 0 END) AS reattach" : ''}
         FROM segment_edits
        WHERE book = ? AND (status = 'pending' OR (status = 'approved' AND applied_at IS NULL))
        GROUP BY chapter, module_id, segment_id
        ORDER BY chapter, module_id, segment_id`
    )
    .all(book)
    .map((r) => ({
      chapter: r.chapter,
      moduleId: r.module_id,
      segmentId: r.segment_id,
      pending: r.pending,
      approvedUnapplied: r.approvedUnapplied,
      ...(originColumn ? { reattach: r.reattach } : {}),
    }));
  const appliedWithoutFaithful = conn
    .prepare(
      `SELECT DISTINCT chapter, module_id, segment_id FROM segment_edits
        WHERE book = ? AND status = 'approved' AND applied_at IS NOT NULL
        ORDER BY chapter, module_id, segment_id`
    )
    .all(book)
    .filter(
      (r) =>
        !fs.existsSync(
          path.join(
            booksDir,
            book,
            '03-faithful-translation',
            chapterDir(r.chapter),
            `${r.module_id}-segments.is.md`
          )
        )
    )
    .map((r) => ({ chapter: r.chapter, moduleId: r.module_id, segmentId: r.segment_id }));
  return { originColumn, inflight, appliedWithoutFaithful };
}

const SECTIONS = { 'G-1d': readG1d, 'G-1e': readG1e }; // the system half adds G-1c, G-1f, G-1g; PR4 adds G-1a and G-1h

function readResearchPreconditions({
  book,
  openDb,
  serverDir,
  booksDir,
  etcRoot = '/etc',
  varRoot = '/var',
  pathEnv = process.env.PATH,
  exec = execNeverThrow,
}) {
  let handle = null;
  let openError = null;
  // Opened once, lazily, on the first section that reads the database; a failed open fails
  // every database section with the same error and leaves the others to run.
  const db = () => {
    if (!handle && !openError) {
      try {
        handle = openDb();
      } catch (err) {
        openError = err;
      }
    }
    if (openError) throw openError;
    return handle;
  };
  const ctx = { book, db, serverDir, booksDir, etcRoot, varRoot, pathEnv, exec };
  const sections = {};
  try {
    for (const [name, read] of Object.entries(SECTIONS)) {
      sections[name] = runSection(() => read(ctx));
    }
  } finally {
    if (handle) handle.close();
  }
  return { book, ok: Object.values(sections).every((s) => s.ok), sections };
}

/** @returns {0|1|2} */
function main(argv, env = process.env) {
  const args = argv.slice(2);
  if (args.length !== 1 || !/^[a-z0-9-]+$/.test(args[0])) {
    console.error(USAGE);
    return 2;
  }
  const resolveDbPath = require('../lib/dbPath');
  // Absolute in a file run and in a stdin run alike, and anchored on the file that locates the database.
  const serverDir = path.resolve(path.dirname(require.resolve('../lib/dbPath')), '..');
  const report = readResearchPreconditions({
    book: args[0],
    openDb: () =>
      new (require('better-sqlite3'))(resolveDbPath(), { readonly: true, fileMustExist: true }),
    serverDir,
    // Test seam, as scripts/backfill-mt-locks.js: never set in production.
    booksDir: env.BOOKS_ROOT_OVERRIDE || path.join(serverDir, '..', 'books'),
  });
  process.stdout.write(
    JSON.stringify(
      { probe: 'read-research-preconditions', readAt: new Date().toISOString(), ...report },
      null,
      1
    ) + '\n'
  );
  return report.ok ? 0 : 1;
}

// A file run sets require.main; a stdin run (`node -`) does not, and must still execute (read-apply-exposure.js).
const runDirectly = require.main === module || (module.id === '[stdin]' && process.argv[1] === '-');
if (runDirectly) {
  process.exitCode = 1; // a failure default: a run that dies before main() returns is never 0
  process.exitCode = main(process.argv);
}

module.exports = {
  readResearchPreconditions,
  readAutoCreateUsers,
  readG1d,
  readG1e,
  execNeverThrow,
  SECTIONS,
};
