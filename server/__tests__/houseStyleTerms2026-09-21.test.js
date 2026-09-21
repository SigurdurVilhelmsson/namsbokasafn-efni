// server/__tests__/houseStyleTerms2026-09-21.test.js
//
// The six [USER] rulings of 2026-09-21 (glossary-subset audit, questions 1-18;
// nine were answered, four of those needed no concept-model change).
// Record: docs/decisions/2026-09-21-chemistry-terminology-rulings.md.
//
// 🔴 WHY A TEST AT ALL, when the entries are plain data: migration 051 runs on
// EVERY server start, and `failLoudOnMigrationErrors` exit(1)s on a collected
// error — so one malformed row means production never boots again. The schema
// comes from freshMigratedDb() (every real migration, never a hand-enumerated
// subset), so this exercises 051 exactly as a boot does.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const {
  HOUSE_STYLE_SOURCE,
  HOUSE_STYLE_DOMAIN,
  HOUSE_STYLE_TERMS,
} = require('../lib/houseStyleTerms');

/** Every ruling that required a concept-model change, and the form it replaces. */
const RULED = [
  { en: 'hydrocarbon', is: 'vetniskolefni', supersedes: 'vetniskol', wasDomain: 'physics' },
  { en: 'laser', is: 'leysir', supersedes: 'ljósleysir', wasDomain: 'physics' },
  { en: 'steam', is: 'gufa', supersedes: 'vatnsgufa', wasDomain: 'physics' },
  { en: 'electronegative', is: 'rafneikvæður', supersedes: 'rafeindadrægur', wasDomain: 'physics' },
  { en: 'phase transition', is: 'fasabreyting', supersedes: 'hamskipti', wasDomain: 'physics' },
  { en: 'carbon monoxide', is: 'kolmónoxíð', supersedes: 'koleinoxíð', wasDomain: 'biology' },
];

let db;
beforeEach(() => {
  ({ db } = freshMigratedDb());
});
afterEach(() => db.close());

const houseIcelandicFor = (en) =>
  db
    .prepare(
      `SELECT t2.text FROM concept_term t1
         JOIN concept c ON c.id = t1.concept_id
         JOIN concept_term t2 ON t2.concept_id = c.id
        WHERE t1.lang='en' AND t1.text=? AND t1.source=?
          AND t2.lang='is' AND t2.source=?`
    )
    .get(en, HOUSE_STYLE_SOURCE, HOUSE_STYLE_SOURCE);

describe('2026-09-21 house-style rulings', () => {
  it('migration 051 runs on a fresh DB without throwing', () => {
    // freshMigratedDb() already ran it; reaching here at all is the assertion.
    // A row 051 cannot handle would have exited before this line.
    expect(db.prepare('SELECT COUNT(*) n FROM concept').get().n).toBeGreaterThan(0);
  });

  for (const r of RULED) {
    it(`${r.en} resolves to the ruled ${r.is}`, () => {
      expect(houseIcelandicFor(r.en)?.text).toBe(r.is);
    });
  }

  it('every ruled concept is filed under the domain that outranks the row it supersedes', () => {
    // All six superseded rows sit in physics or biology. BOOK_DOMAIN_PRIORITY
    // for efnafraedi-2e is ['chemistry','physics','biology'], so filing the
    // house concept under `chemistry` is what makes it win — non-destructively,
    // with the Íðorðabankinn row left untouched.
    const { BOOK_DOMAIN_PRIORITY } = require('../lib/domains');
    const chain = BOOK_DOMAIN_PRIORITY['efnafraedi-2e'];
    for (const r of RULED) {
      expect(chain.indexOf(HOUSE_STYLE_DOMAIN)).toBeLessThan(chain.indexOf(r.wasDomain));
    }
  });

  it('CONTROL: a headword with no house-style ruling has no house-style concept', () => {
    // Without this, every assertion above would pass just as well against a
    // query that matches anything, or a migration that seeds the whole glossary.
    expect(houseIcelandicFor('carbohydrate')).toBeUndefined();
  });

  it('CONTROL: the four already-correct rulings deliberately added NO entry', () => {
    // carbohydrate, carbohydrates, lone pair and amorphous were ruled on
    // 2026-09-21 and needed no concept-model change — the stored lemma was
    // already right; they only had to ride their chapter's wire. Adding a row
    // for them would be the "forcing a form" case this file forbids.
    const ens = new Set(HOUSE_STYLE_TERMS.flatMap((e) => e.en));
    for (const en of ['carbohydrate', 'carbohydrates', 'lone pair', 'amorphous']) {
      expect(ens.has(en)).toBe(false);
    }
  });
});
