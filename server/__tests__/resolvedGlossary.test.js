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
 *
 * ⚠️ B4a (§C36) — `buildScope` (server/lib/conceptResolver.js) calls
 * `buildPreferenceMap`, which Task 3 re-keyed onto `book_term_preference.english`
 * (from the dropped `book_concept_preference.concept_id`). This file's own
 * `INSERT`s were already pointed at `book_term_preference` in Task 2b, ahead of
 * that re-key landing, so no further edit was needed here once Task 3 shipped.
 *
 * ⚠️ RESOLVED 2026-08-09 BY TASK 6. This banner used to warn that two tests
 * below were RED by construction between Task 3 and Task 6: `buildPreferenceMap`
 * keyed on the lowercased English string while `resolveCandidates` still did
 * `scope.preference.get(c.conceptId)` — a NUMBER — so the string-keyed map never
 * hit and `reason: 'book-preference'` was unreachable. Task 6's step-6 override
 * re-points that lookup onto the English string. The whole file is green; the
 * history is kept because a "known red" window that nobody records is
 * indistinguishable from a regression the next time one appears.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { buildResolvedGlossary, createResolvedExportFn } = require('../lib/resolvedGlossary');

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
    const out = build(['atom']);
    expect(out.terms[0]).toMatchObject({
      english: 'atom',
      icelandic: 'frumeind',
      status: 'approved',
      reason: 'head-form',
      domain: 'chemistry',
      position: 1,
    });
    expect(out.stats).toMatchObject({ total: 1, approved: 1, censusStrings: 1 });
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

  // ⚠️ Was RED between Task 3 and Task 6 (see the file banner). Green since
  // Task 6's override; this is one of that task's two completion criteria.
  it('honours an editor book-preference over the head form', () => {
    const cid = concept('chemistry', 'atom', ['frumeind', 'atóm']);
    const termId = db
      .prepare("SELECT id FROM concept_term WHERE concept_id = ? AND text = 'atóm'")
      .get(cid).id;
    db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (1, 0, ?, ?)'
    ).run('atom', termId);
    expect(build(['atom']).terms[0]).toMatchObject({
      icelandic: 'atóm',
      reason: 'book-preference',
    });
  });

  // ⚠️ Was RED between Task 3 and Task 6 (see the file banner). Green since
  // Task 6's override; this is the second of that task's completion criteria.
  it('resolves the BOOK-DEFAULT (chapter 0) preference, never a chapter-level one — pins the `0` in buildScope(db, bookSlug, 0)', () => {
    const cid = concept('chemistry', 'bond', ['tengi', 'efnatengi', 'samtengi']);
    const bookTermId = db
      .prepare("SELECT id FROM concept_term WHERE concept_id = ? AND text = 'efnatengi'")
      .get(cid).id;
    const chapterTermId = db
      .prepare("SELECT id FROM concept_term WHERE concept_id = ? AND text = 'samtengi'")
      .get(cid).id;
    // Book default (chapter 0) picks 'efnatengi'; a chapter-1 override for the
    // SAME concept picks a different term. buildResolvedGlossary must ignore
    // the chapter-1 row entirely — glossary-unified.json is one file per book.
    db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (1, 0, ?, ?)'
    ).run('bond', bookTermId);
    db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (1, 1, ?, ?)'
    ).run('bond', chapterTermId);
    const t = build(['bond']).terms[0];
    expect(t.icelandic).toBe('efnatengi');
    expect(t.reason).toBe('book-preference');
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
    const out = build(['zinc', 'acid']);
    expect(out.terms.map((t) => t.english)).toEqual(['acid', 'zinc']);
    expect(out.stats).toMatchObject({ total: 2, approved: 2, censusStrings: 2 });
  });

  it('stamps the resolved producer', () => {
    concept('chemistry', 'atom', ['frumeind']);
    expect(build(['atom']).producer).toBe('export-terminology-resolved');
  });

  // D5 (§C36 B4a spec): a preference whose term_id no longer exists in
  // concept_term. FK is ON by default here (better-sqlite3 compile flag,
  // CLAUDE.md durable) and CASCADEs on delete, so the only way to reach a
  // genuinely dangling row is to turn FK off before the INSERT — same
  // pattern as conceptResolverIntegrity.test.js's dangling-merge fixture.
  it('counts integrity codes per census string, and does NOT put them in the payload', () => {
    concept('chemistry', 'atom', ['frumeind', 'atóm']);
    db.pragma('foreign_keys = OFF');
    db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (1, 0, ?, ?)'
    ).run('atom', 999999);

    const out = build(['atom']);

    // The preference cannot be honoured, so resolution falls back to the head
    // form — `terms` comes out BYTE-IDENTICAL to a book with no preference
    // row at all. That is D5's whole point: the one condition this report
    // exists to surface is exactly the condition `sameTerms` cannot see.
    expect(out.terms[0]).toMatchObject({ icelandic: 'frumeind', reason: 'head-form' });
    expect(out.integrity).toEqual({ 'preference-term-missing': 1 });
    // ⚠️ The payload must NOT gain a key: sameTerms ignores everything but
    // `terms`, so a payload-borne report is skipped by write-if-changed
    // exactly when it matters. It also keeps B4a's export byte-comparison
    // meaningful (§9 of the design spec).
    expect(out.stats).not.toHaveProperty('integrity');
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

/**
 * Task 5 review, Important 1: the DB open used to happen EAGERLY, inside
 * `createResolvedExportFn` itself. Because that factory is called from a
 * DEFAULT PARAMETER (`exportFn = createResolvedExportFn()` in
 * export-terminology.js), an eager open throws before runGlossaryExport's
 * body — and its per-book try/catch — ever runs. These two tests pin the fix:
 * the factory call itself must never throw, and the DB open must be deferred
 * to the returned closure's first invocation.
 */
describe('createResolvedExportFn', () => {
  let missingDbPath;
  let tmpDir;

  beforeEach(() => {
    // A directory that exists, holding a filename that does not — the shape
    // the review measured (`new Database('/tmp/missing.db', {readonly:true})`
    // → SQLITE_CANTOPEN; readonly mode does not create the file).
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolved-glossary-missing-db-'));
    missingDbPath = path.join(tmpDir, 'sessions.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('constructing the factory against a non-existent DB path does not throw — the open is deferred', () => {
    expect(() => createResolvedExportFn(missingDbPath)).not.toThrow();
    // And no file was created by merely constructing the factory: readonly
    // mode never creates the file, and this call should not even have tried.
    expect(fs.existsSync(missingDbPath)).toBe(false);
  });

  it("the returned function throws on its FIRST call against a non-existent DB path — that's the whole point", () => {
    const exportFn = createResolvedExportFn(missingDbPath);
    expect(() => exportFn('bk')).toThrow(/SQLITE_CANTOPEN|unable to open database file/i);
  });
});
