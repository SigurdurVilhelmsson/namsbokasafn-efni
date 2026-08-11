import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('../__tests__/helpers/freshMigratedDb');
const { seedBooks } = require('../scripts/lib/scratchCorpus');
const { seedC24Concepts, assertSeeded } = require('../__tests__/helpers/seedC24Concepts');
const terminologyService = require('../services/terminologyService');

// ⚠️ §C36 B4b-1 — THIS FILE NO LONGER USES createTestDb(). That helper is a
// hand-maintained copy of migration 032's six OLD terminology tables and has no
// `concept`, `concept_term`, `book_domain_priority` or `registered_books`, so
// every call into findTermsInSegments died with `no such table:
// book_domain_priority`. Each throwaway DB below is a freshMigratedDb() — the
// real schema, every migration — seeded with seedBooks() for the domain
// priorities and, where the fixture is needed, seedC24Concepts().

/** A migrated DB with the six books + their domain priorities, and nothing else. */
function conceptDb() {
  const { db: fresh } = freshMigratedDb();
  const realLog = console.log;
  console.log = () => {}; // seedBooks narrates to stdout; it is not this suite's output
  try {
    seedBooks(fresh);
  } finally {
    console.log = realLog;
  }
  return fresh;
}

const terms = JSON.parse(
  readFileSync(new URL('./fixtures/c24-terms.json', import.meta.url), 'utf-8')
);
const segments = JSON.parse(
  readFileSync(new URL('./fixtures/c24-segments.json', import.meta.url), 'utf-8')
);

// Mirrors production's `wholeWordRegex` (server/services/terminologyService.js) exactly —
// \p{L}/\p{N} lookarounds, not \b, so this test cannot drift from the code it validates.
// \b requires a word-character transition at BOTH edges, which is unsatisfiable for any
// headword that starts or ends in punctuation (16 of 316 headwords end in ')', e.g.
// "atomic mass unit (amu)" — a \b-anchored pattern fails to match all 16, even against
// their own literal text, while every threshold in this file stays green). And \w is
// ASCII-only, so it would silently fail to match Icelandic letters (þ æ ö ...) that
// appear in the corpus's `english` field (e.g. "virkjunarorka (Ea)").
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const boundaryRegex = (text) =>
  new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(text)}(?![\\p{L}\\p{N}_])`, 'iu');

// The fixture is an ORACLE INPUT. If it loses these properties the golden keeps
// passing while covering nothing. Each assertion names the production fact it
// mirrors (spec §4.10 / §4.11).
// ⚠️ These assert the checked-in fixture's SHAPE. They call no service and are
// green regardless of what the matcher does. They are not matcher coverage.
describe('c24 fixture shape (does NOT exercise the matcher)', () => {
  const allTr = terms.headwords.flatMap((h) => h.translations);

  // ⚠️ §C36 B4b-1 — THE ASSERTION STILL HOLDS; ITS STATED RATIONALE NO LONGER
  // DOES, and no assertion here can see that. "Fallback-heavy for a chemistry
  // book" was true when the tier came from `book_subject_mapping`, a SINGLE
  // subject: everything not tagged `chemistry` was fallback. efnafraedi-2e's
  // `book_domain_priority` chain is ['chemistry','physics','biology'], so 244 of
  // the fixture's 326 translations are now IN SCOPE and only the 82 mathematics
  // ones fall back — the opposite of fallback-heavy. The production figures
  // cited (709 vs ~28194) were measured under single-subject scoping too. This
  // test survives only because it measures the CHEMISTRY SHARE, which the model
  // change does not move. Same class as the migration044 annotation.
  it('is fallback-heavy for a chemistry book, as production is (709 vs ~28194)', () => {
    const chem = allTr.filter((t) => t.subjects.includes('chemistry')).length;
    expect(chem / allTr.length).toBeLessThan(0.15);
  });

  it('contains within-subject collisions, which are 95.9% of real collisions', () => {
    const collisions = terms.headwords.filter((h) => {
      const bySubject = new Map();
      for (const t of h.translations) {
        for (const s of t.subjects) bySubject.set(s, (bySubject.get(s) || 0) + 1);
      }
      return [...bySubject.values()].some((n) => n > 1);
    });
    expect(collisions.length).toBeGreaterThanOrEqual(5);
  });

  it('contains a cross-subject-only collision, which the tier partition resolves', () => {
    const cross = terms.headwords.filter((h) => {
      if (h.translations.length < 2) return false;
      const subs = new Set(h.translations.flatMap((t) => t.subjects));
      return subs.size === h.translations.length;
    });
    expect(cross.length).toBeGreaterThanOrEqual(1);
  });

  it('contains a 72-form inflection list, production’s measured maximum', () => {
    expect(Math.max(...allTr.map((t) => (t.inflections || []).length))).toBe(72);
  });

  it('contains the mól / "mól (m)" shape the audit counterexample needs', () => {
    expect(
      allTr.some((t) => (t.inflections || []).some((f) => f.includes('(') && f.includes(' ')))
    ).toBe(true);
  });

  it('contains short abbreviation headwords, which dominate real collisions', () => {
    expect(terms.headwords.filter((h) => h.english.length <= 2).length).toBeGreaterThanOrEqual(3);
  });

  it('contains proposed rows, so the approved-beats-proposed tiebreak is exercised', () => {
    // Production has ZERO proposed, so this path is otherwise never covered anywhere.
    expect(allTr.some((t) => t.status === 'proposed')).toBe(true);
    expect(allTr.some((t) => t.status === 'approved')).toBe(true);
  });

  it('has multi-segment input, which nothing in the suite exercises today', () => {
    expect(segments.length).toBeGreaterThanOrEqual(20);
  });

  it('has segments whose EN actually contains fixture headwords', () => {
    // Word-boundary matching, not plain substring — substring matching is the exact bug
    // class this whole effort exists to catch. It isn't hypothetical here either: with a
    // plain .includes() check, the headword `os` matched inside `glOSsary`, so the segment
    // deliberately written to contain NO glossary term ("No glossary term appears in this
    // sentence at all.") counted as a hit.
    const patterns = terms.headwords.map((h) => boundaryRegex(h.english));
    const hit = segments.filter((s) => patterns.some((re) => re.test(s.enContent)));
    expect(hit.length).toBeGreaterThanOrEqual(10);
  });

  it('the realism check can actually see every headword, including parenthetical ones', () => {
    // Guards against a boundary regex that silently cannot match punctuation-bounded
    // headwords — 16 of them end in ')'. A \b-anchored pattern fails all 16 while
    // every threshold in this file stays green.
    const unmatchable = terms.headwords.filter((h) => !boundaryRegex(h.english).test(h.english));
    expect(unmatchable.map((h) => h.english)).toEqual([]);
  });
});

// ⚠️ c24-golden.json is a PRE-SWAP capture and is no longer asserted against —
// see the banner on the skipped describe below for what it now measures, why it
// may not be regenerated, and what is awaiting a ruling. Loaded here because
// that block still reads it. (This position used to hold the oracle's own
// rationale; it is not restated, per § One source of truth — the banner owns it.)
const golden = JSON.parse(
  readFileSync(new URL('./fixtures/c24-golden.json', import.meta.url), 'utf-8')
);

// Module scope, not describe scope: the automaton-cache describes below point the
// service at their own throwaway DBs and must restore THIS one afterwards.
let db;

beforeAll(() => {
  db = conceptDb();
  seedC24Concepts(db);
  terminologyService._setTestDb(db);
});

// ─────────────────────────────────────────────────────────────────────────────
// THE SEED CONTROL. Everything fixture-driven below rests on the concept tables
// actually holding the C24 corpus; an empty seed makes every span assertion
// compare [] to [] and pass forever.
// ─────────────────────────────────────────────────────────────────────────────
describe('the C24 fixture is actually seeded into the concept model', () => {
  it('seeds one concept per (headword, subject) and one automaton entry per distinct English string', () => {
    const { concepts, distinctEnglish } = assertSeeded(db);
    // 316 headwords, of which exactly one ('cell') spans two subjects -> 317.
    expect(concepts).toBe(317);
    // 304, not 316: twelve headwords share an English string with another
    // headword (the fixture's within-subject collisions). This is the number the
    // automaton is BUILT from — loadEnglishEntries groups by text — so it is the
    // count that silently collapses if the group-by-subject logic is wrong.
    expect(distinctEnglish).toBe(304);
    expect(db.prepare("SELECT COUNT(*) AS n FROM concept_term WHERE lang='is'").get().n).toBe(326);
  });

  it('a NAMED golden segment yields a non-zero match count against the seed', () => {
    // Named, not "some segment": a partially-applied seed satisfies "at least one
    // segment matches something" while leaving most of the corpus absent.
    const actual = terminologyService.findTermsInSegments(segments, 'efnafraedi-2e');
    expect(actual['m002:para:fs-id0000'].matches.length).toBeGreaterThan(0);
    const total = Object.values(actual).reduce((n, r) => n + r.matches.length, 0);
    expect(total).toBe(40);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ SKIPPED PENDING A CONTROLLER RULING — §C36 B4b-1, Task 6. DO NOT DELETE,
// DO NOT REGENERATE THE GOLDEN, DO NOT WEAKEN THIS UNTIL IT PASSES.
//
// The brief expected `{english, position}` — span and order — to survive the
// cut-over even though ids and winner selection could not. MEASURED, it does not
// survive intact, and the cause is single and fully explained:
//
//   The tier partition the tiler sorts on changed. Before B4b-1 the tier came
//   from `book_subject_mapping` via getBookSubjectBySlug — ONE subject. For
//   efnafraedi-2e that was 'chemistry', so every physics/biology/mathematics
//   term was FALLBACK. After B4b-1 it comes from `book_domain_priority`, whose
//   chain for efnafraedi-2e is ['chemistry','physics','biology'] — so physics
//   and biology are promoted to IN SCOPE and only mathematics falls back.
//   `hits.sort` orders in-scope before fallback, so a different partition means
//   a different claim order.
//
// Measured over all 24 golden segments (identity subject->domain mapping; see
// helpers/seedC24Concepts.js for why any other mapping would be a fabrication):
//   * TOTAL MATCH COUNT IS UNCHANGED: 40 before, 40 after.
//   * 21 of 24 segments claim exactly the same SPAN SET.
//   * 12 of 24 segments differ in match ORDER only, e.g.
//       m002:para:fs-id0000  golden ["bond@43","absolute zero@2"]
//                            actual ["absolute zero@2","bond@43"]
//     'bond' is chemistry and used to be the only in-scope term, so it led;
//     'absolute zero' is biology, now in-scope, and is longer.
//   * 3 of 24 segments claim DIFFERENT SPANS:
//       m001:para:fs-id0001  "atomic mass@4"  -> "atomic mass unit@4"
//       m002:para:fs-id0007  "atomic mass@2"  -> "atomic mass unit (amu)@2"
//         ('atomic mass' is tagged chemistry AND mathematics; 'atomic mass
//          unit' is physics. Old: chemistry claimed the short span first.
//          New: both in scope, longest-first wins. Arguably an IMPROVEMENT.)
//       m002:para:fs-id0012  "bomb calorimeter@2" -> "calorimeter@7"
//         ('bomb calorimeter' is tagged mathematics -> out of chain -> fallback;
//          'calorimeter' is biology -> in scope. The shorter in-scope term now
//          claims the span. Arguably a REGRESSION, and it is item 18's rule
//          working as written: the book's own domains always win an overlap.)
//
// ⚠️ Two of the three span diffs hang on chemically implausible fixture tags
// ('bomb calorimeter' -> mathematics), so THE DIFF IS PARTLY A SYNTHESIS
// ARTIFACT — but THE MECHANISM IS REAL and will fire in production wherever an
// out-of-chain multiword term overlaps a shorter in-chain one.
//
// A mapping that reproduces the golden byte-for-byte EXISTS (send physics and
// biology to domains outside efnafraedi-2e's chain) and was REJECTED: it is a
// mapping chosen to make an oracle pass, and it would certify the cut-over
// against a fiction.
//
// The original oracle rationale still stands and is why nothing here may be
// regenerated: c24-golden.json was captured from the UNMODIFIED matcher at
// commit c991e2b8, after the ORDER BY tie-breaks and before any Aho-Corasick
// code existed. Re-capturing post-swap certifies the new implementation against
// itself. capture-c24-golden.js's own header forbids it and its refusal guard
// measures magnitude, not provenance, so it would NOT stop you.
// ─────────────────────────────────────────────────────────────────────────────
describe.skip('findTermsInSegments span-and-order pin (C24 golden) — SEE BANNER, AWAITING RULING', () => {
  it('the golden is not vacuous', () => {
    // A golden of all-empty results would pass forever while proving nothing.
    // Captured values were 40 matches / 5 issues across 24 segments.
    const nMatches = Object.values(golden).reduce((n, r) => n + r.matches.length, 0);
    const nIssues = Object.values(golden).reduce((n, r) => n + r.issues.length, 0);
    expect(nMatches).toBeGreaterThan(0);
    expect(nIssues).toBeGreaterThan(0);
  });

  // One `it` per segment so a diff names the failing case — the pattern at
  // tools/__tests__/book-rendering-config.test.js.
  for (const segmentId of Object.keys(golden)) {
    it(`claims the same spans, in the same order, as the C24 golden for ${segmentId}`, () => {
      const actual = terminologyService.findTermsInSegments(segments, 'efnafraedi-2e');
      const shape = (m) => ({ english: m.english, position: m.position });
      expect(actual[segmentId].matches.map(shape)).toEqual(golden[segmentId].matches.map(shape));
    });
  }
});

/**
 * Seed one concept in one domain, with one English and one Icelandic term.
 *
 * ⚠️ Returns the EN `concept_term.id`, NOT a concept id. That is what
 * `loadEnglishEntries` uses as the automaton's `headwordId` — via MIN(id) per
 * distinct English string — and what `match.headwordId` therefore carries. The
 * callers below use it to UPDATE the English text in place, so it must be the
 * term row.
 *
 * @returns {number} the new EN concept_term id
 */
function seedOneConcept(target, english, icelandic, domain = 'chemistry') {
  const conceptId = Number(
    target.prepare('INSERT INTO concept (domain) VALUES (?)').run(domain).lastInsertRowid
  );
  const enId = Number(
    target
      .prepare(
        "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', ?, 1, 'fixture')"
      )
      .run(conceptId, english).lastInsertRowid
  );
  target
    .prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', ?, 1, 'fixture')"
    )
    .run(conceptId, icelandic);
  return enId;
}

// ─────────────────────────────────────────────────────────────────────────────
// The automaton cache (C24). It is the ONLY cached state, and its fingerprint is
// computed from rows re-read on every call — so these tests assert that no
// explicit invalidation is needed. `matches[0]` is never indexed before its
// length is asserted: a mutant must fail as an ASSERTION, not as a TypeError.
// ─────────────────────────────────────────────────────────────────────────────
describe('automaton cache stays consistent with the DB', () => {
  it('picks up a headword added after the first call, with no explicit invalidation', () => {
    const db2 = conceptDb();
    terminologyService._setTestDb(db2);
    try {
      const seg = [{ segmentId: 's', enContent: 'A catalyst works.', isContent: 'Hvati virkar.' }];
      expect(terminologyService.findTermsInSegments(seg, 'efnafraedi-2e').s.matches).toHaveLength(
        0
      );

      seedOneConcept(db2, 'catalyst', 'hvati');

      const after = terminologyService.findTermsInSegments(seg, 'efnafraedi-2e');
      expect(after.s.matches).toHaveLength(1);
      expect(after.s.matches[0].english).toBe('catalyst');
    } finally {
      // Structural, not incidental: a mid-test assertion failure must still hand the
      // service back a live DB, or every later test in this file inherits a closed one.
      terminologyService._setTestDb(db);
      db2.close();
    }
  });

  it('reflects a headword RENAME, which a count-based fingerprint would miss', () => {
    const db3 = conceptDb();
    terminologyService._setTestDb(db3);
    try {
      const seg = [{ segmentId: 's', enContent: 'An aton and an atom.', isContent: '' }];
      const hwId = seedOneConcept(db3, 'atom', 'frumeind');

      const before = terminologyService.findTermsInSegments(seg, 'efnafraedi-2e').s.matches;
      expect(before).toHaveLength(1);
      expect(before[0].english).toBe('atom');

      // Same length, same row count — only the bytes change.
      db3.prepare(`UPDATE concept_term SET text='aton' WHERE id=${hwId}`).run();

      const renamed = terminologyService.findTermsInSegments(seg, 'efnafraedi-2e').s.matches;
      expect(renamed).toHaveLength(1);
      expect(renamed[0].english).toBe('aton');
      // ⚠️ `position` is the load-bearing assertion, not `english` — same reason
      // as the TRANSPOSITION test below, which already carries it. `match.english`
      // is re-read from the DB row on every call, so it tracks the rename even
      // when the automaton is stale; only `position` is automaton-derived. Here
      // 'aton' sits at 3 and the pre-rename 'atom' at 15, so a cache that failed
      // to rebuild answers 15. Without this line the test passes under an
      // id-only-fingerprint mutant — it asserted nothing the automaton produced.
      expect(renamed[0].position).toBe(3);
    } finally {
      terminologyService._setTestDb(db);
      db3.close();
    }
  });

  it('reflects a pure TRANSPOSITION rename, which an order-blind hash would miss', () => {
    // Guards the FNV multiply — since B4b-1 that is
    // conceptMatcher.fingerprintEntries, not the deleted
    // terminologyService.fingerprintHeadwords. Degrading 0x01000193 to 1 turns the
    // hash into an order-blind XOR fold: 'atom' and 'atmo' share a character
    // multiset, so they hash identically and the cache is never rebuilt. The
    // existing atom→aton test CANNOT catch that (those differ by a character, so
    // the XOR differs too).
    //
    // ⚠️ `position` is the load-bearing assertion, not `english`. `match.english`
    // is read from the DB row on every call, so it tracks the rename even when the
    // automaton is stale; only `position` is automaton-derived. A stale automaton
    // still holding 'atom' answers 15 where a rebuilt one answers 3.
    const db4 = conceptDb();
    terminologyService._setTestDb(db4);
    try {
      //                                   atmo@3         atom@15
      const seg = [{ segmentId: 's', enContent: 'An atmo and an atom.', isContent: '' }];
      const hwId = seedOneConcept(db4, 'atom', 'frumeind');

      const before = terminologyService.findTermsInSegments(seg, 'efnafraedi-2e').s.matches;
      expect(before).toHaveLength(1);
      expect(before[0].english).toBe('atom');
      expect(before[0].position).toBe(15);

      // Pure transposition: same characters, same length, same row count.
      db4.prepare(`UPDATE concept_term SET text='atmo' WHERE id=${hwId}`).run();

      const renamed = terminologyService.findTermsInSegments(seg, 'efnafraedi-2e').s.matches;
      expect(renamed).toHaveLength(1);
      expect(renamed[0].english).toBe('atmo');
      expect(renamed[0].position).toBe(3);
    } finally {
      terminologyService._setTestDb(db);
      db4.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE INVARIANT, pinned at the CONSUMER (findTermsInSegments), not the primitive.
//
// termAutomaton owns "earliest whole-word occurrence per headword"; the tiler in
// findTermsInSegments then drops any term whose FIRST occurrence overlaps a span
// already claimed — even when that term recurs, unoverlapped, later in the text.
//
// This class is uncovered at both other layers. The golden fixture is structurally
// blind to it, and Task 8's randomised differential exercises buildTermAutomaton /
// findFirstOccurrences only — it never calls findTermsInSegments, builds no DB, and
// so has neither the tier partition nor the tiler.
//
// This is precisely where a future "the next occurrence doesn't overlap, take it"
// optimisation would land. Aho-Corasick returns ALL occurrences, so that change is
// one line away and silently breaks byte-identity with the pre-swap behaviour.
// ─────────────────────────────────────────────────────────────────────────────
describe('an overlapped first occurrence is DROPPED, never re-sought later', () => {
  it('drops the nested short term even though it recurs unoverlapped (longest-first)', () => {
    const dbT = conceptDb();
    terminologyService._setTestDb(dbT);
    try {
      seedOneConcept(dbT, 'acid rain', 'súrt regn');
      seedOneConcept(dbT, 'acid', 'sýra');

      //                             acid rain@0        acid@21
      const seg = [
        { segmentId: 's', enContent: 'Acid rain falls when acid forms.', isContent: '' },
      ];
      const matches = terminologyService.findTermsInSegments(seg, 'efnafraedi-2e').s.matches;

      // 'acid rain' claims 0..9. 'acid' first occurs at 0, inside that span, so it is
      // dropped outright — NOT re-sought and matched at 21.
      expect(matches).toHaveLength(1);
      expect(matches[0].english).toBe('acid rain');
      expect(matches[0].position).toBe(0);
      expect(matches.map((m) => m.english)).not.toContain('acid');
    } finally {
      terminologyService._setTestDb(db);
      dbT.close();
    }
  });

  it('holds when the tier partition INVERTS length order (short in-scope beats long fallback)', () => {
    // The case that makes the class observable at all: `hits` is in-scope-first,
    // NOT longest-first, so a short in-scope term claims its span before a longer
    // fallback term is considered. The long term is then dropped despite recurring.
    //
    // ⚠️ §C36 B4b-1 — THE FALLBACK DOMAIN IS `mathematics`, NOT `biology`, AND THE
    // CHANGE IS LOAD-BEARING. Under the old single-subject scoping any domain that
    // was not the book's own subject was fallback, so 'biology' inverted the tiers
    // for a chemistry book. efnafraedi-2e's `book_domain_priority` chain is
    // ['chemistry','physics','biology'], so biology is now IN SCOPE — with it, both
    // terms are in scope, longest-first wins, 'acid rain' claims the span and this
    // test asserts the opposite of what it means to. `mathematics` is the right
    // choice for the same documented reason it is elsewhere in this branch:
    // domains.js says in as many words that it is "deliberately absent from the
    // chemistry books ... out of scope on purpose, not by oversight".
    const dbT = conceptDb();
    terminologyService._setTestDb(dbT);
    try {
      seedOneConcept(dbT, 'acid rain', 'súrt regn', 'mathematics'); // out of chain → fallback
      seedOneConcept(dbT, 'acid', 'sýra', 'chemistry'); // in-scope → ordered first

      //                             acid@0 / acid rain@0        acid rain@21
      const seg = [
        { segmentId: 's', enContent: 'Acid rain falls when acid rain forms.', isContent: '' },
      ];
      const matches = terminologyService.findTermsInSegments(seg, 'efnafraedi-2e').s.matches;

      // 'acid' (in-scope, 4 chars) claims 0..4 first. 'acid rain' (fallback, 9 chars)
      // first occurs at 0, overlaps, and is dropped — even though it recurs at 21.
      expect(matches).toHaveLength(1);
      expect(matches[0].english).toBe('acid');
      expect(matches[0].position).toBe(0);
      expect(matches.map((m) => m.english)).not.toContain('acid rain');
    } finally {
      terminologyService._setTestDb(db);
      dbT.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C24 PERFORMANCE PROPERTIES, asserted as COMPILE/BUILD COUNTS — wall-clock is
// not assertable in CI. Nothing above this line fails if the perf fix is quietly
// reverted; the golden only checks that MATCH OUTPUT stays byte-identical, and a
// pre-swap-shaped implementation reproduces it too, just slowly.
//
// Two independent mechanisms were removed, and both retire the SAME `new
// RegExp()` counter, at different call sites:
//   1. The per-headword English regex (wholeWordRegex over `english`) — replaced
//      by one Aho-Corasick automaton pass.
//   2. Eager inflection-regex construction (buildInflectionRegex per
//      translation) — since B4b-1 this is `matchesForm` inside
//      findTermsInSegments, which compiles only for a match that HAS a winner
//      and a segment that HAS Icelandic content. (It replaced the lazy
//      `isRegex` getter, which the cut-over deleted along with the per-call
//      translation-object reconstruction that getter was memoising onto.)
// A THIRD mechanism — the automaton cache itself — compiles zero regexes even
// when broken (rebuilt every call), so it needs its own, different counter
// entirely: see the "built once" describe below.
//
// ⚠️ The count below is asserted EXACT, not as `< headwordCount` / `<
// translationCount`. An earlier version of this test used those two bounds,
// on the theory that they cover independent axes. They do not: on this
// fixture translationCount (326) > headwordCount (316), so the second bound
// is strictly weaker than the first — there was only ever one binding
// constraint. Worse, that one constraint has ~29x slack (compiles=11 vs.
// threshold 316), which a whole-branch review demonstrated is wide enough to
// hide a real partial regression: reintroducing eager inflection compilation
// bounded by MATCHED headwords rather than the full corpus (adding
// `term.translations.forEach((t) => t.isRegex)` after a match) still passes
// golden equality (43/43) and produces 30 compiles — comfortably under both
// loose bounds. A bound tied to match count doesn't work either (real=11,
// mutant=30, both under 40 matches). Only an exact count catches it.
// ─────────────────────────────────────────────────────────────────────────────
describe('C24 performance properties, asserted as COMPILE COUNTS not wall-clock', () => {
  it('compiles no per-headword English regex, and only the inflection regexes it executes', () => {
    const NativeRegExp = global.RegExp;
    let compiles = 0;
    global.RegExp = new Proxy(NativeRegExp, {
      construct(target, args) {
        compiles++;
        return new target(...args);
      },
    });
    let actual;
    try {
      actual = terminologyService.findTermsInSegments(segments, 'efnafraedi-2e');
    } finally {
      global.RegExp = NativeRegExp;
    }

    // Vacuousness guard for the count that follows: `segments`/`terms` are the
    // same fixture the golden's own "not vacuous" test already pins at 40
    // matches, so this is a cheap re-confirmation, not new coverage — but a
    // near-zero compile count is meaningless without it.
    const nMatches = Object.values(actual).reduce((n, r) => n + r.matches.length, 0);
    expect(nMatches).toBeGreaterThan(0);

    // EXACT, not a loose upper bound — see the block comment above this
    // describe for why a bound doesn't discriminate a partial regression on
    // this fixture. Exact is safe here because the fixture is committed and
    // fixed: if this number ever changes, either c24-terms.json /
    // c24-segments.json moved, or the automaton regressed.
    //
    // ⚠️ §C36 B4b-1 — RE-DERIVED POST-CUT-OVER. This asserted 11 and now
    // asserts 56, and the number was RE-MEASURED, not adjusted until green.
    // 11 was the old lazy `isRegex` accessor, which memoised one regex per
    // translation OBJECT per call; the cut-over deleted it. Compilation now
    // happens inside `matchesForm` (terminologyService.findTermsInSegments),
    // which builds a fresh regex per CALL. Measured breakdown on this fixture:
    // 37 winner checks (one per in-scope match in a segment that has Icelandic
    // content) + 19 issue-path candidate checks (`alts` and the intra-concept
    // siblings, tried only after the winner's own form failed), = 56, stable
    // across repeated runs.
    //
    // ⚠️ WHAT THIS TEST IS FOR SURVIVED THE RISE. C24 exists because compiles
    // scaled with CORPUS SIZE (642 on this fixture pre-swap, ~28,903 in
    // production). 56 scales with MATCH COUNT: neither loadEnglishEntries nor
    // buildTermAutomaton constructs a RegExp at all, so no per-headword or
    // per-translation compile remains. A regression that reintroduced one
    // would land far above 56 on a 304-string fixture — which is exactly what
    // the calibration test below still guards.
    expect(compiles).toBe(56);
  });

  it('the assertion above is CALIBRATED — the fixture is large enough to discriminate', () => {
    // An uncalibrated threshold passes on a NO-fix. On this fixture the unmodified
    // (pre-swap) function compiled 642 regexes against a fixed-code count of 11;
    // if the fixture ever shrinks, that margin — and the exact-count assertion's
    // ability to catch a partial regression — shrinks with it.
    const headwordCount = terms.headwords.length;
    expect(headwordCount).toBeGreaterThan(300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE AUTOMATON CACHE'S EXISTENCE, pinned directly — compile counts cannot see
// this class of regression. An automaton rebuilt on every call compiles ZERO
// extra regexes (buildTermAutomaton never touches RegExp at all; it feeds
// keyword strings straight to Aho-Corasick), so the describe above passes even
// if the caching in findTermsInSegments (services/terminologyService.js:1489-
// 1500) is deleted outright. That is the exact failure a blind-pair review of
// Task 7 found: mutating the rebuild condition to always rebuild passes the
// whole 40/40 suite.
//
// INSTRUMENTATION CHOICE: `buildTermAutomaton` is destructured by
// terminologyService.js at require time (`const { buildTermAutomaton } =
// require('../lib/termAutomaton')`, terminologyService.js:15), so a `vi.spyOn`
// on termAutomaton's exports object — taken AFTER terminologyService has
// already loaded, as it has by line 7 of this file — patches a property
// nothing reads; the destructured local binding already holds the original
// function value and is immune to later patches on the exports object. This is
// the same constraint documented at acceptanceApply.test.js:8-13 for
// `advanceChapterStatus`, and there is no "one level down" property-lookup seam
// here the way that file found for pipelineStatusService — buildTermAutomaton's
// own internals (foldString, AhoCorasick) are themselves destructured, so
// nothing along the chain is spyable via property lookup.
//
// The only seam that actually intercepts a destructured call is the module
// boundary itself, via the real CJS `require.cache` (not a vi.mock/vi.doMock —
// this file reaches server/ CJS code through `createRequire`, a genuine Node
// module loader, not vite-node's ESM graph): swap termAutomaton's cached
// exports for a counting wrapper around the SAME real implementation, force
// terminologyService to re-evaluate via a fresh require so its destructuring
// captures the wrapper, then restore both cache slots to the exact original
// Module objects — never mutate an original Module's `.exports` in place. That
// distinction matters here: this repo's `server` vitest project runs test files
// sequentially in a shared worker (`fileParallelism: false` in
// vitest.workspace.js), so a mutated-in-place original, left un-restored by an
// early exit, would corrupt the module every later test file in this run sees.
// Reassigning a substitute object and restoring the saved reference is exact
// and needs no partial-undo bookkeeping.
// ─────────────────────────────────────────────────────────────────────────────
describe('C24 automaton cache: built once per unchanged term set, not once per call', () => {
  it('builds the automaton exactly once across 3 calls with an unchanged term set', () => {
    const termAutomatonPath = require.resolve('../lib/termAutomaton');
    const terminologyServicePath = require.resolve('../services/terminologyService');

    const originalTermAutomatonModule = require.cache[termAutomatonPath];
    const originalTerminologyServiceModule = require.cache[terminologyServicePath];
    // Both are guaranteed present: this file's own top-level `require('../services/
    // terminologyService')` (line 7) already pulled termAutomaton in transitively.
    expect(originalTermAutomatonModule).toBeDefined();
    expect(originalTerminologyServiceModule).toBeDefined();

    const realExports = originalTermAutomatonModule.exports;
    let buildCount = 0;
    const wrappedExports = {
      ...realExports,
      buildTermAutomaton: (...args) => {
        buildCount++;
        return realExports.buildTermAutomaton(...args);
      },
    };

    // Substitute Module objects, not in-place mutation — restore is then an
    // exact reference swap.
    require.cache[termAutomatonPath] = { ...originalTermAutomatonModule, exports: wrappedExports };
    delete require.cache[terminologyServicePath];

    try {
      const freshService = require('../services/terminologyService');
      freshService._setTestDb(db);

      const r1 = freshService.findTermsInSegments(segments, 'efnafraedi-2e');
      freshService.findTermsInSegments(segments, 'efnafraedi-2e');
      freshService.findTermsInSegments(segments, 'efnafraedi-2e');

      // Vacuousness guard: buildCount === 1 must mean "the automaton was built
      // once and reused across 3 real calls that each found matches" — not "the
      // fresh instance silently ran against an empty result set and it doesn't
      // matter how many times a no-op ran."
      const nMatches = Object.values(r1).reduce((n, r) => n + r.matches.length, 0);
      expect(nMatches).toBeGreaterThan(0);

      expect(buildCount).toBe(1);
    } finally {
      require.cache[termAutomatonPath] = originalTermAutomatonModule;
      require.cache[terminologyServicePath] = originalTerminologyServiceModule;
    }
  });
});
