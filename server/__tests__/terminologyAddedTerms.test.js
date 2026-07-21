/**
 * Item 21 PR-B — getAddedTerms() rights filter + submission classification.
 * Fixture DB via createTestDb + _setTestDb (never live data).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';

process.env.SESSIONS_DB_PATH = path.join(os.tmpdir(), `added-terms-${process.pid}.db`);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const require = createRequire(import.meta.url);
const { createTestDb } = require('./helpers/terminologyTestDb');
const terminology = require('../services/terminologyService');

let db;

/** Insert a headword; return its id. */
function hw(english, { pos = null, definitionEn = null } = {}) {
  return Number(
    db
      .prepare('INSERT INTO terminology_headwords (english, pos, definition_en) VALUES (?, ?, ?)')
      .run(english, pos, definitionEn).lastInsertRowid
  );
}

/** Insert a translation; return its id. */
function tr(headwordId, icelandic, opts = {}) {
  const {
    source = 'manual',
    status = 'approved',
    idordabankiId = null,
    definitionIs = null,
    notes = null,
    proposedBy = 'u1',
    proposedByName = 'Editor One',
    approvedBy = 'he1',
    approvedByName = 'Head Editor',
    approvedAt = '2026-07-01T00:00:00Z',
    subjects = [],
  } = opts;
  const id = Number(
    db
      .prepare(
        `INSERT INTO terminology_translations
           (headword_id, icelandic, definition_is, notes, source, idordabanki_id, status,
            proposed_by, proposed_by_name, approved_by, approved_by_name, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        headwordId,
        icelandic,
        definitionIs,
        notes,
        source,
        idordabankiId,
        status,
        proposedBy,
        proposedByName,
        approvedBy,
        approvedByName,
        approvedAt
      ).lastInsertRowid
  );
  for (const s of subjects) {
    db.prepare(
      'INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
    ).run(id, s);
  }
  return id;
}

beforeEach(() => {
  db = createTestDb();
  terminology._setTestDb(db);
});
afterEach(() => {
  terminology._setTestDb(null);
  db.close();
});

describe('PROJECT_ORIGINATED_SOURCES', () => {
  it('is exactly the five Icelandic-origin sources (mutation-checked)', () => {
    expect(terminology.PROJECT_ORIGINATED_SOURCES).toEqual([
      'manual',
      'mined-postedit',
      'chapter-glossary',
      'openstax-mt',
      'openstax-glossary',
    ]);
  });
  it('excludes the already-in-Íðorðabankinn and indeterminate-origin sources', () => {
    for (const s of [
      'idordabankinn',
      'chemistry-association',
      'chemistry-society-csv',
      'imported-csv',
      'imported-excel',
      'merge-glossary',
    ]) {
      expect(terminology.PROJECT_ORIGINATED_SOURCES).not.toContain(s);
    }
  });
});

describe('getAddedTerms filter', () => {
  it('includes an approved, id-null, openstax-mt term (the reversed lead decision)', () => {
    const h = hw('adsorb');
    tr(h, 'aðsog', { source: 'openstax-mt' });
    const rows = terminology.getAddedTerms();
    expect(rows.map((r) => r.icelandic)).toEqual(['aðsog']);
  });

  it('excludes a proposed (unapproved) term', () => {
    const h = hw('atom');
    tr(h, 'frumeind', { status: 'proposed' });
    expect(terminology.getAddedTerms()).toHaveLength(0);
  });

  it('excludes a term already pulled from Íðorðabankinn (idordabanki_id set)', () => {
    const h = hw('mole');
    tr(h, 'mól', { idordabankiId: 931162 });
    expect(terminology.getAddedTerms()).toHaveLength(0);
  });

  it('excludes an idordabankinn-source term even with a null id', () => {
    const h = hw('base');
    tr(h, 'basi', { source: 'idordabankinn' });
    expect(terminology.getAddedTerms()).toHaveLength(0);
  });

  it('excludes an imported-csv term', () => {
    const h = hw('acid');
    tr(h, 'sýra', { source: 'imported-csv' });
    expect(terminology.getAddedTerms()).toHaveLength(0);
  });
});

describe('getAddedTerms submission classification', () => {
  it('labels a term new-translation when the headword has no id-linked sibling', () => {
    const h = hw('adsorb');
    tr(h, 'aðsog', { source: 'openstax-mt' });
    const [row] = terminology.getAddedTerms();
    expect(row.submissionType).toBe('new-translation');
  });

  it('labels a term new-alternative and surfaces the anchor when a sibling has an id', () => {
    const h = hw('mole');
    tr(h, 'mól', { source: 'manual' }); // project alternative (id null) -> KEPT
    tr(h, 'móleind', { source: 'idordabankinn', idordabankiId: 931162 }); // Íðorðabankinn's -> excluded, becomes anchor
    const rows = terminology.getAddedTerms();
    expect(rows).toHaveLength(1);
    expect(rows[0].submissionType).toBe('new-alternative');
    expect(rows[0].existingIdordabankiTerm).toBe('móleind');
    expect(rows[0].existingIdordabankiId).toBe('931162');
  });

  // The contradiction case (advisor catch): the lead confirmed chemistry-
  // association / -society terms are already IN Íðorðabankinn, yet they carry a
  // NULL idordabanki_id. An id-only classifier would mislabel this new-alternative
  // as new-translation. This test pins the fact into the classifier.
  it('labels new-alternative when a sibling is chemistry-association (in Íðorðabankinn, NULL id)', () => {
    const h = hw('buffer');
    tr(h, 'stuðpúði', { source: 'manual' }); // kept project term
    tr(h, 'jafnalausn', { source: 'chemistry-association' }); // in Íðorðabankinn, NULL id -> excluded, becomes anchor
    const rows = terminology.getAddedTerms();
    expect(rows).toHaveLength(1);
    expect(rows[0].submissionType).toBe('new-alternative');
    expect(rows[0].existingIdordabankiTerm).toBe('jafnalausn');
    expect(rows[0].existingIdordabankiId).toBe(''); // no id to surface — honest, not fabricated
  });
});

describe('getAddedTerms alternatives (approved project-Icelandic siblings)', () => {
  it('lists the other kept translations of the same headword, excluding self', () => {
    const h = hw('solvent');
    tr(h, 'leysir', { source: 'manual' });
    tr(h, 'leysiefni', { source: 'mined-postedit' });
    const rows = terminology.getAddedTerms();
    const leysir = rows.find((r) => r.icelandic === 'leysir');
    expect(leysir.alternatives).toEqual(['leysiefni']);
  });

  it('does not list an Íðorðabankinn sibling as an alternative', () => {
    const h = hw('salt');
    tr(h, 'salt', { source: 'manual' });
    tr(h, 'salti', { source: 'idordabankinn', idordabankiId: 5 });
    const [row] = terminology.getAddedTerms();
    expect(row.alternatives).toEqual([]); // the idordabankinn sibling is the anchor, not an alternative
  });
});

describe('getAddedTerms subject/book scoping', () => {
  it('filters by explicit subject', () => {
    const h1 = hw('cell');
    tr(h1, 'fruma', { subjects: ['biology'] });
    const h2 = hw('bond');
    tr(h2, 'tengi', { subjects: ['chemistry'] });
    expect(terminology.getAddedTerms({ subject: 'chemistry' }).map((r) => r.icelandic)).toEqual([
      'tengi',
    ]);
  });

  it('resolves book to its primary subject', () => {
    const h1 = hw('cell');
    tr(h1, 'fruma', { subjects: ['biology'] });
    const h2 = hw('bond');
    tr(h2, 'tengi', { subjects: ['chemistry'] });
    // efnafraedi-2e -> chemistry (seeded in createTestDb)
    expect(terminology.getAddedTerms({ book: 'efnafraedi-2e' }).map((r) => r.icelandic)).toEqual([
      'tengi',
    ]);
  });
});

describe('getAddedTerms attribution', () => {
  it('emits the human name for proposed_by/approved_by', () => {
    const h = hw('ion');
    tr(h, 'jón', { proposedByName: 'Anna', approvedByName: 'Björn' });
    const [row] = terminology.getAddedTerms();
    expect(row.proposedBy).toBe('Anna');
    expect(row.approvedBy).toBe('Björn');
  });
});
