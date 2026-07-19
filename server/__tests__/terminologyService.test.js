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

  it('stamps isFallback and sorts primary → in-scope → fallback (item 18)', () => {
    const hwId = insertHeadword({ english: 'cell' });
    // Inserted worst-first so DB order alone would fail the assertion.
    const trChem = insertTranslation(hwId, { icelandic: 'hólf', status: 'approved' });
    insertTranslation(hwId, { icelandic: 'eining', status: 'approved' }); // untagged, no addSubject call
    const trBio = insertTranslation(hwId, { icelandic: 'fruma', status: 'approved' });
    addSubject(trChem, 'chemistry');
    addSubject(trBio, 'biology');

    const result = terminologyService.lookupTerm('cell', 'liffraedi-2e'); // biology book
    expect(result[0].translations.map((t) => t.icelandic)).toEqual(['fruma', 'eining', 'hólf']);
    expect(result[0].translations[0].isPrimary).toBe(true);
    expect(result[0].translations[0].isFallback).toBe(false);
    expect(result[0].translations[1].isFallback).toBe(false); // untagged = in-scope
    expect(result[0].translations[2].isFallback).toBe(true); // chemistry in a biology book
  });

  it('approved outranks proposed within a tier (item 18)', () => {
    const hwId = insertHeadword({ english: 'bond' });
    const trProposed = insertTranslation(hwId, { icelandic: 'tengsl', status: 'proposed' });
    const trApproved = insertTranslation(hwId, { icelandic: 'tengi', status: 'approved' });
    addSubject(trProposed, 'chemistry');
    addSubject(trApproved, 'chemistry');

    const result = terminologyService.lookupTerm('bond', 'efnafraedi-2e');
    expect(result[0].translations.map((t) => t.icelandic)).toEqual(['tengi', 'tengsl']);
  });

  it('unmapped book: nothing primary, nothing fallback, approved-first order', () => {
    const hwId = insertHeadword({ english: 'cell' });
    const trProposed = insertTranslation(hwId, { icelandic: 'fruma', status: 'proposed' });
    const trApproved = insertTranslation(hwId, { icelandic: 'hólf', status: 'approved' });
    addSubject(trProposed, 'biology');
    addSubject(trApproved, 'chemistry');

    const result = terminologyService.lookupTerm('cell', null);
    expect(result[0].translations.every((t) => t.isPrimary === false)).toBe(true);
    expect(result[0].translations.every((t) => t.isFallback === false)).toBe(true);
    expect(result[0].translations[0].icelandic).toBe('hólf');
  });
});

// =====================
// translationTier() — item 18 shared scoping policy
// =====================
describe('translationTier()', () => {
  it('returns in-scope for every translation when the book has no subject', () => {
    expect(terminologyService.translationTier(['biology'], null)).toBe('in-scope');
    expect(terminologyService.translationTier([], null)).toBe('in-scope');
  });

  it('returns primary when tagged with the book subject', () => {
    expect(terminologyService.translationTier(['chemistry'], 'chemistry')).toBe('primary');
    expect(terminologyService.translationTier(['biology', 'chemistry'], 'chemistry')).toBe(
      'primary'
    );
  });

  it('returns in-scope for untagged and general-tagged translations', () => {
    expect(terminologyService.translationTier([], 'chemistry')).toBe('in-scope');
    expect(terminologyService.translationTier(['general'], 'chemistry')).toBe('in-scope');
    expect(terminologyService.translationTier(['biology', 'general'], 'chemistry')).toBe(
      'in-scope'
    );
  });

  it('returns fallback only when all tags are foreign subjects', () => {
    expect(terminologyService.translationTier(['biology'], 'chemistry')).toBe('fallback');
    expect(terminologyService.translationTier(['biology', 'physics'], 'chemistry')).toBe(
      'fallback'
    );
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
// rejectTranslation() — item 19
// =====================
describe('rejectTranslation()', () => {
  it('exposes rejected as the fifth status', () => {
    expect(terminologyService.TERM_STATUSES).toEqual([
      'approved',
      'proposed',
      'disputed',
      'needs_review',
      'rejected',
    ]);
  });

  it('sets status rejected and records a discussion entry with actor + reason', () => {
    const { hwId, trId } = insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'proposed',
    });
    const hw = terminologyService.rejectTranslation(trId, 'u9', 'Head Editor', 'rangt fag');
    expect(hw.translations[0].status).toBe('rejected');
    const disc = db
      .prepare('SELECT * FROM terminology_discussions WHERE headword_id = ?')
      .all(hwId);
    expect(disc).toHaveLength(1);
    expect(disc[0].comment).toBe('Hafnað: rangt fag');
    expect(disc[0].username).toBe('Head Editor');
    expect(disc[0].user_id).toBe('u9');
  });

  it('records a bare "Hafnað" entry when no reason is given', () => {
    const { hwId, trId } = insertFullTerm({ english: 'atom', icelandic: 'frumeind' });
    terminologyService.rejectTranslation(trId, 'u9', 'Head Editor');
    const disc = db
      .prepare('SELECT comment FROM terminology_discussions WHERE headword_id = ?')
      .get(hwId);
    expect(disc.comment).toBe('Hafnað');
  });

  it('rejects from any prior status, including approved', () => {
    const { trId } = insertFullTerm({ english: 'ion', icelandic: 'jón', status: 'approved' });
    const hw = terminologyService.rejectTranslation(trId, 'u9', 'HE', '');
    expect(hw.translations[0].status).toBe('rejected');
  });

  it('approve after reject works (un-reject for free)', () => {
    const { trId } = insertFullTerm({ english: 'bond', icelandic: 'tengi', status: 'proposed' });
    terminologyService.rejectTranslation(trId, 'u9', 'HE', '');
    const hw = terminologyService.approveTranslation(trId, 'u9', 'HE');
    expect(hw.translations[0].status).toBe('approved');
  });

  it('throws on unknown translation id', () => {
    expect(() => terminologyService.rejectTranslation(9999, 'u', 'U', '')).toThrow(
      'Translation not found'
    );
  });

  it('throws when reason exceeds 500 characters, leaving status unchanged', () => {
    const { trId } = insertFullTerm({ english: 'gas', icelandic: 'gas', status: 'proposed' });
    expect(() => terminologyService.rejectTranslation(trId, 'u', 'U', 'a'.repeat(501))).toThrow(
      'reason must be a string of at most 500 characters'
    );
    const row = db.prepare('SELECT status FROM terminology_translations WHERE id = ?').get(trId);
    expect(row.status).toBe('proposed');
  });

  it('rejected translations vanish from lookupTerm and findTermsInSegments', () => {
    const { trId } = insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'approved',
    });
    terminologyService.rejectTranslation(trId, 'u', 'U', '');
    expect(terminologyService.lookupTerm('molecule')).toHaveLength(0);
    const res = terminologyService.findTermsInSegments([
      { segmentId: 's1', enContent: 'a molecule here', isContent: 'texti' },
    ]);
    expect(res.s1.matches).toHaveLength(0);
    expect(res.s1.issues).toHaveLength(0);
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

  it('counts rejected translations (item 19)', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind', status: 'rejected' });
    insertFullTerm({ english: 'atom', icelandic: 'frumeind', status: 'approved' });
    const stats = terminologyService.getStats();
    expect(stats.byStatus.rejected).toBe(1);
    expect(stats.byStatus.approved).toBe(1);
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
// findTermsInSegments() — subject scoping (item N)
// =====================
describe('findTermsInSegments() — subject scoping', () => {
  const seg = (enContent, isContent) => [{ segmentId: 's', enContent, isContent }];

  it('surfaces a fallback match when the only translation is another subject — no issues', () => {
    // Item 18: "mole" with only a biology translation surfaces in a chemistry
    // book as a BADGED fallback suggestion (isFallback) — but never as a QA
    // issue: a chemistry editor is not warned for skipping a biology term.
    const hw = insertHeadword({ english: 'mole' });
    const tr = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'approved' });
    addSubject(tr, 'biology');

    const result = terminologyService.findTermsInSegments(
      seg('one mole of carbon', 'eitt kolefnismagn'),
      'efnafraedi-2e'
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].isFallback).toBe(true);
    expect(result.s.matches[0].icelandic).toBe('moldvarpa');
    expect(result.s.matches[0].isPrimary).toBe(false);
    expect(result.s.matches[0].translations[0].isFallback).toBe(true);
    // The IS text does NOT contain 'moldvarpa' — an in-scope term would issue here.
    expect(result.s.issues).toHaveLength(0);
  });

  it('keeps an in-subject translation', () => {
    const hw = insertHeadword({ english: 'acid' });
    const tr = insertTranslation(hw, { icelandic: 'sýra', status: 'approved' });
    addSubject(tr, 'chemistry');

    const result = terminologyService.findTermsInSegments(
      seg('an acid reacts', 'sýra hvarfast'),
      'efnafraedi-2e'
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].icelandic).toBe('sýra');
  });

  it('keeps a general-tagged translation', () => {
    const hw = insertHeadword({ english: 'energy' });
    const tr = insertTranslation(hw, { icelandic: 'orka', status: 'approved' });
    addSubject(tr, 'general');

    const result = terminologyService.findTermsInSegments(
      seg('energy flows', 'orka flæðir'),
      'efnafraedi-2e'
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].icelandic).toBe('orka');
  });

  it('keeps an untagged translation (no subjects)', () => {
    const hw = insertHeadword({ english: 'thing' });
    insertTranslation(hw, { icelandic: 'hlutur', status: 'approved' }); // no addSubject

    const result = terminologyService.findTermsInSegments(
      seg('a thing here', 'hlutur hér'),
      'efnafraedi-2e'
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].icelandic).toBe('hlutur');
  });

  it('homograph: keeps only the in-subject sense in primary + dropdown', () => {
    const hw = insertHeadword({ english: 'mole' });
    const chem = insertTranslation(hw, { icelandic: 'mól', status: 'approved' });
    const bio = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'approved' });
    addSubject(chem, 'chemistry');
    addSubject(bio, 'biology');

    const result = terminologyService.findTermsInSegments(
      seg('one mole of', 'eitt mól af'),
      'efnafraedi-2e'
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].translations).toHaveLength(1);
    expect(result.s.matches[0].icelandic).toBe('mól');
  });

  it('missing-term issue uses only the in-subject approved translation', () => {
    // chem 'mól' + bio 'moldvarpa'; IS contains the biology homograph but not 'mól'.
    // Before scoping: anyFound is true (moldvarpa present) → no issue (wrong).
    // After scoping: only 'mól' counts → it's absent → one issue expecting 'mól'.
    const hw = insertHeadword({ english: 'mole' });
    const chem = insertTranslation(hw, { icelandic: 'mól', status: 'approved' });
    const bio = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'approved' });
    addSubject(chem, 'chemistry');
    addSubject(bio, 'biology');

    const result = terminologyService.findTermsInSegments(
      seg('one mole of', 'ein moldvarpa grefur'),
      'efnafraedi-2e'
    );
    expect(result.s.issues).toHaveLength(1);
    expect(result.s.issues[0].expected).toBe('mól');
  });

  it('no book subject (unmapped) → no filtering, all senses kept', () => {
    const hw = insertHeadword({ english: 'mole' });
    const chem = insertTranslation(hw, { icelandic: 'mól', status: 'approved' });
    const bio = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'approved' });
    addSubject(chem, 'chemistry');
    addSubject(bio, 'biology');

    const result = terminologyService.findTermsInSegments(seg('one mole of', 'eitt mól af'));
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].translations).toHaveLength(2);
  });

  it('fallback match prefers the approved foreign translation over a proposed one', () => {
    const hw = insertHeadword({ english: 'mole' });
    // Proposed inserted FIRST so DB order alone would rank it first.
    const trProposed = insertTranslation(hw, { icelandic: 'jarðvarpa', status: 'proposed' });
    const trApproved = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'approved' });
    addSubject(trProposed, 'biology');
    addSubject(trApproved, 'biology');

    const result = terminologyService.findTermsInSegments(
      seg('one mole of carbon', 'eitt kolefnismagn'),
      'efnafraedi-2e'
    );
    expect(result.s.matches[0].icelandic).toBe('moldvarpa');
    expect(result.s.matches[0].translations.map((t) => t.icelandic)).toEqual([
      'moldvarpa',
      'jarðvarpa',
    ]);
  });

  it('fallback with only proposed translations still surfaces, marked proposed', () => {
    const hw = insertHeadword({ english: 'mole' });
    const tr = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'proposed' });
    addSubject(tr, 'biology');

    const result = terminologyService.findTermsInSegments(
      seg('one mole of carbon', 'eitt kolefnismagn'),
      'efnafraedi-2e'
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].isFallback).toBe(true);
    expect(result.s.matches[0].status).toBe('proposed');
    expect(result.s.issues).toHaveLength(0);
  });

  it('normal (in-scope) matches carry isFallback: false at both levels', () => {
    const hw = insertHeadword({ english: 'acid' });
    const tr = insertTranslation(hw, { icelandic: 'sýra', status: 'approved' });
    addSubject(tr, 'chemistry');

    const result = terminologyService.findTermsInSegments(
      seg('an acid reacts', 'sýra hvarfast'),
      'efnafraedi-2e'
    );
    expect(result.s.matches[0].isFallback).toBe(false);
    expect(result.s.matches[0].translations[0].isFallback).toBe(false);
  });

  it('a longer fallback term never shadows an overlapping in-scope term (in-scope wins)', () => {
    // chemistry book: in-scope 'electron' (approved 'rafeind') overlaps
    // biology-only 'electron transport chain'. The in-scope term must claim
    // the span — its match AND its missing-term issue must both survive.
    const hwShort = insertHeadword({ english: 'electron' });
    const trShort = insertTranslation(hwShort, { icelandic: 'rafeind', status: 'approved' });
    addSubject(trShort, 'chemistry');
    const hwLong = insertHeadword({ english: 'electron transport chain' });
    const trLong = insertTranslation(hwLong, {
      icelandic: 'rafeindaflutningskeðja',
      status: 'approved',
    });
    addSubject(trLong, 'biology');

    const result = terminologyService.findTermsInSegments(
      seg('the electron transport chain moves', 'eitthvað flyst'),
      'efnafraedi-2e'
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.matches[0].english).toBe('electron');
    expect(result.s.matches[0].isFallback).toBe(false);
    expect(result.s.issues).toHaveLength(1);
    expect(result.s.issues[0].expected).toBe('rafeind');
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

// =====================
// Live terminology QA (Unit 3)
// =====================
describe('checkSegmentConsistency()', () => {
  it('flags a segment whose IS omits an approved term translation', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });
    const issues = terminologyService.checkSegmentConsistency(
      'A molecule is small.',
      'Eitthvað er lítið.',
      'efnafraedi-2e'
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].english).toBe('molecule');
    expect(issues[0].expected).toBe('sameind');
  });

  it('passes when the approved translation is present', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });
    const issues = terminologyService.checkSegmentConsistency(
      'A molecule is small.',
      'Sameind er lítil.',
      'efnafraedi-2e'
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag proposed-only terms (no approved translation)', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind', status: 'proposed' });
    const issues = terminologyService.checkSegmentConsistency(
      'A molecule is small.',
      'Eitthvað er lítið.',
      'efnafraedi-2e'
    );
    expect(issues).toHaveLength(0);
  });

  it('foreign-only term produces no issue even though it matches as fallback (item 18)', () => {
    const hw = insertHeadword({ english: 'mole' });
    const tr = insertTranslation(hw, { icelandic: 'moldvarpa', status: 'approved' });
    addSubject(tr, 'biology');

    const issues = terminologyService.checkSegmentConsistency(
      'one mole of carbon',
      'eitt kolefnismagn',
      'efnafraedi-2e'
    );
    expect(issues).toHaveLength(0);
  });
});

describe('buildModuleTerminologyReport()', () => {
  it('aggregates violations across segments by term', () => {
    insertFullTerm({ english: 'molecule', icelandic: 'sameind', status: 'approved' });
    insertFullTerm({ english: 'atom', icelandic: 'frumeind', status: 'approved' });
    const report = terminologyService.buildModuleTerminologyReport(
      [
        {
          segmentId: 's1',
          enContent: 'A molecule and an atom.',
          isContent: 'Eitthvað og frumeind.',
        },
        { segmentId: 's2', enContent: 'Another molecule.', isContent: 'Annað eitthvað.' },
      ],
      'efnafraedi-2e'
    );
    const mol = report.find((r) => r.english === 'molecule');
    expect(mol.count).toBe(2);
    expect(mol.segments.sort()).toEqual(['s1', 's2']);
    // "atom" is correctly translated in s1 → not reported
    expect(report.find((r) => r.english === 'atom')).toBeUndefined();
  });
});

// =====================
// exportBookGlossary() — Unit 6.1
// =====================
describe('exportBookGlossary()', () => {
  it('exports the glossary-unified shape scoped to the book subject', () => {
    insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'approved',
      subjects: ['chemistry'],
    });
    insertFullTerm({
      english: 'cell',
      icelandic: 'fruma',
      status: 'approved',
      subjects: ['biology'],
    });

    const data = terminologyService.exportBookGlossary('efnafraedi-2e'); // chemistry
    expect(data.book).toBe('efnafraedi-2e');
    expect(typeof data.generated).toBe('string');
    // Only the chemistry term is in scope.
    expect(data.terms).toHaveLength(1);
    expect(data.terms[0].english).toBe('molecule');
    expect(data.stats.total).toBe(1);
    expect(data.stats.approved).toBe(1);
  });

  it('lists sibling translations as alternatives', () => {
    const hwId = insertHeadword({ english: 'bond' });
    const t1 = insertTranslation(hwId, { icelandic: 'tengi', status: 'approved' });
    const t2 = insertTranslation(hwId, { icelandic: 'efnatengi', status: 'proposed' });
    addSubject(t1, 'chemistry');
    addSubject(t2, 'chemistry');

    const data = terminologyService.exportBookGlossary('efnafraedi-2e');
    const primary = data.terms.find((t) => t.icelandic === 'tengi');
    expect(primary.alternatives).toContain('efnatengi');
    expect(data.stats.total).toBe(2);
    expect(data.stats.proposed).toBe(1);
  });

  it('excludes untagged and general-tagged translations for a mapped book (deliberately strict, item 18)', () => {
    // The MT-priming export is STRICTER than the editor surfaces on purpose:
    // cross-subject/unclassified terms in the MT glossary would harm MT quality.
    // The editor-side fallback (findTermsInSegments/lookupTerm) must NOT leak here.
    insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'approved',
      subjects: ['chemistry'],
    });
    insertFullTerm({
      english: 'energy',
      icelandic: 'orka',
      status: 'approved',
      subjects: ['general'],
    });
    insertFullTerm({ english: 'thing', icelandic: 'hlutur', status: 'approved' }); // untagged

    const data = terminologyService.exportBookGlossary('efnafraedi-2e');
    expect(data.terms).toHaveLength(1);
    expect(data.terms[0].english).toBe('molecule');
  });

  it('excludes rejected translations from the export (item 19)', () => {
    insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'approved',
      subjects: ['chemistry'],
    });
    insertFullTerm({
      english: 'atom',
      icelandic: 'frumeind',
      status: 'rejected',
      subjects: ['chemistry'],
    });
    const out = terminologyService.exportBookGlossary('efnafraedi-2e');
    expect(out.terms.map((t) => t.english)).toEqual(['molecule']);
    expect(out.stats.total).toBe(1);
  });

  it('rejected siblings do not appear as alternatives (item 19)', () => {
    const hwId = insertHeadword({ english: 'bond' });
    const approvedId = insertTranslation(hwId, { icelandic: 'tengi', status: 'approved' });
    const rejectedId = insertTranslation(hwId, { icelandic: 'efnatengi', status: 'rejected' });
    addSubject(approvedId, 'chemistry');
    addSubject(rejectedId, 'chemistry');
    const out = terminologyService.exportBookGlossary('efnafraedi-2e');
    const bond = out.terms.find((t) => t.english === 'bond');
    expect(bond.alternatives).toEqual([]);
  });
});

// =====================
// findTermsInSegments() — Unicode word boundary (Icelandic special letters)
// =====================
describe('findTermsInSegments() — Unicode word boundary', () => {
  const seg = (enContent, isContent) => [{ segmentId: 's', enContent, isContent }];

  it('no missing-term issue when an Icelandic-initial term is present, capitalized', () => {
    // "þungi" starts with þ → ASCII \b fails; the term IS present (sentence start)
    insertFullTerm({ english: 'mass', icelandic: 'þungi', status: 'approved' });
    const result = terminologyService.findTermsInSegments(
      seg('The mass of the object', 'Þungi hlutarins er mikill')
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.issues).toHaveLength(0);
  });

  it('no missing-term issue when an Icelandic-initial term is present, lowercase', () => {
    insertFullTerm({ english: 'mass', icelandic: 'þungi', status: 'approved' });
    const result = terminologyService.findTermsInSegments(
      seg('a small mass here', 'það er lítill þungi hér')
    );
    expect(result.s.issues).toHaveLength(0);
  });

  it('handles other Icelandic-initial forms (öl, ólífa)', () => {
    insertFullTerm({ english: 'ale', icelandic: 'öl', status: 'approved' });
    const result = terminologyService.findTermsInSegments(seg('good ale', 'Öl er gott'));
    expect(result.s.issues).toHaveLength(0);
  });

  it('still flags a genuinely absent term (no substring false-positive)', () => {
    // term "mól" present only inside "mólekúl" → should still be reported missing
    insertFullTerm({ english: 'mole', icelandic: 'mól', status: 'approved' });
    const result = terminologyService.findTermsInSegments(
      seg('one mole', 'ein mólekúl hér') // no standalone "mól"
    );
    expect(result.s.matches).toHaveLength(1);
    expect(result.s.issues).toHaveLength(1);
    expect(result.s.issues[0].type).toBe('missing');
  });

  it('ASCII term still matches case-insensitively (regression guard)', () => {
    insertFullTerm({ english: 'acid', icelandic: 'sýra', status: 'approved' });
    const result = terminologyService.findTermsInSegments(seg('an acid', 'Sýra og basi'));
    expect(result.s.issues).toHaveLength(0);
  });
});

// =====================
// getBookSubject() / getTranslationReviewQueue() / getReviewQueueCounts() — item 19
// =====================
describe('getBookSubject()', () => {
  it('resolves a mapped book, null for unmapped or missing input', () => {
    expect(terminologyService.getBookSubject('efnafraedi-2e')).toBe('chemistry');
    expect(terminologyService.getBookSubject('unknown-book')).toBeNull();
    expect(terminologyService.getBookSubject(null)).toBeNull();
    expect(terminologyService.getBookSubject(undefined)).toBeNull();
  });
});

describe('getTranslationReviewQueue()', () => {
  it('defaults to proposed+disputed+needs_review, excluding approved and rejected', () => {
    insertFullTerm({ english: 'a', icelandic: 'a1', status: 'approved' });
    insertFullTerm({ english: 'b', icelandic: 'b1', status: 'proposed' });
    insertFullTerm({ english: 'c', icelandic: 'c1', status: 'disputed' });
    insertFullTerm({ english: 'd', icelandic: 'd1', status: 'needs_review' });
    insertFullTerm({ english: 'e', icelandic: 'e1', status: 'rejected' });
    const { items, total } = terminologyService.getTranslationReviewQueue();
    expect(total).toBe(3);
    expect(items.map((i) => i.english).sort()).toEqual(['b', 'c', 'd']);
  });

  it('is translation-granular: mixed-status headword contributes only queued rows', () => {
    const hwId = insertHeadword({ english: 'bond' });
    insertTranslation(hwId, { icelandic: 'tengi', status: 'approved' });
    insertTranslation(hwId, { icelandic: 'efnatengi', status: 'proposed' });
    const { items, total } = terminologyService.getTranslationReviewQueue();
    expect(total).toBe(1);
    expect(items[0].icelandic).toBe('efnatengi');
    expect(items[0].english).toBe('bond');
    expect(items[0].headwordId).toBe(hwId);
  });

  it('accepts explicit statuses including rejected', () => {
    insertFullTerm({ english: 'a', icelandic: 'a1', status: 'proposed' });
    insertFullTerm({ english: 'b', icelandic: 'b1', status: 'rejected' });
    const { items, total } = terminologyService.getTranslationReviewQueue({
      statuses: ['rejected'],
    });
    expect(total).toBe(1);
    expect(items[0].english).toBe('b');
  });

  it('throws on an unknown status', () => {
    expect(() => terminologyService.getTranslationReviewQueue({ statuses: ['bogus'] })).toThrow(
      'Invalid status: bogus'
    );
    expect(() => terminologyService.getTranslationReviewQueue({ statuses: [] })).toThrow(
      'statuses must be a non-empty array'
    );
  });

  it('filters by source', () => {
    insertFullTerm({ english: 'a', icelandic: 'a1', source: 'mined-postedit' });
    insertFullTerm({ english: 'b', icelandic: 'b1', source: 'manual' });
    const { items } = terminologyService.getTranslationReviewQueue({ source: 'mined-postedit' });
    expect(items.map((i) => i.english)).toEqual(['a']);
  });

  it("subject slug matches tagged rows; 'untagged' matches only untagged rows", () => {
    insertFullTerm({ english: 'a', icelandic: 'a1', subjects: ['chemistry'] });
    insertFullTerm({ english: 'b', icelandic: 'b1' }); // untagged
    const chem = terminologyService.getTranslationReviewQueue({ subject: 'chemistry' });
    expect(chem.items.map((i) => i.english)).toEqual(['a']);
    const untagged = terminologyService.getTranslationReviewQueue({ subject: 'untagged' });
    expect(untagged.items.map((i) => i.english)).toEqual(['b']);
  });

  it('book resolves to the mapped subject; unmapped book applies no constraint', () => {
    insertFullTerm({ english: 'a', icelandic: 'a1', subjects: ['chemistry'] });
    insertFullTerm({ english: 'b', icelandic: 'b1', subjects: ['biology'] });
    const chem = terminologyService.getTranslationReviewQueue({ book: 'efnafraedi-2e' });
    expect(chem.items.map((i) => i.english)).toEqual(['a']);
    const all = terminologyService.getTranslationReviewQueue({ book: 'no-such-book' });
    expect(all.total).toBe(2);
  });

  it('paginates with a real total, newest-first (created_at DESC, id DESC)', () => {
    insertFullTerm({ english: 'a', icelandic: 'a1' });
    insertFullTerm({ english: 'b', icelandic: 'b1' });
    insertFullTerm({ english: 'c', icelandic: 'c1' });
    const page1 = terminologyService.getTranslationReviewQueue({ limit: 2, offset: 0 });
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    // Same-second created_at → id DESC tie-break: newest insert first
    expect(page1.items[0].english).toBe('c');
    const page2 = terminologyService.getTranslationReviewQueue({ limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].english).toBe('a');
  });

  it('rows carry headword context, subjects, and proposer', () => {
    insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      subjects: ['chemistry', 'general'],
      proposed_by_name: 'Jón',
    });
    const { items } = terminologyService.getTranslationReviewQueue();
    const it0 = items[0];
    expect(it0.english).toBe('molecule');
    expect(it0.icelandic).toBe('sameind');
    expect(it0.subjects.sort()).toEqual(['chemistry', 'general']);
    expect(it0.proposedByName).toBe('Jón');
    expect(it0.status).toBe('proposed');
    expect(typeof it0.translationId).toBe('number');
  });
});

describe('getReviewQueueCounts()', () => {
  it('returns per-status counts', () => {
    insertFullTerm({ english: 'a', icelandic: 'a1', status: 'proposed' });
    insertFullTerm({ english: 'b', icelandic: 'b1', status: 'proposed' });
    insertFullTerm({ english: 'c', icelandic: 'c1', status: 'disputed' });
    insertFullTerm({ english: 'd', icelandic: 'd1', status: 'approved' });
    const counts = terminologyService.getReviewQueueCounts();
    expect(counts).toEqual({ proposed: 2, disputed: 1, needsReview: 0, subject: null });
  });

  it('scopes by book subject and reports the resolved subject for picker prefill', () => {
    insertFullTerm({ english: 'a', icelandic: 'a1', subjects: ['chemistry'] });
    insertFullTerm({ english: 'b', icelandic: 'b1', subjects: ['biology'] });
    const counts = terminologyService.getReviewQueueCounts({ book: 'efnafraedi-2e' });
    expect(counts.proposed).toBe(1);
    expect(counts.subject).toBe('chemistry');
  });
});

// =====================
// approveTranslation({subjects}) + batchApproveTranslations() — item 19
// =====================
describe('approveTranslation() with subjects (tag-at-approval, I18-R1)', () => {
  it('replaces subject tags and approves in one action', () => {
    const { trId } = insertFullTerm({ status: 'proposed', subjects: ['general'] });
    const hw = terminologyService.approveTranslation(trId, 'u1', 'Head', {
      subjects: ['chemistry'],
    });
    expect(hw.translations[0].status).toBe('approved');
    expect(hw.translations[0].subjects).toEqual(['chemistry']);
    expect(hw.translations[0].approvedByName).toBe('Head');
  });

  it('without subjects keeps the idempotent early-return (stamps unchanged)', () => {
    const { trId } = insertFullTerm({ status: 'proposed' });
    terminologyService.approveTranslation(trId, 'u1', 'First');
    const before = db
      .prepare('SELECT approved_by, approved_by_name FROM terminology_translations WHERE id = ?')
      .get(trId);
    terminologyService.approveTranslation(trId, 'u2', 'Second');
    const after = db
      .prepare('SELECT approved_by, approved_by_name FROM terminology_translations WHERE id = ?')
      .get(trId);
    expect(after).toEqual(before);
    expect(after.approved_by_name).toBe('First');
  });

  it('with subjects on an already-approved row re-tags (no early-return)', () => {
    const { trId } = insertFullTerm({ status: 'approved', subjects: ['general'] });
    const hw = terminologyService.approveTranslation(trId, 'u1', 'Head', {
      subjects: ['chemistry', 'biology'],
    });
    expect(hw.translations[0].subjects.sort()).toEqual(['biology', 'chemistry']);
    expect(hw.translations[0].status).toBe('approved');
  });

  it('throws on an invalid subject slug before any write', () => {
    const { trId } = insertFullTerm({ status: 'proposed', subjects: ['general'] });
    expect(() =>
      terminologyService.approveTranslation(trId, 'u', 'U', { subjects: ['klingon'] })
    ).toThrow('Invalid subject: klingon');
    const row = db.prepare('SELECT status FROM terminology_translations WHERE id = ?').get(trId);
    expect(row.status).toBe('proposed');
    const tags = db
      .prepare('SELECT subject FROM terminology_translation_subjects WHERE translation_id = ?')
      .all(trId);
    expect(tags.map((t) => t.subject)).toEqual(['general']);
  });

  it('throws on an empty subjects array', () => {
    const { trId } = insertFullTerm({ status: 'proposed' });
    expect(() => terminologyService.approveTranslation(trId, 'u', 'U', { subjects: [] })).toThrow(
      'subjects must be a non-empty array'
    );
  });

  it('closes I18-R1 end-to-end: mined term tagged at approval passes the strict MT export', () => {
    const { translationId } = terminologyService.proposeMinedTerm(
      'yield',
      'heimta',
      null,
      'he1',
      'Head'
    );
    // Untagged + proposed → invisible to the subject-mapped export today
    expect(
      terminologyService.exportBookGlossary('efnafraedi-2e').terms.map((t) => t.english)
    ).not.toContain('yield');
    terminologyService.approveTranslation(translationId, 'he1', 'Head', {
      subjects: ['chemistry'],
    });
    const out = terminologyService.exportBookGlossary('efnafraedi-2e');
    const yieldTerm = out.terms.find((t) => t.english === 'yield');
    expect(yieldTerm).toBeDefined();
    expect(yieldTerm.status).toBe('approved');
  });
});

describe('batchApproveTranslations()', () => {
  it('approves all ids and tags only the untagged rows', () => {
    const tagged = insertFullTerm({
      english: 'a',
      icelandic: 'a1',
      status: 'proposed',
      subjects: ['biology'],
    });
    const untagged = insertFullTerm({ english: 'b', icelandic: 'b1', status: 'proposed' });
    const result = terminologyService.batchApproveTranslations(
      [tagged.trId, untagged.trId],
      'he1',
      'Head',
      { subjects: ['chemistry'] }
    );
    expect(result).toEqual({ approved: 2, alreadyApproved: 0, tagged: 1 });
    const tagsOfTagged = db
      .prepare('SELECT subject FROM terminology_translation_subjects WHERE translation_id = ?')
      .all(tagged.trId)
      .map((r) => r.subject);
    expect(tagsOfTagged).toEqual(['biology']); // untouched
    const tagsOfUntagged = db
      .prepare('SELECT subject FROM terminology_translation_subjects WHERE translation_id = ?')
      .all(untagged.trId)
      .map((r) => r.subject);
    expect(tagsOfUntagged).toEqual(['chemistry']);
    const statuses = db
      .prepare('SELECT status FROM terminology_translations WHERE id IN (?, ?)')
      .all(tagged.trId, untagged.trId)
      .map((r) => r.status);
    expect(statuses).toEqual(['approved', 'approved']);
  });

  it('works without subjects (plain batch approve)', () => {
    const { trId } = insertFullTerm({ status: 'proposed' });
    const result = terminologyService.batchApproveTranslations([trId], 'he1', 'Head');
    expect(result.approved).toBe(1);
  });

  it('is all-or-nothing: unknown id throws naming it, nothing applied', () => {
    const { trId } = insertFullTerm({ status: 'proposed' });
    expect(() => terminologyService.batchApproveTranslations([trId, 9999], 'he1', 'Head')).toThrow(
      'Translations not found: 9999'
    );
    const row = db.prepare('SELECT status FROM terminology_translations WHERE id = ?').get(trId);
    expect(row.status).toBe('proposed');
  });

  it('skips re-stamping already-approved rows but still tags them if untagged', () => {
    const { trId } = insertFullTerm({ status: 'approved' }); // untagged, approved by nobody
    db.prepare(
      "UPDATE terminology_translations SET approved_by = 'orig', approved_by_name = 'Original' WHERE id = ?"
    ).run(trId);
    const result = terminologyService.batchApproveTranslations([trId], 'he2', 'Second', {
      subjects: ['chemistry'],
    });
    expect(result).toEqual({ approved: 0, alreadyApproved: 1, tagged: 1 });
    const row = db
      .prepare('SELECT approved_by_name FROM terminology_translations WHERE id = ?')
      .get(trId);
    expect(row.approved_by_name).toBe('Original');
  });

  it('validates ids: empty, non-integer, and >200 all throw', () => {
    expect(() => terminologyService.batchApproveTranslations([], 'u', 'U')).toThrow(
      'ids must be a non-empty array'
    );
    expect(() => terminologyService.batchApproveTranslations(['x'], 'u', 'U')).toThrow(
      'ids must be positive integers'
    );
    const tooMany = Array.from({ length: 201 }, (_, i) => i + 1);
    expect(() => terminologyService.batchApproveTranslations(tooMany, 'u', 'U')).toThrow(
      'Too many ids (max 200)'
    );
  });
});
