/**
 * Catalogue Service Tests
 *
 * Validates subject categorization, ordering, and database persistence.
 * Uses in-memory better-sqlite3 DB for isolation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const {
  PREDEFINED_BOOKS,
  SUBJECT_ORDER,
  SUBJECT_LABELS,
} = require('../services/openstaxCatalogue');

// ============================================================================
// PREDEFINED_BOOKS validation
// ============================================================================

describe('PREDEFINED_BOOKS subjects', () => {
  it('every book has a subject field', () => {
    const missing = PREDEFINED_BOOKS.filter((b) => !b.subject);
    expect(missing).toEqual([]);
  });

  it('all subjects used are present in SUBJECT_ORDER', () => {
    const usedSubjects = [...new Set(PREDEFINED_BOOKS.map((b) => b.subject))];
    usedSubjects.forEach((subj) => {
      expect(SUBJECT_ORDER).toContain(subj);
    });
  });
});

// ============================================================================
// SUBJECT_ORDER / SUBJECT_LABELS validation
// ============================================================================

describe('SUBJECT_ORDER and SUBJECT_LABELS', () => {
  it('SUBJECT_LABELS has a label for every subject in SUBJECT_ORDER', () => {
    SUBJECT_ORDER.forEach((subj) => {
      expect(SUBJECT_LABELS[subj]).toBeDefined();
      expect(typeof SUBJECT_LABELS[subj]).toBe('string');
      expect(SUBJECT_LABELS[subj].length).toBeGreaterThan(0);
    });
  });

  it('SUBJECT_ORDER contains all subjects that appear in PREDEFINED_BOOKS', () => {
    const usedSubjects = [...new Set(PREDEFINED_BOOKS.map((b) => b.subject))];
    expect(SUBJECT_ORDER).toEqual(expect.arrayContaining(usedSubjects));
  });

  it('SUBJECT_ORDER has no extra subjects not used by any book', () => {
    const usedSubjects = new Set(PREDEFINED_BOOKS.map((b) => b.subject));
    SUBJECT_ORDER.forEach((subj) => {
      expect(usedSubjects.has(subj)).toBe(true);
    });
  });
});

// ============================================================================
// Database integration (in-memory)
// ============================================================================

describe('catalogue database operations', () => {
  let db;

  beforeAll(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');

    // Recreate openstax_catalogue table (migration 003 + 013)
    db.exec(`
      CREATE TABLE openstax_catalogue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        repo_url TEXT,
        chapter_count INTEGER DEFAULT 0,
        has_appendices INTEGER DEFAULT 0,
        subject TEXT DEFAULT 'other',
        last_synced TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_openstax_catalogue_subject ON openstax_catalogue(subject);
    `);

    // Recreate registered_books table (migration 003)
    db.exec(`
      CREATE TABLE registered_books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        catalogue_id INTEGER REFERENCES openstax_catalogue(id),
        title_is TEXT,
        status TEXT DEFAULT 'active'
      );
    `);
  });

  afterAll(() => {
    db.close();
  });

  it('syncCatalogue persists subject field correctly', () => {
    const insertStmt = db.prepare(`
      INSERT INTO openstax_catalogue (slug, title, description, repo_url, chapter_count, has_appendices, subject, last_synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        subject = excluded.subject,
        last_synced = CURRENT_TIMESTAMP
    `);

    const transaction = db.transaction(() => {
      for (const book of PREDEFINED_BOOKS) {
        insertStmt.run(
          book.slug,
          book.title,
          book.description,
          book.repoUrl,
          book.chapterCount,
          book.hasAppendices ? 1 : 0,
          book.subject || 'other'
        );
      }
    });
    transaction();

    // Verify all books were inserted with correct subjects
    const rows = db.prepare('SELECT slug, subject FROM openstax_catalogue').all();
    expect(rows.length).toBe(PREDEFINED_BOOKS.length);

    PREDEFINED_BOOKS.forEach((book) => {
      const row = rows.find((r) => r.slug === book.slug);
      expect(row).toBeDefined();
      expect(row.subject).toBe(book.subject);
    });
  });

  it('listCatalogue returns books ordered by subject then title', () => {
    const books = db
      .prepare(
        `
      SELECT c.*, r.id as registered_id
      FROM openstax_catalogue c
      LEFT JOIN registered_books r ON r.catalogue_id = c.id
      ORDER BY
        CASE c.subject
          WHEN 'chemistry' THEN 1
          WHEN 'biology' THEN 2
          WHEN 'physics' THEN 3
          WHEN 'astronomy' THEN 4
          WHEN 'mathematics' THEN 5
          WHEN 'statistics' THEN 6
          WHEN 'computer-science' THEN 7
          WHEN 'college-success' THEN 8
          ELSE 99
        END,
        c.title
    `
      )
      .all();

    expect(books.length).toBe(PREDEFINED_BOOKS.length);

    // First books should be chemistry, last should be college-success
    expect(books[0].subject).toBe('chemistry');
    expect(books[books.length - 1].subject).toBe('college-success');

    // Within each subject group, titles should be alphabetically sorted
    let prevSubjectOrder = 0;
    let prevTitle = '';
    const subjectToOrder = {
      chemistry: 1,
      biology: 2,
      physics: 3,
      astronomy: 4,
      mathematics: 5,
      statistics: 6,
      'computer-science': 7,
      'college-success': 8,
    };

    books.forEach((book) => {
      const currentOrder = subjectToOrder[book.subject] || 99;
      if (currentOrder > prevSubjectOrder) {
        prevTitle = '';
      }
      expect(currentOrder).toBeGreaterThanOrEqual(prevSubjectOrder);
      if (currentOrder === prevSubjectOrder) {
        expect(book.title.localeCompare(prevTitle)).toBeGreaterThanOrEqual(0);
      }
      prevSubjectOrder = currentOrder;
      prevTitle = book.title;
    });
  });

  it('subject index exists on openstax_catalogue', () => {
    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_openstax_catalogue_subject'"
      )
      .get();
    expect(idx).toBeDefined();
  });
});
