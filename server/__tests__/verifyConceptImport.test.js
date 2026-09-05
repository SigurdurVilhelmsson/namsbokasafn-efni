// ⚠️ Schema comes from freshMigratedDb() — every real migration, not a
// hand-enumerated 045-then-048. See importConcepts.test.js's header for why:
// hand-enumeration is the "green-but-lying" failure this task exists to fix,
// recurring one level down (whole-branch review, round 2).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { importConcepts } = require('../scripts/import-concepts');
const { verifyConceptImport } = require('../scripts/verify-concept-import');

let db;
beforeEach(() => {
  ({ db } = freshMigratedDb());
});
afterEach(() => db.close());

const w = (fklanguage, word, extra = {}) => ({ fklanguage, word, ...extra });
const check = (r, name) => r.checks.find((c) => c.name === name);

function seedCell() {
  importConcepts(db, {
    collection: 'LIFORD',
    entries: [{ id: 687862, words: [w('EN', 'cell'), w('IS', 'fruma')] }],
  });
  importConcepts(db, {
    collection: 'EDLISFR',
    entries: [{ id: 321691, words: [w('EN', 'cell'), w('IS', 'rafhlað')] }],
  });
}

describe('verifyConceptImport', () => {
  it('passes the homograph check when cell is separated by domain', () => {
    seedCell();
    expect(check(verifyConceptImport(db), 'homographs-separated').ok).toBe(true);
  });

  it('FAILS the homograph check when two senses share one concept', () => {
    // The control: without this, a check that always passed would look correct.
    importConcepts(db, {
      collection: 'LIFORD',
      entries: [{ id: 1, words: [w('EN', 'cell'), w('IS', 'fruma', { synonyms: 'rafhlað' })] }],
    });
    expect(check(verifyConceptImport(db), 'homographs-separated').ok).toBe(false);
  });

  it('requires every concept to have at least one Icelandic term', () => {
    seedCell();
    expect(check(verifyConceptImport(db), 'every-concept-has-icelandic').ok).toBe(true);
  });

  it('requires every concept to have exactly one rank-1 Icelandic term', () => {
    importConcepts(db, {
      collection: 'EFNAFR',
      entries: [{ id: 2, words: [w('IS', 'frumeind', { synonyms: 'atóm' })] }],
    });
    expect(check(verifyConceptImport(db), 'one-head-form-per-concept').ok).toBe(true);
  });

  it('requires every domain to be one of the seven', () => {
    seedCell();
    expect(check(verifyConceptImport(db), 'domains-are-known').ok).toBe(true);
  });

  it('FAILS domains-are-known when an unknown domain is present', () => {
    seedCell();
    // ⚠️ Keyed on the IMPORTED entry, never on id=1. Migration 051 seeds
    // house-style concepts at ids 1-2 on every boot, so `WHERE id=1` still
    // passed while silently no longer exercising "an IMPORTED concept has an
    // unknown domain" — green for the wrong reason.
    db.prepare("UPDATE concept SET domain='botany' WHERE idordabanki_id=687862").run();
    expect(check(verifyConceptImport(db), 'domains-are-known').ok).toBe(false);
  });

  it('reports ok only when every check passes', () => {
    seedCell();
    // ⚠️ Keyed on the IMPORTED entry, never on id=1. Migration 051 seeds
    // house-style concepts at ids 1-2 on every boot, so `WHERE id=1` still
    // passed while silently no longer exercising "an IMPORTED concept has an
    // unknown domain" — green for the wrong reason.
    db.prepare("UPDATE concept SET domain='botany' WHERE idordabanki_id=687862").run();
    expect(verifyConceptImport(db).ok).toBe(false);
  });

  // ── added in fix round 1 ──────────────────────────────────────────────────

  it('passes the homograph check when one term is imported from two domains', () => {
    // REGRESSION PIN. `fruma` legitimately appears in LIFORD (biology) AND in
    // LAEKN (anatomy-physiology) — nothing is contaminated here, both entries
    // are correct. An earlier rule compared each measured term against
    // `concept.domain`, which records the COLLECTION an entry came from rather
    // than the sense a term denotes, and turned red on exactly this import.
    // Task 8 gates on these checks against the real 20-collection corpus, so a
    // spurious red here would invite weakening the check.
    importConcepts(db, {
      collection: 'LIFORD',
      entries: [{ id: 687862, words: [w('EN', 'cell'), w('IS', 'fruma')] }],
    });
    importConcepts(db, {
      collection: 'LAEKN',
      entries: [{ id: 900001, words: [w('EN', 'cell'), w('IS', 'fruma')] }],
    });
    // Without this, a future edit that collapsed both imports onto one
    // concept id would keep the check green while no longer being the
    // false-fire state this test exists to pin.
    // Bound to the two IMPORTED entries, not to the whole table: 051 seeds
    // unrelated rows, and an absolute count was only ever equivalent to "two
    // entries produced two concepts" because the table happened to start empty.
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM concept WHERE idordabanki_id IN (687862, 900001)').get()
        .n
    ).toBe(2);
    expect(check(verifyConceptImport(db), 'homographs-separated').ok).toBe(true);
  });

  it('FAILS model-is-non-empty when nothing was imported', () => {
    // The control. Every other check counts bad things and asserts zero, which
    // an empty model satisfies trivially — so without this, an import that
    // silently produced no rows reports ok:true on all four.
    expect(check(verifyConceptImport(db), 'model-is-non-empty').ok).toBe(false);
  });

  it('passes model-is-non-empty once concepts exist', () => {
    seedCell();
    expect(check(verifyConceptImport(db), 'model-is-non-empty').ok).toBe(true);
  });

  it('FAILS every-concept-has-icelandic for a concept with no Icelandic term', () => {
    // Hand-inserted ON PURPOSE: this state is UNREACHABLE through the import.
    // `conceptFromEntry` returns null when an entry has no Icelandic side and
    // `importConcepts` skips it (counting `skippedNoIcelandic`), so no import
    // can create such a concept. The check is a table-integrity assertion, and
    // hand-inserted rows are the only way to force it red.
    // ⚠️ Never hardcode concept.id: it is AUTOINCREMENT and migration 051 owns
    // ids 1-2 on every database, so a literal 1 collides before any assertion runs.
    const cid = db
      .prepare("INSERT INTO concept (domain,idordabanki_id) VALUES ('biology',9) RETURNING id")
      .get().id;
    db.prepare(
      "INSERT INTO concept_term (concept_id,lang,text,rank,source) VALUES (?,'en','cell',1,'x')"
    ).run(cid);
    expect(check(verifyConceptImport(db), 'every-concept-has-icelandic').ok).toBe(false);
  });

  it('FAILS one-head-form-per-concept when a concept has two rank-1 heads', () => {
    // Two rank-1 Icelandic heads is the signature of two entries' head words
    // landing on one concept.
    // ⚠️ Never hardcode concept.id: it is AUTOINCREMENT and migration 051 owns
    // ids 1-2 on every database, so a literal 1 collides before any assertion runs.
    const cid = db
      .prepare("INSERT INTO concept (domain,idordabanki_id) VALUES ('biology',9) RETURNING id")
      .get().id;
    db.prepare(
      "INSERT INTO concept_term (concept_id,lang,text,rank,source) VALUES (?,'is','fruma',1,'x')"
    ).run(cid);
    db.prepare(
      "INSERT INTO concept_term (concept_id,lang,text,rank,source) VALUES (?,'is','klefi',1,'x')"
    ).run(cid);
    expect(check(verifyConceptImport(db), 'one-head-form-per-concept').ok).toBe(false);
  });

  it('FAILS one-head-form-per-concept when a concept has no rank-1 head', () => {
    // ⚠️ Never hardcode concept.id: it is AUTOINCREMENT and migration 051 owns
    // ids 1-2 on every database, so a literal 1 collides before any assertion runs.
    const cid = db
      .prepare("INSERT INTO concept (domain,idordabanki_id) VALUES ('biology',9) RETURNING id")
      .get().id;
    db.prepare(
      "INSERT INTO concept_term (concept_id,lang,text,rank,source) VALUES (?,'is','fruma',2,'x')"
    ).run(cid);
    expect(check(verifyConceptImport(db), 'one-head-form-per-concept').ok).toBe(false);
  });
});
