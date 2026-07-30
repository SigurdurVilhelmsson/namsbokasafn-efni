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
 * The key saveSegmentEdit itself resolves a save against: its pending-row
 * lookup and the partial UNIQUE index (`idx_segment_edits_one_pending`, on
 * `WHERE status = 'pending'`) both key on these four columns. `editor_id` is
 * part of it — two editors may each hold a pending row on one segment, and
 * those rows do NOT collide.
 */
const restoreKey = (r) => `${r.book}/${r.module_id}/${r.segment_id}/${r.editor_id}`;

/**
 * Snapshot rows that would land on ONE saveSegmentEdit key.
 *
 * Two restorable rows can share a key: the pending-uniqueness index is
 * partial, and saveSegmentEdit's supersede sweep never touches `approved`, so
 * an approved row and a pending row coexist in production — and
 * RESTORABLE_STATUSES admits both. Written blind, the first becomes a pending
 * row and the second takes saveSegmentEdit's UPDATE branch and overwrites its
 * text: an editor's work is destroyed, the counter still reports two writes,
 * and reconcile() still passes because it counts plan buckets, not DB rows.
 *
 * Whether the snapshot actually holds such a pair is not knowable before the
 * export runs, so this is detection, not repair. The caller refuses.
 *
 * @param {Array<{book: string, module_id: string, segment_id: string, editor_id: string}>} rows
 * @returns {Array<{key: string, count: number}>} stable order, empty when clean
 */
export function findDuplicateRestoreKeys(rows) {
  const counts = new Map();
  for (const r of rows) {
    const k = restoreKey(r);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

/**
 * The run's exit code. The runbook treats these as gates rather than
 * information — "two of them mean stop and one does not" — so the mapping is
 * pinned by tests here instead of being traced through the CLI, which cannot
 * be exercised without the real books/ tree.
 *
 * Order is deliberate, most-causal first: a missing module CAUSES the
 * reconciliation gap, so reporting 3 there would name the symptom. 1 is last
 * because it is the one non-fatal outcome.
 *
 * @returns {0|1|2|3|4} 0 clean · 1 unmatched (expected, continue by hand)
 *   · 2 module absent from the new extraction · 3 buckets did not reconcile
 *   · 4 one key carries more than one restorable row
 */
export function decideExitCode(plan) {
  if (plan.missingModules?.length) return 2;
  if (plan.duplicateKeys?.length) return 4;
  if (!plan.reconciliation?.ok) return 3;
  if (plan.unmatched?.length) return 1;
  return 0;
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
