/**
 * Every person column in sessions.db, classified once (G1.15(b) spec §4.2 and §4.3; plan Task 4).
 *
 * SCOPE, keyed by table: what the editorial retention script does on each date, and to which columns.
 *   action  'strip'   (2028-12-31) each person column gets a placeholder made from the row's rowid, and the row's
 *                     times are cut to the day (spec §4.3); 'delete' (2028-12-31) the date-covered rows are deleted;
 *                     'keep' never touched (users: [USER]'s scope answer; editor_licence_clauses: the licence
 *                     evidence, G1.13 spec §2 and §6.4); 'consent' (2030-12-31) step 3 deletes it.
 *   person  [{ col, timeCol, type }]: timeCol is the actor's own time column, or the row's creation time when the
 *           actor has none (spec §4.3); null only for a kept table. type is the placeholder's shape: 'text'
 *           (`fjarlægt-<rowid>`) or 'integer' (`-<rowid>`), from the column's declared type.
 *   times   the time columns cut to the day in a stripped row (a `*_ms` column to that day's 00:00 UTC).
 *   jsonTimes  JSON text columns whose inner times are cut too.
 *   via     'layer': stripped through server/lib/bookGlossaryLayer.js, never by SQL (CLAUDE.md; plan Task 5 ruling).
 *
 * NOT_PERSON: columns whose names look like a person's but hold none, with the reason. A column in neither list fails
 * editorialRetentionScope.test.js by name, so a table added later cannot escape the rule silently.
 *
 * Builder's calls (spec §9): book_sections' assignees (linguistic_reviewer, localizer) are dated by their assignment
 * time, the approvers by their approval time; localization_logs' localizer by updated_at, the time of the log's last
 * entry; feedback.assigned_to, with no time of its own, by created_at. Three columns the spec's table did not name
 * name a person and are stripped: book_sections.localizer and .localizer_name, and feedback.assigned_to.
 */

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

const text = (col, timeCol) => ({ col, timeCol, type: 'text' });
const integer = (col, timeCol) => ({ col, timeCol, type: 'integer' });

const SCOPE = deepFreeze({
  // ── strip (spec §4.2) ──
  segment_edits: {
    action: 'strip',
    person: [
      text('editor_id', 'created_at'),
      text('editor_username', 'created_at'),
      text('reviewer_id', 'reviewed_at'),
      text('reviewer_username', 'reviewed_at'),
    ],
    times: ['created_at', 'reviewed_at', 'applied_at'],
  },
  segment_acceptances: {
    action: 'strip',
    person: [text('accepted_by', 'accepted_at'), text('accepted_by_username', 'accepted_at')],
    times: ['accepted_at', 'superseded_at', 'applied_at'],
  },
  segment_discussions: {
    action: 'strip',
    person: [text('user_id', 'created_at'), text('username', 'created_at')],
    times: ['created_at'],
  },
  module_reviews: {
    action: 'strip',
    person: [
      text('submitted_by', 'submitted_at'),
      text('submitted_by_username', 'submitted_at'),
      text('reviewed_by', 'reviewed_at'),
      text('reviewed_by_username', 'reviewed_at'),
    ],
    times: ['submitted_at', 'reviewed_at'],
  },
  localization_edits: {
    action: 'strip',
    person: [text('editor_id', 'created_at'), text('editor_username', 'created_at')],
    times: ['created_at'],
  },
  localization_pending_edits: {
    action: 'strip',
    person: [
      text('editor_id', 'created_at'),
      text('editor_username', 'created_at'),
      text('reviewer_id', 'reviewed_at'),
      text('reviewer_username', 'reviewed_at'),
    ],
    times: ['created_at', 'reviewed_at', 'applied_at'],
  },
  localization_suggestions: {
    action: 'strip',
    person: [text('reviewed_by', 'reviewed_at'), text('reviewed_by_name', 'reviewed_at')],
    times: ['reviewed_at', 'created_at'],
  },
  suggestion_rejections: {
    action: 'strip',
    person: [integer('rejected_by', 'rejected_at_ms')],
    times: ['rejected_at_ms'],
  },
  suggestion_left_open: {
    action: 'strip',
    person: [integer('closed_by', 'closed_at_ms')],
    times: ['closed_at_ms'],
  },
  content_versions: {
    action: 'strip',
    person: [text('applied_by', 'applied_at')],
    times: ['applied_at'],
  },
  figure_block_edit: {
    action: 'strip',
    person: [text('edited_by', 'edited_at')],
    times: ['edited_at'],
  },
  figure_review: {
    action: 'strip',
    person: [text('reviewed_by', 'reviewed_at')],
    times: ['reviewed_at'],
  },
  book_sections: {
    action: 'strip',
    person: [
      text('linguistic_reviewer', 'linguistic_assigned_at'),
      text('linguistic_reviewer_name', 'linguistic_assigned_at'),
      text('linguistic_approved_by', 'linguistic_approved_at'),
      text('linguistic_approved_by_name', 'linguistic_approved_at'),
      text('localizer', 'localization_assigned_at'),
      text('localizer_name', 'localization_assigned_at'),
      text('localization_approved_by', 'localization_approved_at'),
      text('localization_approved_by_name', 'localization_approved_at'),
    ],
    times: [
      'linguistic_assigned_at',
      'linguistic_submitted_at',
      'linguistic_approved_at',
      'localization_assigned_at',
      'localization_submitted_at',
      'localization_approved_at',
      'faithful_published_at',
      'localized_published_at',
      'tm_created_at',
      'created_at',
      'updated_at',
    ],
  },
  chapter_pipeline_status: {
    action: 'strip',
    person: [text('completed_by', 'completed_at')],
    times: ['completed_at', 'updated_at'],
  },
  terminology_translations: {
    action: 'strip',
    person: [
      text('proposed_by', 'created_at'),
      text('proposed_by_name', 'created_at'),
      text('approved_by', 'approved_at'),
      text('approved_by_name', 'approved_at'),
    ],
    times: ['approved_at', 'created_at', 'updated_at'],
  },
  terminology_discussions: {
    action: 'strip',
    person: [text('user_id', 'created_at'), text('username', 'created_at')],
    times: ['created_at'],
  },
  book_glossary_entry: {
    action: 'strip',
    via: 'layer',
    person: [text('created_by', 'created_at'), text('updated_by', 'updated_at')],
    times: ['created_at', 'updated_at'],
  },
  book_glossary_exclusion: {
    action: 'strip',
    via: 'layer',
    person: [text('created_by', 'created_at')],
    times: ['created_at'],
  },
  book_glossary_change: {
    action: 'strip',
    via: 'layer',
    person: [text('by', 'at')],
    times: ['at'],
  },
  registered_books: {
    action: 'strip',
    person: [text('registered_by', 'registered_at')],
    times: ['registered_at', 'source_fetched_at'],
  },
  feedback: {
    action: 'strip',
    person: [
      text('user_email', 'created_at'),
      text('user_name', 'created_at'),
      text('assigned_to', 'created_at'),
      text('resolved_by', 'resolved_at'),
      text('resolved_by_name', 'resolved_at'),
    ],
    times: ['created_at', 'updated_at', 'resolved_at'],
  },
  feedback_responses: {
    action: 'strip',
    person: [text('responder_id', 'created_at'), text('responder_name', 'created_at')],
    times: ['created_at'],
  },
  localization_logs: {
    action: 'strip',
    person: [text('localizer', 'updated_at')],
    times: ['created_at', 'updated_at'],
    jsonTimes: ['entries'],
  },

  // ── delete the rows (spec §4.2): the pure logs, and the links from a person to work ──
  activity_log: {
    action: 'delete',
    person: [text('user_id', 'created_at'), text('username', 'created_at')],
    times: [],
  },
  notifications: { action: 'delete', person: [text('user_id', 'created_at')], times: [] },
  chapter_locks: { action: 'delete', person: [text('locked_by', 'locked_at')], times: [] },
  analytics_events: { action: 'delete', person: [text('user_agent', 'created_at')], times: [] },
  chapter_generation_log: {
    action: 'delete',
    person: [text('user_id', 'created_at'), text('username', 'created_at')],
    times: [],
  },
  user_book_access: {
    action: 'delete',
    person: [integer('user_id', 'assigned_at'), text('assigned_by', 'assigned_at')],
    times: [],
  },
  user_chapter_assignments: {
    action: 'delete',
    person: [integer('user_id', 'assigned_at'), text('assigned_by', 'assigned_at')],
    times: [],
  },
  chapter_assignments: {
    action: 'delete',
    person: [integer('assigned_to', 'created_at'), integer('assigned_by', 'created_at')],
    times: [],
  },
  notification_preferences: {
    action: 'delete',
    person: [text('user_id', 'updated_at')],
    times: [],
  },

  // ── kept: the accounts ([USER]'s scope answer) ──
  users: {
    action: 'keep',
    person: [
      text('provider_id', null),
      text('provider_username', null),
      text('display_name', null),
      text('email', null),
      text('created_by', null),
    ],
    times: [],
  },

  // ── kept: the licence-clause record (G1.13 spec §6.4) ──
  editor_licence_clauses: {
    action: 'keep',
    person: [integer('user_id', null), text('recorded_by', null)],
    times: [],
  },

  // ── 2030, step 3: the proof of a consent decision (spec §4.4) ──
  research_consent: {
    action: 'consent',
    person: [integer('user_id', 'given_at_ms')],
    times: [],
  },
});

/** Columns whose names look like a person's but hold none. */
const NOT_PERSON = deepFreeze({
  'segment_edits.editor_note': 'free text: the editor’s note is editorial content (spec §4.2)',
  'segment_edits.reviewer_note': 'free text: the reviewer’s note is editorial content (spec §4.2)',
  'localization_pending_edits.reviewer_note':
    'free text: the reviewer’s note is editorial content (spec §4.2)',
  'localization_suggestions.reviewer_modified_text':
    'the reviewer’s edited text: editorial content, not who reviewed',
  'terminology_discussions.proposed_translation': 'a proposed Icelandic term: editorial content',
  'module_reviews.approved_segments': 'a count of approved segments',
  'notifications.email_sent': 'a flag: whether an email was sent',
  'book_sections.linguistic_approved_at': 'a time, cut to the day with the row’s other times',
  'book_sections.localization_approved_at': 'a time, cut to the day with the row’s other times',
  'terminology_translations.approved_at': 'a time, cut to the day with the row’s other times',
  'book_switch_events.switch_name': 'the name of a book switch, not of a person',
});

module.exports = { SCOPE, NOT_PERSON };
