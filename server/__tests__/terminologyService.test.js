/**
 * Terminology Service Tests — Multi-Subject Domain Model
 *
 * Tests headword + translation CRUD, search, review workflow,
 * inflection matching, domain-priority ranking, and segment matching.
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

    CREATE TABLE terminology_headwords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      english TEXT NOT NULL,
      pos TEXT,
      definition_en TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(english, pos)
    );

    CREATE TABLE terminology_translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      headword_id INTEGER NOT NULL,
      icelandic TEXT NOT NULL,
      definition_is TEXT,
      inflections TEXT,
      source TEXT,
      idordabanki_id INTEGER,
      notes TEXT,
      status TEXT DEFAULT 'proposed',
      proposed_by TEXT,
      proposed_by_name TEXT,
      approved_by TEXT,
      approved_by_name TEXT,
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (headword_id) REFERENCES terminology_headwords(id) ON DELETE CASCADE,
      UNIQUE(headword_id, icelandic)
    );

    CREATE TABLE terminology_translation_subjects (
      translation_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      PRIMARY KEY (translation_id, subject),
      FOREIGN KEY (translation_id) REFERENCES terminology_translations(id) ON DELETE CASCADE
    );

    CREATE TABLE book_subject_mapping (
      book_id INTEGER NOT NULL,
      primary_subject TEXT NOT NULL,
      PRIMARY KEY (book_id),
      FOREIGN KEY (book_id) REFERENCES registered_books(id) ON DELETE CASCADE
    );

    CREATE TABLE terminology_discussions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      headword_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      comment TEXT NOT NULL,
      proposed_translation TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (headword_id) REFERENCES terminology_headwords(id) ON DELETE CASCADE
    );

    INSERT INTO registered_books (slug, title_is) VALUES ('efnafraedi-2e', 'Efnafræði 2e');
    INSERT INTO registered_books (slug, title_is) VALUES ('liffraedi-2e', 'Líffræði 2e');

    INSERT INTO book_subject_mapping (book_id, primary_subject) VALUES (1, 'chemistry');
    INSERT INTO book_subject_mapping (book_id, primary_subject) VALUES (2, 'biology');
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
  db.exec('DELETE FROM terminology_translation_subjects');
  db.exec('DELETE FROM terminology_translations');
  db.exec('DELETE FROM terminology_headwords');
});

// --- Helpers ---

function insertHeadword(overrides = {}) {
  const defaults = { english: 'molecule', pos: null, definition_en: null };
  const h = { ...defaults, ...overrides };
  const result = db
    .prepare('INSERT INTO terminology_headwords (english, pos, definition_en) VALUES (?, ?, ?)')
    .run(h.english, h.pos, h.definition_en);
  return Number(result.lastInsertRowid);
}

function insertTranslation(headwordId, overrides = {}) {
  const defaults = {
    icelandic: 'sameind',
    source: 'manual',
    status: 'proposed',
    proposed_by: 'user1',
    proposed_by_name: 'Test User',
    inflections: null,
    notes: null,
    definition_is: null,
  };
  const t = { ...defaults, ...overrides };
  const result = db
    .prepare(
      `
      INSERT INTO terminology_translations
        (headword_id, icelandic, inflections, source, status, proposed_by, proposed_by_name, notes, definition_is)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      headwordId,
      t.icelandic,
      t.inflections,
      t.source,
      t.status,
      t.proposed_by,
      t.proposed_by_name,
      t.notes,
      t.definition_is
    );
  return Number(result.lastInsertRowid);
}

function addSubject(translationId, subject) {
  db.prepare(
    'INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
  ).run(translationId, subject);
}

/** Insert a headword with one translation + subjects — convenience for many tests */
function insertFullTerm(overrides = {}) {
  const hwId = insertHeadword({
    english: overrides.english || 'molecule',
    pos: overrides.pos || null,
    definition_en: overrides.definition_en || null,
  });
  const trId = insertTranslation(hwId, {
    icelandic: overrides.icelandic || 'sameind',
    source: overrides.source || 'manual',
    status: overrides.status || 'proposed',
    inflections: overrides.inflections || null,
    notes: overrides.notes || null,
    definition_is: overrides.definition_is || null,
    proposed_by: overrides.proposed_by || 'user1',
    proposed_by_name: overrides.proposed_by_name || 'Test User',
  });
  if (overrides.subjects) {
    for (const subj of overrides.subjects) {
      addSubject(trId, subj);
    }
  }
  return { hwId, trId };
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
    insertFullTerm({ english: 'molecule', icelandic: 'sameind' });
    insertFullTerm({ english: 'atom', icelandic: 'frumeind' });

    const result = terminologyService.searchTerms('molecule');
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].english).toBe('molecule');
  });

  it('finds terms by Icelandic text match', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind' });

    const result = terminologyService.searchTerms('sameind');
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].translations[0].icelandic).toBe('sameind');
  });

  it('filters by subject', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind', subjects: ['chemistry'] });
    insertFullTerm({ english: 'cell', icelandic: 'fruma', subjects: ['biology'] });

    const result = terminologyService.searchTerms('', { subject: 'chemistry' });
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].english).toBe('molecule');
  });

  it('filters by status', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });
    insertFullTerm({ english: 'atom', icelandic: 'frumeind', status: 'proposed' });

    const result = terminologyService.searchTerms('', { status: 'approved' });
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].english).toBe('molecule');
  });

  it('supports pagination (limit/offset, hasMore)', () => {
    insertFullTerm({ english: 'alpha', icelandic: 'alfa' });
    insertFullTerm({ english: 'beta', icelandic: 'beta' });
    insertFullTerm({ english: 'gamma', icelandic: 'gamma' });

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
    insertFullTerm({ english: 'molecule', icelandic: 'sameind' });
    const result = terminologyService.lookupTerm('m');
    expect(result).toEqual([]);
  });

  it('exact match ranked first (relevance=1)', () => {
    insertFullTerm({ english: 'ion', icelandic: 'jón' });
    insertFullTerm({ english: 'ionization', icelandic: 'jónun' });

    const result = terminologyService.lookupTerm('ion');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].english).toBe('ion');
  });

  it('finds partial match', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind' });

    const result = terminologyService.lookupTerm('molec');
    expect(result).toHaveLength(1);
    expect(result[0].english).toBe('molecule');
  });

  it('finds match by inflection', () => {
    insertFullTerm({
      english: 'reversible',
      icelandic: 'afturkræfur',
      inflections: JSON.stringify(['afturkræfan', 'afturkræfum', 'afturkræfs']),
    });

    const result = terminologyService.lookupTerm('afturkræfan');
    expect(result).toHaveLength(1);
    expect(result[0].english).toBe('reversible');
  });

  it('marks primary translation based on book subject', () => {
    const hwId = insertHeadword({ english: 'cell' });
    const trChem = insertTranslation(hwId, { icelandic: 'hólf', status: 'approved' });
    const trBio = insertTranslation(hwId, { icelandic: 'fruma', status: 'approved' });
    addSubject(trChem, 'chemistry');
    addSubject(trBio, 'biology');

    const result = terminologyService.lookupTerm('cell', 'liffraedi-2e');
    expect(result).toHaveLength(1);
    const bioTr = result[0].translations.find((t) => t.icelandic === 'fruma');
    const chemTr = result[0].translations.find((t) => t.icelandic === 'hólf');
    expect(bioTr.isPrimary).toBe(true);
    expect(chemTr.isPrimary).toBe(false);
  });
});

// =====================
// createTerm()
// =====================
describe('createTerm()', () => {
  it('creates headword with proposed translation', () => {
    const term = terminologyService.createTerm(
      { english: 'molecule', icelandic: 'sameind', subjects: ['chemistry'] },
      'user1',
      'Test User'
    );
    expect(term.english).toBe('molecule');
    expect(term.translations).toHaveLength(1);
    expect(term.translations[0].icelandic).toBe('sameind');
    expect(term.translations[0].status).toBe('proposed');
    expect(term.translations[0].subjects).toContain('chemistry');
  });

  it('throws on missing English', () => {
    expect(() => {
      terminologyService.createTerm({ icelandic: 'sameind' }, 'user1', 'Test User');
    }).toThrow('English term is required');
  });

  it('allows creating headword without translation (placeholder)', () => {
    const term = terminologyService.createTerm({ english: 'molecule' }, 'user1', 'Test User');
    expect(term.english).toBe('molecule');
    expect(term.translations).toHaveLength(0);
  });

  it('throws on duplicate English term (same pos)', () => {
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
});

// =====================
// addTranslation()
// =====================
describe('addTranslation()', () => {
  it('adds translation to existing headword', () => {
    const hwId = insertHeadword({ english: 'cell' });

    const tr = terminologyService.addTranslation(
      hwId,
      { icelandic: 'fruma', subjects: ['biology'], source: 'manual' },
      'user1',
      'Test User'
    );

    expect(tr.icelandic).toBe('fruma');
    expect(tr.subjects).toContain('biology');
  });

  it('throws on missing icelandic', () => {
    const hwId = insertHeadword({ english: 'cell' });
    expect(() => {
      terminologyService.addTranslation(hwId, {}, 'user1', 'Test User');
    }).toThrow('Icelandic translation is required');
  });

  it('throws on nonexistent headword', () => {
    expect(() => {
      terminologyService.addTranslation(99999, { icelandic: 'test' }, 'user1', 'Test');
    }).toThrow('Headword not found');
  });
});

// =====================
// updateHeadword()
// =====================
describe('updateHeadword()', () => {
  it('updates allowed fields (english, pos, definitionEn)', () => {
    const hwId = insertHeadword({ english: 'molecule', definition_en: 'A group of atoms' });

    const updated = terminologyService.updateHeadword(hwId, {
      definitionEn: 'Two or more atoms bonded together',
    });

    expect(updated.definitionEn).toBe('Two or more atoms bonded together');
  });

  it('throws Headword not found for nonexistent ID', () => {
    expect(() => {
      terminologyService.updateHeadword(99999, { english: 'test' });
    }).toThrow('Headword not found');
  });

  it('ignores fields not in allowedFields list', () => {
    const hwId = insertHeadword({ english: 'molecule' });

    const updated = terminologyService.updateHeadword(hwId, {
      fakeField: 'ignore me',
      status: 'approved',
    });

    expect(updated.english).toBe('molecule');
  });
});

// =====================
// updateTranslation()
// =====================
describe('updateTranslation()', () => {
  it('updates icelandic, notes, and subjects', () => {
    const hwId = insertHeadword({ english: 'molecule' });
    const trId = insertTranslation(hwId, { icelandic: 'sameind' });

    const updated = terminologyService.updateTranslation(trId, {
      icelandic: 'sameind (uppfært)',
      notes: 'Updated note',
      subjects: ['chemistry', 'physics'],
    });

    expect(updated.icelandic).toBe('sameind (uppfært)');
    expect(updated.notes).toBe('Updated note');
    expect(updated.subjects).toContain('chemistry');
    expect(updated.subjects).toContain('physics');
  });

  it('throws Translation not found for nonexistent ID', () => {
    expect(() => {
      terminologyService.updateTranslation(99999, { icelandic: 'test' });
    }).toThrow('Translation not found');
  });
});

// =====================
// approveTranslation()
// =====================
describe('approveTranslation()', () => {
  it('sets approved status on translation', () => {
    const { trId } = insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'proposed',
    });

    const result = terminologyService.approveTranslation(trId, 'admin1', 'Admin User');
    expect(result.translations[0].status).toBe('approved');
    expect(result.translations[0].approvedBy).toBe('admin1');
    expect(result.translations[0].approvedByName).toBe('Admin User');
    expect(result.translations[0].approvedAt).toBeTruthy();
  });

  it('idempotent when already approved', () => {
    const { trId } = insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'approved',
    });

    const result = terminologyService.approveTranslation(trId, 'admin2', 'Another Admin');
    expect(result.translations[0].status).toBe('approved');
    // Should not update approvedBy since already approved
    expect(result.translations[0].approvedBy).toBeNull();
  });

  it('throws Translation not found for missing ID', () => {
    expect(() => {
      terminologyService.approveTranslation(99999, 'admin1', 'Admin User');
    }).toThrow('Translation not found');
  });
});

// =====================
// disputeTranslation() + addDiscussion()
// =====================
describe('disputeTranslation() and addDiscussion()', () => {
  it('sets status to disputed on translation', () => {
    const { trId } = insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'proposed',
    });

    const result = terminologyService.disputeTranslation(trId, 'I disagree', 'user2', 'User Two');
    expect(result.translations[0].status).toBe('disputed');
  });

  it('adds discussion comment on headword', () => {
    const { trId } = insertFullTerm({ english: 'molecule', icelandic: 'sameind' });

    const result = terminologyService.disputeTranslation(
      trId,
      'Wrong translation',
      'user2',
      'User Two'
    );
    expect(result.discussions).toHaveLength(1);
    expect(result.discussions[0].comment).toBe('Wrong translation');
    expect(result.discussions[0].username).toBe('User Two');
  });

  it('adds discussion with proposed_translation', () => {
    const hwId = insertHeadword({ english: 'molecule' });
    insertTranslation(hwId, { icelandic: 'sameind' });

    const discussion = terminologyService.addDiscussion(
      hwId,
      'Better translation',
      'user3',
      'User Three',
      'sameindin'
    );
    expect(discussion.proposed_translation).toBe('sameindin');
    expect(discussion.comment).toBe('Better translation');
  });

  it('discussion links to correct headword', () => {
    const hw1 = insertHeadword({ english: 'molecule' });
    insertTranslation(hw1, { icelandic: 'sameind' });
    const hw2 = insertHeadword({ english: 'atom' });
    insertTranslation(hw2, { icelandic: 'frumeind' });

    terminologyService.addDiscussion(hw2, 'Comment on atom', 'user1', 'User One');

    const term1 = terminologyService.getHeadword(hw1);
    const term2 = terminologyService.getHeadword(hw2);
    expect(term1.discussions).toHaveLength(0);
    expect(term2.discussions).toHaveLength(1);
    expect(term2.discussions[0].headword_id).toBe(Number(hw2));
  });
});

// =====================
// deleteHeadword() / deleteTranslation()
// =====================
describe('deleteHeadword() and deleteTranslation()', () => {
  it('deletes headword cascading to translations', () => {
    const { hwId } = insertFullTerm({ english: 'molecule', icelandic: 'sameind' });

    const result = terminologyService.deleteHeadword(hwId);
    expect(result.success).toBe(true);

    const term = terminologyService.getHeadword(hwId);
    expect(term).toBeNull();
  });

  it('returns { success: false } for nonexistent ID', () => {
    const result = terminologyService.deleteHeadword(99999);
    expect(result.success).toBe(false);
  });

  it('deletes single translation without affecting headword', () => {
    const hwId = insertHeadword({ english: 'cell' });
    const tr1 = insertTranslation(hwId, { icelandic: 'fruma' });
    insertTranslation(hwId, { icelandic: 'hólf' });

    terminologyService.deleteTranslation(tr1);

    const hw = terminologyService.getHeadword(hwId);
    expect(hw).not.toBeNull();
    expect(hw.translations).toHaveLength(1);
    expect(hw.translations[0].icelandic).toBe('hólf');
  });
});

// =====================
// getReviewQueue()
// =====================
describe('getReviewQueue()', () => {
  it('returns only headwords with disputed/needs_review translations', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });
    insertFullTerm({ english: 'atom', icelandic: 'frumeind', status: 'disputed' });
    insertFullTerm({ english: 'ion', icelandic: 'jón', status: 'needs_review' });
    insertFullTerm({ english: 'bond', icelandic: 'tengi', status: 'proposed' });

    const queue = terminologyService.getReviewQueue();
    expect(queue).toHaveLength(2);
    const terms = queue.map((t) => t.english).sort();
    expect(terms).toEqual(['atom', 'ion']);
  });

  it('filters by subject', () => {
    insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'disputed',
      subjects: ['chemistry'],
    });
    insertFullTerm({
      english: 'cell',
      icelandic: 'fruma',
      status: 'disputed',
      subjects: ['biology'],
    });

    const queue = terminologyService.getReviewQueue({ subject: 'chemistry' });
    const terms = queue.map((t) => t.english);
    expect(terms).toContain('molecule');
    expect(terms).not.toContain('cell');
  });

  it('supports pagination (limit/offset)', () => {
    insertFullTerm({ english: 'alpha', icelandic: 'alfa', status: 'disputed' });
    insertFullTerm({ english: 'beta', icelandic: 'beta', status: 'disputed' });
    insertFullTerm({ english: 'gamma', icelandic: 'gamma', status: 'disputed' });

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
    insertFullTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });
    insertFullTerm({ english: 'atom', icelandic: 'frumeind', status: 'approved' });
    insertFullTerm({ english: 'ion', icelandic: 'jón', status: 'proposed' });
    insertFullTerm({ english: 'bond', icelandic: 'tengi', status: 'disputed' });

    const stats = terminologyService.getStats();
    expect(stats.byStatus.approved).toBe(2);
    expect(stats.byStatus.proposed).toBe(1);
    expect(stats.byStatus.disputed).toBe(1);
    expect(stats.byStatus.needsReview).toBe(0);
    expect(stats.total).toBe(4);
  });

  it('returns counts by subject', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind', subjects: ['chemistry'] });
    insertFullTerm({ english: 'atom', icelandic: 'frumeind', subjects: ['chemistry'] });
    insertFullTerm({ english: 'cell', icelandic: 'fruma', subjects: ['biology'] });

    const stats = terminologyService.getStats();
    expect(stats.bySubject.chemistry).toBe(2);
    expect(stats.bySubject.biology).toBe(1);
  });

  it('returns headword count', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind' });
    insertFullTerm({ english: 'atom', icelandic: 'frumeind' });

    const stats = terminologyService.getStats();
    expect(stats.headwords).toBe(2);
  });
});

// =====================
// Headword format (tested via getHeadword/createTerm)
// =====================
describe('headword format (via getHeadword)', () => {
  it('returns headword with nested translations array', () => {
    const hwId = insertHeadword({
      english: 'molecule',
      pos: 'noun',
      definition_en: 'A group of atoms',
    });
    const trId = insertTranslation(hwId, {
      icelandic: 'sameind',
      definition_is: 'Hópur frumeinda',
    });
    addSubject(trId, 'chemistry');

    const term = terminologyService.getHeadword(hwId);
    expect(term.id).toBe(hwId);
    expect(term.english).toBe('molecule');
    expect(term.pos).toBe('noun');
    expect(term.definitionEn).toBe('A group of atoms');
    expect(term.translations).toHaveLength(1);
    expect(term.translations[0].icelandic).toBe('sameind');
    expect(term.translations[0].definitionIs).toBe('Hópur frumeinda');
    expect(term.translations[0].subjects).toContain('chemistry');
  });

  it('parses JSON inflections array', () => {
    const hwId = insertHeadword({ english: 'reversible' });
    insertTranslation(hwId, {
      icelandic: 'afturkræfur',
      inflections: JSON.stringify(['afturkræfan', 'afturkræfum']),
    });

    const term = terminologyService.getHeadword(hwId);
    expect(term.translations[0].inflections).toEqual(['afturkræfan', 'afturkræfum']);
  });

  it('handles null inflections (returns [])', () => {
    const hwId = insertHeadword({ english: 'molecule' });
    insertTranslation(hwId, { icelandic: 'sameind', inflections: null });

    const term = terminologyService.getHeadword(hwId);
    expect(term.translations[0].inflections).toEqual([]);
  });

  it('includes discussions when fetching via getHeadword', () => {
    const hwId = insertHeadword({ english: 'molecule' });
    insertTranslation(hwId, { icelandic: 'sameind' });
    db.prepare(
      "INSERT INTO terminology_discussions (headword_id, user_id, username, comment) VALUES (?, 'u1', 'User', 'Test comment')"
    ).run(hwId);

    const term = terminologyService.getHeadword(hwId);
    expect(term.discussions).toHaveLength(1);
    expect(term.discussions[0].comment).toBe('Test comment');
  });

  it('returns null for nonexistent headword', () => {
    const term = terminologyService.getHeadword(99999);
    expect(term).toBeNull();
  });
});

// =====================
// findTermsInSegments()
// =====================
describe('findTermsInSegments()', () => {
  it('finds approved term in EN source text', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });

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
    insertFullTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });

    const segments = [
      { segmentId: 'seg1', enContent: 'A molecule is here', isContent: 'Frumeind er hér' },
    ];

    const result = terminologyService.findTermsInSegments(segments);
    expect(result.seg1.issues).toHaveLength(1);
    expect(result.seg1.issues[0].type).toBe('missing');
    expect(result.seg1.issues[0].expected).toBe('sameind');
  });

  it('no issues when approved term IS found in IS text', () => {
    insertFullTerm({ english: 'atom', icelandic: 'frumeind', status: 'approved' });

    const segments = [
      { segmentId: 'seg1', enContent: 'An atom is small', isContent: 'Frumeind er lítil' },
    ];

    const result = terminologyService.findTermsInSegments(segments);
    expect(result.seg1.matches).toHaveLength(1);
    expect(result.seg1.issues).toHaveLength(0);
  });

  it('matches inflected forms in IS text (no missing issue)', () => {
    insertFullTerm({
      english: 'reversible',
      icelandic: 'afturkræfur',
      status: 'approved',
      inflections: JSON.stringify(['afturkræfan', 'afturkræfa', 'afturkræfum']),
    });

    const segments = [
      {
        segmentId: 'seg1',
        enContent: 'This is a reversible reaction',
        isContent: 'Þetta er afturkræfa efnahvörf',
      },
    ];

    const result = terminologyService.findTermsInSegments(segments);
    expect(result.seg1.matches).toHaveLength(1);
    // Inflected form "afturkræfa" should match — no missing issue
    expect(result.seg1.issues).toHaveLength(0);
  });

  it('includes all translations in match info', () => {
    const hwId = insertHeadword({ english: 'cell' });
    const tr1 = insertTranslation(hwId, { icelandic: 'hólf', status: 'approved' });
    const tr2 = insertTranslation(hwId, { icelandic: 'fruma', status: 'approved' });
    addSubject(tr1, 'chemistry');
    addSubject(tr2, 'biology');

    const segments = [
      { segmentId: 'seg1', enContent: 'A cell contains', isContent: 'Fruma inniheldur' },
    ];

    const result = terminologyService.findTermsInSegments(segments);
    expect(result.seg1.matches).toHaveLength(1);
    expect(result.seg1.matches[0].translations).toHaveLength(2);
    // No missing issue because "fruma" (one of the approved translations) is present
    expect(result.seg1.issues).toHaveLength(0);
  });

  it('ranks primary translation by book domain', () => {
    const hwId = insertHeadword({ english: 'cell' });
    const tr1 = insertTranslation(hwId, { icelandic: 'hólf', status: 'approved' });
    const tr2 = insertTranslation(hwId, { icelandic: 'fruma', status: 'approved' });
    addSubject(tr1, 'chemistry');
    addSubject(tr2, 'biology');

    const segments = [
      { segmentId: 'seg1', enContent: 'A cell contains', isContent: 'Fruma inniheldur' },
    ];

    const result = terminologyService.findTermsInSegments(segments, 'liffraedi-2e');
    expect(result.seg1.matches[0].icelandic).toBe('fruma');
    expect(result.seg1.matches[0].isPrimary).toBe(true);
  });

  it('longer term takes priority over shorter substring (melting point vs melting)', () => {
    insertFullTerm({ english: 'melting', icelandic: 'bráðnun', status: 'approved' });
    insertFullTerm({ english: 'melting point', icelandic: 'bræðslumark', status: 'approved' });

    const segments = [
      {
        segmentId: 'seg1',
        enContent: 'The melting point of iron is high',
        isContent: 'Bræðslumark járns er hátt',
      },
    ];

    const result = terminologyService.findTermsInSegments(segments);
    // Should match "melting point" (longer), NOT "melting" (substring)
    expect(result.seg1.matches).toHaveLength(1);
    expect(result.seg1.matches[0].english).toBe('melting point');
    // "bræðslumark" is in the IS text — no missing issue
    expect(result.seg1.issues).toHaveLength(0);
  });

  it('matches both terms when they appear independently (not overlapping)', () => {
    insertFullTerm({ english: 'melting', icelandic: 'bráðnun', status: 'approved' });
    insertFullTerm({ english: 'melting point', icelandic: 'bræðslumark', status: 'approved' });

    const segments = [
      {
        segmentId: 'seg1',
        enContent: 'Melting occurs at the melting point',
        isContent: 'Bráðnun á sér stað við bræðslumark',
      },
    ];

    const result = terminologyService.findTermsInSegments(segments);
    // "melting point" matches at position 25, "melting" at position 0 — no overlap
    expect(result.seg1.matches).toHaveLength(2);
    expect(result.seg1.issues).toHaveLength(0);
  });
});

// =====================
// importGlossaryTerms()
// =====================
describe('importGlossaryTerms()', () => {
  it('creates headword + translation for new terms', () => {
    const result = terminologyService.importGlossaryTerms(
      [{ english: 'molecule', icelandic: 'sameind', definition_en: 'A group of atoms' }],
      'user1',
      'Test User',
      { subjects: ['chemistry'] }
    );

    expect(result.added).toBe(1);
    const terms = terminologyService.searchTerms('molecule');
    expect(terms.terms).toHaveLength(1);
    expect(terms.terms[0].translations[0].subjects).toContain('chemistry');
  });

  it('skips empty english terms', () => {
    const result = terminologyService.importGlossaryTerms(
      [{ english: '', icelandic: 'sameind' }],
      'user1',
      'Test User'
    );
    expect(result.skipped).toBe(1);
  });

  it('enriches existing approved translation with definition', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });

    const result = terminologyService.importGlossaryTerms(
      [{ english: 'molecule', icelandic: 'sameind', definition_is: 'Hópur frumeinda' }],
      'user1',
      'Test User'
    );

    expect(result.enriched).toBe(1);
    const terms = terminologyService.searchTerms('molecule');
    expect(terms.terms[0].translations[0].definitionIs).toBe('Hópur frumeinda');
  });
});
