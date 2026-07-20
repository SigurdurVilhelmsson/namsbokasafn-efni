/**
 * Accept-eligibility for "Staðfesta vélþýðingu" (MTA-R3).
 *
 * Single source of truth for the CLIENT half of the rule: the "Staðfesta MT"
 * button gate and the Óyfirfarnir facet both call it, so they can no longer
 * drift apart. The SERVER remains authoritative — POST …/accept is directly
 * reachable, so acceptanceService.acceptSegment enforces the same rule in SQL
 * and this predicate exists to stop the UI offering an action the server will
 * refuse (and, the original defect, to stop it hiding one the server allows).
 *
 * The two implementations are held together by a shared scenario table:
 * server/__tests__/helpers/acceptEligibilityCases.cjs, asserted against both.
 *
 * Deliberately does NOT consider an existing acceptance. "Is this already
 * accepted?" is a rendering branch (chip + revoke), not an eligibility
 * question — keeping them separate is what makes the server-parity table exact.
 */
(function (root) {
  /** An edit still in flight: the segment is not "MT as-is" while it lands. */
  function isActive(e) {
    return e.status === 'pending' || (e.status === 'approved' && !e.applied_at);
  }

  /**
   * Why the server would refuse to accept this segment.
   *
   * Check order mirrors acceptSegment so the codes match case for case.
   *
   * @param {{hasTranslation: boolean, is: string, edits?: Array}} seg
   * @returns {string|null} blocking code, or null when accept-eligible
   */
  function acceptBlockReason(seg) {
    if (!seg || !seg.hasTranslation) return 'NO_TRANSLATION';
    const edits = seg.edits || [];
    if (edits.some(isActive)) return 'EDIT_EXISTS';
    // An open discussion is unresolved review work — attesting over it would
    // let an uninvolved editor close a flagged disagreement single-handedly.
    if (edits.some((e) => e.status === 'discuss')) return 'DISCUSS_OPEN';
    // A published edit whose text IS the live baseline means the current bytes
    // are human translation, not MT. Byte-based on purpose: after a restore the
    // applied text is no longer on disk and accepting is honest again (MTA-R4).
    if (edits.some((e) => e.status === 'approved' && e.applied_at && e.edited_content === seg.is)) {
      return 'HUMAN_CONTENT';
    }
    return null;
  }

  function canAcceptMt(seg) {
    return acceptBlockReason(seg) === null;
  }

  const api = { acceptBlockReason: acceptBlockReason, canAcceptMt: canAcceptMt };
  if (typeof root !== 'undefined') root.acceptEligibility = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
