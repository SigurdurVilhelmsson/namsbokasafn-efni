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

  // 1. Read all structure files, sorted by sectionOrder when present, falling back to alphabetical
  const structFileNames = fs.readdirSync(structDir).filter((f) => f.endsWith('-structure.json'));

  // Parse all structure files so we can sort by sectionOrder
  const structEntries = structFileNames.map((f) => ({
    filename: f,
    data: JSON.parse(fs.readFileSync(path.join(structDir, f), 'utf-8')),
  }));

  structEntries.sort((a, b) => {
    const aOrder = a.data.sectionOrder;
    const bOrder = b.data.sectionOrder;
    // If both have sectionOrder, sort numerically
    if (aOrder != null && bOrder != null) return aOrder - bOrder;
    // If only one has it, prefer the one with sectionOrder first
    if (aOrder != null) return -1;
    if (bOrder != null) return 1;
    // Fallback: alphabetical by filename
    return a.filename.localeCompare(b.filename);
  });

  // 2. Read all segment files for Icelandic titles
  // Try both 02-for-mt (old chapters) and 03-faithful (new chapters)
  const segments = new Map();
  const segDirs = [
    segDir, // 02-for-mt (chapters 1-5)
    path.join(REPO_ROOT, 'books', book, '03-faithful', `ch${chapterStr}`), // new chapters 9, 12, 13
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

  for (const entry of structEntries) {
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

  return result;
}
