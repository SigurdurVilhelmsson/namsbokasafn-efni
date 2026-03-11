/**
 * glossary-extract.js
 *
 * Extracts glossary terms from CNXML files (both source EN and translated IS).
 * Used by tools that need to compare or look up glossary entries across languages.
 */

import fs from 'fs';
import path from 'path';

const BOOKS_DIR = 'books';

// ============================================================================
// Shared CNXML Glossary Parsing
// ============================================================================

/**
 * Extract raw glossary entries from a single CNXML file.
 * Returns array of { term, definition }.
 */
function extractGlossaryFromCnxml(cnxmlPath) {
  if (!fs.existsSync(cnxmlPath)) {
    return [];
  }

  const content = fs.readFileSync(cnxmlPath, 'utf8');

  const glossaryMatch = content.match(/<glossary>([\s\S]*?)<\/glossary>/);
  if (!glossaryMatch) {
    return [];
  }

  const glossaryContent = glossaryMatch[1];
  const terms = [];

  const definitionPattern = /<definition\s+id="([^"]+)">([\s\S]*?)<\/definition>/g;
  let defMatch;

  while ((defMatch = definitionPattern.exec(glossaryContent)) !== null) {
    const defContent = defMatch[2];

    const termMatch = defContent.match(/<term>([^<]+)<\/term>/);
    const term = termMatch ? termMatch[1].replace(/\s+/g, ' ').trim() : null;

    const meaningMatch = defContent.match(/<meaning[^>]*>([\s\S]*?)<\/meaning>/);
    let definition = null;

    if (meaningMatch) {
      definition = meaningMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (term && definition) {
      terms.push({ term, definition });
    }
  }

  return terms;
}

/**
 * Find chapter directories matching ch{NN} pattern in a base directory.
 * Returns sorted array of { chapterNum, dirPath }.
 */
function findChapterDirs(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  return fs
    .readdirSync(baseDir)
    .filter((name) => name.startsWith('ch'))
    .map((name) => ({
      chapterNum: parseInt(name.replace('ch', ''), 10),
      dirPath: path.join(baseDir, name),
    }))
    .filter(({ chapterNum }) => !isNaN(chapterNum))
    .sort((a, b) => a.chapterNum - b.chapterNum);
}

/**
 * Find CNXML files in a directory.
 * Returns array of { moduleId, filePath }.
 */
function findCnxmlFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath)
    .filter((name) => name.endsWith('.cnxml'))
    .map((name) => ({
      moduleId: name.replace('.cnxml', ''),
      filePath: path.join(dirPath, name),
    }))
    .sort((a, b) => a.moduleId.localeCompare(b.moduleId));
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Extract English glossary terms from source CNXML files.
 *
 * @param {string} bookSlug - Book identifier (e.g., 'efnafraedi-2e')
 * @returns {Map<string, { term: string, definition: string, chapter: number, moduleId: string }>}
 *   Map keyed by lowercased EN term.
 */
export function extractEnglishGlossary(bookSlug) {
  const result = new Map();
  const sourceDir = path.join(BOOKS_DIR, bookSlug, '01-source');
  const chapterDirs = findChapterDirs(sourceDir);

  for (const { chapterNum, dirPath } of chapterDirs) {
    const cnxmlFiles = findCnxmlFiles(dirPath);

    for (const { moduleId, filePath } of cnxmlFiles) {
      const entries = extractGlossaryFromCnxml(filePath);

      for (const { term, definition } of entries) {
        const key = term.toLowerCase();
        if (!result.has(key)) {
          result.set(key, { term, definition, chapter: chapterNum, moduleId });
        }
      }
    }
  }

  return result;
}

/**
 * Extract translated (Icelandic) glossary terms from translated CNXML files.
 *
 * Translated terms have the format "atóm (e. atom)" — the Icelandic term
 * followed by the English equivalent in parentheses. Uses lastIndexOf for
 * the marker to handle nested parentheses.
 *
 * @param {string} bookSlug - Book identifier (e.g., 'efnafraedi-2e')
 * @param {string} track - Translation track (e.g., 'mt-preview', 'faithful')
 * @returns {Map<string, { termIs: string, definitionIs: string, chapter: number, moduleId: string }>}
 *   Map keyed by lowercased EN term extracted from the translated term string.
 */
export function extractTranslatedGlossary(bookSlug, track) {
  const result = new Map();
  const translatedDir = path.join(BOOKS_DIR, bookSlug, '03-translated', track);
  const chapterDirs = findChapterDirs(translatedDir);

  for (const { chapterNum, dirPath } of chapterDirs) {
    const cnxmlFiles = findCnxmlFiles(dirPath);

    for (const { moduleId, filePath } of cnxmlFiles) {
      const entries = extractGlossaryFromCnxml(filePath);

      for (const { term: fullTerm, definition } of entries) {
        const marker = ' (e. ';
        const idx = fullTerm.lastIndexOf(marker);

        if (idx === -1) {
          // No English equivalent found — skip, cannot key by EN term
          continue;
        }

        const termIs = fullTerm.substring(0, idx).trim();
        let termEn = fullTerm.substring(idx + marker.length);
        if (termEn.endsWith(')')) {
          termEn = termEn.slice(0, -1);
        }
        termEn = termEn.trim();

        if (!termEn) {
          continue;
        }

        const key = termEn.toLowerCase();
        if (!result.has(key)) {
          result.set(key, { termIs, definitionIs: definition, chapter: chapterNum, moduleId });
        }
      }
    }
  }

  return result;
}
