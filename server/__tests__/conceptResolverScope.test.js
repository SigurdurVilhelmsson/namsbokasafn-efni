// server/__tests__/conceptResolverScope.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { buildScope } = require('../lib/conceptResolver');

/** A registered book with no priority rows — the 'no-priorities' case. */
function registerBare(db, slug) {
  // ⚠️ registered_books has THREE NOT NULL, no-default columns: slug, title_is,
  // registered_by (migration 003). Supply all three. This is the same class of
  // bug as §C35, where migration 019 registers two books WITHOUT registered_by
  // and its INSERT OR IGNORE silently discards them — which is why only
  // lifraen-efnafraedi and edlisfraedi-2e exist on a fresh migrated DB.
  db.prepare(
    "INSERT INTO registered_books (slug, title_is, registered_by) VALUES (?, ?, 'test')"
  ).run(slug, slug);
  const { id } = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
  db.prepare('DELETE FROM book_domain_priority WHERE book_id = ?').run(id);
  return id;
}

describe('buildScope — D3, an unscoped book names WHICH fault', () => {
  it('returns unscoped:"unregistered" when the slug has no registered_books row', () => {
    const { db } = freshMigratedDb();
    expect(buildScope(db, 'no-such-book')).toEqual({ unscoped: 'unregistered' });
    db.close();
  });

  it('returns unscoped:"no-priorities" when registered with zero priority rows', () => {
    const { db } = freshMigratedDb();
    registerBare(db, 'bok-an-forgangs');
    expect(buildScope(db, 'bok-an-forgangs')).toEqual({ unscoped: 'no-priorities' });
    db.close();
  });

  it('CONTROL: the two causes are distinguishable, not one boolean', () => {
    const { db } = freshMigratedDb();
    registerBare(db, 'bok-an-forgangs');
    const a = buildScope(db, 'no-such-book').unscoped;
    const b = buildScope(db, 'bok-an-forgangs').unscoped;
    expect(a).not.toBe(b);
    db.close();
  });

  it('a book WITH priority rows is not unscoped', () => {
    const { db } = freshMigratedDb();
    // edlisfraedi-2e is one of the two books a fresh clone actually registers (§C35).
    const scope = buildScope(db, 'edlisfraedi-2e');
    expect(scope.unscoped).toBe(false);
    expect(scope.positionOf.get('physics')).toBe(1);
    db.close();
  });
});

/** Seed one concept with one Icelandic term; return {conceptId, termId}. */
function seedConcept(db, { domain = 'physics', en = 'force', is = 'kraftur', rank = 1 } = {}) {
  const c = db.prepare("INSERT INTO concept (domain, collection) VALUES (?, 'TEST')").run(domain);
  const conceptId = Number(c.lastInsertRowid);
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', ?, 1, 'test')"
  ).run(conceptId, en);
  const t = db
    .prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', ?, ?, 'test')"
    )
    .run(conceptId, is, rank);
  return { conceptId, termId: Number(t.lastInsertRowid) };
}

describe('buildScope — the preference merge', () => {
  it('a chapter row OVERRIDES a book-default row for the same concept', () => {
    const { db } = freshMigratedDb();
    const bookId = db
      .prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'")
      .get().id;
    const { conceptId } = seedConcept(db);
    const alt = db
      .prepare(
        "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', 'afl', 2, 'test')"
      )
      .run(conceptId);
    const bookTermId = db
      .prepare("SELECT id FROM concept_term WHERE concept_id = ? AND text = 'kraftur'")
      .get(conceptId).id;
    const chapTermId = Number(alt.lastInsertRowid);

    const ins = db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?, ?, ?, ?)'
    );
    ins.run(bookId, 0, conceptId, bookTermId);
    ins.run(bookId, 3, conceptId, chapTermId);

    const scope = buildScope(db, 'edlisfraedi-2e', 3);
    expect(scope.preference.get(conceptId)).toEqual({ termId: chapTermId, tier: 'chapter' });
    db.close();
  });

  it('falls back to the book default when the chapter has no row', () => {
    const { db } = freshMigratedDb();
    const bookId = db
      .prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'")
      .get().id;
    const { conceptId, termId } = seedConcept(db);
    db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?, 0, ?, ?)'
    ).run(bookId, conceptId, termId);

    const scope = buildScope(db, 'edlisfraedi-2e', 3);
    expect(scope.preference.get(conceptId)).toEqual({ termId, tier: 'book' });
    db.close();
  });

  it('ignores a DIFFERENT chapter’s override', () => {
    const { db } = freshMigratedDb();
    const bookId = db
      .prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'")
      .get().id;
    const { conceptId, termId } = seedConcept(db);
    db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?, 7, ?, ?)'
    ).run(bookId, conceptId, termId);

    expect(buildScope(db, 'edlisfraedi-2e', 3).preference.size).toBe(0);
    db.close();
  });

  it('handles the appendices sentinel (-1) like any other chapter', () => {
    const { db } = freshMigratedDb();
    const bookId = db
      .prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'")
      .get().id;
    const { conceptId, termId } = seedConcept(db);
    db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?, -1, ?, ?)'
    ).run(bookId, conceptId, termId);

    expect(buildScope(db, 'edlisfraedi-2e', -1).preference.get(conceptId)).toEqual({
      termId,
      tier: 'chapter',
    });
    db.close();
  });
});
