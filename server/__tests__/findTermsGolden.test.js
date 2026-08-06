import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createTestDb } = require('../__tests__/helpers/terminologyTestDb');
const terminologyService = require('../services/terminologyService');

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
describe('c24 fixture realism', () => {
  const allTr = terms.headwords.flatMap((h) => h.translations);

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

// ─────────────────────────────────────────────────────────────────────────────
// THE MIGRATION ORACLE.
//
// c24-golden.json was captured from the UNMODIFIED matcher at commit c991e2b8 —
// after the ORDER BY tie-breaks landed, and before any Aho-Corasick code existed.
// That order is not incidental: capturing it after the swap would certify the new
// implementation against itself, and there is no observable difference between a
// correct golden and a worthless one.
//
// If this ever needs regenerating, do it from a checkout at the pre-swap commit —
// never from HEAD. Regenerate with server/scripts/capture-c24-golden.js.
//
// `toEqual` against checked-in JSON, deliberately NOT `toMatchSnapshot`: `-u`
// regenerates a snapshot silently, which is the same failure this file exists to
// prevent.
// ─────────────────────────────────────────────────────────────────────────────
const golden = JSON.parse(
  readFileSync(new URL('./fixtures/c24-golden.json', import.meta.url), 'utf-8')
);

function seedFixture(db) {
  const insHw = db.prepare('INSERT INTO terminology_headwords (english, pos) VALUES (?, ?)');
  const insTr = db.prepare(
    `INSERT INTO terminology_translations
       (headword_id, icelandic, inflections, source, status, proposed_by, proposed_by_name)
     VALUES (?, ?, ?, 'fixture', ?, 'u1', 'Fixture')`
  );
  const insSubj = db.prepare(
    'INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
  );
  for (const hw of terms.headwords) {
    const hwId = Number(insHw.run(hw.english, hw.pos).lastInsertRowid);
    for (const tr of hw.translations) {
      const trId = Number(
        insTr.run(
          hwId,
          tr.icelandic,
          tr.inflections ? JSON.stringify(tr.inflections) : null,
          tr.status
        ).lastInsertRowid
      );
      for (const s of tr.subjects) insSubj.run(trId, s);
    }
  }
}

// Module scope, not describe scope: the automaton-cache describes below point the
// service at their own throwaway DBs and must restore this one afterwards.
let db;

describe('findTermsInSegments golden equality (C24 migration oracle)', () => {
  beforeAll(() => {
    db = createTestDb();
    terminologyService._setTestDb(db);
    seedFixture(db);
  });

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
    it(`reproduces the pre-swap result for ${segmentId}`, () => {
      const actual = terminologyService.findTermsInSegments(segments, 'efnafraedi-2e');
      expect(actual[segmentId]).toEqual(golden[segmentId]);
    });
  }
});

/**
 * Seed one headword with one translation tagged to one subject.
 * @returns {number} the new headword id
 */
function seedOneHeadword(target, english, icelandic, subject = 'chemistry') {
  const hw = target
    .prepare('INSERT INTO terminology_headwords (english, pos) VALUES (?, NULL)')
    .run(english);
  const tr = target
    .prepare(
      `INSERT INTO terminology_translations
         (headword_id, icelandic, source, status, proposed_by, proposed_by_name)
       VALUES (?, ?, 'fixture', 'approved', 'u1', 'F')`
    )
    .run(hw.lastInsertRowid, icelandic);
  target
    .prepare('INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)')
    .run(tr.lastInsertRowid, subject);
  return Number(hw.lastInsertRowid);
}

// ─────────────────────────────────────────────────────────────────────────────
// The automaton cache (C24). It is the ONLY cached state, and its fingerprint is
// computed from rows re-read on every call — so these tests assert that no
// explicit invalidation is needed. `matches[0]` is never indexed before its
// length is asserted: a mutant must fail as an ASSERTION, not as a TypeError.
// ─────────────────────────────────────────────────────────────────────────────
describe('automaton cache stays consistent with the DB', () => {
  it('picks up a headword added after the first call, with no explicit invalidation', () => {
    const db2 = createTestDb();
    terminologyService._setTestDb(db2);
    try {
      const seg = [{ segmentId: 's', enContent: 'A catalyst works.', isContent: 'Hvati virkar.' }];
      expect(terminologyService.findTermsInSegments(seg, 'efnafraedi-2e').s.matches).toHaveLength(
        0
      );

      const hw = db2
        .prepare("INSERT INTO terminology_headwords (english, pos) VALUES ('catalyst', NULL)")
        .run();
      const tr = db2
        .prepare(
          `INSERT INTO terminology_translations
             (headword_id, icelandic, source, status, proposed_by, proposed_by_name)
           VALUES (?, 'hvati', 'fixture', 'approved', 'u1', 'F')`
        )
        .run(hw.lastInsertRowid);
      db2
        .prepare(
          "INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, 'chemistry')"
        )
        .run(tr.lastInsertRowid);

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
    const db3 = createTestDb();
    terminologyService._setTestDb(db3);
    try {
      const seg = [{ segmentId: 's', enContent: 'An aton and an atom.', isContent: '' }];
      seedOneHeadword(db3, 'atom', 'frumeind');

      const before = terminologyService.findTermsInSegments(seg, 'efnafraedi-2e').s.matches;
      expect(before).toHaveLength(1);
      expect(before[0].english).toBe('atom');

      // Same length, same row count — only the bytes change.
      db3.prepare("UPDATE terminology_headwords SET english='aton' WHERE id=1").run();

      const renamed = terminologyService.findTermsInSegments(seg, 'efnafraedi-2e').s.matches;
      expect(renamed).toHaveLength(1);
      expect(renamed[0].english).toBe('aton');
    } finally {
      terminologyService._setTestDb(db);
      db3.close();
    }
  });

  it('reflects a pure TRANSPOSITION rename, which an order-blind hash would miss', () => {
    // Guards the FNV multiply. Degrading 0x01000193 to 1 turns the hash into an
    // order-blind XOR fold: 'atom' and 'atmo' share a character multiset, so they
    // hash identically and the cache is never rebuilt. The existing atom→aton test
    // CANNOT catch that (those differ by a character, so the XOR differs too).
    //
    // ⚠️ `position` is the load-bearing assertion, not `english`. `match.english`
    // is read from the DB row on every call, so it tracks the rename even when the
    // automaton is stale; only `position` is automaton-derived. A stale automaton
    // still holding 'atom' answers 15 where a rebuilt one answers 3.
    const db4 = createTestDb();
    terminologyService._setTestDb(db4);
    try {
      //                                   atmo@3         atom@15
      const seg = [{ segmentId: 's', enContent: 'An atmo and an atom.', isContent: '' }];
      seedOneHeadword(db4, 'atom', 'frumeind');

      const before = terminologyService.findTermsInSegments(seg, 'efnafraedi-2e').s.matches;
      expect(before).toHaveLength(1);
      expect(before[0].english).toBe('atom');
      expect(before[0].position).toBe(15);

      // Pure transposition: same characters, same length, same row count.
      db4.prepare("UPDATE terminology_headwords SET english='atmo' WHERE id=1").run();

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
    const dbT = createTestDb();
    terminologyService._setTestDb(dbT);
    try {
      seedOneHeadword(dbT, 'acid rain', 'súrt regn');
      seedOneHeadword(dbT, 'acid', 'sýra');

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
    // The case that makes the class observable at all: `terms` is in-scope-first,
    // NOT longest-first, so a short in-scope term claims its span before a longer
    // fallback term is considered. The long term is then dropped despite recurring.
    const dbT = createTestDb();
    terminologyService._setTestDb(dbT);
    try {
      seedOneHeadword(dbT, 'acid rain', 'súrt regn', 'biology'); // fallback for a chemistry book
      seedOneHeadword(dbT, 'acid', 'sýra', 'chemistry'); // in-scope → ordered first

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
