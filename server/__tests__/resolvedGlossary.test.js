// server/__tests__/resolvedGlossary.test.js
/**
 * The census is injected, so this file needs no books/ tree. What it does need
 * is a real schema — the resolver reads five tables — so it builds one with the
 * real migrations via freshMigratedDb.
 *
 * ⚠️ freshMigratedDb() returns {db, errors, applied, path} — NOT the db
 * connection directly (server/__tests__/helpers/freshMigratedDb.js). Destructure it.
 *
 * ⚠️ registered_books has THREE NOT NULL, no-default columns: slug, title_is,
 * registered_by (migration 003) — the same trap conceptResolverScope.test.js's
 * `registerBare` comment documents. Supply all three.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { buildResolvedGlossary } = require('../lib/resolvedGlossary');

let db;

/** chemistry(1) > physics(2) > biology(3) — efnafraedi-2e's real order. */
function seed() {
  ({ db } = freshMigratedDb());
  db.prepare(
    "INSERT INTO registered_books (id, slug, title_is, registered_by) VALUES (1, ?, 'Test Book', 'test')"
  ).run('bk');
  const prio = db.prepare(
    'INSERT INTO book_domain_priority (book_id, domain, position) VALUES (1, ?, ?)'
  );
  prio.run('chemistry', 1);
  prio.run('physics', 2);
  prio.run('biology', 3);
}

/** Returns the concept id. `is` terms are given in rank order. */
function concept(domain, english, isTerms, idordabankiId = null) {
  const cid = db
    .prepare('INSERT INTO concept (domain, idordabanki_id) VALUES (?, ?)')
    .run(domain, idordabankiId).lastInsertRowid;
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', ?, 1, 'test')"
  ).run(cid, english);
  isTerms.forEach((t, i) => {
    db.prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', ?, ?, 'test')"
    ).run(cid, t, i + 1);
  });
  return cid;
}

const build = (strings) =>
  buildResolvedGlossary(db, 'bk', { census: { strings, filesRead: 1, root: '/fake' } });

beforeEach(seed);

describe('buildResolvedGlossary', () => {
  it('emits the head form by default, with reason', () => {
    concept('chemistry', 'atom', ['frumeind', 'atóm']);
    const t = build(['atom']).terms[0];
    expect(t).toMatchObject({
      english: 'atom',
      icelandic: 'frumeind',
      status: 'approved',
      reason: 'head-form',
      domain: 'chemistry',
      position: 1,
    });
  });

  it("carries the concept's other Icelandic terms as alternatives, in rank order", () => {
    concept('chemistry', 'atom', ['frumeind', 'atóm', 'eind']);
    expect(build(['atom']).terms[0].alternatives).toEqual(['atóm', 'eind']);
  });

  it("carries `domain` and never the other producers' fingerprints", () => {
    concept('chemistry', 'atom', ['frumeind']);
    const t = build(['atom']).terms[0];
    expect(t).toHaveProperty('domain');
    expect(t).not.toHaveProperty('subjects');
    expect(t).not.toHaveProperty('category');
    expect(t).not.toHaveProperty('chapter');
  });

  it('honours an editor book-preference over the head form', () => {
    const cid = concept('chemistry', 'atom', ['frumeind', 'atóm']);
    const termId = db
      .prepare("SELECT id FROM concept_term WHERE concept_id = ? AND text = 'atóm'")
      .get(cid).id;
    db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (1, 0, ?, ?)'
    ).run(cid, termId);
    expect(build(['atom']).terms[0]).toMatchObject({
      icelandic: 'atóm',
      reason: 'book-preference',
    });
  });

  it('applies the subject FALLBACK — this is what unblocks chemistry', () => {
    // No chemistry concept for pH; biology at position 3 answers.
    concept('biology', 'pH', ['sýrustig']);
    expect(build(['pH']).terms[0]).toMatchObject({ icelandic: 'sýrustig', domain: 'biology' });
  });

  it('emits a NOMINAL tie once and counts it', () => {
    concept('chemistry', 'cell', ['hola']);
    concept('chemistry', 'cell', ['hola']); // same position, identical head form
    const out = build(['cell']);
    expect(out.terms).toHaveLength(1);
    expect(out.terms[0].icelandic).toBe('hola');
    expect(out.stats.nominalTies).toBe(1);
  });

  it('does NOT emit a real tie, and counts it', () => {
    concept('chemistry', 'antibiotic', ['fúkalyf']);
    concept('chemistry', 'antibiotic', ['sýklalyf']);
    const out = build(['antibiotic']);
    expect(out.terms).toHaveLength(0);
    expect(out.stats.ties).toBe(1);
  });

  it('excludes out-of-scope concepts and counts them separately', () => {
    concept('mathematics', 'vector', ['vigur']); // absent from bk's priority list
    const out = build(['vector']);
    expect(out.terms).toHaveLength(0);
    expect(out.stats.outOfScopeOnly).toBe(1);
  });

  it('sorts terms by english', () => {
    concept('chemistry', 'zinc', ['sink']);
    concept('chemistry', 'acid', ['sýra']);
    expect(build(['zinc', 'acid']).terms.map((t) => t.english)).toEqual(['acid', 'zinc']);
  });

  it('stamps the resolved producer', () => {
    concept('chemistry', 'atom', ['frumeind']);
    expect(build(['atom']).producer).toBe('export-terminology-resolved');
  });

  it('throws on an empty census rather than returning an empty payload', () => {
    expect(() => build([])).toThrow(/census is empty/i);
  });

  it('throws, naming the fault, for an unregistered book', () => {
    expect(() =>
      buildResolvedGlossary(db, 'nope', { census: { strings: ['atom'], filesRead: 1, root: '/x' } })
    ).toThrow(/unregistered/);
  });

  it('throws, naming the OTHER fault, for a registered book with no priorities', () => {
    db.prepare(
      "INSERT INTO registered_books (id, slug, title_is, registered_by) VALUES (2, ?, 'Bare Book', 'test')"
    ).run('bare');
    expect(() =>
      buildResolvedGlossary(db, 'bare', { census: { strings: ['atom'], filesRead: 1, root: '/x' } })
    ).toThrow(/no-priorities/);
  });
});
