#!/usr/bin/env node

/**
 * export-corpus.js — aligned research-corpus export (campaign item 20).
 *
 * Emits, per segment, the four pipeline tiers {EN, MT, faithful, localized}
 * joined on the frozen SEG id, as JSONL (canonical, raw+clean per tier) +
 * TSV (clean text) + a stats/licence manifest. EN-driven: every extracted
 * segment becomes a row; absent tiers are null. The postEdited flag
 * reproduces the segment editor's exact view semantics (mt-normalize chain)
 * so normalization artifacts never masquerade as human edits.
 *
 * Spec: docs/superpowers/specs/2026-07-19-item20-research-corpus-export-design.md
 *
 * Usage:
 *   node tools/export-corpus.js --book efnafraedi-2e
 *   node tools/export-corpus.js --book efnafraedi-2e --chapter 3 --dry-run -v
 */

import { normalizeWraps, unescapeMtMarkers, normalizeTermMarkers } from './lib/mt-normalize.cjs';
import { cleanSegmentText } from './generate-tm.js';

// ─── Text & row helpers ───────────────────────────────────────────────

/**
 * Corpus clean text: the TM's cleanSegmentText plus corpus-only additions.
 * [[lb:]]/[[rb:]] (item-9 literal-bracket escapes) decode LAST so restored
 * brackets can never be re-parsed as markers; [[MATH:N]]/[[MEDIA:n]] pass
 * through verbatim (positional placeholders, resolvable via 02-structure).
 *
 * @param {string} raw
 * @returns {string}
 */
function corpusCleanText(raw) {
  return cleanSegmentText(raw)
    .replace(/\[\[lb:\]\]/g, '[')
    .replace(/\[\[rb:\]\]/g, ']');
}

/**
 * Split a seg-id into its parts; tolerates short ids (missing parts → null).
 * @param {string} id
 * @returns {{moduleId: string|null, segmentType: string|null, elementId: string|null}}
 */
function splitSegId(id) {
  const [moduleId, segmentType, ...rest] = id.split(':');
  return {
    moduleId: moduleId || null,
    segmentType: segmentType || null,
    elementId: rest.length ? rest.join(':') : null,
  };
}

/**
 * The editor-visible view of an IS tier, per loadModuleForEditing
 * (server/services/segmentParser.js:164-239): normalizeWraps on parse →
 * unescapeMtMarkers → normalizeTermMarkers against the wrap-normalized EN.
 * postEdited answers "would the editor's diff view show a change" —
 * a byte-comparison against raw MT would mislabel every normalization
 * artifact as a human edit.
 *
 * @param {string} enRaw
 * @param {string|null} mtRaw
 * @param {string|null} faithfulRaw
 * @returns {boolean|null} null unless both IS tiers are present
 */
function computePostEdited(enRaw, mtRaw, faithfulRaw) {
  if (mtRaw == null || faithfulRaw == null) return null;
  const enView = normalizeWraps(enRaw ?? '');
  const view = (t) => normalizeTermMarkers(enView, unescapeMtMarkers(normalizeWraps(t)));
  return view(faithfulRaw).trim() !== view(mtRaw).trim();
}

/**
 * Build one corpus row. Key insertion order is the frozen spec order —
 * JSON.stringify preserves it, so JSONL output diffs deterministically.
 *
 * @param {{id: string, book: string, chapter: string, module: string,
 *          licence: string, en: string, mt: string|null,
 *          faithful: string|null, localized: string|null}} p
 * @returns {object}
 */
function buildRow(p) {
  const { segmentType, elementId } = splitSegId(p.id);
  const tier = (raw) => (raw == null ? null : { raw, clean: corpusCleanText(raw) });
  return {
    id: p.id,
    book: p.book,
    chapter: p.chapter,
    module: p.module,
    type: segmentType,
    elementId,
    licence: p.licence,
    en: tier(p.en),
    mt: tier(p.mt),
    faithful: tier(p.faithful),
    localized: tier(p.localized),
    postEdited: computePostEdited(p.en, p.mt, p.faithful),
  };
}

export { corpusCleanText, splitSegId, computePostEdited, buildRow };
