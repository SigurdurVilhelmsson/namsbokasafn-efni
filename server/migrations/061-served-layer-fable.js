/**
 * Migration 061: served_text_versions.layer admits 'fable'.
 *
 * The editor serves chemistry from the Fable layer (books/<slug>/02-mt-fable/) and records each
 * served text as a served_text_versions row with layer 'fable'. 053's CHECK admits only
 * 'mt-output', 'faithful' and 'selected', and SQLite cannot widen a CHECK in place, so the table is
 * rebuilt with SQLite's documented procedure for other kinds of schema change: create
 * served_text_versions_new, copy every row by explicit column list (039's lesson: never SELECT *),
 * drop the old table, rename the new one into place, and recreate its indexes from their own SQL.
 * Rows, ids and the AUTOINCREMENT sequence are kept exactly.
 *
 * ⚠️ FOREIGN KEYS GO OFF OUTSIDE THE TRANSACTION, AND THIS IS MEASURED, NOT ASSUMED.
 * segment_edits.served_version_id and segment_acceptances.served_version_id reference this table,
 * and foreign keys are ON on every connection here (CLAUDE.md § Tech Stack). Measured on a database
 * built by migrations 001–060 with child rows present:
 *   - with foreign keys on, DROP TABLE served_text_versions fails (FOREIGN KEY constraint failed);
 *   - PRAGMA defer_foreign_keys = ON does not rescue it: the DROP's implicit delete counts a
 *     violation per child row, nothing cancels it because the copy went into the _new table, and
 *     COMMIT fails;
 *   - PRAGMA foreign_keys = OFF inside a transaction is a no-op (it still reads 1).
 * So the pragma is turned off before the transaction (migrationRunner calls up() outside any
 * transaction; a caller inside one is refused below), checked to read 0, and restored to its prior
 * value in a finally that runs on every path. Before COMMIT, foreign_key_check on the two child
 * tables must show nothing new, so the rebuild cannot commit a dangling reference.
 *
 * ⚠️ RENAME THE NEW TABLE INTO PLACE, NEVER THE OLD ONE OUT OF IT. With legacy_alter_table off,
 * renaming served_text_versions to an _old name rewrites the children's REFERENCES to that name,
 * and the drop then leaves them pointing at nothing. Renaming _new into place leaves their schema
 * text untouched.
 *
 * ⚠️ THE SEQUENCE IS CARRIED ACROSS BY HAND. Editorial retention deletes served versions
 * (lib/editorialRetention.js), so the sequence can sit above the largest id, or above 0 on an empty
 * table. A plain copy would reset it to the largest copied id and the next insert would reuse a
 * deleted id.
 *
 * ⚠️ IT REFUSES ANY SHAPE IT DOES NOT KNOW. The table must have exactly 053's eleven columns, or the
 * copy would drop a column some later change added. A served_text_versions_new left behind is never
 * dropped: it is reported and the rebuild waits for a human.
 *
 * ⚠️ IDEMPOTENT: when the layer CHECK already admits 'fable', up() only reads sqlite_master and
 * touches no pragma. A fresh database reaches it the same way, since 053 creates the table first.
 *
 * ⚠️ NEVER THROWS (CLAUDE.md § Tech Stack; 048 and 053 are the shape). migrationRunner calls every
 * up() on every server start, and a throw stops the server starting at all. The rebuild is one
 * transaction, so a failure anywhere rolls it all back and warns; the next start tries again. Until
 * it completes, serving a chemistry unit fails on the CHECK, loudly.
 */

const TABLE = 'served_text_versions';
const NEW_TABLE = `${TABLE}_new`;
const COLUMNS = [
  'id',
  'book',
  'chapter',
  'module_id',
  'segment_id',
  'occurrence',
  'en_sha256',
  'is_sha256',
  'layer',
  'en_text',
  'is_text',
];
const CHILDREN = ['segment_edits', 'segment_acceptances'];

const CREATE_NEW = `
  CREATE TABLE ${NEW_TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    module_id TEXT NOT NULL,
    segment_id TEXT NOT NULL,
    occurrence INTEGER NOT NULL CHECK (occurrence >= 0),
    en_sha256 TEXT NOT NULL CHECK (length(en_sha256) = 64 AND en_sha256 NOT GLOB '*[^0-9a-f]*'),
    is_sha256 TEXT NOT NULL CHECK (length(is_sha256) = 64 AND is_sha256 NOT GLOB '*[^0-9a-f]*'),
    layer TEXT NOT NULL CHECK (layer IN ('mt-output', 'faithful', 'selected', 'fable')),
    en_text TEXT NOT NULL,
    is_text TEXT NOT NULL
  )`;

class Refusal extends Error {}

/** The layer CHECK's value list, or null when the table's SQL has no such CHECK. */
function layerValues(sql) {
  const m = /layer\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*layer\s+IN\s*\(([^)]*)\)\s*\)/i.exec(sql);
  return m ? m[1].split(',').map((v) => v.trim().replace(/^'|'$/g, '')) : null;
}

/** foreign_key_check rows for the child tables, as comparable strings. */
function childViolations(db) {
  return CHILDREN.flatMap((t) =>
    db.pragma(`foreign_key_check(${t})`).map((r) => `${r.table}:${r.rowid}:${r.parent}:${r.fkid}`)
  ).sort();
}

/** What the rebuild needs, or a Refusal; reads only. Returns null when there is nothing to do. */
function plan(db) {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(TABLE);
  if (!row) throw new Refusal(`${TABLE} does not exist (053 creates it; is 053 failing?)`);
  const values = layerValues(row.sql);
  if (!values) throw new Refusal(`${TABLE} has no layer CHECK of 053's shape`);
  if (values.includes('fable')) return null;
  const cols = db.pragma(`table_info(${TABLE})`).map((c) => c.name);
  if (cols.join(',') !== COLUMNS.join(',')) {
    throw new Refusal(
      `${TABLE} has columns (${cols.join(', ')}), not 053's (${COLUMNS.join(', ')})`
    );
  }
  if (db.prepare(`SELECT 1 FROM sqlite_master WHERE name = ?`).get(NEW_TABLE)) {
    throw new Refusal(`${NEW_TABLE} already exists; it is never dropped here, a human must look`);
  }
  if (db.inTransaction) throw new Refusal('up() was called inside an open transaction');
  return {
    indexes: db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`
      )
      .all(TABLE)
      .map((r) => r.sql),
  };
}

function rebuild(db, { indexes }) {
  db.transaction(() => {
    const violationsBefore = childViolations(db);
    const seq = db.prepare(`SELECT seq FROM sqlite_sequence WHERE name = ?`).get(TABLE)?.seq;
    const list = COLUMNS.join(', ');
    db.exec(CREATE_NEW);
    db.exec(`INSERT INTO ${NEW_TABLE} (${list}) SELECT ${list} FROM ${TABLE} ORDER BY id`);
    db.exec(`DROP TABLE ${TABLE}`);
    db.exec(`ALTER TABLE ${NEW_TABLE} RENAME TO ${TABLE}`);
    for (const sql of indexes) db.exec(sql);
    if (seq !== undefined) {
      const kept = db.prepare(`UPDATE sqlite_sequence SET seq = ? WHERE name = ?`).run(seq, TABLE);
      if (kept.changes === 0) {
        db.prepare(`INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)`).run(TABLE, seq);
      }
    }
    const violationsAfter = childViolations(db);
    if (violationsAfter.join('|') !== violationsBefore.join('|')) {
      throw new Error(`the rebuild would change foreign_key_check: ${violationsAfter.join(', ')}`);
    }
  })();
}

/** The whole migration, kept apart so that up() is nothing but the never-throw boundary. */
function migrate(db) {
  const work = plan(db);
  if (!work) return;
  const prior = db.pragma('foreign_keys', { simple: true });
  try {
    db.pragma('foreign_keys = OFF');
    if (db.pragma('foreign_keys', { simple: true }) !== 0) {
      throw new Refusal('PRAGMA foreign_keys would not turn off');
    }
    rebuild(db, work);
  } finally {
    db.pragma(`foreign_keys = ${prior ? 'ON' : 'OFF'}`);
    const now = db.pragma('foreign_keys', { simple: true });
    if (now !== prior) {
      console.warn(`[061] PRAGMA foreign_keys reads ${now} after the rebuild, not ${prior}.`);
    }
  }
}

module.exports = {
  name: '061-served-layer-fable',

  up(db) {
    try {
      migrate(db);
    } catch (err) {
      const what = err instanceof Refusal ? 'REFUSED' : `${err.code || err.name}: ${err.message}`;
      console.warn(
        `[061] MIGRATION COULD NOT COMPLETE — ${what}${err instanceof Refusal ? `: ${err.message}` : ''}. ` +
          `NOTHING WAS APPLIED: the rebuild is one transaction, rolled back on failure, and ${TABLE} ` +
          "still refuses layer 'fable', so serving a Fable-layer unit fails until it completes. It re-attempts " +
          'on every server start. NOT THROWN ON PURPOSE: throwing here would stop this server starting at all.'
      );
    }
  },
};
