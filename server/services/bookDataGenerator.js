/**
 * Book Data Generator Service
 *
 * Generates JSON data files for books by:
 * 1. Fetching structure from OpenStax GitHub (via openstaxFetcher)
 * 2. Merging Icelandic titles from database (registered_books, book_chapters)
 * 3. Writing to server/data/{slug}.json
 *
 * This enables the workflow server to have complete chapter data for books,
 * which is necessary for the chapter dropdown and other UI elements.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const openstaxFetcher = require('./openstaxFetcher');
const openstaxCatalogue = require('./openstaxCatalogue');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');
const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Get database connection
 */
function getDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return new Database(DB_PATH);
}

/**
 * Get registration data from database for a book
 *
 * @param {string} catalogueSlug - OpenStax slug (e.g., 'chemistry-2e')
 * @returns {object|null} Registration data with Icelandic titles
 */
function getRegistrationData(catalogueSlug) {
  const db = getDb();

  try {
    // Find the registered book by catalogue slug
    const book = db.prepare(`
      SELECT
        rb.id,
        rb.slug,
        rb.title_is,
        oc.slug as catalogue_slug,
        oc.title as title_en,
        oc.repo_url
      FROM registered_books rb
      JOIN openstax_catalogue oc ON oc.id = rb.catalogue_id
      WHERE oc.slug = ?
    `).get(catalogueSlug);

    if (!book) {
      db.close();
      return null;
    }

    // Get chapters with Icelandic titles
    const chapters = db.prepare(`
      SELECT chapter_num, title_en, title_is
      FROM book_chapters
      WHERE book_id = ?
      ORDER BY chapter_num
    `).all(book.id);

    // Get sections with Icelandic titles
    const sections = db.prepare(`
      SELECT chapter_num, section_num, module_id, title_en, title_is
      FROM book_sections
      WHERE book_id = ?
      ORDER BY chapter_num,
        CASE WHEN section_num = 'intro' THEN 0 ELSE 1 END,
        section_num
    `).all(book.id);

    db.close();

    return {
      slug: book.slug,
      titleIs: book.title_is,
      titleEn: book.title_en,
      chapters: chapters.map(ch => ({
        chapter: ch.chapter_num,
        titleEn: ch.title_en,
        titleIs: ch.title_is,
        sections: sections
          .filter(s => s.chapter_num === ch.chapter_num)
          .map(s => ({
            section: s.section_num,
            moduleId: s.module_id,
            titleEn: s.title_en,
            titleIs: s.title_is
          }))
      }))
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Generate book data JSON file
 *
 * @param {string} catalogueSlug - OpenStax slug (e.g., 'chemistry-2e')
 * @param {object} options - Generation options
 * @param {boolean} options.force - Overwrite existing file
 * @param {boolean} options.fetchFresh - Always fetch from OpenStax (don't use cached structure)
 * @returns {Promise<object>} Generation result
 */
async function generateBookData(catalogueSlug, options = {}) {
  const { force = false, fetchFresh = false } = options;

  // Check if book is available in openstaxFetcher
  if (!openstaxFetcher.isBookAvailable(catalogueSlug)) {
    throw new Error(
      `Book '${catalogueSlug}' is not available for fetching. ` +
      `Available books: ${openstaxFetcher.getAvailableBooks().join(', ')}`
    );
  }

  // Get catalogue entry for metadata (may fail if DB not available)
  let catalogueEntry = null;
  try {
    catalogueEntry = openstaxCatalogue.getCatalogueEntry(catalogueSlug);
  } catch (e) {
    // Database not available, continue without catalogue data
    console.log('Note: Database not available, continuing without catalogue metadata');
  }

  // Check existing file
  const outputPath = path.join(DATA_DIR, `${catalogueSlug}.json`);
  const existingFile = fs.existsSync(outputPath);

  if (existingFile && !force) {
    // Load existing to check chapter count
    const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const expectedChapters = catalogueEntry?.chapter_count || 0;

    if (existing.chapters && existing.chapters.length >= expectedChapters) {
      return {
        success: true,
        skipped: true,
        message: `File already exists with ${existing.chapters.length} chapters. Use force=true to regenerate.`,
        path: outputPath,
        chapters: existing.chapters.length
      };
    }
  }

  // Fetch structure from OpenStax
  console.log(`Fetching structure for ${catalogueSlug} from OpenStax...`);
  const openstaxData = await openstaxFetcher.fetchBookStructure(catalogueSlug);

  // Get registration data for Icelandic titles (may fail if DB not available)
  let registration = null;
  try {
    registration = getRegistrationData(catalogueSlug);
  } catch (e) {
    // Database not available, continue without Icelandic titles
    console.log('Note: Database not available, Icelandic titles will not be merged');
  }

  // Build the output data structure
  const bookData = {
    book: catalogueSlug,
    slug: registration?.slug || catalogueSlug,
    title: catalogueEntry?.title || openstaxData.book,
    titleIs: registration?.titleIs || null,
    repo: openstaxData.repo,
    preface: openstaxData.preface || null,
    chapters: openstaxData.chapters.map(chapter => {
      // Find matching registration data for Icelandic titles
      const regChapter = registration?.chapters?.find(c => c.chapter === chapter.chapter);

      return {
        chapter: chapter.chapter,
        title: chapter.title,
        titleIs: regChapter?.titleIs || chapter.titleIs || null,
        modules: chapter.modules.map(mod => {
          // Find matching section for Icelandic title
          const regSection = regChapter?.sections?.find(
            s => s.moduleId === mod.id || s.section === mod.section
          );

          return {
            id: mod.id,
            section: mod.section,
            title: mod.title,
            titleIs: regSection?.titleIs || null
          };
        })
      };
    }),
    appendices: openstaxData.appendices || [],
    generatedAt: new Date().toISOString(),
    fetchedFrom: 'openstax-github'
  };

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Write the file
  fs.writeFileSync(outputPath, JSON.stringify(bookData, null, 2));

  return {
    success: true,
    path: outputPath,
    book: catalogueSlug,
    slug: bookData.slug,
    chapters: bookData.chapters.length,
    modules: bookData.chapters.reduce((sum, ch) => sum + ch.modules.length, 0),
    appendices: bookData.appendices.length,
    hasIcelandicTitles: !!registration,
    message: `Generated ${outputPath} with ${bookData.chapters.length} chapters and ${bookData.chapters.reduce((sum, ch) => sum + ch.modules.length, 0)} modules`
  };
}

/**
 * Generate data for all available books
 *
 * @param {object} options - Generation options
 * @returns {Promise<object>} Results for all books
 */
async function generateAllBookData(options = {}) {
  const availableBooks = openstaxFetcher.getAvailableBooks();
  const results = {
    success: true,
    total: availableBooks.length,
    generated: 0,
    skipped: 0,
    failed: 0,
    books: []
  };

  for (const bookSlug of availableBooks) {
    try {
      const result = await generateBookData(bookSlug, options);
      results.books.push(result);

      if (result.skipped) {
        results.skipped++;
      } else {
        results.generated++;
      }
    } catch (err) {
      results.failed++;
      results.success = false;
      results.books.push({
        book: bookSlug,
        success: false,
        error: err.message
      });
    }
  }

  return results;
}

/**
 * List available books and their data file status
 *
 * @returns {Array} List of books with status
 */
function listBooks() {
  const availableBooks = openstaxFetcher.getAvailableBooks();

  return availableBooks.map(slug => {
    const dataPath = path.join(DATA_DIR, `${slug}.json`);
    const exists = fs.existsSync(dataPath);
    let chapters = 0;
    let generatedAt = null;

    if (exists) {
      try {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        chapters = data.chapters?.length || 0;
        generatedAt = data.generatedAt || data.fetchedAt;
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Check catalogue for expected chapter count (may fail if DB not available)
    let catalogueEntry = null;
    let expectedChapters = null;
    try {
      catalogueEntry = openstaxCatalogue.getCatalogueEntry(slug);
      expectedChapters = catalogueEntry?.chapter_count || null;
    } catch (e) {
      // Database not available, continue without catalogue data
    }

    // Check registration status (may fail if DB not available)
    let registration = null;
    try {
      registration = getRegistrationData(slug);
    } catch (e) {
      // Database not available, continue without registration data
    }

    return {
      slug,
      title: catalogueEntry?.title || slug,
      hasDataFile: exists,
      chapters,
      expectedChapters,
      needsUpdate: exists && expectedChapters && chapters < expectedChapters,
      generatedAt,
      isRegistered: !!registration,
      icelandicSlug: registration?.slug || null,
      icelandicTitle: registration?.titleIs || null
    };
  });
}

module.exports = {
  generateBookData,
  generateAllBookData,
  listBooks,
  getRegistrationData
};
