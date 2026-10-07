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
import crypto from 'crypto';
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

/**
 * §C140 '6' G6 — the config tables that change a figure's COMPOSED PIXELS while sitting outside
 * `renderHash` and `composedVersion`: nothing marks a figure stale when one of them changes, so their
 * route to a figure with a sidecar is the next COMPOSER_VERSION bump, and
 * tools/__tests__/figure-text-config.test.js's COMPOSER_TABLES_PIN is what makes a change that skips
 * that route go red. A new table of this kind is appended here, in the commit that adds it.
 */
export const COMPOSER_PIXEL_TABLES = [
  'heldBlockValues',
  'artworkEdits',
  'anchorExclusions',
  'sourceAlignedBoxes', // §C140 '6' R-5c2
];

/** JSON with every object's keys sorted, recursively: the same tables in any key order hash the same. */
function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

const sha16 = (text) =>
  crypto.createHash('sha256').update(text, 'utf-8').digest('hex').slice(0, 16);

/**
 * The fingerprint COMPOSER_TABLES_PIN pins: over COMPOSER_PIXEL_TABLES, only the entries whose figure
 * has a COMMITTED sidecar. A textless figure (no sidecar) is recomposed on every `--stale` run, so its
 * entry legitimately changes without a bump and is left out. An absent table is `{}`.
 * @param {object} cfg  the parsed figure config
 * @param {{hasSidecar:(basename:string)=>boolean}} opts  whether a basename has a committed sidecar;
 *   required, because the scope is the rule
 * @returns {{digest:string, tables:Object<string,string>, scoped:Object<string,string[]>}}
 *   `digest` over all the tables, `tables` one sub-digest each (so a red names the table that moved),
 *   `scoped` the basenames each table contributed, sorted; every digest is sha256's first 16 hex chars
 * @throws {Error} without a hasSidecar function, or when a table is present but is not a plain object
 */
export function composerTablesFingerprint(cfg, { hasSidecar } = {}) {
  if (typeof hasSidecar !== 'function') {
    throw new Error('composerTablesFingerprint needs a hasSidecar(basename) predicate');
  }
  const tables = {};
  const scoped = {};
  const kept = {};
  for (const name of COMPOSER_PIXEL_TABLES) {
    const t = cfg[name] === undefined ? {} : cfg[name];
    if (t === null || typeof t !== 'object' || Array.isArray(t)) {
      throw new Error(`${name} must be an object, got ${JSON.stringify(t)}`);
    }
    scoped[name] = Object.keys(t).filter(hasSidecar).sort();
    kept[name] = Object.fromEntries(scoped[name].map((b) => [b, t[b]]));
    tables[name] = sha16(canonicalJson(kept[name]));
  }
  return { digest: sha16(canonicalJson(kept)), tables, scoped };
}
