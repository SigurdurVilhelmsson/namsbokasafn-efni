// server/__tests__/houseStyleTerms2026-09-27.test.js
//
// The [USER] rulings of 2026-09-27 from the chemistry ruling sheet (§C193) that change the
// concept model. Record: docs/decisions/2026-09-27-chemistry-terms-and-titles-ruling-sheet.md.
//
// 🔴 WHY A TEST AT ALL, when the entries are plain data: migration 051 runs on EVERY server
// start and `failLoudOnMigrationErrors` exit(1)s on a collected error — one malformed row and
// production never boots again. freshMigratedDb() runs every real migration, so this
// exercises 051 exactly as a boot does.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const conceptResolver = require('../lib/conceptResolver');
const { HOUSE_STYLE_TERMS } = require('../lib/houseStyleTerms');

/** Each ruled head, the Icelandic [USER] chose, and the incumbent row it must beat. */
const RULED = [
  { en: 'radius', is: 'radíus', incumbent: 'geisli', domain: 'physics' },
  { en: 'crystalline', is: 'kristalkenndur', incumbent: 'kristallskenndur', domain: 'physics' },
  { en: 'bent', is: 'boginn', incumbent: 'beygður', domain: 'chemistry' },
  {
    en: 'dimensional analysis',
    is: 'einingagreining',
    incumbent: 'víddargreining',
    domain: 'physics',
  },
  { en: 'abundance', is: 'fjöldahlutfall', incumbent: 'hlutmergð', domain: 'physics' },
  { en: 'absorption', is: 'gleypni', incumbent: 'gleyping', domain: 'physics' },
  { en: 'general anesthetic', is: 'svæfingarlyf', incumbent: 'deyfilyf', domain: 'biology' },
  {
    en: 'molecular compound',
    is: 'sameindaefni',
    incumbent: 'sameindasamband',
    domain: 'chemistry',
  },
];

let db;
beforeEach(() => {
  ({ db } = freshMigratedDb());
});
afterEach(() => db.close());

// 🔴 freshMigratedDb() has no Íðorðabankinn import, so a resolution test without a seeded
// incumbent passes with nothing to beat. Every ruling below is asserted AGAINST its incumbent.
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

describe('2026-09-27 house-style rulings (chemistry ruling sheet)', () => {
  it('CONTROL: a seeded competitor wins for an UNRULED head, so the tests below can fail', () => {
    seedCompetitor('some unruled head', 'eitthvað annað', 'physics');
    expect(resolveIn('efnafraedi-2e', 'some unruled head').winner?.text).toBe('eitthvað annað');
  });

  for (const r of RULED) {
    it(`${r.en} resolves to ${r.is} in chemistry, over its ${r.domain} incumbent ${r.incumbent}`, () => {
      seedCompetitor(r.en, r.incumbent, r.domain);
      expect(resolveIn('efnafraedi-2e', r.en).winner?.text).toBe(r.is);
    });
  }

  it('bent wins its SAME-domain tie by the house-style rule, not by accident (§C164)', () => {
    seedCompetitor('bent', 'beygður', 'chemistry');
    expect(resolveIn('efnafraedi-2e', 'bent').reason).toBe('house-style');
  });

  it("a physics incumbent still wins in the PHYSICS book's own scope", () => {
    // The rulings are chemistry's; filing them under chemistry must not reach past physics's
    // own first domain.
    seedCompetitor('radius', 'geisli', 'physics');
    expect(resolveIn('edlisfraedi-2e', 'radius').winner?.text).toBe('geisli');
  });

  it('every head this batch adds is a shape the export census can carry (§C187)', () => {
    const ens = new Set(HOUSE_STYLE_TERMS.flatMap((e) => e.en));
    for (const { en } of RULED) {
      expect(en).toMatch(/^[A-Za-z][A-Za-z-]*( [a-z]+)?$/);
      expect(ens.has(en)).toBe(true);
    }
  });

  it('CONTROL: terms ruled to KEEP their approved row deliberately got no entry', () => {
    // anode/cathode/electrode, soluble/insoluble, noble gas … were confirmed as approved on
    // 2026-09-27: editors substitute, the concept model does not change.
    const ens = new Set(HOUSE_STYLE_TERMS.flatMap((e) => e.en));
    for (const kept of ['anode', 'cathode', 'electrode', 'soluble', 'insoluble', 'noble gas'])
      expect(ens.has(kept)).toBe(false);
  });
});
