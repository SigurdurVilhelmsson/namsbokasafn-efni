/**
 * The editorial retention core (G1.15(b) spec §4.3, §4.4; plan Task 5): plan and apply one retention step against a
 * clock argument. Task 5 builds step 1, `named`; steps 2 and 3 come in Task 6, the CLI and the run record in Task 7.
 *
 * `named` (NAMED_EDITING_RECORDS, 31 Dec 2028), in one IMMEDIATE transaction:
 *   - every strip table (server/lib/editorialRetentionScope.js): each person value dated on or before the date, by its
 *     actor's own time column, becomes a placeholder made from its row's rowid, and the row's covered times are cut to
 *     the day (server/lib/retentionStrip.js). The book glossary layer's tables go through the layer's own
 *     stripLayerPersons, never SQL from here (CLAUDE.md), and keep its tool labels, so the public record is unchanged;
 *   - every delete table loses its rows dated on or before the date.
 *
 * Editing ends with 2028 ([USER], 2026-11-21), so nothing dated after the date is ever acted on. Such a record, a time
 * that cannot be read, a name beside a NULL time, or JSON that cannot be parsed is left as it is and reported in
 * `refusals`; the step still applies to everything else.
 *
 * THE TIMESTAMP TRIGGERS. Some strip tables have an AFTER UPDATE trigger that sets updated_at = CURRENT_TIMESTAMP, which
 * would write the run's own time into the rows whose times are being cut. Every trigger on a strip table is therefore
 * dropped and recreated from sqlite_master's own SQL inside the step's transaction: a failure anywhere rolls the
 * triggers back with the rows. This is DDL on the live database, run by the backup cron (Task 8).
 *
 * The core neither compacts nor records a run (Task 7: VACUUM, verification, retention_runs). It reads retention_runs
 * only to know whether a step is already recorded.
 */
const { SCOPE } = require('./editorialRetentionScope');
const { NAMED_EDITING_RECORDS, effectiveMs } = require('./retentionDates');
const { surveyStrip, stripTable, covered, later, unreadable, bind } = require('./retentionStrip');
const { LAYER_TABLES, surveyLayerPersons, stripLayerPersons } = require('./bookGlossaryLayer');

const STEPS = Object.freeze({ named: Object.freeze({ date: NAMED_EDITING_RECORDS }) });

const STRIP_TABLES = Object.freeze(
  Object.keys(SCOPE).filter((t) => SCOPE[t].action === 'strip' && !LAYER_TABLES.includes(t))
);
const DELETE_TABLES = Object.freeze(Object.keys(SCOPE).filter((t) => SCOPE[t].action === 'delete'));
const ALL_STRIP_TABLES = Object.freeze(
  Object.keys(SCOPE).filter((t) => SCOPE[t].action === 'strip')
);

function stepOf(kind) {
  const step = STEPS[kind];
  if (!step) throw new Error(`unknown retention step: ${JSON.stringify(kind)}`);
  return step;
}

/** The row time of a delete table: its person columns all share one (editorialRetentionScope.test.js pins SCOPE). */
function rowTimeOf(table) {
  const cols = [...new Set(SCOPE[table].person.map((p) => p.timeCol))];
  if (cols.length !== 1)
    throw new Error(`${table}: a delete table needs one row time, has ${cols.join(', ')}`);
  return cols[0];
}

function isRecorded(db, kind) {
  return db.prepare('SELECT 1 FROM retention_runs WHERE kind = ?').get(kind) !== undefined;
}

function count(db, sql, params) {
  return db.prepare(sql).pluck().get(bind(sql, params));
}

/** Read-only: the rows the step changes, by table, and what it leaves and reports. */
function survey(db, when) {
  const counts = {};
  const refusals = [];
  const report = (table, s) => {
    if (s.rows) counts[table] = s.rows;
    for (const [reason, n] of [
      ['later-records', s.later],
      ['unreadable-time', s.unreadableTime],
      ['undated-name', s.undated],
      ['unreadable-json', s.unreadableJson ?? 0],
    ]) {
      if (n) refusals.push({ reason, table, rows: n });
    }
  };
  for (const t of STRIP_TABLES) report(t, surveyStrip(db, t, SCOPE[t], when));
  for (const [t, s] of Object.entries(surveyLayerPersons(db, when))) report(t, s);
  for (const t of DELETE_TABLES) {
    const c = rowTimeOf(t);
    report(t, {
      rows: count(db, `SELECT COUNT(*) FROM "${t}" WHERE ${covered(c)}`, when),
      later: count(db, `SELECT COUNT(*) FROM "${t}" WHERE ${later(c)}`, when),
      unreadableTime: count(db, `SELECT COUNT(*) FROM "${t}" WHERE ${unreadable(c)}`, when),
      undated: count(db, `SELECT COUNT(*) FROM "${t}" WHERE "${c}" IS NULL`, when),
    });
  }
  return { counts, refusals };
}

function whenOf(kind, nowMs) {
  const { date } = stepOf(kind);
  return { day: date, effMs: effectiveMs(date), due: nowMs >= effectiveMs(date) };
}

/**
 * What a step would do, read-only.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {'named'} kind
 * @param {number} nowMs
 * @returns {{ due: boolean, counts: Record<string, number>, refusals: {reason: string, table: string, rows: number}[] }}
 */
function planStep(db, kind, nowMs) {
  const { day, effMs, due } = whenOf(kind, nowMs);
  if (!due || isRecorded(db, kind)) return { due: false, counts: {}, refusals: [] };
  return { due: true, ...survey(db, { day, effMs }) };
}

/**
 * Apply a step, in one IMMEDIATE transaction. Before its date, or once recorded, it changes nothing. A second call
 * changes nothing. A throw rolls back every row and trigger.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {'named'} kind
 * @param {number} nowMs
 * @returns {{ due: boolean, changed: number, refusals: {reason: string, table: string, rows: number}[] }}
 */
function applyStep(db, kind, nowMs) {
  const { day, effMs, due } = whenOf(kind, nowMs);
  if (!due) return { due: false, changed: 0, refusals: [] };
  return db
    .transaction(() => {
      if (isRecorded(db, kind)) return { due: false, changed: 0, refusals: [] };
      const when = { day, effMs };
      const { counts, refusals } = survey(db, when);
      const triggers = db
        .prepare(
          `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN (${ALL_STRIP_TABLES.map(() => '?').join(', ')}) ORDER BY name`
        )
        .all(...ALL_STRIP_TABLES);
      for (const { name } of triggers) db.exec(`DROP TRIGGER "${name}"`);
      for (const t of STRIP_TABLES) stripTable(db, t, SCOPE[t], when);
      stripLayerPersons(db, when);
      for (const t of DELETE_TABLES) {
        const sql = `DELETE FROM "${t}" WHERE ${covered(rowTimeOf(t))}`;
        db.prepare(sql).run(bind(sql, when));
      }
      for (const { sql } of triggers) db.exec(sql);
      return { due: true, changed: Object.values(counts).reduce((a, b) => a + b, 0), refusals };
    })
    .immediate();
}

module.exports = { planStep, applyStep, STEPS };
