/**
 * suggestionView — the read half of G1.23's suggestion view (spec §6.1–6.4, §6.6; index decisions
 * 4–7). Given a module serve, it decides which AI term-suggestion groups each segment is offered and
 * which accepted words carry a GG tag. The module route calls offeredForModule once per serve (PR1
 * Task 6); PR2 builds its write side on moduleContext and staticGroupsFor.
 *
 * THE STATIC RULES, each independent (spec §6: none substitutes for another):
 *   §6.1 the drop filter, and decision 18's marker rule: suggestionLogs.keptGroups applies both.
 *   §6.2 eligibility per unit: isEligible, below.
 *   §6.3 integrity: the route's seg.baseSha256 (G1.1's hash of the served Icelandic, minted by
 *        servedVersions) must equal the beforeSha256 of the FIRST record of the segment's full
 *        chain, before the drop (decision 5). This file never hashes text: one mechanism, not two.
 *   §6.3a the opening's snapshot: a segment in flight when its module opened is never offered
 *        there. A snapshot row with occurrence -1 covers every occurrence of its id (decision 6).
 *   §6.4 duplicated ids: the route gives a duplicated id no baseSha256, and organic no baseSha256 at
 *        all, so the §6.3 check withholds them. That absence IS the rule here (decision 5).
 *   §6.6 not closed: a group with any op rejected, or left open, on that segment and occurrence is
 *        never offered again; one closed op closes its whole group.
 * §6.5 (does the group place on the text now displayed) is the browser's: the server sends the
 * static groups and suggestion-placement.js places them on whatever the pane shows.
 *
 * THE DISPLAYED EDIT is the segment's newest edit row when it is in flight, exactly the rule of the
 * client's baselineTextFor (segment-editor.js): an older pending row under a newer rejected one is
 * not displayed, and neither is its accepted list.
 *
 * NO TIME, OPENED STATE OR SWITCH STATE GOES INTO A RESPONSE (G1.1 + G1.2 spec §11). isEligible's
 * `reason` and moduleContext's `eligible`/`reason`/`inflight` are exported for server-side use only
 * and must never be put into a response; offeredForModule returns per-segment groups and tags and
 * nothing else. moduleOpenings.readOpening's time is compared here and dropped.
 *
 * Every module object is reached through its export object, never destructured, so a test can spy
 * on suggestionLogs.readModuleLog and suggestionLogs.keptGroups.
 */

const suggestionLogs = require('../lib/suggestionLogs');
const bookSwitches = require('../lib/bookSwitches');
const { isStudyBook } = require('../lib/researchScope');
const { isEditInFlight } = require('../public/js/accept-eligibility');
const moduleOpenings = require('./moduleOpenings');
const log = require('../lib/logger');

const SWITCH = 'suggestion-view';

/**
 * Eligibility and the opening it was decided on. R4's order: the book first (pure, touches no
 * table), then the switch's first switch-on, its current value, the opening, and the strict time
 * comparison. Throws on a damaged database.
 */
function eligibility(conn, { book, chapter, moduleId }) {
  if (!isStudyBook(book)) return { eligible: false, reason: 'not-study-book', opening: null };
  const firstOnMs = bookSwitches.firstSwitchOnMs(conn, book, SWITCH);
  if (firstOnMs === null) return { eligible: false, reason: 'never-switched-on', opening: null };
  if (!bookSwitches.currentSwitchValue(conn, book, SWITCH)) {
    return { eligible: false, reason: 'switch-off', opening: null };
  }
  const opening = moduleOpenings.readOpening(conn, { book, chapter, moduleId });
  if (!opening) return { eligible: false, reason: 'not-opened', opening: null };
  // Strictly before: a switch-on in the opening's own millisecond is not before it.
  if (!(firstOnMs < opening.openedAtMs)) {
    return { eligible: false, reason: 'opened-before-switch-on', opening: null };
  }
  return { eligible: true, reason: 'eligible', opening };
}

/**
 * spec §6.2 (index decision 4, in controller ruling R4's order): a module gets suggestions only if
 * its book is a study book, the view's switch was switched on for that book and is on now, and the
 * module opened strictly after the FIRST switch-on (the lowest-id on row, bookSwitches). A non-study
 * book returns before any table is read. Throws on a damaged database.
 *
 * @param {import('better-sqlite3').Database} conn sessions.db
 * @param {{ book: string, chapter: number, moduleId: string }} key
 * @returns {{ eligible: boolean, reason: 'not-study-book' | 'never-switched-on' | 'switch-off' |
 *   'not-opened' | 'opened-before-switch-on' | 'eligible' }}
 */
function isEligible(conn, key) {
  const { eligible, reason } = eligibility(conn, key);
  return { eligible, reason };
}

/**
 * spec §6.6: the module's closed ops, rejected or left open, from both tables, as
 * "<segmentId>#<occurrence>|<opId>". Throws on a damaged database.
 *
 * @param {import('better-sqlite3').Database} conn sessions.db
 * @param {{ book: string, chapter: number, moduleId: string }} key
 * @returns {Set<string>}
 */
function closedOpKeys(conn, { book, chapter, moduleId }) {
  const rows = conn
    .prepare(
      `SELECT segment_id, occurrence, op_id FROM suggestion_rejections
         WHERE book = ? AND chapter = ? AND module_id = ?
       UNION
       SELECT segment_id, occurrence, op_id FROM suggestion_left_open
         WHERE book = ? AND chapter = ? AND module_id = ?`
    )
    .all(book, chapter, moduleId, book, chapter, moduleId);
  return new Set(rows.map((r) => `${r.segment_id}#${r.occurrence}|${r.op_id}`));
}

/**
 * Everything the static rules need for one module, read once. The log and the closed tables are
 * read ONLY for an eligible module, so a serve of any other module costs the cheap checks alone.
 * Throws on a damaged database.
 *
 * @param {import('better-sqlite3').Database} conn sessions.db
 * @param {{ book: string, chapter: number, moduleId: string }} key
 * @returns {{ eligible: boolean, reason: string, log: object | null, inflight: Set<string>,
 *   closed: Set<string> }} inflight holds "<segmentId>#<occurrence>", and "<segmentId>#*" for a
 *   snapshot row with occurrence -1.
 */
function moduleContext(conn, key) {
  const { eligible, reason, opening } = eligibility(conn, key);
  if (!eligible) {
    return { eligible: false, reason, log: null, inflight: new Set(), closed: new Set() };
  }
  const inflight = new Set(
    opening.inflight.map((r) => `${r.segmentId}#${r.occurrence === -1 ? '*' : r.occurrence}`)
  );
  const moduleLog = suggestionLogs.readModuleLog({
    book: key.book,
    chapter: key.chapter,
    moduleId: key.moduleId,
  });
  return { eligible, reason, log: moduleLog, inflight, closed: closedOpKeys(conn, key) };
}

// The kept groups of each log, computed once per log object (so once per context, however many
// segments ask). Keyed weakly: a context's log is dropped with the request that read it.
const keptByLog = new WeakMap();
function keptGroupsOf(moduleLog) {
  let kept = keptByLog.get(moduleLog);
  if (!kept) {
    kept = suggestionLogs.keptGroups(moduleLog);
    keptByLog.set(moduleLog, kept);
  }
  return kept;
}

/**
 * The groups one served segment may be offered under the static rules (spec §6.1–6.4, §6.6): []
 * unless the context is eligible, its log is usable, the segment's baseSha256 is a string equal to
 * its chain's first beforeSha256, and the segment is not in the opening's snapshot (by its
 * occurrence or by -1); then its kept groups, in first-chainIndex order, minus every group with a
 * closed op. Pure on the context.
 *
 * @param {ReturnType<typeof moduleContext>} ctx
 * @param {{ segmentId: string, occurrence: number, baseSha256?: string }} segment
 * @returns {object[]} groups in the index's shape (suggestionLogs.keptGroups)
 */
function staticGroupsFor(ctx, { segmentId, occurrence, baseSha256 }) {
  if (!ctx || !ctx.eligible || !ctx.log || !ctx.log.ok) return [];
  if (typeof baseSha256 !== 'string') return [];
  if (baseSha256 !== suggestionLogs.firstBeforeSha256(ctx.log, segmentId, occurrence)) return [];
  const place = `${segmentId}#${occurrence}`;
  if (ctx.inflight.has(place) || ctx.inflight.has(`${segmentId}#*`)) return [];
  // One closed op closes its whole group (spec §6.6, §7).
  return (keptGroupsOf(ctx.log).get(place) || []).filter(
    (g) => !g.changes.some((c) => ctx.closed.has(`${place}|${c.opId}`))
  );
}

/**
 * The one parser of the accepted_suggestions column (the read side and the save share it). The column
 * is JSON text, NULL meaning none; anything that is not an array of { opId: string, occurrence:
 * integer } (unparseable text, another shape, one bad entry) counts as an empty list. NULL is
 * silent; a non-NULL value thrown away warns once with ctx (the place: { book, chapter, moduleId,
 * segmentId }) and a reason word, never the value. Never throws.
 *
 * @param {unknown} value the column's value
 * @param {object} ctx the place, for the warning
 * @returns {Array<{ opId: string, occurrence: number }>}
 */
function parseAcceptedSuggestions(value, ctx) {
  if (value === null || value === undefined) return [];
  const discard = (reason) => {
    log.warn({ ...ctx, reason }, 'accepted_suggestions discarded; counted as none');
    return [];
  };
  if (typeof value !== 'string') return discard('malformed');
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return discard('malformed');
  }
  if (!isEntryList(parsed)) return discard('malformed');
  return parsed.map((e) => ({ opId: e.opId, occurrence: e.occurrence }));
}

function isEntryList(v) {
  return (
    Array.isArray(v) &&
    v.every(
      (e) =>
        e !== null &&
        typeof e === 'object' &&
        typeof e.opId === 'string' &&
        Number.isInteger(e.occurrence)
    )
  );
}

/** The op ids a displayed edit's accepted_suggestions lists for this occurrence. Never throws. */
function acceptedOpIds(value, occurrence, ctx) {
  return new Set(
    parseAcceptedSuggestions(value, ctx)
      .filter((e) => e.occurrence === occurrence)
      .map((e) => e.opId)
  );
}

/**
 * What a save stores in segment_edits.accepted_suggestions (spec §7): the distinct { opId,
 * occurrence } of `previous` (the entries the editing row, and the row it displayed, already hold,
 * parsed) and `claimed` (the body's list, untrusted) whose occurrence is this save's, whose op is in
 * the module log's kept groups for that segment and occurrence, and whose `replace` text occurs in
 * the text being saved. A log that is not ok keeps nothing. Pure; never throws.
 *
 * @param {object | null} moduleLog readModuleLog's result
 * @param {{ segmentId: string, occurrence: number, editedContent: string, claimed: unknown,
 *   previous: unknown }} input
 * @returns {string | null} canonical JSON sorted by opId, or null when nothing is kept
 */
function acceptedForSave(moduleLog, { segmentId, occurrence, editedContent, claimed, previous }) {
  if (!moduleLog || moduleLog.ok !== true || typeof editedContent !== 'string') return null;
  const wanted = new Set();
  for (const list of [previous, claimed]) {
    if (!isEntryList(list)) continue;
    for (const e of list) if (e.occurrence === occurrence) wanted.add(e.opId);
  }
  if (wanted.size === 0) return null;
  const groups = keptGroupsOf(moduleLog).get(`${segmentId}#${occurrence}`) || [];
  const kept = new Map();
  for (const g of groups) {
    for (const c of g.changes) {
      if (wanted.has(c.opId) && c.occurrence === occurrence && editedContent.includes(c.replace)) {
        kept.set(c.opId, { opId: c.opId, occurrence });
      }
    }
  }
  if (kept.size === 0) return null;
  return JSON.stringify(
    [...kept.values()].sort((a, b) => (a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0))
  );
}

/**
 * The offered set of one module serve (spec §6.1–6.4, §6.6, §7): per served segment, `groups`, the
 * static groups with no op in the displayed edit's accepted list, and `tagged`, the static groups'
 * changes whose op IS in that list, in chain order, each { opId, occurrence, find, replace, rulingId,
 * chainIndex }. Tags only when the displayed edit is pending: an approved, unapplied edit gets
 * neither its accepted groups offered nor tags. A withheld segment, a closed op or a switched-off
 * view shows no tags either, since tags come only from the static groups. Only segments with a group
 * or a tag are in the map, keyed by segmentId.
 *
 * NEVER THROWS: any failure warns once (book, chapter, moduleId and a reason word, never text) and
 * returns an empty map, so a damaged log or table never costs an editor the module (spec §5). It
 * returns no time, opened state or switch state.
 *
 * @param {import('better-sqlite3').Database} conn sessions.db
 * @param {{ book: string, chapter: number, moduleId: string, segments: Array<{ segmentId: string,
 *   occurrence: number, baseSha256?: string }>, editsBySegment: Record<string, object[]> }} input
 *   editsBySegment is the route's: each segment's edit rows, newest first.
 * @returns {Map<string, { groups: object[], tagged: object[] }>}
 */
function offeredForModule(conn, { book, chapter, moduleId, segments, editsBySegment }) {
  try {
    const ctx = moduleContext(conn, { book, chapter, moduleId });
    const offered = new Map();
    if (!ctx.eligible || !ctx.log || !ctx.log.ok) return offered;
    for (const seg of segments) {
      const groups = staticGroupsFor(ctx, seg);
      if (groups.length === 0) continue;
      const newest = ((editsBySegment && editsBySegment[seg.segmentId]) || [])[0];
      const displayed = isEditInFlight(newest) ? newest : null;
      const accepted = displayed
        ? acceptedOpIds(displayed.accepted_suggestions, seg.occurrence, {
            book,
            chapter,
            moduleId,
            segmentId: seg.segmentId,
          })
        : new Set();
      const shown = groups.filter((g) => !g.changes.some((c) => accepted.has(c.opId)));
      const tagged =
        displayed && displayed.status === 'pending'
          ? groups
              .flatMap((g) =>
                g.changes
                  .filter((c) => accepted.has(c.opId))
                  .map((c) => ({
                    opId: c.opId,
                    occurrence: c.occurrence,
                    find: c.find,
                    replace: c.replace,
                    rulingId: g.rulingId,
                    chainIndex: c.chainIndex,
                  }))
              )
              .sort((a, b) => a.chainIndex - b.chainIndex)
          : [];
      if (shown.length > 0 || tagged.length > 0) {
        offered.set(seg.segmentId, { groups: shown, tagged });
      }
    }
    return offered;
  } catch (err) {
    log.warn(
      { book, chapter, moduleId, reason: (err && (err.code || err.name)) || 'error' },
      'suggestion view failed; no suggestions for this module'
    );
    return new Map();
  }
}

module.exports = {
  isEligible,
  closedOpKeys,
  moduleContext,
  staticGroupsFor,
  offeredForModule,
  parseAcceptedSuggestions,
  acceptedForSave,
};
