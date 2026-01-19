/**
 * Books Routes
 *
 * Provides book and chapter metadata for the workflow UI.
 * Also handles downloading content for the MT workflow.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const { requireAuth } = require('../middleware/requireAuth');

// Load book data
const dataDir = path.join(__dirname, '..', 'data');
const booksDir = path.join(__dirname, '..', '..', 'books');

// Erlendur MT character limits
const ERLENDUR_SOFT_LIMIT = 18000;

/**
 * Parse YAML frontmatter from markdown content
 */
function parseMarkdownFrontmatter(content) {
  const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!yamlMatch) return null;

  const frontmatter = yamlMatch[1];
  const result = {};
  const lines = frontmatter.split('\n');

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
    if (match) {
      result[match[1]] = match[2];
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Generate Erlendur-format header for a split part
 */
function makeErlendurHeader(metadata, partLetter) {
  const title = metadata.title || 'Unknown';
  const section = metadata.section || 'unknown';
  const module = metadata.module || 'unknown';
  const lang = metadata.lang || 'en';

  if (partLetter) {
    return `## titill: „${title}" kafli: „${section}" eining: „${module}" tungumál: „${lang}" hluti: „${partLetter}"\n\n`;
  }
  return `## titill: „${title}" kafli: „${section}" eining: „${module}" tungumál: „${lang}"\n\n`;
}

/**
 * Split content at paragraph boundaries to stay under character limit
 * Returns array of { content, part } objects
 */
function splitContentForErlendur(fullContent) {
  // Parse metadata
  const metadata = parseMarkdownFrontmatter(fullContent) || {};

  // Remove frontmatter from content
  let bodyContent = fullContent;
  const yamlMatch = fullContent.match(/^---\s*\n[\s\S]*?\n---\s*\n/);
  if (yamlMatch) {
    bodyContent = fullContent.substring(yamlMatch[0].length);
  }

  // Also remove Erlendur-style headers if present
  const erlendurMatch = bodyContent.match(/^##\s*titill:.*?\n\n/);
  if (erlendurMatch) {
    bodyContent = bodyContent.substring(erlendurMatch[0].length);
  }

  bodyContent = bodyContent.trim();

  // Check if splitting is needed
  if (bodyContent.length <= ERLENDUR_SOFT_LIMIT) {
    const header = makeErlendurHeader(metadata, null);
    return [{ content: header + bodyContent, part: null }];
  }

  // Split at paragraph boundaries
  const parts = [];
  const paragraphs = bodyContent.split(/\n\n+/);
  let currentPart = [];
  let currentLength = 0;
  let partIndex = 0;

  for (const para of paragraphs) {
    const paraLength = para.length + 2; // +2 for \n\n

    // Check if adding this paragraph would exceed the soft limit
    if (currentLength + paraLength > ERLENDUR_SOFT_LIMIT && currentPart.length > 0) {
      // Save current part
      const partLetter = String.fromCharCode(97 + partIndex); // a, b, c, ...
      const header = makeErlendurHeader(metadata, partLetter);
      parts.push({
        content: header + currentPart.join('\n\n'),
        part: partLetter
      });

      // Start new part
      currentPart = [para];
      currentLength = paraLength;
      partIndex++;
    } else {
      currentPart.push(para);
      currentLength += paraLength;
    }
  }

  // Add final part
  if (currentPart.length > 0) {
    const partLetter = String.fromCharCode(97 + partIndex);
    const header = makeErlendurHeader(metadata, partLetter);
    parts.push({
      content: header + currentPart.join('\n\n'),
      part: partLetter
    });
  }

  return parts;
}

function loadBookData(bookId) {
  const filePath = path.join(dataDir, `${bookId}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null;
}

/**
 * GET /api/books
 * List available books
 */
router.get('/', (req, res) => {
  const books = [];

  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
      books.push({
        id: data.book,
        title: data.title,
        titleIs: data.titleIs,
        chapterCount: data.chapters.length
      });
    }
  }

  res.json({ books });
});

/**
 * GET /api/books/:bookId
 * Get book details including chapters
 */
router.get('/:bookId', (req, res) => {
  const { bookId } = req.params;
  const book = loadBookData(bookId);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  res.json(book);
});

/**
 * GET /api/books/:bookId/chapters/:chapter
 * Get chapter details including all modules
 */
router.get('/:bookId/chapters/:chapter', (req, res) => {
  const { bookId, chapter } = req.params;
  const book = loadBookData(bookId);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const chapterData = book.chapters.find(c => c.chapter === parseInt(chapter, 10));

  if (!chapterData) {
    return res.status(404).json({ error: 'Chapter not found' });
  }

  res.json({
    book: book.book,
    bookTitle: book.titleIs || book.title,
    ...chapterData
  });
});

/**
 * GET /api/books/:slug/download
 * Download book content as ZIP
 *
 * Query params:
 *   - chapter: Optional chapter number (downloads single chapter if provided)
 *   - type: Content type to download
 *     - 'en-md': English markdown from 02-for-mt/ (default)
 *     - 'is-md': Icelandic markdown from 02-mt-output/
 *     - 'faithful': Reviewed IS markdown from 03-faithful/
 */
router.get('/:slug/download', requireAuth, async (req, res) => {
  const { slug } = req.params;
  const { chapter, type = 'en-md' } = req.query;

  // Determine source directory based on type
  const typeDirs = {
    'en-md': '02-for-mt',
    'is-md': '02-mt-output',
    'faithful': '03-faithful'
  };

  const sourceType = typeDirs[type];
  if (!sourceType) {
    return res.status(400).json({
      error: 'Invalid type',
      message: 'Type must be one of: en-md, is-md, faithful'
    });
  }

  const bookDir = path.join(booksDir, slug);
  const sourceDir = path.join(bookDir, sourceType);

  if (!fs.existsSync(sourceDir)) {
    return res.status(404).json({
      error: 'Not found',
      message: `Source directory not found: ${sourceType}`
    });
  }

  try {
    // Build ZIP filename
    let zipName;
    if (chapter) {
      const chapterDir = 'ch' + String(chapter).padStart(2, '0');
      zipName = `${slug}-K${chapter}-${type}.zip`;

      // Check chapter directory exists
      const chapterPath = path.join(sourceDir, chapterDir);
      if (!fs.existsSync(chapterPath)) {
        return res.status(404).json({
          error: 'Not found',
          message: `Chapter ${chapter} not found`
        });
      }
    } else {
      zipName = `${slug}-${type}.zip`;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    // Helper function to add only .md files from a directory, splitting large files
    function addMdFilesFromDir(dirPath, archivePath) {
      if (!fs.existsSync(dirPath)) return;
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile() && file.endsWith('.md')) {
          const content = fs.readFileSync(filePath, 'utf8');

          // Check if file needs splitting
          if (content.length > ERLENDUR_SOFT_LIMIT) {
            // Split the file and add each part
            const baseName = file.replace('.en.md', '').replace('.is.md', '');
            const extension = file.endsWith('.en.md') ? '.en.md' : '.is.md';
            const parts = splitContentForErlendur(content);

            for (const { content: partContent, part } of parts) {
              const partName = part ? `${baseName}(${part})${extension}` : file;
              archive.append(partContent, { name: path.join(archivePath, partName) });
            }
          } else {
            // Add file as-is
            archive.file(filePath, { name: path.join(archivePath, file) });
          }
        }
      }
    }

    if (chapter) {
      // Download single chapter
      const chapterDir = 'ch' + String(chapter).padStart(2, '0');
      const chapterPath = path.join(sourceDir, chapterDir);
      addMdFilesFromDir(chapterPath, chapterDir);
    } else {
      // Download all chapters
      const entries = fs.readdirSync(sourceDir);
      for (const entry of entries) {
        const entryPath = path.join(sourceDir, entry);
        const stat = fs.statSync(entryPath);
        if (stat.isDirectory() && entry.startsWith('ch')) {
          addMdFilesFromDir(entryPath, entry);
        }
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('Download error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Download failed',
        message: err.message
      });
    }
  }
});

module.exports = router;
