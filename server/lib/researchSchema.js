// server/lib/researchSchema.js
//
// The schema of research.db (G1.2, spec §5.1, §5.9, §5.10, §5.16).
//
// WHY NOT server/migrations/: migrationRunner runs every migration against sessions.db on every
// server start. The research file is a separate database with its own lifecycle (its own backup,
// its own retention), so its tables must never appear in sessions.db. Its lazy handle calls
// ensureResearchSchema when first opened.
//
// WHY user_version: each step runs only if its version exceeds PRAGMA user_version, and sets
// user_version inside the same transaction as the step, so a step that fails rolls back whole and
// the file stays at its prior version. Everything sits inside one never-throw boundary (cf.
// migration 048): the caller reads { ok } and never needs a try/catch, and a bad file degrades
// research capture instead of wedging the boot.
//
// WHY a newer file is refused: a file written by newer code may hold tables or columns this code
// does not know. Running older steps over it, or writing to it, risks corrupting research data.
//
// Foreign keys are live in this build (SQLITE_DEFAULT_FOREIGN_KEYS=1, CLAUDE.md § Tech Stack), so
// the REFERENCES below are enforced. They are inside this file only: served_version_id and
// editing_id are sessions.db ids, plain integers with no cross-file key.

const RESEARCH_SCHEMA_VERSION = 2;
const HEX64 = (c) => `${c} IS NULL OR (length(${c}) = 64 AND ${c} NOT GLOB '*[^0-9a-f]*')`;

const STEPS = Object.freeze([
  {
    version: 1,
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS editor_keys (
          interval_id INTEGER NOT NULL UNIQUE,
          editor_key TEXT NOT NULL UNIQUE
            CHECK (length(editor_key) = 32 AND editor_key NOT GLOB '*[^0-9a-f]*'),
          stratum TEXT
        );
        CREATE TABLE IF NOT EXISTS research_events (
          id INTEGER PRIMARY KEY CHECK (id > 0),          -- random 63-bit, never AUTOINCREMENT (spec §5.9)
          key_seq INTEGER NOT NULL CHECK (key_seq >= 1),
          event_type TEXT NOT NULL,
          editor_key TEXT NOT NULL REFERENCES editor_keys (editor_key),
          client_action_id TEXT,
          client_action_time_ms INTEGER,
          server_time_ms INTEGER NOT NULL,
          replayed INTEGER NOT NULL CHECK (replayed IN (0, 1)),
          session_id TEXT,
          book TEXT NOT NULL,
          chapter INTEGER NOT NULL,
          module_id TEXT NOT NULL,
          segment_id TEXT,
          occurrence INTEGER,
          served_version_id INTEGER,                      -- a sessions.db id, plain integer: no cross-file key
          base_is_sha256 TEXT CHECK (${HEX64('base_is_sha256')}),
          editing_kind TEXT,
          editing_id INTEGER,
          editing_content_sha256 TEXT CHECK (${HEX64('editing_content_sha256')}),
          origin TEXT,
          content_json TEXT,
          before_json TEXT,
          detail_json TEXT,
          flag_snapshot_json TEXT NOT NULL,
          server_commit TEXT,
          commit_source TEXT NOT NULL CHECK (commit_source IN ('deploy-file', 'git-head', 'unknown')),
          code_dirty INTEGER CHECK (code_dirty IS NULL OR code_dirty IN (0, 1))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_research_events_action
          ON research_events (editor_key, client_action_id) WHERE client_action_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_research_events_key_seq ON research_events (editor_key, key_seq);
        CREATE TABLE IF NOT EXISTS research_event_items (
          event_id INTEGER NOT NULL REFERENCES research_events (id) ON DELETE CASCADE,
          ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
          item_type TEXT NOT NULL,
          outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'rejected', 'left-open')),
          source TEXT,
          op_id TEXT, occurrence INTEGER, category TEXT, run_id TEXT, group_action_id TEXT,
          ruling_id TEXT, rule_id TEXT,
          client_time_ms INTEGER,
          claim TEXT NOT NULL CHECK (claim IN ('validated', 'unverified', 'mismatch')),
          detail_json TEXT,
          PRIMARY KEY (event_id, ordinal)
        );
      `);
    },
  },
  {
    // Spec ✏️ AMENDED 2026-11-07: researchLog looks up the `propagation` events that wrote the rows of
    // a before-image by editing_id (decision 65), inside a synchronous request, so the lookup must be
    // an index probe, not a scan of the event log. Partial: only propagation events are ever looked up
    // by editing_id, and SQLite uses the index only for a query whose WHERE implies
    // `event_type = 'propagation'` (researchLog writes it as a literal).
    version: 2,
    apply(db) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_research_events_propagation_editing
          ON research_events (editing_id) WHERE event_type = 'propagation';
      `);
    },
  },
]);

/**
 * Bring a research.db handle up to RESEARCH_SCHEMA_VERSION. Never throws.
 * @param {import('better-sqlite3').Database} db an open handle (this module never opens one)
 * @returns {{ok: true, version: number} | {ok: false, code: string, error: string}}
 */
function ensureResearchSchema(db) {
  try {
    // Number(): on researchDb's handle (defaultSafeIntegers) a pragma reads as a BigInt (measured: 0n).
    const current = Number(db.pragma('user_version', { simple: true }));
    if (current > RESEARCH_SCHEMA_VERSION) {
      return {
        ok: false,
        code: 'SCHEMA_NEWER',
        error: `user_version ${current} is newer than ${RESEARCH_SCHEMA_VERSION}`,
      };
    }
    for (const step of STEPS) {
      if (step.version <= current) continue;
      db.transaction(() => {
        step.apply(db);
        db.pragma(`user_version = ${step.version}`);
      })();
    }
    return { ok: true, version: Number(db.pragma('user_version', { simple: true })) };
  } catch (err) {
    return { ok: false, code: err.code || err.name, error: err.message };
  }
}

module.exports = { RESEARCH_SCHEMA_VERSION, ensureResearchSchema };
