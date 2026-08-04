// tools/__tests__/glossary-collisions.test.js
/**
 * C18: two approved translations can compete for one English headword.
 * buildGlossaryMap's Map silently last-write-wins; formatGlossary sends both
 * to Málstaður. This detector is the single definition of "competition" —
 * three consumers share it so the rule cannot drift.
 */
import { describe, it, expect } from 'vitest';
import { findGlossaryCollisions, formatCollisionReport } from '../lib/glossary-collisions.js';

const term = (english, icelandic, status = 'approved') => ({ english, icelandic, status });

describe('findGlossaryCollisions — competitions', () => {
  it('reports two distinct Icelandic values for one English key', () => {
    const { competitions } = findGlossaryCollisions([
      term('atom', 'frumeind'),
      term('atom', 'atóm'),
    ]);
    expect(competitions).toEqual([
      { english: 'atom', candidates: ['frumeind', 'atóm'], chosen: 'atóm' },
    ]);
  });

  it('does NOT report two identical values (a duplicate row is not a competition)', () => {
    const { competitions } = findGlossaryCollisions([term('water', 'vatn'), term('water', 'vatn')]);
    expect(competitions).toEqual([]);
  });

  it('collects all three candidates when three compete', () => {
    const { competitions } = findGlossaryCollisions([
      term('resonance', 'samhrif'),
      term('resonance', 'vok'),
      term('resonance', 'vok mynd'),
    ]);
    expect(competitions[0].candidates).toEqual(['samhrif', 'vok', 'vok mynd']);
  });

  it('chosen is the LAST qualifying entry, matching buildGlossaryMap last-write-wins', () => {
    const { competitions } = findGlossaryCollisions([
      term('group', 'flokkur'),
      term('group', 'hópur'),
    ]);
    expect(competitions[0].chosen).toBe('hópur');
  });

  it('folds case: Atom and atom are one key', () => {
    const { competitions } = findGlossaryCollisions([
      term('Atom', 'frumeind'),
      term('atom', 'atóm'),
    ]);
    expect(competitions).toHaveLength(1);
    expect(competitions[0].english).toBe('atom');
  });

  it('ignores blank sides, matching both consumers own filters', () => {
    const { competitions } = findGlossaryCollisions([
      term('ether', 'eter'),
      term('ether', '   '),
      term('  ', 'eter'),
    ]);
    expect(competitions).toEqual([]);
  });

  it('approvedOnly:true excludes non-approved candidates', () => {
    const { competitions } = findGlossaryCollisions([
      term('cell', 'fruma'),
      term('cell', 'ker', 'proposed'),
    ]);
    expect(competitions).toEqual([]);
  });

  it('approvedOnly:false includes them', () => {
    const { competitions } = findGlossaryCollisions(
      [term('cell', 'fruma'), term('cell', 'ker', 'proposed')],
      { approvedOnly: false }
    );
    expect(competitions).toHaveLength(1);
  });
});

describe('findGlossaryCollisions — comma lists', () => {
  it('reports a comma-separated value and splits parts for the reader', () => {
    const { commaLists } = findGlossaryCollisions([term('anion', 'anjón, mínusjón, neijón')]);
    expect(commaLists).toEqual([
      {
        english: 'anion',
        value: 'anjón, mínusjón, neijón',
        parts: ['anjón', 'mínusjón', 'neijón'],
      },
    ]);
  });

  it('a comma value that ALSO competes appears in both arrays, independently', () => {
    const r = findGlossaryCollisions([term('power', 'fjöldatala, stétt'), term('power', 'veldi')]);
    expect(r.competitions).toHaveLength(1);
    expect(r.commaLists).toHaveLength(1);
  });

  it('a plain value is not a comma list', () => {
    expect(findGlossaryCollisions([term('water', 'vatn')]).commaLists).toEqual([]);
  });
});

describe('formatCollisionReport', () => {
  it('returns null when there is nothing to report', () => {
    expect(formatCollisionReport('efnafraedi-2e', { competitions: [], commaLists: [] })).toBeNull();
  });

  it('names the book, both counts, and the chosen term', () => {
    const out = formatCollisionReport('efnafraedi-2e', {
      competitions: [{ english: 'group', candidates: ['flokkur', 'hópur'], chosen: 'hópur' }],
      commaLists: [],
    });
    expect(out).toContain('efnafraedi-2e');
    expect(out).toContain('group → flokkur | hópur');
    expect(out).toContain('hópur');
  });

  it('states both the total and the unmasked count when masked is annotated', () => {
    const out = formatCollisionReport('efnafraedi-2e', {
      competitions: [
        { english: 'atom', candidates: ['a', 'b'], chosen: 'b', masked: true },
        { english: 'group', candidates: ['c', 'd'], chosen: 'd', masked: false },
      ],
      commaLists: [],
    });
    expect(out).toContain('2 English key');
    expect(out).toContain('1 not covered');
  });

  it('truncates a long list rather than printing every entry', () => {
    const competitions = Array.from({ length: 13 }, (_, i) => ({
      english: `term${i}`,
      candidates: ['a', 'b'],
      chosen: 'b',
      masked: false,
    }));
    const out = formatCollisionReport('efnafraedi-2e', { competitions, commaLists: [] });
    expect(out).toContain('… 8 more');
    expect(out).not.toContain('term12 →');
  });

  it('always points at the validator for the full list', () => {
    const out = formatCollisionReport('efnafraedi-2e', {
      competitions: [{ english: 'group', candidates: ['a', 'b'], chosen: 'b' }],
      commaLists: [],
    });
    expect(out).toContain('npm run validate:glossary -- --book efnafraedi-2e');
  });
});
