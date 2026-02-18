/**
 * Split File Utilities
 *
 * Handles normalization of split files in the translation workflow.
 * Split files are created when source files exceed MT tool limitations.
 *
 * File naming convention:
 * - Regular: "1-2.is.md"
 * - Split parts: "1-2(a).is.md", "1-2(b).is.md", "1-2(c).is.md"
 *
 * The system should treat splits as transparent - users see base sections only.
 */

/**
 * Extract base section ID from filename, handling split patterns
 * @param {string} filename - The filename to parse
 * @returns {string} Base section ID
 *
 * @example
 * extractBaseSectionId("1-2.is.md") → "1-2"
 * extractBaseSectionId("1-2(a).is.md") → "1-2"
 * extractBaseSectionId("1-2(b).en.md") → "1-2"
 * extractBaseSectionId("intro.is.md") → "intro"
 * extractBaseSectionId("1-2-strings.is.md") → "1-2-strings"
 */
function extractBaseSectionId(filename) {
  // Remove .en.md or .is.md extension
  let base = filename.replace(/\.(en|is)\.md$/, '');
  // Remove split indicator (a), (b), (c), etc.
  base = base.replace(/\([a-z]\)$/, '');
  return base;
}

/**
 * Check if filename represents a split part
 * @param {string} filename - The filename to check
 * @returns {boolean} True if file is a split part
 *
 * @example
 * isSplitPart("1-2(a).is.md") → true
 * isSplitPart("1-2.is.md") → false
 */
function isSplitPart(filename) {
  return /\([a-z]\)\.(en|is)\.md$/.test(filename);
}

/**
 * Extract the part letter from a split filename
 * @param {string} filename - The filename to parse
 * @returns {string|null} Part letter (e.g., 'a', 'b') or null if not a split
 *
 * @example
 * extractPartLetter("1-2(a).is.md") → "a"
 * extractPartLetter("1-2.is.md") → null
 */
function extractPartLetter(filename) {
  const match = filename.match(/\(([a-z])\)\.(en|is)\.md$/);
  return match ? match[1] : null;
}

/**
 * Group files by their base section ID
 * @param {string[]} files - Array of filenames
 * @returns {Object.<string, string[]>} Map of section ID to array of filenames
 *
 * @example
 * groupFilesBySection(['1-2(a).is.md', '1-2(b).is.md', '1-3.is.md'])
 * → { '1-2': ['1-2(a).is.md', '1-2(b).is.md'], '1-3': ['1-3.is.md'] }
 */
function groupFilesBySection(files) {
  const groups = {};
  for (const file of files) {
    const section = extractBaseSectionId(file);
    if (!groups[section]) groups[section] = [];
    groups[section].push(file);
  }
  return groups;
}

/**
 * Check if a section has all its expected parts
 * @param {string[]} parts - Array of filenames for this section
 * @param {number} expectedPartCount - Number of expected parts (1 for non-split)
 * @returns {boolean} True if all parts are present
 *
 * @example
 * // Non-split section
 * isSectionComplete(['1-3.is.md'], 1) → true
 *
 * // Split section with all parts
 * isSectionComplete(['1-2(a).is.md', '1-2(b).is.md', '1-2(c).is.md'], 3) → true
 *
 * // Split section missing parts
 * isSectionComplete(['1-2(a).is.md', '1-2(b).is.md'], 3) → false
 */
function isSectionComplete(parts, expectedPartCount = 1) {
  if (!parts || parts.length === 0) {
    return false;
  }

  if (expectedPartCount === 1) {
    // Non-split: need at least one file (either regular or any split part counts)
    return parts.length >= 1;
  }

  // For splits, need all parts (a, b, c, etc.)
  const partLetters = parts
    .map((f) => extractPartLetter(f))
    .filter(Boolean)
    .sort();

  const expectedLetters = Array.from(
    { length: expectedPartCount },
    (_, i) => String.fromCharCode(97 + i) // 'a', 'b', 'c', ...
  );

  return JSON.stringify(partLetters) === JSON.stringify(expectedLetters);
}

/**
 * Check if ANY file exists for a section (including split parts)
 * Useful for checking if MT output exists regardless of split status
 * @param {string} directory - Directory to check
 * @param {string} sectionId - Base section ID
 * @param {string} extension - File extension (e.g., '.is.md')
 * @returns {boolean} True if any matching file exists
 */
function sectionHasAnyFile(directory, sectionId, extension) {
  const fs = require('fs');

  if (!fs.existsSync(directory)) {
    return false;
  }

  const files = fs.readdirSync(directory);
  return files.some((f) => {
    if (!f.endsWith(extension)) return false;
    const base = extractBaseSectionId(f);
    return base === sectionId;
  });
}

/**
 * Get all files for a section from a directory (including split parts)
 * @param {string} directory - Directory to search
 * @param {string} sectionId - Base section ID
 * @param {string} extension - File extension (e.g., '.is.md')
 * @returns {string[]} Array of matching filenames
 */
function getSectionFiles(directory, sectionId, extension) {
  const fs = require('fs');

  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = fs.readdirSync(directory);
  return files.filter((f) => {
    if (!f.endsWith(extension)) return false;
    const base = extractBaseSectionId(f);
    return base === sectionId;
  });
}

/**
 * Count unique sections from a list of files (splits collapsed)
 * @param {string[]} files - Array of filenames
 * @returns {number} Count of unique base sections
 *
 * @example
 * countUniqueSections(['1-2(a).is.md', '1-2(b).is.md', '1-3.is.md']) → 2
 */
function countUniqueSections(files) {
  const sections = new Set();
  for (const file of files) {
    sections.add(extractBaseSectionId(file));
  }
  return sections.size;
}

/**
 * Get unique base section IDs from a list of files
 * @param {string[]} files - Array of filenames
 * @returns {string[]} Array of unique base section IDs
 */
function getUniqueSections(files) {
  const sections = new Set();
  for (const file of files) {
    sections.add(extractBaseSectionId(file));
  }
  return Array.from(sections);
}

module.exports = {
  extractBaseSectionId,
  isSplitPart,
  extractPartLetter,
  groupFilesBySection,
  isSectionComplete,
  sectionHasAnyFile,
  getSectionFiles,
  countUniqueSections,
  getUniqueSections,
};
