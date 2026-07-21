import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  SEED_COLUMNS,
  csvSeedField,
  serializeSeedCsv,
  serializeSeedJson,
  PROVENANCE_NOTE,
} = require('../lib/arnastofnunSeed');

const ROW = {
  english: 'mole',
  pos: 'noun',
  definitionEn: 'SI unit of amount',
  icelandic: 'mól',
  definitionIs: 'SI-eining efnismagns',
  alternatives: ['mólmagn'],
  subjects: ['chemistry', 'general'],
  notes: 'from ch03',
  source: 'openstax-mt',
  submissionType: 'new-alternative',
  existingIdordabankiTerm: 'móleind',
  existingIdordabankiId: '931162',
  proposedBy: 'Anna',
  approvedBy: 'Björn',
  approvedAt: '2026-07-01T00:00:00Z',
};

describe('SEED_COLUMNS', () => {
  it('is the exact 15-column header order', () => {
    expect(SEED_COLUMNS.join(',')).toBe(
      'english,pos,definition_en,icelandic,definition_is,alternatives,subject,notes,source,submission_type,existing_idordabanki_term,existing_idordabanki_id,proposed_by,approved_by,approved_at'
    );
  });
});

describe('csvSeedField formula-injection guard', () => {
  it('prefixes an apostrophe to a field starting with =', () => {
    expect(csvSeedField('=SUM(A1)')).toBe("'=SUM(A1)");
  });
  it('guards +, -, @ leads too', () => {
    expect(csvSeedField('+1')).toBe("'+1");
    expect(csvSeedField('-1')).toBe("'-1");
    expect(csvSeedField('@x')).toBe("'@x");
  });
  it('quotes (RFC 4180) a field with a comma after guarding', () => {
    expect(csvSeedField('=a,b')).toBe('"\'=a,b"');
  });
  it('leaves an ordinary field untouched', () => {
    expect(csvSeedField('mól')).toBe('mól');
  });
});

describe('serializeSeedCsv', () => {
  it('emits the header then one joined row', () => {
    const lines = serializeSeedCsv([ROW]).split('\n');
    expect(lines[0]).toBe(SEED_COLUMNS.join(','));
    expect(lines[1]).toBe(
      'mole,noun,SI unit of amount,mól,SI-eining efnismagns,mólmagn,chemistry; general,from ch03,openstax-mt,new-alternative,móleind,931162,Anna,Björn,2026-07-01T00:00:00Z'
    );
  });
  it('is a valid header-only file when there are no rows', () => {
    expect(serializeSeedCsv([])).toBe(SEED_COLUMNS.join(',') + '\n');
  });
  it('ends with a trailing newline', () => {
    expect(serializeSeedCsv([ROW]).endsWith('\n')).toBe(true);
  });
  it('wires csvSeedField into every cell: formula-guards notes and RFC-4180-quotes a comma-bearing definition_en', () => {
    const row = { ...ROW, notes: '=SUM(A1)', definitionEn: 'a, b' };
    const lines = serializeSeedCsv([row]).split('\n');
    expect(lines[1]).toBe(
      'mole,noun,"a, b",mól,SI-eining efnismagns,mólmagn,chemistry; general,\'=SUM(A1),openstax-mt,new-alternative,móleind,931162,Anna,Björn,2026-07-01T00:00:00Z'
    );
    expect(lines[1]).toContain("'=SUM(A1)"); // formula-guard survived the map
    expect(lines[1]).toContain('"a, b"'); // RFC-4180 quoting survived the map
  });
});

describe('serializeSeedJson', () => {
  it('emits provenance_note, stats, and terms with a fixed date', () => {
    const doc = JSON.parse(serializeSeedJson([ROW], { date: new Date('2026-01-02T03:04:05Z') }));
    expect(doc.generated).toBe('2026-01-02T03:04:05.000Z');
    expect(doc.provenance_note).toBe(PROVENANCE_NOTE);
    expect(doc.stats).toEqual({ total: 1, newTranslation: 0, newAlternative: 1 });
    expect(doc.terms[0].submission_type).toBe('new-alternative');
    expect(doc.terms[0].existing_idordabanki_id).toBe('931162');
    expect(doc.terms[0].alternatives).toEqual(['mólmagn']);
  });
  it('counts new-translation rows in stats', () => {
    const nt = {
      ...ROW,
      submissionType: 'new-translation',
      existingIdordabankiTerm: '',
      existingIdordabankiId: '',
    };
    const doc = JSON.parse(serializeSeedJson([nt, ROW], { date: new Date('2026-01-02Z') }));
    expect(doc.stats).toEqual({ total: 2, newTranslation: 1, newAlternative: 1 });
  });
});
