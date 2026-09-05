/**
 * House-style terminology rulings, and the migration that ENFORCES them.
 *
 * 🔴 The enforcement is the point. CLAUDE.md records, from a day this project
 * lost to it, that a hand SQL edit to a glossary or domain value is silently
 * reverted on the next boot — no error, no log line, and the shrink guard
 * cannot see the regrowth because it measures size. So the ruling lives in a
 * file the code reads, and a migration re-asserts it on every start, exactly as
 * 047 does for BOOK_DOMAIN_PRIORITY.
 *
 * ⚠️ 047's shape — DELETE then re-INSERT — is deliberately NOT copied. It is
 * safe there because book_domain_priority has no dependents. `concept_term` is
 * referenced by `book_term_preference.term_id` ON DELETE CASCADE, so churning
 * either the concept OR its term rows every boot quietly discards an editor's
 * chapter-level preference. 051 matches on the English head form and reconciles
 * the terms IN PLACE — stability has to hold at the row actually referenced,
 * which is the term, not the concept.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const {
  HOUSE_STYLE_TERMS,
  HOUSE_STYLE_DOMAIN,
  HOUSE_STYLE_SOURCE,
} = require('../lib/houseStyleTerms');
const { DOMAIN_SET, BOOK_DOMAIN_PRIORITY } = require('../lib/domains');
const migration = require('../migrations/051-house-style-terms');

let db;
beforeEach(() => {
  ({ db } = freshMigratedDb());
});
afterEach(() => db.close());

const conceptsFor = (en) =>
  db
    .prepare(
      `SELECT c.id, c.domain FROM concept c
         JOIN concept_term t ON t.concept_id = c.id
        WHERE t.lang='en' AND t.text=? AND t.source=?`
    )
    .all(en, HOUSE_STYLE_SOURCE);

const icelandicFor = (en) =>
  db
    .prepare(
      `SELECT it.text FROM concept_term et
         JOIN concept_term it ON it.concept_id = et.concept_id AND it.lang='is'
        WHERE et.lang='en' AND et.text=?
        ORDER BY it.rank ASC, it.id ASC`
    )
    .all(en)
    .map((r) => r.text);

describe('the ruling itself', () => {
  it('carries the entries [USER] ruled on 2026-09-04', () => {
    // Bound to VALUES. A test that only counted entries would pass after
    // someone changed Celsíus back to Selsíus.
    const byEn = new Map(HOUSE_STYLE_TERMS.flatMap((t) => t.en.map((e) => [e, t.is])));
    expect(byEn.get('Celsius')).toBe('Celsíus');
    expect(byEn.get('degree Celsius')).toBe('stig á Celsíus');
    expect(byEn.get('degree centigrade')).toBe('stig á Celsíus');
  });

  it('keeps the NAME and the UNIT PHRASE as separate concepts', () => {
    // Collapsing them breaks one or the other: a bare figure label "Celsius"
    // would render as a phrase, or the phrase would lose "stig á".
    const bare = HOUSE_STYLE_TERMS.find((t) => t.en.includes('Celsius'));
    const phrase = HOUSE_STYLE_TERMS.find((t) => t.en.includes('degree Celsius'));
    expect(bare).not.toBe(phrase);
    expect(bare.is).not.toBe(phrase.is);
  });

  it('every entry is well formed and carries its authority', () => {
    expect(HOUSE_STYLE_TERMS.length).toBeGreaterThan(0); // non-vacuous
    for (const t of HOUSE_STYLE_TERMS) {
      expect(t.en.length, `${t.is} needs at least one English head form`).toBeGreaterThan(0);
      for (const e of t.en) expect(e.trim()).toBe(e);
      expect(typeof t.is).toBe('string');
      expect(t.is.trim().length).toBeGreaterThan(0);
      // A term whose rationale is lost is a term nobody dares delete.
      expect(t.ruled, `${t.is} must record who ruled it and when`).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(t.why.length).toBeGreaterThan(40);
    }
  });

  it('no English head form is claimed twice', () => {
    // Two concepts owning one headword makes resolution order decide silently.
    const all = HOUSE_STYLE_TERMS.flatMap((t) => t.en);
    expect(new Set(all).size).toBe(all.length);
  });

  it('files terms in a real domain that the publishable books prioritise FIRST', () => {
    // Not taxonomy — robustness. First position means a later Íðorðabankinn
    // import of the same English under another domain cannot outrank the ruling
    // in the two books that ship.
    expect(DOMAIN_SET.has(HOUSE_STYLE_DOMAIN)).toBe(true);
    for (const slug of ['efnafraedi-2e', 'lifraen-efnafraedi']) {
      expect(BOOK_DOMAIN_PRIORITY[slug][0], `${slug} must prioritise ${HOUSE_STYLE_DOMAIN}`).toBe(
        HOUSE_STYLE_DOMAIN
      );
    }
  });
});

describe('migration 051 — enforcement', () => {
  it('mints one concept per entry, with its English and Icelandic head forms', () => {
    migration.up(db);
    const [c] = conceptsFor('Celsius');
    expect(c).toBeTruthy();
    expect(c.domain).toBe(HOUSE_STYLE_DOMAIN);
    expect(icelandicFor('Celsius')).toEqual(['Celsíus']);
  });

  it('resolves BOTH English spellings of the unit phrase to one Icelandic', () => {
    migration.up(db);
    expect(icelandicFor('degree Celsius')).toEqual(['stig á Celsíus']);
    expect(icelandicFor('degree centigrade')).toEqual(['stig á Celsíus']);
    // ...and they are the SAME concept, not two that happen to agree.
    expect(conceptsFor('degree Celsius')[0].id).toBe(conceptsFor('degree centigrade')[0].id);
  });

  it('is IDEMPOTENT and preserves concept ids across boots', () => {
    // 🔴 The property 047's delete-then-insert would break — though concept-id
    // stability is only half of it; see the term-preference test below for the
    // half that actually bit.
    migration.up(db);
    const first = conceptsFor('Celsius')[0].id;
    migration.up(db);
    migration.up(db);
    const after = conceptsFor('Celsius');
    expect(after).toHaveLength(1); // no duplicate concepts
    expect(after[0].id).toBe(first); // and the SAME row
    expect(icelandicFor('Celsius')).toEqual(['Celsíus']);
  });

  it("an editor's TERM PREFERENCE survives re-running the migration", () => {
    // 🔴 The property that forced this migration's shape, and it holds at the
    // TERM row rather than the concept: book_term_preference.term_id references
    // concept_term ON DELETE CASCADE. Keeping the concept id stable while
    // replacing its term rows still discards the preference — which is exactly
    // what the first draft did, and what this test caught.
    migration.up(db);
    const conceptId = conceptsFor('Celsius')[0].id;
    const termId = db
      .prepare(`SELECT id FROM concept_term WHERE concept_id=? AND lang='is'`)
      .get(conceptId).id;
    const bookId = db
      .prepare(
        `INSERT INTO registered_books (slug, title_is, registered_by) VALUES (?,?,?) RETURNING id`
      )
      .get(`hs-${Math.random()}`, 'Bók', 't').id;
    db.prepare(
      `INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?,?,?,?)`
    ).run(bookId, 1, 'Celsius', termId);

    migration.up(db);
    migration.up(db);

    expect(db.prepare(`SELECT COUNT(*) c FROM book_term_preference`).get().c).toBe(1);
    // ...pointing at the SAME term row, not a re-created one.
    expect(db.prepare(`SELECT term_id FROM book_term_preference`).get().term_id).toBe(termId);
  });

  it('CORRECTS a value that drifted in the database — the revert this exists to prevent', () => {
    // Someone edits the row by hand, or an old import wrote the other spelling.
    // The file is the owner, so the next boot puts it back.
    migration.up(db);
    const conceptId = conceptsFor('Celsius')[0].id;
    db.prepare(`UPDATE concept_term SET text='Selsíus' WHERE concept_id=? AND lang='is'`).run(
      conceptId
    );
    expect(icelandicFor('Celsius')).toEqual(['Selsíus']); // control: the drift really happened

    migration.up(db);
    expect(icelandicFor('Celsius')).toEqual(['Celsíus']);
  });

  it('REMOVES a house-style concept that is no longer in the file', () => {
    // Absence from the file must mean "retired", or a deleted ruling would live
    // forever — the exact defect 047 was written to fix in its predecessor.
    migration.up(db);
    const stray = db
      .prepare(`INSERT INTO concept (domain, collection) VALUES (?, ?) RETURNING id`)
      .get(HOUSE_STYLE_DOMAIN, HOUSE_STYLE_SOURCE).id;
    db.prepare(
      `INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)`
    ).run(stray, 'en', 'retired term', 1, HOUSE_STYLE_SOURCE);
    expect(conceptsFor('retired term')).toHaveLength(1); // control

    migration.up(db);
    expect(conceptsFor('retired term')).toHaveLength(0);
    expect(conceptsFor('Celsius')).toHaveLength(1); // ...and it took nothing else with it
  });

  it('leaves Íðorðabankinn concepts ALONE', () => {
    // 🔴 The non-destructive rule: house style outranks by domain priority; it
    // never edits or deletes an imported concept.
    const imported = db
      .prepare(
        `INSERT INTO concept (domain, idordabanki_id, collection) VALUES (?,?,?) RETURNING id`
      )
      .get('physics', 999001, 'raf').id;
    db.prepare(
      `INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)`
    ).run(imported, 'en', 'Celsius', 1, 'idordabanki');
    db.prepare(
      `INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)`
    ).run(imported, 'is', 'Selsíus', 1, 'idordabanki');

    migration.up(db);

    const still = db.prepare(`SELECT COUNT(*) c FROM concept WHERE id=?`).get(imported).c;
    expect(still, 'the imported concept must survive untouched').toBe(1);
    expect(
      db.prepare(`SELECT text FROM concept_term WHERE concept_id=? AND lang='is'`).get(imported)
        .text
    ).toBe('Selsíus');
    // And ours exists alongside it, in a domain the shipping books rank first.
    expect(conceptsFor('Celsius')).toHaveLength(1);
  });

  it('never throws — a migration that throws wedges the boot', () => {
    // migrationRunner calls up() on EVERY start and failLoudOnMigrationErrors
    // exit(1)s on a collected error, so one bad row means the server never
    // boots again. Run it against a database whose concept tables were dropped.
    db.exec('DROP TABLE IF EXISTS book_term_preference; DROP TABLE IF EXISTS concept_term;');
    expect(() => migration.up(db)).not.toThrow();
  });
});

describe('the resolved glossary a book actually gets', () => {
  it('carries Celsíus for chemistry — end to end through the real resolver', () => {
    // 🔴 The only assertion that proves the ruling REACHES the MT wire and the
    // render path. Everything above could pass while the resolver filtered it
    // out by scope, which is precisely how a term can exist and do nothing.
    migration.up(db);
    const bookId = db
      .prepare(
        `INSERT INTO registered_books (slug, title_is, registered_by) VALUES (?,?,?) RETURNING id`
      )
      .get('efnafraedi-2e-hs', 'Efnafræði', 't').id;
    for (const [i, d] of BOOK_DOMAIN_PRIORITY['efnafraedi-2e'].entries()) {
      db.prepare(`INSERT INTO book_domain_priority (book_id, domain, position) VALUES (?,?,?)`).run(
        bookId,
        d,
        i + 1
      );
    }
    const { buildResolvedGlossary } = require('../lib/resolvedGlossary');
    const payload = buildResolvedGlossary(db, 'efnafraedi-2e-hs', {
      census: { strings: ['Celsius', 'degree centigrade'], filesRead: 1, root: '/x' },
    });
    const byEn = new Map(payload.terms.map((t) => [t.english, t]));
    expect(byEn.get('Celsius')?.icelandic).toBe('Celsíus');
    expect(byEn.get('degree centigrade')?.icelandic).toBe('stig á Celsíus');
    // status is load-bearing: buildGlossaryMap drops anything not 'approved',
    // so an unstamped term silently leaves English in published math.
    expect(byEn.get('Celsius')?.status).toBe('approved');
  });
});
