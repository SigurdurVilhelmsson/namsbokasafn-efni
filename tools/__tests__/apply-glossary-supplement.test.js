import { describe, it, expect } from 'vitest';
import { applySupplement } from '../apply-glossary-supplement.js';

/**
 * apply-glossary-supplement merges a durable curation layer onto generated
 * glossary output. These tests pin the merge policy that keeps the reader's
 * tooltip matcher (vefur glossaryTerms.ts) finding a definition for every
 * inline <dfn>, without letting curation override a current CNXML definition.
 */
describe('applySupplement', () => {
  it('rescues an entry whose english is absent from generated output', () => {
    const generated = { terms: [{ term: 'atóm', english: 'atom', definition: 'd', chapter: 1 }] };
    const supplement = {
      add: [{ term: 'vermi (H)', english: 'enthalpy (h)', definition: 'orka', chapter: 5 }],
    };
    const { result, added } = applySupplement(generated, supplement);
    expect(added).toBe(1);
    expect(result.terms.find((t) => t.term === 'vermi (H)')).toBeTruthy();
  });

  it('does NOT add an entry already covered by Icelandic headword (current CNXML wins)', () => {
    const generated = {
      terms: [{ term: 'vermi (H)', english: 'enthalpy', definition: 'current def', chapter: 5 }],
    };
    const supplement = {
      add: [{ term: 'vermi (H)', english: 'enthalpy (h)', definition: 'STALE def', chapter: 5 }],
    };
    const { result, added } = applySupplement(generated, supplement);
    expect(added).toBe(0);
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].definition).toBe('current def');
  });

  it('does NOT add an entry already covered by english (avoids stale duplicate)', () => {
    const generated = {
      terms: [{ term: 'júl (J)', english: 'joule (j)', definition: 'd', chapter: 5 }],
    };
    const supplement = {
      add: [{ term: 'allt önnur stafsetning', english: 'joule (j)', definition: 'x', chapter: 5 }],
    };
    const { added } = applySupplement(generated, supplement);
    expect(added).toBe(0);
  });

  it('matches english via composite "head (parenthetical)" part', () => {
    // generated english carries a symbol parenthetical; supplement english is the bare head
    const generated = {
      terms: [
        { term: 'hraðafasti (k)', english: 'rate constant (k)', definition: 'd', chapter: 12 },
      ],
    };
    const supplement = {
      add: [{ term: 'hraðafastinn', english: 'rate constant', definition: 'x', chapter: 12 }],
    };
    const { added } = applySupplement(generated, supplement);
    expect(added).toBe(0); // "rate constant" is a composite part of "rate constant (k)"
  });

  it('grafts alternateEnglish synonyms onto the generated entry sharing primary english', () => {
    const generated = {
      terms: [{ term: 'marktölur', english: 'significant figures', definition: 'd', chapter: 1 }],
    };
    const supplement = {
      graftAlternateEnglish: [
        { english: 'significant figures', alternateEnglish: ['significant digits'] },
      ],
    };
    const { result, grafted } = applySupplement(generated, supplement);
    expect(grafted).toBe(1);
    expect(result.terms[0].alternateEnglish).toContain('significant digits');
  });

  it('graft is a no-op when the target english is not present', () => {
    const generated = { terms: [{ term: 'atóm', english: 'atom', definition: 'd', chapter: 1 }] };
    const supplement = {
      graftAlternateEnglish: [{ english: 'nonexistent', alternateEnglish: ['x'] }],
    };
    const { grafted } = applySupplement(generated, supplement);
    expect(grafted).toBe(0);
  });

  it('grafting is idempotent (re-applying adds no duplicate synonyms)', () => {
    const generated = {
      terms: [
        {
          term: 'marktölur',
          english: 'significant figures',
          alternateEnglish: ['significant digits'],
          definition: 'd',
          chapter: 1,
        },
      ],
    };
    const supplement = {
      graftAlternateEnglish: [
        { english: 'significant figures', alternateEnglish: ['significant digits'] },
      ],
    };
    const { result, grafted } = applySupplement(generated, supplement);
    expect(grafted).toBe(0);
    expect(result.terms[0].alternateEnglish).toEqual(['significant digits']);
  });

  it('output is deduped by Icelandic headword and sorted by Icelandic collation', () => {
    const generated = {
      terms: [
        { term: 'æð', english: 'a', definition: 'd', chapter: 1 },
        { term: 'atóm', english: 'b', definition: 'd', chapter: 1 },
      ],
    };
    const supplement = {
      add: [{ term: 'blanda', english: 'mixture', definition: 'd', chapter: 1 }],
    };
    const { result } = applySupplement(generated, supplement);
    expect(result.terms.map((t) => t.term)).toEqual(['atóm', 'blanda', 'æð']); // æ sorts last in Icelandic
  });

  it('correctHeadword renames a generated entry in place, keyed by english (no duplicate)', () => {
    const generated = {
      terms: [{ term: 'entalpía (H)', english: 'enthalpy (h)', definition: 'd', chapter: 5 }],
    };
    const supplement = { correctHeadword: [{ english: 'enthalpy (h)', term: 'vermi (H)' }] };
    const { result, corrected } = applySupplement(generated, supplement);
    expect(corrected).toBe(1);
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].term).toBe('vermi (H)');
    expect(result.terms[0].definition).toBe('d'); // definition preserved
  });

  it('correctHeadword matches even when generated english carries an extra parenthetical', () => {
    const generated = {
      terms: [
        {
          term: 'staðalbrunaentalpía (ΔHc°)',
          english: 'standard enthalpy of combustion',
          definition: 'd',
          chapter: 5,
        },
      ],
    };
    // supplement keys on the bare english; also works if generated had "(δhc°)"
    const supplement = {
      correctHeadword: [
        { english: 'standard enthalpy of combustion (δhc°)', term: 'staðalbrunavermi (ΔHc°)' },
      ],
    };
    const { result, corrected } = applySupplement(generated, supplement);
    expect(corrected).toBe(1);
    expect(result.terms[0].term).toBe('staðalbrunavermi (ΔHc°)');
  });

  it('correctHeadword is a no-op when the english is absent', () => {
    const generated = { terms: [{ term: 'atóm', english: 'atom', definition: 'd', chapter: 1 }] };
    const { corrected } = applySupplement(generated, {
      correctHeadword: [{ english: 'enthalpy', term: 'vermi' }],
    });
    expect(corrected).toBe(0);
  });

  it('treats missing add/graft arrays as empty (no throw)', () => {
    const generated = { terms: [{ term: 'atóm', english: 'atom', definition: 'd', chapter: 1 }] };
    const { result, added, grafted } = applySupplement(generated, {});
    expect(added).toBe(0);
    expect(grafted).toBe(0);
    expect(result.terms).toHaveLength(1);
  });
});
