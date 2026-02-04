/**
 * module-sections.js
 *
 * Shared helper that derives module metadata (section numbers, titles, slugs)
 * from structure files and segment files, replacing hardcoded MODULE_SECTIONS
 * constants in pipeline tools.
 */

import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

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
  return transliterateIcelandic(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Parse segments from a markdown segments file.
 * @param {string} content - Segments markdown content
 * @returns {Map<string, string>} Map of segment ID to text
 */
function parseSegments(content) {
  const segments = new Map();
  const pattern = /<!-- SEG:([^\s]+) -->[ \t]*\n?([\s\S]*?)(?=<!-- SEG:|$)/g;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const id = match[1];
    const text = match[2].trim();
    segments.set(id, text);
  }

  return segments;
}

/**
 * Build module sections map from structure + segment files.
 *
 * @param {string} book - Book slug (e.g. 'efnafraedi')
 * @param {number|string} chapter - Chapter number
 * @returns {Object} moduleId → { section, titleEn, titleIs, slug }
 */
export function buildModuleSections(book, chapter) {
  const chapterStr = String(chapter).padStart(2, '0');
  const structDir = path.join(REPO_ROOT, 'books', book, '02-structure', `ch${chapterStr}`);
  const segDir = path.join(REPO_ROOT, 'books', book, '02-for-mt', `ch${chapterStr}`);

  // 1. Read all structure files, sorted alphabetically by filename (= moduleId order)
  const structFiles = fs
    .readdirSync(structDir)
    .filter((f) => f.endsWith('-structure.json'))
    .sort();

  // 2. Read all segment files for Icelandic titles
  const segments = new Map();
  const segFiles = fs.readdirSync(segDir).filter((f) => f.endsWith('-segments.is.md'));
  for (const sf of segFiles) {
    const content = fs.readFileSync(path.join(segDir, sf), 'utf-8');
    const parsed = parseSegments(content);
    for (const [k, v] of parsed) {
      segments.set(k, v);
    }
  }

  // 3. Build map: intro gets section '0', non-intro modules get sequential '1', '2', ...
  const result = {};
  let sectionCounter = 1;

  for (const file of structFiles) {
    const structure = JSON.parse(fs.readFileSync(path.join(structDir, file), 'utf-8'));
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

  return result;
}
