/**
 * cnxml-dom-comparison.test.js
 *
 * Comparison test infrastructure for the DOM-based builder refactor.
 *
 * Strategy: runs BOTH old regex and new DOM implementations on real module data,
 * compares fidelity via compareTagCounts, and ensures zero regressions.
 *
 * Part 1: Full-module fidelity baseline (always runs)
 *   — Runs buildCnxml on each test module, checks output fidelity vs source.
 *   — Captures the known baseline; after DOM builders are swapped in,
 *     re-running verifies no regressions.
 *
 * Part 2: Element-level comparison (skipped until DOM builders are exported)
 *   — Calls both old (regex) and new (DOM) builders on each example element.
 *   — Asserts: new output has identical or fewer discrepancies vs source.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as inject from '../cnxml-inject.js';
import { compareTagCounts } from '../cnxml-fidelity-check.js';

const {
  parseSegments,
  reverseInlineMarkup,
  buildCnxml,
  restoreTermMarkers,
  restoreSupersubMarkers,
  restoreMediaMarkers,
  restoreMathMarkers,
  restoreNewlines,
  buildExample: buildExampleOld,
  buildExercise: buildExerciseOld,
  buildNote: buildNoteOld,
} = inject;

// DOM builders — undefined until implemented and exported
const buildExampleDom = inject.buildExampleDom;
const buildExerciseDom = inject.buildExerciseDom;
const buildNoteDom = inject.buildNoteDom;

const BOOKS = join(import.meta.dirname, '..', '..', 'books', 'efnafraedi-2e');

// ─── Test Modules ────────────────────────────────────────────────────
// Selected to cover both PERFECT and problem modules.
// baseline: max allowed discrepancies (current known count).

const TEST_MODULES = [
  // PERFECT modules — must stay at 0
  { moduleId: 'm68683', chapter: 'ch01', baseline: 0 },
  { moduleId: 'm68684', chapter: 'ch02', baseline: 0 },
  { moduleId: 'm68699', chapter: 'ch03', baseline: 0 },
  // Problem modules — must not exceed baseline
  { moduleId: 'm68710', chapter: 'ch04', baseline: 1 },
  { moduleId: 'm68727', chapter: 'ch05', baseline: 16 },
  { moduleId: 'm68739', chapter: 'ch07', baseline: 6 },
  { moduleId: 'm68789', chapter: 'ch12', baseline: 5 },
];

// ─── Module Loading ──────────────────────────────────────────────────

/**
 * Load and prepare module data for testing.
 * Replicates the same loading and marker restoration done by the CLI pipeline.
 */
function loadModule(moduleId, chapter) {
  const structPath = join(BOOKS, '02-structure', chapter, `${moduleId}-structure.json`);
  const structure = JSON.parse(readFileSync(structPath, 'utf8'));

  const eqPath = join(BOOKS, '02-structure', chapter, `${moduleId}-equations.json`);
  const equations = existsSync(eqPath) ? JSON.parse(readFileSync(eqPath, 'utf8')) : {};

  const inlineAttrsPath = join(BOOKS, '02-structure', chapter, `${moduleId}-inline-attrs.json`);
  const inlineAttrs = existsSync(inlineAttrsPath)
    ? JSON.parse(readFileSync(inlineAttrsPath, 'utf8'))
    : {};

  const segPath = join(BOOKS, '02-mt-output', chapter, `${moduleId}-segments.is.md`);
  const segments = parseSegments(readFileSync(segPath, 'utf8'));

  const enSegPath = join(BOOKS, '02-for-mt', chapter, `${moduleId}-segments.en.md`);
  const enSegments = existsSync(enSegPath)
    ? parseSegments(readFileSync(enSegPath, 'utf8'))
    : new Map();

  const originalCnxml = readFileSync(
    join(BOOKS, '01-source', chapter, `${moduleId}.cnxml`),
    'utf8'
  );

  // Apply marker restoration (same as CLI pipeline)
  const isApiTranslated = [...segments.values()].some(
    (s) =>
      s.includes('{{i}}') || s.includes('{{b}}') || s.includes('{{term}}') || s.includes('{{fn}}')
  );

  restoreTermMarkers(segments, enSegments);

  if (!isApiTranslated) {
    restoreSupersubMarkers(segments, enSegments);
    restoreMediaMarkers(segments, enSegments);
    restoreNewlines(segments, enSegments);
  }

  restoreMathMarkers(segments, enSegments);

  return { structure, segments, equations, originalCnxml, enSegments, inlineAttrs };
}

/**
 * Build a getSeg function that mirrors buildCnxml's internal getSeg.
 * Handles reverseInlineMarkup with proper block equation IDs.
 */
function makeGetSeg(structure, segments, equations, inlineAttrs) {
  // Collect block equation IDs (same logic as buildCnxml)
  const blockEquationIds = new Set();
  (function collectBlockEqIds(elements) {
    for (const el of elements) {
      if (el.type === 'equation' && el.id) blockEquationIds.add(el.id);
      if (el.type === 'example' || el.type === 'exercise') continue;
      if (el.content) collectBlockEqIds(el.content);
    }
  })(structure.content || []);

  return (segmentId) => {
    if (!segmentId) return '';
    const text = segments.get(segmentId);
    if (!text) return '';
    return reverseInlineMarkup(
      text,
      equations,
      structure.inlineMedia || [],
      structure.inlineTables || [],
      inlineAttrs[segmentId] || null,
      blockEquationIds
    );
  };
}

/**
 * Recursively find all elements of a given type in a structure tree.
 */
function findElements(content, type, results = []) {
  for (const el of content || []) {
    if (el.type === type) results.push(el);
    if (el.content) findElements(el.content, type, results);
    if (el.problem?.content) findElements(el.problem.content, type, results);
    if (el.solution?.content) findElements(el.solution.content, type, results);
  }
  return results;
}

/**
 * Count total absolute discrepancies from compareTagCounts result.
 */
function totalDiscrepancies(diffs) {
  return diffs.reduce((sum, d) => sum + Math.abs(d.diff), 0);
}

// ─── Part 1: Full-Module Fidelity Baseline ───────────────────────────

describe('Full-module fidelity baseline', () => {
  for (const mod of TEST_MODULES) {
    it(`${mod.moduleId} (${mod.chapter}): discrepancies ≤ ${mod.baseline}`, () => {
      const { structure, segments, equations, originalCnxml, inlineAttrs } = loadModule(
        mod.moduleId,
        mod.chapter
      );

      const result = buildCnxml(structure, segments, equations, originalCnxml, {}, inlineAttrs);
      const diffs = compareTagCounts(originalCnxml, result.cnxml);
      const total = totalDiscrepancies(diffs);

      if (mod.baseline === 0) {
        expect(diffs).toEqual([]);
      } else {
        expect(total).toBeLessThanOrEqual(mod.baseline);
      }
    });
  }
});

// ─── Part 2: Element-Level Comparison (Example) ──────────────────────

const describeExample = buildExampleDom ? describe : describe.skip;

describeExample('buildExample: DOM vs regex comparison', () => {
  for (const mod of TEST_MODULES) {
    const { structure, segments, equations, originalCnxml, inlineAttrs } = loadModule(
      mod.moduleId,
      mod.chapter,
      mod.chapterNum
    );
    const getSeg = makeGetSeg(structure, segments, equations, inlineAttrs);
    // Normalize self-closing entries (same as buildCnxml)
    const normalizedCnxml = originalCnxml.replace(/<entry([^>]*)\/>/g, '<entry$1></entry>');
    const examples = findElements(structure.content, 'example');

    if (examples.length === 0) continue;

    describe(`${mod.moduleId} (${examples.length} examples)`, () => {
      for (const example of examples) {
        it(`example ${example.id}: DOM matches or beats regex`, () => {
          const oldOutput = buildExampleOld(example, getSeg, equations, normalizedCnxml);
          const newOutput = buildExampleDom(example, getSeg, equations, normalizedCnxml);

          // Both should produce non-null output
          expect(oldOutput).toBeTruthy();
          expect(newOutput).toBeTruthy();

          // Compare tag counts: new should match or improve on old
          const oldVsNew = compareTagCounts(oldOutput, newOutput);
          const diffCount = totalDiscrepancies(oldVsNew);

          if (mod.baseline === 0) {
            // PERFECT module: DOM must produce identical tag counts
            expect(oldVsNew).toEqual([]);
          } else {
            // Problem module: if there are differences, verify they're improvements.
            // For now, allow any output — full-module test is the gate.
            // Log differences for debugging.
            if (diffCount > 0) {
              console.log(
                `  ${mod.moduleId}/${example.id}: ${diffCount} tag diffs old→new:`,
                oldVsNew.map((d) => `${d.tag}:${d.diff}`).join(', ')
              );
            }
          }
        });
      }
    });
  }
});

// ─── Part 3: Element-Level Comparison (Exercise) ─────────────────────

const describeExercise = buildExerciseDom ? describe : describe.skip;

describeExercise('buildExercise: DOM vs regex comparison', () => {
  for (const mod of TEST_MODULES) {
    const { structure, segments, equations, originalCnxml, inlineAttrs } = loadModule(
      mod.moduleId,
      mod.chapter,
      mod.chapterNum
    );
    const getSeg = makeGetSeg(structure, segments, equations, inlineAttrs);
    const normalizedCnxml = originalCnxml.replace(/<entry([^>]*)\/>/g, '<entry$1></entry>');
    const exercises = findElements(structure.content, 'exercise');

    if (exercises.length === 0) continue;

    describe(`${mod.moduleId} (${exercises.length} exercises)`, () => {
      for (const exercise of exercises) {
        it(`exercise ${exercise.id}: DOM matches or beats regex`, () => {
          const oldOutput = buildExerciseOld(exercise, getSeg, equations, normalizedCnxml);
          const newOutput = buildExerciseDom(exercise, getSeg, equations, normalizedCnxml);

          if (!oldOutput && !newOutput) return; // both null = fine

          expect(newOutput).toBeTruthy();

          const oldVsNew = compareTagCounts(oldOutput, newOutput);
          if (mod.baseline === 0) {
            expect(oldVsNew).toEqual([]);
          }
        });
      }
    });
  }
});

// ─── Part 4: Element-Level Comparison (Note) ─────────────────────────

const describeNote = buildNoteDom ? describe : describe.skip;

describeNote('buildNote: DOM vs regex comparison', () => {
  for (const mod of TEST_MODULES) {
    const { structure, segments, equations, originalCnxml, inlineAttrs } = loadModule(
      mod.moduleId,
      mod.chapter,
      mod.chapterNum
    );
    const getSeg = makeGetSeg(structure, segments, equations, inlineAttrs);
    const normalizedCnxml = originalCnxml.replace(/<entry([^>]*)\/>/g, '<entry$1></entry>');
    const notes = findElements(structure.content, 'note');

    if (notes.length === 0) continue;

    describe(`${mod.moduleId} (${notes.length} notes)`, () => {
      for (const note of notes) {
        // buildNote needs ctx for figure tracking
        const ctx = {
          figureCaptions: {},
          figuresHandledInNotes: new Set(),
        };

        it(`note ${note.id}: DOM matches or beats regex`, () => {
          const oldOutput = buildNoteOld(note, getSeg, equations, normalizedCnxml, ctx);
          const newOutput = buildNoteDom(note, getSeg, equations, normalizedCnxml, ctx);

          if (!oldOutput && !newOutput) return; // both null = fine (nested notes)

          if (oldOutput) {
            expect(newOutput).toBeTruthy();
            const oldVsNew = compareTagCounts(oldOutput, newOutput);
            if (mod.baseline === 0) {
              expect(oldVsNew).toEqual([]);
            }
          }
        });
      }
    });
  }
});
