/**
 * The code gate's hand-curated word lists (tools/ai-review/lexicon.js).
 *
 * ⚠️ Only CLOSED_CLASS is fail-safe by omission (a missing form makes an agreement
 * operation refuse). BARRED and ELEMENT_SYMBOLS are the opposite: a missing form lets an
 * operation through. So these tests ENUMERATE every form, paradigm by paradigm, rather
 * than sampling — a sample cannot see the one form somebody forgot.
 */
import { describe, it, expect } from 'vitest';
import {
  CLOSED_CLASS,
  BARRED,
  ELEMENT_SYMBOLS,
  isClosedClass,
  isBarred,
  isElementSymbol,
} from '../ai-review/lexicon.js';

// ── Paradigms, written out cell by cell (masc / fem / neut; sg nom acc dat gen; pl …) ──

const ARTICLE_HINN = [
  ['hinn', 'hinn', 'hinum', 'hins', 'hinir', 'hina', 'hinum', 'hinna'],
  ['hin', 'hina', 'hinni', 'hinnar', 'hinar', 'hinar', 'hinum', 'hinna'],
  ['hið', 'hið', 'hinu', 'hins', 'hin', 'hin', 'hinum', 'hinna'],
];
const DEMONSTRATIVE_SA = [
  ['sá', 'þann', 'þeim', 'þess', 'þeir', 'þá', 'þeim', 'þeirra'],
  ['sú', 'þá', 'þeirri', 'þeirrar', 'þær', 'þær', 'þeim', 'þeirra'],
  ['það', 'það', 'því', 'þess', 'þau', 'þau', 'þeim', 'þeirra'],
];
const DEMONSTRATIVE_THESSI = [
  ['þessi', 'þennan', 'þessum', 'þessa', 'þessir', 'þessa', 'þessum', 'þessara'],
  ['þessi', 'þessa', 'þessari', 'þessarar', 'þessar', 'þessar', 'þessum', 'þessara'],
  ['þetta', 'þetta', 'þessu', 'þessa', 'þessi', 'þessi', 'þessum', 'þessara'],
];
const PRONOUNS_3RD = [
  ['hann', 'hann', 'honum', 'hans'],
  ['hún', 'hana', 'henni', 'hennar'],
  ['það', 'það', 'því', 'þess'],
  ['þeir', 'þá', 'þeim', 'þeirra'],
  ['þær', 'þær', 'þeim', 'þeirra'],
  ['þau', 'þau', 'þeim', 'þeirra'],
];

const NEGATIONS = ['ekki', 'eigi', 'aldrei', 'hvorki', 'né'];
const ENGINN = [
  ['enginn', 'engan', 'engum', 'einskis', 'engir', 'enga', 'engum', 'engra'],
  ['engin', 'enga', 'engri', 'engrar', 'engar', 'engar', 'engum', 'engra'],
  ['ekkert', 'ekkert', 'engu', 'einskis', 'engin', 'engin', 'engum', 'engra'],
];
const EINN = [
  ['einn', 'einn', 'einum', 'eins', 'einir', 'eina', 'einum', 'einna'],
  ['ein', 'eina', 'einni', 'einnar', 'einar', 'einar', 'einum', 'einna'],
  ['eitt', 'eitt', 'einu', 'eins', 'ein', 'ein', 'einum', 'einna'],
];
const TVEIR = [
  ['tveir', 'tvo', 'tveimur', 'tveggja'],
  ['tvær', 'tvær', 'tveimur', 'tveggja'],
  ['tvö', 'tvö', 'tveimur', 'tveggja'],
];
const THRIR = [
  ['þrír', 'þrjá', 'þremur', 'þriggja'],
  ['þrjár', 'þrjár', 'þremur', 'þriggja'],
  ['þrjú', 'þrjú', 'þremur', 'þriggja'],
];
const FJORIR = [
  ['fjórir', 'fjóra', 'fjórum', 'fjögurra'],
  ['fjórar', 'fjórar', 'fjórum', 'fjögurra'],
  ['fjögur', 'fjögur', 'fjórum', 'fjögurra'],
];
const INDECLINABLE_CARDINALS = ['fimm', 'sex', 'sjö', 'átta', 'níu', 'tíu', 'tuttugu'];
const HUNDRAD_THUSUND_MILLJON = [
  ['hundrað', 'hundrað', 'hundraði', 'hundraðs', 'hundruð', 'hundruð', 'hundruðum', 'hundraða'],
  // þúsund declines both as a feminine (gen þúsundar) and as a neuter (dat þúsundi, gen þúsunds)
  ['þúsund', 'þúsundar', 'þúsundi', 'þúsunds', 'þúsundir', 'þúsundum', 'þúsunda'],
  ['milljón', 'milljón', 'milljón', 'milljónar', 'milljónir', 'milljónum', 'milljóna'],
];
// Ordinals 1st–10th: weak forms (fyrsti, fyrsta, fyrstu …) are what the prose uses.
const ORDINALS_WEAK = [
  ['fyrsti', 'fyrsta', 'fyrstu'],
  ['þriðji', 'þriðja', 'þriðju'],
  ['fjórði', 'fjórða', 'fjórðu'],
  ['fimmti', 'fimmta', 'fimmtu'],
  ['sjötti', 'sjötta', 'sjöttu'],
  ['sjöundi', 'sjöunda', 'sjöundu'],
  ['áttundi', 'áttunda', 'áttundu'],
  ['níundi', 'níunda', 'níundu'],
  ['tíundi', 'tíunda', 'tíundu'],
];
// annar ("second" / "other"): strong paradigm only, with its umlaut and stem alternations.
const ANNAR = [
  ['annar', 'annan', 'öðrum', 'annars', 'aðrir', 'aðra', 'öðrum', 'annarra'],
  ['önnur', 'aðra', 'annarri', 'annarrar', 'aðrar', 'aðrar', 'öðrum', 'annarra'],
  ['annað', 'annað', 'öðru', 'annars', 'önnur', 'önnur', 'öðrum', 'annarra'],
];

const ALL_118 = (
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge ' +
  'As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm ' +
  'Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U ' +
  'Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'
).split(' ');

const flat = (paradigms) => paradigms.flat();

describe('CLOSED_CLASS — the words an agreement operation may change whole', () => {
  it.each(flat(ARTICLE_HINN))('holds the free-standing article form %s', (w) => {
    expect(CLOSED_CLASS.has(w)).toBe(true);
  });
  it.each(flat(DEMONSTRATIVE_SA))('holds the demonstrative form %s (sá/sú/það)', (w) => {
    expect(CLOSED_CLASS.has(w)).toBe(true);
  });
  it.each(flat(DEMONSTRATIVE_THESSI))('holds the demonstrative form %s (þessi/þetta)', (w) => {
    expect(CLOSED_CLASS.has(w)).toBe(true);
  });
  it.each(flat(PRONOUNS_3RD))('holds the third-person pronoun form %s', (w) => {
    expect(CLOSED_CLASS.has(w)).toBe(true);
  });
  it('holds exactly the union of those paradigms — nothing else slipped in', () => {
    const expected = new Set(
      flat([...ARTICLE_HINN, ...DEMONSTRATIVE_SA, ...DEMONSTRATIVE_THESSI, ...PRONOUNS_3RD])
    );
    expect([...CLOSED_CLASS].sort()).toEqual([...expected].sort());
  });
  it('leaves out first- and second-person pronouns (no noun can force hann → þú)', () => {
    expect(
      ['ég', 'mig', 'þú', 'þig', 'við', 'þið', 'sig', 'sér'].some((w) => isClosedClass(w))
    ).toBe(false);
  });
  it('looks a sentence-initial form up case-insensitively', () => {
    expect(isClosedClass('Þessi')).toBe(true);
  });
});

describe('BARRED — negations and number words; their completeness is load-bearing', () => {
  it.each(NEGATIONS)('bars the negation %s', (w) => {
    expect(BARRED.has(w)).toBe(true);
  });
  it.each(flat(ENGINN))('bars the enginn-paradigm form %s', (w) => {
    expect(BARRED.has(w)).toBe(true);
  });
  it.each(flat(EINN))('bars the einn-paradigm form %s', (w) => {
    expect(BARRED.has(w)).toBe(true);
  });
  it.each(flat([...TVEIR, ...THRIR, ...FJORIR]))('bars the cardinal form %s (2–4)', (w) => {
    expect(BARRED.has(w)).toBe(true);
  });
  it.each(INDECLINABLE_CARDINALS)('bars the indeclinable cardinal %s', (w) => {
    expect(BARRED.has(w)).toBe(true);
  });
  it.each(flat(HUNDRAD_THUSUND_MILLJON))('bars the large-number form %s', (w) => {
    expect(BARRED.has(w)).toBe(true);
  });
  it.each(flat(ORDINALS_WEAK))('bars the ordinal form %s', (w) => {
    expect(BARRED.has(w)).toBe(true);
  });
  it.each(flat(ANNAR))('bars the annar-paradigm form %s', (w) => {
    expect(BARRED.has(w)).toBe(true);
  });
  it('bars a sentence-initial form case-insensitively', () => {
    expect(isBarred('Ekki')).toBe(true);
  });
  it('does not bar an ordinary noun (control)', () => {
    expect(isBarred('svigrúm')).toBe(false);
  });
});

describe('the two Icelandic lists', () => {
  it('share no word — a word cannot be both freely changeable and barred', () => {
    expect([...CLOSED_CLASS].filter((w) => BARRED.has(w))).toEqual([]);
  });
  it('are stored lowercase, so a lookup that lowercases cannot miss', () => {
    expect([...CLOSED_CLASS, ...BARRED].filter((w) => w !== w.toLowerCase())).toEqual([]);
  });
  it('cannot be mutated by a caller', () => {
    expect(() => BARRED.delete('ekki')).toThrow(TypeError);
  });
});

describe('ELEMENT_SYMBOLS', () => {
  it('holds all 118 symbols', () => {
    expect(ELEMENT_SYMBOLS.size).toBe(118);
  });
  it('holds exactly the periodic table, H to Og', () => {
    expect([...ELEMENT_SYMBOLS].sort()).toEqual([...ALL_118].sort());
  });
  it('matches case-sensitively: "Er" (erbium) is a symbol', () => {
    expect(isElementSymbol('Er')).toBe(true);
  });
  it('matches case-sensitively: "er" (the verb) is not (control)', () => {
    expect(isElementSymbol('er')).toBe(false);
  });
  it('documents the over-refusal of a sentence-initial "Og" (oganesson)', () => {
    expect(isElementSymbol('Og')).toBe(true);
  });
});
