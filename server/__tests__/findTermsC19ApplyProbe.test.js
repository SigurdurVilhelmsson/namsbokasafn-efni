// server/__tests__/findTermsC19ApplyProbe.test.js
/**
 * c19 apply-script premises, measured through the CONSUMER, findTermsInSegments,
 * on a fresh migrated DB (so efnafraedi-2e's real domain chain is used:
 * chemistry > physics > biology; anything else is the fallback tier).
 *
 * Four questions the apply script's design rests on:
 *   A. overlap precedence between a compound and its head word
 *   B. inflected English forms
 *   C. headwords inside or across [[marker:...]] syntax
 *   D. the hyphen as a word boundary
 *
 * Every assertion that a match is ABSENT is paired with a control in the same
 * segment set that proves the fixture matches at all.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const terminologyService = require('../services/terminologyService');

const BOOK = 'efnafraedi-2e';
let db;

function addPair(domain, english, icelandic) {
  const id = Number(
    db.prepare('INSERT INTO concept (domain) VALUES (?)').run(domain).lastInsertRowid
  );
  const ins = db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,1,'test')"
  );
  ins.run(id, 'en', english);
  ins.run(id, 'is', icelandic);
  return id;
}
const run = (...texts) =>
  terminologyService.findTermsInSegments(
    texts.map((en, i) => ({ segmentId: `s${i}`, enContent: en, isContent: '' })),
    BOOK,
    0
  );
const englishIn = (res, i) => res[`s${i}`].matches.map((m) => m.english).sort();

beforeAll(() => {
  db = freshMigratedDb().db;
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

describe('precondition', () => {
  it('efnafraedi-2e is registered with physics and biology in scope', () => {
    addPair('physics', 'zzphys', 'a');
    addPair('biology', 'zzbio', 'b');
    addPair('mathematics', 'zzmath', 'c');
    const m = run('zzphys zzbio zzmath').s0.matches;
    const by = Object.fromEntries(m.map((x) => [x.english, x.isFallback]));
    expect(by).toEqual({ zzphys: false, zzbio: false, zzmath: true });
  });
});

describe('A. overlap: compound vs head word', () => {
  beforeEach(() => {
    addPair('physics', 'bomb', 'sprengja');
    addPair('physics', 'bomb calorimeter', 'sprengivarmamælir');
  });

  it('inside the compound, only the compound is shown', () => {
    expect(englishIn(run('A bomb calorimeter measures heat.'), 0)).toEqual(['bomb calorimeter']);
  });

  it('the head word is shown where it stands alone (control)', () => {
    expect(englishIn(run('The steel bomb sits inside the bomb calorimeter.'), 0)).toEqual([
      'bomb',
      'bomb calorimeter',
    ]);
  });

  it('only the FIRST occurrence counts: a later standalone head word is lost', () => {
    expect(englishIn(run('The bomb calorimeter holds a steel bomb.'), 0)).toEqual([
      'bomb calorimeter',
    ]);
  });

  it('an in-scope head word beats a FALLBACK compound for the span', () => {
    db.exec('DELETE FROM concept_term');
    db.exec('DELETE FROM concept');
    addPair('chemistry', 'osmosis', 'himnuflæði');
    addPair('anatomy-physiology', 'reverse osmosis', 'zzfallback');
    expect(englishIn(run('This is called reverse osmosis.'), 0)).toEqual(['osmosis']);
  });

  it('an in-scope compound beats an in-scope head word (longest first)', () => {
    db.exec('DELETE FROM concept_term');
    db.exec('DELETE FROM concept');
    addPair('chemistry', 'osmosis', 'himnuflæði');
    addPair('biology', 'reverse osmosis', 'öfugt himnuflæði');
    expect(englishIn(run('This is called reverse osmosis.'), 0)).toEqual(['reverse osmosis']);
  });
});

describe('B. inflected English forms', () => {
  beforeEach(() => addPair('chemistry', 'bond', 'tengi'));

  it('matches the exact form, any case', () => {
    const r = run('A bond forms.', 'Bond energy.');
    expect([englishIn(r, 0), englishIn(r, 1)]).toEqual([['bond'], ['bond']]);
  });

  it('does not match plural, -ed or -ing forms', () => {
    const r = run('Two bonds form.', 'Atoms bonded.', 'Bonding is strong.');
    expect([englishIn(r, 0), englishIn(r, 1), englishIn(r, 2)]).toEqual([[], [], []]);
  });
});

describe('C. markers', () => {
  it('a headword wholly inside a [[term:…|id]] body matches', () => {
    addPair('chemistry', 'standard cell potential', 'staðalíspenna');
    expect(englishIn(run('the [[term:standard cell potential|term-00005]] is'), 0)).toEqual([
      'standard cell potential',
    ]);
  });

  it('the marker NAME matches as a word ([[link:…]])', () => {
    addPair('physics', 'link', 'tengill');
    expect(englishIn(run('see [[link:https://example.org]] here'), 0)).toEqual(['link']);
  });

  it('a phrase broken by marker syntax does not match', () => {
    addPair('chemistry', 'conjugate acid-base pair', 'zzpair');
    addPair('chemistry', 'acid', 'sýra'); // control
    expect(englishIn(run('a [[i:conjugate]] acid-base pair'), 0)).toEqual(['acid']);
  });

  it('a phrase whose words are all inside one marker body matches', () => {
    addPair('chemistry', 'conjugate acid-base pair', 'zzpair');
    expect(englishIn(run('a [[i:conjugate acid-base pair]] here'), 0)).toEqual([
      'conjugate acid-base pair',
    ]);
  });
});

describe('D. hyphen', () => {
  it('a hyphen is a word boundary: base pair matches inside acid-base pair', () => {
    addPair('biology', 'base pair', 'basapar');
    expect(englishIn(run('a conjugate acid-base pair'), 0)).toEqual(['base pair']);
  });

  it('a hyphenated headword matches its own spelling', () => {
    addPair('chemistry', 'electron-pair geometry', 'zzgeo');
    expect(englishIn(run('the electron-pair geometry is'), 0)).toEqual(['electron-pair geometry']);
  });

  it('an en dash is a boundary too, but does not match a hyphen headword', () => {
    addPair('biology', 'base pair', 'basapar');
    addPair('chemistry', 'acid-base pair', 'zzab');
    expect(englishIn(run('the acid–base pair'), 0)).toEqual(['base pair']);
  });
});
