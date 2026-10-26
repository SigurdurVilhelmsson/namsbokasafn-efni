/**
 * The code gate (tools/ai-review/gate.js): every check has a refusing case and a passing
 * control beside it.
 *
 * Segment text is copied byte for byte from the committed chemistry corpus
 * (books/efnafraedi-2e/02-mt-output for IS, 02-for-mt for EN); the segment id is given beside
 * each. Rulings are in the shape Unit B compiles. Those marked REAL carry a target from the
 * 2026-10-11 ruling set; those marked HYPOTHETICAL are invented for the test and say nothing
 * about what the book should use. Two fixtures are SYNTHETIC and say so: no real segment
 * reaches those two mechanisms.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  gateSegment,
  gateOccurrences,
  forbiddenTokenReasons,
  DEFAULT_LIMITS,
  REJECTION_CODES,
} from '../ai-review/gate.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RULING_SET_2026_10_11 =
  'experiments/terminology-consistency/results/2026-10-11/ruling-set-after-stage1.json';

// ── Rulings ──────────────────────────────────────────────────────────────────────────────

const ruling = (o) => ({
  competitors: [],
  scope: { kind: 'book' },
  scopeStatus: 'default',
  kinds: ['entry'],
  sources: ['test'],
  matchable: true,
  ...o,
});

const CELL_CH17 = { kind: 'chapters', chapters: ['ch17'] };

const RULINGS = {
  // REAL
  'bonding-orbital': ruling({
    id: 'bonding-orbital',
    enNorm: 'bonding orbital',
    en: ['bonding orbital'],
    is: 'tengisvigrúm',
    competitors: ['bindandi svigrúm'],
  }),
  node: ruling({ id: 'node', enNorm: 'node', en: ['node'], is: 'nóða' }),
  hybridization: ruling({
    id: 'hybridization',
    enNorm: 'hybridization',
    en: ['hybridization'],
    is: 'svigrúmablöndun',
  }),
  // REAL target and scope as Unit B carries it on 2026-10-26: a PROPOSED width.
  cell: ruling({
    id: 'cell',
    enNorm: 'cell',
    en: ['cell'],
    is: 'ker',
    scope: CELL_CH17,
    scopeStatus: 'proposed',
  }),
  // The same ruling as if [USER] had ruled the width, and as if it had stayed book-wide.
  'cell-ruled': ruling({
    id: 'cell-ruled',
    enNorm: 'cell',
    en: ['cell'],
    is: 'ker',
    scope: CELL_CH17,
    scopeStatus: 'ruled',
  }),
  'cell-book': ruling({ id: 'cell-book', enNorm: 'cell', en: ['cell'], is: 'ker' }),
  'cell-not-ch17': ruling({
    id: 'cell-not-ch17',
    enNorm: 'cell',
    en: ['cell'],
    is: 'ker',
    scope: { kind: 'exclude', chapters: ['ch17'] },
    scopeStatus: 'ruled',
  }),
  'sp3-hybrid-orbital': ruling({
    id: 'sp3-hybrid-orbital',
    enNorm: 'sp3 hybrid orbital',
    en: ['sp3 hybrid orbital'],
    is: 'sp3-blendingssvigrúm',
    matchable: false,
    unmatchableReason: 'digit in target',
  }),
  'held-bonding': ruling({
    id: 'held-bonding',
    enNorm: 'bonding orbital',
    en: ['bonding orbital'],
    is: 'tengisvigrúm',
    kinds: ['entry', 'held'],
  }),
  'no-target': ruling({
    id: 'no-target',
    enNorm: 'bonding orbital',
    en: ['bonding orbital'],
    is: '',
  }),
  // HYPOTHETICAL two-word target for the same headword, to exercise multi-word matching
  'bonding-orbital-2w': ruling({
    id: 'bonding-orbital-2w',
    enNorm: 'bonding orbital',
    en: ['bonding orbital'],
    is: 'tengt svigrúm',
  }),
  // HYPOTHETICAL
  simulator: ruling({ id: 'simulator', enNorm: 'simulator', en: ['simulator'], is: 'hermilíkan' }),
  density: ruling({ id: 'density', enNorm: 'density', en: ['density'], is: 'eðlismassi' }),
  dissolution: ruling({
    id: 'dissolution',
    enNorm: 'dissolution',
    en: ['dissolution'],
    is: 'leysing',
  }),
  current: ruling({ id: 'current', enNorm: 'current', en: ['current'], is: 'rafstraumur' }),
  equivalent: ruling({
    id: 'equivalent',
    enNorm: 'equivalent',
    en: ['equivalent'],
    is: 'samgildur',
  }),
  'antibonding-orbital': ruling({
    id: 'antibonding-orbital',
    enNorm: 'antibonding orbital',
    en: ['antibonding orbital'],
    is: 'andtengisvigrúm',
  }),
  atom: ruling({ id: 'atom', enNorm: 'atom', en: ['atom'], is: 'frumeind' }),
  'valence-bond-theory': ruling({
    id: 'valence-bond-theory',
    enNorm: 'valence bond theory',
    en: ['valence bond theory'],
    is: 'gildistengjakenning',
  }),
  'cell-potential': ruling({
    id: 'cell-potential',
    enNorm: 'cell potential',
    en: ['cell potential'],
    is: 'frumuspenna',
  }),
  thermodynamics: ruling({
    id: 'thermodynamics',
    enNorm: 'thermodynamics',
    en: ['thermodynamics'],
    is: 'varmafræði',
  }),
  acid: ruling({ id: 'acid', enNorm: 'acid', en: ['acid'], is: 'sýra' }),
};

// ── Segments (REAL unless marked) ─────────────────────────────────────────────────────

// m68745:solution:fs-idp23920752 (ch08)
const BOND_EN =
  'Hybridization is introduced to explain the geometry of bonding orbitals in valence bond theory.';
const BOND_IS =
  'Svigrúmablöndun er kynnt til sögunnar til að útskýra rúmfræði bindandi svigrúma í gildistengjakenningunni.';
// m68745:title:fs-idm76169824-title (ch08)
const SP3TITLE_EN = '[[i:sp]][[sup:3]] Hybridization';
const SP3TITLE_IS = '[[i:sp]][[sup:3]]-svigrúmablöndun';
// m68745:caption:CNX_Chem_08_02_sp3Geom-caption (ch08)
const SP3_EN =
  'The hybridization of an [[i:s]] orbital (blue) and three [[i:p]] orbitals (red) produces four equivalent [[i:sp]][[sup:3]] hybridized orbitals (yellow) oriented at 109.5° with respect to each other.';
const SP3_IS =
  'Svigrúmablöndun eins [[i:s]]-svigrúms (blátt) og þriggja [[i:p]]-svigrúma (rauð) myndar fjögur jafngild [[i:sp]][[sup:3]]-blendingssvigrúm (gul) sem snúa með 109,5° horni hvert að öðru.';
// m68747:para:fs-idm99049568 (ch08) — duplicated id; the two IS occurrences differ in wording
const DUP_EN =
  'The orbital is located along the internuclear axis, so it is a σ orbital. There is a node bisecting the internuclear axis, so it is an antibonding orbital.[[BR]]';
const DUP_IS0 =
  'Svigrúmið er staðsett meðfram ásnum milli kjarnanna, svo það er σ-svigrúm. Það er hnútur sem sker ásinn milli kjarnanna í tvennt, svo það er andbindandi svigrúm.[[BR]]';
const DUP_IS1 =
  'Svigrúmið er staðsett meðfram ásnum milli kjarnanna, þannig að það er σ-svigrúm. Það er hnútyfirborð sem sker ásinn milli kjarnanna í tvennt, þannig að það er andbindandi svigrúm.[[BR]]';
// m68825:caption:CNX_Chem_17_05_AlkalineBat-caption (ch17)
const DRYCELL_EN =
  'Alkaline batteries were designed as improved replacements for zinc-carbon (dry cell) batteries.';
const DRYCELL_IS =
  'Alkalínrafhlöður voru hannaðar sem endurbættar útgáfur af sink-kolefnisrafhlöðum (þurrrafhlöðum).';
// m68662:para:pref-p-015 (ch00) — "cell phones": the homograph a chapter scope exists to stop
const PHONES_EN =
  '[[b:Chemistry in Everyday Life]] ties chemistry concepts to everyday issues and real-world applications of science that students encounter in their lives. Topics include cell phones, solar thermal energy power plants, plastics recycling, and measuring blood pressure.';
const PHONES_IS =
  '[[b:Efnafræði í daglegu lífi]] tengir efnafræðihugtök við hversdagsleg málefni og raunverulega notkun vísinda sem nemendur lenda í í lífi sínu. Meðal efnisatriða eru farsímar, sólarvarmaorkuver, endurvinnsla plasts og mæling blóðþrýstings.';
// m68824:para:fs-idm242158160 (ch17) — the only "cell" is inside a sub payload
const ECELL_EN =
  'Combining a previously derived relation between ΔG° and K (see the chapter on thermodynamics) and the equation above relating ΔG° and [[i:E]]°[[sub:cell]] yields the following:';
const ECELL_IS =
  'Með því að sameina áður afleidda jöfnu milli ΔG° og K (sjá kaflann um varmafræði) og jöfnuna hér að ofan sem tengir ΔG° og [[i:E]]°[[sub:cell]] fæst eftirfarandi:';
// m68822:glossary-term:fs-idm153779040-term (ch17)
const CELLPOT_EN = 'cell potential ([[i:E]][[sub:cell]])';
const CELLPOT_IS = 'kerspenna ([[i:E]][[sub:ker]])';
// m68822:solution:fs-idm201827808 (ch17) — a negation next to the term
const CURRENT_EN =
  'Without the salt bridge, the circuit would be open (or broken) and no current could flow. With a salt bridge, each half-cell remains electrically neutral and current can flow through the circuit.';
const CURRENT_IS =
  'Án saltbrúarinnar væri rásin opin (eða rofin) og enginn straumur gæti flætt. Með saltbrú helst hvort hálfker rafhlutlaust og straumur getur flætt um rásina.';
// m68674:para:fs-idm108028240 (ch01) — the term sits in a link label
const LINK_EN =
  'To learn more about the relationship between mass, volume, and density, use this [[link:interactive simulator|http://openstax.org/l/16phetmasvolden]] to explore the density of different materials.';
const LINK_IS =
  'Til að læra meira um sambandið milli massa, rúmmáls og eðlismassa skaltu nota þennan [[link:gagnvirka hermi|http://openstax.org/l/16phetmasvolden]] til að kanna eðlismassa mismunandi efna.';
// m68811:problem:fs-idp13178560 (ch15)
const HANDBOOK_EN =
  'The [[i:[[link:Handbook of Chemistry and Physics|http://openstax.org/l/16Handbook]]]] gives solubilities of the following compounds in grams per 100 mL of water. Because these compounds are only slightly soluble, assume that the volume does not change on dissolution and calculate the solubility product for each.';
const HANDBOOK_IS =
  '[[i:[[link:Handbook of Chemistry and Physics|http://openstax.org/l/16Handbook]]]] gefur upp leysni eftirfarandi efnasambanda í grömmum á 100 ml af vatni. Þar sem þessi efnasambönd eru aðeins örlítið leysanleg, gerðu ráð fyrir að rúmmálið breytist ekki við upplausn og reiknaðu leysnimargfeldið fyrir hvert þeirra.';
// m68685:item:fs-idp28280144-item-1 (ch02) — the term sits in a term label
const TERM_EN =
  'Matter is composed of exceedingly small particles called atoms. An [[term:atom|term-00002]] is the smallest unit of an element that can participate in a chemical change.';
const TERM_IS =
  'Efni er samsett úr afar smáum ögnum sem kallast atóm. [[term:Atóm|term-00002]] er minnsta eining frumefnis sem getur tekið þátt í efnabreytingu.';
// m68744:title:auto-1 (ch08) — a short segment the term replaces whole
const TITLE_EN = 'Valence Bond Theory';
const TITLE_IS = 'Kenning um gildistengi';
// m68798:para:fs-idp17381824 (ch13)
const CONC_EN =
  'When 0.10 mol NO[[sub:2]] is added to a 1.0-L flask at 25 °C, the concentration changes so that at equilibrium, [NO[[sub:2]]] = 0.016 [[i:M]] and [N[[sub:2]]O[[sub:4]]] = 0.042 [[i:M]].';
const CONC_IS =
  'Þegar 0,10 mól af NO[[sub:2]] er bætt í 1,0 L flösku við 25 °C breytist styrkurinn þannig að við jafnvægi er [NO[[sub:2]]] = 0,016 [[i:M]] og [N[[sub:2]]O[[sub:4]]] = 0,042 [[i:M]].';
// m68860:para:fs-idp139858976 (appendices)
const MATH_EN = 'Add 5.00 [[MATH:1]] 10[[sup:−5]] and 3.00 [[MATH:2]] 10[[sup:−3]].';
const MATH_IS = 'Leggið saman 5,00 [[MATH:1]] 10[[sup:−5]] og 3,00 [[MATH:2]] 10[[sup:−3]].';
// m68690:para:fs-idm262013360 (ch01)
const DOCREF_EN =
  'The leading zeros in this example are not significant. We could use exponential notation (as described in [[docref:Appendix B|m68860]]) and express the number as 8.32407 [[MATH:1]] 10[[sup:−3]]; then the number 8.32407 contains all of the significant figures, and 10[[sup:−3]] locates the decimal point.';
const DOCREF_IS =
  'Núllin á undan í þessu dæmi eru ekki markverð. Við gætum notað veldisvísanotkun (eins og lýst er í [[docref:viðauka B|m68860]]) og sett töluna fram sem 8,32407 [[MATH:1]] 10[[sup:−3]]; þá inniheldur talan 8,32407 alla markverðu stafina og 10[[sup:−3]] staðsetur kommuna.';
// m68866:entry:auto-12 (appendices)
const EM_EN = '[[em:H[[sub:3]]|emphasis-one]]AsO[[sub:4]]';

// ── Helpers ──────────────────────────────────────────────────────────────────────────────

const emitted = new Set();
const record = (result) => {
  for (const r of result.rejected) for (const c of r.reasons) emitted.add(c);
  return result;
};
const gate = (args) => record(gateSegment({ chapterDir: 'ch08', rulingsById: RULINGS, ...args }));
const gateAll = (args) => {
  const result = gateOccurrences({ chapterDir: 'ch08', rulingsById: RULINGS, ...args });
  result.occurrences.forEach(record);
  return result;
};
const term = (opId, rulingId, find, replace) => ({
  opId,
  category: 'term',
  rulingId,
  find,
  replace,
  reason: 'test',
});
const agr = (opId, rulingId, find, replace) => ({
  opId,
  category: 'agreement',
  rulingId,
  find,
  replace,
  reason: 'test',
});
const ids = (result) => result.accepted.map((o) => o.opId);
const reasonsOf = (result, opId) => {
  const hit = result.rejected.find((r) => r.op?.opId === opId);
  return hit ? hit.reasons : [];
};

const T_BOND = term('t1', 'bonding-orbital', 'bindandi svigrúma', 'tengisvigrúma');
const T_SIM = term('s1', 'simulator', 'hermi', 'hermilíkan');

// ── Pinned values ──────────────────────────────────────────────────────────────────────

describe('pinned values', () => {
  it('DEFAULT_LIMITS', () => {
    expect(DEFAULT_LIMITS).toEqual({
      maxFindChars: 72,
      maxReplaceChars: 72,
      maxFindWords: 8,
      maxReplaceWords: 8,
      maxAcceptedOpsPerSegment: 6,
      maxChangedShare: 0.5,
      changedShareFloorChars: 72,
      agreementWindowWords: 4,
      agreementMinStemLetters: 3,
    });
  });
  it('DEFAULT_LIMITS cannot be mutated', () => {
    expect(Object.isFrozen(DEFAULT_LIMITS)).toBe(true);
  });
  it('REJECTION_CODES is the closed, sorted set', () => {
    expect(REJECTION_CODES).toEqual([
      'agreement-too-far',
      'agreement-without-term',
      'agreement-word-changed',
      'agreement-word-count',
      'barred-word',
      'duplicate-divergent',
      'duplicate-op-id',
      'element-symbol',
      'en-headword-absent',
      'find-ambiguous',
      'find-not-editable',
      'find-not-found',
      'find-not-word-aligned',
      'forbidden-control',
      'forbidden-digit',
      'forbidden-greek',
      'forbidden-invisible',
      'forbidden-markup',
      'forbidden-operator',
      'forbidden-space',
      'inner-capital',
      'marker-multiset-changed',
      'no-change',
      'not-nfc',
      'op-invalid',
      'op-too-large',
      'overlaps-accepted-op',
      'ruling-held',
      'ruling-invalid',
      'ruling-unknown',
      'ruling-unmatchable',
      'scope-excluded',
      'scope-invalid',
      'scope-unruled',
      'segment-change-share',
      'segment-malformed',
      'segment-op-limit',
      'term-target-already',
      'term-target-missing',
    ]);
  });
  it('REJECTION_CODES cannot be mutated', () => {
    expect(Object.isFrozen(REJECTION_CODES)).toBe(true);
  });
});

// ── The passing control every refusal below is measured against ──────────────────────

describe('a ruled term operation (the control)', () => {
  const result = gate({ ops: [T_BOND], en: BOND_EN, is: BOND_IS });
  it('is accepted', () => {
    expect(ids(result)).toEqual(['t1']);
  });
  it('is applied', () => {
    expect(result.after).toBe(
      'Svigrúmablöndun er kynnt til sögunnar til að útskýra rúmfræði tengisvigrúma í gildistengjakenningunni.'
    );
  });
  it('rejects nothing', () => {
    expect(result.rejected).toEqual([]);
  });
  it('accepts a Map of rulings the same way (Unit B returns byId as a Map)', () => {
    const viaMap = gateSegment({
      ops: [T_BOND],
      en: BOND_EN,
      is: BOND_IS,
      chapterDir: 'ch08',
      rulingsById: new Map(Object.entries(RULINGS)),
    });
    expect(viaMap.after).toBe(result.after);
  });
});

describe('op shape', () => {
  it('refuses an unknown category (op-invalid)', () => {
    const r = gate({ ops: [{ ...T_BOND, category: 'rewrite' }], en: BOND_EN, is: BOND_IS });
    expect(r.rejected[0].reasons).toEqual(['op-invalid']);
  });
  it('refuses an empty find (op-invalid)', () => {
    const r = gate({ ops: [{ ...T_BOND, find: '' }], en: BOND_EN, is: BOND_IS });
    expect(r.rejected[0].reasons).toEqual(['op-invalid']);
  });
  it('refuses a non-object op (op-invalid)', () => {
    const r = gate({ ops: [null], en: BOND_EN, is: BOND_IS });
    expect(r.rejected[0].reasons).toEqual(['op-invalid']);
  });
  it('refuses both of two ops sharing an opId (duplicate-op-id)', () => {
    const r = gate({ ops: [T_BOND, { ...T_BOND }], en: BOND_EN, is: BOND_IS });
    expect(r.rejected.map((x) => x.reasons)).toEqual([['duplicate-op-id'], ['duplicate-op-id']]);
  });
});

describe('boundary inputs', () => {
  it('throws on a chapter token that is not chNN/appendices', () => {
    expect(() => gate({ ops: [T_BOND], en: BOND_EN, is: BOND_IS, chapterDir: 'ch8' })).toThrow(
      TypeError
    );
  });
  it('throws when the IS text is not a string', () => {
    expect(() => gate({ ops: [T_BOND], en: BOND_EN, is: undefined })).toThrow(TypeError);
  });
  it('throws on an unknown limit key (a misspelt override must not be a silent no-op)', () => {
    expect(() => gate({ ops: [T_BOND], en: BOND_EN, is: BOND_IS, limits: { maxOps: 1 } })).toThrow(
      TypeError
    );
  });
  it('throws on a limit that is not a non-negative number', () => {
    expect(() =>
      gate({ ops: [T_BOND], en: BOND_EN, is: BOND_IS, limits: { maxFindChars: -1 } })
    ).toThrow(TypeError);
  });
  it('refuses every op on a segment with a malformed marker (segment-malformed)', () => {
    const r = gate({ ops: [T_BOND], en: BOND_EN, is: `${BOND_IS} [[i:abc` });
    expect(r.rejected[0].reasons).toEqual(['segment-malformed']);
  });
  it('refuses every op on the corpus segment carrying an MT-invented `[[test tube:…]]`', () => {
    // m68832:alt:fs-idm121503472-alt (ch18), excerpt: the only malformed segment the corpus
    // holds (tools/__tests__/ai-review-tokens-corpus.test.js pins it).
    const r = gate({
      ops: [term('tt', 'test-tube', 'efnasamband', 'efnasambandið')],
      en: 'Photo a shows a test tube that contains a solid yellow compound.',
      is: 'Ljósmynd a sýnir [[test tube:tilraunaglas]] sem inniheldur fast gult efnasamband.',
      chapterDir: 'ch18',
    });
    expect(r.rejected[0].reasons).toEqual(['segment-malformed']);
  });
  it('refuses every op when the ENGLISH has a malformed marker (segment-malformed)', () => {
    const r = gate({ ops: [T_BOND], en: `${BOND_EN} [[sub:cell`, is: BOND_IS });
    expect(r.rejected[0].reasons).toEqual(['segment-malformed']);
  });
  it('leaves the text untouched when it refuses', () => {
    const r = gate({ ops: [T_BOND], en: BOND_EN, is: `${BOND_IS} [[i:abc` });
    expect(r.after).toBe(`${BOND_IS} [[i:abc`);
  });
});

describe('the ruling', () => {
  it('must exist (ruling-unknown)', () => {
    const r = gate({ ops: [{ ...T_BOND, rulingId: 'no-such-ruling' }], en: BOND_EN, is: BOND_IS });
    expect(r.rejected[0].reasons).toEqual(['ruling-unknown']);
  });
  it('must not be an inherited object key (ruling-unknown)', () => {
    const r = gate({ ops: [{ ...T_BOND, rulingId: 'constructor' }], en: BOND_EN, is: BOND_IS });
    expect(r.rejected[0].reasons).toEqual(['ruling-unknown']);
  });
  it('must be matchable (ruling-unmatchable)', () => {
    const r = gate({
      ops: [{ ...T_BOND, rulingId: 'sp3-hybrid-orbital' }],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(r.rejected[0].reasons).toContain('ruling-unmatchable');
  });
  it('must not be held (ruling-held)', () => {
    const r = gate({ ops: [{ ...T_BOND, rulingId: 'held-bonding' }], en: BOND_EN, is: BOND_IS });
    expect(r.rejected[0].reasons).toEqual(['ruling-held']);
  });
  it('must carry a target (ruling-invalid)', () => {
    const r = gate({ ops: [{ ...T_BOND, rulingId: 'no-target' }], en: BOND_EN, is: BOND_IS });
    expect(r.rejected[0].reasons).toContain('ruling-invalid');
  });
});

describe('scope and its status', () => {
  const OP = term('c1', 'cell', 'þurrrafhlöðum', 'þurrkerjum');
  const ch17 = { en: DRYCELL_EN, is: DRYCELL_IS, chapterDir: 'ch17' };
  it('a PROPOSED width admits nothing, even in its own chapter (scope-unruled)', () => {
    expect(gate({ ops: [OP], ...ch17 }).rejected[0].reasons).toEqual(['scope-unruled']);
  });
  it('the same width once RULED admits its chapter (control)', () => {
    expect(ids(gate({ ops: [{ ...OP, rulingId: 'cell-ruled' }], ...ch17 }))).toEqual(['c1']);
  });
  it('a ruled ch17 width refuses the "cell phones" homograph in the preface (scope-excluded)', () => {
    const r = gate({
      ops: [term('c2', 'cell-ruled', 'farsímar', 'farker')],
      en: PHONES_EN,
      is: PHONES_IS,
      chapterDir: 'ch00',
    });
    expect(r.rejected[0].reasons).toEqual(['scope-excluded']);
  });
  it('a book-wide width lets that homograph through — scope is the only thing stopping it', () => {
    const r = gate({
      ops: [term('c2', 'cell-book', 'farsímar', 'farker')],
      en: PHONES_EN,
      is: PHONES_IS,
      chapterDir: 'ch00',
    });
    expect(ids(r)).toEqual(['c2']);
  });
  it('an exclude width refuses its listed chapter (scope-excluded)', () => {
    const r = gate({ ops: [{ ...OP, rulingId: 'cell-not-ch17' }], ...ch17 });
    expect(r.rejected[0].reasons).toEqual(['scope-excluded']);
  });
});

describe('the English carries the headword in VISIBLE prose', () => {
  it('refuses when the only "cell" is inside a sub payload (en-headword-absent)', () => {
    const r = gate({
      ops: [term('e1', 'cell-ruled', 'jöfnuna', 'kerið')],
      en: ECELL_EN,
      is: ECELL_IS,
      chapterDir: 'ch17',
    });
    expect(r.rejected[0].reasons).toEqual(['en-headword-absent']);
  });
  it('refuses "bonding orbital" against an English "antibonding orbital" (en-headword-absent)', () => {
    const r = gate({
      ops: [term('a1', 'bonding-orbital', 'andbindandi svigrúm', 'andtengisvigrúm')],
      en: DUP_EN,
      is: DUP_IS0,
    });
    expect(r.rejected[0].reasons).toContain('en-headword-absent');
  });
  it('accepts when the headword is in prose beside a sub payload (control)', () => {
    const r = gate({
      ops: [term('e2', 'cell-potential', 'kerspenna', 'frumuspenna')],
      en: CELLPOT_EN,
      is: CELLPOT_IS,
      chapterDir: 'ch17',
    });
    expect(ids(r)).toEqual(['e2']);
  });
});

describe('find occurs exactly once', () => {
  it('refuses a find that is not there (find-not-found)', () => {
    const r = gate({
      ops: [term('f1', 'bonding-orbital', 'bindandi svigrúmum', 'tengisvigrúmum')],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(r.rejected[0].reasons).toEqual(['find-not-found']);
  });
  it('refuses a find that occurs twice — once in prose, once in a sub (find-ambiguous)', () => {
    const r = gate({
      ops: [term('f2', 'cell-potential', 'ker', 'frumuspenna')],
      en: CELLPOT_EN,
      is: CELLPOT_IS,
      chapterDir: 'ch17',
    });
    expect(r.rejected[0].reasons).toEqual(['find-ambiguous']);
  });
});

describe('find lies wholly inside one editable span', () => {
  it('refuses a find inside a link URL tail (find-not-editable)', () => {
    const r = gate({
      ops: [term('u1', 'simulator', 'openstax', 'hermilíkan')],
      en: LINK_EN,
      is: LINK_IS,
      chapterDir: 'ch01',
    });
    expect(r.rejected[0].reasons).toEqual(['find-not-editable']);
  });
  it('refuses a find inside a sub payload (find-not-editable)', () => {
    const r = gate({
      ops: [term('u3', 'thermodynamics', 'cell', 'varmafræði')],
      en: ECELL_EN,
      is: ECELL_IS,
      chapterDir: 'ch17',
    });
    expect(r.rejected[0].reasons).toContain('find-not-editable');
  });
  it('refuses a find inside the variable `sp` of [[i:sp]][[sup:3]] (find-not-editable)', () => {
    const r = gate({
      ops: [term('u4', 'hybridization', 'sp', 'svigrúmablöndun')],
      en: SP3_EN,
      is: SP3_IS,
    });
    expect(r.rejected[0].reasons).toEqual(['find-not-editable']);
  });
  it('accepts a find inside a link label (control)', () => {
    const r = gate({ ops: [T_SIM], en: LINK_EN, is: LINK_IS, chapterDir: 'ch01' });
    expect(r.after).toBe(
      'Til að læra meira um sambandið milli massa, rúmmáls og eðlismassa skaltu nota þennan [[link:gagnvirka hermilíkan|http://openstax.org/l/16phetmasvolden]] til að kanna eðlismassa mismunandi efna.'
    );
  });
  it('accepts a find inside a term label (control)', () => {
    const r = gate({
      ops: [term('u5', 'atom', 'Atóm', 'Frumeind')],
      en: TERM_EN,
      is: TERM_IS,
      chapterDir: 'ch02',
    });
    expect(r.after).toBe(
      'Efni er samsett úr afar smáum ögnum sem kallast atóm. [[term:Frumeind|term-00002]] er minnsta eining frumefnis sem getur tekið þátt í efnabreytingu.'
    );
  });
});

describe('find starts and ends on a word boundary', () => {
  it('refuses a find that stops inside a word (find-not-word-aligned)', () => {
    const r = gate({
      ops: [term('w1', 'cell-ruled', 'þurrrafhlöð', 'þurrker')],
      en: DRYCELL_EN,
      is: DRYCELL_IS,
      chapterDir: 'ch17',
    });
    expect(r.rejected[0].reasons).toEqual(['find-not-word-aligned']);
  });
  it('accepts the whole word (control)', () => {
    const r = gate({
      ops: [term('w2', 'cell-ruled', 'þurrrafhlöðum', 'þurrkerjum')],
      en: DRYCELL_EN,
      is: DRYCELL_IS,
      chapterDir: 'ch17',
    });
    expect(ids(r)).toEqual(['w2']);
  });
});

describe('forbidden tokens, on real text', () => {
  it('refuses a literal concentration bracket (forbidden-markup)', () => {
    const r = gate({
      ops: [agr('x1', 'bonding-orbital', '[NO', 'NO')],
      en: CONC_EN,
      is: CONC_IS,
      chapterDir: 'ch13',
    });
    expect(r.rejected[0].reasons).toContain('forbidden-markup');
  });
  it('refuses a decimal number (forbidden-digit)', () => {
    const r = gate({
      ops: [term('x2', 'bonding-orbital', 'saman 5,00', 'saman tengisvigrúm')],
      en: MATH_EN,
      is: MATH_IS,
      chapterDir: 'appendices',
    });
    expect(r.rejected[0].reasons).toContain('forbidden-digit');
  });
  it('refuses a Greek letter (forbidden-greek)', () => {
    const r = gate({
      ops: [term('x3', 'antibonding-orbital', 'σ-svigrúm', 'andtengisvigrúm')],
      en: DUP_EN,
      is: DUP_IS0,
    });
    expect(r.rejected[0].reasons).toContain('forbidden-greek');
  });
  it('refuses a degree sign (forbidden-operator)', () => {
    const r = gate({
      ops: [term('x4', 'hybridization', '° horni', 'svigrúmablöndun')],
      en: SP3_EN,
      is: SP3_IS,
    });
    expect(r.rejected[0].reasons).toContain('forbidden-operator');
  });
  it('refuses an editable docref label holding an element symbol (element-symbol)', () => {
    const r = gate({
      ops: [term('x5', 'bonding-orbital', 'viðauka B', 'tengisvigrúm')],
      en: DOCREF_EN,
      is: DOCREF_IS,
      chapterDir: 'ch01',
    });
    expect(r.rejected[0].reasons).toContain('element-symbol');
  });
  it('refuses a formula fragment (inner-capital)', () => {
    const r = gate({
      ops: [term('x6', 'bonding-orbital', 'AsO', 'tengisvigrúm')],
      en: EM_EN,
      is: EM_EN,
      chapterDir: 'appendices',
    });
    expect(r.rejected[0].reasons).toContain('inner-capital');
  });
});

describe('forbiddenTokenReasons — the character classes', () => {
  it.each([
    ['svigrúma'],
    ['bindandi svigrúma'],
    ['„tengisvigrúm“,'],
    ['s-svigrúms'],
    ['Þessi'],
    ['er'],
  ])('passes ordinary prose %j (control)', (s) => {
    expect(forbiddenTokenReasons(s)).toEqual([]);
  });
  it.each([['[[i:x]]'], [']'], ['a|b'], ['&'], ['<b>'], ['{{x}}'], ['__'], ['a_b']])(
    'refuses markup %j',
    (s) => {
      expect(forbiddenTokenReasons(s)).toContain('forbidden-markup');
    }
  );
  it.each([['3'], ['²'], ['₂'], ['½']])('refuses the number character %j', (s) => {
    expect(forbiddenTokenReasons(s)).toContain('forbidden-digit');
  });
  it.each([['α'], ['Δ'], ['∆'], ['µ']])('refuses Greek (incl. look-alikes) %j', (s) => {
    expect(forbiddenTokenReasons(s)).toContain('forbidden-greek');
  });
  it.each(
    [
      '=',
      '+',
      '−',
      '–',
      '×',
      '÷',
      '±',
      '/',
      '%',
      '‰',
      '°',
      '⇌',
      '→',
      '⟶',
      '←',
      '↔',
      '≤',
      '≥',
      '≈',
      '*',
      '^',
      '~',
      '$',
      '++',
    ].map((c) => [c])
  )('refuses the operator %j', (s) => {
    expect(forbiddenTokenReasons(s)).toContain('forbidden-operator');
  });
  it.each([['a\u00A0b'], ['a\u202Fb'], ['a  b'], [' a'], ['a ']])(
    'refuses a non-ASCII, doubled or edge space %j',
    (s) => {
      expect(forbiddenTokenReasons(s)).toContain('forbidden-space');
    }
  );
  it.each([['a\u00ADb'], ['a\u200Bb'], ['a\u200Db'], ['\uFEFFa'], ['a\u200Eb']])(
    'refuses an invisible format character %j',
    (s) => {
      expect(forbiddenTokenReasons(s)).toContain('forbidden-invisible');
    }
  );
  it.each([['a\u0000b'], ['a\u0007b'], ['a\tb'], ['a\nb'], ['a\u007Fb'], ['a\u0085b']])(
    'refuses a control character %j',
    (s) => {
      expect(forbiddenTokenReasons(s)).toContain('forbidden-control');
    }
  );
  it('refuses text that is not NFC (a decomposed á)', () => {
    expect(forbiddenTokenReasons('svigru\u0301m')).toContain('not-nfc');
  });
  it.each([['pOH'], ['NaCl'], ['(SHE)']])('refuses an inner capital %j', (s) => {
    expect(forbiddenTokenReasons(s)).toContain('inner-capital');
  });
  it('refuses a word equal to an element symbol', () => {
    expect(forbiddenTokenReasons('viðauka B')).toContain('element-symbol');
  });
  it('documents the over-refusal of a sentence-initial "Er" (erbium)', () => {
    expect(forbiddenTokenReasons('Er')).toEqual(['element-symbol']);
  });

  describe('against the compiled ruling set of 2026-10-11 (committed, read-only)', () => {
    const file = path.join(REPO, RULING_SET_2026_10_11);
    const set = JSON.parse(fs.readFileSync(file, 'utf8'));
    const targets = [
      ...new Set(
        [...set.before, ...set.stage1].filter((r) => r.is && r.kind !== 'held').map((r) => r.is)
      ),
    ];
    const refused = targets.filter((t) => forbiddenTokenReasons(t).length > 0);
    it('refuses exactly the 18 ruled targets the design measured as unmatchable', () => {
      expect(refused.length).toBe(18);
    });
    it('those are the digit, Greek, operator and inner-capital targets (sp3-…, σ-…, pOH)', () => {
      expect(
        ['sp3-blendingssvigrúm', 'σ-tengisvigrúm', 'pOH', 'staðalvetnisraftroð (SHE)'].every((t) =>
          refused.includes(t)
        )
      ).toBe(true);
    });
    it('passes an ordinary ruled target (control)', () => {
      expect({
        isTarget: targets.includes('tengisvigrúm'),
        refused: refused.includes('tengisvigrúm'),
      }).toEqual({ isTarget: true, refused: false });
    });
  });
});

describe('the marker multiset is unchanged (SYNTHETIC: no real segment shortens a label)', () => {
  // SYNTHETIC. An i payload is editable only while it holds a word of 4+ letters, so an
  // agreement edit that shortens `hinn` to `hin` turns the label into a protected
  // variable — a change in marker syntax that every other check lets through.
  const EN = 'This orbital is the bonding orbital.';
  const IS = 'Þetta er [[i:hinn]] bindandi svigrúm.';
  const T = term('t', 'bonding-orbital', 'bindandi svigrúm', 'tengisvigrúm');
  it('refuses an edit that changes a marker token (marker-multiset-changed)', () => {
    const r = gate({ ops: [T, agr('a', 'bonding-orbital', 'hinn', 'hin')], en: EN, is: IS });
    expect(reasonsOf(r, 'a')).toEqual(['marker-multiset-changed']);
  });
  it('accepts an edit that keeps the label editable (control)', () => {
    const r = gate({ ops: [T, agr('a', 'bonding-orbital', 'hinn', 'hins')], en: EN, is: IS });
    expect(ids(r)).toEqual(['t', 'a']);
  });
});

describe('a term operation introduces the target', () => {
  it('refuses a replace without the target (term-target-missing)', () => {
    const r = gate({
      ops: [term('m1', 'bonding-orbital', 'bindandi svigrúma', 'tengslasvigrúma')],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(r.rejected[0].reasons).toEqual(['term-target-missing']);
  });
  it('refuses a find that already holds the target (term-target-already)', () => {
    const r = gate({
      ops: [term('m2', 'hybridization', 'svigrúmablöndun', 'svigrúmablöndunin')],
      en: SP3TITLE_EN,
      is: SP3TITLE_IS,
    });
    expect(r.rejected[0].reasons).toEqual(['term-target-already']);
  });
  it('a multi-word target needs EVERY word in replace, not only one (term-target-missing)', () => {
    const r = gate({
      ops: [term('m4', 'bonding-orbital-2w', 'bindandi', 'tengt')],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(r.rejected[0].reasons).toEqual(['term-target-missing']);
  });
  it('a find holding only one word of a multi-word target does not hold the target (control)', () => {
    const r = gate({
      ops: [term('m5', 'bonding-orbital-2w', 'bindandi svigrúma', 'tengt svigrúm')],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(ids(r)).toEqual(['m5']);
  });
  it('a 3-letter target (ker) has no stem, and `kerfum` (systems) does not count as it', () => {
    const r = gate({
      ops: [term('m3', 'cell-ruled', 'þurrrafhlöðum', 'kerfum')],
      en: DRYCELL_EN,
      is: DRYCELL_IS,
      chapterDir: 'ch17',
    });
    expect(r.rejected[0].reasons).toEqual(['term-target-missing']);
  });
});

describe('barred words', () => {
  it('refuses a term operation that drops a negation (barred-word)', () => {
    const r = gate({
      ops: [term('b1', 'current', 'enginn straumur', 'rafstraumur')],
      en: CURRENT_EN,
      is: CURRENT_IS,
      chapterDir: 'ch17',
    });
    expect(r.rejected[0].reasons).toEqual(['barred-word']);
  });
  it('accepts a term operation that keeps the negation (control)', () => {
    const r = gate({
      ops: [term('b2', 'current', 'enginn straumur', 'enginn rafstraumur')],
      en: CURRENT_EN,
      is: CURRENT_IS,
      chapterDir: 'ch17',
    });
    expect(ids(r)).toEqual(['b2']);
  });
  it('refuses an agreement operation that carries a negation, even unchanged (barred-word)', () => {
    const r = gate({
      ops: [
        term('d1', 'dissolution', 'upplausn', 'leysingu'),
        agr('d2', 'dissolution', 'breytist ekki', 'breytast ekki'),
      ],
      en: HANDBOOK_EN,
      is: HANDBOOK_IS,
      chapterDir: 'ch15',
    });
    expect(reasonsOf(r, 'd2')).toEqual(['barred-word']);
  });
  it('accepts the same agreement without the negation (control)', () => {
    const r = gate({
      ops: [
        term('d1', 'dissolution', 'upplausn', 'leysingu'),
        agr('d3', 'dissolution', 'breytist', 'breytast'),
      ],
      en: HANDBOOK_EN,
      is: HANDBOOK_IS,
      chapterDir: 'ch15',
    });
    expect(ids(r)).toEqual(['d1', 'd3']);
  });
  it('refuses an agreement operation that changes a number word (barred-word)', () => {
    const r = gate({
      ops: [
        term('q1', 'equivalent', 'jafngild', 'samgild'),
        agr('q2', 'equivalent', 'fjögur', 'fjórar'),
      ],
      en: SP3_EN,
      is: SP3_IS,
    });
    expect(reasonsOf(r, 'q2')).toContain('barred-word');
  });
});

describe('agreement operations', () => {
  const at = (ops) => gate({ ops, en: LINK_EN, is: LINK_IS, chapterDir: 'ch01' });
  it('accept a closed-class and an ending change next to the term (control)', () => {
    const r = at([
      T_SIM,
      agr('s2', 'simulator', 'þennan', 'þetta'),
      agr('s3', 'simulator', 'gagnvirka', 'gagnvirkt'),
    ]);
    expect(r.after).toBe(
      'Til að læra meira um sambandið milli massa, rúmmáls og eðlismassa skaltu nota þetta [[link:gagnvirkt hermilíkan|http://openstax.org/l/16phetmasvolden]] til að kanna eðlismassa mismunandi efna.'
    );
  });
  it('run after every term operation, whatever order the model listed them in', () => {
    const r = at([agr('s2', 'simulator', 'þennan', 'þetta'), T_SIM]);
    expect(ids(r)).toEqual(['s1', 's2']);
  });
  it('need an accepted term operation (agreement-without-term)', () => {
    expect(reasonsOf(at([agr('s2', 'simulator', 'þennan', 'þetta')]), 's2')).toEqual([
      'agreement-without-term',
    ]);
  });
  it('need a term operation of the SAME ruling (agreement-without-term)', () => {
    const r = at([T_SIM, agr('s4', 'density', 'þennan', 'þetta')]);
    expect(reasonsOf(r, 's4')).toEqual(['agreement-without-term']);
  });
  it('must lie within the window of the term (agreement-too-far)', () => {
    const r = at([T_SIM, agr('s5', 'simulator', 'sambandið', 'sambandinu')]);
    expect(reasonsOf(r, 's5')).toEqual(['agreement-too-far']);
  });
  it('keep the word count (agreement-word-count)', () => {
    const r = at([T_SIM, agr('s6', 'simulator', 'þennan', 'þetta hér')]);
    expect(reasonsOf(r, 's6')).toEqual(['agreement-word-count']);
  });
  it('change only closed-class words or endings (agreement-word-changed)', () => {
    const r = at([T_SIM, agr('s7', 'simulator', 'kanna', 'skoða')]);
    expect(reasonsOf(r, 's7')).toEqual(['agreement-word-changed']);
  });
  it('do not change capitalisation, even of a closed-class word (agreement-word-changed)', () => {
    const r = at([T_SIM, agr('s8', 'simulator', 'þennan', 'Þetta')]);
    expect(reasonsOf(r, 's8')).toEqual(['agreement-word-changed']);
  });
  it('need a shared stem: a preposition swap í → á is not an ending (agreement-word-changed)', () => {
    const r = gate({
      ops: [T_BOND, agr('m1', 'bonding-orbital', 'í', 'á')],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(reasonsOf(r, 'm1')).toEqual(['agreement-word-changed']);
  });
  it('accept an ending change on a shared stem (control)', () => {
    const r = gate({
      ops: [T_BOND, agr('m2', 'bonding-orbital', 'rúmfræði', 'rúmfræðinnar')],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(ids(r)).toEqual(['t1', 'm2']);
  });
  it('see the term where it now is after an earlier op changed the length before it (control)', () => {
    // `sögunnar` → `sögu` shortens the text BEFORE the term by 4 characters. The range the
    // term op wrote must move with it, or `í gildistengjakenningunni`, which starts one
    // space after the term, would read as overlapping it.
    const r = gate({
      ops: [
        T_BOND,
        agr('k1', 'bonding-orbital', 'sögunnar', 'sögu'),
        agr('k2', 'bonding-orbital', 'í gildistengjakenningunni', 'í gildistengjakenningunum'),
      ],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(ids(r)).toEqual(['t1', 'k1', 'k2']);
  });
  it('may not overlap an accepted operation (overlaps-accepted-op)', () => {
    const r = gate({
      ops: [T_BOND, agr('o1', 'bonding-orbital', 'tengisvigrúma í', 'tengisvigrúmum í')],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(reasonsOf(r, 'o1')).toEqual(['overlaps-accepted-op']);
  });
});

describe('size bounds', () => {
  it('refuses an operation over the per-op bound (op-too-large)', () => {
    const r = gate({
      ops: [
        term(
          'z1',
          'bonding-orbital',
          'Svigrúmablöndun er kynnt til sögunnar til að útskýra rúmfræði bindandi svigrúma',
          'Svigrúmablöndun er kynnt til sögunnar til að útskýra rúmfræði tengisvigrúma'
        ),
      ],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(r.rejected[0].reasons).toEqual(['op-too-large']);
  });
  it('refuses an operation past the per-segment op count (segment-op-limit)', () => {
    const r = gate({
      ops: [
        T_SIM,
        agr('s2', 'simulator', 'þennan', 'þetta'),
        agr('s3', 'simulator', 'gagnvirka', 'gagnvirkt'),
      ],
      en: LINK_EN,
      is: LINK_IS,
      chapterDir: 'ch01',
      limits: { maxAcceptedOpsPerSegment: 2 },
    });
    expect(reasonsOf(r, 's3')).toEqual(['segment-op-limit']);
  });
  it('refuses an operation past the per-segment share of characters (segment-change-share)', () => {
    const r = gate({
      ops: [T_BOND],
      en: BOND_EN,
      is: BOND_IS,
      limits: { maxChangedShare: 0.1, changedShareFloorChars: 0 },
    });
    expect(r.rejected[0].reasons).toEqual(['segment-change-share']);
  });
  it('lets a short title be replaced whole: the floor exempts one op-sized change (control)', () => {
    const r = gate({
      ops: [term('z2', 'valence-bond-theory', 'Kenning um gildistengi', 'Gildistengjakenning')],
      en: TITLE_EN,
      is: TITLE_IS,
    });
    expect(r.after).toBe('Gildistengjakenning');
  });
  it('refuses an operation that changes nothing (no-change)', () => {
    const r = gate({
      ops: [term('n1', 'bonding-orbital', 'bindandi svigrúma', 'bindandi svigrúma')],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(r.rejected[0].reasons).toContain('no-change');
  });
});

// ── Duplicated segment ids ────────────────────────────────────────────────────────────

describe('gateOccurrences — a duplicated id gets one decision for all its occurrences', () => {
  const both = (ops) => gateAll({ ops, en: DUP_EN, isOccurrences: [DUP_IS0, DUP_IS1] });
  const G_ALL = term('g1', 'antibonding-orbital', 'andbindandi svigrúm', 'andtengisvigrúm');
  const G_ONE = term('g2', 'node', 'hnútur', 'nóða'); // occurrence 1 says hnútyfirborð

  it('accepts an operation accepted in every occurrence', () => {
    expect(both([G_ALL]).accepted.map((o) => o.opId)).toEqual(['g1']);
  });
  it('applies it to every occurrence', () => {
    expect(
      both([G_ALL]).occurrences.map((o) => o.after.endsWith('andtengisvigrúm.[[BR]]'))
    ).toEqual([true, true]);
  });
  it('refuses an operation accepted in one occurrence only, for ALL of them (duplicate-divergent)', () => {
    expect(both([G_ONE]).occurrences.map((o) => reasonsOf(o, 'g2'))).toEqual([
      ['duplicate-divergent'],
      ['duplicate-divergent', 'find-not-found'],
    ]);
  });
  it('does not apply the divergent operation to the occurrence that accepted it', () => {
    expect(both([G_ALL, G_ONE]).occurrences[0].after).toBe(
      'Svigrúmið er staðsett meðfram ásnum milli kjarnanna, svo það er σ-svigrúm. Það er hnútur sem sker ásinn milli kjarnanna í tvennt, svo það er andtengisvigrúm.[[BR]]'
    );
  });
  it('keeps an operation rejected in every occurrence on its own reasons, not divergent', () => {
    const r = both([term('g3', 'node', 'hnútkerfi', 'nóða')]);
    expect(r.occurrences.map((o) => reasonsOf(o, 'g3'))).toEqual([
      ['find-not-found'],
      ['find-not-found'],
    ]);
  });
  it('a single occurrence is gateSegment', () => {
    const one = gateAll({ ops: [T_BOND], en: BOND_EN, isOccurrences: [BOND_IS] });
    expect(one.occurrences[0]).toEqual(
      gateSegment({
        ops: [T_BOND],
        en: BOND_EN,
        is: BOND_IS,
        chapterDir: 'ch08',
        rulingsById: RULINGS,
      })
    );
  });

  describe('cascade to a fixpoint (SYNTHETIC text: the mechanism needs three ops on two occurrences)', () => {
    // SYNTHETIC. The agreement op is accepted in BOTH occurrences in the first round, but in
    // occurrence 0 only because of the divergent term op beside it. Once that op is dropped
    // the agreement is too far from the remaining term op there, so it must fall too.
    const occ = [
      'þessi lögur er góður og hér eru mörg orð á milli áður en edik kemur',
      'þessi edik er gott og hér eru mörg orð á milli áður en vatn kemur',
    ];
    const ops = [
      term('fA', 'acid', 'edik', 'ediksýra'),
      term('fB', 'acid', 'lögur', 'sýrulögur'),
      agr('fC', 'acid', 'þessi', 'þetta'),
    ];
    const r = gateAll({ ops, en: 'This acid is strong.', isOccurrences: occ, chapterDir: 'ch14' });
    it('accepts only the operation that survives every round', () => {
      expect(r.accepted.map((o) => o.opId)).toEqual(['fA']);
    });
    it('reports why each of the others fell, per occurrence', () => {
      expect(r.occurrences.map((o) => o.rejected.map((x) => [x.op.opId, x.reasons]))).toEqual([
        [
          ['fB', ['duplicate-divergent']],
          ['fC', ['duplicate-divergent', 'agreement-too-far']],
        ],
        [
          ['fB', ['duplicate-divergent', 'find-not-found']],
          ['fC', ['duplicate-divergent']],
        ],
      ]);
    });
    it('leaves every occurrence with the same accepted set, applied', () => {
      expect(r.occurrences.map((o) => o.after)).toEqual([
        'þessi lögur er góður og hér eru mörg orð á milli áður en ediksýra kemur',
        'þessi ediksýra er gott og hér eru mörg orð á milli áður en vatn kemur',
      ]);
    });
  });
});

afterAll(() => {
  // Every reason any test in this file produced belongs to the closed set. Non-vacuous: the
  // file exercises well over half of the codes, so an empty `emitted` would itself be a bug.
  if (emitted.size < 20) throw new Error(`only ${emitted.size} distinct reasons were emitted`);
  const stray = [...emitted].filter((c) => !REJECTION_CODES.includes(c));
  if (stray.length) throw new Error(`reasons outside REJECTION_CODES: ${stray.join(', ')}`);
});
