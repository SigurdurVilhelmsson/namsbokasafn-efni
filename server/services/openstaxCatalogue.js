/**
 * OpenStax Catalogue Service
 *
 * Manages the catalogue of available OpenStax books for translation.
 * Books can be:
 * - Pre-defined in a hardcoded list (priority textbooks)
 * - Synced from OpenStax API (future enhancement)
 *
 * The catalogue stores metadata about each book including:
 * - Slug (OpenStax identifier like 'chemistry-2e')
 * - Title and description
 * - Repository URL for source files
 * - Chapter count
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

// Pre-defined catalogue of OpenStax Science and Math books available for translation.
// Organized by subject area. All repos verified at github.com/openstax/.
const PREDEFINED_BOOKS = [
  // ── Chemistry ──────────────────────────────────────────────────────
  {
    slug: 'chemistry-2e',
    title: 'Chemistry 2e',
    description:
      'General chemistry textbook covering atomic structure, chemical bonding, stoichiometry, thermodynamics, and more.',
    repoUrl: 'https://github.com/openstax/osbooks-chemistry-bundle',
    chapterCount: 21,
    hasAppendices: true,
  },
  {
    slug: 'chemistry-atoms-first-2e',
    title: 'Chemistry: Atoms First 2e',
    description:
      'General chemistry with an atoms-first approach, starting from atomic theory and building to larger concepts.',
    repoUrl: 'https://github.com/openstax/osbooks-chemistry-bundle',
    chapterCount: 21,
    hasAppendices: true,
  },
  {
    slug: 'organic-chemistry',
    title: 'Organic Chemistry',
    description:
      'Organic chemistry covering structure, reactions, mechanisms, and spectroscopy of carbon compounds.',
    repoUrl: 'https://github.com/openstax/osbooks-organic-chemistry',
    chapterCount: 30,
    hasAppendices: true,
  },

  // ── Biology ────────────────────────────────────────────────────────
  {
    slug: 'biology-2e',
    title: 'Biology 2e',
    description:
      'Comprehensive biology textbook covering cell biology, genetics, evolution, ecology, and physiology.',
    repoUrl: 'https://github.com/openstax/osbooks-biology-bundle',
    chapterCount: 47,
    hasAppendices: true,
  },
  {
    slug: 'biology-ap-courses',
    title: 'Biology for AP Courses',
    description:
      'Biology textbook aligned with AP Biology curriculum, covering all four Big Ideas.',
    repoUrl: 'https://github.com/openstax/osbooks-biology-bundle',
    chapterCount: 47,
    hasAppendices: true,
  },
  {
    slug: 'concepts-biology',
    title: 'Concepts of Biology',
    description:
      'Introductory biology for non-majors covering cells, genetics, evolution, and ecology.',
    repoUrl: 'https://github.com/openstax/osbooks-biology-bundle',
    chapterCount: 21,
    hasAppendices: true,
  },
  {
    slug: 'anatomy-physiology-2e',
    title: 'Anatomy and Physiology 2e',
    description: 'Human anatomy and physiology covering all organ systems.',
    repoUrl: 'https://github.com/openstax/osbooks-anatomy-physiology',
    chapterCount: 28,
    hasAppendices: true,
  },
  {
    slug: 'microbiology',
    title: 'Microbiology',
    description: 'Microbiology textbook covering bacteria, viruses, fungi, and immunology.',
    repoUrl: 'https://github.com/openstax/osbooks-microbiology',
    chapterCount: 26,
    hasAppendices: true,
  },

  // ── Physics ────────────────────────────────────────────────────────
  {
    slug: 'physics',
    title: 'College Physics 2e',
    description:
      'Algebra-based physics textbook covering mechanics, thermodynamics, electricity, magnetism, and modern physics.',
    repoUrl: 'https://github.com/openstax/osbooks-college-physics-bundle',
    chapterCount: 34,
    hasAppendices: true,
  },
  {
    slug: 'college-physics-2e',
    title: 'College Physics 2e',
    description:
      'Algebra-based physics for science and engineering students, covering mechanics through modern physics.',
    repoUrl: 'https://github.com/openstax/osbooks-college-physics-bundle',
    chapterCount: 34,
    hasAppendices: true,
  },
  {
    slug: 'college-physics-ap-courses-2e',
    title: 'College Physics for AP Courses 2e',
    description: 'Physics textbook aligned with AP Physics 1 and 2 curriculum.',
    repoUrl: 'https://github.com/openstax/osbooks-college-physics-bundle',
    chapterCount: 34,
    hasAppendices: true,
  },
  {
    slug: 'university-physics-volume-1',
    title: 'University Physics Volume 1',
    description: 'Calculus-based physics covering mechanics, waves, and thermodynamics.',
    repoUrl: 'https://github.com/openstax/osbooks-university-physics-bundle',
    chapterCount: 12,
    hasAppendices: true,
  },
  {
    slug: 'university-physics-volume-2',
    title: 'University Physics Volume 2',
    description: 'Calculus-based physics covering electricity, magnetism, and optics.',
    repoUrl: 'https://github.com/openstax/osbooks-university-physics-bundle',
    chapterCount: 16,
    hasAppendices: true,
  },
  {
    slug: 'university-physics-volume-3',
    title: 'University Physics Volume 3',
    description:
      'Calculus-based physics covering relativity, quantum mechanics, and nuclear physics.',
    repoUrl: 'https://github.com/openstax/osbooks-university-physics-bundle',
    chapterCount: 11,
    hasAppendices: true,
  },

  // ── Astronomy ──────────────────────────────────────────────────────
  {
    slug: 'astronomy-2e',
    title: 'Astronomy 2e',
    description:
      'Introduction to astronomy covering the solar system, stars, galaxies, and cosmology.',
    repoUrl: 'https://github.com/openstax/osbooks-astronomy',
    chapterCount: 30,
    hasAppendices: true,
  },

  // ── Algebra & Trigonometry ─────────────────────────────────────────
  {
    slug: 'algebra-and-trigonometry-2e',
    title: 'Algebra and Trigonometry 2e',
    description:
      'Comprehensive algebra and trigonometry covering functions, polynomials, exponentials, and trigonometric identities.',
    repoUrl: 'https://github.com/openstax/osbooks-college-algebra-bundle',
    chapterCount: 13,
    hasAppendices: false,
  },
  {
    slug: 'college-algebra-2e',
    title: 'College Algebra 2e',
    description:
      'College-level algebra covering equations, functions, polynomials, and conic sections.',
    repoUrl: 'https://github.com/openstax/osbooks-college-algebra-bundle',
    chapterCount: 9,
    hasAppendices: false,
  },
  {
    slug: 'college-algebra-corequisite-support-2e',
    title: 'College Algebra 2e with Corequisite Support',
    description: 'College Algebra 2e with integrated review and corequisite support modules.',
    repoUrl: 'https://github.com/openstax/osbooks-college-algebra-bundle',
    chapterCount: 9,
    hasAppendices: false,
  },
  {
    slug: 'precalculus-2e',
    title: 'Precalculus 2e',
    description: 'Precalculus covering functions, trigonometry, analytic geometry, and sequences.',
    repoUrl: 'https://github.com/openstax/osbooks-college-algebra-bundle',
    chapterCount: 12,
    hasAppendices: false,
  },

  // ── Calculus ───────────────────────────────────────────────────────
  {
    slug: 'calculus-volume-1',
    title: 'Calculus Volume 1',
    description: 'Single-variable calculus covering limits, derivatives, and integrals.',
    repoUrl: 'https://github.com/openstax/osbooks-calculus-bundle',
    chapterCount: 6,
    hasAppendices: true,
  },
  {
    slug: 'calculus-volume-2',
    title: 'Calculus Volume 2',
    description:
      'Calculus covering integration techniques, sequences, series, and parametric equations.',
    repoUrl: 'https://github.com/openstax/osbooks-calculus-bundle',
    chapterCount: 5,
    hasAppendices: true,
  },
  {
    slug: 'calculus-volume-3',
    title: 'Calculus Volume 3',
    description:
      'Multivariable calculus covering vectors, partial derivatives, multiple integrals, and vector calculus.',
    repoUrl: 'https://github.com/openstax/osbooks-calculus-bundle',
    chapterCount: 6,
    hasAppendices: true,
  },

  // ── Pre-Algebra & Elementary Algebra ───────────────────────────────
  {
    slug: 'prealgebra-2e',
    title: 'Prealgebra 2e',
    description:
      'Foundational mathematics covering whole numbers, fractions, decimals, percents, and basic geometry.',
    repoUrl: 'https://github.com/openstax/osbooks-prealgebra-bundle',
    chapterCount: 12,
    hasAppendices: false,
  },
  {
    slug: 'elementary-algebra-2e',
    title: 'Elementary Algebra 2e',
    description:
      'Introductory algebra covering linear equations, polynomials, factoring, and rational expressions.',
    repoUrl: 'https://github.com/openstax/osbooks-prealgebra-bundle',
    chapterCount: 12,
    hasAppendices: false,
  },
  {
    slug: 'intermediate-algebra-2e',
    title: 'Intermediate Algebra 2e',
    description:
      'Intermediate algebra covering quadratics, radicals, exponentials, and logarithms.',
    repoUrl: 'https://github.com/openstax/osbooks-prealgebra-bundle',
    chapterCount: 12,
    hasAppendices: false,
  },

  // ── Statistics ─────────────────────────────────────────────────────
  {
    slug: 'introductory-statistics-2e',
    title: 'Introductory Statistics 2e',
    description:
      'Statistics covering probability, distributions, hypothesis testing, regression, and chi-square.',
    repoUrl: 'https://github.com/openstax/osbooks-introductory-statistics-bundle',
    chapterCount: 13,
    hasAppendices: true,
  },
  {
    slug: 'introductory-business-statistics-2e',
    title: 'Introductory Business Statistics 2e',
    description:
      'Statistics for business students covering descriptive statistics, probability, and inference.',
    repoUrl: 'https://github.com/openstax/osbooks-introductory-statistics-bundle',
    chapterCount: 13,
    hasAppendices: true,
  },
  {
    slug: 'statistics',
    title: 'Statistics',
    description:
      'Introductory statistics covering data collection, probability, distributions, and hypothesis testing.',
    repoUrl: 'https://github.com/openstax/osbooks-statistics',
    chapterCount: 12,
    hasAppendices: true,
  },

  // ── Other Math ─────────────────────────────────────────────────────
  {
    slug: 'contemporary-mathematics',
    title: 'Contemporary Mathematics',
    description:
      'Liberal arts mathematics covering sets, logic, probability, statistics, finance, and graph theory.',
    repoUrl: 'https://github.com/openstax/osbooks-contemporary-mathematics',
    chapterCount: 15,
    hasAppendices: false,
  },
];

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
 * Ensure the catalogue tables exist
 */
function ensureTablesExist(db) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='openstax_catalogue'")
    .get();
  if (!tables) {
    throw new Error('Catalogue tables not found. Please run migration 003-book-catalogue first.');
  }
}

/**
 * Get all books in the catalogue
 *
 * @returns {Array} List of catalogue entries
 */
function listCatalogue() {
  const db = getDb();
  try {
    ensureTablesExist(db);

    const books = db
      .prepare(
        `
      SELECT
        c.*,
        r.id as registered_id,
        r.slug as registered_slug,
        r.title_is,
        r.status as registration_status
      FROM openstax_catalogue c
      LEFT JOIN registered_books r ON r.catalogue_id = c.id
      ORDER BY c.title
    `
      )
      .all();

    db.close();

    return books.map((b) => ({
      id: b.id,
      slug: b.slug,
      title: b.title,
      description: b.description,
      repoUrl: b.repo_url,
      chapterCount: b.chapter_count,
      hasAppendices: !!b.has_appendices,
      lastSynced: b.last_synced,
      createdAt: b.created_at,
      registered: !!b.registered_id,
      registeredSlug: b.registered_slug,
      titleIs: b.title_is,
      registrationStatus: b.registration_status,
    }));
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Get a single catalogue entry by slug
 *
 * @param {string} slug - OpenStax book slug
 * @returns {object|null} Catalogue entry or null
 */
function getCatalogueEntry(slug) {
  const db = getDb();
  try {
    ensureTablesExist(db);

    const book = db
      .prepare(
        `
      SELECT
        c.*,
        r.id as registered_id,
        r.slug as registered_slug,
        r.title_is,
        r.status as registration_status
      FROM openstax_catalogue c
      LEFT JOIN registered_books r ON r.catalogue_id = c.id
      WHERE c.slug = ?
    `
      )
      .get(slug);

    db.close();

    if (!book) return null;

    return {
      id: book.id,
      slug: book.slug,
      title: book.title,
      description: book.description,
      repoUrl: book.repo_url,
      chapterCount: book.chapter_count,
      hasAppendices: !!book.has_appendices,
      lastSynced: book.last_synced,
      createdAt: book.created_at,
      registered: !!book.registered_id,
      registeredSlug: book.registered_slug,
      titleIs: book.title_is,
      registrationStatus: book.registration_status,
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Sync the catalogue with predefined books
 *
 * Inserts any missing books and updates existing ones.
 *
 * @returns {object} Sync result with added/updated counts
 */
function syncCatalogue() {
  const db = getDb();
  try {
    ensureTablesExist(db);

    const insertStmt = db.prepare(`
      INSERT INTO openstax_catalogue (slug, title, description, repo_url, chapter_count, has_appendices, last_synced)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        repo_url = excluded.repo_url,
        chapter_count = excluded.chapter_count,
        has_appendices = excluded.has_appendices,
        last_synced = CURRENT_TIMESTAMP
    `);

    let added = 0;
    let updated = 0;

    const transaction = db.transaction(() => {
      for (const book of PREDEFINED_BOOKS) {
        // Check if exists
        const existing = db
          .prepare('SELECT id FROM openstax_catalogue WHERE slug = ?')
          .get(book.slug);

        insertStmt.run(
          book.slug,
          book.title,
          book.description,
          book.repoUrl,
          book.chapterCount,
          book.hasAppendices ? 1 : 0
        );

        if (existing) {
          updated++;
        } else {
          added++;
        }
      }
    });

    transaction();
    db.close();

    return {
      success: true,
      added,
      updated,
      total: PREDEFINED_BOOKS.length,
      syncedAt: new Date().toISOString(),
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Add a custom book to the catalogue
 *
 * @param {object} book - Book data
 * @returns {object} Created catalogue entry
 */
function addToCatalogue(book) {
  const { slug, title, description, repoUrl, chapterCount, hasAppendices } = book;

  if (!slug || !title) {
    throw new Error('slug and title are required');
  }

  const db = getDb();
  try {
    ensureTablesExist(db);

    const result = db
      .prepare(
        `
      INSERT INTO openstax_catalogue (slug, title, description, repo_url, chapter_count, has_appendices, last_synced)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `
      )
      .run(
        slug,
        title,
        description || null,
        repoUrl || null,
        chapterCount || 0,
        hasAppendices ? 1 : 0
      );

    db.close();

    return {
      id: result.lastInsertRowid,
      slug,
      title,
      description,
      repoUrl,
      chapterCount: chapterCount || 0,
      hasAppendices: !!hasAppendices,
    };
  } catch (err) {
    db.close();
    if (err.message.includes('UNIQUE constraint failed')) {
      throw new Error(`Book with slug '${slug}' already exists in catalogue`);
    }
    throw err;
  }
}

/**
 * Check if a book exists in the catalogue
 *
 * @param {string} slug - Book slug to check
 * @returns {boolean} True if exists
 */
function existsInCatalogue(slug) {
  const db = getDb();
  try {
    ensureTablesExist(db);
    const result = db.prepare('SELECT 1 FROM openstax_catalogue WHERE slug = ?').get(slug);
    db.close();
    return !!result;
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Get predefined books list (without database)
 *
 * @returns {Array} List of predefined books
 */
function getPredefinedBooks() {
  return PREDEFINED_BOOKS.map((b) => ({ ...b }));
}

module.exports = {
  listCatalogue,
  getCatalogueEntry,
  syncCatalogue,
  addToCatalogue,
  existsInCatalogue,
  getPredefinedBooks,
  PREDEFINED_BOOKS,
};
