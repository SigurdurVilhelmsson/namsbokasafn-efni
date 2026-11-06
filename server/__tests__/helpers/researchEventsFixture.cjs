// server/__tests__/helpers/researchEventsFixture.cjs
/**
 * Readers for the route-level research tests (G1.2 PR3, Task 21; Tasks 22–26 reuse them).
 *
 * Require this file only AFTER the test file has set SESSIONS_DB_PATH (in a mkdtemp directory)
 * and JWT_SECRET, for the reasons researchFixture.cjs gives: the research file derives from
 * SESSIONS_DB_PATH, so nothing here touches pipeline-output/.
 *
 * Plain CJS so ESM vitest files can load it via createRequire.
 */
const fs = require('fs');
const { readResearch } = require('./researchFixture.cjs');
const { resolveResearchDbPath } = require('../../lib/researchDbPath');
const researchConsent = require('../../services/researchConsent');

/** Every research event in insertion-independent order: (server time, key, key_seq). Ids stay BigInt. */
function allEvents() {
  const db = readResearch();
  try {
    return db
      .prepare('SELECT * FROM research_events ORDER BY server_time_ms, editor_key, key_seq')
      .all()
      .map((e) => ({
        ...e,
        content: e.content_json && JSON.parse(e.content_json),
        before: e.before_json && JSON.parse(e.before_json),
        detail: e.detail_json && JSON.parse(e.detail_json),
      }));
  } finally {
    db.close();
  }
}

/** The ids of every event now, as strings (BigInt ids compare by value through String). */
const eventMark = () => new Set(allEvents().map((e) => String(e.id)));

/** The events written since `mark`. */
const eventsSince = (mark) => allEvents().filter((e) => !mark.has(String(e.id)));

/** An event's item rows, by ordinal. */
function itemsOf(eventId) {
  const db = readResearch();
  try {
    return db
      .prepare('SELECT * FROM research_event_items WHERE event_id = ? ORDER BY ordinal')
      .all(eventId);
  } finally {
    db.close();
  }
}

/** The research file's bytes, its WAL included (a committed event may live only in the WAL). */
function researchBytes() {
  const { researchPath } = resolveResearchDbPath();
  return Buffer.concat(
    [researchPath, `${researchPath}-wal`]
      .filter((p) => fs.existsSync(p))
      .map((p) => fs.readFileSync(p))
  );
}

const withdrawConsent = (userId) => researchConsent.withdraw({ userId, nowMs: Date.now() });

module.exports = { allEvents, eventMark, eventsSince, itemsOf, researchBytes, withdrawConsent };
