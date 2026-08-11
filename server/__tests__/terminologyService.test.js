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
const terminologyService = require('../services/terminologyService');
const { createTestDb } = require('./helpers/terminologyTestDb');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { seedBooks } = require('../scripts/lib/scratchCorpus');

function addConceptIn(db, domain) {
  return Number(db.prepare('INSERT INTO concept (domain) VALUES (?)').run(domain).lastInsertRowid);
}
// ⚠️ `source` is TEXT NOT NULL (migration 045:45). Nothing outside the importer
// reads it, so a fixture literal is safe — but omitting it fails every insert.
function addTermIn(db, conceptId, lang, text, rank = 1) {
  return Number(
    db
      .prepare(
        "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,'test')"
      )
      .run(conceptId, lang, text, rank).lastInsertRowid
  );
}

let db;

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

  // ⚠️ §C36 B4b-1 — THE MATCHER HALF OF THIS TEST IS DELETED, THE CRUD HALF
  // KEPT. It used to assert that a rejected translation vanished from BOTH
  // lookupTerm and findTermsInSegments. `lookupTerm` still reads the old
  // tables, so that half is real coverage and stays. The matcher no longer
  // reads them at all — and `concept_term` has NO status column, so "rejected"
  // has no counterpart to port to. Asserting `matches` is empty here would have
  // passed for the wrong reason: not because rejection hid the term, but
  // because the concept tables were empty. That is the green-forever class this
  // task exists to remove.
  it('rejected translations vanish from lookupTerm', () => {
    const { trId } = insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'approved',
    });
    // POSITIVE CONTROL: the term is findable BEFORE the rejection, so the
    // absence below cannot be satisfied by a lookupTerm that finds nothing.
    expect(terminologyService.lookupTerm('molecule')).toHaveLength(1);
    terminologyService.rejectTranslation(trId, 'u', 'U', '');
    expect(terminologyService.lookupTerm('molecule')).toHaveLength(0);
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

  it('stamps its own output with the producer name', () => {
    const data = terminologyService.exportBookGlossary('efnafraedi-2e');
    expect(data.producer).toBe('export-terminology');
  });

  it('a pre-stamp baseline (identical terms, no per-term producer key) still reads as unchanged', () => {
    // NOT written as "call exportBookGlossary twice, compare with sameTerms":
    // sameTerms only ever reads `.terms`, so two calls compare identically
    // whether `producer` landed top-level (as intended) or was wrongly
    // stamped onto EACH term (a bug) — a deterministic per-term stamp is the
    // same across both calls either way, so that shape cannot tell "correct"
    // apart from "broken but consistent". Instead this builds the pre-stamp
    // side INDEPENDENTLY, by stripping any per-term `producer` key from a
    // real export's terms — simulating the file committed before this stamp
    // existed. That diverges from the freshly stamped export exactly when
    // the stamp is (wrongly) per-term, which is what this test exists to
    // catch: the real property under test is that the FIRST post-deploy
    // cron run must not see a spurious diff and rewrite/re-commit every book.
    // A non-empty terms array is required: with zero terms, stripping a
    // per-term key from `[]` is still `[]`, so this would pass even under
    // the per-term-stamp mutation — the same vacuity this test exists to
    // avoid, one level down.
    insertFullTerm({
      english: 'molecule',
      icelandic: 'sameind',
      status: 'approved',
      subjects: ['chemistry'],
    });
    const { sameTerms } = require('../lib/glossaryExportDecision');
    const stamped = terminologyService.exportBookGlossary('efnafraedi-2e');
    expect(stamped.terms.length).toBeGreaterThan(0);
    const preStamp = {
      ...stamped,
      terms: stamped.terms.map(({ producer: _producer, ...rest }) => rest),
    };
    expect(sameTerms(preStamp, stamped)).toBe(true);
  });
});

// =====================
// findTermsInSegments() — blocks PORTED onto the concept model (§C36 B4b-1)
// =====================
//
// These blocks stood here before the cut-over against `createTestDb()`'s copy of
// the six OLD terminology tables. Their PROPERTIES survive the model change —
// Unicode word-boundary matching on the Icelandic side, and deterministic match
// ordering — so they are ported rather than deleted. The blocks whose properties
// did NOT survive (subject scoping via `book_subject_mapping`, and
// checkSegmentConsistency's proposed/approved gating) are deleted instead:
// `concept_term` has no status column, so there is nothing to port them to.
//
// ⚠️⚠️ THIS BLOCK'S afterAll RESTORES THE FILE-LEVEL HANDLE — `_setTestDb(db)`,
// NEVER `_setTestDb(null)`. THE HAZARD REVERSES FOR A MID-FILE BLOCK, and
// copying the end-of-file idiom by pattern-match here is silently destructive.
// The file establishes its injection ONCE, in `beforeAll`. `getDb()`
// (terminologyService.js:93-103) returns `_testDb` if set and OTHERWISE OPENS
// THE REAL sessions.db at resolveDbPath(). The two concept-model blocks at the
// END of this file may safely null it — nothing runs after them — but FIVE
// blocks run after this one (getBookSubject, getTranslationReviewQueue,
// getReviewQueueCounts, approveTranslation-with-subjects, batchApprove-
// Translations) and every one of them relies on that single injection. A null
// here would point all five at the developer's real editorial database, with
// no test going red to say so.
// ⚠️ THE DESCRIBE NAME IS DELIBERATELY BROADER THAN "Unicode + ordering", which
// is what it said until 2026-08-11 — by then it also held the translations[]
// shape, the non-overlapping-spans case, buildModuleTerminologyReport and
// checkSegmentConsistency, none of which that name describes. What these share
// is the FIXTURE, not the subject: one migrated DB, seeded books, concept rows
// cleared between tests. Keep that the grouping rule; if you add a test that
// needs a different fixture, start a new block rather than widening this name
// again.
describe('terminology QA over the concept model — ported + new (B4b-1)', () => {
  let cdb;
  const seg = (enContent, isContent) => [{ segmentId: 's', enContent, isContent }];

  beforeAll(() => {
    ({ db: cdb } = freshMigratedDb());
    const realLog = console.log;
    console.log = () => {}; // seedBooks narrates to stdout; not this suite's output
    try {
      seedBooks(cdb);
    } finally {
      console.log = realLog;
    }
    terminologyService._setTestDb(cdb);
  });

  afterAll(() => {
    terminologyService._setTestDb(db); // ⚠️ NOT null — see the banner above.
    cdb && cdb.close();
  });

  // One migrated DB for the whole block, cleared between tests, rather than a
  // freshMigratedDb() per test: each call materialises a ~22 MB database in
  // /tmp (see the helper's own cleanup comment), and this block has enough
  // tests for that to matter.
  beforeEach(() => {
    cdb.exec('DELETE FROM concept_term');
    cdb.exec('DELETE FROM concept');
    cdb.exec('DELETE FROM book_term_preference');
  });

  // ── Unicode word boundary on the ICELANDIC side ──
  //
  // ⚠️ EVERY "no issue" TEST BELOW ASSERTS `isFallback: false` IN THE SAME TEST,
  // and that is the positive control, not decoration. `issues: []` is an absence
  // assertion with TWO uninteresting ways to pass: the matcher found nothing at
  // all, or it found a FALLBACK match — and a fallback match never emits an
  // issue by design. Only an in-scope match with a winner actually runs the
  // Icelandic-side check these tests exist to exercise.

  it('no missing-term issue when an Icelandic-initial term is present, capitalized', () => {
    // "þungi" starts with þ → an ASCII \b fails here; the term IS present.
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'mass');
    addTermIn(cdb, c, 'is', 'þungi');
    const r = terminologyService.findTermsInSegments(
      seg('The mass of the object', 'Þungi hlutarins er mikill'),
      'efnafraedi-2e'
    );
    expect(r.s.matches).toHaveLength(1);
    expect(r.s.matches[0].isFallback).toBe(false);
    expect(r.s.issues).toEqual([]);
  });

  it('no missing-term issue when an Icelandic-initial term is present, lowercase', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'mass');
    addTermIn(cdb, c, 'is', 'þungi');
    const r = terminologyService.findTermsInSegments(
      seg('a small mass here', 'það er lítill þungi hér'),
      'efnafraedi-2e'
    );
    expect(r.s.matches[0].isFallback).toBe(false);
    expect(r.s.issues).toEqual([]);
  });

  it('handles other Icelandic-initial forms (öl)', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'ale');
    addTermIn(cdb, c, 'is', 'öl');
    const r = terminologyService.findTermsInSegments(
      seg('good ale', 'Öl er gott'),
      'efnafraedi-2e'
    );
    expect(r.s.matches[0].isFallback).toBe(false);
    expect(r.s.issues).toEqual([]);
  });

  it('still flags a genuinely absent term (no substring false-positive)', () => {
    // 'mól' occurs only INSIDE 'mólekúl' → still missing.
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'mole');
    addTermIn(cdb, c, 'is', 'mól');
    const r = terminologyService.findTermsInSegments(
      seg('one mole', 'ein mólekúl hér'),
      'efnafraedi-2e'
    );
    expect(r.s.matches).toHaveLength(1);
    expect(r.s.issues).toHaveLength(1);
    expect(r.s.issues[0].type).toBe('missing');
  });

  it('ASCII term still matches case-insensitively (regression guard)', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'acid');
    addTermIn(cdb, c, 'is', 'sýra');
    const r = terminologyService.findTermsInSegments(
      seg('an acid', 'Sýra og basi'),
      'efnafraedi-2e'
    );
    expect(r.s.matches[0].isFallback).toBe(false);
    expect(r.s.issues).toEqual([]);
  });

  // ── Deterministic ordering ──
  //
  // ⚠️ ONE OF THE THREE ORIGINAL ORDERING TESTS HAS NO PORT, AND ITS PROPERTY IS
  // GONE, NOT MOVED. `returns subject arrays in sorted order` seeded one
  // translation with three subjects and asserted they came back sorted. Under
  // the concept model a concept has exactly ONE `domain`, and the matcher emits
  // `subjects: [winner.domain]` — a one-element array cannot be mis-sorted, so
  // there is no ordering left to pin. The SHAPE it depended on is pinned instead
  // by the `translations[]` block below. `orders sibling translations of one
  // headword by translation id` is likewise absorbed there: siblings now arrive
  // as `[winner, ...alsoInScope]`, which conceptResolver sorts by (position,
  // conceptId), not by row id.

  it('orders equal-length matches by headwordId, not by position in the text', () => {
    // 'aaaa' and 'bbbb' tie on length, so ONLY the `a.headwordId - b.headwordId`
    // tie-break in `hits.sort` decides. Since B4b-1 `headwordId` is
    // MIN(concept_term.id) for the English string (conceptMatcher.
    // loadEnglishEntries), so seeding 'aaaa' FIRST gives it the lower id.
    // 'bbbb' is placed EARLIER IN THE TEXT — that is the discrimination: without
    // the id tie-break, match order would follow text position and answer
    // ['bbbb', 'aaaa'].
    const cA = addConceptIn(cdb, 'chemistry');
    const idA = addTermIn(cdb, cA, 'en', 'aaaa');
    addTermIn(cdb, cA, 'is', 'is-a');
    const cB = addConceptIn(cdb, 'chemistry');
    const idB = addTermIn(cdb, cB, 'en', 'bbbb');
    addTermIn(cdb, cB, 'is', 'is-b');
    expect(idA).toBeLessThan(idB); // the premise the assertion rests on

    const r = terminologyService.findTermsInSegments(
      seg('A bbbb and an aaaa appear here.', 'is-b og is-a birtast hér.'),
      'efnafraedi-2e'
    );
    expect(r.s.matches.map((m) => m.english)).toEqual(['aaaa', 'bbbb']);
    expect(r.s.matches.map((m) => m.headwordId)).toEqual([idA, idB]);
    // Positive control that position really does disagree with the answer:
    // 'bbbb' is at 2 and 'aaaa' at 14, so a position-ordered matcher would have
    // returned the reverse.
    expect(r.s.matches.map((m) => m.position)).toEqual([14, 2]);
  });

  // ── translations[]: the response shape the segment editor renders ──
  //
  // ⚠️ THE BRIEF'S EXPLICIT CONTRACT — "same keys as today, so no client
  // changes" — WAS PINNED BY NO TEST until this one. Task 4's reviewer flagged
  // it independently.

  it('emits translations[] with the documented keys, winner first', () => {
    // ⚠️ A TWO-ENTRY translations[] REQUIRES TWO IN-SCOPE CONCEPTS SHARING THE
    // ENGLISH STRING. `translations` is `[winner, ...alsoInScope]`, and
    // conceptResolver's alsoFrom() builds one head form per OTHER concept —
    // a concept's own rank-2 sibling is reached only on the ISSUE path, never
    // here. Seeding one concept with two Icelandic terms yields length 1.
    const chem = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, chem, 'en', 'cell');
    const chemTerm = addTermIn(cdb, chem, 'is', 'rafhlaða');
    const bio = addConceptIn(cdb, 'biology'); // efnafraedi-2e position 3 → in scope
    addTermIn(cdb, bio, 'en', 'cell');
    addTermIn(cdb, bio, 'is', 'fruma');

    const r = terminologyService.findTermsInSegments(
      seg('A cell contains', 'Rafhlaða inniheldur'),
      'efnafraedi-2e'
    );
    expect(r.s.matches).toHaveLength(1);
    const m = r.s.matches[0];
    // The match level. `isPrimary` is asserted here deliberately: it was the one
    // property of the deleted `ranks primary translation by book domain` test
    // that no surviving concept-model test covered.
    expect(m).toMatchObject({
      english: 'cell',
      icelandic: 'rafhlaða', // chemistry@1 beats biology@3
      subjects: ['chemistry'],
      status: 'approved',
      isPrimary: true,
      isFallback: false,
    });

    expect(m.translations).toHaveLength(2);
    expect(Object.keys(m.translations[0]).sort()).toEqual([
      'icelandic',
      'id',
      'isFallback',
      'isPrimary',
      'status',
      'subjects',
    ]);
    expect(m.translations[0]).toEqual({
      id: chemTerm,
      icelandic: 'rafhlaða',
      subjects: ['chemistry'],
      status: 'approved',
      isPrimary: true,
      isFallback: false,
    });
    expect(m.translations[1]).toMatchObject({
      icelandic: 'fruma',
      subjects: ['biology'],
      isPrimary: false,
      isFallback: false,
    });
    expect(typeof m.translations[1].id).toBe('number');
  });

  it('a FALLBACK translations[] entry carries NO id, while an in-scope one does', () => {
    // ⚠️ THE KNOWN ASYMMETRY, asserted deliberately rather than left implicit.
    // `outOfScope` entries are {conceptId, text, domain} — conceptResolver
    // gives them no termId — so `id: t.termId` is `undefined` and JSON.stringify
    // DROPS the key entirely. `toEqual` treats an undefined property as absent,
    // which is exactly why this is asserted with toBeUndefined() instead.
    //
    // THE POSITIVE CONTROL IS IN THIS SAME TEST: an in-scope term in the SAME
    // segment, whose id must be a number. Without it, an assertion that
    // `id` is undefined passes against a matcher that returns nothing at all.
    const chem = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, chem, 'en', 'cell');
    addTermIn(cdb, chem, 'is', 'rafhlaða');
    // mathematics is out of efnafraedi-2e's chain — domains.js says so in as
    // many words ("out of scope on purpose, not by oversight").
    const maths = addConceptIn(cdb, 'mathematics');
    addTermIn(cdb, maths, 'en', 'eigenvalue');
    addTermIn(cdb, maths, 'is', 'eigingildi');

    const r = terminologyService.findTermsInSegments(
      seg('A cell and an eigenvalue.', ''),
      'efnafraedi-2e'
    );
    const inScope = r.s.matches.find((m) => m.english === 'cell');
    const fallback = r.s.matches.find((m) => m.english === 'eigenvalue');
    expect(fallback.isFallback).toBe(true);
    expect(fallback.translations[0].id).toBeUndefined();
    // CONTROL: the in-scope entry in the same response DOES carry a real id.
    expect(inScope.isFallback).toBe(false);
    expect(typeof inScope.translations[0].id).toBe('number');
  });

  it('matches both terms when they appear independently (not overlapping)', () => {
    // The complement of the overlap-tiler test: 'melting' first occurs at 0 and
    // 'melting point' at 22, so neither claim consumes the other's span and BOTH
    // survive. Ordering is longest-first, so the longer term leads.
    const a = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, a, 'en', 'melting');
    addTermIn(cdb, a, 'is', 'bráðnun');
    const b = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, b, 'en', 'melting point');
    addTermIn(cdb, b, 'is', 'bræðslumark');

    const r = terminologyService.findTermsInSegments(
      seg('Melting occurs at the melting point', 'Bráðnun á sér stað við bræðslumark'),
      'efnafraedi-2e'
    );
    expect(r.s.matches.map((m) => ({ english: m.english, position: m.position }))).toEqual([
      { english: 'melting point', position: 22 },
      { english: 'melting', position: 0 },
    ]);
    // Both Icelandic terms are present, so neither issues. The two matches above
    // are the control that makes this absence mean something.
    expect(r.s.issues).toEqual([]);
  });

  it('aggregates violations across segments by term (buildModuleTerminologyReport)', () => {
    // The submit gate an editor actually hits. It is a thin aggregation over
    // findTermsInSegments, so it goes red the moment the matcher stops issuing.
    const mol = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, mol, 'en', 'molecule');
    addTermIn(cdb, mol, 'is', 'sameind');
    const atom = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, atom, 'en', 'atom');
    addTermIn(cdb, atom, 'is', 'frumeind');

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
    const molecule = report.find((r) => r.english === 'molecule');
    expect(molecule.count).toBe(2);
    expect(molecule.segments.sort()).toEqual(['s1', 's2']);
    expect(molecule.expected).toBe('sameind');
    // 'atom' is correctly translated in s1 → not reported. The two-count
    // assertion above is this absence's positive control: the report is
    // demonstrably non-empty and demonstrably discriminating.
    expect(report.find((r) => r.english === 'atom')).toBeUndefined();
  });

  // ── item 18, END-TO-END: a fallback match never becomes a QA issue ──
  //
  // Added in fix round 1 after review flagged the deleted `surfaces a fallback
  // match when the only translation is another subject — no issues` as the last
  // test of this rule.
  //
  // ⚠️ THE REVIEW'S PREMISE WAS "nothing exercises the `hit.isFallback` arm,
  // because every surviving fallback test uses isContent: ''". THAT IS FALSE,
  // AND IT WAS MEASURED RATHER THAN ARGUED: `a fallback term never produces an
  // issue — QA must not demand another domain's term`, ~90 lines below, passes
  // `isContent: 'Ekkert.'` — non-empty, and not containing 'myndlíking' — so it
  // reaches the guard and IS stopped by the isFallback term. Mutating the code
  // to give out-of-scope concepts a winner turns that test red too. The arm was
  // covered. Do not repeat the premise; check `isContent` before believing it.
  //
  // ⚠️ WHAT THIS TEST ADDS, THEN, IS THE DISCRIMINATION — not the coverage. The
  // surviving test asserts a fallback match produces no issue, in a segment
  // where NOTHING could produce one. It cannot tell "fallbacks are exempt" from
  // "the issue path is dead". This test puts an in-scope term and a fallback
  // term in ONE segment, with the Icelandic missing BOTH translations, so the
  // in-scope term's issue is the control for the fallback term's silence.
  //
  // ⚠️ SEVERITY STATED HONESTLY: `hit.isFallback` is `!winner` by construction
  // today, so dropping that term is currently a behavioural no-op and a naive
  // mutation does NOT go red. The exposure is a FUTURE change in which resolve()
  // returns a winner for an out-of-scope concept — plausible, since the fallback
  // path already builds an offerable suggestion. Verified by mutating exactly
  // that (winner falls back to offerable[0], isFallback term dropped): this test
  // goes red.
  it('a fallback match emits NO issue even when the Icelandic lacks its term, while an in-scope one does', () => {
    // THE DISCRIMINATION IS INSIDE ONE SEGMENT: two terms, identical treatment
    // on the Icelandic side (neither translation is present), opposite outcomes
    // — decided ONLY by scope. That is item 18's editorial rule stated exactly:
    // an editor is answerable for their own book's domains and not for others'.
    const inScope = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, inScope, 'en', 'acid');
    addTermIn(cdb, inScope, 'is', 'sýra');
    // mathematics is out of efnafraedi-2e's chain, per domains.js.
    const outOfScope = addConceptIn(cdb, 'mathematics');
    addTermIn(cdb, outOfScope, 'en', 'eigenvalue');
    addTermIn(cdb, outOfScope, 'is', 'eigingildi');

    // Non-empty Icelandic containing NEITHER translation — so the issue path is
    // reached for both, rather than short-circuiting on `!seg.isContent`.
    const r = terminologyService.findTermsInSegments(
      seg('An acid and an eigenvalue.', 'Eitthvað allt annað hér.'),
      'efnafraedi-2e'
    );

    // Both matched, one of each tier: the control for everything below.
    expect(r.s.matches).toHaveLength(2);
    expect(r.s.matches.find((m) => m.english === 'eigenvalue').isFallback).toBe(true);
    expect(r.s.matches.find((m) => m.english === 'acid').isFallback).toBe(false);

    // THE ASSERTION: exactly one issue, and it is the IN-SCOPE term's. The
    // fallback term is silent despite being in identical shape on the IS side.
    expect(r.s.issues).toHaveLength(1);
    expect(r.s.issues[0]).toMatchObject({ english: 'acid', expected: 'sýra' });
  });

  // ── checkSegmentConsistency(): 2 of the 4 deleted tests, ported ──
  //
  // ⚠️ THIS FUNCTION IS LIVE PRODUCTION CODE — exported by terminologyService
  // and called from segmentEditorService — and Ruling 1's blanket deletion of
  // its block left it with ZERO tests. Ruling 1's stated rationale was "blocks
  // pinning semantics the concept model removes (proposed/approved gating)", and
  // only ONE of the four deleted tests actually did that. These two pinned
  // something the model change does not touch: that the function works at all,
  // in both directions.
  //
  // Not ported, deliberately, and the reasoning is in the report:
  //   * `does not flag proposed-only terms` — PURE proposed/approved gating.
  //     `concept_term` has no status column; there is nothing to port it to.
  //   * `foreign-only term produces no issue ... (item 18)` — NOT gating-
  //     dependent, but its property is exactly what the item-18 test directly
  //     above now pins, and checkSegmentConsistency is a three-line delegation
  //     to findTermsInSegments. Porting it here would duplicate that coverage
  //     without adding a failure mode the two tests below do not already have:
  //     between them they prove the wrapper propagates issues in BOTH
  //     directions, which is the only thing the wrapper itself can get wrong.
  it('checkSegmentConsistency flags a segment whose Icelandic omits the resolved term', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'molecule');
    addTermIn(cdb, c, 'is', 'sameind');
    const issues = terminologyService.checkSegmentConsistency(
      'A molecule is small.',
      'Eitthvað er lítið.',
      'efnafraedi-2e'
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ english: 'molecule', expected: 'sameind' });
  });

  it('checkSegmentConsistency passes when the resolved term IS present', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'molecule');
    addTermIn(cdb, c, 'is', 'sameind');
    // POSITIVE CONTROL, in this same test: the identical segment with the
    // Icelandic term ABSENT must still flag. Without it, `toHaveLength(0)`
    // passes against a wrapper that returns [] unconditionally — which is the
    // whole failure mode this pair exists to catch.
    expect(
      terminologyService.checkSegmentConsistency(
        'A molecule is small.',
        'Eitthvað er lítið.',
        'efnafraedi-2e'
      )
    ).toHaveLength(1);
    expect(
      terminologyService.checkSegmentConsistency(
        'A molecule is small.',
        'Sameind er lítil.',
        'efnafraedi-2e'
      )
    ).toHaveLength(0);
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

describe('normalizeChapterArg() — the sentinel WORD is the hazard, not the string type', () => {
  it('defaults an omitted chapter to 0, the book-default sentinel', () => {
    expect(terminologyService.normalizeChapterArg(undefined)).toBe(0);
  });
  it('accepts -1, the appendices sentinel', () => {
    expect(terminologyService.normalizeChapterArg(-1)).toBe(-1);
  });
  it('accepts an integer-like string, because req params and argv are strings', () => {
    expect(terminologyService.normalizeChapterArg('3')).toBe(3);
  });
  // THE CONTROL: each of these silently returns book-default rows if passed
  // through to buildPreferenceMap's `chapter IN (0, ?)`. They must throw.
  it.each([['appendices'], [null], [Number.NaN], [3.5], ['ch03']])(
    'throws on %p rather than silently answering from the book default',
    (bad) => {
      expect(() => terminologyService.normalizeChapterArg(bad)).toThrow(
        /chapter must be an integer/
      );
    }
  );
});

// ⚠️ THIS BLOCK AND THE "IS-side check" BLOCK BELOW IT MUST STAY LAST IN THE
// FILE, in that order. Both blocks' afterEach calls _setTestDb(null), and the
// file-level injection is established ONCE in beforeAll — so a null mid-file
// unsets it for every later block, and getDb() then opens the REAL
// sessions.db (terminologyService.js:93).
describe('findTermsInSegments() — concept model (B4b-1)', () => {
  let cdb;
  beforeEach(() => {
    ({ db: cdb } = freshMigratedDb());
    seedBooks(cdb); // server/scripts/lib/scratchCorpus.js — registers the 6 books + priorities
    terminologyService._setTestDb(cdb);
  });
  afterEach(() => {
    terminologyService._setTestDb(null);
    cdb && cdb.close();
  });

  it('matches an English term and emits the resolved Icelandic', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'atom');
    addTermIn(cdb, c, 'is', 'frumeind');
    const r = terminologyService.findTermsInSegments(
      [{ segmentId: 's1', enContent: 'An atom is small.', isContent: 'Frumeind er lítil.' }],
      'efnafraedi-2e'
    );
    expect(r.s1.matches).toHaveLength(1);
    expect(r.s1.matches[0]).toMatchObject({
      english: 'atom',
      icelandic: 'frumeind',
      isFallback: false,
    });
    expect(r.s1.matches[0].position).toBe(3);
  });

  // THE OVERLAP TILER — the property that must survive the cut-over.
  it('a longer term claims its span and the shorter overlapping one is dropped', () => {
    const a = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, a, 'en', 'melting point');
    addTermIn(cdb, a, 'is', 'bræðslumark');
    const b = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, b, 'en', 'melting');
    addTermIn(cdb, b, 'is', 'bráðnun');
    const r = terminologyService.findTermsInSegments(
      [{ segmentId: 's1', enContent: 'The melting point is high.', isContent: '' }],
      'efnafraedi-2e'
    );
    expect(r.s1.matches.map((m) => m.english)).toEqual(['melting point']);
  });

  // D4.2 — the same English string on two concepts is ONE match, and which
  // one wins comes from resolve(), not from row order.
  it('emits ONE match for an English string carried by two concepts', () => {
    const chem = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, chem, 'en', 'nucleus');
    addTermIn(cdb, chem, 'is', 'kjarni');
    const bio = addConceptIn(cdb, 'biology');
    addTermIn(cdb, bio, 'en', 'nucleus');
    addTermIn(cdb, bio, 'is', 'frumukjarni');
    const r = terminologyService.findTermsInSegments(
      [{ segmentId: 's1', enContent: 'The nucleus.', isContent: '' }],
      'efnafraedi-2e'
    );
    expect(r.s1.matches).toHaveLength(1);
    expect(r.s1.matches[0].icelandic).toBe('kjarni'); // chemistry book -> chemistry domain
  });

  // Item-18 semantics: a foreign-domain-only term still MATCHES, badged.
  // ⚠️ `mathematics` is the right domain to test with, and not an arbitrary
  // one: efnafraedi-2e's chain is ['chemistry','physics','biology'], and
  // domains.js says in as many words that mathematics is "deliberately absent
  // from the chemistry books ... out of scope on purpose, not by oversight".
  // A made-up domain would also be out of scope, but would not prove the rule.
  it('an out-of-scope concept still matches, flagged isFallback', () => {
    const c = addConceptIn(cdb, 'mathematics');
    addTermIn(cdb, c, 'en', 'eigenvalue');
    addTermIn(cdb, c, 'is', 'eigingildi');
    const r = terminologyService.findTermsInSegments(
      [{ segmentId: 's1', enContent: 'An eigenvalue.', isContent: '' }],
      'efnafraedi-2e'
    );
    expect(r.s1.matches[0]).toMatchObject({ english: 'eigenvalue', isFallback: true });
  });

  // Fix round 1, item 1d — an unregistered book (buildScope's {unscoped:
  // 'unregistered'}) matches NOTHING: fail-closed, per the ruling that
  // claiming everything is in-scope with no domain priorities to rank against
  // would be a lie. The POSITIVE CONTROL — the identical segment against a
  // REGISTERED book — is in this same test, so it cannot pass against a
  // matcher that emits zero matches for every input.
  it('an unregistered book matches nothing; the SAME term matches a registered book', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'atom');
    addTermIn(cdb, c, 'is', 'frumeind');
    const seg = [{ segmentId: 's1', enContent: 'An atom is small.', isContent: '' }];

    const unregistered = terminologyService.findTermsInSegments(seg, 'not-a-real-book-slug');
    expect(unregistered.s1.matches).toEqual([]);

    // Positive control: the matcher is not broken outright.
    const registered = terminologyService.findTermsInSegments(seg, 'efnafraedi-2e');
    expect(registered.s1.matches).toHaveLength(1);
    expect(registered.s1.matches[0].english).toBe('atom');
  });

  // D7 / §C43.
  it('never emits a match whose winner is the [vantar] placeholder', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'abembryonic pole');
    addTermIn(cdb, c, 'is', '[vantar]');
    const r = terminologyService.findTermsInSegments(
      [{ segmentId: 's1', enContent: 'The abembryonic pole.', isContent: '' }],
      'efnafraedi-2e'
    );
    expect(r.s1.matches).toEqual([]);
  });

  // Fix round 2, Finding 1 — the guard above only covers the WINNER. A
  // fallback match's `outOfScope` suggestion is built from headForm(), which
  // for a placeholder-only concept IS '[vantar]' — so the previous test
  // (which plants an IN-SCOPE concept and asserts toEqual([])) is vacuous
  // against this path: it would pass against any matcher that has gone
  // silent altogether. The POSITIVE CONTROL is in this SAME test — a second,
  // non-placeholder out-of-scope term in the same segment — so it cannot.
  it('a fallback match whose only Icelandic term is [vantar] produces no match, and a real fallback term in the same segment still does', () => {
    const placeholderOnly = addConceptIn(cdb, 'mathematics');
    addTermIn(cdb, placeholderOnly, 'en', 'nullcline');
    addTermIn(cdb, placeholderOnly, 'is', '[vantar]');

    const realFallback = addConceptIn(cdb, 'mathematics');
    addTermIn(cdb, realFallback, 'en', 'manifold');
    addTermIn(cdb, realFallback, 'is', 'margbreytni');

    const r = terminologyService.findTermsInSegments(
      [{ segmentId: 's1', enContent: 'A nullcline and a manifold.', isContent: '' }],
      'efnafraedi-2e'
    );
    // The placeholder-only term is silent; the real fallback term still surfaces.
    expect(r.s1.matches.map((m) => m.english)).toEqual(['manifold']);
    expect(r.s1.matches[0]).toMatchObject({ isFallback: true, icelandic: 'margbreytni' });
  });

  // Fix round 2, Finding 2 — conceptResolver's `hits` query has no ORDER BY,
  // so `outOfScope` inherits raw SQL row order (empirically: the EN
  // concept_term ROW insertion order, not conceptId order) unless this
  // function imposes one. Genuinely discriminating: `higherConcept` is
  // created SECOND (so it has the HIGHER conceptId) but its EN term ROW is
  // inserted FIRST — verified directly against the schema to put it ahead in
  // raw SQL order. Sorted by conceptId, `lowerConcept` (created first) must
  // win; unsorted, `higherConcept` would (confirmed by temporarily removing
  // the sort during development — this test then asserted 'haerra', not
  // 'laegra').
  it('a fallback with two out-of-scope candidates picks the LOWER conceptId, not SQL row order', () => {
    const lowerConcept = addConceptIn(cdb, 'mathematics'); // created first -> lower conceptId
    const higherConcept = addConceptIn(cdb, 'astronomy'); // created second -> higher conceptId

    // Insert the HIGHER concept's EN term row FIRST, the LOWER concept's SECOND.
    addTermIn(cdb, higherConcept, 'en', 'sharedFallbackTerm');
    addTermIn(cdb, lowerConcept, 'en', 'sharedFallbackTerm');
    addTermIn(cdb, lowerConcept, 'is', 'laegra');
    addTermIn(cdb, higherConcept, 'is', 'haerra');

    const r = terminologyService.findTermsInSegments(
      [{ segmentId: 's1', enContent: 'A sharedFallbackTerm here.', isContent: '' }],
      'efnafraedi-2e'
    );
    expect(r.s1.matches).toHaveLength(1);
    expect(r.s1.matches[0].icelandic).toBe('laegra'); // lower conceptId, sorted — not 'haerra'
  });

  it('returns empty for a segment with no EN content, without querying', () => {
    const r = terminologyService.findTermsInSegments(
      [{ segmentId: 's1', enContent: '', isContent: 'x' }],
      'efnafraedi-2e'
    );
    expect(r.s1).toEqual({ matches: [], issues: [] });
  });
});

// ⚠️ THIS BLOCK MUST STAY LAST IN THE FILE — see the comment on the block
// above it, which this one shares the hazard with.
describe('findTermsInSegments() — the IS-side check (B4b-1)', () => {
  let cdb;
  beforeEach(() => {
    ({ db: cdb } = freshMigratedDb());
    seedBooks(cdb);
    terminologyService._setTestDb(cdb);
  });
  afterEach(() => {
    terminologyService._setTestDb(null);
    cdb && cdb.close();
  });

  const seg = (en, is) => [{ segmentId: 's1', enContent: en, isContent: is }];

  it('no issue when the resolved term appears in the Icelandic', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'atom');
    addTermIn(cdb, c, 'is', 'frumeind');
    const r = terminologyService.findTermsInSegments(seg('An atom.', 'Frumeind.'), 'efnafraedi-2e');
    expect(r.s1.issues).toEqual([]);
  });

  it('reports missing when it does not', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'atom');
    addTermIn(cdb, c, 'is', 'frumeind');
    const r = terminologyService.findTermsInSegments(
      seg('An atom.', 'Eitthvað annað.'),
      'efnafraedi-2e'
    );
    expect(r.s1.issues).toHaveLength(1);
    expect(r.s1.issues[0]).toMatchObject({
      type: 'missing',
      english: 'atom',
      expected: 'frumeind',
    });
  });

  // D5 — the semantic narrowing, softened.
  it('reports `alternative`, not `missing`, when the editor used a rank-2 sibling', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'atom');
    addTermIn(cdb, c, 'is', 'frumeind', 1);
    addTermIn(cdb, c, 'is', 'atóm', 2);
    const r = terminologyService.findTermsInSegments(
      seg('An atom.', 'Atóm er lítið.'),
      'efnafraedi-2e'
    );
    expect(r.s1.issues[0]).toMatchObject({
      type: 'alternative',
      expected: 'frumeind',
      used: 'atóm',
    });
  });

  // THE CONTROL for the test above: the sibling is still present, but the
  // editor's Icelandic matches NEITHER term. Proves the intra-concept lookup
  // finds a genuine textual match rather than "any concept with ≥2 terms
  // reports alternative" regardless of content.
  it('the intra-concept sibling still reports missing when neither term matches', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'atom');
    addTermIn(cdb, c, 'is', 'frumeind', 1);
    addTermIn(cdb, c, 'is', 'atóm', 2);
    const r = terminologyService.findTermsInSegments(
      seg('An atom.', 'Eitthvað annað.'),
      'efnafraedi-2e'
    );
    expect(r.s1.issues[0]).toMatchObject({ type: 'missing', expected: 'frumeind' });
  });

  // D5, the CROSS-concept arm — the OTHER population alternative must cover.
  // Two different concepts carry the same English string; the higher-priority
  // domain wins (efnafraedi-2e's chain is chemistry@1, physics@2 — same chain
  // the item-18 fallback test above relies on), but the loser's head term is
  // still a real, offerable answer via alsoInScope — the same mechanism
  // verify-b4a-gates.js gate 3 exercises on the real corpus.
  it('reports `alternative` when the editor used a losing CROSS-concept synonym', () => {
    const a = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, a, 'en', 'atom');
    addTermIn(cdb, a, 'is', 'frumeind');
    const b = addConceptIn(cdb, 'physics');
    addTermIn(cdb, b, 'en', 'atom');
    addTermIn(cdb, b, 'is', 'atóm');
    const r = terminologyService.findTermsInSegments(
      seg('An atom.', 'Atóm er lítið.'),
      'efnafraedi-2e'
    );
    expect(r.s1.issues[0]).toMatchObject({
      type: 'alternative',
      expected: 'frumeind',
      used: 'atóm',
    });
  });

  // THE CONTROL for the test above: same two concepts, but the editor's
  // Icelandic matches neither — proves the cross-concept arm also requires a
  // real textual match, not just the existence of a losing candidate.
  it('the cross-concept synonym still reports missing when neither term matches', () => {
    const a = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, a, 'en', 'atom');
    addTermIn(cdb, a, 'is', 'frumeind');
    const b = addConceptIn(cdb, 'physics');
    addTermIn(cdb, b, 'en', 'atom');
    addTermIn(cdb, b, 'is', 'atóm');
    const r = terminologyService.findTermsInSegments(
      seg('An atom.', 'Eitthvað annað.'),
      'efnafraedi-2e'
    );
    expect(r.s1.issues[0]).toMatchObject({ type: 'missing', expected: 'frumeind' });
  });

  // ⚠️ THE ORDER-INDEPENDENCE REGRESSION TEST (fix round 1, whole-branch
  // review). A concept may carry MORE THAN ONE English string
  // (`UNIQUE(concept_id, lang, text)` is per string, not one-per-concept), and
  // `book_term_preference` is keyed on the ENGLISH STRING — so a preference on
  // 'atom' but not 'atomic particle' gives the SAME concept two different
  // winner termIds within one call, depending on which English string is being
  // resolved. An earlier version cached this concept's sibling terms keyed on
  // conceptId ALONE while excluding the winner in SQL — so whichever hit
  // reached that concept FIRST decided what was cached for every LATER hit on
  // the same concept, regardless of that later hit's own winner. Segment order
  // is incidental to an editor; it must never decide the answer (§C18).
  //
  // The 'pref' segment exists ONLY to populate the concept's cache from a
  // DIFFERENT English string's winner (atóm, via the preference) before the
  // 'other' segment is ever resolved — this is what the old code got wrong.
  // 'other' itself carries no preference, so its own winner is the ordinary
  // head form (frumeind), and its Icelandic ('Atóm er lítið.') genuinely uses
  // the sibling term — so the correct answer for 'other' is `alternative`,
  // `used: 'atóm'`, in EVERY segment order.
  it('the intra-concept lookup is independent of segment order, even under a book preference', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'atom');
    addTermIn(cdb, c, 'en', 'atomic particle');
    addTermIn(cdb, c, 'is', 'frumeind', 1);
    const atomTermId = addTermIn(cdb, c, 'is', 'atóm', 2);

    const bookId = cdb
      .prepare("SELECT id FROM registered_books WHERE slug = 'efnafraedi-2e'")
      .get().id;
    cdb
      .prepare(
        "INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 0, 'atom', ?)"
      )
      .run(bookId, atomTermId);

    const prefSeg = { segmentId: 'pref', enContent: 'An atom.', isContent: 'Ekkert hér.' };
    const otherSeg = {
      segmentId: 'other',
      enContent: 'An atomic particle.',
      isContent: 'Atóm er lítið.',
    };

    const prefFirst = terminologyService.findTermsInSegments([prefSeg, otherSeg], 'efnafraedi-2e');
    const otherFirst = terminologyService.findTermsInSegments([otherSeg, prefSeg], 'efnafraedi-2e');

    // THE ASSERTION: 'other' must answer identically regardless of which
    // segment was resolved first within the call.
    expect(prefFirst.other.issues).toEqual(otherFirst.other.issues);
    expect(otherFirst.other.issues[0]).toMatchObject({
      type: 'alternative',
      expected: 'frumeind',
      used: 'atóm',
    });
  });

  // THE PARADIGM PATH. This is the discrimination the C24 golden provably
  // lacks: strip every inflection from that fixture and it is byte-identical.
  it('a DECLINED form matches when a paradigm is stored', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'acid');
    const t = addTermIn(cdb, c, 'is', 'sýra');
    cdb
      .prepare('UPDATE concept_term SET inflections = ? WHERE id = ?')
      .run('["sýru","sýrunni"]', t);
    const r = terminologyService.findTermsInSegments(
      seg('An acid.', 'Í sýrunni.'),
      'efnafraedi-2e'
    );
    expect(r.s1.issues).toEqual([]);
  });

  // THE CONTROL for the test above. Same segment, no paradigm -> reported.
  it('the same declined form is reported missing WITHOUT a paradigm', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'acid');
    addTermIn(cdb, c, 'is', 'sýra');
    const r = terminologyService.findTermsInSegments(
      seg('An acid.', 'Í sýrunni.'),
      'efnafraedi-2e'
    );
    expect(r.s1.issues[0]).toMatchObject({ type: 'missing' });
  });

  it('a fallback term never produces an issue — QA must not demand another domain’s term', () => {
    const c = addConceptIn(cdb, 'literature');
    addTermIn(cdb, c, 'en', 'metaphor');
    addTermIn(cdb, c, 'is', 'myndlíking');
    const r = terminologyService.findTermsInSegments(
      seg('A metaphor.', 'Ekkert.'),
      'efnafraedi-2e'
    );
    expect(r.s1.matches).toHaveLength(1);
    expect(r.s1.issues).toEqual([]);
  });

  it('no issue when there is no Icelandic content to check', () => {
    const c = addConceptIn(cdb, 'chemistry');
    addTermIn(cdb, c, 'en', 'atom');
    addTermIn(cdb, c, 'is', 'frumeind');
    expect(
      terminologyService.findTermsInSegments(seg('An atom.', ''), 'efnafraedi-2e').s1.issues
    ).toEqual([]);
  });
});
