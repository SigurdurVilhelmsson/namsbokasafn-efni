/**
 * Pure decision rules for the C16 segment-edit re-attach (spec §7).
 *
 * No DB, no filesystem, no argv — so every rule is unit-testable in isolation.
 * Mirrors the split in server/lib/glossaryExportDecision.js.
 */

/**
 * Statuses that represent LIVE editorial work and therefore re-enter the
 * review queue. `rejected` is excluded on purpose: restoring it as pending
 * would resurrect an edit a head editor deliberately turned down.
 * `superseded` is history — a later row already replaced it.
 */
export const RESTORABLE_STATUSES = new Set(['approved', 'pending', 'discuss']);

/** @returns {'restore'|'skip-status'} */
export function classifyByStatus(status) {
  return RESTORABLE_STATUSES.has(status) ? 'restore' : 'skip-status';
}

const MARKER_CLASSES = [
  ['curly-emphasis', /\{\{\/?[ib]\}\}/],
  ['curly-term-fn', /\{\{\/?(term|fn)\}\}/],
  [
    'markdown',
    /(?<!\*)\*[^*\n]{1,60}\*(?!\*)|~[^~\n]{1,60}~|\^[^^\n]{1,60}\^|__[^_\n]{1,40}__|\+\+[^+\n]{1,40}\+\+/,
  ],
];

/**
 * Which retired marker classes a piece of edited text still carries.
 * Detection only — the text is never rewritten. A {{term}} → [[term:]]
 * rewrite is lossy (the curly form has no id, the bracket form is
 * id-anchored), so the editor resolves these against the new baseline.
 *
 * @returns {string[]} stable order, empty when clean
 */
export function detectRetiredMarkers(text) {
  const src = text || '';
  return MARKER_CLASSES.filter(([, re]) => re.test(src)).map(([name]) => name);
}

/**
 * The note an editor sees on a restored edit. Flags lead, because they are
 * the only part that needs an action beyond ordinary review.
 */
export function composeEditorNote({ flags = [], oldMt = '', editorNote = '', reviewerNote = '' }) {
  const parts = [];
  parts.push(
    flags.length
      ? `⚠️ ENDURFLUTT (C16) — inniheldur úrelt snið: ${flags.join(', ')}. Berðu saman við nýju vélþýðinguna og lagfærðu sniðið.`
      : '⚠️ ENDURFLUTT (C16) — staðfestu gegn nýrri vélþýðingu.'
  );
  if (oldMt) parts.push(`Fyrri vélþýðing: ${oldMt}`);
  if (reviewerNote) parts.push(`Athugasemd yfirlesara: ${reviewerNote}`);
  if (editorNote) parts.push(`Fyrri athugasemd: ${editorNote}`);
  return parts.join('\n\n');
}

/**
 * Every snapshot row must land in exactly one bucket. An unexplained gap is
 * the one outcome that would let editorial work disappear quietly, so it is
 * a hard failure rather than a warning.
 */
export function reconcile({ total, restored, converged, skippedByStatus, unmatched }) {
  const accounted = restored + converged + skippedByStatus + unmatched;
  if (accounted === total) {
    return { ok: true, message: `All ${total} snapshot rows accounted for.` };
  }
  return {
    ok: false,
    message: `RECONCILIATION FAILED: ${total} snapshot rows but ${accounted} accounted for (${Math.abs(total - accounted)} unexplained).`,
  };
}
