/**
 * Fixture helper (G1.13, spec §6.2): plant a chapter-assignment row directly. Fixtures plant
 * state; they never call the gate, so a test of something other than access does not depend on it.
 *
 * ⚠️ `INSERT OR IGNORE` does not suppress a foreign-key violation: the user must exist.
 */
const { isStudyBook } = require('../../lib/researchScope');

function plantAssignment(conn, { userId, book, chapter, assignedBy = 'test' }) {
  conn
    .prepare(
      `INSERT OR IGNORE INTO user_chapter_assignments (user_id, book_slug, chapter, assigned_by)
       VALUES (?, ?, ?, ?)`
    )
    .run(userId, book, chapter, assignedBy);
}

/**
 * Plant what the assign gate asks for (spec §6.5), so a test whose subject is assigning can reach
 * the write: a consent decision (`declined`, which counts as a decision), a licence-clause row and,
 * for a study book, the suggestion view switched on. None of the three tables has a foreign key, so
 * the user need not exist.
 */
function plantAssignable(conn, { userId, book }) {
  const now = Date.now();
  conn
    .prepare(
      `INSERT INTO research_consent (user_id, decision, interval_id, consent_text_version,
         consent_text_sha256, given_at_ms)
       VALUES (?, 'declined', NULL, 'test', ?, ?)`
    )
    .run(userId, '0'.repeat(64), now);
  conn
    .prepare(
      `INSERT INTO editor_licence_clauses (user_id, signed_on, recorded_by, recorded_at_ms)
       VALUES (?, '2026-01-15', 'test', ?)`
    )
    .run(userId, now);
  if (isStudyBook(book)) {
    conn
      .prepare(
        `INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms)
         VALUES (?, 'suggestion-view', 1, ?)`
      )
      .run(book, now);
  }
}

module.exports = { plantAssignment, plantAssignable };
