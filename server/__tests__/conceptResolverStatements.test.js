// server/__tests__/conceptResolverStatements.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { buildScope, lookupCandidates, resolve } = require('../lib/conceptResolver');

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

describe('prepared statements are hoisted onto the scope (spec §5)', () => {
  it('resolve() prepares NOTHING — every statement it needs is already on the scope', () => {
    const { db } = freshMigratedDb();
    addConcept(db, 'physics', 'force', 'kraftur');
    const scope = buildScope(db, 'edlisfraedi-2e', 1);

    // Count only AFTER the scope exists: buildScope is allowed to prepare, once.
    const prepares = countPrepares(db);
    resolve(db, scope, 'force');
    resolve(db, scope, 'force');
    resolve(db, scope, 'force');

    expect(prepares()).toBe(0);
    db.close();
  });

  // ⚠️ Named for what it ASSERTS (exactly 7), not for the weaker property it
  // implies (boundedness). Six tests on this branch were found claiming more in
  // their name than their assertions proved; an exact count deserves an exact name.
  it('buildScope prepares EXACTLY 7 statements — the 7 distinct SQL strings gate 4 measured', () => {
    const { db } = freshMigratedDb();
    const prepares = countPrepares(db);
    buildScope(db, 'edlisfraedi-2e', 1);
    // 3 for the scope itself (book, priorities, preferences) + 4 hoisted for
    // lookupCandidates = the 7 distinct SQL strings gate 4 measured.
    expect(prepares()).toBe(7);
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

  it('resolve() FAILS LOUD when the scope came from a different connection', () => {
    // Statements are bound to the connection that prepared them. Running
    // scope-A's statements against connection B would silently query the WRONG
    // DATABASE and return a confidently wrong answer — the failure mode this
    // project keeps paying for. It must throw instead.
    const a = freshMigratedDb().db;
    const b = freshMigratedDb().db;
    addConcept(a, 'physics', 'force', 'kraftur');
    const scopeFromA = buildScope(a, 'edlisfraedi-2e', 1);

    expect(() => resolve(b, scopeFromA, 'force')).toThrow(/different database connection/);
    a.close();
    b.close();
  });
});
