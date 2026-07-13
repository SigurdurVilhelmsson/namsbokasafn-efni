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
import { loadAllowlist, classifyDiff } from './fidelity-allowlist.js';

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
 * The manifest is **track-qualified**: each track's results live under
 * `tracks[<track>]`, and a run only replaces its own track's section — so a
 * faithful inject can no longer clobber the mt-preview record (or vice-versa).
 * The file keeps its name (`translation-errors.json`) to stay inside the
 * `merge=ours` .gitattributes glob and the git-backup staging glob.
 *
 * @param {string} bookDir - Book directory (e.g., 'books/efnafraedi-2e')
 * @param {Object} options
 * @param {string} [options.track='mt-preview'] - Translation track
 * @param {string} [options.tool='cnxml-inject'] - Producing tool (provenance)
 * @param {boolean} [options.verbose=false] - Log progress
 * @returns {{ perfect: number, withDiscrepancies: number, totalDiscrepancies: number, skippedUntranslated: number, totalSourceModules: number }}
 */
export function updateTranslationErrors(bookDir, options = {}) {
  const track = options.track || 'mt-preview';
  const tool = options.tool || 'cnxml-inject';
  const verbose = options.verbose || false;
  const chapters = discoverChapters(bookDir);
  const allowlist = loadAllowlist(bookDir);

  const modules = [];
  let totalSourceModules = 0;
  let totalChecked = 0;
  let skippedUntranslated = 0;
  let perfect = 0;
  let withDiscrepancies = 0;
  let totalDiscrepancies = 0;
  let unexplainedDiscrepancies = 0;
  let deferredLosses = 0;
  let benignArtifacts = 0;

  for (const chapterDir of chapters) {
    const sourceDir = path.join(bookDir, '01-source', chapterDir);
    const transDir = path.join(bookDir, '03-translated', track, chapterDir);
    const mods = discoverModules(sourceDir);

    for (const mod of mods) {
      totalSourceModules++;
      const sourcePath = path.join(sourceDir, mod.filename);
      const transPath = path.join(transDir, mod.filename);

      // Source module with no injected translation: count it, don't drop it.
      // Dropping un-injected modules was the "false green" bug — a barely
      // translated book reported the same shape as a fully translated one.
      if (!fs.existsSync(transPath)) {
        skippedUntranslated++;
        continue;
      }

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

        const classifiedDiscrepancies = diffs.map((d) => {
          const classification = classifyDiff(mod.moduleId, d.tag, d.diff, allowlist);
          const abs = Math.abs(d.diff);
          if (classification.status === 'unexplained') unexplainedDiscrepancies += abs;
          else if (classification.status === 'known-loss-deferred') deferredLosses += abs;
          else if (classification.status === 'benign') benignArtifacts += abs;
          return { tag: d.tag, diff: d.diff, ...classification };
        });

        modules.push({
          moduleId: mod.moduleId,
          chapter: chapterDir,
          discrepancies: classifiedDiscrepancies,
        });
      }
    }
  }

  // A track is only "green" when every source module was checked AND every
  // discrepancy is explained (allowlisted as benign or a deferred known loss).
  // An unlisted or drifted-diff discrepancy is "unexplained" and blocks green;
  // a "known-loss-deferred" one is tracked (deferredLosses) but does not.
  const green = unexplainedDiscrepancies === 0 && skippedUntranslated === 0;
  const generated = new Date().toISOString();

  const trackSection = {
    generated,
    tool,
    summary: {
      totalSourceModules,
      totalChecked,
      skippedUntranslated,
      perfect,
      withDiscrepancies,
      totalDiscrepancies,
      unexplainedDiscrepancies,
      deferredLosses,
      benignArtifacts,
      green,
    },
    modules,
  };

  const outputPath = path.join(bookDir, 'translation-errors.json');

  // Read-merge-preserve: keep other tracks' sections instead of overwriting
  // the whole file. Tolerate a missing or legacy flat-shape manifest by
  // starting from an empty tracks map.
  const priorTracks = readPriorTracks(outputPath);

  const result = {
    generated,
    pipeline:
      'extract→api-translate→inject (bracket markers [[i:]], [[link:]], [[xref:]], [[docref:]], [[term:]], [[fn:]])',
    tracks: {
      ...priorTracks,
      [track]: trackSection,
    },
  };

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

  if (verbose) {
    console.error(
      `Updated ${outputPath} [${track}]: ${perfect} PERFECT, ${withDiscrepancies} with discrepancies, ${skippedUntranslated} skipped (untranslated), ${totalDiscrepancies} total (${unexplainedDiscrepancies} unexplained, ${deferredLosses} deferred, ${benignArtifacts} benign)`
    );
  }

  return {
    perfect,
    withDiscrepancies,
    totalDiscrepancies,
    skippedUntranslated,
    totalSourceModules,
  };
}

/**
 * Read the existing manifest's per-track sections, if any.
 * Returns `{}` when the file is absent, unreadable, or in the pre-track
 * (legacy flat) shape — so a run always starts from a valid tracks map.
 * @param {string} outputPath
 * @returns {Record<string, object>}
 */
function readPriorTracks(outputPath) {
  if (!fs.existsSync(outputPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    return parsed && typeof parsed.tracks === 'object' && parsed.tracks ? parsed.tracks : {};
  } catch {
    return {};
  }
}
