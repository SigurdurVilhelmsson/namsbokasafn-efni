/**
 * Acceptance Service — per-segment MT-acceptance records (item 20b).
 *
 * "Staðfesta vélþýðingu": an editor attests that a segment's existing IS
 * content (usually the MT draft) is correct as-is. The record is
 * byte-anchored: accepted_content must equal the editor-view baseline at
 * accept time (STALE_CONTENT) and lapses when the segment's content later
 * changes by any route (content-drift) — it can never silently bless bytes
 * the editor didn't read.
 *
 * Also owns the derived per-module review-status sidecar written next to
 * the faithful file at apply/restore time (rides the 03-faithful-translation
 * git-backup pathspec).
 *
 * Mutating helpers take an optional trailing dbConn: callers already inside
 * a write transaction on their OWN connection (saveSegmentEdit, apply) must
 * pass it — a second connection's write would hit SQLITE_BUSY (same rule as
 * contentVersionService.snapshotModule).
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const log = require('../lib/logger');
const mtLock = require('../../tools/lib/mt-lock.cjs');
const segmentParser = require('./segmentParser');
const servedVersions = require('./servedVersions');
const resolveDbPath = require('../lib/dbPath');
const { pickLatest } = require('../lib/editRecency');
const { isNotMintedBook } = require('../lib/servedText');
const {
  normalizeWraps,
  unescapeMtMarkers,
  normalizeTermMarkers,
} = require('../../tools/lib/mt-normalize.cjs');

const DB_PATH = resolveDbPath();

let db;
function getDb() {
  if (!db) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function codedError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Reconstruct the editor-visible view of a stored segment text.
 *
 * Mirrors loadModuleForEditing exactly — parseSegments applies normalizeWraps,
 * then the IS lookup unescapes MT markers, then term markers are normalized
 * against the EN source. Used to compare stored `edited_content` with the
 * live baseline like-for-like.
 */
function editorViewOf(enContent, storedText) {
  if (typeof storedText !== 'string') return null;
  return normalizeTermMarkers(enContent, unescapeMtMarkers(normalizeWraps(storedText)));
}

/**
 * Record an acceptance of a segment's current content.
 *
 * The baseline is the same loadModuleForEditing view the client loaded, so
 * the byte comparison is both the concurrency token and the saveRetry replay
 * guard: a queued replay after content changed 409s instead of blessing
 * unseen bytes.
 *
 * G1.1 (spec §5.6 Accept, §5.8): with `occurrence` an integer (the accept route passes the one
 * `servedEdit.placeOnServedBase` placed, after refusing a duplicated id, organic and a module with
 * no layer), the new row records the served version of the segment compared here, and that
 * occurrence. Without it (direct callers) both columns stay NULL, "made before G1.1" (§5.8).
 * A book that is never minted (organic) is refused here too, before anything is loaded, with the
 * refusal placeOnServedBase throws, so a direct caller cannot write what the route refuses (§11).
 *
 * @returns {{ alreadyAccepted: boolean, acceptance: object }}
 */
function acceptSegment({
  book,
  chapter,
  moduleId,
  segmentId,
  acceptedContent,
  userId,
  username,
  occurrence,
}) {
  // Required here, not at the top: servedEdit requires segmentEditorService, which requires this
  // module, so a top-level require would hand one of them a half-loaded export object.
  if (isNotMintedBook(book)) throw require('./servedEdit').refuse('BOOK_NOT_MINTED');
  const conn = getDb();

  const data = segmentParser.loadModuleForEditing(book, chapter, moduleId);
  const seg = data.segments.find((s) => s.segmentId === segmentId);
  if (!seg) {
    throw codedError('SEGMENT_NOT_FOUND', 'segment not found');
  }
  if (!seg.hasTranslation) {
    throw codedError('NO_TRANSLATION', 'Þessi bútur hefur enga þýðingu til að staðfesta.');
  }
  if (acceptedContent !== seg.is) {
    throw codedError(
      'STALE_CONTENT',
      'Innihald bútsins hefur breyst — endurhlaðið eininguna og staðfestið aftur.'
    );
  }

  // An active (pending or approved-but-unapplied) edit outranks acceptance:
  // the segment is not "MT as-is" while a revision is in flight.
  const activeEdit = conn
    .prepare(
      `SELECT id FROM segment_edits
       WHERE book = ? AND module_id = ? AND segment_id = ?
         AND (status = 'pending' OR (status = 'approved' AND applied_at IS NULL))`
    )
    .get(book, moduleId, segmentId);
  if (activeEdit) {
    throw codedError(
      'EDIT_EXISTS',
      'Bútur er með virka breytingu í ferli — staðfesting á ekki við.'
    );
  }

  // An open discussion is unresolved review work. Accepting over it would let
  // an editor who is not party to the discussion close a flagged disagreement
  // single-handedly, and would fork the two definitions of "done": the
  // reviewed-union would count the module complete while completeModuleReview
  // still refuses it (counts.discuss === 0 gate). MTA-R3, lead decision.
  const discussEdit = conn
    .prepare(
      `SELECT id FROM segment_edits
       WHERE book = ? AND module_id = ? AND segment_id = ? AND status = 'discuss'`
    )
    .get(book, moduleId, segmentId);
  if (discussEdit) {
    throw codedError(
      'DISCUSS_OPEN',
      'Umræða er opin um þennan bút — leysa þarf úr henni áður en hægt er að staðfesta.'
    );
  }

  // A published edit whose text IS the current baseline means seg.is is human
  // translation, not MT (loadModuleForEditing reads 03-faithful-translation as
  // the baseline once it exists). Attesting it as MT would flip the review-status
  // sidecar from `edited` to `accepted` and misattribute a human's work in the
  // durable provenance record. Byte-based on purpose: after a content restore
  // the applied text is no longer on disk, the bytes really are MT again, and
  // accepting them is honest — the restore edge (MTA-R4) stays open.
  //
  // Compared through the SAME normalization the editor view applies, not on
  // raw bytes: applyApprovedEdits writes edited_content verbatim into the
  // faithful file, and loadModuleForEditing normalizes what it reads back
  // (normalizeWraps → unescapeMtMarkers → normalizeTermMarkers). A raw
  // comparison therefore fails OPEN whenever the editor's text contained a
  // hard wrap, a backslash escape or a term marker — letting human text be
  // attested as MT, which is the exact hole this guard exists to close.
  const publishedEdit = conn
    .prepare(
      `SELECT id, edited_content FROM segment_edits
       WHERE book = ? AND module_id = ? AND segment_id = ?
         AND status = 'approved' AND applied_at IS NOT NULL`
    )
    .all(book, moduleId, segmentId)
    .find((e) => editorViewOf(seg.en, e.edited_content) === seg.is);
  if (publishedEdit) {
    throw codedError(
      'HUMAN_CONTENT',
      'Núverandi texti er samþykkt breyting yfirlesara, ekki vélþýðing — ekki hægt að staðfesta hann sem vélþýðingu.'
    );
  }

  const existing = conn
    .prepare(
      `SELECT * FROM segment_acceptances
       WHERE book = ? AND module_id = ? AND segment_id = ? AND status = 'active'`
    )
    .get(book, moduleId, segmentId);
  if (existing) {
    return { alreadyAccepted: true, acceptance: existing };
  }

  const mint = Number.isInteger(occurrence);
  let insertResult;
  try {
    // Spec §5.6 Accept (plan decision 12): the served version is minted from the segment compared
    // above, in one transaction with the INSERT, so the minted text is exactly the compared text,
    // and an alreadyAccepted result (returned above) or a lost race (below) writes nothing.
    const mintAndInsert = conn.transaction(() => {
      const servedVersionId = mint
        ? servedVersions.mintVersions(conn, [
            servedVersions.buildVersionRow({
              book,
              chapter,
              moduleId,
              segmentId,
              occurrence,
              en: seg.en,
              is: seg.is,
              layer: data.isSource,
            }),
          ])[0]
        : null;
      return conn
        .prepare(
          `INSERT INTO segment_acceptances
             (book, chapter, module_id, segment_id, accepted_content, accepted_by,
              accepted_by_username, served_version_id, occurrence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          book,
          chapter,
          moduleId,
          segmentId,
          acceptedContent,
          String(userId),
          username,
          servedVersionId,
          mint ? occurrence : null
        );
    });
    // IMMEDIATE, because with an occurrence its first statement is the mint's SELECT: a deferred
    // transaction would hold a read when it asks for the write lock, which SQLite refuses at once
    // with SQLITE_BUSY instead of waiting the busy timeout (PR1 review C2).
    insertResult = mintAndInsert.immediate();
  } catch (err) {
    // Two concurrent accepts race past the SELECT: the partial unique index
    // decides, and the loser resolves to the winner's row (idempotent). The
    // loser's mint rolled back with its INSERT, so it leaves no version.
    if (String(err.code || '').startsWith('SQLITE_CONSTRAINT')) {
      const winner = conn
        .prepare(
          `SELECT * FROM segment_acceptances
           WHERE book = ? AND module_id = ? AND segment_id = ? AND status = 'active'`
        )
        .get(book, moduleId, segmentId);
      if (winner) return { alreadyAccepted: true, acceptance: winner };
    }
    throw err;
  }

  // MT edit-lock (Track C, mirror of the first-edit path in saveSegmentEdit):
  // a module whose MT a human has REVIEWED must never be silently
  // re-translated. Loud but non-blocking — a lock-write failure must never
  // break the accept itself.
  try {
    const priorCount = conn
      .prepare(
        `SELECT count(*) AS n FROM segment_acceptances
         WHERE book = ? AND chapter = ? AND module_id = ?`
      )
      .get(book, chapter, moduleId).n;
    if (priorCount === 1) {
      const { mtOutput } = segmentParser.getModulePaths(book, chapter, moduleId);
      if (fs.existsSync(mtOutput)) {
        mtLock.writeMtLock(mtOutput, {
          reason: 'acceptance-started',
          firstAcceptanceId: insertResult.lastInsertRowid,
        });
      }
    }
  } catch (err) {
    log.error({ err, book, chapter, moduleId }, 'MT lock write failed on first acceptance');
  }

  return {
    alreadyAccepted: false,
    acceptance: conn
      .prepare(`SELECT * FROM segment_acceptances WHERE id = ?`)
      .get(insertResult.lastInsertRowid),
  };
}

/** Active acceptances for a module. */
function getModuleAcceptances(book, moduleId) {
  return getDb()
    .prepare(
      `SELECT * FROM segment_acceptances
       WHERE book = ? AND module_id = ? AND status = 'active'
       ORDER BY id ASC`
    )
    .all(book, moduleId);
}

function getAcceptanceById(id) {
  return getDb().prepare(`SELECT * FROM segment_acceptances WHERE id = ?`).get(id);
}

/**
 * Revoke an active acceptance. Owner, or a head editor scoped to the row's
 * book (admin bypasses) — the authz lives here because owner-OR-HE cannot be
 * expressed by the route middleware (same pattern as deleteSegmentEdit).
 */
function revokeAcceptance(acceptanceId, { actorId, actorRole, actorBooks }) {
  const conn = getDb();
  // G1.2 (spec §5.9): the before-image is read in the write's own transaction; IMMEDIATE takes the
  // write lock before the read (decision 45).
  return conn
    .transaction(() => {
      const row = conn.prepare(`SELECT * FROM segment_acceptances WHERE id = ?`).get(acceptanceId);
      if (!row) throw new Error('Acceptance not found');
      if (row.status !== 'active') throw new Error('Acceptance is not active');

      const isOwner = String(row.accepted_by) === String(actorId);
      const isHead =
        actorRole === 'admin' ||
        (actorRole === 'head-editor' && Array.isArray(actorBooks) && actorBooks.includes(row.book));
      if (!isOwner && !isHead) {
        throw codedError(
          'FORBIDDEN',
          'Aðeins eigandi staðfestingar eða aðalritstjóri bókarinnar getur afturkallað hana.'
        );
      }

      conn
        .prepare(
          `UPDATE segment_acceptances
         SET status = 'superseded', superseded_at = CURRENT_TIMESTAMP, superseded_reason = 'revoked'
         WHERE id = ?`
        )
        .run(acceptanceId);
      return {
        ...conn.prepare(`SELECT * FROM segment_acceptances WHERE id = ?`).get(acceptanceId),
        before: row,
      };
    })
    .immediate();
}

/**
 * Supersede the segment's active acceptance because an edit was saved on it
 * (spec §7). Called from inside saveSegmentEdit's transactions — pass conn.
 */
function supersedeForEdit(book, moduleId, segmentId, dbConn = getDb()) {
  // G1.2 (spec §5.9): the ids are read in the caller's transaction, before the UPDATE, for the
  // save's event.
  return dbConn
    .transaction(() => {
      const ids = dbConn
        .prepare(
          `SELECT id FROM segment_acceptances
         WHERE book = ? AND module_id = ? AND segment_id = ? AND status = 'active' ORDER BY id`
        )
        .all(book, moduleId, segmentId)
        .map((r) => r.id);
      dbConn
        .prepare(
          `UPDATE segment_acceptances
         SET status = 'superseded', superseded_at = CURRENT_TIMESTAMP,
             superseded_reason = 'superseded-by-edit'
         WHERE book = ? AND module_id = ? AND segment_id = ? AND status = 'active'`
        )
        .run(book, moduleId, segmentId);
      return ids;
    })
    .immediate(); // write lock first (decision 45); nests as a savepoint in an outer tx
}

/**
 * §C209: the two apply-path writers below are scoped to ONE chapter's file.
 * `chapter-metadata` is a single module id shared by every chapter, so a
 * (book, module_id) scope reached every other chapter's rows from one
 * chapter's apply or restore. An ordinary module's rows all carry its one
 * chapter, so the scope changes nothing for it. Required and checked, so a
 * call in the old (book, moduleId, …) order fails loud instead of shifting.
 */
function assertChapter(fn, chapter) {
  if (!Number.isInteger(chapter)) {
    throw new TypeError(`${fn}: chapter must be an integer (appendices = -1), got ${chapter}`);
  }
}

/**
 * Lapse acceptances whose attested bytes no longer match the content just
 * written for their segment. writtenSegments is [{segmentId, content}] — the
 * exact bytes the caller (apply/restore) wrote, so no disk re-read and no
 * normalization ambiguity. A segment missing from the written set counts as
 * drifted (the extraction no longer carries it). Only the written chapter's
 * acceptances are considered (§C209).
 *
 * G1.2 (spec §5.9; decision 46): the read and the lapse are one transaction on the connection
 * given (a savepoint inside apply's), IMMEDIATE because its first statement is the read
 * (decision 45).
 *
 * @returns {number[]} the lapsed rows' ids, ascending
 */
function lapseDriftedIds(book, chapter, moduleId, writtenSegments, dbConn = getDb()) {
  assertChapter('lapseDriftedIds', chapter);
  const byId = new Map(writtenSegments.map((s) => [s.segmentId, s.content]));
  return dbConn
    .transaction(() => {
      const active = dbConn
        .prepare(
          `SELECT id, segment_id, accepted_content FROM segment_acceptances
           WHERE book = ? AND chapter = ? AND module_id = ? AND status = 'active' ORDER BY id`
        )
        .all(book, chapter, moduleId);
      const lapse = dbConn.prepare(
        `UPDATE segment_acceptances
         SET status = 'superseded', superseded_at = CURRENT_TIMESTAMP,
             superseded_reason = 'content-drift'
         WHERE id = ?`
      );
      const lapsed = [];
      for (const a of active) {
        if (byId.get(a.segment_id) !== a.accepted_content) {
          lapse.run(a.id);
          lapsed.push(a.id);
        }
      }
      return lapsed;
    })
    .immediate();
}

/** @returns {number} lapsed row count (the count contract `lapseDriftedIds` keeps) */
function lapseDrifted(book, chapter, moduleId, writtenSegments, dbConn = getDb()) {
  assertChapter('lapseDrifted', chapter);
  return lapseDriftedIds(book, chapter, moduleId, writtenSegments, dbConn).length;
}

/**
 * Stamp all still-active, not-yet-applied acceptances as published (spec §7:
 * "acceptances that are active at a successful apply get applied_at"), in the
 * applied chapter only (§C209).
 *
 * G1.2 (spec §5.9; decision 48): one statement, so the ids it returns are exactly the rows the
 * UPDATE stamped.
 *
 * @returns {number[]} the stamped rows' ids, ascending
 */
function stampAppliedIds(book, chapter, moduleId, dbConn = getDb()) {
  assertChapter('stampAppliedIds', chapter);
  return dbConn
    .prepare(
      `UPDATE segment_acceptances SET applied_at = CURRENT_TIMESTAMP
       WHERE book = ? AND chapter = ? AND module_id = ? AND status = 'active' AND applied_at IS NULL
       RETURNING id`
    )
    .all(book, chapter, moduleId)
    .map((r) => r.id)
    .sort((x, y) => x - y);
}

/** @returns {number} stamped row count (the count contract `stampAppliedIds` keeps) */
function stampApplied(book, chapter, moduleId, dbConn = getDb()) {
  assertChapter('stampApplied', chapter);
  return stampAppliedIds(book, chapter, moduleId, dbConn).length;
}

/** Sidecar path: sibling of the faithful segments file. */
function sidecarPathFor(book, chapter, moduleId) {
  const { faithful } = segmentParser.getModulePaths(book, chapter, moduleId);
  return faithful.replace(/-segments\.is\.md$/, '-review-status.json');
}

/**
 * Derive and write the per-module review-status sidecar (spec §8) from DB
 * state + the faithful file. Key order = file segment order (deterministic).
 *
 * Status per segment:
 *   accepted  — active acceptance. Checked FIRST: drift-lapse runs before
 *               every sidecar regeneration, so an active acceptance is
 *               content-verified for the CURRENT bytes even when an older
 *               applied edit exists on the segment (restore edge).
 *   edited    — an approved+applied edit exists (newest by the canonical
 *               recency rule); by/at = editor_username/reviewed_at.
 *   carryover — published without per-segment review.
 *
 * @returns {string} the sidecar path
 */
function writeReviewStatusSidecar(book, chapter, moduleId, dbConn = getDb()) {
  const { faithful } = segmentParser.getModulePaths(book, chapter, moduleId);
  if (!fs.existsSync(faithful)) {
    throw new Error(`Faithful file not found — no sidecar to derive: ${faithful}`);
  }
  const fileSegments = segmentParser.parseSegments(fs.readFileSync(faithful, 'utf-8'));

  const acceptancesBySeg = new Map(
    dbConn
      .prepare(
        `SELECT * FROM segment_acceptances
         WHERE book = ? AND module_id = ? AND status = 'active'`
      )
      .all(book, moduleId)
      .map((a) => [a.segment_id, a])
  );

  const appliedEditsBySeg = {};
  for (const e of dbConn
    .prepare(
      `SELECT id, segment_id, editor_username, reviewed_at, created_at
       FROM segment_edits
       WHERE book = ? AND module_id = ? AND status = 'approved' AND applied_at IS NOT NULL`
    )
    .all(book, moduleId)) {
    (appliedEditsBySeg[e.segment_id] = appliedEditsBySeg[e.segment_id] || []).push(e);
  }

  const segments = {};
  for (const seg of fileSegments) {
    const acc = acceptancesBySeg.get(seg.segmentId);
    if (acc) {
      segments[seg.segmentId] = {
        status: 'accepted',
        by: acc.accepted_by_username,
        at: acc.accepted_at,
      };
    } else if (appliedEditsBySeg[seg.segmentId]) {
      const winner = pickLatest(appliedEditsBySeg[seg.segmentId]);
      segments[seg.segmentId] = {
        status: 'edited',
        by: winner.editor_username,
        at: winner.reviewed_at,
      };
    } else {
      segments[seg.segmentId] = { status: 'carryover' };
    }
  }

  const sidecar = {
    generated: new Date().toISOString(),
    book,
    chapter: String(chapter),
    module: moduleId,
    segments,
  };
  const outPath = sidecarPathFor(book, chapter, moduleId);
  fs.writeFileSync(outPath, JSON.stringify(sidecar, null, 2) + '\n', 'utf-8');
  return outPath;
}

/**
 * Best-effort sidecar regen: a revoke (or any other status flip) changes what
 * the durable sidecar should say, so refresh it — but the sidecar only
 * exists once the module has been applied, and writeReviewStatusSidecar
 * throws 'Faithful file not found' otherwise. That's an expected no-op here;
 * any OTHER failure is logged, never thrown — never turn a succeeded
 * mutation into a failed request over a best-effort regen (item 20b
 * final-review F1).
 */
function regenSidecarSafe(book, chapter, moduleId, dbConn = getDb()) {
  try {
    writeReviewStatusSidecar(book, chapter, moduleId, dbConn);
  } catch (err) {
    if (!/Faithful file not found/.test(err.message)) {
      log.error({ err, book, moduleId }, 'Sidecar regen failed');
    }
  }
}

/** @internal Test-only: inject an in-memory DB instance */
function _setTestDb(testDb) {
  db = testDb;
}

module.exports = {
  acceptSegment,
  getModuleAcceptances,
  getAcceptanceById,
  revokeAcceptance,
  supersedeForEdit,
  lapseDrifted,
  lapseDriftedIds,
  stampApplied,
  stampAppliedIds,
  sidecarPathFor,
  writeReviewStatusSidecar,
  regenSidecarSafe,
  _setTestDb,
};
