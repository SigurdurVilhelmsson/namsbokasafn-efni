/**
 * lexicon.js — the code gate's hand-curated word lists (design: docs/superpowers/specs/
 * 2026-10-26-ai-layer-scaffolding-design.md, Unit C).
 *
 * HAND-CURATED, written out paradigm by paradigm from Icelandic grammar. NO BÍN-DERIVED DATA:
 * BÍN (Beygingarlýsing íslensks nútímamáls) is CC BY-SA and tools/ is MIT, so not one form
 * here was copied, generated or checked against a BÍN export.
 *
 * ⚠️ FAIL-SAFE BY OMISSION ONLY WHERE A LIST GRANTS PERMISSION:
 *   - CLOSED_CLASS grants permission (an agreement op may change such a word whole), so a
 *     missing form only causes a refusal. That list is fail-safe.
 *   - BARRED, ELEMENT_SYMBOLS and NEGATING_PREFIXES REFUSE, so a missing form lets an
 *     operation THROUGH — e.g. a missing `annan` would let `annar` → `annan` pass as an
 *     ending change, and a missing `hvergi` let a term operation insert "nowhere" (review
 *     round 1 found it). Their completeness is load-bearing, which is why
 *     tools/__tests__/ai-review-lexicon.test.js enumerates every paradigm cell instead of
 *     sampling. Extra forms in BARRED are harmless (they refuse more), so it carries
 *     variants and homographs deliberately.
 *
 * Icelandic forms are stored lowercase; isClosedClass / isBarred lowercase their argument.
 * Element symbols are matched case-sensitively: `Er` is erbium, `er` is the verb.
 */

/** Whitespace-separated words → array (keeps each paradigm readable as one block). */
const words = (block) => block.trim().split(/\s+/);

/** A Set whose mutators throw, so no caller can widen or narrow a gate list at run time. */
function frozenSet(values) {
  const set = new Set(values);
  const refuse = () => {
    throw new TypeError('lexicon sets are read-only');
  };
  set.add = refuse;
  set.delete = refuse;
  set.clear = refuse;
  return Object.freeze(set);
}

// ── CLOSED_CLASS: what an agreement forced by a term may change whole ─────────────────────
// Each block lists the distinct forms of a paradigm, masculine line, then feminine, then
// neuter (a form already listed on an earlier line is not repeated).

const ARTICLE_HINN = words(`
  hinn hinum hins hinir hina hinna
  hin hinni hinnar hinar
  hið hinu
`);
const DEMONSTRATIVE_SA = words(`
  sá þann þeim þess þeir þá þeirra
  sú þeirri þeirrar þær
  það því þau
`);
const DEMONSTRATIVE_THESSI = words(`
  þessi þennan þessum þessa þessir þessara
  þessari þessarar þessar
  þetta þessu
`);
// Third person only: a noun's gender and number can force hann → hún → það → þeir, but no
// noun forces a change of PERSON, so ég/þú/við/þið and the reflexive sig are left out.
const PRONOUNS_3RD = words(`
  hann honum hans
  hún hana henni hennar
  það því þess
  þeir þá þeim þeirra
  þær
  þau
`);

export const CLOSED_CLASS = frozenSet([
  ...ARTICLE_HINN,
  ...DEMONSTRATIVE_SA,
  ...DEMONSTRATIVE_THESSI,
  ...PRONOUNS_3RD,
]);

// ── BARRED: negations and number words — never changed, never introduced ─────────────────

const NEGATIONS = words('ekki eigi ei aldrei aldregi hvorki né hvergi');
// hvorugur ("neither of two") negates as enginn does.
const HVORUGUR = words(`
  hvorugur hvorugan hvorugum hvorugs hvorugir hvoruga hvorugra
  hvorug hvorugri hvorugrar hvorugar
  hvorugt hvorugu
`);
const ENGINN = words(`
  enginn engan engum einskis engis engir enga engra
  engin engri engrar engar
  ekkert engu
  öngvan öngvu öngum öngva öngvir öngvar öngvum
`); // last line: colloquial/older öng- forms
const EINN = words(`
  einn einan einum eins einir eina einna
  ein einni einnar einar
  eitt einu
`);
const TVEIR = words('tveir tvo tveimur tveim tveggja tvær tvö');
const THRIR = words('þrír þrjá þremur þrem þriggja þrjár þrjú');
const FJORIR = words('fjórir fjóra fjórum fjögurra fjögra fjórar fjögur');
const CARDINALS = words(`
  fimm sex sjö átta níu tíu
  ellefu tólf þrettán fjórtán fimmtán sextán sautján átján nítján
  tuttugu þrjátíu fjörutíu fimmtíu sextíu sjötíu áttatíu níutíu
`);
const LARGE_NUMBERS = words(`
  hundrað hundraði hundraðs hundruð hundruðum hundraða
  þúsund þúsundar þúsundi þúsunds þúsundir þúsundum þúsunda
  milljón milljónar milljónir milljónum milljóna
  milljarður milljarð milljarði milljarðs milljarðar milljarða milljörðum
`);
const ORDINALS = words(`
  fyrsti fyrsta fyrstu
  fyrstur fyrst fyrstan fyrstum fyrsts fyrstir fyrstar fyrstra fyrstri fyrstrar
  þriðji þriðja þriðju
  fjórði fjórða fjórðu
  fimmti fimmta fimmtu
  sjötti sjötta sjöttu
  sjöundi sjöunda sjöundu
  áttundi áttunda áttundu
  níundi níunda níundu
  tíundi tíunda tíundu
  ellefti ellefta elleftu
  tólfti tólfta tólftu
  þrettándi þrettánda þrettándu
  fjórtándi fjórtánda fjórtándu
  fimmtándi fimmtánda fimmtándu
  sextándi sextánda sextándu
  sautjándi sautjánda sautjándu
  átjándi átjánda átjándu
  nítjándi nítjánda nítjándu
  tuttugasti tuttugasta tuttugustu
  þrítugasti þrítugasta þrítugustu
  fertugasti fertugasta fertugustu
  fimmtugasti fimmtugasta fimmtugustu
  sextugasti sextugasta sextugustu
  sjötugasti sjötugasta sjötugustu
  áttugasti áttugasta áttugustu
  nítugasti nítugasta nítugustu
  hundraðasti hundraðasta hundruðustu
  þúsundasti þúsundasta þúsundustu
`);
// Number adverbs, and the collective numerals tvennur/þrennur ("twofold"; neuter tvennt,
// þrennt "two/three things").
const NUMBER_ADVERBS = words('tvisvar þrisvar');
const COLLECTIVES = words(`
  tvennur tvennan tvennum tvenns tvennir tvenna tvennra
  tvenn tvennri tvennrar tvennar
  tvennt tvennu
  þrennur þrennan þrennum þrenns þrennir þrenna þrennra
  þrenn þrennri þrennrar þrennar
  þrennt þrennu
`);
// Count and fraction nouns: tugur ("ten"), helmingur, þriðjungur, fjórðungur.
const COUNT_NOUNS = words(`
  tugur tug tugi tugar tugir tugum tuga
  helmingur helming helmingi helmings helmingar helminga helmingum
  þriðjungur þriðjung þriðjungi þriðjungs þriðjungar þriðjunga þriðjungum
  fjórðungur fjórðung fjórðungi fjórðungs fjórðungar fjórðunga fjórðungum
`);
// annar ("second", also "other"), with its umlaut and stem alternations.
const ANNAR = words(`
  annar annan öðrum annars aðrir aðra annarra
  önnur annarri annarrar aðrar
  annað öðru
`);
// Quantity words that change a statement's number just as a numeral does.
const QUANTITY = words(`
  báðir báða báðum beggja báðar bæði
  hálfur hálf hálft hálfan hálfum hálfs hálfri hálfrar hálfu hálfir hálfa hálfar hálfra
`);

export const BARRED = frozenSet([
  ...NEGATIONS,
  ...HVORUGUR,
  ...ENGINN,
  ...EINN,
  ...TVEIR,
  ...THRIR,
  ...FJORIR,
  ...CARDINALS,
  ...LARGE_NUMBERS,
  ...ORDINALS,
  ...ANNAR,
  ...QUANTITY,
  ...NUMBER_ADVERBS,
  ...COLLECTIVES,
  ...COUNT_NOUNS,
]);

// ── NEGATING_PREFIXES: a target behind one of these, inside a word, is its opposite ─────
// `andtengisvigrúm` (antibonding) holds `tengisvigrúm` (bonding) after `and-`; `óvirkt`
// (inert) holds `virkt` (active) after `ó-`. The gate refuses a term operation whose only
// carrier of the target is such a word. REFUSES, so a missing prefix lets an operation
// through; ó- and ör- are also under the gate's 3-letter modifier floor and are listed so
// the list says what it means.

export const NEGATING_PREFIXES = frozenSet(words('ó ör and gagn mis van'));

// ── ELEMENT_SYMBOLS: all 118, matched case-sensitively ──────────────────────────────────

export const ELEMENT_SYMBOLS = frozenSet(
  words(`
    H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge
    As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm
    Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U
    Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og
  `)
);

/** @param {string} word */
export const isClosedClass = (word) => CLOSED_CLASS.has(String(word).toLowerCase());
/** @param {string} word */
export const isBarred = (word) => BARRED.has(String(word).toLowerCase());
/** @param {string} word — compared exactly: `Er` is a symbol, `er` is not */
export const isElementSymbol = (word) => ELEMENT_SYMBOLS.has(String(word));
