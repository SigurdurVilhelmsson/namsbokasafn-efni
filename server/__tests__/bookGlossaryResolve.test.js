// server/__tests__/bookGlossaryResolve.test.js
/**
 * The book glossary layer, read by the resolver (spec 2026-11-19-book-glossary-layer-design
 * §5.2-§5.3), measured at three levels: `resolve` itself, the segment editor
 * (`findTermsInSegments`) and the glossary export (`buildResolvedGlossary`).
 *
 * One fresh migrated DB for the file, so every book is registered at its real
 * BOOK_DOMAIN_PRIORITY chain (asserted below, not assumed). Every test starts from an
 * empty concept model and an empty layer.
 *
 * The anti-goal is checked at every level: a row in efnafraedi-2e's layer must not change
 * what ANY other book resolves. efnafraedi-2e's entries are chemistry concepts, and four
 * other books carry chemistry in their chain (organic at position 1), so a book entry would
 * otherwise win or be listed there.
 *
 * Every assertion that something is ABSENT is paired with a control showing the fixture
 * produces it when the layer row is not there.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { buildScope, resolve } = require('../lib/conceptResolver');
const { addExclusion, addEntry } = require('../lib/bookGlossaryLayer');
const { buildResolvedGlossary } = require('../lib/resolvedGlossary');
const { BOOK_DOMAIN_PRIORITY } = require('../lib/domains');
const { HOUSE_STYLE_SOURCE } = require('../lib/houseStyleTerms');
const terminologyService = require('../services/terminologyService');

const CHEM = 'efnafraedi-2e';
const PHYS = 'edlisfraedi-2e';
const OTHER_BOOKS = Object.keys(BOOK_DOMAIN_PRIORITY).filter((b) => b !== CHEM);
const PROV = { reason: 'test', source: 'test', by: 'test', at: '2026-11-19T00:00:00.000Z' };

let db;

/** One concept. `en` and `is` may be a string or a list; `is` is in rank order. */
function concept(domain, en, is, collection = null) {
  const id = Number(
    db.prepare('INSERT INTO concept (domain, collection) VALUES (?, ?)').run(domain, collection)
      .lastInsertRowid
  );
  const ins = db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, ?, ?, ?, 'test')"
  );
  for (const e of [].concat(en)) ins.run(id, 'en', e, 1);
  [].concat(is).forEach((t, i) => ins.run(id, 'is', t, i + 1));
  return id;
}

const exclude = (english, conceptId = 0) =>
  addExclusion(db, { ...PROV, book: CHEM, english, conceptId });
const entry = (english, icelandic, replaces = []) =>
  addEntry(db, { ...PROV, book: CHEM, english, icelandic, replaces, confirmHouseStyle: true });
const res = (book, english) => resolve(buildScope(db, book, 0), english);
const texts = (list) => list.map((x) => x.text);
/** Everything a resolution offers an editor. */
const offered = (r) => ({
  winner: r.winner,
  tied: r.tied,
  alsoInScope: r.alsoInScope,
  outOfScope: r.outOfScope,
});
const NOTHING = { winner: null, tied: [], alsoInScope: [], outOfScope: [] };

const run = (book, ...segs) =>
  terminologyService.findTermsInSegments(
    segs.map((en, i) => ({ segmentId: `s${i}`, enContent: en, isContent: '' })),
    book,
    0
  );
const englishIn = (out, i = 0) => out[`s${i}`].matches.map((m) => m.english).sort();

const exportFor = (book, strings) =>
  buildResolvedGlossary(db, book, { census: { strings, filesRead: 1, root: 'test' } });

beforeAll(() => {
  db = freshMigratedDb().db;
  terminologyService._setTestDb(db);
});
afterAll(() => {
  terminologyService._setTestDb(null);
  db.close();
});
beforeEach(() => {
  // ⚠️ The layer tables have no foreign keys (migration 058), so an exclusion or an entry
  // row would outlive `DELETE FROM concept` and leak into the next test. Clear them first.
  db.exec('DELETE FROM book_glossary_change');
  db.exec('DELETE FROM book_glossary_exclusion');
  db.exec('DELETE FROM book_glossary_entry');
  db.exec('DELETE FROM book_term_preference');
  db.exec('DELETE FROM concept_term');
  db.exec('DELETE FROM concept');
});

describe('precondition', () => {
  it('every book is registered at its BOOK_DOMAIN_PRIORITY chain', () => {
    const chains = {};
    for (const r of db
      .prepare(
        `SELECT b.slug, p.domain FROM registered_books b
           JOIN book_domain_priority p ON p.book_id = b.id
          ORDER BY b.slug, p.position`
      )
      .all()) {
      (chains[r.slug] = chains[r.slug] || []).push(r.domain);
    }
    expect(chains).toEqual(
      Object.fromEntries(Object.entries(BOOK_DOMAIN_PRIORITY).map(([b, c]) => [b, [...c]]))
    );
  });
});

describe('resolver', () => {
  it('a whole-headword exclusion empties chemistry and leaves physics unchanged', () => {
    concept('physics', 'function', 'fall');
    expect(res(CHEM, 'function').winner.text).toBe('fall'); // control: physics@2 answers
    exclude('function');
    const chem = res(CHEM, 'function');
    expect(chem.winner).toBeNull();
    expect(chem.outOfScope.length).toBe(0);
    expect(chem.alsoInScope.length).toBe(0);
    expect(chem.bookExcluded).toBe(true);
    expect(res(PHYS, 'function').winner.text).toBe('fall');
  });

  it('nothing takes over: a biology row for the same headword is not offered', () => {
    concept('physics', 'function', 'fall');
    concept('biology', 'function', 'starfsemi');
    concept('mathematics', 'function', 'fall'); // outside chemistry's chain
    const before = res(CHEM, 'function');
    expect(texts(before.alsoInScope)).toEqual(['starfsemi']); // control
    expect(before.outOfScope.length).toBe(1); // control
    exclude('function');
    expect(offered(res(CHEM, 'function'))).toEqual(NOTHING);
  });

  it('a word exclusion also excludes its capitalised census string', () => {
    concept('physics', ['function', 'Function'], 'fall');
    expect(res(CHEM, 'Function').winner.text).toBe('fall'); // control
    exclude('function');
    const r = res(CHEM, 'Function');
    expect(r.bookExcluded).toBe(true);
    expect(offered(r)).toEqual(NOTHING);
  });

  it('SI and Si are independent', () => {
    concept('chemistry', 'Si', 'kísill');
    concept('physics', 'SI', 'SI-kerfið');
    exclude('SI');
    expect(res(CHEM, 'SI').bookExcluded).toBe(true); // control: the exclusion is live
    const si = res(CHEM, 'Si');
    expect(si.winner.text).toBe('kísill');
    expect(si.bookExcluded).toBeUndefined();
  });

  it('a single-concept exclusion lets the next row take over', () => {
    const chemId = concept('chemistry', 'substitution', 'skiptihvarf');
    concept('physics', 'substitution', 'innsetning');
    expect(res(CHEM, 'substitution').winner.text).toBe('skiptihvarf'); // control
    exclude('substitution', chemId);
    const r = res(CHEM, 'substitution');
    expect(r.winner.text).toBe('innsetning');
    expect([...texts(r.alsoInScope), ...texts(r.outOfScope)]).not.toContain('skiptihvarf');
    expect(r.bookExcluded).toBeUndefined();
    // The anti-goal: physics still lists chemistry's row (chemistry is its position 5).
    expect(texts(res(PHYS, 'substitution').alsoInScope)).toEqual(['skiptihvarf']);
  });

  it('a replacement wins and hides the replaced row', () => {
    const physicsId = concept('physics', 'geometry', 'rúmfræði');
    entry(['geometry'], 'lögun', [physicsId]);
    const r = res(CHEM, 'geometry');
    expect(r.winner.text).toBe('lögun');
    expect(r.reason).toBe('book-entry');
    expect([...texts(r.alsoInScope), ...texts(r.outOfScope)]).not.toContain('rúmfræði');
    // The anti-goal: physics keeps its own row and never sees chemistry's entry.
    const phys = res(PHYS, 'geometry');
    expect(phys.winner.text).toBe('rúmfræði');
    expect(phys.alsoInScope).toEqual([]);
  });

  it('a book entry beats a house-style concept at position 1', () => {
    concept('chemistry', 'resonance', 'herma');
    concept('chemistry', 'resonance', 'vok', HOUSE_STYLE_SOURCE);
    expect(res(CHEM, 'resonance').reason).toBe('house-style'); // control: house ends the tie
    entry(['resonance'], 'endurómun');
    const r = res(CHEM, 'resonance');
    expect(r.winner.text).toBe('endurómun');
    expect(r.reason).toBe('book-entry');
    expect(texts(r.alsoInScope).sort()).toEqual(['herma', 'vok']);
  });

  it("another book's entry is invisible", () => {
    entry(['molarity'], 'mólstyrkur');
    expect(res(CHEM, 'molarity').winner.text).toBe('mólstyrkur'); // control
    // Every other book: in-scope partition where chemistry is in the chain (organic at
    // position 1), out-of-scope partition where it is not (stjornufraedi).
    for (const book of OTHER_BOOKS) {
      expect({ book, ...offered(res(book, 'molarity')) }).toEqual({ book, ...NOTHING });
    }
  });

  it('a preference cannot bring back an excluded concept', () => {
    const chemId = concept('chemistry', 'substitution', 'skiptihvarf');
    concept('physics', 'substitution', 'innsetning');
    const termId = db
      .prepare("SELECT id FROM concept_term WHERE concept_id = ? AND lang = 'is'")
      .get(chemId).id;
    const bookId = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(CHEM).id;
    db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 0, ?, ?)'
    ).run(bookId, 'substitution', termId);
    expect(res(CHEM, 'substitution').reason).toBe('book-preference'); // control
    // The write API now refuses this exclusion (a preference protects its headword), so the
    // state is planted by SQL: the resolver must still cope with it.
    db.prepare(
      `INSERT INTO book_glossary_exclusion
         (book_id, english, match_key, concept_id, reason, source, created_by, created_at)
       VALUES (?, 'substitution', 'substitution', ?, 'test', 'test', 'test', 'test')`
    ).run(bookId, chemId);
    const r = res(CHEM, 'substitution');
    expect(r.winner.text).toBe('innsetning');
    expect(r.integrity).toContain('preference-not-a-candidate');
  });

  it('a whole-headword exclusion beside an entry of the book reports book-entry-conflict', () => {
    // The write API refuses this state (addExclusion/addEntry); it is planted by SQL here,
    // because the resolver must still report it if it happens anyway (spec §5.2).
    entry(['molarity'], 'mólstyrkur');
    const bookId = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(CHEM).id;
    db.prepare(
      `INSERT INTO book_glossary_exclusion
         (book_id, english, match_key, concept_id, reason, source, created_by, created_at)
       VALUES (?, 'molarity', 'molarity', 0, 'test', 'test', 'test', 'test')`
    ).run(bookId);
    const r = res(CHEM, 'molarity');
    expect(r.integrity).toEqual(['book-entry-conflict']);
    expect(r.bookExcluded).toBe(true);
    expect(offered(r)).toEqual(NOTHING);
  });

  it('an unscoped book is unchanged', () => {
    concept('physics', 'function', 'fall');
    exclude('function');
    expect(res('engin-slik-bok', 'function')).toStrictEqual({
      winner: null,
      reason: null,
      nominalTie: [],
      tied: [],
      outOfScope: [],
      integrity: [],
      unscoped: 'unregistered',
      alsoInScope: [],
    });
  });
});

describe('editor (findTermsInSegments)', () => {
  it('an excluded compound does not hide the head word inside it', () => {
    concept('chemistry', 'standard cell', 'staðalrafhlaða');
    // ⚠️ `cell potential` is in a FALLBACK domain on purpose. Hits tile in-scope first, then
    // longest first, and `cell potential` (14 characters) is longer than `standard cell`
    // (13): with both in scope it takes the span whether or not `standard cell` is
    // excluded, and the control below could not hold. In the fallback tier `standard cell`
    // claims the span first, so the exclusion is what hands it over.
    concept('mathematics', 'cell potential', 'kerspenna');
    const seg = 'the standard cell potential';
    expect(englishIn(run(CHEM, seg))).toEqual(['standard cell']); // control
    exclude('standard cell');
    expect(englishIn(run(CHEM, seg))).toEqual(['cell potential']);
  });

  it('a whole-headword exclusion with a fallback-tier row yields no match', () => {
    concept('mathematics', 'function', 'fall');
    const seg = 'a function of x';
    const before = run(CHEM, seg).s0.matches.map((m) => [m.english, m.isFallback, m.icelandic]);
    expect(before).toEqual([['function', true, 'fall']]); // control: the fallback is offered
    exclude('function');
    expect(englishIn(run(CHEM, seg))).toEqual([]);
  });

  it('a three-word book entry is matched and offered', () => {
    entry(['standard cell potential', 'standard cell potentials'], 'staðalíspenna');
    const out = run(CHEM, 'the standard cell potential is', 'two standard cell potentials are');
    const shape = (i) =>
      out[`s${i}`].matches.map((m) => [m.english, m.icelandic, m.isFallback, m.isPrimary]);
    expect(shape(0)).toEqual([['standard cell potential', 'staðalíspenna', false, true]]);
    expect(shape(1)).toEqual([['standard cell potentials', 'staðalíspenna', false, true]]);
  });

  it("another book's entry is invisible in the editor", () => {
    entry(['standard cell potential'], 'staðalíspenna');
    const seg = 'the standard cell potential is';
    expect(englishIn(run(CHEM, seg))).toEqual(['standard cell potential']); // control
    for (const book of OTHER_BOOKS) {
      expect({ book, matches: englishIn(run(book, seg)) }).toEqual({ book, matches: [] });
    }
  });
});

describe('export (buildResolvedGlossary)', () => {
  it('an excluded headword is absent, and stats.excludedByBook counts it', () => {
    concept('physics', 'function', 'fall');
    concept('chemistry', 'atom', 'frumeind');
    exclude('function');
    const out = exportFor(CHEM, ['atom', 'function']);
    expect(out.terms.map((t) => t.english)).toEqual(['atom']);
    expect(out.stats.excludedByBook).toBe(1);
  });

  it("a one-word entry's icelandic equals the entry", () => {
    const physicsId = concept('physics', 'geometry', 'rúmfræði');
    entry(['geometry'], 'lögun', [physicsId]);
    const t = exportFor(CHEM, ['geometry']).terms;
    expect(t.map((x) => [x.english, x.icelandic, x.reason])).toEqual([
      ['geometry', 'lögun', 'book-entry'],
    ]);
  });

  it('the same census for edlisfraedi-2e still carries the physics term (the control)', () => {
    concept('physics', 'function', 'fall');
    const physicsId = concept('physics', 'geometry', 'rúmfræði');
    exclude('function');
    entry(['geometry'], 'lögun', [physicsId]);
    entry(['molarity'], 'mólstyrkur');
    const out = exportFor(PHYS, ['function', 'geometry', 'molarity']);
    expect(out.terms.map((x) => [x.english, x.icelandic])).toEqual([
      ['function', 'fall'],
      ['geometry', 'rúmfræði'],
    ]);
    expect(out.stats.excludedByBook).toBe(0);
  });
});
