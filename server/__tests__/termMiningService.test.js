/**
 * Tests for termMiningService — mining recurring post-edit corrections into
 * term-decision candidates, and promoting them into proposed glossary terms.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration037 = require('../migrations/037-mined-term-candidates');
const termMining = require('../services/termMiningService');
const terminologyService = require('../services/terminologyService');

let db;

function makeDb() {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  migration037.up(d);
  d.exec(`
    CREATE TABLE segment_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book TEXT, chapter INTEGER, module_id TEXT, segment_id TEXT,
      original_content TEXT, edited_content TEXT, status TEXT
    );
    CREATE TABLE terminology_headwords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      english TEXT NOT NULL, pos TEXT, definition_en TEXT,
      UNIQUE(english, pos)
    );
    CREATE TABLE terminology_translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      headword_id INTEGER NOT NULL, icelandic TEXT NOT NULL, definition_is TEXT,
      inflections TEXT, source TEXT, idordabanki_id INTEGER, notes TEXT,
      status TEXT DEFAULT 'proposed', proposed_by TEXT, proposed_by_name TEXT,
      UNIQUE(headword_id, icelandic)
    );
    CREATE TABLE terminology_translation_subjects (
      translation_id INTEGER NOT NULL, subject TEXT NOT NULL,
      PRIMARY KEY (translation_id, subject)
    );
  `);
  return d;
}

function addEdit(book, moduleId, segId, before, after, status = 'approved') {
  db.prepare(
    `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, status)
     VALUES (?, 3, ?, ?, ?, ?, ?)`
  ).run(book, moduleId, segId, before, after, status);
}

beforeEach(() => {
  db = makeDb();
  termMining._setTestDb(db);
  terminologyService._setTestDb(db);
});

afterEach(() => {
  termMining._setTestDb(null);
  terminologyService._setTestDb(null);
  db.close();
});

describe('extractSubstitution', () => {
  it('isolates the differing window by trimming common prefix/suffix', () => {
    const sub = termMining.extractSubstitution('það er gott efni', 'það er fínt efni');
    expect(sub.mt).toEqual(['gott']);
    expect(sub.corrected).toEqual(['fínt']);
  });

  it('returns empty windows for identical strings', () => {
    const sub = termMining.extractSubstitution('sama efni', 'sama efni');
    expect(sub.mt).toEqual([]);
    expect(sub.corrected).toEqual([]);
  });
});

describe('isTermLike', () => {
  it('accepts a short alphabetic substitution', () => {
    expect(termMining.isTermLike({ mt: ['gott'], corrected: ['fínt'] })).toBe(true);
  });
  it('rejects pure insertions/deletions', () => {
    expect(termMining.isTermLike({ mt: [], corrected: ['nýtt'] })).toBe(false);
  });
  it('rejects long (sentence-rewrite) windows', () => {
    expect(termMining.isTermLike({ mt: ['a', 'b', 'c', 'd'], corrected: ['e'] })).toBe(false);
  });
  it('rejects identical forms', () => {
    expect(termMining.isTermLike({ mt: ['Efni'], corrected: ['efni'] })).toBe(false);
  });
});

describe('mineBook', () => {
  it('stores a substitution recurring ≥ threshold times', () => {
    addEdit('tb', 'm1', 's1', 'þetta er gott dæmi', 'þetta er fínt dæmi');
    addEdit('tb', 'm1', 's2', 'mjög gott hér', 'mjög fínt hér');
    addEdit('tb', 'm2', 's3', 'alveg gott núna', 'alveg fínt núna');

    const res = termMining.mineBook('tb');
    expect(res.scanned).toBe(3);
    expect(res.candidates).toBe(1);

    const open = termMining.listCandidates('tb');
    expect(open).toHaveLength(1);
    expect(open[0].mt_form).toBe('gott');
    expect(open[0].corrected_form).toBe('fínt');
    expect(open[0].occurrences).toBe(3);
  });

  it('ignores one-off corrections below threshold', () => {
    addEdit('tb', 'm1', 's1', 'eitt gott', 'eitt fínt');
    addEdit('tb', 'm1', 's2', 'annað slæmt', 'annað lélegt'); // different sub, count 1
    const res = termMining.mineBook('tb');
    expect(res.candidates).toBe(0);
  });

  it('ignores full-sentence rewrites and non-approved edits', () => {
    addEdit('tb', 'm1', 's1', 'a', 'allt annað og miklu lengra', 'approved'); // rewrite
    addEdit('tb', 'm1', 's2', 'x gott y', 'x fínt y', 'pending'); // not approved
    addEdit('tb', 'm1', 's3', 'p gott q', 'p fínt q', 'pending');
    addEdit('tb', 'm1', 's4', 'r gott s', 'r fínt s', 'pending');
    const res = termMining.mineBook('tb');
    expect(res.candidates).toBe(0);
  });

  it('is idempotent and refreshes occurrences without reopening dismissed rows', () => {
    addEdit('tb', 'm1', 's1', 'a gott b', 'a fínt b');
    addEdit('tb', 'm1', 's2', 'c gott d', 'c fínt d');
    addEdit('tb', 'm1', 's3', 'e gott f', 'e fínt f');
    termMining.mineBook('tb');
    const [cand] = termMining.listCandidates('tb');
    termMining.dismissCandidate(cand.id);

    // Re-mine: must not resurrect the dismissed candidate into the open queue.
    termMining.mineBook('tb');
    expect(termMining.listCandidates('tb', { status: 'open' })).toHaveLength(0);
    expect(termMining.listCandidates('tb', { status: 'dismissed' })).toHaveLength(1);
  });
});

describe('promoteCandidate', () => {
  function seedOneCandidate() {
    addEdit('tb', 'm1', 's1', 'a gott b', 'a fínt b');
    addEdit('tb', 'm1', 's2', 'c gott d', 'c fínt d');
    addEdit('tb', 'm1', 's3', 'e gott f', 'e fínt f');
    termMining.mineBook('tb');
    return termMining.listCandidates('tb')[0];
  }

  it('creates a proposed glossary term with the human-supplied English headword', () => {
    const cand = seedOneCandidate();
    const result = termMining.promoteCandidate(cand.id, { english: 'fine' }, 'u1', 'Head Editor');
    expect(result.headwordId).toBeTruthy();

    // The translation is created as 'proposed' (still needs approval).
    const tr = db
      .prepare('SELECT * FROM terminology_translations WHERE id = ?')
      .get(result.translationId);
    expect(tr.icelandic).toBe('fínt');
    expect(tr.status).toBe('proposed');
    expect(tr.source).toBe('mined-postedit');

    // The candidate is marked promoted and leaves the open queue.
    expect(termMining.listCandidates('tb', { status: 'open' })).toHaveLength(0);
    expect(termMining.listCandidates('tb', { status: 'promoted' })).toHaveLength(1);
  });

  it('requires an English headword', () => {
    const cand = seedOneCandidate();
    expect(() => termMining.promoteCandidate(cand.id, { english: '' }, 'u1', 'HE')).toThrow(
      /English headword/i
    );
  });

  it('refuses to promote twice', () => {
    const cand = seedOneCandidate();
    termMining.promoteCandidate(cand.id, { english: 'fine' }, 'u1', 'HE');
    expect(() => termMining.promoteCandidate(cand.id, { english: 'fine' }, 'u1', 'HE')).toThrow(
      /already promoted/i
    );
  });
});
