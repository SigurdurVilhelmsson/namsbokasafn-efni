/**
 * The SQL of one editorial retention strip (G1.15(b) spec §4.3; plan Task 5): which values are covered by a date,
 * which are later, which cannot be read, and the writes that replace a covered person value with its placeholder and
 * cut its row's times to the day.
 *
 * Shared by server/lib/editorialRetention.js (every strip table but the book glossary layer's) and
 * server/lib/bookGlossaryLayer.js (stripLayerPersons, the layer's own tables). It requires nothing, so neither of
 * those can form a cycle through it.
 *
 * A time is read only when it can be: for a `*_ms` column an integer no smaller than MIN_MS, and for any other column
 * text that starts with a YYYY-MM-DD day and carries no UTC offset after it (both `2028-12-31 23:59:59` and
 * `2028-12-31T23:59:59.999Z` are read; `2028-12-31T23:30:00-02:00`, really 2029-01-01T01:30Z, is not). A value that
 * cannot be read is never covered and never later: its row is left and reported (fail closed; final review M-2, M-3:
 * an offset or a seconds value used to read as covered, and steps 2 and 3 delete). Covered means on or before the day
 * (`*_ms`: before effMs, 00:00 UTC on the day after).
 *
 * Every statement binds only the named parameters it uses.
 */

const DAY_MS = 86400000;
const READABLE_DAY = "GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'";
/** 1e11 ms is 1973-03-03: Date.now() writes every `*_ms` time, so a smaller integer is seconds, negative, or no time. */
const MIN_MS = 100000000000;
const JSON_TIME_KEYS = Object.freeze(['timestamp', 'updatedAt', 'createdAt']);

const isMs = (c) => /_ms$/.test(c);
const q = (c) => `"${c}"`;

/** SQL true when column `c` holds a time this module can read (see the header). */
function readable(c) {
  return isMs(c)
    ? `(typeof(${q(c)}) = 'integer' AND ${q(c)} >= ${MIN_MS})`
    : `(typeof(${q(c)}) = 'text' AND ${q(c)} ${READABLE_DAY} AND instr(substr(${q(c)}, 11), '+') = 0 AND instr(substr(${q(c)}, 11), '-') = 0)`;
}

/** SQL true when column `c` holds a readable time on or before the day. */
function covered(c) {
  return isMs(c)
    ? `(${readable(c)} AND ${q(c)} < @effMs)`
    : `(${readable(c)} AND substr(${q(c)}, 1, 10) <= @day)`;
}

/** SQL true when column `c` holds a readable time after the day. */
function later(c) {
  return isMs(c)
    ? `(${readable(c)} AND ${q(c)} >= @effMs)`
    : `(${readable(c)} AND substr(${q(c)}, 1, 10) > @day)`;
}

/** SQL true when column `c` holds a value that is not a readable time. */
function unreadable(c) {
  return `(${q(c)} IS NOT NULL AND NOT ${readable(c)})`;
}

/** The placeholder expression for a person column: made from the row's own rowid, so no two rows share it. */
function placeholder(p) {
  return p.type === 'integer' ? '(-rowid)' : "('fjarlægt-' || rowid)";
}

/** The values of `params` that `sql` names, as better-sqlite3 named parameters. */
function bind(sql, params) {
  const out = {};
  for (const [, name] of sql.matchAll(/@(\w+)/g)) out[name] = params[name];
  return out;
}

/** A person value still to strip: present, not yet a placeholder, not a kept tool label, and covered. */
function pendingSql(p, keepSql) {
  return `(${q(p.col)} IS NOT NULL AND ${q(p.col)} IS NOT ${placeholder(p)}${keepSql(p)} AND ${covered(p.timeCol)})`;
}

function keepClause(keep) {
  if (!keep.length) return () => '';
  const list = keep.map((_, i) => `@keep${i}`).join(', ');
  return (p) => ` AND ${q(p.col)} NOT IN (${list})`;
}

function paramsOf({ day, effMs, keep = [] }) {
  const params = { day, effMs };
  keep.forEach((v, i) => {
    params[`keep${i}`] = v;
  });
  return params;
}

function count(db, sql, params) {
  return db.prepare(sql).pluck().get(bind(sql, params));
}

/** Rows of a stripped table whose JSON-time columns cannot be parsed as an array, among the rows the step touches. */
function unreadableJson(db, table, entry, opts) {
  if (!entry.jsonTimes?.length) return 0;
  const params = paramsOf(opts);
  const keepSql = keepClause(opts.keep ?? []);
  const touched = entry.person
    .map((p) => `(${pendingSql(p, keepSql)} OR ${q(p.col)} IS ${placeholder(p)})`)
    .join(' OR ');
  let n = 0;
  for (const c of entry.jsonTimes) {
    const sql = `SELECT ${q(c)} FROM "${table}" WHERE ${q(c)} IS NOT NULL AND (${touched})`;
    for (const text of db.prepare(sql).pluck().all(bind(sql, params))) {
      try {
        if (!Array.isArray(JSON.parse(text))) n++;
      } catch {
        n++;
      }
    }
  }
  return n;
}

/**
 * What stripping `table` would do, read-only: the rows it would change, and the rows it leaves and reports.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 * @param {{ person: {col: string, timeCol: string, type: string}[], times?: string[], jsonTimes?: string[] }} entry
 * @param {{ day: string, effMs: number, keep?: string[] }} opts keep: values never stripped (tool labels)
 * @returns {{ rows: number, later: number, unreadableTime: number, undated: number, unreadableJson: number }}
 */
function surveyStrip(db, table, entry, opts) {
  const params = paramsOf(opts);
  const keepSql = keepClause(opts.keep ?? []);
  const present = (p) =>
    `${q(p.col)} IS NOT NULL AND ${q(p.col)} IS NOT ${placeholder(p)}${keepSql(p)}`;
  const any = (f) => entry.person.map((p) => `(${present(p)} AND ${f(p)})`).join(' OR ');
  // A later record is any row with a time after the date, whether or not it names anyone, and whoever wrote it: a
  // kept tool label, a tool that stores no person, a report from the public feedback form (spec §4.4, "a record dated
  // after a date"; [USER] 2026-11-22, the final review's I-1). The keep-list spares a label from the strip only.
  const timeCols = [...new Set([...(entry.times ?? []), ...entry.person.map((p) => p.timeCol)])];
  return {
    rows: count(
      db,
      `SELECT COUNT(*) FROM "${table}" WHERE ${entry.person.map((p) => pendingSql(p, keepSql)).join(' OR ')}`,
      params
    ),
    later: count(
      db,
      `SELECT COUNT(*) FROM "${table}" WHERE ${timeCols.map((c) => later(c)).join(' OR ')}`,
      params
    ),
    unreadableTime: count(
      db,
      `SELECT COUNT(*) FROM "${table}" WHERE ${any((p) => unreadable(p.timeCol))}`,
      params
    ),
    undated: count(
      db,
      `SELECT COUNT(*) FROM "${table}" WHERE ${any((p) => `${q(p.timeCol)} IS NULL`)}`,
      params
    ),
    unreadableJson: unreadableJson(db, table, entry, opts),
  };
}

/** Cut the readable times on or before `day` inside a JSON array of objects. Throws on text that is not one. */
function cutJsonTimes(text, day) {
  const value = JSON.parse(text);
  if (!Array.isArray(value)) throw new TypeError('not a JSON array');
  let changed = false;
  const out = value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const next = { ...item };
    for (const k of JSON_TIME_KEYS) {
      const s = next[k];
      if (
        typeof s === 'string' &&
        s.length > 10 &&
        /^\d{4}-\d{2}-\d{2}/.test(s) &&
        s.slice(0, 10) <= day
      ) {
        next[k] = s.slice(0, 10);
        changed = true;
      }
    }
    return next;
  });
  return { changed, text: JSON.stringify(out) };
}

/**
 * Strip `table`: each covered person value becomes its placeholder, then in every row holding a placeholder each
 * covered time is cut to the day (a time after the day is never touched) and so are the covered times inside its
 * JSON-time columns (an unparseable one is left; surveyStrip reports it). Runs inside the caller's transaction.
 *
 * @returns {{ changed: number }} rows whose person values were stripped
 */
function stripTable(db, table, entry, opts) {
  const params = paramsOf(opts);
  const keepSql = keepClause(opts.keep ?? []);
  const rowsSql = `SELECT COUNT(*) FROM "${table}" WHERE ${entry.person.map((p) => pendingSql(p, keepSql)).join(' OR ')}`;
  const changed = count(db, rowsSql, params);
  for (const p of entry.person) {
    const sql = `UPDATE "${table}" SET ${q(p.col)} = ${placeholder(p)} WHERE ${pendingSql(p, keepSql)}`;
    db.prepare(sql).run(bind(sql, params));
  }
  const stripped = entry.person.map((p) => `${q(p.col)} IS ${placeholder(p)}`).join(' OR ');
  for (const c of entry.times) {
    const sql = isMs(c)
      ? `UPDATE "${table}" SET ${q(c)} = ${q(c)} - (${q(c)} % ${DAY_MS}) WHERE (${stripped}) AND ${covered(c)} AND ${q(c)} % ${DAY_MS} != 0`
      : `UPDATE "${table}" SET ${q(c)} = substr(${q(c)}, 1, 10) WHERE (${stripped}) AND ${covered(c)} AND length(${q(c)}) > 10`;
    db.prepare(sql).run(bind(sql, params));
  }
  for (const c of entry.jsonTimes ?? []) {
    const rows = db
      .prepare(
        `SELECT rowid AS id, ${q(c)} AS v FROM "${table}" WHERE ${q(c)} IS NOT NULL AND (${stripped})`
      )
      .all();
    const write = db.prepare(`UPDATE "${table}" SET ${q(c)} = ? WHERE rowid = ?`);
    for (const { id, v } of rows) {
      let cut;
      try {
        cut = cutJsonTimes(v, opts.day);
      } catch {
        continue; // left as it is; surveyStrip reports it as unreadable-json
      }
      if (cut.changed) write.run(cut.text, id);
    }
  }
  return { changed };
}

module.exports = {
  covered,
  later,
  unreadable,
  placeholder,
  bind,
  surveyStrip,
  stripTable,
  cutJsonTimes,
};
