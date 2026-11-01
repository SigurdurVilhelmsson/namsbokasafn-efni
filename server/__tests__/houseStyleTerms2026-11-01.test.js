// server/__tests__/houseStyleTerms2026-11-01.test.js
//
// The term-source changes held until after the S tag (2026-11-01), which pins the stores the
// SD3 baseline read:
//   - bonding orbital → tengisvigrúm ([USER] 2026-10-11, kept 2026-10-29), REPLACING the
//     2026-09-19 value bindandi svigrúm that production's concept model holds today;
//   - antibonding orbital → andtengisvigrúm ([USER] 2026-11-01, register item (l));
//   - valence → gildistala with its five compounds ([USER] 2026-10-29), in one change;
//   - the standalone `concentrated` headword removed from the physics tier (the removal
//     script's list, not this file: house style can outrank a row, never remove one).
// Record: docs/decisions/2026-10-29-glossary-ruling-conflicts-resolved.md.
//
// 🔴 freshMigratedDb() has no Íðorðabankinn import, so a resolution test without a seeded
// incumbent passes with nothing to beat. Every ruling below is asserted AGAINST an incumbent.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const conceptResolver = require('../lib/conceptResolver');
const { HOUSE_STYLE_TERMS, HOUSE_STYLE_SOURCE } = require('../lib/houseStyleTerms');
const migration = require('../migrations/051-house-style-terms');
const { REMOVE } = require('../scripts/remove-wrong-sense-headwords');

/**
 * Each ruled head, its Icelandic, and the incumbent it must beat. Where production holds a
 * real incumbent it is used (valence → girðitala, Íðorðabankinn chemistry concept 4764);
 * otherwise a seeded rival stands in, marked as such.
 */
const RULED = [
  { en: 'bonding orbital', is: 'tengisvigrúm', incumbent: 'bindandi svigrúm', domain: 'chemistry' },
  {
    en: 'antibonding orbital',
    is: 'andtengisvigrúm',
    incumbent: 'andbindandi svigrúm',
    domain: 'chemistry',
  },
  { en: 'valence', is: 'gildistala', incumbent: 'girðitala', domain: 'chemistry' },
  { en: 'valence electron', is: 'gildisrafeind', incumbent: '(seeded rival)', domain: 'chemistry' },
  { en: 'valence bond', is: 'gildistengi', incumbent: '(seeded rival)', domain: 'chemistry' },
  { en: 'valence band', is: 'gildisborði', incumbent: '(seeded rival)', domain: 'chemistry' },
  { en: 'valence shell', is: 'gildishvolf', incumbent: '(seeded rival)', domain: 'chemistry' },
  { en: 'valence orbital', is: 'gildissvigrúm', incumbent: '(seeded rival)', domain: 'chemistry' },
];

let db;
beforeEach(() => {
  ({ db } = freshMigratedDb());
});
afterEach(() => db.close());

const seedCompetitor = (english, icelandic, domain) => {
  const { id } = db
    .prepare(`INSERT INTO concept (domain, collection) VALUES (?, 'IDORD') RETURNING id`)
    .get(domain);
  const ins = db.prepare(
    `INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,'idordabanki')`
  );
  ins.run(id, 'en', english, 1);
  ins.run(id, 'is', icelandic, 1);
};

const resolveIn = (book, english) =>
  conceptResolver.resolve(conceptResolver.buildScope(db, book), english);

const houseIcelandicFor = (english) =>
  db
    .prepare(
      `SELECT it.text FROM concept_term et
         JOIN concept_term it ON it.concept_id = et.concept_id AND it.lang='is'
        WHERE et.lang='en' AND et.text=? AND et.source=? ORDER BY it.id`
    )
    .all(english, HOUSE_STYLE_SOURCE)
    .map((r) => r.text);

describe('2026-11-01 house-style changes (after the S tag)', () => {
  it('CONTROL: a seeded competitor wins for an UNRULED head, so the tests below can fail', () => {
    seedCompetitor('some unruled head', 'eitthvað annað', 'chemistry');
    expect(resolveIn('efnafraedi-2e', 'some unruled head').winner?.text).toBe('eitthvað annað');
  });

  for (const r of RULED) {
    it(`${r.en} resolves to ${r.is} in chemistry, over ${r.incumbent}, by the house-style rule`, () => {
      seedCompetitor(r.en, r.incumbent, r.domain);
      const res = resolveIn('efnafraedi-2e', r.en);
      expect(res.winner?.text).toBe(r.is);
      expect(res.reason).toBe('house-style');
    });
  }

  it("REPLACES production's current bindandi svigrúm on the next boot, leaving one value", () => {
    // Production's house-style concept for bonding orbital carries the 2026-09-19 value today.
    // Reproduce that state, then boot again: 051 updates in place, so the old Icelandic row goes.
    const conceptId = db
      .prepare(
        `SELECT concept_id AS id FROM concept_term WHERE lang='en' AND text='bonding orbital' AND source=?`
      )
      .get(HOUSE_STYLE_SOURCE).id;
    db.prepare(
      `UPDATE concept_term SET text='bindandi svigrúm' WHERE concept_id=? AND lang='is'`
    ).run(conceptId);
    expect(houseIcelandicFor('bonding orbital')).toEqual(['bindandi svigrúm']); // control

    migration.up(db);
    expect(houseIcelandicFor('bonding orbital')).toEqual(['tengisvigrúm']);
  });

  it('valence does not reach coordination number, which keeps girðitala', () => {
    // The two Íðorðabankinn rows share girðitala; only valence is overridden.
    seedCompetitor('coordination number', 'girðitala', 'chemistry');
    expect(resolveIn('efnafraedi-2e', 'coordination number').winner?.text).toBe('girðitala');
  });

  it('valence lands WITH its five compounds, never alone', () => {
    // Bare valence is about 18 uses and its compounds about 270; the bare ruling alone would
    // put gildistala where the compound wants gildis-.
    const byEn = new Map(HOUSE_STYLE_TERMS.flatMap((t) => t.en.map((e) => [e, t.is])));
    const valenceHeads = [...byEn.keys()].filter((e) => e.startsWith('valence'));
    expect(valenceHeads.sort()).toEqual(
      [
        'valence',
        'valence band',
        'valence bond',
        'valence electron',
        'valence orbital',
        'valence shell',
      ].sort()
    );
  });

  it('every head this batch adds is a shape the export census can carry (§C187)', () => {
    const ens = new Set(HOUSE_STYLE_TERMS.flatMap((e) => e.en));
    for (const { en } of RULED) {
      expect(en).toMatch(/^[A-Za-z][A-Za-z-]*( [a-z]+)?$/);
      expect(ens.has(en)).toBe(true);
    }
  });

  it('concentrated is REMOVED from the physics tier, not overridden by house style', () => {
    expect(REMOVE).toContainEqual({ english: 'concentrated', domain: 'physics' });
    // House style can only outrank; an entry here would replace megn rather than remove it.
    const ens = new Set(HOUSE_STYLE_TERMS.flatMap((e) => e.en));
    expect(ens.has('concentrated')).toBe(false);
    // Control: only the physics row is named; chemistry has no concentrated concept to hit.
    expect(REMOVE.filter((r) => r.english === 'concentrated')).toHaveLength(1);
  });
});
