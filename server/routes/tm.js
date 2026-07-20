/**
 * TM export route (item 21 PR-A). Regenerates the human-verified translation
 * memory on demand via the shared boundary lib and streams tmx|csv|json.
 * requireAuth only — reading a derived asset (mirrors glossary /export).
 */
const express = require('express');
const router = express.Router();

const log = require('../lib/logger');
const { requireAuth } = require('../middleware/requireAuth');
const { VALID_BOOKS } = require('../config');
const { MAX_CHAPTERS } = require('../constants');
const { generateTm, serializeTm, FORMATS } = require('../../tools/lib/tm-export.cjs');
const { getBookLicence } = require('../../tools/lib/book-licences.cjs');

const CONTENT_TYPE = {
  tmx: 'application/xml; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
};

router.get('/export', requireAuth, (req, res) => {
  const book = req.query.book;
  const format = req.query.format || 'tmx';
  const chapterRaw = req.query.chapter;

  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: 'Invalid book', message: `Unknown book: ${book}` });
  }
  if (!FORMATS.includes(format)) {
    return res
      .status(400)
      .json({ error: 'Invalid format', message: `format must be one of: ${FORMATS.join(', ')}` });
  }

  let chapter = null;
  if (chapterRaw !== undefined && chapterRaw !== '') {
    const n = Number(chapterRaw);
    if (!/^\d+$/.test(String(chapterRaw)) || !Number.isInteger(n) || n < 1 || n > MAX_CHAPTERS) {
      return res.status(400).json({ error: 'Invalid chapter', message: 'Chapter must be 1–99' });
    }
    chapter = n;
  }

  try {
    const { tus } = generateTm(book, { chapter });
    if (!tus.length) {
      return res.status(404).json({
        error: 'No translation memory',
        message: `No reviewed (faithful) content for ${book}${chapter ? ` chapter ${chapter}` : ''}.`,
      });
    }
    const { licence, obtained } = getBookLicence(book); // fail-loud; VALID_BOOKS all have rows
    const body = serializeTm(tus, format, { date: new Date(), book, licence, obtained });
    const fname = `${book}${chapter ? `-K${chapter}` : ''}-tm.${format}`;
    res.setHeader('Content-Type', CONTENT_TYPE[format]);
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    return res.send(body);
  } catch (err) {
    log.error({ err, book }, 'TM export failed');
    return res.status(500).json({ error: 'TM export failed', message: err.message });
  }
});

module.exports = router;
