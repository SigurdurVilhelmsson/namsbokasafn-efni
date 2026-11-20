/**
 * Book glossary routes (design §5.2): the page where a book's head editors see and change the
 * book's glossary layer. GET routes here; mutations are POST only (CLAUDE.md § Auth).
 *
 * The routes are the boundary: they validate every input before the service sees it.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { requireHeadEditor } = require('../middleware/requireRole');
const { displayNameFor, historyFor } = require('../lib/bookGlossaryLayer');
const { getDb } = require('../services/bookGlossaryDb');
const service = require('../services/bookGlossaryService');

const MAX_ENGLISH = 200;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

const invalid = (res, field) => res.status(400).json({ error: `Ógilt gildi: ${field}` });

/** A trimmed headword, or null when it is missing, too long or holds a control character. */
function cleanEnglish(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > MAX_ENGLISH || CONTROL_CHARS.test(s)) return null;
  return s;
}

// An admin passes the head-editor guard for any slug, so the book is checked against the registry too,
// after the guard so that an anonymous caller learns nothing about which slugs exist.
function registeredBook(req, res, next) {
  if (!service.isRegisteredBook(getDb(), req.params.book)) return invalid(res, 'book');
  next();
}

const guard = [requireAuth, requireHeadEditor('book'), registeredBook];

router.get('/:book', ...guard, (req, res) => {
  const db = getDb();
  const slug = req.params.book;
  res.json({ book: slug, ...service.listLayer(db, slug), hold: service.exportState(slug) });
});

router.get('/:book/lookup', ...guard, (req, res) => {
  const english = cleanEnglish(req.query.english);
  if (!english) return invalid(res, 'english');
  res.json(service.lookup(getDb(), req.params.book, english));
});

router.get('/:book/history', ...guard, (req, res) => {
  const english = cleanEnglish(req.query.english);
  if (!english) return invalid(res, 'english');
  const db = getDb();
  const history = historyFor(db, req.params.book, english).map((h) => ({
    ...h,
    by: displayNameFor(db, h.by),
  }));
  res.json({ history });
});

module.exports = router;
