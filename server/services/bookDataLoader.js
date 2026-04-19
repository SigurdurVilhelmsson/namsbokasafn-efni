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
 * Enrich module objects with human-readable titles from book data.
 * Mutates the module objects in place.
 * @param {string} slug - Book slug
 * @param {Array<{moduleId: string}>} modules - Module objects to enrich
 */
function enrichModules(slug, modules) {
  const bookData = getBookData(slug);
  if (!bookData) return;
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
}

module.exports = { getBookData, enrichChapters, enrichModules };
