/**
 * Fixture helper (G1.13, spec §6.2): plant a chapter-assignment row directly. Fixtures plant
 * state; they never call the gate, so a test of something other than access does not depend on it.
 *
 * ⚠️ `INSERT OR IGNORE` does not suppress a foreign-key violation: the user must exist.
 */
function plantAssignment(conn, { userId, book, chapter, assignedBy = 'test' }) {
  conn
    .prepare(
      `INSERT OR IGNORE INTO user_chapter_assignments (user_id, book_slug, chapter, assigned_by)
       VALUES (?, ?, ?, ?)`
    )
    .run(userId, book, chapter, assignedBy);
}

module.exports = { plantAssignment };
