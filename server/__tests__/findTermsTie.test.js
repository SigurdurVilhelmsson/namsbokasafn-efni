// server/__tests__/findTermsTie.test.js
/**
 * The POSITION-TIE arm of `findTermsInSegments` — the one no test reached.
 *
 * Whole-branch adversarial review, 2026-08-11: `resolve()` returns `winner: null`
 * for three different reasons and the cut-over unioned them into one
 * `isFallback` flag, so an in-scope tie was served by the fallback path — the
 * match was DROPPED when there was nothing out-of-scope to offer, and when there
 * WAS, the panel got a term from a domain outside the book's chain while the
 * book's own tied answers appeared nowhere. `tied` was read nowhere in
 * terminologyService.js (`grep -an 'tied\|nominalTie'` → exit 1, no output).
 *
 * ⚠️ WHY A SEPARATE FILE. `tied` is thoroughly covered at the RESOLVER level
 * (conceptResolverResolve/Integrity/Mutation) and never once through
 * `findTermsInSegments`. Testing a resolver contract does not test its consumer;
 * that gap is what shipped. This file tests the consumer only.
 *
 * ⚠️ freshMigratedDb, not a hand-built schema: register §C51's lesson is that a
 * hand-built fixture tests the code while only the real migration chain tests the
 * system. Here it also buys the book registrations and domain priorities for
 * free, from the same migrations production runs.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const terminologyService = require('../services/terminologyService');

// lifraen-efnafraedi is registered by migration 029 on any fresh migrate, and
// its chain is chemistry > biology > physics (lib/domains.js).
const BOOK = 'lifraen-efnafraedi';

let db;

function addConcept(domain) {
  return Number(db.prepare('INSERT INTO concept (domain) VALUES (?)').run(domain).lastInsertRowid);
}
function addTerm(conceptId, lang, text, rank = 1) {
  return Number(
    db
      .prepare(
        "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,'test')"
      )
      .run(conceptId, lang, text, rank).lastInsertRowid
  );
}
/** One concept: an English string plus its rank-1 Icelandic head form. */
function addPair(domain, english, icelandic) {
  const id = addConcept(domain);
  addTerm(id, 'en', english);
  addTerm(id, 'is', icelandic);
  return id;
}
const seg = (en, is) => [{ segmentId: 's1', enContent: en, isContent: is }];
const matchFor = (res, english) => res.s1.matches.find((m) => m.english === english);

beforeAll(() => {
  const built = freshMigratedDb();
  db = built.db;
  terminologyService._setTestDb(db);
});

afterAll(() => {
  terminologyService._setTestDb(null);
  db.close();
});

beforeEach(() => {
  db.exec('DELETE FROM concept_term');
  db.exec('DELETE FROM concept');
});

describe('an in-scope position tie is not a fallback', () => {
  it('emits the match instead of dropping it when nothing is out of scope', () => {
    // Two chemistry concepts, same English, DIFFERENT Icelandic head forms:
    // conceptResolver step 5 returns winner:null + tied:[both].
    addPair('chemistry', 'zzqx alpha', 'zzqxeinn');
    addPair('chemistry', 'zzqx alpha', 'zzqxtveir');
    // CONTROL — a single-concept string in the same segment. If this one is
    // missing too, the fixture is broken and the tie assertion means nothing.
    addPair('chemistry', 'zzqx delta', 'zzqxfjorir');

    const res = terminologyService.findTermsInSegments(seg('zzqx alpha and zzqx delta', ''), BOOK);

    expect(matchFor(res, 'zzqx delta')).toBeTruthy(); // control
    const tie = matchFor(res, 'zzqx alpha');
    expect(tie).toBeTruthy();
    expect(tie.isTied).toBe(true);
    expect(tie.isFallback).toBe(false);
    expect(tie.isPrimary).toBe(false);
  });

  it('offers BOTH tied answers, and no single icelandic value', () => {
    addPair('chemistry', 'zzqx alpha', 'zzqxeinn');
    addPair('chemistry', 'zzqx alpha', 'zzqxtveir');

    const tie = matchFor(
      terminologyService.findTermsInSegments(seg('zzqx alpha', ''), BOOK),
      'zzqx alpha'
    );

    expect(tie.icelandic).toBeNull();
    expect(tie.translations.map((t) => t.icelandic).sort()).toEqual(['zzqxeinn', 'zzqxtveir']);
    // Every tied answer carries a real term id — the resolver's `tied` drops it
    // and the service recovers it, so this pins the recovery, not the resolver.
    expect(tie.translations.every((t) => typeof t.id === 'number')).toBe(true);
  });

  it('reports the book’s OWN domain, not an empty subjects list', () => {
    addPair('chemistry', 'zzqx alpha', 'zzqxeinn');
    addPair('chemistry', 'zzqx alpha', 'zzqxtveir');

    const tie = matchFor(
      terminologyService.findTermsInSegments(seg('zzqx alpha', ''), BOOK),
      'zzqx alpha'
    );
    expect(tie.subjects).toEqual(['chemistry']);
  });

  it('🔴 NEVER answers with an out-of-scope term while in-scope answers exist', () => {
    // The regression that made this Critical rather than cosmetic: with an
    // out-of-scope candidate present, the old union handed the panel THAT term
    // (subjects: []) and discarded both in-scope answers.
    addPair('chemistry', 'zzqx gamma', 'zzqxeinn');
    addPair('chemistry', 'zzqx gamma', 'zzqxtveir');
    addPair('mathematics', 'zzqx gamma', 'zzqxstaerdfr'); // NOT in this book's chain

    const tie = matchFor(
      terminologyService.findTermsInSegments(seg('zzqx gamma', ''), BOOK),
      'zzqx gamma'
    );

    expect(tie.isTied).toBe(true);
    expect(tie.translations.map((t) => t.icelandic)).not.toContain('zzqxstaerdfr');
    expect(tie.subjects).not.toContain('mathematics');
    expect(tie.icelandic).toBeNull();
  });

  it('a NOMINAL tie is untouched — same text on both concepts still resolves to a winner', () => {
    // The discriminator is `texts.size > 1` in resolveCandidates step 5. This is
    // the control proving the new arm keys on a real disagreement, not merely on
    // "two concepts matched".
    addPair('chemistry', 'zzqx epsilon', 'zzqxsex');
    addPair('chemistry', 'zzqx epsilon', 'zzqxsex');

    const m = matchFor(
      terminologyService.findTermsInSegments(seg('zzqx epsilon', ''), BOOK),
      'zzqx epsilon'
    );
    expect(m.isTied).toBe(false);
    expect(m.isPrimary).toBe(true);
    expect(m.icelandic).toBe('zzqxsex');
  });

  it('a genuine fallback is still a fallback — the three states stay distinct', () => {
    addPair('mathematics', 'zzqx zeta', 'zzqxstaerdfr'); // only an out-of-chain answer

    const m = matchFor(
      terminologyService.findTermsInSegments(seg('zzqx zeta', ''), BOOK),
      'zzqx zeta'
    );
    expect(m.isFallback).toBe(true);
    expect(m.isTied).toBe(false);
    expect(m.icelandic).toBe('zzqxstaerdfr');
  });
});

describe('the Icelandic-side check runs on a tie', () => {
  it('raises no issue when the editor used ONE of the tied answers', () => {
    addPair('chemistry', 'zzqx alpha', 'zzqxeinn');
    addPair('chemistry', 'zzqx alpha', 'zzqxtveir');

    const res = terminologyService.findTermsInSegments(
      seg('zzqx alpha', 'Hér er zzqxtveir í texta.'),
      BOOK
    );
    expect(res.s1.issues).toEqual([]);
  });

  it('raises a missing issue naming EVERY option when the editor used none', () => {
    addPair('chemistry', 'zzqx alpha', 'zzqxeinn');
    addPair('chemistry', 'zzqx alpha', 'zzqxtveir');

    const res = terminologyService.findTermsInSegments(
      seg('zzqx alpha', 'Hér er allt annað orð.'),
      BOOK
    );
    expect(res.s1.issues).toHaveLength(1);
    const issue = res.s1.issues[0];
    expect(issue.type).toBe('missing');
    expect(issue.options.sort()).toEqual(['zzqxeinn', 'zzqxtveir']);
    expect(issue.message).toContain('zzqxeinn');
    expect(issue.message).toContain('zzqxtveir');
    // `expected` stays a single string so existing consumers keep working.
    expect(typeof issue.expected).toBe('string');
  });

  it('stays silent when the segment has no Icelandic content at all', () => {
    addPair('chemistry', 'zzqx alpha', 'zzqxeinn');
    addPair('chemistry', 'zzqx alpha', 'zzqxtveir');

    const res = terminologyService.findTermsInSegments(seg('zzqx alpha', ''), BOOK);
    expect(res.s1.issues).toEqual([]);
  });
});

describe('tiling', () => {
  it('a tied match claims its span ahead of a fallback — item 18’s rule holds', () => {
    // "zzqx alpha beta" (tied, in scope) overlaps "alpha beta" (fallback). The
    // in-scope tie must win the span, which is what `isFallback: false` on a tie
    // buys in the hits.sort at :1556 — a tie sorted as a fallback would lose it.
    addPair('chemistry', 'zzqx alpha beta', 'zzqxeinn');
    addPair('chemistry', 'zzqx alpha beta', 'zzqxtveir');
    addPair('mathematics', 'alpha beta', 'zzqxstaerdfr');

    const res = terminologyService.findTermsInSegments(seg('zzqx alpha beta', ''), BOOK);
    expect(res.s1.matches.map((m) => m.english)).toEqual(['zzqx alpha beta']);
  });
});
