/**
 * Shared Parameter Validation Middleware
 *
 * Reusable validation functions for common route parameters
 * used across segment-editor and localization-editor routes.
 */

const { VALID_BOOKS } = require('../config');

/**
 * Validate :book and :chapter route parameters.
 * Sets req.chapterNum to the parsed integer chapter number.
 */
function validateBookChapter(req, res, next) {
  const { book, chapter } = req.params;

  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: `Invalid book: ${book}` });
  }

  const chapterNum = parseInt(chapter, 10);
  if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > 50) {
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
