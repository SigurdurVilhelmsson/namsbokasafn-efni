/**
 * A structural fingerprint of a sessions.db, for comparing a crashed-and-restarted build with a
 * clean one.
 *
 * NOT sqlite_master.sql text: a column added by ALTER TABLE and the same column created in place
 * give different CREATE text for the same schema. Tables are compared by their pragmas (columns,
 * indexes, foreign keys); triggers and views by whitespace-normalised SQL (they are created whole,
 * never altered). Seeded rows are compared as sorted JSON, with volatile values (timestamps)
 * blanked, so a seed that a crash skipped shows up as a data difference.
 */
'use strict';

const Database = require('better-sqlite3');

const VOLATILE_DEFAULT = /CURRENT_|datetime|strftime|julianday|unixepoch|random/i;
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

/**
 * A row as content, not as numbers. SURROGATE IDS ARE NOT PART OF THE PROMISE: after a crash the
 * same rows can be inserted on a different start, so an AUTOINCREMENT id differs while every row
 * means the same thing (measured: the same six books as ids 1–6 in a clean build and up to 10 after
 * a crash). So an INTEGER PRIMARY KEY column is dropped, a foreign key that points at one is
 * replaced by the referenced row's own canonical content, and volatile values (timestamps) are
 * blanked.
 */
function canonicalRow(db, table, row, seen) {
  const meta = tableMeta(db, table);
  const out = {};
  for (const c of meta.cols) {
    if (c.name === meta.rowidAlias) continue;
    let v = row[c.name];
    const fk = meta.fks.get(c.name);
    if (
      v !== null &&
      fk &&
      tableMeta(db, fk.table).rowidAlias === (fk.to || tableMeta(db, fk.table).rowidAlias)
    ) {
      const key = `${fk.table}:${v}`;
      if (seen.has(key)) {
        v = '<cycle>';
      } else {
        const ref = db.prepare(`SELECT * FROM ${JSON.stringify(fk.table)} WHERE rowid = ?`).get(v);
        v = ref ? canonicalRow(db, fk.table, ref, new Set([...seen, key])) : `<dangling ${v}>`;
      }
    } else if (meta.volatile.has(c.name) && v !== null) {
      v = '<volatile>';
    }
    out[c.name] = v;
  }
  return out;
}

const metaCache = new WeakMap();
function tableMeta(db, table) {
  if (!metaCache.has(db)) metaCache.set(db, new Map());
  const cache = metaCache.get(db);
  if (cache.has(table)) return cache.get(table);
  const cols = db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all();
  const pks = cols.filter((c) => c.pk > 0);
  const rowidAlias =
    pks.length === 1 && String(pks[0].type).toUpperCase() === 'INTEGER' ? pks[0].name : null;
  const fks = new Map(
    db
      .prepare(`PRAGMA foreign_key_list(${JSON.stringify(table)})`)
      .all()
      .map((f) => [f.from, f])
  );
  const volatile = new Set(
    cols
      .filter((c) => VOLATILE_DEFAULT.test(c.dflt_value || '') || /_at$/.test(c.name))
      .map((c) => c.name)
  );
  const meta = { cols, rowidAlias, fks, volatile };
  cache.set(table, meta);
  return meta;
}

/** @returns {{schema: object, data: object}} */
function snapshot(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const objects = db
      .prepare(
        `SELECT type, name, tbl_name, sql FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`
      )
      .all();
    const schema = {};
    const data = {};
    for (const o of objects) {
      if (o.type === 'table') {
        const cols = db.prepare(`PRAGMA table_xinfo(${JSON.stringify(o.name)})`).all();
        const indexes = db
          .prepare(`PRAGMA index_list(${JSON.stringify(o.name)})`)
          .all()
          .map((ix) => ({
            name: ix.origin === 'c' ? ix.name : `(${ix.origin})`,
            unique: ix.unique,
            partial: ix.partial,
            cols: db
              .prepare(`PRAGMA index_xinfo(${JSON.stringify(ix.name)})`)
              .all()
              .filter((c) => c.key)
              .map((c) => `${c.name}${c.desc ? ' DESC' : ''}`),
          }))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const fks = db
          .prepare(`PRAGMA foreign_key_list(${JSON.stringify(o.name)})`)
          .all()
          .map(({ table, from, to, on_update, on_delete }) => ({
            table,
            from,
            to,
            on_update,
            on_delete,
          }))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        schema[`table ${o.name}`] = {
          // Column ORDER is part of the schema (SELECT *, INSERT without a column list).
          columns: cols.map((c) => [c.name, c.type, c.notnull, c.dflt_value, c.pk, c.hidden]),
          indexes,
          fks,
        };
        const rows = db
          .prepare(`SELECT * FROM ${JSON.stringify(o.name)}`)
          .all()
          .map((r) => JSON.stringify(canonicalRow(db, o.name, r, new Set())))
          .sort();
        if (rows.length) data[o.name] = rows;
      } else if (o.type === 'index') {
        // Covered per table above (index_list), including the WHERE of a partial index via sql:
        schema[`index ${o.name}`] = norm(o.sql);
      } else {
        schema[`${o.type} ${o.name}`] = norm(o.sql);
      }
    }
    return { schema, data };
  } finally {
    db.close();
  }
}

/** Names of the schema and data entries that differ between two snapshots. */
function diff(a, b) {
  const out = [];
  for (const part of ['schema', 'data']) {
    const keys = new Set([...Object.keys(a[part]), ...Object.keys(b[part])]);
    for (const k of [...keys].sort()) {
      if (JSON.stringify(a[part][k]) !== JSON.stringify(b[part][k])) out.push(`${part}: ${k}`);
    }
  }
  return out;
}

module.exports = { snapshot, diff };
