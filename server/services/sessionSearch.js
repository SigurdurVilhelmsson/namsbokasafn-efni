/**
 * Session Search and Listing Functions
 *
 * Handles finding, filtering, and listing workflow sessions
 */

const { rowToSession, statements } = require('./sessionCore');

/**
 * Find active workflow for a book/chapter combination
 * Returns the session if an active workflow exists, null otherwise
 */
function findActiveWorkflow(book, chapter) {
  const row = statements.getByBookChapter.get(book, chapter, 'active');
  if (!row) return null;

  const session = rowToSession(row);

  // Check if expired
  if (new Date(session.expiresAt) < new Date()) {
    // Mark as expired
    session.status = 'expired';
    session.updatedAt = new Date().toISOString();
    const { saveSession } = require('./sessionCore');
    saveSession(session);
    return null;
  }

  return session;
}

/**
 * List active sessions for a user
 */
function listUserSessions(userId) {
  const rows = statements.listByUser.all(userId, 'active');

  return rows.map((row) => {
    const session = rowToSession(row);
    return {
      id: session.id,
      book: session.book,
      chapter: session.chapter,
      modulesCount: session.modules?.length || 0,
      currentStep: session.steps[session.currentStep]?.name,
      progress: Math.round((session.currentStep / session.steps.length) * 100),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  });
}

/**
 * List all active sessions (admin)
 */
function listAllSessions() {
  const rows = statements.listAll.all('active');

  return rows.map((row) => {
    const session = rowToSession(row);
    return {
      id: session.id,
      book: session.book,
      chapter: session.chapter,
      username: session.username,
      currentStep: session.steps[session.currentStep]?.name,
      progress: Math.round((session.currentStep / session.steps.length) * 100),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  });
}

module.exports = {
  findActiveWorkflow,
  listUserSessions,
  listAllSessions,
};
