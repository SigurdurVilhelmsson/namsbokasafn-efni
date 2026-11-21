/**
 * The editorial retention core (G1.15(b) spec §4.3, §4.4; plan Task 5): plan and apply one retention step against a
 * clock argument: step 1 `named`, step 2 `unnamed` and step 3 `consent`. The CLI and the run record are Task 7's.
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
 * `unnamed` (UNNAMED_RECORDS, 31 Dec 2029): clears served_version_id in segment_edits and segment_acceptances, then
 * deletes served_text_versions and module_openings (module_opening_inflight goes by cascade). It REFUSES OUTRIGHT,
 * changing nothing, before `named` is recorded, while a row not provably dated on or before 2028 references a served
 * version, or while a unit was opened after 2028 (spec §4.4: continued use is a refusal, not a guess).
 *
 * `consent` (CONSENT_RECORDS, 31 Dec 2030): deletes research_consent and research_capture_losses. It refuses outright
 * before research-retention.js has recorded its retention deletion, and while a consent or loss record is dated after
 * 2030 ([USER], 2026-11-21). research_deletions is kept ([USER], 2026-11-21): it names no one, and its retention row
 * is what keeps research-retention.js from becoming due again. research_derived_datasets is kept too.
 *
 * A blocking refusal carries `blocking: true`; applyStep then writes nothing.
 *
 * The core neither compacts nor records a run (Task 7: VACUUM, verification, retention_runs). It reads retention_runs
 * only to know whether a step is already recorded.
 */
const { SCOPE } = require('./editorialRetentionScope');
const {
  NAMED_EDITING_RECORDS,
  UNNAMED_RECORDS,
  CONSENT_RECORDS,
  effectiveMs,
} = require('./retentionDates');
const { surveyStrip, stripTable, covered, later, unreadable, bind } = require('./retentionStrip');
const { LAYER_TABLES, surveyLayerPersons, stripLayerPersons } = require('./bookGlossaryLayer');

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

/** Step 1, read-only: the rows it changes, by table, and what it leaves and reports. */
function surveyNamed(db, when) {
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

/** Step 1's writes (survey first; the caller holds the transaction). */
function applyNamed(db, when) {
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
}

/** 2028, the date step 2's references and openings are judged by: editing ends with it. */
const EDITING_ENDS = Object.freeze({
  day: NAMED_EDITING_RECORDS,
  effMs: effectiveMs(NAMED_EDITING_RECORDS),
});
const SERVED_REFS = Object.freeze(['segment_edits', 'segment_acceptances']);

/** SQL true when some present time of `table`'s row is not readable and on or before the bound @day/@effMs. */
function notProvablyCovered(table) {
  const cols = SCOPE[table].times;
  return `(${cols.map((c) => `("${c}" IS NOT NULL AND NOT ${covered(c)})`).join(' OR ')})`;
}

function surveyUnnamed(db) {
  const counts = {};
  const refusals = [];
  if (!isRecorded(db, 'named')) {
    refusals.push({
      reason: 'named-not-recorded',
      table: 'retention_runs',
      rows: 0,
      blocking: true,
    });
  }
  for (const t of SERVED_REFS) {
    const n = count(
      db,
      `SELECT COUNT(*) FROM "${t}" WHERE served_version_id IS NOT NULL AND ${notProvablyCovered(t)}`,
      EDITING_ENDS
    );
    if (n) refusals.push({ reason: 'later-references', table: t, rows: n, blocking: true });
    const refs = count(db, `SELECT COUNT(*) FROM "${t}" WHERE served_version_id IS NOT NULL`, {});
    if (refs) counts[t] = refs;
  }
  const lateOpenings = count(
    db,
    `SELECT COUNT(*) FROM module_openings WHERE NOT ${covered('opened_at_ms')}`,
    EDITING_ENDS
  );
  if (lateOpenings) {
    refusals.push({
      reason: 'later-openings',
      table: 'module_openings',
      rows: lateOpenings,
      blocking: true,
    });
  }
  for (const t of ['served_text_versions', 'module_openings', 'module_opening_inflight']) {
    const n = count(db, `SELECT COUNT(*) FROM "${t}"`, {});
    if (n) counts[t] = n;
  }
  return { counts, refusals };
}

function applyUnnamed(db) {
  for (const t of SERVED_REFS) {
    db.prepare(
      `UPDATE "${t}" SET served_version_id = NULL WHERE served_version_id IS NOT NULL`
    ).run();
  }
  db.prepare('DELETE FROM served_text_versions').run();
  db.prepare('DELETE FROM module_openings').run(); // module_opening_inflight goes by ON DELETE CASCADE
}

function surveyConsent(db, when) {
  const counts = {};
  const refusals = [];
  if (!db.prepare("SELECT 1 FROM research_deletions WHERE kind = 'retention'").get()) {
    refusals.push({
      reason: 'research-retention-not-recorded',
      table: 'research_deletions',
      rows: 0,
      blocking: true,
    });
  }
  const laterConsent = count(
    db,
    `SELECT COUNT(*) FROM research_consent WHERE ${[
      'given_at_ms',
      'withdrawn_at_ms',
      'deletion_done_at_ms',
    ]
      .map((c) => `("${c}" IS NOT NULL AND NOT ${covered(c)})`)
      .join(' OR ')}`,
    when
  );
  if (laterConsent) {
    refusals.push({
      reason: 'later-records',
      table: 'research_consent',
      rows: laterConsent,
      blocking: true,
    });
  }
  const laterLosses = count(
    db,
    `SELECT COUNT(*) FROM research_capture_losses WHERE NOT ${covered('loss_day')}`,
    when
  );
  if (laterLosses) {
    refusals.push({
      reason: 'later-records',
      table: 'research_capture_losses',
      rows: laterLosses,
      blocking: true,
    });
  }
  for (const t of ['research_consent', 'research_capture_losses']) {
    const n = count(db, `SELECT COUNT(*) FROM "${t}"`, {});
    if (n) counts[t] = n;
  }
  return { counts, refusals };
}

function applyConsent(db) {
  db.prepare('DELETE FROM research_consent').run();
  db.prepare('DELETE FROM research_capture_losses').run();
}

const STEPS = Object.freeze({
  named: Object.freeze({ date: NAMED_EDITING_RECORDS, survey: surveyNamed, apply: applyNamed }),
  unnamed: Object.freeze({ date: UNNAMED_RECORDS, survey: surveyUnnamed, apply: applyUnnamed }),
  consent: Object.freeze({ date: CONSENT_RECORDS, survey: surveyConsent, apply: applyConsent }),
});

function whenOf(kind, nowMs) {
  const { date } = stepOf(kind);
  return { day: date, effMs: effectiveMs(date), due: nowMs >= effectiveMs(date) };
}

/**
 * What a step would do, read-only.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {'named' | 'unnamed' | 'consent'} kind
 * @param {number} nowMs
 * @returns {{ due: boolean, counts: Record<string, number>, refusals: {reason: string, table: string, rows: number}[] }}
 */
function planStep(db, kind, nowMs) {
  const { day, effMs, due } = whenOf(kind, nowMs);
  if (!due || isRecorded(db, kind)) return { due: false, counts: {}, refusals: [] };
  return { due: true, ...stepOf(kind).survey(db, { day, effMs }) };
}

/**
 * Apply a step, in one IMMEDIATE transaction. Before its date, or once recorded, it changes nothing. A second call
 * changes nothing. A throw rolls back every row and trigger.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {'named' | 'unnamed' | 'consent'} kind
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
      const step = stepOf(kind);
      const { counts, refusals } = step.survey(db, when);
      if (refusals.some((r) => r.blocking))
        return { due: true, changed: 0, refusals, blocked: true };
      step.apply(db, when);
      return { due: true, changed: Object.values(counts).reduce((a, b) => a + b, 0), refusals };
    })
    .immediate();
}

module.exports = { planStep, applyStep, STEPS };
