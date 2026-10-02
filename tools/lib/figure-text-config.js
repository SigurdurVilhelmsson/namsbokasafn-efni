/**
 * figure-text-config — the JS tools' reader of the figure-text config (§C140 ㊵).
 *
 * The file is `experiments/figure-text-translation/figure-text.config.json`, owned by the figure
 * experiment; `sources.py` reads it too. This module owns its PATH for the tools that need the
 * `retiredFigures` table (the mapping generator and the retire tool) and the config validator.
 *
 * ⚠️ `tools/figure-run.js` keeps its own `FIGURE_TEXT_CONFIG` constant. That is deliberate in this
 * change: the paid driver changes wording only (spec D7). Both copies resolve to the same file,
 * and both fail loudly if it moves.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const FIGURE_TEXT_CONFIG = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'experiments',
  'figure-text-translation',
  'figure-text.config.json'
);

/** The parsed figure config. Throws on unreadable or invalid JSON: a tool must not guess. */
export function loadFigureTextConfig(configPath = FIGURE_TEXT_CONFIG, readFile = fs.readFileSync) {
  return JSON.parse(readFile(configPath, 'utf-8'));
}

/**
 * The EXACT keys of `retiredFigures`. The JS tools match retired names exactly; the validator
 * requires every key to be exactly one book's image basename, so a key misspelt by case is caught
 * there rather than silently matching here.
 * @param {object} cfg
 * @returns {Set<string>}
 * @throws {Error} when the table is present but is not a plain object
 */
export function retiredFigureNames(cfg) {
  const table = cfg.retiredFigures;
  if (table === undefined) return new Set();
  if (table === null || typeof table !== 'object' || Array.isArray(table)) {
    throw new Error(
      `retiredFigures must be an object of {basename: reason}, got ${JSON.stringify(table)}`
    );
  }
  return new Set(Object.keys(table));
}

/** @returns {Set<string>} the retired names in the config at `configPath` */
export function loadRetiredFigures(configPath = FIGURE_TEXT_CONFIG) {
  return retiredFigureNames(loadFigureTextConfig(configPath));
}

/**
 * The fold `sources._normkey` applies: lower-case, then keep letters and digits only.
 * 🔴 TWO IMPLEMENTATIONS OF ONE RULE. Python's `str.isalnum()` keeps Unicode letters and numbers,
 * which is what `\p{L}` and `\p{N}` match. Both are pinned to the same literal table in
 * tools/__tests__/figure-text-config.test.js and experiments/figure-text-translation/test_sources.py.
 * @param {string} stem
 * @returns {string}
 */
export function normkey(stem) {
  return stem.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
