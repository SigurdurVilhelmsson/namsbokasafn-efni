// server/__tests__/conceptResolverLookup.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { lookupCandidates } = require('../lib/conceptResolver');

function addConcept(db, domain, en, isTerms) {
  const conceptId = Number(
    db.prepare("INSERT INTO concept (domain, collection) VALUES (?, 'TEST')").run(domain)
      .lastInsertRowid
  );
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', ?, 1, 'test')"
  ).run(conceptId, en);
  for (const [text, rank] of isTerms) {
    db.prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', ?, ?, 'test')"
    ).run(conceptId, text, rank);
  }
  return conceptId;
}

describe('lookupCandidates', () => {
  it('returns one candidate per matching concept, is-terms sorted by rank', () => {
    const { db } = freshMigratedDb();
    addConcept(db, 'biology', 'cell', [
      ['fruma', 1],
      ['sella', 2],
    ]);
    const { candidates, integrity } = lookupCandidates(db, 'cell');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].domain).toBe('biology');
    expect(candidates[0].isTerms.map((t) => t.text)).toEqual(['fruma', 'sella']);
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
    const absorbed = addConcept(db, 'biology', 'antibiotic', [['fukalyf', 1]]);
    const survivor = addConcept(db, 'biology', 'antibiotic-x', [['syklalyf', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(survivor, absorbed);

    const { candidates } = lookupCandidates(db, 'antibiotic');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].conceptId).toBe(survivor);
    expect(candidates[0].isTerms[0].text).toBe('syklalyf');
    db.close();
  });

  it('terminates on a self-merge and reports merge-cycle', () => {
    const { db } = freshMigratedDb();
    const a = addConcept(db, 'biology', 'loopy', [['lykkja', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(a, a);
    const { candidates, integrity } = lookupCandidates(db, 'loopy');
    expect(integrity).toContain('merge-cycle');
    expect(candidates[0].conceptId).toBe(a); // stopped at the last unvisited
    db.close();
  });

  it('terminates on an A->B->A cycle, stopping at the last unvisited concept', () => {
    const { db } = freshMigratedDb();
    const a = addConcept(db, 'biology', 'ping', [['a', 1]]);
    const b = addConcept(db, 'biology', 'pong', [['b', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(b, a);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(a, b);
    const { candidates, integrity } = lookupCandidates(db, 'ping');
    expect(integrity).toContain('merge-cycle');
    expect(candidates[0].conceptId).toBe(b);
    db.close();
  });

  it('de-duplicates when two matching concepts merge into the same survivor', () => {
    const { db } = freshMigratedDb();
    const survivor = addConcept(db, 'biology', 'dna', [['DKS', 1]]);
    const x = addConcept(db, 'biology', 'dna', [['x', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(survivor, x);
    expect(lookupCandidates(db, 'dna').candidates).toHaveLength(1);
    db.close();
  });

  it('returns nothing for an unknown string', () => {
    const { db } = freshMigratedDb();
    expect(lookupCandidates(db, 'nothing-here').candidates).toEqual([]);
    db.close();
  });
});
