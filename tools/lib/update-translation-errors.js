/**
 * update-translation-errors.js — Regenerate translation-errors.json for a book
 *
 * Runs a full-book fidelity check (source vs translated CNXML tag counts)
 * and writes the results to books/{book}/translation-errors.json.
 *
 * Called automatically at the end of cnxml-inject.js and repair-emphasis.js
 * to keep the error manifest in sync with the actual translated CNXML state.
 */

import fs from 'fs';
import path from 'path';
import { compareTagCounts } from '../cnxml-fidelity-check.js';

/**
 * Discover chapter directories in a book's source folder.
 * @param {string} bookDir - Book directory (e.g., 'books/efnafraedi-2e')
 * @returns {string[]} Sorted chapter directory names (e.g., ['ch01', 'ch02', ..., 'appendices'])
 */
function discoverChapters(bookDir) {
  const sourceDir = path.join(bookDir, '01-source');
  if (!fs.existsSync(sourceDir)) return [];
  return fs
    .readdirSync(sourceDir)
    .filter((d) => d.match(/^ch\d+$/) || d === 'appendices')
    .sort((a, b) => {
      if (a === 'appendices') return 1;
      if (b === 'appendices') return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
}

/**
 * Discover CNXML modules in a directory.
 * @param {string} dir - Directory path
 * @returns {Array<{moduleId: string, filename: string}>}
 */
function discoverModules(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.match(/^m\d+\.cnxml$/))
    .sort()
    .map((f) => ({ moduleId: f.replace('.cnxml', ''), filename: f }));
}

/**
 * Run a full-book fidelity check and write translation-errors.json.
 *
 * @param {string} bookDir - Book directory (e.g., 'books/efnafraedi-2e')
 * @param {Object} options
 * @param {string} [options.track='mt-preview'] - Translation track
 * @param {boolean} [options.verbose=false] - Log progress
 * @returns {{ perfect: number, withDiscrepancies: number, totalDiscrepancies: number }}
 */
export function updateTranslationErrors(bookDir, options = {}) {
  const track = options.track || 'mt-preview';
  const verbose = options.verbose || false;
  const chapters = discoverChapters(bookDir);

  const modules = [];
  let totalChecked = 0;
  let perfect = 0;
  let withDiscrepancies = 0;
  let totalDiscrepancies = 0;

  for (const chapterDir of chapters) {
    const sourceDir = path.join(bookDir, '01-source', chapterDir);
    const transDir = path.join(bookDir, '03-translated', track, chapterDir);
    const mods = discoverModules(sourceDir);

    for (const mod of mods) {
      const sourcePath = path.join(sourceDir, mod.filename);
      const transPath = path.join(transDir, mod.filename);

      if (!fs.existsSync(transPath)) continue;

      const sourceCnxml = fs.readFileSync(sourcePath, 'utf8');
      const translatedCnxml = fs.readFileSync(transPath, 'utf8');
      const diffs = compareTagCounts(sourceCnxml, translatedCnxml);

      totalChecked++;

      if (diffs.length === 0) {
        perfect++;
      } else {
        withDiscrepancies++;
        const moduleDiffs = diffs.reduce((s, d) => s + Math.abs(d.diff), 0);
        totalDiscrepancies += moduleDiffs;

        modules.push({
          moduleId: mod.moduleId,
          chapter: chapterDir,
          discrepancies: diffs.map((d) => ({ tag: d.tag, diff: d.diff })),
        });
      }
    }
  }

  const result = {
    generated: new Date().toISOString(),
    pipeline:
      'extract→api-translate→inject (bracket markers [[i:]], [[link:]], [[xref:]], [[docref:]])',
    summary: {
      totalChecked,
      perfect,
      withDiscrepancies,
      skippedUntranslated: 0,
      totalDiscrepancies,
    },
    modules,
  };

  const outputPath = path.join(bookDir, 'translation-errors.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

  if (verbose) {
    console.error(
      `Updated ${outputPath}: ${perfect} PERFECT, ${withDiscrepancies} with discrepancies, ${totalDiscrepancies} total`
    );
  }

  return { perfect, withDiscrepancies, totalDiscrepancies };
}
