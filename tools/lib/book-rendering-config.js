/**
 * book-rendering-config.js
 *
 * Per-book rendering configuration for cnxml-render.js.
 * Each book has different note types, end-of-chapter section structures, and
 * image naming conventions. Book-specific config lives in
 * books/<slug>/book-config.json (overrides only); the SHARED_* defaults below
 * are deep-merged under it. Unknown books fall back to SHARED-only (PR-A);
 * PR-B flips that to fail-loud.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve books/ relative to the repo root (this file is <root>/tools/lib/),
// NOT the process cwd. The editorial server starts with cwd=server/, so a
// cwd-relative 'books/…' path would miss every book-config.json → getBookRenderConfig
// throws → live preview 500s for every book. (Currently masked only because prod's
// systemd WorkingDirectory happens to be the repo root.)
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// =====================================================================
// SHARED CONFIG (all OpenStax books)
// =====================================================================

const SHARED_NOTE_LABELS = {
  'link-to-learning': 'Tengill til náms',
  interactive: 'Gagnvirkt',
  default: null,
};

const SHARED_TITLE_TRANSLATIONS = {
  'Answer:': 'Svar:',
  Answer: 'Svar',
  Solution: 'Lausn',
  'Check Your Learning': 'Prófaðu þekkingu þína',
  'CHECK YOUR LEARNING': 'Prófaðu þekkingu þína',
};

const SHARED_END_OF_CHAPTER = {
  summary: {
    titleIs: 'Samantekt',
    titleEn: 'Key Concepts and Summary',
    slug: 'summary',
    compiled: true, // Compiled from all modules
  },
  glossary: {
    titleIs: 'Lykilhugtök',
    titleEn: 'Key Terms',
    slug: 'key-terms',
    compiled: true,
  },
};

// =====================================================================
// BOOK CONFIG LOADER (data-file backed)
// =====================================================================

const _fileCache = new Map();

/**
 * Read books/<slug>/book-config.json (memoized). Returns null if absent;
 * throws on malformed JSON (a corrupt config is never acceptable).
 *
 * @param {string} bookSlug
 * @returns {object|null}
 */
function readBookConfigFile(bookSlug) {
  if (_fileCache.has(bookSlug)) return _fileCache.get(bookSlug);
  const p = path.join(REPO_ROOT, 'books', bookSlug, 'book-config.json');
  const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
  _fileCache.set(bookSlug, data);
  return data;
}

/**
 * Shallow-merge file overrides over the SHARED defaults. Reproduces the old
 * in-code `{ ...SHARED_X, ...bookSpecific }` spreads exactly.
 *
 * @param {object|null} file
 * @returns {object}
 */
// Keys the loader handles specially: `domain` belongs to bookToDomain (not
// render config); the other three are SHARED-merged below. Everything else in
// the file passes through losslessly (e.g. organic's `sectionExercises`).
const SHARED_BACKED_KEYS = new Set([
  'domain',
  'noteTypeLabels',
  'titleTranslations',
  'endOfChapterSections',
]);

function mergeWithShared(file) {
  const f = file || {};
  const passthrough = Object.fromEntries(
    Object.entries(f).filter(([k]) => !SHARED_BACKED_KEYS.has(k))
  );
  return {
    excludedSectionClasses: ['summary'],
    specialModules: {},
    ...passthrough,
    noteTypeLabels: { ...SHARED_NOTE_LABELS, ...(f.noteTypeLabels || {}) },
    titleTranslations: { ...SHARED_TITLE_TRANSLATIONS, ...(f.titleTranslations || {}) },
    endOfChapterSections: { ...SHARED_END_OF_CHAPTER, ...(f.endOfChapterSections || {}) },
  };
}

/**
 * Get rendering config for a book from its book-config.json, merged over the
 * SHARED defaults. PR-A: a missing file falls back to SHARED-only (warn).
 * PR-B flips this to fail-loud.
 *
 * @param {string} bookSlug - Book identifier (e.g., 'efnafraedi-2e')
 * @returns {object} Book rendering configuration
 */
function getBookRenderConfig(bookSlug) {
  const file = readBookConfigFile(bookSlug);
  if (!file) {
    throw new Error(
      `No book-config.json for book "${bookSlug}" (books/${bookSlug}/book-config.json). ` +
        'Every book must have an explicit render config before it can be rendered.'
    );
  }
  return mergeWithShared(file);
}

/**
 * Resolve a book's translation domain from book-config.json.
 * Falls back to 'science' when the book has no config / no domain.
 *
 * @param {string} bookSlug
 * @returns {string}
 */
function bookToDomain(bookSlug) {
  const file = readBookConfigFile(bookSlug);
  return (file && file.domain) || 'science';
}

/**
 * Generate a readable fallback label from a CSS class name.
 * E.g., 'clinical-focus' → 'Clinical Focus'
 *
 * @param {string} className - CSS class name
 * @returns {string} Human-readable label
 */
function generateFallbackLabel(className) {
  if (!className) return '';
  // Remove book prefix (e.g., "microbiology " from "microbiology clinical-focus")
  const words = className
    .replace(/^(chemistry|biology|microbiology)\s+/i, '')
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join(' ');
}

/**
 * Get the list of exercise-type section classes for a book.
 * These are end-of-chapter sections marked with exerciseType: true.
 *
 * @param {string} bookSlug - Book identifier
 * @returns {string[]} Array of exercise section class names
 */
function getExerciseSectionClasses(bookSlug) {
  const config = getBookRenderConfig(bookSlug);
  return Object.entries(config.endOfChapterSections)
    .filter(([, cfg]) => cfg.exerciseType)
    .map(([cls]) => cls);
}

export {
  getBookRenderConfig,
  bookToDomain,
  generateFallbackLabel,
  getExerciseSectionClasses,
  SHARED_NOTE_LABELS,
  SHARED_TITLE_TRANSLATIONS,
};
