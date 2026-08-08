// server/__tests__/conceptResolverLookup.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { lookupCandidates } = require('../lib/conceptResolver');

/**
 * @returns {{conceptId:number, termIds:number[]}} termIds parallels the
 * `isTerms` array passed in, so callers can assert lookupCandidates' output
 * against the REAL row ids the DB assigned — never hardcoded ones.
 */
function addConcept(db, domain, en, isTerms) {
  const conceptId = Number(
    db.prepare("INSERT INTO concept (domain, collection) VALUES (?, 'TEST')").run(domain)
      .lastInsertRowid
  );
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', ?, 1, 'test')"
  ).run(conceptId, en);
  const termIds = isTerms.map(([text, rank]) =>
    Number(
      db
        .prepare(
          "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', ?, ?, 'test')"
        )
        .run(conceptId, text, rank).lastInsertRowid
    )
  );
  return { conceptId, termIds };
}

describe('lookupCandidates', () => {
  it('returns one candidate per matching concept, is-terms sorted by rank', () => {
    const { db } = freshMigratedDb();
    const { termIds } = addConcept(db, 'biology', 'cell', [
      ['fruma', 1],
      ['sella', 2],
    ]);
    const { candidates, integrity } = lookupCandidates(db, 'cell');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].domain).toBe('biology');
    expect(candidates[0].isTerms.map((t) => t.text)).toEqual(['fruma', 'sella']);
    // termIds is in the same [fruma, sella] / rank-ascending order as isTerms
    // was seeded, so this pins BOTH the join-key values AND their order —
    // real DB-assigned ids, not hardcoded, so it can't pass by coincidence.
    expect(candidates[0].isTerms.map((t) => t.termId)).toEqual(termIds);
    expect(candidates[0].isTerms.map((t) => t.rank)).toEqual([1, 2]);
    expect(integrity).toEqual([]);
    db.close();
  });

  it('returns BOTH concepts when one English string has two senses', () => {
    const { db } = freshMigratedDb();
    addConcept(db, 'biology', 'cell', [['fruma', 1]]);
    addConcept(db, 'physics', 'cell', [['rafhlad', 1]]);
    expect(lookupCandidates(db, 'cell').candidates).toHaveLength(2);
    db.close();
  });

  it('follows merged_into to the surviving concept', () => {
    const { db } = freshMigratedDb();
    const { conceptId: absorbed } = addConcept(db, 'biology', 'antibiotic', [['fukalyf', 1]]);
    const { conceptId: survivor } = addConcept(db, 'biology', 'antibiotic-x', [['syklalyf', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(survivor, absorbed);

    const { candidates } = lookupCandidates(db, 'antibiotic');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].conceptId).toBe(survivor);
    expect(candidates[0].isTerms[0].text).toBe('syklalyf');
    db.close();
  });

  it('terminates on a self-merge and reports merge-cycle', () => {
    const { db } = freshMigratedDb();
    const { conceptId: a } = addConcept(db, 'biology', 'loopy', [['lykkja', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(a, a);
    const { candidates, integrity } = lookupCandidates(db, 'loopy');
    expect(integrity).toContain('merge-cycle');
    expect(candidates[0].conceptId).toBe(a); // stopped at the last unvisited
    db.close();
  });

  it('terminates on an A->B->A cycle, stopping at the last unvisited concept', () => {
    const { db } = freshMigratedDb();
    const { conceptId: a } = addConcept(db, 'biology', 'ping', [['a', 1]]);
    const { conceptId: b } = addConcept(db, 'biology', 'pong', [['b', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(b, a);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(a, b);
    const { candidates, integrity } = lookupCandidates(db, 'ping');
    expect(integrity).toContain('merge-cycle');
    expect(candidates[0].conceptId).toBe(b);
    db.close();
  });

  it('de-duplicates when two matching concepts merge into the same survivor', () => {
    const { db } = freshMigratedDb();
    const { conceptId: survivor } = addConcept(db, 'biology', 'dna', [['DKS', 1]]);
    const { conceptId: x } = addConcept(db, 'biology', 'dna', [['x', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(survivor, x);
    expect(lookupCandidates(db, 'dna').candidates).toHaveLength(1);
    db.close();
  });

  it('returns nothing for an unknown string', () => {
    const { db } = freshMigratedDb();
    expect(lookupCandidates(db, 'nothing-here').candidates).toEqual([]);
    db.close();
  });

  it("de-dup guard: TWO hits that each cycle report 'merge-cycle' only ONCE", () => {
    // Closes Task 4's open item: no prior scenario had two hits both resolving
    // through a cycle for the same english string, so `!integrity.includes(…)`
    // was unpinned — and every existing assertion used `toContain`, which
    // can't see a duplicate. `toEqual` here can.
    const { db } = freshMigratedDb();
    const { conceptId: a } = addConcept(db, 'biology', 'dup', [['a', 1]]);
    const { conceptId: b } = addConcept(db, 'physics', 'dup', [['b', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(a, a);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(b, b);
    const { integrity } = lookupCandidates(db, 'dup');
    expect(integrity).toEqual(['merge-cycle']);
    db.close();
  });

  it("isTerms carries the real concept_term row id, which is the join key buildScope's preference map is matched against", () => {
    const { db } = freshMigratedDb();
    const { conceptId } = addConcept(db, 'biology', 'gene', [['gen', 1]]);
    // Independent of both addConcept's lastInsertRowid AND lookupCandidates'
    // own SELECT — a fresh query against the table, so this can't pass by
    // reading back the same expression the implementation (or the seeding
    // helper) already trusts.
    const independentTermId = db
      .prepare("SELECT id FROM concept_term WHERE concept_id = ? AND lang = 'is' AND text = 'gen'")
      .get(conceptId).id;

    const { candidates } = lookupCandidates(db, 'gene');
    expect(candidates[0].isTerms[0].termId).toBe(independentTermId);
    db.close();
  });
});

describe('resolve — the public entry point', () => {
  const { buildScope, resolve } = require('../lib/conceptResolver');

  it('resolves end to end against a real database', () => {
    const { db } = freshMigratedDb();
    addConcept(db, 'physics', 'force', [['kraftur', 1]]);
    const scope = buildScope(db, 'edlisfraedi-2e', 1);
    const r = resolve(db, scope, 'force');
    expect(r.winner.text).toBe('kraftur');
    expect(r.reason).toBe('head-form');
    db.close();
  });

  it('carries lookupCandidates’ integrity codes into the resolution', () => {
    const { db } = freshMigratedDb();
    const { conceptId: a } = addConcept(db, 'physics', 'loopy', [['lykkja', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(a, a);
    const r = resolve(db, buildScope(db, 'edlisfraedi-2e', 1), 'loopy');
    expect(r.integrity).toContain('merge-cycle');
    db.close();
  });

  it('short-circuits on an unscoped scope without querying', () => {
    const { db } = freshMigratedDb();
    const r = resolve(db, { unscoped: 'unregistered' }, 'force');
    expect(r.unscoped).toBe('unregistered');
    db.close();
  });

  it("the unscoped short-circuit genuinely skips the query — the return VALUE alone can't prove it", () => {
    // The test above only asserts r.unscoped, and resolveCandidates ALSO checks
    // scope.unscoped first — so a mutant that deletes resolve's own short-circuit
    // produces the identical return value (verified by mutation: it survives the
    // test above). A `db` that throws on the first query is the only way to prove
    // resolve() itself never reaches lookupCandidates for an unscoped scope.
    const poisonedDb = {
      prepare() {
        throw new Error('resolve() queried the database for an unscoped scope');
      },
    };
    expect(() => resolve(poisonedDb, { unscoped: 'unregistered' }, 'force')).not.toThrow();
  });
});
