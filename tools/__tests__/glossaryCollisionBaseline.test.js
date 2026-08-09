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

/**
 * The resolved export (server/lib/glossaryProducer.js PRODUCER_RESOLVED — the
 * string is duplicated rather than imported because tools/ is MIT and server/
 * is AGPL; see root LICENSE).
 */
const PRODUCER_RESOLVED = 'export-terminology-resolved';

/**
 * Can this payload's producer represent a COMPETITION — two or more Icelandic
 * values under one English key? The resolved export emits one entry per English
 * string, so it cannot.
 *
 * ⚠️ CORRECTED 2026-08-09 by the whole-branch adversarial review. This was
 * `isSweepable`, and it skipped the whole sweep. That was wrong, because
 * `findGlossaryCollisions` returns TWO populations — `competitions` AND
 * `commaLists` (one Icelandic value that is itself a comma-separated list) —
 * and the resolved format represents a comma-list perfectly well. Measured on
 * production's corpus: 160 `lang='is'` terms contain a comma, ALL at rank 1, so
 * all reachable as a head form; `liffraedi-2e` already resolves
 * `missing → "skemmdar, horfnar og viðgerðar tennur"` and `edlisfraedi-2e`
 * resolves `response → "svar,svörun"`.
 *
 * Left as it was, adopting either book would have published a comma-list into a
 * `<mtext>` via `buildGlossaryMap` — which applies no comma filter, it only
 * *reports* — with the C18 fence no longer sweeping that book and nothing going
 * red. (`formatGlossary` does drop comma values on the MT side, so the render
 * path was the unprotected one, which is the reader-visible one.)
 *
 * The name now says which half retires.
 */
export function sweepsCompetitions(glossary) {
  return !(glossary && glossary.producer === PRODUCER_RESOLVED);
}

/**
 * Which assertions a payload earns. Extracted so the retirement is testable:
 * the real sweep is data-driven over committed files, and no committed file is
 * resolved-producer today, so nothing else could distinguish "we skip the
 * competition half" from "we stopped looking entirely".
 */
export function collisionAssertions(glossary, d) {
  const actual = { newCommaLists: d.newCommaLists.map((c) => c.english) };
  const expected = { newCommaLists: [] };
  if (sweepsCompetitions(glossary)) {
    actual.newCompetitions = d.newCompetitions.map((c) => c.english);
    actual.changedChoices = d.changedChoices.map((c) => c.english);
    expected.newCompetitions = [];
    expected.changedChoices = [];
  }
  return { actual, expected };
}

const readGlossary = (slug) =>
  JSON.parse(fs.readFileSync(glossaryPath(path.join(BOOKS_DIR, slug)), 'utf8'));

/** Books whose committed payload can still carry a competition. */
const competitionSweptBooks = booksWithGlossaries.filter((slug) =>
  sweepsCompetitions(readGlossary(slug))
);

describe('committed glossaries have no competitions beyond their baseline', () => {
  // ⚠️ D7: once skipping exists, "some book has a glossary file" no longer
  // implies "some book was swept" — every book could be skipped and this would
  // still pass. Assert what actually happened, or the retirement becomes the
  // bug. This test's own header states the principle: absence of a baseline is
  // not approval (the C11(b) lesson — a shipped detector that had never run
  // went unnoticed for 13 days).
  it('actually sweeps at least one book for competitions (the sweep is not vacuous)', () => {
    expect(competitionSweptBooks.length).toBeGreaterThan(0);
  });

  // ⚠️ EVERY book is swept, including resolved-producer ones — only the
  // competition half of the assertion retires. See sweepsCompetitions.
  it.each(booksWithGlossaries)('%s', (slug) => {
    const bookDir = path.join(BOOKS_DIR, slug);
    const glossary = readGlossary(slug);
    const collisions = findGlossaryCollisions(glossary.terms || [], { approvedOnly: true });
    const d = diffAgainstBaseline(collisions, loadBaseline(bookDir));
    const { actual, expected } = collisionAssertions(glossary, d);

    expect(actual, `Run: npm run validate:glossary -- --book ${slug}`).toEqual(expected);
  });
});

describe('D7 retires only the competition half of the sweep', () => {
  const d = {
    newCompetitions: [{ english: 'atom' }],
    changedChoices: [{ english: 'bond' }],
    newCommaLists: [{ english: 'missing' }],
  };

  it('a resolved payload is STILL swept for comma lists', () => {
    // The format cannot represent a competition, but it represents a comma-list
    // fine — `liffraedi-2e` resolves `missing` to a three-item comma list today.
    const { actual, expected } = collisionAssertions({ producer: PRODUCER_RESOLVED }, d);
    expect(actual.newCommaLists).toEqual(['missing']);
    expect(expected.newCommaLists).toEqual([]);
  });

  it('a resolved payload is NOT swept for competitions or changed choices', () => {
    const { actual, expected } = collisionAssertions({ producer: PRODUCER_RESOLVED }, d);
    expect(actual).not.toHaveProperty('newCompetitions');
    expect(expected).not.toHaveProperty('newCompetitions');
    expect(actual).not.toHaveProperty('changedChoices');
  });

  it('a merge-glossary payload is swept for all three', () => {
    const { actual } = collisionAssertions({ terms: [{ category: 'x', chapter: 1 }] }, d);
    expect(actual).toEqual({
      newCommaLists: ['missing'],
      newCompetitions: ['atom'],
      changedChoices: ['bond'],
    });
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

describe('D7 — the COMPETITION half retires per book, at adoption', () => {
  const RESOLVED = 'export-terminology-resolved';

  it('a resolved payload cannot carry a competition', () => {
    // One entry per English string, so findGlossaryCollisions can never find
    // >=2 Icelandic values for one key. ⚠️ This is true of COMPETITIONS ONLY —
    // the same payload can still carry a comma-list, which is why the sweep
    // itself no longer skips it. See sweepsCompetitions and the describe above.
    expect(sweepsCompetitions({ producer: RESOLVED, terms: [] })).toBe(false);
  });

  it('a resolved payload CAN carry a comma-list, measured on the real corpus', () => {
    // Not hypothetical: production holds 160 `lang='is'` terms containing a
    // comma, all at rank 1, and liffraedi-2e resolves `missing` to exactly this
    // three-item list today. findGlossaryCollisions finds it in a payload the
    // old predicate would have skipped entirely.
    const resolved = [
      {
        english: 'missing',
        icelandic: 'skemmdar, horfnar og viðgerðar tennur',
        status: 'approved',
        domain: 'biology',
      },
    ];
    const c = findGlossaryCollisions(resolved, { approvedOnly: true });
    expect(c.competitions).toHaveLength(0);
    expect(c.commaLists).toHaveLength(1);
  });

  it('still sweeps a merge-glossary payload for competitions', () => {
    expect(sweepsCompetitions({ terms: [{ english: 'atom', category: 'x', chapter: 1 }] })).toBe(
      true
    );
  });

  it('still sweeps an old-export payload for competitions', () => {
    expect(sweepsCompetitions({ producer: 'export-terminology', terms: [{ subjects: [] }] })).toBe(
      true
    );
  });
});

describe('the duplicated producer string cannot drift', () => {
  it('matches server/lib/glossaryProducer.js, which owns it', () => {
    // ⚠️ READ AS TEXT, never import: tools/ is MIT and server/ is AGPL, and an
    // import here would add exactly the edge CLAUDE.md gap E-2 says not to
    // accumulate. Reading a file creates no runtime dependency, so this closes
    // the drift without creating the coupling it exists to avoid.
    //
    // Without this, a rename on the server side would leave tools/ silently
    // sweeping resolved payloads again — green, and wrong.
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'server', 'lib', 'glossaryProducer.js'),
      'utf8'
    );
    expect(src).toContain(`const PRODUCER_RESOLVED = '${PRODUCER_RESOLVED}';`);
  });
});
