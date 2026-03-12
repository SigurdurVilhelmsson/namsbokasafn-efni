/**
 * Shared Parameter Validation Middleware
 *
 * Reusable validation functions for common route parameters
 * used across segment-editor and localization-editor routes.
 */

const { VALID_BOOKS } = require('../config');
const { MAX_CHAPTERS } = require('../constants');

/**
 * Validate :book and :chapter route parameters.
 * Sets req.chapterNum to the parsed integer chapter number.
 */
function validateBookChapter(req, res, next) {
  const { book, chapter } = req.params;

  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: `Invalid book: ${book}` });
  }

  // Allow 'appendices' as a special chapter value (stored as chapter_num=-1)
  if (chapter === 'appendices') {
    req.chapterNum = -1;
    return next();
  }

  const chapterNum = parseInt(chapter, 10);
  if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > MAX_CHAPTERS) {
    return res.status(400).json({ error: `Invalid chapter: ${chapter}` });
  }

  req.chapterNum = chapterNum;
  next();
}

/**
 * Validate :moduleId route parameter.
 * Expects format: m followed by exactly 5 digits (e.g., m68663).
 */
function validateModule(req, res, next) {
  const { moduleId } = req.params;
  if (!moduleId || !/^m\d{5}$/.test(moduleId)) {
    return res.status(400).json({ error: `Invalid module ID: ${moduleId}` });
  }
  next();
}

module.exports = {
  validateBookChapter,
  validateModule,
};
