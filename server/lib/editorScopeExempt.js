/**
 * The write routes that do not carry the closed-book guard, each with the reason why (G1.13,
 * spec §6.1).
 *
 * Every non-GET route on a router in routes/apiMounts.js (and views.js) either carries
 * `refuseClosedBookForNonAdmins` (server/lib/editorScope.js) or has its key here. The route census,
 * server/__tests__/editorScopeCensus.test.js, fails by name on a route that does neither, on a key
 * here that names no route, on a route that is both guarded and listed, and on an `ADMIN_ONLY`
 * entry whose route lets a non-admin through.
 *
 * Key: `'<METHOD> <prefix><path>'`, where a route path of `/` contributes nothing. Copy a key from
 * the census's own failure message rather than typing it.
 */

/** The reason for a route only admins reach; the census checks it against `requireRole('admin')`. */
const ADMIN_ONLY = 'admin-only';

const TERMINOLOGY = 'G1.17: the shared concept model, which takes no book (spec §4)';
const OWN_SESSION = "the caller's own session or profile; no book";
const OWN_NOTIFICATIONS = "the caller's own notifications; no book";
const OWN_CONSENT = "the caller's own consent decision; no book";
const PUBLIC_FEEDBACK = 'the public feedback form (spec §6.1)';
const FEEDBACK_TRIAGE = "reader feedback triage: writes no book's text or editorial record";

/** @type {Readonly<Record<string, string>>} */
const EDITOR_SCOPE_EXEMPT = Object.freeze({
  // Admin-only: catalogue, registration, users, enforcement, the suggestion view, migrations
  'POST /api/admin/catalogue/sync': ADMIN_ONLY,
  'POST /api/admin/catalogue/add': ADMIN_ONLY,
  'POST /api/admin/books/register': ADMIN_ONLY,
  'POST /api/admin/books/:slug/fetch-source': ADMIN_ONLY,
  'POST /api/admin/books/:slug/generate-data': ADMIN_ONLY,
  'POST /api/admin/users': ADMIN_ONLY,
  'PUT /api/admin/users/:id': ADMIN_ONLY,
  'DELETE /api/admin/users/:id': ADMIN_ONLY,
  'POST /api/admin/users/:id/books': ADMIN_ONLY,
  'DELETE /api/admin/users/:id/books/:bookSlug': ADMIN_ONLY,
  'POST /api/admin/users/:id/chapters': ADMIN_ONLY,
  'DELETE /api/admin/users/:id/chapters/:book/:chapter': ADMIN_ONLY,
  'POST /api/admin/users/:id/licence-clause': ADMIN_ONLY,
  'DELETE /api/admin/users/:id/licence-clause/:rowId': ADMIN_ONLY,
  'POST /api/admin/assignments/:book/enforcement': ADMIN_ONLY,
  'POST /api/admin/books/:book/suggestion-view': ADMIN_ONLY,
  'POST /api/admin/migrate': ADMIN_ONLY,

  // Admin-only: status sync, localization settings, manual stage moves
  'POST /api/status/:book/sync': ADMIN_ONLY,
  'POST /api/status/:book/:chapter/sync': ADMIN_ONLY,
  'POST /api/localization-editor/settings/:book': ADMIN_ONLY,
  'POST /api/pipeline-status/:bookSlug/:chapterNum/advance': ADMIN_ONLY,
  'POST /api/pipeline-status/:bookSlug/:chapterNum/revert': ADMIN_ONLY,

  // The shared concept model
  'POST /api/terminology/mine': TERMINOLOGY,
  'POST /api/terminology/mined-candidates/:id/dismiss': TERMINOLOGY,
  'POST /api/terminology/mined-candidates/:id/promote': TERMINOLOGY,
  'POST /api/terminology': TERMINOLOGY,
  'PUT /api/terminology/:id': TERMINOLOGY,
  'DELETE /api/terminology/:id': TERMINOLOGY,
  'POST /api/terminology/:headwordId/translations': TERMINOLOGY,
  'PUT /api/terminology/translations/:id': TERMINOLOGY,
  'DELETE /api/terminology/translations/:id': TERMINOLOGY,
  'POST /api/terminology/translations/batch-approve': TERMINOLOGY,
  'POST /api/terminology/translations/:id/reject': TERMINOLOGY,
  'POST /api/terminology/translations/:id/approve': TERMINOLOGY,
  'POST /api/terminology/translations/:id/dispute': TERMINOLOGY,
  'POST /api/terminology/:id/discuss': TERMINOLOGY,
  'POST /api/terminology/import/csv': TERMINOLOGY,
  'POST /api/terminology/import/glossary': TERMINOLOGY,
  'POST /api/terminology/import/excel': TERMINOLOGY,
  'POST /api/terminology/import/key-terms': TERMINOLOGY,
  'POST /api/terminology/import/existing-glossary': TERMINOLOGY,

  // The caller's own records
  'POST /api/auth/logout': OWN_SESSION,
  'PUT /api/profile': OWN_SESSION,
  'POST /api/notifications/:id/read': OWN_NOTIFICATIONS,
  'POST /api/notifications/read-all': OWN_NOTIFICATIONS,
  'PUT /api/notifications/preferences': OWN_NOTIFICATIONS,
  'POST /api/research/consent': OWN_CONSENT,
  'POST /api/research/consent/withdraw': OWN_CONSENT,

  // Reader feedback
  'POST /api/feedback': PUBLIC_FEEDBACK,
  'POST /api/feedback/:id/status': FEEDBACK_TRIAGE,
  'POST /api/feedback/:id/resolve': FEEDBACK_TRIAGE,
  'POST /api/feedback/:id/priority': FEEDBACK_TRIAGE,
  'POST /api/feedback/:id/assign': FEEDBACK_TRIAGE,
  'POST /api/feedback/:id/respond': FEEDBACK_TRIAGE,
});

module.exports = { ADMIN_ONLY, EDITOR_SCOPE_EXEMPT };
