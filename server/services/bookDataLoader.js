/**
 * Book Data Loader
 *
 * Shared module for loading book metadata (chapters, modules, titles)
 * from JSON data files. Used by both segment-editor and localization-editor routes.
 *
 * Builds a slug-indexed cache at require time for O(1) lookups.
 */

const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');

const dataDir = path.join(__dirname, '..', 'data');
const cache = {};

for (const file of fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'))) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    if (data.slug) {
      cache[data.slug] = data;
    }
  } catch (err) {
    log.warn({ file, err }, 'bookDataLoader: failed to parse data file');
  }
}

/**
 * Get book metadata for a slug. Returns null if not found.
 * @param {string} slug - e.g. 'efnafraedi-2e'
 * @returns {object|null}
 */
function getBookData(slug) {
  return cache[slug] || null;
}

/**
 * Enrich chapter numbers with titles from book data.
 * @param {string} slug - Book slug
 * @param {number[]} chapterNums - Chapter numbers (-1 for appendices)
 * @returns {Array<{chapter: number, title: string|null, titleIs: string|null}>}
 */
function enrichChapters(slug, chapterNums) {
  const bookData = getBookData(slug);
  return chapterNums.map((ch) => {
    if (ch === -1) {
      return { chapter: ch, title: 'Appendices', titleIs: bookData?.appendixTitle || 'Viðaukar' };
    }
    const meta = bookData?.chapters?.find((c) => c.chapter === ch);
    return { chapter: ch, title: meta?.title || null, titleIs: meta?.titleIs || null };
  });
}

/**
 * Sort key for a module, as a numeric tuple compared lexicographically.
 *
 * `listChapterModules` returns modules in `fs.readdirSync` order, which is
 * arbitrary — chapter 1 of efnafraedi-2e listed 1.4, 1.6, 1.5. Editors pick
 * what to work on from this list, so it must read in document order.
 *
 * Order: chapter metadata, intro, then section number ascending (1.10 after
 * 1.9, not after 1.1). Anything without a parseable section sorts last.
 * @param {{moduleId: string, section?: string|null}} m
 * @returns {number[]}
 */
function moduleSortKey(m) {
  if (m.moduleId === 'chapter-metadata') return [-Infinity];
  const s = m.section;
  if (s === 'intro') return [-1];
  if (s === null || s === undefined || s === '') return [Infinity];
  const parts = String(s)
    .split('.')
    .map((p) => Number.parseInt(p, 10));
  return parts.some((n) => Number.isNaN(n)) ? [Infinity] : parts;
}

/**
 * Compare two numeric tuples lexicographically; shorter sorts first on a tie
 * (so "1" precedes "1.1").
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function compareKeys(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -Infinity;
    const y = b[i] ?? -Infinity;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Enrich module objects with human-readable titles from book data, then sort
 * them into document order. Mutates the array and its objects in place.
 * @param {string} slug - Book slug
 * @param {Array<{moduleId: string}>} modules - Module objects to enrich
 */
function enrichModules(slug, modules) {
  const bookData = getBookData(slug);
  // Sort even when the book has no data file — readdir order is never useful.
  if (!bookData) {
    modules.sort((a, b) => compareKeys(moduleSortKey(a), moduleSortKey(b)));
    return;
  }
  const moduleMap = {};
  for (const ch of bookData.chapters || []) {
    for (const mod of ch.modules || []) {
      moduleMap[mod.id] = mod;
    }
  }
  for (const ap of bookData.appendices || []) {
    moduleMap[ap.id] = ap;
  }
  for (const m of modules) {
    const meta = moduleMap[m.moduleId];
    if (meta) {
      m.title = meta.title || null;
      m.titleIs = meta.titleIs || null;
      m.section = meta.section || null;
    }
  }
  modules.sort((a, b) => compareKeys(moduleSortKey(a), moduleSortKey(b)));
}

module.exports = { getBookData, enrichChapters, enrichModules, moduleSortKey, compareKeys };
