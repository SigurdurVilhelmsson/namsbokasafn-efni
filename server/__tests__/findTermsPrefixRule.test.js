// server/__tests__/findTermsPrefixRule.test.js
/**
 * §C246 — the term check accepts a word that STARTS with the term.
 *
 * Icelandic writes compounds as one word, so `Magnesíumjónin` holds
 * `magnesíum` with no right word boundary and used to warn `missing`. [USER]'s
 * five rulings of 2026-11-21 (spec
 * docs/superpowers/specs/2026-11-21-c246-term-check-prefix-rule-design.md):
 *   1. the base text may start a word; stored inflected forms stay whole-word;
 *   2. only terms of four code points or more;
 *   3. never the form `merki`;
 *   4. (A2) the winner and the tie options take the prefix, alternatives do not;
 *   5. (B3) a multi-word or hyphenated term only when its last part qualifies.
 *
 * One `it` per row of the spec's §3.4 table and the plan's Review Focus rows.
 * Rows marked RED-FIRST failed on the code before the change; every other row
 * is a control that must pass on both sides.
 *
 * ⚠️ Every row also asserts that the English headword MATCHED. A segment with
 * no English match returns `issues: []` too, so without that anchor a
 * "passes" row cannot tell the rule working from the fixture never firing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { seedBooks } = require('../scripts/lib/scratchCorpus');
const terminologyService = require('../services/terminologyService');

// Registered by seedBooks; its chain is chemistry > physics > biology.
const BOOK = 'efnafraedi-2e';

let db;

beforeEach(() => {
  ({ db } = freshMigratedDb());
  const realLog = console.log;
  console.log = () => {}; // seedBooks narrates to stdout; it is not this suite's output
  try {
    seedBooks(db);
  } finally {
    console.log = realLog;
  }
  // Migration-seeded house-style rows must not collide with a fixture's English.
  db.exec('DELETE FROM concept_term');
  db.exec('DELETE FROM concept');
  terminologyService._setTestDb(db);
});

afterEach(() => {
  terminologyService._setTestDb(null);
  db.close();
});

function addConcept(domain) {
  return Number(db.prepare('INSERT INTO concept (domain) VALUES (?)').run(domain).lastInsertRowid);
}
function addTerm(conceptId, lang, text, rank = 1, inflections = null) {
  return Number(
    db
      .prepare(
        "INSERT INTO concept_term (concept_id, lang, text, rank, source, inflections) VALUES (?,?,?,?,'test',?)"
      )
      .run(conceptId, lang, text, rank, inflections ? JSON.stringify(inflections) : null)
      .lastInsertRowid
  );
}
/** One concept: an English string plus its rank-1 Icelandic head form. */
function addPair(domain, english, icelandic, inflections = null) {
  const id = addConcept(domain);
  addTerm(id, 'en', english);
  addTerm(id, 'is', icelandic, 1, inflections);
  return id;
}
const seg = (en, is) => [{ segmentId: 's1', enContent: en, isContent: is }];
/** The segment's result: `{ matches, issues }`. */
const run = (en, is) => terminologyService.findTermsInSegments(seg(en, is), BOOK).s1;

/** The anchor: the English headword fired, so `issues` is about it. */
function expectMatched(s1, english) {
  expect(s1.matches.map((m) => m.english)).toContain(english);
}
function expectPasses(s1, english) {
  expectMatched(s1, english);
  expect(s1.issues).toEqual([]);
}
function expectMissing(s1, english, expected) {
  expectMatched(s1, english);
  expect(s1.issues).toEqual([expect.objectContaining({ type: 'missing', expected })]);
}

describe('a winner of four letters or more may start a word (ruling 1)', () => {
  it('R1 RED-FIRST: a closed compound passes (Magnesíumjónin)', () => {
    addPair('chemistry', 'magnesium', 'magnesíum');
    expectPasses(run('The magnesium ion is small.', 'Magnesíumjónin er lítil.'), 'magnesium');
  });

  it('R2 control: a hyphenated compound still passes (Magnesíum-jónin)', () => {
    addPair('chemistry', 'magnesium', 'magnesíum');
    expectPasses(run('The magnesium ion is small.', 'Magnesíum-jónin er lítil.'), 'magnesium');
  });

  it('R3 control: a stored inflected form still passes as a whole word', () => {
    addPair('chemistry', 'magnesium', 'magnesíum', ['magnesíums']);
    expectPasses(run('The mass of magnesium.', 'Massi magnesíums.'), 'magnesium');
  });

  it('R4 RED-FIRST: an unstored inflection passes because it starts with the base', () => {
    addPair('chemistry', 'magnesium', 'magnesíum');
    expectPasses(run('The mass of magnesium.', 'Massi magnesíums.'), 'magnesium');
  });

  it('RF4 RED-FIRST: an upper-case compound passes like a lower-case one', () => {
    addPair('chemistry', 'magnesium', 'magnesíum');
    expectPasses(run('The magnesium salt.', 'MAGNESÍUMKLÓRÍÐ'), 'magnesium');
  });

  it('R5 control: the symbol alone still warns (Mg)', () => {
    addPair('chemistry', 'magnesium', 'magnesíum');
    expectMissing(run('The metal magnesium is common.', 'Mg er málmur.'), 'magnesium', 'magnesíum');
  });

  it('R6 control: a different stem still warns (Magnesín)', () => {
    addPair('chemistry', 'magnesium', 'magnesíum');
    expectMissing(
      run('The metal magnesium is common.', 'Magnesín er málmur.'),
      'magnesium',
      'magnesíum'
    );
  });
});

describe('the left boundary stays (spec §3.2)', () => {
  it('R7 control: a non-official form inside a word still warns', () => {
    addPair('chemistry', 'beryllium', 'beryllíum');
    expectMissing(
      run('around the central beryllium atom', 'í kringum miðberyllínatómið'),
      'beryllium',
      'beryllíum'
    );
  });

  it('RF1 control: the term itself inside a word still warns', () => {
    addPair('chemistry', 'beryllium', 'beryllíum');
    expectMissing(
      run('around the central beryllium atom', 'í kringum miðberyllíumatómið'),
      'beryllium',
      'beryllíum'
    );
  });
});

describe('which terms qualify (rulings 2, 3 and 5)', () => {
  it('R8a control: a 3-letter term does not take the prefix (jón → Jónun)', () => {
    addPair('chemistry', 'ion', 'jón');
    expectMissing(run('The ion forms.', 'Jónun er ferli.'), 'ion', 'jón');
  });

  it('R8b control: a 3-letter term still passes as a whole word', () => {
    addPair('chemistry', 'ion', 'jón');
    expectPasses(run('The ion forms.', 'Þetta er jón.'), 'ion');
  });

  it('R9 control: merki is excluded (Merkingin)', () => {
    addPair('chemistry', 'label', 'merki');
    expectMissing(run('The label is visible.', 'Merkingin sést.'), 'label', 'merki');
  });

  it('R11 RED-FIRST: a hyphenated term whose last part has 4 letters takes it', () => {
    addPair('chemistry', 'Lewis structure', 'Lewis-mynd');
    expectPasses(
      run('The Lewis structure shows it.', 'Lewis-myndin sýnir það.'),
      'Lewis structure'
    );
  });

  it('R12 control: a multi-word term whose last part has 3 letters does not', () => {
    addPair('chemistry', 'antacid', 'sýrubindandi lyf');
    expectMissing(
      run('the antacid works', 'sýrubindandi lyfið virkar'),
      'antacid',
      'sýrubindandi lyf'
    );
  });

  it('R13 control: a term ending in a hyphen never takes it (upphafs-)', () => {
    addPair('chemistry', 'initial pH', 'upphafs-');
    expectMissing(run('The initial pH is 7.', 'Upphafs-pH er 7.'), 'initial pH', 'upphafs-');
  });

  it('RF3 control: a qualifying term with regex metacharacters matches its literal text', () => {
    addPair('chemistry', 'mole unit', 'eining (mól)');
    expectPasses(run('One mole unit here.', 'Ein eining (mól) hér.'), 'mole unit');
  });
});

describe('stored inflected forms stay whole-word (ruling 1)', () => {
  it('RF2 control: a stored form starting a compound still warns (sýru → Sýrustig)', () => {
    addPair('chemistry', 'acid', 'sýra', ['sýru', 'sýrur']);
    expectMissing(
      run('The acid strength of the solution.', 'Sýrustig lausnarinnar.'),
      'acid',
      'sýra'
    );
  });

  // Register §C247 (3): R3's `magnesíums` also starts with the base, so R3 passes whether or not
  // the prefix shape keeps the stored forms. Here the stored form does NOT start with the base
  // (`sýru` against `sýra`), so only the stored-form branch can pass it.
  it('R3b control: under the prefix, a stored form that does not start with the base still passes (sýru)', () => {
    addPair('chemistry', 'acid', 'sýra', ['sýru', 'sýrur']);
    expectPasses(run('The strength of the acid.', 'Styrkur sýru.'), 'acid');
  });
});

describe('ties take the prefix, each option on its own text (A2, call 6)', () => {
  it('T1 RED-FIRST: a tie option that starts a word passes (formerki → Formerkisins)', () => {
    addPair('chemistry', 'sign', 'formerki');
    addPair('chemistry', 'sign', 'tákn');
    expectPasses(run('The sign matters.', 'Formerkisins gætir.'), 'sign');
  });

  it('T2 control: the excluded form stays excluded inside a tie (merki → Merkingin)', () => {
    addPair('chemistry', 'sign', 'merki');
    addPair('chemistry', 'sign', 'formerki');
    const s1 = run('The sign is visible.', 'Merkingin sést.');
    expectMatched(s1, 'sign');
    expect(s1.issues).toEqual([expect.objectContaining({ type: 'missing' })]);
    // Exact, not arrayContaining (register §C247 (3)): a grown option list must fail.
    expect([...s1.issues[0].options].sort()).toEqual(['formerki', 'merki']);
  });
});

describe('alternatives stay whole-word (A2)', () => {
  it('A0 fixture control: a whole-word cross-concept alternative is still named', () => {
    addPair('chemistry', 'valence', 'gildistala');
    addPair('physics', 'valence', 'gildi');
    const s1 = run('The valence of the atom.', 'Gildi frumeindarinnar.');
    expectMatched(s1, 'valence');
    expect(s1.issues).toEqual([
      expect.objectContaining({ type: 'alternative', expected: 'gildistala', used: 'gildi' }),
    ]);
  });

  it('A1 control: a cross-concept alternative starting a word stays missing', () => {
    addPair('chemistry', 'valence', 'gildistala');
    addPair('physics', 'valence', 'gildi');
    expectMissing(
      run('The valence shell is full.', 'Gildishvolfið er fullt.'),
      'valence',
      'gildistala'
    );
  });

  it('RF5 control: an intra-concept sibling starting a word stays missing', () => {
    const id = addConcept('chemistry');
    addTerm(id, 'en', 'atom');
    addTerm(id, 'is', 'frumeind', 1);
    addTerm(id, 'is', 'atóm', 2);
    expectMissing(run('The atom mass is measured.', 'Atómmassi er mældur.'), 'atom', 'frumeind');
  });
});
