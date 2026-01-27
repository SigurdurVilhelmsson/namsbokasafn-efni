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
const multer = require('multer');

const { requireAuth, optionalAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');
const chapterFilesService = require('../services/chapterFilesService');

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '..', '..', 'pipeline-output', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Only accept .md files
    if (file.originalname.endsWith('.md')) {
      cb(null, true);
    } else {
      cb(new Error('Only .md files are allowed'), false);
    }
  }
});

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
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
        // Only include files that have book structure (book id and chapters array)
        if (data.book && Array.isArray(data.chapters)) {
          books.push({
            id: data.book,
            title: data.title,
            titleIs: data.titleIs,
            chapterCount: data.chapters.length
          });
        }
      } catch (err) {
        // Skip files that can't be parsed or don't have expected structure
        console.warn(`Skipping ${file}: ${err.message}`);
      }
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
 * GET /api/books/:bookId/chapters/:chapter/files
 * List generated files for a chapter
 */
router.get('/:bookId/chapters/:chapter/files', requireAuth, (req, res) => {
  const { bookId, chapter } = req.params;
  const chapterNum = parseInt(chapter, 10);

  try {
    // Get files from database
    const dbFiles = chapterFilesService.getChapterFiles(bookId, chapterNum);

    // Also get section-level files from disk
    const sectionFiles = chapterFilesService.getChapterSectionFiles(bookId, chapterNum);

    // Get generation history
    const history = chapterFilesService.getGenerationHistory(bookId, chapterNum, 5);

    res.json({
      bookId,
      chapter: chapterNum,
      hasRequiredFiles: chapterFilesService.hasRequiredFiles(bookId, chapterNum),
      files: dbFiles,
      sections: sectionFiles,
      recentHistory: history
    });
  } catch (err) {
    console.error('Error listing chapter files:', err);
    res.status(500).json({
      error: 'Failed to list chapter files',
      message: err.message
    });
  }
});

/**
 * POST /api/books/:bookId/chapters/:chapter/files/scan
 * Scan existing files on disk and register them in database
 */
router.post('/:bookId/chapters/:chapter/files/scan', requireAuth, (req, res) => {
  const { bookId, chapter } = req.params;
  const chapterNum = parseInt(chapter, 10);
  const userId = req.user?.username || 'system';

  try {
    const result = chapterFilesService.scanAndRegisterExistingFiles(bookId, chapterNum, userId);

    res.json({
      success: true,
      bookId,
      chapter: chapterNum,
      ...result
    });
  } catch (err) {
    console.error('Error scanning chapter files:', err);
    res.status(500).json({
      error: 'Failed to scan chapter files',
      message: err.message
    });
  }
});

/**
 * POST /api/books/:bookId/chapters/:chapter/generate
 * Generate files from CNXML source using pipeline-runner
 */
router.post('/:bookId/chapters/:chapter/generate', requireAuth, async (req, res) => {
  const { bookId, chapter } = req.params;
  const chapterNum = parseInt(chapter, 10);
  const userId = req.user?.username || 'system';

  try {
    // Import pipeline runner (ES module, use dynamic import)
    const pipelineModule = await import('../../tools/pipeline-runner.js');
    const { runChapterPipeline } = pipelineModule;

    // Determine output directory
    const outputDir = chapterFilesService.getChapterDir(bookId, chapterNum);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`[Generate] Starting pipeline for ${bookId} chapter ${chapterNum} -> ${outputDir}`);

    // Run pipeline
    const result = await runChapterPipeline({
      chapter: chapterNum,
      outputDir,
      skipXliff: true,  // Skip XLIFF for now - we use Matecat Align instead
      verbose: false
    });

    if (!result.success) {
      return res.status(500).json({
        error: 'Pipeline failed',
        message: result.error || 'Unknown error'
      });
    }

    // Register generated files
    const filesToRegister = result.outputs
      .filter(o => o.type === 'markdown' || o.type === 'equations')
      .map(o => ({
        type: o.type === 'markdown' ? chapterFilesService.FILE_TYPES.EN_MD : 'equations',
        path: o.path,
        metadata: {
          section: o.section,
          description: o.description,
          generatedFrom: 'pipeline-runner'
        }
      }));

    if (filesToRegister.length > 0) {
      chapterFilesService.registerFiles(bookId, chapterNum, filesToRegister, userId);
    }

    console.log(`[Generate] Completed: ${result.outputs.length} files generated for ${bookId} chapter ${chapterNum}`);

    res.json({
      success: true,
      bookId,
      chapter: chapterNum,
      filesGenerated: result.outputs.length,
      modulesProcessed: result.modules.length,
      outputs: result.outputs.map(o => ({
        type: o.type,
        section: o.section,
        path: path.basename(o.path)
      }))
    });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({
      error: 'Failed to generate files',
      message: err.message
    });
  }
});

/**
 * DELETE /api/books/:bookId/chapters/:chapter/files
 * Clear generated files for regeneration
 */
router.delete('/:bookId/chapters/:chapter/files', requireAuth, (req, res) => {
  const { bookId, chapter } = req.params;
  const { deleteFromDisk } = req.query;
  const chapterNum = parseInt(chapter, 10);
  const userId = req.user?.username || 'system';

  try {
    // Mark files as superseded in database
    const dbCleared = chapterFilesService.clearChapterFiles(bookId, chapterNum, userId);

    let diskDeleted = 0;
    if (deleteFromDisk === 'true') {
      const diskResult = chapterFilesService.deleteChapterFilesFromDisk(bookId, chapterNum);
      diskDeleted = diskResult.deleted;
    }

    res.json({
      success: true,
      bookId,
      chapter: chapterNum,
      filesCleared: dbCleared,
      filesDeletedFromDisk: diskDeleted
    });
  } catch (err) {
    console.error('Error clearing chapter files:', err);
    res.status(500).json({
      error: 'Failed to clear chapter files',
      message: err.message
    });
  }
});

/**
 * GET /api/books/:bookId/files/summary
 * Get summary of generated files for all chapters
 */
router.get('/:bookId/files/summary', requireAuth, (req, res) => {
  const { bookId } = req.params;

  try {
    const summary = chapterFilesService.getBookFilesSummary(bookId);

    res.json({
      bookId,
      chapters: summary
    });
  } catch (err) {
    console.error('Error getting book files summary:', err);
    res.status(500).json({
      error: 'Failed to get files summary',
      message: err.message
    });
  }
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

/**
 * POST /api/books/:bookId/chapters/:chapter/import
 * Import markdown files for a chapter
 *
 * Accepts multiple .md files and stores them in 02-for-mt/ch{NN}/
 * Registers files in the database for tracking.
 */
router.post('/:bookId/chapters/:chapter/import', requireAuth, upload.array('files', 50), async (req, res) => {
  const { bookId, chapter } = req.params;
  const chapterNum = parseInt(chapter, 10);
  const userId = req.user?.username || 'system';

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      error: 'No files uploaded',
      message: 'Please upload at least one .md file'
    });
  }

  const chapterDir = chapterFilesService.getChapterDir(bookId, chapterNum);

  // Ensure chapter directory exists
  if (!fs.existsSync(chapterDir)) {
    fs.mkdirSync(chapterDir, { recursive: true });
  }

  const imported = [];
  const errors = [];

  for (const file of req.files) {
    try {
      // Validate filename pattern (e.g., 1-1.en.md, intro.en.md)
      const filename = file.originalname;
      const validPattern = /^(\d+-\d+|intro)(\.en)?\.md$/;

      if (!validPattern.test(filename)) {
        errors.push({
          file: filename,
          error: 'Invalid filename format. Expected: {section}.en.md or {section}.md'
        });
        // Clean up temp file
        fs.unlinkSync(file.path);
        continue;
      }

      // Determine target filename (ensure .en.md extension)
      let targetName = filename;
      if (!filename.includes('.en.md')) {
        targetName = filename.replace('.md', '.en.md');
      }

      const targetPath = path.join(chapterDir, targetName);

      // Move file to chapter directory
      fs.renameSync(file.path, targetPath);

      // Determine file type
      const fileType = chapterFilesService.FILE_TYPES.EN_MD;

      imported.push({
        originalName: filename,
        storedAs: targetName,
        path: targetPath,
        type: fileType
      });
    } catch (err) {
      errors.push({
        file: file.originalname,
        error: err.message
      });
      // Clean up temp file if it exists
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }
  }

  // Register imported files in database
  if (imported.length > 0) {
    try {
      const filesToRegister = imported.map(f => ({
        type: f.type,
        path: f.path,
        metadata: { importedFrom: f.originalName }
      }));

      chapterFilesService.registerFiles(bookId, chapterNum, filesToRegister, userId);
    } catch (dbErr) {
      console.error('Failed to register imported files:', dbErr);
      // Don't fail the request - files are already stored
    }
  }

  res.json({
    success: true,
    bookId,
    chapter: chapterNum,
    imported: imported.length,
    errors: errors.length > 0 ? errors : undefined,
    files: imported.map(f => ({
      original: f.originalName,
      stored: f.storedAs
    }))
  });
});

module.exports = router;
