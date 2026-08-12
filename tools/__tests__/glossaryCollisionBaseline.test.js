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
 * Should this payload be swept for COMPETITIONS — two or more Icelandic values
 * under one English key? **Yes, always.** The name is kept because callers read
 * it, but it no longer discriminates.
 *
 * ⚠️ HISTORY, because both corrections matter and the second reverses the first.
 * 2026-08-09, a whole-branch review renamed this from `isSweepable`, which had
 * skipped the WHOLE sweep for resolved payloads: `findGlossaryCollisions`
 * returns two populations, and the resolved format represents a **comma-list**
 * perfectly well (`liffraedi-2e` resolves `missing → "skemmdar, horfnar og
 * viðgerðar tennur"`; `edlisfraedi-2e` resolves `response → "svar,svörun"`).
 * Left unfixed, adopting either book would have published a comma-list into an
 * `<mtext>` via `buildGlossaryMap` — which applies no comma filter, it only
 * *reports* — with nothing going red. That correction stands.
 *
 * What it got WRONG was retiring the competition half instead, on the premise
 * below.
 *
 * 🔴 THE RETIREMENT IS WITHDRAWN — 2026-08-12, §C71. It rested on "the resolved
 * export emits one entry per English string, so it cannot carry a competition."
 * **That premise is false, measured on all four committed payloads:** 17 real
 * competitions live in resolved files right now — efnafraedi-2e **11**
 * (`am → víddarmótun | ameríkín`, `at → astat | marsnákaætt`,
 * `cd → kadmín | kandela`, …), lifraen-efnafraedi 3, liffraedi-2e 2,
 * edlisfraedi-2e 1.
 *
 * ⚠️ AND THE COST OF BELIEVING IT WAS TOTAL, NOT PARTIAL. Organic's adoption
 * made the LAST book resolved, so the competition sweep went inert
 * **corpus-wide** — every book skipped, nothing red. The "not vacuous" guard
 * below is what caught it, for the exact reason its own comment gives: a
 * shipped detector that had never run went unnoticed for 13 days.
 *
 * ▶ Sweep every payload. If a producer is ever genuinely incapable of
 * expressing a competition, prove it by measuring that producer's committed
 * files, not by reasoning from its intended shape.
 */
export function sweepsCompetitions(glossary) {
  return Boolean(glossary);
}

/**
 * Which assertions a payload earns. Kept as a seam even though nothing retires
 * any more: it is where a future, MEASURED retirement would go, and it is what
 * let the withdrawn one be tested at all.
 * ⚠️ This said "no committed file is resolved-producer today" — as of
 * 2026-08-12 ALL FOUR are.
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

/** Every book with a glossary — retained as a named binding because the
 *  "not vacuous" assertion below reads it, and that assertion is what caught
 *  the corpus-wide inert sweep. */
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

  // ⚠️ EVERY book is swept for BOTH populations. Nothing retires — see
  // sweepsCompetitions for why the 2026-08-09 retirement was withdrawn.
  it.each(booksWithGlossaries)('%s', (slug) => {
    const bookDir = path.join(BOOKS_DIR, slug);
    const glossary = readGlossary(slug);
    const collisions = findGlossaryCollisions(glossary.terms || [], { approvedOnly: true });
    const d = diffAgainstBaseline(collisions, loadBaseline(bookDir));
    const { actual, expected } = collisionAssertions(glossary, d);

    expect(actual, `Run: npm run validate:glossary -- --book ${slug}`).toEqual(expected);
  });
});

describe('D7s retirement is WITHDRAWN — every payload is swept', () => {
  const d = {
    newCompetitions: [{ english: 'atom' }],
    changedChoices: [{ english: 'bond' }],
    newCommaLists: [{ english: 'missing' }],
  };

  it('a resolved payload is swept for comma lists', () => {
    const { actual, expected } = collisionAssertions({ producer: PRODUCER_RESOLVED }, d);
    expect(actual.newCommaLists).toEqual(['missing']);
    expect(expected.newCommaLists).toEqual([]);
  });

  it('a resolved payload IS swept for competitions and changed choices', () => {
    // ⚠️ INVERTED 2026-08-12 (§C71). This asserted the opposite, on the premise
    // that the resolved format "cannot represent a competition". Measured false:
    // 17 competitions live in resolved payloads today.
    const { actual, expected } = collisionAssertions({ producer: PRODUCER_RESOLVED }, d);
    expect(actual.newCompetitions).toEqual(['atom']);
    expect(expected.newCompetitions).toEqual([]);
    expect(actual.changedChoices).toEqual(['bond']);
  });

  it('the committed resolved payloads really do carry competitions', () => {
    // The measurement that withdrew the retirement, kept as a live check rather
    // than a claim in a comment: if this ever returns 0, re-examine whether the
    // retirement could be reinstated — do not assume it from the format.
    const withCompetitions = booksWithGlossaries.filter(
      (slug) =>
        findGlossaryCollisions(readGlossary(slug).terms || [], { approvedOnly: true }).competitions
          .length > 0
    );
    expect(withCompetitions.length).toBeGreaterThan(0);
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

describe('D7 — the retirement is withdrawn; every payload is swept', () => {
  const RESOLVED = 'export-terminology-resolved';

  it('a resolved payload IS swept — it can and does carry competitions', () => {
    // ⚠️ INVERTED 2026-08-12 (§C71). This read "a resolved payload cannot carry
    // a competition", reasoning that one entry per English string makes >=2
    // Icelandic values for one key impossible. The committed files disagree:
    // efnafraedi-2e alone holds 11, including `at → astat | marsnákaætt`, whose
    // row-order winner reaches 21 leaf math labels.
    expect(sweepsCompetitions({ producer: RESOLVED, terms: [] })).toBe(true);
  });

  it('a resolved payload really can hold two Icelandic values for one key', () => {
    // The counter-example to the retired premise, in its own right.
    const resolved = [
      { english: 'at', icelandic: 'astat', status: 'approved', domain: 'chemistry' },
      { english: 'at', icelandic: 'marsnákaætt', status: 'approved', domain: 'biology' },
    ];
    expect(findGlossaryCollisions(resolved, { approvedOnly: true }).competitions).toHaveLength(1);
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
