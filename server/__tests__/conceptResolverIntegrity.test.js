// server/__tests__/conceptResolverIntegrity.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { lookupCandidates, resolveCandidates } = require('../lib/conceptResolver');

/**
 * Pins from the whole-branch blind review. Every test here closes a gap where the
 * code could be broken with the ENTIRE suite still green — the failure class this
 * branch keeps finding, and the reason a passing suite is not by itself evidence.
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

describe('followMerge terminates on a TAIL cycle, not just a self-merge', () => {
  // ⚠️ The `seen.add(next)` line was unpinned: deleting it left all 56 tests green
  // while the resolver looped FOREVER on A→B→C→B. Task 4's review proved termination
  // "by pigeonhole" — a proof that silently ASSUMED the line no test exercised.
  //
  // The existing A→B→A fixture cannot catch it: with a 2-cycle, the very first
  // candidate for `next` is the start id, which is in `seen` from initialisation. Only
  // a cycle whose entry point is NOT the start id needs the loop to keep recording.
  //
  // ⚠️ THE 5s TIMEOUT BELOW DOES NOT SAVE YOU, and it is worth knowing why before you
  // trust it. `followMerge` is a SYNCHRONOUS `for(;;)`, so a mutant blocks the event
  // loop and vitest cannot preempt it — measured: deleting `seen.add(next)` hangs the
  // whole file until an external `timeout 120` kills the runner, and no per-test timeout
  // ever fires. The regression IS caught, but it surfaces as a hung run rather than a
  // clean red, so read a hang here as this test failing, not as flaky infrastructure.
  it('reports merge-cycle and returns, on a cycle entered part-way along the chain', () => {
    const { db } = freshMigratedDb();
    const a = addConcept(db, 'biology', 'tail', [['hali', 1]]).conceptId;
    const b = addConcept(db, 'biology', 'tail-b', [['hali-b', 1]]).conceptId;
    const c = addConcept(db, 'biology', 'tail-c', [['hali-c', 1]]).conceptId;
    const point = db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?');
    point.run(b, a); // A → B
    point.run(c, b); // B → C
    point.run(b, c); // C → B  — the cycle does NOT include A

    const { integrity } = lookupCandidates(db, 'tail');

    expect(integrity).toEqual(['merge-cycle']);
    db.close();
  }, 5000);
});

describe('a dangling merged_into is REPORTED, not silently dropped', () => {
  // ⚠️ `if (!c) continue` dropped the candidate with no trace: the caller saw a
  // genuine miss and could not tell it from corruption. Unreachable while foreign
  // keys are on — and better-sqlite3 here is compiled with
  // SQLITE_DEFAULT_FOREIGN_KEYS=1 — so the fixture must turn them off to reach it.
  it('pushes dangling-merge when merged_into names a concept that does not exist', () => {
    const { db } = freshMigratedDb();
    db.pragma('foreign_keys = OFF');
    const orphan = addConcept(db, 'biology', 'ghost', [['draugur', 1]]).conceptId;
    db.prepare('UPDATE concept SET merged_into = 987654 WHERE id = ?').run(orphan);

    const { candidates, integrity } = lookupCandidates(db, 'ghost');

    expect(integrity).toEqual(['dangling-merge']);
    expect(candidates).toEqual([]);
    db.close();
  });
});

describe('the head form is chosen by RANK, not by row id', () => {
  // ⚠️ `ORDER BY rank ASC, id ASC` could be swapped for `ORDER BY id ASC` with all 56
  // tests green. The reason is measurable and not obvious: the importer assigns rank in
  // array order and inserts in that same order, so across the real corpus autoincrement
  // id rises in LOCKSTEP with rank and the two orderings are indistinguishable. Every
  // fixture inherited that property by construction.
  //
  // This fixture deliberately breaks the lockstep — the rank-2 term is inserted FIRST,
  // so it holds the LOWER id — which is exactly what B4 produces the moment an editor
  // reorders ranks.
  it('returns the rank-1 term even when it has the HIGHER row id', () => {
    const { db } = freshMigratedDb();
    const { termIds } = addConcept(db, 'biology', 'nucleus', [
      ['rangt-ord', 2], // inserted first  → lower id, higher rank
      ['kjarni', 1], // inserted second → higher id, rank 1
    ]);
    expect(termIds[0]).toBeLessThan(termIds[1]); // the lockstep really is broken

    const [candidate] = lookupCandidates(db, 'nucleus').candidates;

    expect(candidate.isTerms[0]).toEqual({ termId: termIds[1], text: 'kjarni', rank: 1 });
    db.close();
  });
});

describe('the tie branches carry EVERY field through, not just the tie itself', () => {
  // ⚠️ Six passthrough fields could be blanked with the suite green: outOfScope and
  // integrity on BOTH tie returns, and codes on the no-survivor and unscoped paths.
  // "Nothing is silently dropped" is the entire stated purpose of the Resolution shape,
  // and the tie branches were unpinned on exactly that. Full-object toEqual, so a
  // dropped field cannot hide.
  const scope = {
    bookId: 1,
    chapter: 0,
    positionOf: new Map([['biology', 1]]),
    preference: new Map(),
    unscoped: false,
  };
  const twoAtOne = [
    { conceptId: 7, domain: 'biology', isTerms: [{ termId: 70, text: 'fúkalyf', rank: 1 }] },
    { conceptId: 8, domain: 'biology', isTerms: [{ termId: 80, text: 'sýklalyf', rank: 1 }] },
  ];
  const outOfScopeCandidate = {
    conceptId: 9,
    domain: 'geology',
    isTerms: [{ termId: 90, text: 'utan-sviðs', rank: 1 }],
  };
  const expectedOutOfScope = [{ conceptId: 9, text: 'utan-sviðs', domain: 'geology' }];

  it('a REAL tie carries outOfScope and integrity through', () => {
    expect(resolveCandidates(scope, [...twoAtOne, outOfScopeCandidate], ['merge-cycle'])).toEqual({
      winner: null,
      reason: null,
      nominalTie: [],
      tied: [
        { conceptId: 7, text: 'fúkalyf', domain: 'biology' },
        { conceptId: 8, text: 'sýklalyf', domain: 'biology' },
      ],
      outOfScope: expectedOutOfScope,
      integrity: ['merge-cycle'],
      unscoped: false,
      alsoInScope: [],
    });
  });

  it('a NOMINAL tie carries outOfScope and integrity through', () => {
    const agreeing = twoAtOne.map((c) => ({
      ...c,
      isTerms: [{ ...c.isTerms[0], text: 'sama-orð' }],
    }));
    expect(resolveCandidates(scope, [...agreeing, outOfScopeCandidate], ['merge-cycle'])).toEqual({
      winner: { conceptId: 7, termId: 70, text: 'sama-orð', domain: 'biology', position: 1 },
      reason: 'head-form',
      nominalTie: [7, 8],
      tied: [],
      outOfScope: expectedOutOfScope,
      integrity: ['merge-cycle'],
      unscoped: false,
      alsoInScope: [],
    });
  });

  it('the NO-SURVIVOR path carries codes and outOfScope through', () => {
    expect(resolveCandidates(scope, [outOfScopeCandidate], ['merge-cycle'])).toEqual({
      winner: null,
      reason: null,
      nominalTie: [],
      tied: [],
      outOfScope: expectedOutOfScope,
      integrity: ['merge-cycle'],
      unscoped: false,
      alsoInScope: [],
    });
  });

  it('the UNSCOPED path carries codes through', () => {
    expect(resolveCandidates({ unscoped: 'unregistered' }, twoAtOne, ['merge-cycle'])).toEqual({
      winner: null,
      reason: null,
      nominalTie: [],
      tied: [],
      outOfScope: [],
      integrity: ['merge-cycle'],
      unscoped: 'unregistered',
      alsoInScope: [],
    });
  });
});
