#!/usr/bin/env node

/**
 * analyze-order-causes.js — Diagnostic (NOT a gate).
 *
 * For each module, build fresh inject output in memory and compare element
 * document-order to source (compareElementOrder). Classify every out-of-order
 * ("moved") id by its SOURCE element tag, so the residual reorders are bucketed
 * by cause (equation / term / media / note / table / figure / para / …).
 *
 * Read-only, in-memory. Writes nothing under books/.
 */

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Map each moved id to the source element tag carrying it.
 * @param {string} sourceCnxml
 * @param {string[]} movedIds
 * @returns {{ counts: Record<string, number>, unresolved: string[] }}
 */
export function classifyMovedIds(sourceCnxml, movedIds) {
  const counts = {};
  const unresolved = [];
  for (const id of movedIds) {
    // Match the opening tag whose id attribute is exactly this id.
    const re = new RegExp(`<([\\w:-]+)\\b[^>]*\\bid="${escapeRegExp(id)}"`);
    const m = sourceCnxml.match(re);
    if (m) {
      const tag = m[1];
      counts[tag] = (counts[tag] || 0) + 1;
    } else {
      unresolved.push(id);
    }
  }
  return { counts, unresolved };
}
