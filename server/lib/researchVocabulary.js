// server/lib/researchVocabulary.js — the closed vocabularies of the research event log (spec §5.9, §5.10).
// Every value a research event, item or loss may carry is listed here; `record` and the emitters
// reject anything else. A new value is a spec amendment, not an edit to this file alone.

/** Event types, in the order of spec §5.9's table. */
const EVENT_TYPES = Object.freeze([
  'module-opened',
  'edit-save',
  'edit-resave',
  'edit-withdraw',
  'edit-delete',
  'edit-approve',
  'edit-reject',
  'edit-discuss',
  'edit-unapprove',
  'edit-return-to-pending',
  'edit-comment',
  'module-submit',
  'review-complete',
  'apply',
  'restore',
  'propagation',
  'mt-accept',
  'mt-accept-revoke',
  'suggestion-reject',
  'suggestion-left-open',
  'write-refused',
]);

/** The kinds of editing row an event may point at. */
const EDITING_KINDS = Object.freeze([
  'segment_edit',
  'segment_acceptance',
  'suggestion_rejection',
  'suggestion_left_open',
]);

/** What an item (one tool-assisted insertion or suggestion) can be (spec §5.10). */
const ITEM_TYPES = Object.freeze([
  'repetition-insert',
  'term-insert',
  'markup-wrap',
  'ai-suggestion',
  'rule-suggestion',
  'draft-restore',
]);

/** How far the server could check what the client claimed about an item. */
const ITEM_CLAIMS = Object.freeze(['validated', 'unverified', 'mismatch']);

/** An item's outcome follows from its event's type; other event types carry no items. */
const ITEM_OUTCOME_BY_EVENT = Object.freeze({
  'edit-save': 'applied',
  'edit-resave': 'applied',
  'suggestion-reject': 'rejected',
  'suggestion-left-open': 'left-open',
});

/** Why an event was lost instead of recorded. */
const LOSS_ERROR_CLASSES = Object.freeze([
  'unavailable',
  'busy',
  'constraint',
  'consent-unknown',
  'other',
]);

module.exports = {
  EVENT_TYPES,
  EDITING_KINDS,
  ITEM_TYPES,
  ITEM_CLAIMS,
  ITEM_OUTCOME_BY_EVENT,
  LOSS_ERROR_CLASSES,
};
