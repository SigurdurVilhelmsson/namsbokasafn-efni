// server/__tests__/conceptFromEntry.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { conceptFromEntry, COLLECTION_DOMAIN } = require('../lib/conceptFromEntry');

const entry = (words, id = 931178) => ({ id, words });
const w = (fklanguage, word, extra = {}) => ({ fklanguage, word, ...extra });

describe('conceptFromEntry', () => {
  it('keeps the Íðorðabankinn entry id as the concept identity', () => {
    const r = conceptFromEntry(entry([w('EN', 'atom'), w('IS', 'frumeind')]), {
      collection: 'EFNAFR',
      domain: 'chemistry',
    });
    expect(r.concept.idordabankiId).toBe(931178);
  });

  it('ranks the head form 1', () => {
    const r = conceptFromEntry(entry([w('IS', 'frumeind')]), {
      collection: 'EFNAFR',
      domain: 'chemistry',
    });
    expect(r.terms.find((t) => t.lang === 'is' && t.text === 'frumeind').rank).toBe(1);
  });

  it('ranks a listed synonym 2, on the SAME concept', () => {
    const r = conceptFromEntry(entry([w('IS', 'frumeind', { synonyms: 'atóm' })]), {
      collection: 'EFNAFR',
      domain: 'chemistry',
    });
    const is = r.terms.filter((t) => t.lang === 'is');
    expect(is.map((t) => [t.text, t.rank])).toEqual([
      ['frumeind', 1],
      ['atóm', 2],
    ]);
  });

  it('keeps the English side as terms too', () => {
    const r = conceptFromEntry(entry([w('EN', 'atom'), w('IS', 'frumeind')]), {
      collection: 'EFNAFR',
      domain: 'chemistry',
    });
    expect(r.terms.filter((t) => t.lang === 'en').map((t) => t.text)).toEqual(['atom']);
  });

  it('keeps a Latin term — this is what makes PODDUR importable', () => {
    const r = conceptFromEntry(entry([w('LA', 'Drosophila melanogaster'), w('IS', 'ediksgerla')]), {
      collection: 'PODDUR',
      domain: 'biology',
    });
    expect(r.terms.find((t) => t.lang === 'la').text).toBe('Drosophila melanogaster');
  });

  it('accepts an entry with NO English side at all', () => {
    const r = conceptFromEntry(entry([w('LA', 'Pediculus humanus'), w('IS', 'fatalús')]), {
      collection: 'PODDUR',
      domain: 'biology',
    });
    expect(r).not.toBeNull();
    expect(r.terms.some((t) => t.lang === 'en')).toBe(false);
  });

  it('drops languages outside en/is/la', () => {
    const r = conceptFromEntry(
      entry([w('IS', 'ediksgerla'), w('DE', 'Taufliege'), w('SV', 'bananfluga')]),
      { collection: 'PODDUR', domain: 'biology' }
    );
    expect(r.terms.every((t) => ['en', 'is', 'la'].includes(t.lang))).toBe(true);
  });

  it('returns null when there is no Icelandic term — nothing to translate to', () => {
    const r = conceptFromEntry(entry([w('EN', 'atom'), w('DE', 'Atom')]), {
      collection: 'EFNAFR',
      domain: 'chemistry',
    });
    expect(r).toBeNull();
  });

  it('records the collection as provenance', () => {
    const r = conceptFromEntry(entry([w('IS', 'frumeind')]), {
      collection: 'EFNAFR',
      domain: 'chemistry',
    });
    expect(r.concept.collection).toBe('EFNAFR');
  });

  it('maps PODDUR to biology', () => {
    expect(COLLECTION_DOMAIN.PODDUR).toBe('biology');
  });

  it('maps LAEKN to anatomy-physiology', () => {
    expect(COLLECTION_DOMAIN.LAEKN).toBe('anatomy-physiology');
  });

  it('covers all 20 collections the spec imports', () => {
    expect(Object.keys(COLLECTION_DOMAIN)).toHaveLength(20);
  });

  it('pins the full COLLECTION_DOMAIN map — a swap between two valid domains must fail this test', () => {
    // Hand-checked against the spec, all 20 confirmed 1:1 correct. Transcribed
    // verbatim, not "corrected" — this is regression protection, not a spec
    // re-derivation. The length + membership checks above pass on a domain
    // swap (e.g. EDLISFR: physics -> astronomy); only a full-map pin catches it.
    expect(COLLECTION_DOMAIN).toEqual({
      EFNAFR: 'chemistry',
      LIFORD: 'biology',
      LIFORD2: 'biology',
      ERFDAFR: 'biology',
      ONAEMI: 'biology',
      LYFJAFRLYFJASTOFNUN: 'biology',
      FARALDSFRAEDI: 'biology',
      LYDHEILSA: 'biology',
      FUGLAR: 'biology',
      PODDUR: 'biology',
      EDLISFR: 'physics',
      STJARNA: 'astronomy',
      GEIMVISINDI: 'astronomy',
      LAEKN: 'anatomy-physiology',
      TANNL: 'anatomy-physiology',
      STAERDFRAEDI: 'mathematics',
      TOLFR: 'mathematics',
      LAND: 'earth-science',
      JARDFRAEDI2: 'earth-science',
      JARDEDLISFRAEDI: 'earth-science',
    });
  });

  it('uses only the seven approved domains', () => {
    const allowed = new Set([
      'biology',
      'chemistry',
      'physics',
      'astronomy',
      'anatomy-physiology',
      'mathematics',
      'earth-science',
    ]);
    for (const d of Object.values(COLLECTION_DOMAIN)) expect(allowed.has(d)).toBe(true);
  });
});
