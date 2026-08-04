// tools/__tests__/glossaryCollisionBaseline.test.js
/**
 * C18 regression fence over the COMMITTED glossaries.
 *
 * Its job is not to decide terms — it is to stop a new competition arriving
 * unnoticed, which is exactly how biology's 3,817 would land during
 * onboarding. A book with findings and NO baseline file must FAIL: absence of
 * a baseline is not approval (the C11(b) lesson — staleness is the alarm).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findGlossaryCollisions } from '../lib/glossary-collisions.js';
import {
  diffAgainstBaseline,
  loadBaseline,
  glossaryPath,
  buildBaseline,
} from '../validate-glossary.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOKS_DIR = path.join(REPO_ROOT, 'books');

const booksWithGlossaries = fs
  .readdirSync(BOOKS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((slug) => fs.existsSync(glossaryPath(path.join(BOOKS_DIR, slug))));

describe('committed glossaries have no competitions beyond their baseline', () => {
  it('finds at least one book with a glossary (the sweep is not vacuous)', () => {
    expect(booksWithGlossaries.length).toBeGreaterThan(0);
  });

  it.each(booksWithGlossaries)('%s', (slug) => {
    const bookDir = path.join(BOOKS_DIR, slug);
    const glossary = JSON.parse(fs.readFileSync(glossaryPath(bookDir), 'utf8'));
    const collisions = findGlossaryCollisions(glossary.terms || [], { approvedOnly: true });
    const d = diffAgainstBaseline(collisions, loadBaseline(bookDir));

    expect(
      {
        newCompetitions: d.newCompetitions.map((c) => c.english),
        changedChoices: d.changedChoices.map((c) => c.english),
        newCommaLists: d.newCommaLists.map((c) => c.english),
      },
      `Run: npm run validate:glossary -- --book ${slug}`
    ).toEqual({ newCompetitions: [], changedChoices: [], newCommaLists: [] });
  });
});

describe('diffAgainstBaseline semantics', () => {
  const collisions = {
    competitions: [{ english: 'atom', candidates: ['frumeind', 'atóm'], chosen: 'atóm' }],
    commaLists: [],
  };

  it('a finding with NO baseline is new — absence of a baseline is not approval', () => {
    expect(diffAgainstBaseline(collisions, null).newCompetitions).toHaveLength(1);
  });

  it('a finding recorded in the baseline is accepted', () => {
    const baseline = {
      competitions: { atom: { candidates: ['frumeind', 'atóm'], chosen: 'atóm' } },
      commaLists: {},
    };
    expect(diffAgainstBaseline(collisions, baseline).newCompetitions).toEqual([]);
  });

  it('a CHANGED choice fails even though the candidates are unchanged', () => {
    const baseline = {
      competitions: { atom: { candidates: ['frumeind', 'atóm'], chosen: 'frumeind' } },
      commaLists: {},
    };
    expect(diffAgainstBaseline(collisions, baseline).changedChoices).toHaveLength(1);
  });

  it('a NEW candidate joining an existing competition fails', () => {
    const baseline = {
      competitions: { atom: { candidates: ['frumeind'], chosen: 'atóm' } },
      commaLists: {},
    };
    expect(diffAgainstBaseline(collisions, baseline).changedChoices).toHaveLength(1);
  });

  it('reports a baseline entry that no longer competes, so the file can shrink', () => {
    const baseline = {
      competitions: {
        atom: { candidates: ['frumeind', 'atóm'], chosen: 'atóm' },
        group: { candidates: ['flokkur', 'hópur'], chosen: 'hópur' },
      },
      commaLists: {},
    };
    expect(diffAgainstBaseline(collisions, baseline).resolved).toEqual(['group']);
  });
});

describe('commaLists baseline shape — one headword can carry TWO distinct comma-list values (C18 I3)', () => {
  // findGlossaryCollisions emits one commaLists entry per ROW, so a headword
  // whose approved translations are two different comma-separated strings
  // produces two findings. A last-write-wins baseline (a plain string per
  // key) can only ever remember one of them, so --update-baseline could
  // never clear the other — the gate would go permanently red with no
  // documented remedy able to fix it.
  const commaListCollisions = {
    competitions: [],
    commaLists: [
      { english: 'anion', value: 'anjón, mínusjón', parts: ['anjón', 'mínusjón'] },
      { english: 'anion', value: 'neijón, mótjón', parts: ['neijón', 'mótjón'] },
    ],
  };

  it('buildBaseline keeps BOTH values for one headword, not last-write-wins', () => {
    const baseline = buildBaseline(commaListCollisions);
    expect(baseline.commaLists.anion).toEqual(['anjón, mínusjón', 'neijón, mótjón']);
  });

  it('a baseline built from the findings leaves the gate green — --update-baseline actually clears it', () => {
    const baseline = buildBaseline(commaListCollisions);
    expect(diffAgainstBaseline(commaListCollisions, baseline).newCommaLists).toEqual([]);
  });

  it('a baseline holding only ONE of the two values still flags the other as new', () => {
    const baseline = { competitions: {}, commaLists: { anion: ['anjón, mínusjón'] } };
    const d = diffAgainstBaseline(commaListCollisions, baseline);
    expect(d.newCommaLists).toEqual([
      { english: 'anion', value: 'neijón, mótjón', parts: ['neijón', 'mótjón'] },
    ]);
  });
});
