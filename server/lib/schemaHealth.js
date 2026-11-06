/**
 * schemaHealth — checks.schema in /api/health (G1.1; spec §5.20, §5.8; plan decision 3).
 *
 * A never-throw migration (CLAUDE.md § Tech Stack; 048 and 053 are the shape) that fails warns once
 * and the server starts anyway, while checks.migrations only counts files on disk.
 * A swallowed ALTER would then show only as saves and accepts failing on a missing column (spec
 * §5.8). checkSchema names every table, column and index in EXPECTED_SCHEMA that the database
 * lacks.
 *
 * ⚠️ GROWN PER PR, IN THE SAME COMMIT AS EACH PR'S MIGRATION (index decision 3). A later PR appends
 * its new tables to `tables`; server/index.js's checks.schema block needs no change. The unique
 * index is listed as well, which goes beyond §5.20's tables and columns (approved, spec AMENDED
 * 2026-11-04): without it a re-serve could insert duplicate served versions silently.
 *
 * ⚠️ NAMES ONLY, NEVER COUNTS. /api/health is unauthenticated (spec §5.20 "nothing sensitive"), so
 * the result carries schema names and an error code, and nothing read from a row.
 *
 * How `missing` is built, in this order:
 *   - tables:  an absent table reports `<table>` alone; a present one reports each absent column as
 *              `<table>.<column>`;
 *   - columns: each absent column as `<table>.<column>`, whether or not its table exists;
 *   - indexes: an absent index as `index <name>`;
 * each in the constant's order. Table names are interpolated into a PRAGMA, so they come from the
 * constant (or a test's own argument), never from a request.
 *
 * A name counts as a table only if sqlite_master holds a TABLE of that name. A VIEW of the name
 * answers table_info with its columns and satisfies a migration's CREATE TABLE IF NOT EXISTS, with
 * no table behind it, so it reads as absent here (PR2 review U42).
 */

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/** What the G1.1 migrations (053 onward) must have built. Deeply frozen. */
const EXPECTED_SCHEMA = deepFreeze({
  // A table the migrations create → every column it has.
  tables: {
    served_text_versions: [
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
    ],
    // PR2 (spec §5.5)
    module_openings: ['book', 'chapter', 'module_id', 'opened_at_ms', 'inflight_count'],
    // PR2 (spec §5.5)
    module_opening_inflight: ['book', 'chapter', 'module_id', 'segment_id', 'occurrence'],
  },
  // An existing table → the columns the migrations add to it.
  columns: {
    segment_edits: [
      'served_version_id',
      'occurrence',
      'origin',
      'displayed_edit_id',
      'displayed_edit_sha256',
    ],
    segment_acceptances: ['served_version_id', 'occurrence'],
  },
  indexes: ['idx_served_text_versions_key'],
});

/**
 * @param {import('better-sqlite3').Database} db
 * @param {typeof EXPECTED_SCHEMA} [expected]
 * @returns {{ ok: boolean, missing: string[] | null, error?: string }} never throws
 */
function checkSchema(db, expected = EXPECTED_SCHEMA) {
  try {
    // SQLite resolves names case-insensitively, so they are compared lowercased.
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .pluck()
        .all()
        .map((name) => name.toLowerCase())
    );
    // An absent table, or a name that something other than a table holds, reads as no columns.
    const columnsOf = (table) =>
      tables.has(table.toLowerCase())
        ? new Set(db.pragma(`table_info(${table})`).map((c) => c.name))
        : new Set();
    const missing = [];

    for (const [table, columns] of Object.entries(expected.tables)) {
      const present = columnsOf(table);
      if (present.size === 0) {
        missing.push(table);
        continue;
      }
      for (const column of columns) {
        if (!present.has(column)) missing.push(`${table}.${column}`);
      }
    }

    for (const [table, columns] of Object.entries(expected.columns)) {
      const present = columnsOf(table);
      for (const column of columns) {
        if (!present.has(column)) missing.push(`${table}.${column}`);
      }
    }

    const indexes = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all()
        .map((r) => r.name)
    );
    for (const name of expected.indexes) {
      if (!indexes.has(name)) missing.push(`index ${name}`);
    }

    return { ok: missing.length === 0, missing };
  } catch (err) {
    return { ok: false, missing: null, error: err.code || err.name };
  }
}

module.exports = { EXPECTED_SCHEMA, checkSchema };
