/**
 * moduleOpenings — the opening record (G1.1 + G1.2 spec §5.4 step 4, §5.5; PR2).
 *
 * WHAT AN OPENING IS. A study-book unit (book, chapter, module) opens at its first serve to a user
 * who holds a user_chapter_assignments row for that chapter. At that serve, in one sessions.db
 * transaction, this module writes the time it opened (module_openings.opened_at_ms) and the set of
 * served segments that held an in-flight edit at that moment (module_opening_inflight; G1.23
 * §6.3a's snapshot). It is set ONCE (G1.23 §6.2): a later serve, by anyone, changes neither, so the
 * snapshot is the honest record of what was already in flight when the assigned editor first saw
 * the unit. A serve that meets the predicate but cannot record the opening is answered 503
 * OPENING_UNRECORDED by the route and records nothing (spec §5.4): no unit opens unrecorded.
 *
 * WHY THE ASSIGNMENT LOOKUP IS DIRECT. The predicate reads user_chapter_assignments itself, for
 * this user, book and chapter. It does not use userService.hasChapterAccess, which is fail-open by
 * design (a user with no rows for the book passes while enforcement is off; so does an unready
 * users table or a missing assignment table), nor requireBookAccess, which lets every admin and
 * every head editor of the book through before any chapter check. Either would let a serve that is
 * not an assigned editor's set the opened time (spec §3's anti-goal). It does not read
 * enforce_assignments, the role or users.is_active: the row decides (G1.23 §6.2). Not migration
 * 012's chapter_assignments either, which nothing reads.
 *
 * WHY ANY IN-FLIGHT EDIT, NOT THE NEWEST. The snapshot keeps a served segment when ANY of its edit
 * rows, from any editor, is in flight (accept-eligibility.js isEditInFlight), not only its newest
 * (spec §14 call 6): an older pending edit under a newer rejected one is still in flight.
 *
 * WHY THE TIME NEVER LEAVES THIS MODULE. opened_at_ms is read on the server only (spec §11). No
 * function here returns it, so nothing the route sends can carry it (T17).
 *
 * WHY IT TAKES THE CALLER'S CONNECTION. The module route already mints served versions on
 * segmentEditor.getDb(); the predicate's assignment lookup and the opening run on that same handle,
 * so one handle holds the served versions and the opening, and a test controls both through
 * segmentEditor._setTestDb. The users lookup (userService.findByProviderId) runs on userService's
 * own connection, which in production opens the same file; it is a read before the opening's
 * transaction, not part of it. No connection seam of its own, only _setTestClock.
 *
 * PR3 emits the module-opened research event from the route, after an opening, with
 * moduleOpenedDetail(served, opening). PR2 emits nothing (index decision 2).
 */

const { isStudyBook } = require('../lib/researchScope');
const userService = require('./userService');
const { isEditInFlight } = require('../public/js/accept-eligibility');
const log = require('../lib/logger');

// The serve that meets the predicate but cannot record its opening (spec §5.4). Icelandic: approved
// by [USER] 2026-11-04 (index decision 13). Not in servedEdit.js's refusal tables, which PR2 does
// not change.
const OPENING_UNRECORDED = Object.freeze({
  status: 503,
  code: 'OPENING_UNRECORDED',
  message:
    'Ekki tókst að skrá opnun einingarinnar og því var hún ekki opnuð. Opnið eininguna aftur.',
});

let clock = () => Date.now();
/** @internal Test-only: the source of opened_at_ms. */
function _setTestClock(fn) {
  clock = fn || (() => Date.now());
}

/**
 * spec §5.5's predicate, cheapest and person-specific first: the book (pure, touches no table),
 * the users row, this user's assignment row for the chapter, then the opening row. The opening
 * lookup comes last, so a missing module_openings affects only a user who holds an assignment row.
 * May throw on a damaged database; openOnServe maps a throw to 503 (decision 4).
 */
function openingPredicate(conn, { book, chapter, moduleId, providerId }) {
  if (!isStudyBook(book)) return { holds: false, reason: 'not-study-book' };
  // Through the module object, never destructured. undefined: no row; null: no users table. Never
  // creates a row (CLAUDE.md § Auth: a signed-in visitor has none).
  const user = userService.findByProviderId(providerId);
  if (!user) return { holds: false, reason: 'no-user' };
  const assigned = conn
    .prepare(
      'SELECT 1 AS hit FROM user_chapter_assignments WHERE user_id = ? AND book_slug = ? AND chapter = ?'
    )
    .get(user.id, book, chapter);
  if (!assigned) return { holds: false, reason: 'no-assignment' };
  const opened = conn
    .prepare(
      'SELECT 1 AS hit FROM module_openings WHERE book = ? AND chapter = ? AND module_id = ?'
    )
    .get(book, chapter, moduleId);
  if (opened) return { holds: false, reason: 'already-opened' };
  return { holds: true, reason: 'holds' };
}

/**
 * spec §5.5 step 2: every served segment holding ANY in-flight edit, from any editor. Pure.
 *
 * The occurrence is the edit row's when it is an integer, else -1 ("every occurrence of the id":
 * rows made before G1.1 carry none). A -1 row subsumes that id's specific-occurrence rows. It does
 * not filter on the edit row's chapter: the module response keys a segment's edits by segment_id
 * alone, so this holds exactly the in-flight rows the serve displayed. warnSegments: the ids with a
 * kept edit whose origin is not 're-attach' (NULL counts as not re-attach).
 */
function snapshotRows(segments, edits) {
  const served = new Set(segments.map((s) => s.segmentId));
  const byId = new Map();
  for (const e of edits) {
    if (!served.has(e.segment_id) || !isEditInFlight(e)) continue;
    const entry = byId.get(e.segment_id) || { occurrences: new Set(), warn: false };
    entry.occurrences.add(Number.isInteger(e.occurrence) ? e.occurrence : -1); // -1: every occurrence
    if (e.origin !== 're-attach') entry.warn = true; // NULL is not re-attach
    byId.set(e.segment_id, entry);
  }
  const rows = [];
  for (const [segmentId, { occurrences }] of byId) {
    // A -1 row subsumes the id's specific-occurrence rows.
    if (occurrences.has(-1)) rows.push({ segmentId, occurrence: -1 });
    else for (const occurrence of occurrences) rows.push({ segmentId, occurrence });
  }
  rows.sort((a, b) =>
    a.segmentId < b.segmentId ? -1 : a.segmentId > b.segmentId ? 1 : a.occurrence - b.occurrence
  );
  const warnSegments = [...byId]
    .filter(([, v]) => v.warn)
    .map(([id]) => id)
    .sort();
  return { rows, warnSegments };
}

/**
 * spec §5.5 steps 1–3, in one IMMEDIATE transaction (stated, not left to the first statement being
 * a write: plan amendment 2026-11-05). inflight_count is the number of snapshot rows, known before
 * the insert, so step 3 is folded into step 1's statement. Returns no time (spec §11). Throws on
 * failure, rolled back.
 */
function recordOpening(conn, { book, chapter, moduleId }, { rows, warnSegments }) {
  return conn
    .transaction(() => {
      // ON CONFLICT on the key, never OR IGNORE: OR IGNORE would also swallow a CHECK or NOT NULL
      // failure, which the caller would then read as "a racing serve won" and answer 200 with
      // nothing recorded (decision 6).
      const inserted =
        conn
          .prepare(
            `INSERT INTO module_openings (book, chapter, module_id, opened_at_ms, inflight_count)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (book, chapter, module_id) DO NOTHING`
          )
          .run(book, chapter, moduleId, clock(), rows.length).changes === 1;
      if (!inserted) return { opened: false };
      // A plain INSERT: a duplicate (impossible after snapshotRows' Set) fails loud and rolls the
      // opening back rather than recording half a snapshot.
      const add = conn.prepare(
        `INSERT INTO module_opening_inflight (book, chapter, module_id, segment_id, occurrence)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const r of rows) add.run(book, chapter, moduleId, r.segmentId, r.occurrence);
      return { opened: true, inflightCount: rows.length, inflight: rows, warnSegments };
    })
    .immediate();
}

/** Logs once at error, with no user id, no text and no time (decision 8). */
function unrecorded(cause, err, { book, chapter, moduleId }) {
  log.error(
    { err: err ? { code: err.code, message: err.message } : null, cause, book, chapter, moduleId },
    `Opening could not be recorded: answered 503 ${OPENING_UNRECORDED.code} (spec §5.4)`
  );
  return { status: 'unrecorded', cause };
}

/**
 * spec §5.4 step 4 and §5.5, for one serve. Never throws (decision 7). The route maps only
 * 'unrecorded' (to 503 OPENING_UNRECORDED); every 'skipped' serve is answered exactly as PR1
 * answers it, whatever the mint did.
 */
function openOnServe(conn, { book, chapter, moduleId, providerId, served, segments, edits }) {
  const key = { book, chapter, moduleId };
  let predicate;
  try {
    predicate = openingPredicate(conn, { ...key, providerId });
  } catch (err) {
    return unrecorded('predicate', err, key); // decision 4
  }
  if (!predicate.holds) return { status: 'skipped', reason: predicate.reason };
  if (!served || served.mintOk !== true) return unrecorded('mint', null, key); // "and step 3 failed"
  let opening;
  try {
    opening = recordOpening(conn, key, snapshotRows(segments, edits));
  } catch (err) {
    return unrecorded('step', err, key);
  }
  if (!opening.opened) return { status: 'skipped', reason: 'already-opened' }; // a racing serve won
  if (opening.warnSegments.length > 0) {
    // After the commit (spec §5.5): an in-flight row that re-attach did not write. Segment ids only.
    log.warn(
      { book, chapter, moduleId, segments: opening.warnSegments },
      'Module opened with in-flight edits that re-attach did not write (spec §5.5)'
    );
  }
  return { status: 'opened', opening };
}

/** The detail of PR3's module-opened event (spec §5.9), from the serve's mint and its opening. Pure. */
function moduleOpenedDetail(served, opening) {
  return {
    servedVersionIds: served.servedVersionIds,
    duplicatedIds: served.duplicatedIds,
    inflightCount: opening.inflightCount,
  };
}

module.exports = {
  OPENING_UNRECORDED,
  openingPredicate,
  snapshotRows,
  recordOpening,
  openOnServe,
  moduleOpenedDetail,
  _setTestClock,
};
