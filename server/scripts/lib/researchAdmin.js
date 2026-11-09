/**
 * The research file's admin openers and reads (G1.1 + G1.2 spec §5.16, §5.1; PR4 decisions 13 and
 * 16). Admin only: no route reaches it.
 *
 * It holds the openers and the reads, and never a write. The deletion scripts use the key readers
 * (keyForInterval, allKeys). An export uses the event readers (iterateEvents, itemsForEvent) and
 * never the key readers: no export joins the key map (§5.16).
 *
 * openResearch passes fileMustExist, so an absent file is an error and is never created (§5.1),
 * and turns on safe integers, so every research id comes back as a BigInt (PR3 decision 4: the ids
 * are random 63-bit numbers). It never sets the journal mode, which the server owns.
 *
 * SCRIPT_BUSY_TIMEOUT_MS is better-sqlite3's default, longer than the server's 100 ms (PR3 decision
 * 22): a script waits out an in-flight server write, while a server write that meets a script's
 * vacuum becomes a counted busy loss (§5.15 Concurrency).
 *
 * Nothing outside server/scripts/ and server/__tests__/ may require this file:
 * researchBoundary.test.js walks the rest of server/.
 */
const Database = require('better-sqlite3');

const SCRIPT_BUSY_TIMEOUT_MS = 5000;

/**
 * @param {{ researchPath: string, write?: boolean, busyTimeoutMs?: number }} opts
 * @returns {import('better-sqlite3').Database} throws SQLITE_CANTOPEN when the file is absent
 */
function openResearch({ researchPath, write = false, busyTimeoutMs = SCRIPT_BUSY_TIMEOUT_MS }) {
  const db = new Database(researchPath, {
    readonly: !write,
    fileMustExist: true,
    timeout: busyTimeoutMs,
  });
  db.defaultSafeIntegers(true);
  return db;
}

/** @returns {string | null} the interval's editor key */
const keyForInterval = (db, intervalId) =>
  db.prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?').get(intervalId)
    ?.editor_key ?? null;

/** @returns {{ intervalId: bigint, editorKey: string }[]} by interval id */
const allKeys = (db) =>
  db
    .prepare('SELECT interval_id, editor_key FROM editor_keys ORDER BY interval_id')
    .all()
    .map((r) => ({ intervalId: r.interval_id, editorKey: r.editor_key }));

/** @returns {boolean} whether any event, item or key row exists */
const anyResearchRow = (db) =>
  Boolean(
    db
      .prepare(
        'SELECT 1 FROM editor_keys UNION ALL SELECT 1 FROM research_events UNION ALL SELECT 1 FROM research_event_items LIMIT 1'
      )
      .get()
  );

/** @returns {IterableIterator<object>} every event, by editor key then key_seq */
const iterateEvents = (db) =>
  db.prepare('SELECT * FROM research_events ORDER BY editor_key, key_seq').iterate();

/** @returns {object[]} the event's items, by ordinal */
const itemsForEvent = (db, eventId) =>
  db.prepare('SELECT * FROM research_event_items WHERE event_id = ? ORDER BY ordinal').all(eventId);

module.exports = {
  SCRIPT_BUSY_TIMEOUT_MS,
  openResearch,
  keyForInterval,
  allKeys,
  anyResearchRow,
  iterateEvents,
  itemsForEvent,
};
