// server/__tests__/houseStyleTerms2026-09-23.test.js
//
// The [USER] rulings of 2026-09-23 on organic ch01's pre-buy questions.
// Record: docs/decisions/2026-09-23-organic-ch01-term-rulings.md.
//
// 🔴 WHY A TEST AT ALL, when the entries are plain data: migration 051 runs on
// EVERY server start and `failLoudOnMigrationErrors` exit(1)s on a collected
// error — one malformed row and production never boots again. freshMigratedDb()
// runs every real migration, so this exercises 051 exactly as a boot does.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const conceptResolver = require('../lib/conceptResolver');
const { HOUSE_STYLE_TERMS } = require('../lib/houseStyleTerms');

/** Each ruled head and the Icelandic [USER] chose. */
const RULED = [
  { en: 'line-bond structure', is: 'strikamynd' },
  { en: 'bond angle', is: 'tengjahorn' }, // plural genitive, [USER]'s explicit choice
  { en: 'bond length', is: 'tengjalengd' }, // plural genitive, [USER]'s explicit choice
  { en: 'condensed structure', is: 'þéttformúla' },
  { en: 'condensed formula', is: 'þéttformúla' },
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

describe('2026-09-23 house-style rulings (organic ch01 pre-buy)', () => {
  for (const r of RULED) {
    it(`${r.en} resolves to ${r.is} in organic's own scope`, () => {
      // The book the ruling was made for — not merely "a house row exists".
      expect(resolveIn('lifraen-efnafraedi', r.en).winner?.text).toBe(r.is);
    });
  }

  it('CONTROL: a seeded competitor wins for an UNRULED head, so the next test can fail', () => {
    seedCompetitor('some unruled bond term', 'eitthvað annað', 'chemistry');
    expect(resolveIn('lifraen-efnafraedi', 'some unruled bond term').winner?.text).toBe(
      'eitthvað annað'
    );
  });

  it('the plural rulings beat the singular the model writes, even as a same-domain row', () => {
    // The committed MT writes tengihorn/tengilengd. Seed exactly those as
    // chemistry-domain competitors: the house row must win by §C164's tie-break.
    seedCompetitor('bond angle', 'tengihorn', 'chemistry');
    seedCompetitor('bond length', 'tengilengd', 'chemistry');
    expect(resolveIn('lifraen-efnafraedi', 'bond angle').winner?.text).toBe('tengjahorn');
    expect(resolveIn('lifraen-efnafraedi', 'bond length').winner?.text).toBe('tengjalengd');
  });

  it('every head this batch adds is a shape the export census can carry (§C187)', () => {
    // collectSourceEnglish admits single tokens [A-Za-z][A-Za-z-]* and bigrams whose
    // second word is lowercase ASCII — nothing else reaches glossary-unified.json, and
    // `--glossary-only` refuses a head the export lacks. A head outside this shape
    // would be a ruling that can never reach the wire.
    const heads = RULED.map((r) => r.en);
    for (const h of heads) expect(h).toMatch(/^[A-Za-z][A-Za-z-]*( [a-z]+)?$/);
    // …and each is really in the file (guards against the list above drifting).
    const ens = new Set(HOUSE_STYLE_TERMS.flatMap((e) => e.en));
    for (const h of heads) expect(ens.has(h)).toBe(true);
  });

  it('CONTROL: `atom` was ruled atóm for organic but deliberately got NO house-style entry', () => {
    // A house-style row is global to the chemistry domain and reaches 5 of 6 books'
    // chains; the ruling is per book. It belongs in book_term_preference (an editor
    // action on prod), exactly as chemistry's own atom → atóm does — and ch01's buy
    // keeps `atom` off the wire, so the buy does not wait for it.
    const ens = new Set(HOUSE_STYLE_TERMS.flatMap((e) => e.en));
    expect(ens.has('atom')).toBe(false);
    expect(ens.has('atomic orbital')).toBe(false);
  });
});
