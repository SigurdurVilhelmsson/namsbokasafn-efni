/**
 * Book Registration Service
 *
 * Handles registering OpenStax books for translation:
 * - Creates database records (registered_books, book_chapters, book_sections)
 * - Initializes directory structure
 * - Imports chapter/section metadata from data files
 *
 * The registration creates a complete tracking structure for the
 * translation workflow before any actual translation work begins.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const openstaxCatalogue = require('./openstaxCatalogue');
const openstaxFetcher = require('./openstaxFetcher');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');
const DATA_DIR = path.join(__dirname, '..', 'data');
const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

/**
 * Initialize database connection
 */
function getDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return new Database(DB_PATH);
}

/**
 * Register a book for translation
 *
 * @param {object} options - Registration options
 * @param {string} options.catalogueSlug - OpenStax catalogue slug (e.g., 'chemistry-2e')
 * @param {string} options.slug - Icelandic slug (e.g., 'efnafraedi')
 * @param {string} options.titleIs - Icelandic title (e.g., 'Efnafræði')
 * @param {string} options.registeredBy - User ID registering the book
 * @param {boolean} options.fetchFromOpenstax - If true, fetch structure from OpenStax GitHub (default: false)
 * @param {boolean} options.forceReregister - If true, delete existing registration first (default: false)
 * @returns {Promise<object>} Registration result
 */
async function registerBook(options) {
  const { catalogueSlug, slug, titleIs, registeredBy, fetchFromOpenstax = false, forceReregister = false } = options;

  if (!catalogueSlug || !slug || !titleIs || !registeredBy) {
    throw new Error('catalogueSlug, slug, titleIs, and registeredBy are required');
  }

  // Validate catalogue entry exists
  const catalogueEntry = openstaxCatalogue.getCatalogueEntry(catalogueSlug);
  if (!catalogueEntry) {
    throw new Error(`Catalogue entry '${catalogueSlug}' not found. Sync catalogue first.`);
  }

  // Get book data - either from local file or fetch from OpenStax
  let bookData;
  const dataFilePath = path.join(DATA_DIR, `${catalogueSlug}.json`);
  const localFileExists = fs.existsSync(dataFilePath);

  if (fetchFromOpenstax || !localFileExists) {
    // Fetch from OpenStax GitHub
    if (!openstaxFetcher.isBookAvailable(catalogueSlug)) {
      throw new Error(`Book '${catalogueSlug}' is not available for fetching from OpenStax. Available: ${openstaxFetcher.getAvailableBooks().join(', ')}`);
    }

    console.log(`Fetching book structure from OpenStax GitHub...`);
    bookData = await openstaxFetcher.fetchBookStructure(catalogueSlug);

    // Optionally save fetched data to local file for future use
    if (!localFileExists) {
      const saveData = {
        book: catalogueSlug,
        slug: slug,
        title: catalogueEntry.title,
        titleIs: titleIs,
        repo: bookData.repo,
        preface: bookData.preface,
        chapters: bookData.chapters,
        fetchedAt: bookData.fetchedAt
      };
      fs.writeFileSync(dataFilePath, JSON.stringify(saveData, null, 2));
      console.log(`Saved book data to ${dataFilePath}`);
    }
  } else {
    // Load from local file
    bookData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));

    // Check if local file is incomplete compared to catalogue
    if (bookData.chapters && bookData.chapters.length < catalogueEntry.chapter_count) {
      console.warn(`Warning: Local data file has ${bookData.chapters.length} chapters but catalogue shows ${catalogueEntry.chapter_count}`);
      if (fetchFromOpenstax !== false) {
        console.log('Use fetchFromOpenstax: true to fetch complete data from OpenStax');
      }
    }
  }

  const db = getDb();

  try {
    // Handle re-registration
    if (forceReregister) {
      const existing = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
      if (existing) {
        console.log(`Deleting existing registration for '${slug}'...`);
        db.prepare('DELETE FROM localization_logs WHERE section_id IN (SELECT id FROM book_sections WHERE book_id = ?)').run(existing.id);
        db.prepare('DELETE FROM book_sections WHERE book_id = ?').run(existing.id);
        db.prepare('DELETE FROM book_chapters WHERE book_id = ?').run(existing.id);
        db.prepare('DELETE FROM registered_books WHERE id = ?').run(existing.id);
      }
    } else {
      // Check if already registered
      if (catalogueEntry.registered) {
        throw new Error(`Book '${catalogueSlug}' is already registered as '${catalogueEntry.registeredSlug}'`);
      }

      const existing = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
      if (existing) {
        throw new Error(`Slug '${slug}' is already in use by another book. Use forceReregister: true to replace.`);
      }
    }

    // Start transaction
    const result = db.transaction(() => {
      // 1. Create registered_books entry
      const bookResult = db.prepare(`
        INSERT INTO registered_books (catalogue_id, slug, title_is, registered_by, status)
        VALUES (?, ?, ?, ?, 'active')
      `).run(catalogueEntry.id, slug, titleIs, registeredBy);

      const bookId = bookResult.lastInsertRowid;

      // 2. Create book_chapters and book_sections from data
      const insertChapter = db.prepare(`
        INSERT INTO book_chapters (book_id, chapter_num, title_en, title_is, section_count, status)
        VALUES (?, ?, ?, ?, ?, 'not_started')
      `);

      const insertSection = db.prepare(`
        INSERT INTO book_sections (
          book_id, chapter_id, chapter_num, section_num, module_id,
          title_en, title_is, cnxml_path, en_md_path, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started')
      `);

      let totalSections = 0;
      const chapters = [];

      for (const chapter of bookData.chapters || []) {
        const chapterNum = chapter.chapter;
        const modules = chapter.modules || [];

        // Insert chapter
        const chapterResult = insertChapter.run(
          bookId,
          chapterNum,
          chapter.title,
          chapter.titleIs || null,
          modules.length
        );

        const chapterId = chapterResult.lastInsertRowid;

        // Insert sections
        for (const mod of modules) {
          const sectionNum = mod.section || `${chapterNum}.${modules.indexOf(mod)}`;
          const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;

          insertSection.run(
            bookId,
            chapterId,
            chapterNum,
            sectionNum,
            mod.id,
            mod.title,
            null, // title_is - to be filled during translation
            `01-source/${chapterDir}/${mod.id}.cnxml`,
            `02-for-mt/${chapterDir}/${sectionNum.replace('.', '-')}.en.md`
          );

          totalSections++;
        }

        chapters.push({
          chapterNum,
          title: chapter.title,
          titleIs: chapter.titleIs,
          sectionCount: modules.length
        });
      }

      return {
        bookId,
        chapters: chapters.length,
        sections: totalSections
      };
    })();

    db.close();

    // 3. Create directory structure
    createBookDirectories(slug);

    return {
      success: true,
      bookId: result.bookId,
      slug,
      titleIs,
      catalogueSlug,
      chapters: result.chapters,
      sections: result.sections,
      fetchedFromOpenstax: fetchFromOpenstax || !localFileExists,
      message: `Registered ${titleIs} with ${result.chapters} chapters and ${result.sections} sections`
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Create the directory structure for a registered book
 *
 * @param {string} slug - Book slug
 */
function createBookDirectories(slug) {
  const bookRoot = path.join(BOOKS_DIR, slug);

  const directories = [
    '01-source',
    '02-for-mt',
    '02-mt-output',
    '03-faithful',
    '04-localized',
    '05-publication/mt-preview',
    '05-publication/faithful',
    '05-publication/localized',
    'for-align',
    'tm',
    'glossary',
    'chapters'
  ];

  for (const dir of directories) {
    const fullPath = path.join(bookRoot, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}

/**
 * Get a registered book by slug
 *
 * @param {string} slug - Icelandic slug
 * @returns {object|null} Book with chapters and sections
 */
function getRegisteredBook(slug) {
  const db = getDb();

  try {
    const book = db.prepare(`
      SELECT
        rb.*,
        oc.slug as catalogue_slug,
        oc.title as title_en,
        oc.description,
        oc.repo_url
      FROM registered_books rb
      JOIN openstax_catalogue oc ON oc.id = rb.catalogue_id
      WHERE rb.slug = ?
    `).get(slug);

    if (!book) {
      db.close();
      return null;
    }

    // Get chapters with section counts by status
    const chapters = db.prepare(`
      SELECT
        bc.*,
        COUNT(bs.id) as total_sections,
        SUM(CASE WHEN bs.status = 'not_started' THEN 1 ELSE 0 END) as not_started,
        SUM(CASE WHEN bs.status IN ('mt_pending', 'mt_uploaded') THEN 1 ELSE 0 END) as in_mt,
        SUM(CASE WHEN bs.status IN ('review_assigned', 'review_in_progress', 'review_submitted') THEN 1 ELSE 0 END) as in_review,
        SUM(CASE WHEN bs.status = 'review_approved' THEN 1 ELSE 0 END) as review_approved,
        SUM(CASE WHEN bs.status IN ('localization_assigned', 'localization_in_progress', 'localization_submitted') THEN 1 ELSE 0 END) as in_localization,
        SUM(CASE WHEN bs.status IN ('faithful_published', 'localized_published') THEN 1 ELSE 0 END) as published
      FROM book_chapters bc
      LEFT JOIN book_sections bs ON bs.chapter_id = bc.id
      WHERE bc.book_id = ?
      GROUP BY bc.id
      ORDER BY bc.chapter_num
    `).all(book.id);

    db.close();

    return {
      id: book.id,
      slug: book.slug,
      catalogueSlug: book.catalogue_slug,
      titleIs: book.title_is,
      titleEn: book.title_en,
      description: book.description,
      repoUrl: book.repo_url,
      registeredBy: book.registered_by,
      registeredAt: book.registered_at,
      status: book.status,
      chapters: chapters.map(c => ({
        id: c.id,
        chapterNum: c.chapter_num,
        titleEn: c.title_en,
        titleIs: c.title_is,
        sectionCount: c.section_count,
        status: c.status,
        progress: {
          total: c.total_sections,
          notStarted: c.not_started,
          inMT: c.in_mt,
          inReview: c.in_review,
          reviewApproved: c.review_approved,
          inLocalization: c.in_localization,
          published: c.published
        }
      }))
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * List all registered books
 *
 * @returns {Array} List of registered books with progress summary
 */
function listRegisteredBooks() {
  const db = getDb();

  try {
    const books = db.prepare(`
      SELECT
        rb.*,
        oc.slug as catalogue_slug,
        oc.title as title_en,
        oc.chapter_count,
        (SELECT COUNT(*) FROM book_chapters WHERE book_id = rb.id) as chapters,
        (SELECT COUNT(*) FROM book_sections WHERE book_id = rb.id) as total_sections,
        (SELECT COUNT(*) FROM book_sections WHERE book_id = rb.id AND status IN ('faithful_published', 'localized_published')) as published_sections
      FROM registered_books rb
      JOIN openstax_catalogue oc ON oc.id = rb.catalogue_id
      WHERE rb.status = 'active'
      ORDER BY rb.registered_at DESC
    `).all();

    db.close();

    return books.map(b => ({
      id: b.id,
      slug: b.slug,
      catalogueSlug: b.catalogue_slug,
      titleIs: b.title_is,
      titleEn: b.title_en,
      registeredAt: b.registered_at,
      status: b.status,
      chapters: b.chapters,
      totalSections: b.total_sections,
      publishedSections: b.published_sections,
      progress: b.total_sections > 0 ? Math.round((b.published_sections / b.total_sections) * 100) : 0
    }));
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Get sections for a chapter
 *
 * @param {number} chapterId - Chapter database ID
 * @returns {Array} List of sections
 */
function getChapterSections(chapterId) {
  const db = getDb();

  try {
    const sections = db.prepare(`
      SELECT * FROM book_sections
      WHERE chapter_id = ?
      ORDER BY
        CASE WHEN section_num = 'intro' THEN 0 ELSE 1 END,
        CAST(REPLACE(section_num, '.', '') AS INTEGER)
    `).all(chapterId);

    db.close();

    return sections.map(s => ({
      id: s.id,
      bookId: s.book_id,
      chapterId: s.chapter_id,
      chapterNum: s.chapter_num,
      sectionNum: s.section_num,
      moduleId: s.module_id,
      titleEn: s.title_en,
      titleIs: s.title_is,
      cnxmlPath: s.cnxml_path,
      enMdPath: s.en_md_path,
      mtOutputPath: s.mt_output_path,
      faithfulPath: s.faithful_path,
      localizedPath: s.localized_path,
      status: s.status,
      linguisticReviewer: s.linguistic_reviewer,
      linguisticReviewerName: s.linguistic_reviewer_name,
      linguisticAssignedAt: s.linguistic_assigned_at,
      linguisticSubmittedAt: s.linguistic_submitted_at,
      linguisticApprovedAt: s.linguistic_approved_at,
      localizer: s.localizer,
      localizerName: s.localizer_name,
      localizationAssignedAt: s.localization_assigned_at,
      localizationSubmittedAt: s.localization_submitted_at,
      localizationApprovedAt: s.localization_approved_at,
      faithfulPublishedAt: s.faithful_published_at,
      localizedPublishedAt: s.localized_published_at,
      tmCreatedAt: s.tm_created_at,
      createdAt: s.created_at,
      updatedAt: s.updated_at
    }));
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Get a single section by ID
 *
 * @param {number} sectionId - Section database ID
 * @returns {object|null} Section data
 */
function getSection(sectionId) {
  const db = getDb();

  try {
    const section = db.prepare(`
      SELECT
        bs.*,
        rb.slug as book_slug,
        rb.title_is as book_title_is,
        bc.title_en as chapter_title_en,
        bc.title_is as chapter_title_is
      FROM book_sections bs
      JOIN registered_books rb ON rb.id = bs.book_id
      JOIN book_chapters bc ON bc.id = bs.chapter_id
      WHERE bs.id = ?
    `).get(sectionId);

    db.close();

    if (!section) return null;

    return {
      id: section.id,
      bookId: section.book_id,
      bookSlug: section.book_slug,
      bookTitleIs: section.book_title_is,
      chapterId: section.chapter_id,
      chapterNum: section.chapter_num,
      chapterTitleEn: section.chapter_title_en,
      chapterTitleIs: section.chapter_title_is,
      sectionNum: section.section_num,
      moduleId: section.module_id,
      titleEn: section.title_en,
      titleIs: section.title_is,
      cnxmlPath: section.cnxml_path,
      enMdPath: section.en_md_path,
      mtOutputPath: section.mt_output_path,
      faithfulPath: section.faithful_path,
      localizedPath: section.localized_path,
      status: section.status,
      linguisticReviewer: section.linguistic_reviewer,
      linguisticReviewerName: section.linguistic_reviewer_name,
      linguisticAssignedAt: section.linguistic_assigned_at,
      linguisticSubmittedAt: section.linguistic_submitted_at,
      linguisticApprovedAt: section.linguistic_approved_at,
      linguisticApprovedBy: section.linguistic_approved_by,
      localizer: section.localizer,
      localizerName: section.localizer_name,
      localizationAssignedAt: section.localization_assigned_at,
      localizationSubmittedAt: section.localization_submitted_at,
      localizationApprovedAt: section.localization_approved_at,
      localizationApprovedBy: section.localization_approved_by,
      faithfulPublishedAt: section.faithful_published_at,
      localizedPublishedAt: section.localized_published_at,
      tmCreatedAt: section.tm_created_at,
      createdAt: section.created_at,
      updatedAt: section.updated_at
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Update section status
 *
 * @param {number} sectionId - Section database ID
 * @param {string} status - New status
 * @param {object} updates - Additional fields to update
 * @returns {boolean} Success
 */
function updateSectionStatus(sectionId, status, updates = {}) {
  const db = getDb();

  try {
    const validStatuses = [
      'not_started',
      'mt_pending',
      'mt_uploaded',
      'review_assigned',
      'review_in_progress',
      'review_submitted',
      'review_approved',
      'faithful_published',
      'tm_created',
      'localization_assigned',
      'localization_in_progress',
      'localization_submitted',
      'localization_approved',
      'localized_published'
    ];

    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    // Build update query
    const fields = ['status = ?'];
    const values = [status];

    // Add optional timestamp updates based on status
    const statusTimestamps = {
      'review_assigned': ['linguistic_assigned_at', 'CURRENT_TIMESTAMP'],
      'review_submitted': ['linguistic_submitted_at', 'CURRENT_TIMESTAMP'],
      'review_approved': ['linguistic_approved_at', 'CURRENT_TIMESTAMP'],
      'faithful_published': ['faithful_published_at', 'CURRENT_TIMESTAMP'],
      'tm_created': ['tm_created_at', 'CURRENT_TIMESTAMP'],
      'localization_assigned': ['localization_assigned_at', 'CURRENT_TIMESTAMP'],
      'localization_submitted': ['localization_submitted_at', 'CURRENT_TIMESTAMP'],
      'localization_approved': ['localization_approved_at', 'CURRENT_TIMESTAMP'],
      'localized_published': ['localized_published_at', 'CURRENT_TIMESTAMP']
    };

    if (statusTimestamps[status]) {
      fields.push(`${statusTimestamps[status][0]} = ${statusTimestamps[status][1]}`);
    }

    // Add any additional updates
    for (const [key, value] of Object.entries(updates)) {
      // Convert camelCase to snake_case
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${snakeKey} = ?`);
      values.push(value);
    }

    values.push(sectionId);

    const query = `UPDATE book_sections SET ${fields.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...values);

    // Update chapter status based on section statuses
    updateChapterStatus(db, sectionId);

    db.close();
    return true;
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Update chapter status based on its sections' statuses
 * @private
 */
function updateChapterStatus(db, sectionId) {
  // Get chapter ID for this section
  const section = db.prepare('SELECT chapter_id FROM book_sections WHERE id = ?').get(sectionId);
  if (!section) return;

  // Get status counts for this chapter
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'not_started' THEN 1 ELSE 0 END) as not_started,
      SUM(CASE WHEN status IN ('localized_published') THEN 1 ELSE 0 END) as fully_complete,
      SUM(CASE WHEN status IN ('faithful_published', 'localized_published') THEN 1 ELSE 0 END) as published
    FROM book_sections
    WHERE chapter_id = ?
  `).get(section.chapter_id);

  let chapterStatus = 'in_progress';

  if (stats.not_started === stats.total) {
    chapterStatus = 'not_started';
  } else if (stats.fully_complete === stats.total) {
    chapterStatus = 'complete';
  } else if (stats.published > 0) {
    chapterStatus = 'partially_published';
  }

  db.prepare('UPDATE book_chapters SET status = ? WHERE id = ?').run(chapterStatus, section.chapter_id);
}

/**
 * Assign linguistic reviewer to a section
 *
 * @param {number} sectionId - Section ID
 * @param {string} reviewerId - User ID
 * @param {string} reviewerName - User display name
 * @returns {object} Updated section
 */
function assignLinguisticReviewer(sectionId, reviewerId, reviewerName) {
  return updateSectionStatus(sectionId, 'review_assigned', {
    linguisticReviewer: reviewerId,
    linguisticReviewerName: reviewerName
  });
}

/**
 * Assign localizer to a section
 *
 * @param {number} sectionId - Section ID
 * @param {string} localizerId - User ID
 * @param {string} localizerName - User display name
 * @returns {object} Updated section
 */
function assignLocalizer(sectionId, localizerId, localizerName) {
  return updateSectionStatus(sectionId, 'localization_assigned', {
    localizer: localizerId,
    localizerName: localizerName
  });
}

module.exports = {
  registerBook,
  getRegisteredBook,
  listRegisteredBooks,
  getChapterSections,
  getSection,
  updateSectionStatus,
  assignLinguisticReviewer,
  assignLocalizer,
  createBookDirectories
};
