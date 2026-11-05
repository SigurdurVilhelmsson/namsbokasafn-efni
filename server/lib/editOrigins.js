/**
 * editOrigins — the write-path vocabulary of `segment_edits.origin` (G1.1; spec §5.10, "one
 * constant, pinned by a test"; plan decision 9).
 *
 * `origin` says which writer made a row. `EDIT_ORIGINS` are the writers that exist:
 * `editor-save` (the segment editor's save route), `propagation` (today's repetition route) and
 * `re-attach` (re-attaching edits by content). `RESERVED_EDIT_ORIGINS` are names later work will
 * use; no writer may stamp them yet, and `saveOnServedBase` refuses them.
 *
 * ⚠️ `propagation` and `propagated` are two different writers and must never be merged:
 * `propagation` is the repetition route a person triggers on one segment, `propagated` is reserved
 * for a later term pass over many. A reader that groups by origin would otherwise count one as
 * the other.
 *
 * No `CHECK` on the column holds this list (spec §5.10): widening a CHECK needs a table rebuild,
 * so the constant and its test are the guard.
 */
const EDIT_ORIGINS = Object.freeze(['editor-save', 'propagation', 're-attach']);
const RESERVED_EDIT_ORIGINS = Object.freeze(['note-apply', 'propagated', 'ai-pass']);

module.exports = { EDIT_ORIGINS, RESERVED_EDIT_ORIGINS };
