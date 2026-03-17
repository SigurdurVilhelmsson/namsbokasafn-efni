/**
 * Terminology Service Tests
 *
 * Tests CRUD, search, review workflow, and segment matching.
 * Uses in-memory better-sqlite3 DB with test injection.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const terminologyService = require('../services/terminologyService');

let db;

function createTestDb() {
  const testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');

  testDb.exec(`
    CREATE TABLE registered_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title_is TEXT,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE terminology_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER,
      english TEXT NOT NULL,
      icelandic TEXT,
      alternatives TEXT,
      category TEXT,
      notes TEXT,
      source TEXT,
      source_chapter INTEGER,
      status TEXT DEFAULT 'proposed',
      proposed_by TEXT,
      proposed_by_name TEXT,
      approved_by TEXT,
      approved_by_name TEXT,
      approved_at DATETIME,
      definition_en TEXT,
      definition_is TEXT,
      pos TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(english, pos, book_id)
    );

    CREATE TABLE terminology_discussions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      comment TEXT NOT NULL,
      proposed_translation TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (term_id) REFERENCES terminology_terms(id) ON DELETE CASCADE
    );

    CREATE TABLE terminology_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_name TEXT NOT NULL,
      file_name TEXT,
      imported_by TEXT NOT NULL,
      imported_by_name TEXT,
      imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      terms_added INTEGER DEFAULT 0,
      terms_updated INTEGER DEFAULT 0,
      terms_skipped INTEGER DEFAULT 0,
      error_message TEXT
    );

    INSERT INTO registered_books (slug, title_is) VALUES ('efnafraedi-2e', 'Efnafræði 2e');
    INSERT INTO registered_books (slug, title_is) VALUES ('liffraedi-2e', 'Líffræði 2e');
  `);

  return testDb;
}

beforeAll(() => {
  db = createTestDb();
  terminologyService._setTestDb(db);
});

afterAll(() => {
  terminologyService._setTestDb(null);
  db.close();
});

beforeEach(() => {
  db.exec('DELETE FROM terminology_discussions');
  db.exec('DELETE FROM terminology_imports');
  db.exec('DELETE FROM terminology_terms');
});

// --- Helper ---
function insertTerm(overrides = {}) {
  const defaults = {
    english: 'molecule',
    icelandic: 'sameind',
    category: 'fundamental',
    source: 'manual',
    status: 'proposed',
    book_id: null,
    proposed_by: 'user1',
    proposed_by_name: 'Test User',
  };
  const t = { ...defaults, ...overrides };
  const result = db
    .prepare(
      `
    INSERT INTO terminology_terms (english, icelandic, category, source, status, book_id, proposed_by, proposed_by_name, alternatives, definition_en, definition_is, pos)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      t.english,
      t.icelandic,
      t.category,
      t.source,
      t.status,
      t.book_id,
      t.proposed_by,
      t.proposed_by_name,
      t.alternatives || null,
      t.definition_en || null,
      t.definition_is || null,
      t.pos || null
    );
  return result.lastInsertRowid;
}

// =====================
// searchTerms()
// =====================
describe('searchTerms()', () => {
  it('returns empty when no terms exist', () => {
    const result = terminologyService.searchTerms('');
    expect(result.terms).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it('finds terms by English text match', () => {
    insertTerm({ english: 'molecule', icelandic: 'sameind' });
    insertTerm({ english: 'atom', icelandic: 'frumeind' });

    const result = terminologyService.searchTerms('molecule');
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].english).toBe('molecule');
  });

  it('finds terms by Icelandic text match', () => {
    insertTerm({ english: 'molecule', icelandic: 'sameind' });

    const result = terminologyService.searchTerms('sameind');
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].icelandic).toBe('sameind');
  });

  it('filters by category', () => {
    insertTerm({ english: 'molecule', icelandic: 'sameind', category: 'fundamental' });
    insertTerm({ english: 'bond', icelandic: 'tengi', category: 'bonding' });

    const result = terminologyService.searchTerms('', { category: 'bonding' });
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].english).toBe('bond');
  });

  it('filters by status', () => {
    insertTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });
    insertTerm({ english: 'atom', icelandic: 'frumeind', status: 'proposed' });

    const result = terminologyService.searchTerms('', { status: 'approved' });
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].english).toBe('molecule');
  });

  it('supports pagination (limit/offset, hasMore)', () => {
    insertTerm({ english: 'alpha', icelandic: 'alfa' });
    insertTerm({ english: 'beta', icelandic: 'beta' });
    insertTerm({ english: 'gamma', icelandic: 'gamma' });

    const page1 = terminologyService.searchTerms('', { limit: 2, offset: 0 });
    expect(page1.terms).toHaveLength(2);
    expect(page1.pagination.hasMore).toBe(true);
    expect(page1.pagination.total).toBe(3);

    const page2 = terminologyService.searchTerms('', { limit: 2, offset: 2 });
    expect(page2.terms).toHaveLength(1);
    expect(page2.pagination.hasMore).toBe(false);
  });
});

// =====================
// lookupTerm()
// =====================
describe('lookupTerm()', () => {
  it('returns empty for short query (< 2 chars)', () => {
    insertTerm({ english: 'molecule', icelandic: 'sameind' });
    const result = terminologyService.lookupTerm('m');
    expect(result).toEqual([]);
  });

  it('exact match ranked first (relevance=1)', () => {
    insertTerm({ english: 'ion', icelandic: 'jón' });
    insertTerm({ english: 'ionization', icelandic: 'jónun' });

    const result = terminologyService.lookupTerm('ion');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].english).toBe('ion');
  });

  it('finds partial match', () => {
    insertTerm({ english: 'molecule', icelandic: 'sameind' });

    const result = terminologyService.lookupTerm('molec');
    expect(result).toHaveLength(1);
    expect(result[0].english).toBe('molecule');
  });

  it('filters by book scope (returns global + book-specific)', () => {
    insertTerm({ english: 'molecule', icelandic: 'sameind', book_id: null });
    insertTerm({ english: 'cell', icelandic: 'fruma', book_id: 2 });

    // Lookup with book_id=1 should NOT return book_id=2 terms
    const result = terminologyService.lookupTerm('cell', 1);
    expect(result).toHaveLength(0);

    // Lookup with book_id=2 should return the cell term
    const result2 = terminologyService.lookupTerm('cell', 2);
    expect(result2).toHaveLength(1);

    // Global terms always returned
    const result3 = terminologyService.lookupTerm('molecule', 2);
    expect(result3).toHaveLength(1);
  });
});

// =====================
// createTerm()
// =====================
describe('createTerm()', () => {
  it('creates with proposed status', () => {
    const term = terminologyService.createTerm(
      { english: 'molecule', icelandic: 'sameind', category: 'fundamental' },
      'user1',
      'Test User'
    );
    expect(term.status).toBe('proposed');
    expect(term.english).toBe('molecule');
    expect(term.icelandic).toBe('sameind');
    expect(term.proposedBy).toBe('user1');
  });

  it('throws on missing English', () => {
    expect(() => {
      terminologyService.createTerm({ icelandic: 'sameind' }, 'user1', 'Test User');
    }).toThrow('English term is required');
  });

  it('allows creating term without Icelandic (placeholder)', () => {
    const term = terminologyService.createTerm({ english: 'molecule' }, 'user1', 'Test User');
    expect(term.english).toBe('molecule');
    expect(term.icelandic).toBeNull();
  });

  it('throws on duplicate English term (same book_id)', () => {
    terminologyService.createTerm(
      { english: 'molecule', icelandic: 'sameind' },
      'user1',
      'Test User'
    );
    expect(() => {
      terminologyService.createTerm(
        { english: 'molecule', icelandic: 'sameind2' },
        'user1',
        'Test User'
      );
    }).toThrow(/already exists/);
  });

  it('throws on invalid category', () => {
    expect(() => {
      terminologyService.createTerm(
        { english: 'molecule', icelandic: 'sameind', category: 'invalid-cat' },
        'user1',
        'Test User'
      );
    }).toThrow(/Invalid category/);
  });
});

// =====================
// updateTerm()
// =====================
describe('updateTerm()', () => {
  it('updates allowed fields (icelandic, category, notes)', () => {
    const id = insertTerm({ english: 'molecule', icelandic: 'sameind', category: 'fundamental' });

    const updated = terminologyService.updateTerm(id, {
      icelandic: 'sameind (uppfært)',
      category: 'structure',
      notes: 'Updated note',
    });

    expect(updated.icelandic).toBe('sameind (uppfært)');
    expect(updated.category).toBe('structure');
    expect(updated.notes).toBe('Updated note');
  });

  it('throws Term not found for nonexistent ID', () => {
    expect(() => {
      terminologyService.updateTerm(99999, { icelandic: 'test' });
    }).toThrow('Term not found');
  });

  it('ignores fields not in allowedFields list', () => {
    const id = insertTerm({ english: 'molecule', icelandic: 'sameind' });

    const updated = terminologyService.updateTerm(id, {
      english: 'changed-english',
      status: 'approved',
      fakeField: 'ignore me',
    });

    // english and status should not change
    expect(updated.english).toBe('molecule');
    expect(updated.status).toBe('proposed');
  });
});

// =====================
// approveTerm()
// =====================
describe('approveTerm()', () => {
  it('sets approved status, approved_by, approved_by_name', () => {
    const id = insertTerm({ english: 'molecule', icelandic: 'sameind', status: 'proposed' });

    const approved = terminologyService.approveTerm(id, 'admin1', 'Admin User');
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe('admin1');
    expect(approved.approvedByName).toBe('Admin User');
    expect(approved.approvedAt).toBeTruthy();
  });

  it('idempotent when already approved (returns same term)', () => {
    const id = insertTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });

    const result = terminologyService.approveTerm(id, 'admin2', 'Another Admin');
    expect(result.status).toBe('approved');
    // Should not update approvedBy since it was already approved
    expect(result.approvedBy).toBeNull(); // original had no approved_by set
  });

  it('throws Term not found for missing ID', () => {
    expect(() => {
      terminologyService.approveTerm(99999, 'admin1', 'Admin User');
    }).toThrow('Term not found');
  });
});

// =====================
// disputeTerm() + addDiscussion()
// =====================
describe('disputeTerm() and addDiscussion()', () => {
  it('sets status to disputed', () => {
    const id = insertTerm({ english: 'molecule', icelandic: 'sameind', status: 'proposed' });

    const result = terminologyService.disputeTerm(id, 'I disagree', 'user2', 'User Two');
    expect(result.status).toBe('disputed');
  });

  it('adds discussion comment', () => {
    const id = insertTerm({ english: 'molecule', icelandic: 'sameind' });

    const result = terminologyService.disputeTerm(id, 'Wrong translation', 'user2', 'User Two');
    expect(result.discussions).toHaveLength(1);
    expect(result.discussions[0].comment).toBe('Wrong translation');
    expect(result.discussions[0].username).toBe('User Two');
  });

  it('adds discussion with proposed_translation', () => {
    const id = insertTerm({ english: 'molecule', icelandic: 'sameind' });

    const discussion = terminologyService.addDiscussion(
      id,
      'Better translation',
      'user3',
      'User Three',
      'sameindin'
    );
    expect(discussion.proposed_translation).toBe('sameindin');
    expect(discussion.comment).toBe('Better translation');
  });

  it('discussion links to correct term_id', () => {
    const id1 = insertTerm({ english: 'molecule', icelandic: 'sameind' });
    const id2 = insertTerm({ english: 'atom', icelandic: 'frumeind' });

    terminologyService.addDiscussion(id2, 'Comment on atom', 'user1', 'User One');

    const term1 = terminologyService.getTerm(id1);
    const term2 = terminologyService.getTerm(id2);
    expect(term1.discussions).toHaveLength(0);
    expect(term2.discussions).toHaveLength(1);
    expect(term2.discussions[0].term_id).toBe(Number(id2));
  });
});

// =====================
// deleteTerm()
// =====================
describe('deleteTerm()', () => {
  it('deletes existing term, returns { success: true }', () => {
    const id = insertTerm({ english: 'molecule', icelandic: 'sameind' });

    const result = terminologyService.deleteTerm(id);
    expect(result.success).toBe(true);

    // Confirm it's gone
    const term = terminologyService.getTerm(id);
    expect(term).toBeNull();
  });

  it('returns { success: false } for nonexistent ID', () => {
    const result = terminologyService.deleteTerm(99999);
    expect(result.success).toBe(false);
  });
});

// =====================
// getReviewQueue()
// =====================
describe('getReviewQueue()', () => {
  it('returns only disputed and needs_review terms', () => {
    insertTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });
    insertTerm({ english: 'atom', icelandic: 'frumeind', status: 'disputed' });
    insertTerm({ english: 'ion', icelandic: 'jón', status: 'needs_review' });
    insertTerm({ english: 'bond', icelandic: 'tengi', status: 'proposed' });

    const queue = terminologyService.getReviewQueue();
    expect(queue).toHaveLength(2);
    const terms = queue.map((t) => t.english).sort();
    expect(terms).toEqual(['atom', 'ion']);
  });

  it('filters by bookId', () => {
    insertTerm({ english: 'molecule', icelandic: 'sameind', status: 'disputed', book_id: 1 });
    insertTerm({ english: 'cell', icelandic: 'fruma', status: 'disputed', book_id: 2 });

    const queue = terminologyService.getReviewQueue({ bookId: 1 });
    // Should return book_id=1 terms and global (null) terms
    const englishTerms = queue.map((t) => t.english);
    expect(englishTerms).toContain('molecule');
    expect(englishTerms).not.toContain('cell');
  });

  it('supports pagination (limit/offset)', () => {
    insertTerm({ english: 'alpha', icelandic: 'alfa', status: 'disputed' });
    insertTerm({ english: 'beta', icelandic: 'beta', status: 'disputed' });
    insertTerm({ english: 'gamma', icelandic: 'gamma', status: 'disputed' });

    const page1 = terminologyService.getReviewQueue({ limit: 2, offset: 0 });
    expect(page1).toHaveLength(2);

    const page2 = terminologyService.getReviewQueue({ limit: 2, offset: 2 });
    expect(page2).toHaveLength(1);
  });
});

// =====================
// getStats()
// =====================
describe('getStats()', () => {
  it('returns counts by status', () => {
    insertTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });
    insertTerm({ english: 'atom', icelandic: 'frumeind', status: 'approved' });
    insertTerm({ english: 'ion', icelandic: 'jón', status: 'proposed' });
    insertTerm({ english: 'bond', icelandic: 'tengi', status: 'disputed' });

    const stats = terminologyService.getStats();
    expect(stats.byStatus.approved).toBe(2);
    expect(stats.byStatus.proposed).toBe(1);
    expect(stats.byStatus.disputed).toBe(1);
    expect(stats.byStatus.needsReview).toBe(0);
    expect(stats.total).toBe(4);
  });

  it('returns counts by category', () => {
    insertTerm({ english: 'molecule', icelandic: 'sameind', category: 'fundamental' });
    insertTerm({ english: 'atom', icelandic: 'frumeind', category: 'fundamental' });
    insertTerm({ english: 'bond', icelandic: 'tengi', category: 'bonding' });

    const stats = terminologyService.getStats();
    expect(stats.byCategory.fundamental).toBe(2);
    expect(stats.byCategory.bonding).toBe(1);
  });
});

// =====================
// formatTerm() (tested indirectly)
// =====================
describe('formatTerm() (via getTerm/createTerm output)', () => {
  it('maps DB columns to API camelCase names', () => {
    const id = insertTerm({
      english: 'molecule',
      icelandic: 'sameind',
      book_id: 1,
    });

    const term = terminologyService.getTerm(id);
    // camelCase keys
    expect(term).toHaveProperty('bookId');
    expect(term).toHaveProperty('sourceChapter');
    expect(term).toHaveProperty('proposedBy');
    expect(term).toHaveProperty('createdAt');
    // no snake_case keys in formatted output
    expect(term).not.toHaveProperty('book_id');
    expect(term).not.toHaveProperty('source_chapter');
  });

  it('parses JSON alternatives array', () => {
    const id = insertTerm({
      english: 'molecule',
      icelandic: 'sameind',
      alternatives: JSON.stringify(['sameindafræði', 'efnasameind']),
    });

    const term = terminologyService.getTerm(id);
    expect(term.alternatives).toEqual(['sameindafræði', 'efnasameind']);
  });

  it('handles null alternatives (returns [])', () => {
    const id = insertTerm({
      english: 'molecule',
      icelandic: 'sameind',
      alternatives: null,
    });

    const term = terminologyService.getTerm(id);
    expect(term.alternatives).toEqual([]);
  });

  it('handles null definition_en, definition_is, pos (returns null)', () => {
    const id = insertTerm({
      english: 'molecule',
      icelandic: 'sameind',
    });

    const term = terminologyService.getTerm(id);
    expect(term.definitionEn).toBeNull();
    expect(term.definitionIs).toBeNull();
    expect(term.pos).toBeNull();
  });
});

// =====================
// findTermsInSegments()
// =====================
describe('findTermsInSegments()', () => {
  it('finds approved term in EN source text', () => {
    insertTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });

    const segments = [
      {
        segmentId: 'seg1',
        enContent: 'A molecule is made of atoms',
        isContent: 'Sameind er gerð úr frumeinddum',
      },
    ];

    const result = terminologyService.findTermsInSegments(segments);
    expect(result.seg1.matches).toHaveLength(1);
    expect(result.seg1.matches[0].english).toBe('molecule');
  });

  it('reports missing issue when IS translation not found', () => {
    insertTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });

    const segments = [
      { segmentId: 'seg1', enContent: 'A molecule is here', isContent: 'Frumeind er hér' },
    ];

    const result = terminologyService.findTermsInSegments(segments);
    expect(result.seg1.issues).toHaveLength(1);
    expect(result.seg1.issues[0].type).toBe('missing');
    expect(result.seg1.issues[0].expected).toBe('sameind');
  });

  it('accepts alternative translations without flagging', () => {
    insertTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'approved',
      alternatives: JSON.stringify(['sameindir']),
    });

    const segments = [
      { segmentId: 'seg1', enContent: 'A molecule is here', isContent: 'Sameindir eru hér' },
    ];

    const result = terminologyService.findTermsInSegments(segments);
    // Should have a match but NO issue because alternative was used
    expect(result.seg1.matches).toHaveLength(1);
    expect(result.seg1.issues).toHaveLength(0);
  });

  it('no issues when approved term IS found in IS text', () => {
    insertTerm({ english: 'atom', icelandic: 'frumeind', status: 'approved' });

    const segments = [
      { segmentId: 'seg1', enContent: 'An atom is small', isContent: 'Frumeind er lítil' },
    ];

    const result = terminologyService.findTermsInSegments(segments);
    expect(result.seg1.matches).toHaveLength(1);
    expect(result.seg1.issues).toHaveLength(0);
  });
});
