/**
 * figure-drafts.js — which figure-card edits survive a re-render, and where an
 * unsaved one is parked.
 *
 * 🔴 WHY THIS IS A SEPARATE FILE. Saving one figure block re-fetches the whole
 * module's figures and rebuilds every card from the payload (`loadFigures` →
 * `renderFigureCards`), because the block route returns `{ok:true}` and
 * deliberately no state. That rebuild used to destroy text typed into any OTHER
 * block — silently, with no warning and no draft.
 *
 * The DOM plumbing lives in segment-editor.js and is exercised in the browser by
 * server/e2e/figure-review.spec.js. What lives HERE is the DECISION — which
 * values are re-applied after a rebuild — because E2E is a separate CI job that
 * `npm test` does not run, and a rule gated only by E2E is gated by nothing the
 * authoritative suite sees.
 *
 * Dual-loadable (browser global + CommonJS), the same idiom as
 * accept-eligibility.js: this file has no DOM dependency at all, which is the
 * whole point — its rules are testable without one.
 */
(function (root) {
  'use strict';

  /**
   * The localStorage namespace for figure drafts.
   *
   * ⚠️ EXPORTED BECAUSE tabGuard.js SWEEPS BY PREFIX. A draft namespace missing
   * from that sweep is never cleaned up and accumulates in the editor's browser
   * forever, with nothing failing anywhere. The test asserts the CONSEQUENCE —
   * that a stale key built from this constant is actually removed — rather than
   * that some array contains a matching literal.
   */
  const FIG_DRAFT_PREFIX = 'fig-draft:';

  /** Module-scoped, tab-agnostic: what a sweep or a restore searches by. */
  function figDraftPrefix(book, chapter, moduleId) {
    return FIG_DRAFT_PREFIX + book + '/' + chapter + '/' + moduleId + ':';
  }

  /**
   * Tab-scoped: what one tab writes. Two tabs editing one module must not
   * overwrite each other's draft, which is why tabGuard.tabId is in the key.
   */
  function figDraftKey(book, chapter, moduleId, tabId) {
    return figDraftPrefix(book, chapter, moduleId) + tabId;
  }

  /**
   * The values a rebuild must carry forward.
   *
   * @param {Array<{basename: string, blocks: Object}>} serverFigures
   *        the payload the cards are about to be rebuilt from
   * @param {Object} live
   *        what is in the inputs right now, `{[basename]: {blocks, note}}`
   * @param {{basename: string, blockKey: string}|null} justSaved
   *        the block whose save triggered this rebuild, if any
   * @returns {Object} the same shape as `live`, holding ONLY what to re-apply
   */
  function unsavedFigureEdits(serverFigures, live, justSaved) {
    const out = {};
    for (let i = 0; i < (serverFigures || []).length; i++) {
      const fig = serverFigures[i];
      const basename = fig.basename;
      const pending = live && live[basename];
      if (!pending) continue;

      const serverBlocks = fig.blocks || {};
      const keep = {};
      const liveBlocks = pending.blocks || {};
      for (const key in liveBlocks) {
        if (!Object.prototype.hasOwnProperty.call(liveBlocks, key)) continue;
        // A block the server no longer returns has no input to re-apply into.
        if (!Object.prototype.hasOwnProperty.call(serverBlocks, key)) continue;
        // The block whose save caused this rebuild: the SERVER wins. It may have
        // normalised what it stored, and re-applying the pre-save DOM value
        // would silently undo the save the editor just watched succeed.
        if (justSaved && justSaved.basename === basename && justSaved.blockKey === key) continue;
        // Equal to the server means nothing is unsaved — the ordinary case.
        const serverText = serverBlocks[key] == null ? '' : String(serverBlocks[key]);
        if (String(liveBlocks[key]) === serverText) continue;
        keep[key] = liveBlocks[key];
      }

      const entry = {};
      if (Object.keys(keep).length > 0) entry.blocks = keep;
      // The note input is never populated from the payload (`fig.note` is the
      // stored review note, rendered as its own paragraph), so anything in it is
      // unsent by definition — and was lost on every save, the same class of
      // defect as a sibling block.
      if (pending.note) entry.note = pending.note;
      if (Object.keys(entry).length > 0) out[basename] = entry;
    }
    return out;
  }

  const api = {
    FIG_DRAFT_PREFIX: FIG_DRAFT_PREFIX,
    figDraftPrefix: figDraftPrefix,
    figDraftKey: figDraftKey,
    unsavedFigureEdits: unsavedFigureEdits,
  };
  if (typeof root !== 'undefined') root.figureDrafts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
