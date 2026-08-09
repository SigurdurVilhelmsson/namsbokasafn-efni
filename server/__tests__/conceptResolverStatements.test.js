// server/__tests__/conceptResolverStatements.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const {
  buildScope,
  lookupCandidates,
  resolve,
  prepareLookupStatements,
} = require('../lib/conceptResolver');

/**
 * Spec §5: "Step 1 is the single query resolve() cannot hoist — it depends on
 * the string. In B1 it is a PREPARED STATEMENT HELD ON THE SCOPE."
 *
 * ⚠️ These assertions observe WORK NOT DONE, not a return value — the Task 7
 * lesson. Re-preparing a statement per call yields byte-identical output, so no
 * output-shape assertion can see this property. Gate 4 measured what it costs:
 * 190,275 prepares for one book's 47,568 resolves, 4.2x the time and 21.7x the
 * memory of preparing them once (762.8 MB of RSS churn against 35.2 MB).
 */
function countPrepares(db) {
  let n = 0;
  const orig = db.prepare.bind(db);
  db.prepare = (sql) => {
    n++;
    return orig(sql);
  };
  return () => n;
}

/** A concept with one English term and one Icelandic term, in `domain`. */
function addConcept(db, domain, en, is) {
  const conceptId = Number(
    db.prepare("INSERT INTO concept (domain, collection) VALUES (?, 'TEST')").run(domain)
      .lastInsertRowid
  );
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', ?, 1, 'test')"
  ).run(conceptId, en);
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', ?, 1, 'test')"
  ).run(conceptId, is);
  return conceptId;
}

/** A fresh DB with one concept for testing — returns both db and a termId to query. */
function seedOneConcept() {
  const { db } = freshMigratedDb();
  const conceptId = Number(
    db.prepare("INSERT INTO concept (domain, collection) VALUES ('test', 'TEST')").run()
      .lastInsertRowid
  );
  const enTermResult = db
    .prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', 'test', 1, 'test')"
    )
    .run(conceptId);
  const termId = Number(enTermResult.lastInsertRowid);
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', 'próf', 1, 'test')"
  ).run(conceptId);
  return { db, termId };
}

describe('prepared statements are hoisted onto the scope (spec §5)', () => {
  it('resolve() prepares NOTHING — every statement it needs is already on the scope', () => {
    const { db } = freshMigratedDb();
    addConcept(db, 'physics', 'force', 'kraftur');
    const scope = buildScope(db, 'edlisfraedi-2e', 1);

    // Count only AFTER the scope exists: buildScope is allowed to prepare, once.
    const prepares = countPrepares(db);
    resolve(scope, 'force');
    resolve(scope, 'force');
    resolve(scope, 'force');

    expect(prepares()).toBe(0);
    db.close();
  });

  // ⚠️ Named for what it ASSERTS (exactly 8), not for the weaker property it
  // implies (boundedness). Six tests on this branch were found claiming more in
  // their name than their assertions proved; an exact count deserves an exact name.
  it('buildScope prepares EXACTLY 8 statements — the 8 distinct SQL strings gate 4 measured', () => {
    const { db } = freshMigratedDb();
    const prepares = countPrepares(db);
    buildScope(db, 'edlisfraedi-2e', 1);
    // 3 for the scope itself (book, priorities, preferences) + 5 hoisted for
    // lookupCandidates/termById = the 8 distinct SQL strings gate 4 measured.
    expect(prepares()).toBe(8);
    db.close();
  });

  it('CONTROL: the hoisted statements answer identically to the per-call path', () => {
    const { db } = freshMigratedDb();
    addConcept(db, 'physics', 'force', 'kraftur');
    const scope = buildScope(db, 'edlisfraedi-2e', 1);

    // Left: lookupCandidates preparing its own statements (the 2-arg form nine
    // existing tests still use). Right: the statements hoisted onto the scope.
    expect(lookupCandidates(db, 'force')).toEqual(lookupCandidates(db, 'force', scope.stmts));
    db.close();
  });

  it('lookupCandidates FAILS LOUD when the statements belong to another connection', () => {
    // Statements are bound to the connection that prepared them. Running scope-A's
    // statements against connection B would silently query the WRONG DATABASE and
    // return a confidently wrong answer — the failure mode this project keeps
    // paying for. It must throw instead.
    //
    // ⚠️ THE GUARD LIVES HERE, NOT ON resolve(), AND THAT IS THE POINT. It was on
    // resolve() first, which left the hazard wide open one level down — a whole-branch
    // reviewer measured `lookupCandidates(dbB, 'force', scopeA.stmts)` answering from
    // connection A without complaint, the verbatim failure the guard was written to
    // prevent. resolve() cannot express the mismatch at all any more: it takes no `db`,
    // so there is nothing to disagree with the scope.
    const a = freshMigratedDb().db;
    const b = freshMigratedDb().db;
    addConcept(a, 'physics', 'force', 'kraftur');
    const scopeFromA = buildScope(a, 'edlisfraedi-2e', 1);

    expect(() => lookupCandidates(b, 'force', scopeFromA.stmts)).toThrow(
      /different database connection/
    );
    a.close();
    b.close();
  });

  it('termById finds an existing term and returns undefined for a deleted one', () => {
    const { db, termId } = seedOneConcept();
    const { termById } = prepareLookupStatements(db);
    expect(termById.get(termId)).toMatchObject({ term_id: termId });
    expect(termById.get(termId + 99999)).toBeUndefined();
    db.close();
  });
});
