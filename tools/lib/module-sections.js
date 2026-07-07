/**
 * module-sections.js
 *
 * Shared helper that derives module metadata (section numbers, titles, slugs)
 * from structure files and segment files, replacing hardcoded MODULE_SECTIONS
 * constants in pipeline tools.
 */

import fs from 'fs';
import path from 'path';
import { parseSegmentsMap } from './seg-markers.cjs';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

/**
 * Legacy structure-entry comparator: sectionOrder ascending (nulls last),
 * then filename. Retained for the fallback path (chapters/books not covered
 * by collection-order.json) and for ordering unlisted stragglers.
 * @param {{filename:string,data:{sectionOrder:?number}}} a
 * @param {{filename:string,data:{sectionOrder:?number}}} b
 * @returns {number}
 */
export function legacyStructComparator(a, b) {
  const aOrder = a.data.sectionOrder;
  const bOrder = b.data.sectionOrder;
  if (aOrder != null && bOrder != null) return aOrder - bOrder;
  if (aOrder != null) return -1;
  if (bOrder != null) return 1;
  return a.filename.localeCompare(b.filename);
}

/**
 * Resolve a chapter to its authoritative ordered module-id list from a parsed
 * collection-order.json object. Numeric chapters use chapters[].modules;
 * 'appendices' uses appendixModules; everything else (chapter 0 / preface,
 * unknown chapter, or a null object) returns null → caller uses the fallback.
 * @param {object|null} co - parsed collection-order.json (or null)
 * @param {number|string} chapter
 * @returns {string[]|null}
 */
export function authoritativeOrder(co, chapter) {
  if (!co) return null;
  if (chapter === 'appendices') return co.appendixModules ?? null;
  const chapterNum = Number(chapter);
  if (!Number.isInteger(chapterNum)) return null;
  const entry = co.chapters?.find((c) => Number(c.chapter) === chapterNum);
  return entry?.modules ?? null;
}

/**
 * Order structure entries by their moduleId's position in an authoritative
 * id list. Entries whose id is absent ("stragglers") are appended after all
 * listed ones (ordered by legacyStructComparator) and a warning is emitted —
 * this is a data-drift signal, not a fatal error.
 * @param {Array<{filename:string,data:{moduleId:string,sectionOrder:?number}}>} structEntries
 * @param {string[]} authIds - authoritative ordered module ids
 * @param {{book:string,chapter:(number|string)}} ctx
 * @returns {Array} entries in authoritative order (new array)
 */
export function sortByAuthoritativeOrder(structEntries, authIds, { book, chapter }) {
  const indexOf = new Map(authIds.map((id, i) => [id, i]));
  const listed = [];
  const stragglers = [];
  for (const entry of structEntries) {
    if (indexOf.has(entry.data.moduleId)) listed.push(entry);
    else stragglers.push(entry);
  }
  listed.sort((a, b) => indexOf.get(a.data.moduleId) - indexOf.get(b.data.moduleId));
  if (stragglers.length > 0) {
    stragglers.sort(legacyStructComparator);
    console.warn(
      `[module-sections] ${book} chapter ${chapter}: ${stragglers.length} module(s) not in collection-order.json — ` +
        `placing after listed modules: ${stragglers.map((e) => e.data.moduleId).join(', ')}`
    );
  }
  return [...listed, ...stragglers];
}

const _collectionOrderCache = new Map();

/**
 * Load and memoize a book's collection-order.json (the authoritative module
 * order, generated at intake by download-source.js). Returns null if the file
 * is absent — a book without one uses the legacy comparator.
 * @param {string} book
 * @returns {object|null}
 */
export function loadCollectionOrder(book) {
  if (_collectionOrderCache.has(book)) return _collectionOrderCache.get(book);
  const p = path.join(REPO_ROOT, 'books', book, '01-source', 'collection-order.json');
  const co = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
  _collectionOrderCache.set(book, co);
  return co;
}

/**
 * Format chapter for use in directory paths.
 * @param {number|string} chapter - Chapter number or "appendices"
 * @returns {string} Formatted chapter string (e.g., "ch01", "appendices")
 */
function formatChapterDir(chapter) {
  if (chapter === 'appendices') {
    return 'appendices';
  }
  return `ch${String(chapter).padStart(2, '0')}`;
}

const ICELANDIC_MAP = {
  ð: 'd',
  Ð: 'D',
  þ: 'th',
  Þ: 'Th',
  æ: 'ae',
  Æ: 'Ae',
  ö: 'o',
  Ö: 'O',
  á: 'a',
  Á: 'A',
  é: 'e',
  É: 'E',
  í: 'i',
  Í: 'I',
  ó: 'o',
  Ó: 'O',
  ú: 'u',
  Ú: 'U',
  ý: 'y',
  Ý: 'Y',
};

/**
 * Transliterate Icelandic characters to ASCII for URL-friendly slugs.
 * @param {string} text
 * @returns {string}
 */
export function transliterateIcelandic(text) {
  return text.replace(/[ðÐþÞæÆöÖáÁéÉíÍóÓúÚýÝ]/g, (c) => ICELANDIC_MAP[c] || c);
}

/**
 * Generate URL-friendly slug from title.
 * @param {string} title
 * @returns {string}
 */
export function slugify(title) {
  const base = transliterateIcelandic(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (base.length <= 50) return base;
  const cut = base.substring(0, 50);
  // If the next char is the word separator, the 50-char cut already lands on a
  // word boundary — keep it (avoids needlessly shortening slugs whose last word
  // happens to end exactly at 50). Otherwise the last word is split mid-way, so
  // drop back to the previous boundary so slugs never end mid-word like
  // "...samhverfa-i-kr" (handoff #4). Keep ≥20 chars before a hard fallback.
  if (base[50] === '-') return cut;
  const lastDash = cut.lastIndexOf('-');
  return (lastDash >= 20 ? cut.substring(0, lastDash) : cut).replace(/-$/, '');
}

/**
 * Parse segments from a markdown segments file.
 * @param {string} content - Segments markdown content
 * @returns {Map<string, string>} Map of segment ID to text
 */
function parseSegments(content) {
  return parseSegmentsMap(content, { duplicates: 'last' });
}

/**
 * Build module sections map from structure + segment files.
 *
 * @param {string} book - Book slug (e.g. 'efnafraedi')
 * @param {number|string} chapter - Chapter number
 * @returns {Object} moduleId → { section, titleEn, titleIs, slug }
 */
export function buildModuleSections(book, chapter) {
  const chapterDir = formatChapterDir(chapter);
  const structDir = path.join(REPO_ROOT, 'books', book, '02-structure', chapterDir);
  const segDir = path.join(REPO_ROOT, 'books', book, '02-for-mt', chapterDir);

  // 1. Read all structure files, sorted by sectionOrder when present, falling back to alphabetical
  const structFileNames = fs.readdirSync(structDir).filter((f) => f.endsWith('-structure.json'));

  // Parse all structure files so we can sort by sectionOrder
  const structEntries = structFileNames.map((f) => ({
    filename: f,
    data: JSON.parse(fs.readFileSync(path.join(structDir, f), 'utf-8')),
  }));

  // Order by the authoritative collection-order.json when it covers this
  // chapter/appendix; otherwise fall back to the legacy sectionOrder sort.
  const authIds = authoritativeOrder(loadCollectionOrder(book), chapter);
  const orderedEntries = authIds
    ? sortByAuthoritativeOrder(structEntries, authIds, { book, chapter })
    : [...structEntries].sort(legacyStructComparator);

  // 2. Read all segment files for Icelandic titles
  // Try both 02-for-mt (old chapters) and 03-faithful-translation (new chapters)
  const segments = new Map();
  const segDirs = [
    segDir, // 02-for-mt (chapters 1-5)
    path.join(REPO_ROOT, 'books', book, '03-faithful-translation', chapterDir),
    path.join(REPO_ROOT, 'books', book, '02-mt-output', chapterDir),
  ];

  for (const dir of segDirs) {
    if (!fs.existsSync(dir)) continue;

    const segFiles = fs.readdirSync(dir).filter((f) => f.endsWith('-segments.is.md'));
    for (const sf of segFiles) {
      const content = fs.readFileSync(path.join(dir, sf), 'utf-8');
      const parsed = parseSegments(content);
      for (const [k, v] of parsed) {
        // Only set if not already found (02-for-mt takes precedence)
        if (!segments.has(k)) {
          segments.set(k, v);
        }
      }
    }
  }

  // 3. Build map: intro gets section '0', non-intro modules get sequential '1', '2', ...
  const result = {};
  let sectionCounter = 1;

  for (const entry of orderedEntries) {
    const structure = entry.data;
    const moduleId = structure.moduleId;
    const isIntro = structure.documentClass === 'introduction';
    const titleEn = structure.title.text;
    const titleSegId = structure.title.segmentId;
    const titleIs = segments.get(titleSegId) || titleEn;

    const sectionNum = isIntro ? '0' : String(sectionCounter++);

    result[moduleId] = {
      section: sectionNum,
      titleEn,
      titleIs,
      slug: isIntro ? 'introduction' : slugify(titleIs),
    };
  }

  // 4. Look up translated chapter title from chapter-metadata segments
  const chapterTitleSegId = `chapter:title:${chapterDir}`;
  const chapterTitleIs = segments.get(chapterTitleSegId) || null;
  result._chapterTitle = chapterTitleIs;

  return result;
}

/**
 * Resolve a CNXML module id to its rendered HTML filename within a chapter.
 *
 * @param {string} modId - CNXML module id (e.g. "m68724")
 * @param {number|string} chapter - Chapter number
 * @param {Object} moduleSections - Result of buildModuleSections()
 * @returns {string|null} Filename (e.g. "5-1-heat-and-temperature.html") or null
 *   if the module is not registered for this chapter.
 */
export function resolveModuleHref(modId, chapter, moduleSections) {
  const info = moduleSections?.[modId];
  if (!info) return null;
  return `${chapter}-${info.section}-${info.slug}.html`;
}
