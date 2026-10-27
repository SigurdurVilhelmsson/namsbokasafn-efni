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
import { loadRulingSet } from '../ai-review/ruling-set.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RULING_SET_2026_10_11 =
  'experiments/terminology-consistency/results/2026-10-11/ruling-set-after-stage1.json';
// The committed, compiled ruling set the runner gates against (read-only).
const REAL_SET = loadRulingSet(
  'experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json'
);

// ── Rulings ──────────────────────────────────────────────────────────────────────────────

const ruling = (o) => ({
  competitors: [],
  scope: { kind: 'book' },
  scopeStatus: 'default',
  sense: null,
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
  // REAL target with a PROPOSED ch17 width. Unit B proposed that width on 2026-10-26 and
  // withdrew it the same day for a sense (below); the width mechanism stays, and is tested
  // here on the shape it had.
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
  // Added in review round 1. REAL (targets as the 2026-10-11 ruling set carries them):
  ligand: ruling({ id: 'ligand', enNorm: 'ligand', en: ['ligand'], is: 'tengill' }),
  calorimetry: ruling({
    id: 'calorimetry',
    enNorm: 'calorimetry',
    en: ['calorimetry'],
    is: 'varmamæling',
  }),
  carbonate: ruling({ id: 'carbonate', enNorm: 'carbonate', en: ['carbonate'], is: 'karbónat' }),
  'atom-real': ruling({ id: 'atom-real', enNorm: 'atom', en: ['atom'], is: 'atóm' }),
  'degree-celsius': ruling({
    id: 'degree-celsius',
    enNorm: 'degree celsius',
    en: ['degree celsius'],
    is: 'stig á Celsíus',
  }),
  // HYPOTHETICAL
  reactant: ruling({ id: 'reactant', enNorm: 'reactant', en: ['reactant'], is: 'upphafsefni' }),
  // HYPOTHETICAL: a target word in parentheses, the shape of `aukaskammtatala (hverfiþungi)`
  'paren-target': ruling({
    id: 'paren-target',
    enNorm: 'bonding orbital',
    en: ['bonding orbital'],
    is: 'tengisvigrúm (tengt)',
  }),
  // REAL, as Unit B compiles it since 2026-10-26: restricted to one sense of a homograph.
  bent: ruling({
    id: 'bent',
    enNorm: 'bent',
    en: ['bent'],
    is: 'boginn',
    sense: {
      id: 'molecular-shape',
      gloss: 'the bent (angular) shape of a molecule or of its electron groups',
      otherSenses: [{ id: 'physically-bent', gloss: 'an object that is bent or curved' }],
      status: 'ruled',
    },
  }),
  // HYPOTHETICAL: the same sense held as proposed; a sense on the simulator ruling, to
  // exercise an agreement op after a term-sense op; a sense key absent; a malformed sense.
  'bent-proposed': ruling({
    id: 'bent-proposed',
    enNorm: 'bent',
    en: ['bent'],
    is: 'boginn',
    sense: {
      id: 'molecular-shape',
      gloss: 'the bent shape of a molecule',
      otherSenses: [{ id: 'physically-bent', gloss: 'an object that is bent' }],
      status: 'proposed',
    },
  }),
  'simulator-sensed': ruling({
    id: 'simulator-sensed',
    enNorm: 'simulator',
    en: ['simulator'],
    is: 'hermilíkan',
    sense: {
      id: 'software',
      gloss: 'a computer simulation',
      otherSenses: [{ id: 'machine', gloss: 'a training machine' }],
      status: 'ruled',
    },
  }),
  'no-sense-key': (() => {
    const r = ruling({ id: 'no-sense-key', enNorm: 'node', en: ['node'], is: 'nóða' });
    delete r.sense;
    return r;
  })(),
  'bad-sense': ruling({
    id: 'bad-sense',
    enNorm: 'node',
    en: ['node'],
    is: 'nóða',
    sense: { id: 'x' },
  }),
  // HYPOTHETICAL and MIS-COMPILED on purpose: a digit inside a target word should have made
  // it matchable:false; the matcher must still fail closed.
  'digit-target': ruling({
    id: 'digit-target',
    enNorm: 'bonding orbital',
    en: ['bonding orbital'],
    is: 'tengisvigrúm-2',
  }),
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

// Added in review round 1 (REAL, byte for byte):
// m68843:glossary-def:fs-idp275481408-def (ch19) — `tengli` is the dative of tengill
const LIGAND_EN =
  'atom in a ligand with a lone pair of electrons that forms a coordinate covalent bond to a central metal';
const LIGAND_IS = 'atóm í tengli með stakt rafeindapar sem myndar samgilt girðitengi við miðjumálm';
// m68843:caption:CNX_Chem_19_02_oct-caption (ch19) — `tengihorn` (bond angle) beside ligands
const OCT_EN =
  'Many transition metal complexes adopt octahedral geometries, with six donor atoms forming bond angles of 90° about the central atom with adjacent ligands. Note that only ligands within the coordination sphere affect the geometry around the metal center.';
const OCT_IS =
  'Mörg girðisambönd hliðarmálma taka á sig áttflötungslögun, þar sem sex gjafaatóm mynda 90° tengihorn í kringum miðjuatómið með aðlægum tenglum. Athugaðu að aðeins tenglar innan girðihvolfsins hafa áhrif á lögunina í kringum málmmiðjuna.';
// m68726:abstract-item:abstract-item-1 (ch05)
const CALOR_EN = 'Explain the technique of calorimetry';
const CALOR_IS = 'Útskýrt tækni varmamælinga';
// m68696:para:fs-idp187587072 (ch02)
const CARB_EN =
  '(d) Lithium (group 1) is a metal, and carbonate is a polyatomic ion; Li[[sub:2]]CO[[sub:3]] is predicted to be ionic.';
const CARB_IS =
  '(d) Litíum (flokkur 1) er málmur og karbónat er fjölatóma jón; gert er ráð fyrir að Li[[sub:2]]CO[[sub:3]] sé jónískt.';
// m68737:para:fs-idm91254256 (ch07) — `Natríum[[i:atóm]]`: a label flush against a word
const FLUSH_EN =
  'Neutral atoms and their associated ions have very different physical and chemical properties. Sodium [[i:atoms]] form sodium metal, a soft, silvery-white metal that burns vigorously in air and reacts explosively with water. Chlorine [[i:atoms]] form chlorine gas, Cl[[sub:2]], a yellow-green gas that is extremely corrosive to most metals and very poisonous to animals and plants. The vigorous reaction between the elements sodium and chlorine forms the white, crystalline compound sodium chloride, common table salt, which contains sodium [[i:cations]] and chloride [[i:anions]] ([[xref:CNX_Chem_07_01_NaClPhotos]]). The compound composed of these ions exhibits properties entirely different from the properties of the elements sodium and chlorine. Chlorine is poisonous, but sodium chloride is essential to life; sodium atoms react vigorously with water, but sodium chloride simply dissolves in water.';
const FLUSH_IS =
  'Hlutlaus atóm og jónir þeirra hafa mjög ólíka eðlis- og efnafræðilega eiginleika. Natríum[[i:atóm]] mynda natríummálm, mjúkan, silfurhvítan málm sem brennur kröftuglega í lofti og hvarfast með sprengikrafti við vatn. Klór[[i:atóm]] mynda klórgas, Cl[[sub:2]], gulgrænt gas sem er afar tærandi fyrir flesta málma og mjög eitrað fyrir dýr og plöntur. Hið kröftuga hvarf milli frumefnanna natríums og klórs myndar hvíta, kristallaða efnasambandið natríumklóríð, venjulegt matarsalt, sem inniheldur natríum[[i:katjónir]] og klóríð[[i:anjónir]] ([[xref:CNX_Chem_07_01_NaClPhotos]]). Efnasambandið sem samanstendur af þessum jónum sýnir allt aðra eiginleika en frumefnin natríum og klór. Klór er eitrað en natríumklóríð er lífsnauðsynlegt; natríumatóm hvarfast kröftuglega við vatn en natríumklóríð leysist einfaldlega upp í vatni.';
// m68742:problem:fs-idp159838848 (ch07) — "bent" is the molecular shape
const BENT_EN = 'Explain why the HOH molecule is bent, whereas the HBeH molecule is linear.';
const BENT_IS = 'Útskýrðu hvers vegna HOH-sameindin er hornlaga, en HBeH-sameindin er línuleg.';
// m68729:alt:fs-idp131020960-alt (ch06) — "bent" is physical; beygð is right here
const TUBES_EN = 'This figure shows a colorful neon sign. The tubes are bent into various shapes.';
const TUBES_IS = 'Þessi mynd sýnir litríkt neonskilti. Rörin eru beygð í ýmis form.';
// m68724:glossary-def:fs-idp25506160-def (ch05) — a target with a 1-letter word (`á`)
const CELSIUS_EN =
  'extensive property of a body of matter that represents the quantity of heat required to increase its temperature by 1 degree Celsius (or 1 kelvin)';
const CELSIUS_IS =
  'magnháður eiginleiki efnis sem táknar það varmamagn sem þarf til að hækka hitastig þess um 1 gráðu á Celsíus (eða 1 kelvín)';
// m68798:solution:fs-idp11787968 (ch13) — `átt` (direction) is one letter from `átta` (eight)
const SHIFT_EN = 'The system will shift toward the reactants to reach equilibrium.';
const SHIFT_IS = 'Kerfið mun færast í átt að hvarfefnunum til að ná jafnvægi.';

// Added for term-op-too-wide and quantifier-agreement (REAL, byte for byte). These are gated
// against the committed 2026-10-26 ruling set (REAL_SET below), whose `atom` ruling is
// frumeind → atóm: a feminine noun replaced by a neuter one, which is what makes a gendered
// numeral beside it disagree.
// m68739:alt:fs-idp7083808-alt (ch07)
const C2H2_EN =
  'A Lewis structure shows two carbon atoms that are triple bonded together. Each carbon is also single bonded to a hydrogen atom.';
const C2H2_IS =
  'Lewis-formúla sýnir tvær kolefnisfrumeindir sem eru þrítengdar saman. Hvor kolefnisfrumeind er einnig eintengd við vetnisfrumeind.';
// m68740:problem:fs-idp213179184 (ch07) — `tvær O-frumeindir`: a part word glued to the noun
const HNO3_EN = '(c) nitric acid, HNO[[sub:3]] (N is bonded to an OH group and two O atoms)';
const HNO3_IS = '(c) saltpéturssýra, HNO[[sub:3]] (N er tengt við OH-hóp og tvær O-frumeindir)';
// m68739:alt:fs-idp792848-alt (ch07) — `fjórar` three tokens before `flúorfrumeind hefur`
const BF4_EN =
  'A Lewis structure shows a boron atom single bonded to four fluorine atoms. Each fluorine atom has three lone pairs of electrons. The structure is surrounded by brackets with a superscripted negative sign.';
const BF4_IS =
  'Lewis-formúla sýnir bórfrumeind sem er eintengd við fjórar flúorfrumeindir. Hver flúorfrumeind hefur þrjú stök rafeindapör. Formúlan er umlukin hornklofum með neikvætt formerki í hávísi.';
// m68740:alt:fs-idp77072272-alt (ch07) — `fimm` (indeclinable) and `einni` (feminine dative)
const PYRIDINE_EN =
  'A Lewis structure depicts a hexagonal ring composed of five carbon atoms and one nitrogen atom. Each carbon atom is single bonded to a hydrogen atom.';
const PYRIDINE_IS =
  'Lewis-mynd sýnir sexhyrndan hring sem samanstendur af fimm kolefnisfrumeindum og einni köfnunarefnisfrumeind. Hver kolefnisfrumeind er eintengd við vetnisfrumeind.';
// m68740:alt:fs-idp6338064-alt (ch07) — `sex` (indeclinable)
const BENZENE_EN =
  'A Lewis structure shows a hexagonal ring composed of six carbon atoms. They form single bonds to each another and single bonds to one hydrogen atom each.';
const BENZENE_IS =
  'Lewis-mynd sýnir sexhyrndan hring sem samanstendur af sex kolefnisfrumeindum. Þær mynda eintengi hver við aðra og eintengi við eina vetnisfrumeind hver.';
// m68740:para:fs-idp6151664 (ch07) — a sentence-initial `Ein`
const CO3_EN =
  'One oxygen atom must have a double bond to carbon to complete the octet on the central atom. All oxygen atoms, however, are equivalent, and the double bond could form from any one of the three atoms. This gives rise to three resonance forms of the carbonate ion. Because we can write three identical resonance structures, we know that the actual arrangement of electrons in the carbonate ion is the average of the three structures. Again, experiments show that all three C–O bonds are exactly the same.';
const CO3_IS =
  'Ein súrefnisfrumeind verður að hafa tvítengi við kolefni til að fullgera áttundina á miðjufrumeindinni. Allar súrefnisfrumeindirnar eru þó jafngildar og tvítengið gæti myndast frá hvaða frumeind sem er af þessum þremur. Þetta gefur tilefni til þriggja vokmynda karbónatjónarinnar. Þar sem við getum skrifað þrjár eins vokmyndir vitum við að raunveruleg uppröðun rafeinda í karbónatjóninni er meðaltal þessara þriggja mynda. Aftur sýna tilraunir að öll þrjú C–O tengin eru nákvæmlega eins.';
// m68742:problem:fs-idp49887536 (ch07) — a two-word target (rúmfræði rafeindapara)
const GEOM_EN = 'Explain the difference between electron-pair geometry and molecular structure.';
const GEOM_IS = 'Útskýrðu muninn á rafeindapara-lögun og sameindabyggingu.';
// m68693:caption:CNX_Chem_02_04_TiO2-caption (ch02) — a single-word head swap
const TIO2_EN =
  '(a) The white compound titanium dioxide provides effective protection from the sun. (b) A crystal of titanium dioxide, TiO[[sub:2]], contains titanium and oxygen in a ratio of 1 to 2. The titanium atoms are gray and the oxygen atoms are red. (credit a: modification of work by “osseous”/Flickr)';
const TIO2_IS =
  '(a) Hvíta efnasambandið títantvíoxíð veitir skilvirka vörn gegn sólinni. (b) Kristall af títantvíoxíði, TiO[[sub:2]], inniheldur títan og súrefni í hlutfallinu 1 á móti 2. Títanfrumeindirnar eru gráar og súrefnisfrumeindirnar eru rauðar. (heimild a: breyting á verki eftir „osseous“/Flickr)';
// m68813:alt:fs-idp130807344-alt (ch15) — a numeral AFTER its noun: `I-frumeindirnar tvær`
const I3_EN =
  'This figure illustrates a chemical reaction using structural formulas. On the left, two I atoms, each with 3 unshared electron pairs, are joined with a single bond. Following a plus sign is another structure which has an I atom with four pairs of electron dots and a superscript negative sign. Following a right pointing arrow is a structure in brackets that has three I atoms connected in a line with single bonds. The two end I atoms have three unshared electron dot pairs and the I atom at the center has two unshared electron pairs. Outside the brackets is a superscript negative sign.';
const I3_IS =
  'Þessi mynd sýnir efnahvarf með byggingarformúlum. Vinstra megin eru tvær I-frumeindir, hvor með 3 ódeild rafeindapör, tengdar saman með eintengi. Á eftir plúsmerki er önnur bygging sem hefur I-frumeind með fjórum pörum af rafeindapunktum og hávísi sem er neikvætt tákn. Á eftir hægri ör er bygging innan hornklofa sem hefur þrjár I-frumeindir tengdar í línu með eintengjum. I-frumeindirnar tvær á endunum hafa þrjú ódeild rafeindapunktapör og I-frumeindin í miðjunni hefur tvö ódeild rafeindapör. Fyrir utan hornklofana er hávísir sem er neikvætt tákn.';
// m68770:para:fs-idp141658128 (ch10) — `(eina frumeind á þykkt)`: punctuation on the token
const GRAPHENE_EN =
  'You may be less familiar with a recently discovered form of carbon: graphene. Graphene was first isolated in 2004 by using tape to peel off thinner and thinner layers from graphite. It is essentially a single sheet (one atom thick) of graphite. Graphene, illustrated in [[xref:CNX_Chem_10_05_Graphene]], is not only strong and lightweight, but it is also an excellent conductor of electricity and heat. These properties may prove very useful in a wide range of applications, such as vastly improved computer chips and circuits, better batteries and solar cells, and stronger and lighter structural materials. The 2010 Nobel Prize in Physics was awarded to Andre [[term:Geim|term-00007]] and Konstantin [[term:Novoselov|term-00008]] for their pioneering work with graphene.';
const GRAPHENE_IS =
  'Þú þekkir kannski síður nýlega uppgötvað form kolefnis: grafen. Grafen var fyrst einangrað árið 2004 með því að nota límband til að fletta þynnri og þynnri lögum af grafíti. Það er í raun eitt lag (eina frumeind á þykkt) af grafíti. Grafen, sem sýnt er í [[xref:CNX_Chem_10_05_Graphene]], er ekki aðeins sterkt og létt, heldur er það einnig frábær leiðari rafmagns og hita. Þessir eiginleikar gætu reynst mjög gagnlegir í margs konar notkun, svo sem í stórbættum tölvukubbum og rafrásum, betri rafhlöðum og sólarsellum og sterkari og léttari byggingarefnum. Nóbelsverðlaunin í eðlisfræði árið 2010 voru veitt Andre [[term:Geim|term-00007]] og Konstantin [[term:Novoselov|term-00008]] fyrir brautryðjendastarf þeirra með grafen.';

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
const termSense = (opId, rulingId, sense, find, replace) => ({
  opId,
  category: 'term-sense',
  rulingId,
  sense,
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
/** Gate one op against the committed 2026-10-26 ruling set (REAL_SET). */
const gateReal = (args) =>
  record(gateSegment({ chapterDir: 'ch07', rulingsById: REAL_SET.byId, ...args }));
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
      'forbidden-script',
      'forbidden-space',
      'inner-capital',
      'marker-multiset-changed',
      'no-change',
      'not-nfc',
      'op-invalid',
      'op-too-large',
      'overlaps-accepted-op',
      'quantifier-agreement',
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
      'sense-mismatch',
      'sense-not-applicable',
      'sense-undeclared',
      'sense-unruled',
      'term-op-too-wide',
      'term-target-already',
      'term-target-missing',
    ]);
  });
  it('REJECTION_CODES is in sorted order (checked, not copied)', () => {
    expect([...REJECTION_CODES].sort()).toEqual([...REJECTION_CODES]);
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

describe('a ruling restricted to one sense', () => {
  const at = (ops, seg = { en: BENT_EN, is: BENT_IS, chapterDir: 'ch07' }) => gate({ ops, ...seg });
  const OK = termSense('b1', 'bent', 'molecular-shape', 'hornlaga', 'bogin');

  it('takes a term-sense op that declares its sense (control)', () => {
    expect(at([OK]).after).toBe(
      'Útskýrðu hvers vegna HOH-sameindin er bogin, en HBeH-sameindin er línuleg.'
    );
  });
  it('refuses a plain term op: the sense must be declared (sense-undeclared)', () => {
    expect(reasonsOf(at([term('b1', 'bent', 'hornlaga', 'bogin')]), 'b1')).toEqual([
      'sense-undeclared',
    ]);
  });
  it('refuses another sense from the closed list (sense-mismatch)', () => {
    expect(reasonsOf(at([{ ...OK, sense: 'physically-bent' }]), 'b1')).toEqual(['sense-mismatch']);
  });
  it("refuses 'unclear': the runner turns that answer into a flag, never an edit (sense-mismatch)", () => {
    expect(reasonsOf(at([{ ...OK, sense: 'unclear' }]), 'b1')).toEqual(['sense-mismatch']);
  });
  it('refuses a sense id that is on no list (sense-mismatch)', () => {
    expect(reasonsOf(at([{ ...OK, sense: 'shape' }]), 'b1')).toEqual(['sense-mismatch']);
  });
  it('refuses every op while the sense is only proposed (sense-unruled)', () => {
    expect(reasonsOf(at([{ ...OK, rulingId: 'bent-proposed' }]), 'b1')).toEqual(['sense-unruled']);
  });
  it('refuses a term-sense op on a ruling with no sense (sense-not-applicable)', () => {
    const r = gate({
      ops: [{ ...T_BOND, category: 'term-sense', sense: 'x' }],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(reasonsOf(r, 't1')).toEqual(['sense-not-applicable']);
  });
  it('a term op on a ruling with no sense is untouched by any of this (control)', () => {
    expect(ids(gate({ ops: [T_BOND], en: BOND_EN, is: BOND_IS }))).toEqual(['t1']);
  });
  it('still runs every term check: the target must be in replace (term-target-missing)', () => {
    expect(reasonsOf(at([{ ...OK, replace: 'sveigð' }]), 'b1')).toEqual(['term-target-missing']);
  });
  it('checks the DECLARATION, not the judgement: a wrong declaration on the neon-sign tubes passes', () => {
    // "The tubes are bent" is physical, and beygð is right there. The gate cannot see that;
    // the model's sense judgement is measured by the blind check, per category.
    const r = at([termSense('b2', 'bent', 'molecular-shape', 'beygð', 'bogin')], {
      en: TUBES_EN,
      is: TUBES_IS,
      chapterDir: 'ch06',
    });
    expect(ids(r)).toEqual(['b2']);
  });
  it('lets an agreement op follow an accepted term-sense op of the same ruling', () => {
    const r = gate({
      ops: [
        termSense('s1', 'simulator-sensed', 'software', 'hermi', 'hermilíkan'),
        agr('s2', 'simulator-sensed', 'þennan', 'þetta'),
        agr('s3', 'simulator-sensed', 'gagnvirka', 'gagnvirkt'),
      ],
      en: LINK_EN,
      is: LINK_IS,
      chapterDir: 'ch01',
    });
    expect(ids(r)).toEqual(['s1', 's2', 's3']);
  });
  it('runs a term-sense op before an agreement op listed ahead of it', () => {
    const r = gate({
      ops: [
        agr('s2', 'simulator-sensed', 'þennan', 'þetta'),
        termSense('s1', 'simulator-sensed', 'software', 'hermi', 'hermilíkan'),
      ],
      en: LINK_EN,
      is: LINK_IS,
      chapterDir: 'ch01',
    });
    expect(ids(r)).toEqual(['s1', 's2']);
  });
  it('an agreement op on a held sense reports the hold as well as the missing anchor', () => {
    const r = at([
      { ...OK, rulingId: 'bent-proposed' },
      agr('a1', 'bent-proposed', 'línuleg', 'línulegt'),
    ]);
    expect(reasonsOf(r, 'a1')).toEqual(['sense-unruled', 'agreement-without-term']);
  });
});

describe('the sense field on ops and rulings', () => {
  it('refuses a term-sense op without a sense (op-invalid)', () => {
    const r = gate({ ops: [{ ...T_BOND, category: 'term-sense' }], en: BOND_EN, is: BOND_IS });
    expect(r.rejected[0].reasons).toEqual(['op-invalid']);
  });
  it('refuses a term-sense op with an empty sense (op-invalid)', () => {
    const r = gate({
      ops: [{ ...T_BOND, category: 'term-sense', sense: '' }],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(r.rejected[0].reasons).toEqual(['op-invalid']);
  });
  it('refuses a term op that carries a sense string (op-invalid)', () => {
    const r = gate({ ops: [{ ...T_BOND, sense: 'x' }], en: BOND_EN, is: BOND_IS });
    expect(r.rejected[0].reasons).toEqual(['op-invalid']);
  });
  it('accepts a term op whose sense is null, the shape a schema with a nullable field sends (control)', () => {
    expect(ids(gate({ ops: [{ ...T_BOND, sense: null }], en: BOND_EN, is: BOND_IS }))).toEqual([
      't1',
    ]);
  });
  it('refuses a ruling whose sense key is absent, never reading it as null (ruling-invalid)', () => {
    const r = gate({
      ops: [term('n1', 'no-sense-key', 'hnútur', 'nóða')],
      en: DUP_EN,
      is: DUP_IS0,
    });
    expect(reasonsOf(r, 'n1')).toContain('ruling-invalid');
  });
  it('refuses a ruling whose sense is malformed (ruling-invalid)', () => {
    const r = gate({ ops: [term('n1', 'bad-sense', 'hnútur', 'nóða')], en: DUP_EN, is: DUP_IS0 });
    expect(reasonsOf(r, 'n1')).toContain('ruling-invalid');
  });
  it('control: the same op on the well-formed node ruling is accepted', () => {
    expect(
      ids(gate({ ops: [term('n1', 'node', 'hnútur', 'nóða')], en: DUP_EN, is: DUP_IS0 }))
    ).toEqual(['n1']);
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
  it('refuses a find that STARTS inside a word (find-not-word-aligned)', () => {
    const r = gate({
      ops: [term('w3', 'bonding-orbital', 'indandi svigrúma', 'tengisvigrúma')],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(r.rejected[0].reasons).toEqual(['find-not-word-aligned']);
  });
  it('refuses a find that ends where a flush label continues the word as the reader sees it', () => {
    // `Natríum[[i:atóm]]` renders as one word; the raw `[` beside the find is no boundary.
    const r = gate({
      ops: [term('w4', 'atom-real', 'Natríum', 'Natríumatóm')],
      en: FLUSH_EN,
      is: FLUSH_IS,
      chapterDir: 'ch07',
    });
    expect(r.rejected[0].reasons).toEqual(['find-not-word-aligned']);
  });
  it('accepts a whole spaced word in the same segment (control)', () => {
    const r = gate({
      ops: [term('w5', 'atom-real', 'natríums', 'natríumatóms')],
      en: FLUSH_EN,
      is: FLUSH_IS,
      chapterDir: 'ch07',
    });
    expect(ids(r)).toEqual(['w5']);
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

describe('forbidden tokens in REPLACE only (the find is clean real text)', () => {
  // Every case above puts the bad token in find. The spec says "in find OR replace".
  it.each([
    ['a digit', 'tengisvigrúma 2', 'forbidden-digit'],
    ['a pipe', 'tengisvigrúma|x', 'forbidden-markup'],
    ['a Greek letter', 'σ-tengisvigrúma', 'forbidden-greek'],
    ['a degree sign', 'tengisvigrúma°', 'forbidden-operator'],
    ['a no-break space', 'tengisvigrúma\u00A0hér', 'forbidden-space'],
    ['a zero-width space', 'tengisvig\u200Brúma', 'forbidden-invisible'],
    [
      'a variation selector (default-ignorable, not Cf)',
      'tengisvigrúma\uFE0F',
      'forbidden-invisible',
    ],
    ['a Hangul filler (an invisible letter)', 'tengisvigrúma\u3164', 'forbidden-invisible'],
    ['a braille blank', 'tengisvigrúma \u2800', 'forbidden-invisible'],
    ['a Cyrillic \u0430 that looks like a', 'tengisvigrúm\u0430', 'forbidden-script'],
    ['a Cyrillic word', 'tengisvigrúma \u0442\u0435\u0441\u0442', 'forbidden-script'],
    ['an element symbol', 'tengisvigrúma Og', 'element-symbol'],
    ['an inner capital', 'tengisVigrúma', 'inner-capital'],
  ])('refuses %s in replace', (_label, replace, code) => {
    const r = gate({
      ops: [term('r1', 'bonding-orbital', 'bindandi svigrúma', replace)],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(r.rejected[0]?.reasons).toContain(code);
  });
  it('refuses a digit in replace with that reason alone (the find side is clean)', () => {
    // The digit is glued to the word: `tengisvigrúma 2` would add a word and so also be
    // term-op-too-wide, and this case is about the digit alone.
    const r = gate({
      ops: [term('r2', 'bonding-orbital', 'bindandi svigrúma', 'tengisvigrúma2')],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(r.rejected[0].reasons).toEqual(['forbidden-digit']);
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
  // Review round 1: invisible characters OUTSIDE \p{Cf} (default-ignorable, or blank).
  it.each([
    ['variation selector U+FE0F', 'a\uFE0F'],
    ['combining grapheme joiner U+034F', 'a\u034Fb'],
    ['Hangul filler U+3164', 'a\u3164b'],
    ['halfwidth Hangul filler U+FFA0', 'a\uFFA0b'],
    ['Hangul choseong filler U+115F', 'a\u115Fb'],
    ['braille blank U+2800', 'a\u2800b'],
  ])('refuses the invisible %s', (_label, s) => {
    expect(forbiddenTokenReasons(s)).toContain('forbidden-invisible');
  });
  // Review round 1: Icelandic is written in the Latin script, and NFC text needs no
  // combining mark, so any other letter or a leftover mark is a homoglyph or debris.
  it.each([
    ['a Cyrillic \u0430 (U+0430)', 'svigr\u00FAm\u0430'],
    ['a Cyrillic word', '\u0442\u0435\u0441\u0442'],
    ['a script capital M (U+2133)', '\u2133'],
    ['an Armenian letter', 'a\u0561'],
    ['a combining acute after a letter with no precomposed form', 'x\u0301'],
  ])('refuses %s (forbidden-script)', (_label, s) => {
    expect(forbiddenTokenReasons(s)).toContain('forbidden-script');
  });
  it('passes every Icelandic letter, both cases (control)', () => {
    expect(
      forbiddenTokenReasons(
        'a\u00E1e\u00E9i\u00EDo\u00F3u\u00FAy\u00FD\u00FE\u00E6\u00F6\u00F0 \u00C1a \u00C9a \u00CDa \u00D3a \u00DAa \u00DDa \u00DEa \u00C6a \u00D6a \u00D0a'
      )
    ).toEqual([]);
  });
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

describe('the target is a WORD of replace, not a string inside another word (review round 1)', () => {
  // The target must be the head of a word: it ends the word, followed only by an
  // inflectional ending, and whatever precedes it inside the word is a compound modifier
  // of 3+ letters that is not a negating prefix. A stem found anywhere inside a word let
  // `anóða` (anode) stand for `nóða` (node) and `andtengisvigrúm` (antibonding) for
  // `tengisvigrúm` (bonding).
  const missing = (rulingId, en, is, chapterDir, find, replace) =>
    gate({ ops: [term('h', rulingId, find, replace)], en, is, chapterDir }).rejected[0]?.reasons;

  it('refuses a different word that ends in the target: node → anóða (anode)', () => {
    expect(missing('node', DUP_EN, DUP_IS0, 'ch08', 'hnútur', 'anóða')).toEqual([
      'term-target-missing',
    ]);
  });
  it('accepts the target itself: node → nóða (control)', () => {
    expect(
      ids(gate({ ops: [term('h', 'node', 'hnútur', 'nóða')], en: DUP_EN, is: DUP_IS0 }))
    ).toEqual(['h']);
  });
  it.each([['sker'], ['skerið'], ['esker']])(
    'refuses a 1–2 letter fragment before a short target: cell → %s',
    (replace) => {
      expect(
        missing('cell-ruled', DRYCELL_EN, DRYCELL_IS, 'ch17', 'þurrrafhlöðum', replace)
      ).toEqual(['term-target-missing']);
    }
  );
  it.each([
    ['and- (antibonding)', 'andtengisvigrúma'],
    ['ó- (un-)', 'ótengisvigrúma'],
  ])('refuses the target behind a negating prefix %s', (_label, replace) => {
    expect(
      missing('bonding-orbital', BOND_EN, BOND_IS, 'ch08', 'bindandi svigrúma', replace)
    ).toEqual(['term-target-missing']);
  });
  it.each([
    [
      'bonding orbital → tengisvigrúmalausra',
      'bonding-orbital',
      BOND_EN,
      BOND_IS,
      'ch08',
      'bindandi svigrúma',
      'tengisvigrúmalausra',
    ],
    [
      'carbonate → karbónýlhópur (carbonyl group)',
      'carbonate',
      CARB_EN,
      CARB_IS,
      'ch02',
      'málmur',
      'karbónýlhópur',
    ],
    [
      'ligand → tengihorni (bond angle)',
      'ligand',
      LIGAND_EN,
      LIGAND_IS,
      'ch19',
      'tengli',
      'tengihorni',
    ],
  ])(
    'refuses the target used as a MODIFIER, not as the head: %s',
    (_l, id, en, is, ch, find, replace) => {
      expect(missing(id, en, is, ch, find, replace)).toEqual(['term-target-missing']);
    }
  );
  it.each([
    [
      'calorimetry → varmamælir (calorimeter)',
      'calorimetry',
      CALOR_EN,
      CALOR_IS,
      'ch05',
      'tækni',
      'varmamælir',
    ],
    [
      'ligand → eintengi (single bond)',
      'ligand',
      LIGAND_EN,
      LIGAND_IS,
      'ch19',
      'tengli',
      'eintengi',
    ],
  ])(
    'refuses a word that shares the stem but drops a non-ending part of the target: %s',
    (_l, id, en, is, ch, find, replace) => {
      expect(missing(id, en, is, ch, find, replace)).toEqual(['term-target-missing']);
    }
  );
  it.each([
    [
      'an inflected form, ligand → tengil',
      'ligand',
      LIGAND_EN,
      LIGAND_IS,
      'ch19',
      'tengli',
      'tengil',
    ],
    [
      'an inflected form, calorimetry → varmamælingu',
      'calorimetry',
      CALOR_EN,
      CALOR_IS,
      'ch05',
      'tækni',
      'varmamælingu',
    ],
    [
      'a compound HEAD after a 3+ letter modifier, carbonate → koparkarbónat',
      'carbonate',
      CARB_EN,
      CARB_IS,
      'ch02',
      'málmur',
      'koparkarbónat',
    ],
  ])('accepts %s (control)', (_l, id, en, is, ch, find, replace) => {
    expect(ids(gate({ ops: [term('h', id, find, replace)], en, is, chapterDir: ch }))).toEqual([
      'h',
    ]);
  });
  it('documents the over-refusal of a 2-letter modifier: carbonate → álkarbónat', () => {
    expect(missing('carbonate', CARB_EN, CARB_IS, 'ch02', 'málmur', 'álkarbónat')).toEqual([
      'term-target-missing',
    ]);
  });
  it('judges "find already holds the target" LOOSELY: tengihorn holds the stem of tengill', () => {
    // The two checks lean opposite ways on purpose: "already" refuses, so the loose stem
    // test refuses more; "missing" refuses unless, so the strict word test refuses more.
    expect(missing('ligand', OCT_EN, OCT_IS, 'ch19', 'tengihorn', 'tengill')).toEqual([
      'term-target-already',
    ]);
  });
  it('a 1–2 letter target word must stand as its own word: `skrá` does not carry `á`', () => {
    // A short word as a compound "head" is a fragment: `skr`+`á`, `línul`+`eg`.
    expect(
      missing(
        'degree-celsius',
        CELSIUS_EN,
        CELSIUS_IS,
        'ch05',
        'gráðu á Celsíus',
        'stig skrá Celsíus'
      )
    ).toEqual(['term-target-missing']);
  });
  it('accepts the target with its 1-letter word standing alone (control)', () => {
    const r = gate({
      ops: [term('h', 'degree-celsius', 'gráðu á Celsíus', 'stig á Celsíus')],
      en: CELSIUS_EN,
      is: CELSIUS_IS,
      chapterDir: 'ch05',
    });
    expect(ids(r)).toEqual(['h']);
  });
  it('reads a target word inside parentheses as that word (control)', () => {
    const r = gate({
      ops: [term('h', 'paren-target', 'bindandi svigrúma', 'tengisvigrúma (tengt)')],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(ids(r)).toEqual(['h']);
  });
  it('fails closed on a target word holding a digit, even if a ruling calls it matchable', () => {
    expect(
      missing('digit-target', BOND_EN, BOND_IS, 'ch08', 'bindandi svigrúma', 'tengisvigrúma')
    ).toEqual(['term-target-missing']);
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
    // This control kept `enginn` until 2026-10-27; enginn is gendered, so that op now meets
    // quantifier-agreement (its documented over-refusal, below). `ekki` is not gendered.
    const r = gate({
      ops: [term('b2', 'dissolution', 'ekki við upplausn', 'ekki við leysingu')],
      en: HANDBOOK_EN,
      is: HANDBOOK_IS,
      chapterDir: 'ch15',
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
    // Since 2026-10-27 the anchor q1 is refused too: `fjögur` stands right before `jafngild`
    // (quantifier-agreement, an over-refusal here: jafngild and samgild are both neuter).
    // barred-word on q2 does not depend on the anchor, so both verdicts are pinned.
    const r = gate({
      ops: [
        term('q1', 'equivalent', 'jafngild', 'samgild'),
        agr('q2', 'equivalent', 'fjögur', 'fjórar'),
      ],
      en: SP3_EN,
      is: SP3_IS,
    });
    expect({ q1: reasonsOf(r, 'q1'), q2: reasonsOf(r, 'q2').includes('barred-word') }).toEqual({
      q1: ['quantifier-agreement'],
      q2: true,
    });
  });
  it('refuses an agreement that turns átt (direction) into átta (eight): barred in REPLACE only', () => {
    // `átt` → `átta` is otherwise a valid ending change on a 3-letter stem.
    const r = gate({
      ops: [
        term('a1', 'reactant', 'hvarfefnunum', 'upphafsefnunum'),
        agr('a2', 'reactant', 'átt', 'átta'),
      ],
      en: SHIFT_EN,
      is: SHIFT_IS,
      chapterDir: 'ch13',
    });
    expect(reasonsOf(r, 'a2')).toEqual(['barred-word']);
  });
  it('accepts the term operation beside it (control)', () => {
    const r = gate({
      ops: [term('a1', 'reactant', 'hvarfefnunum', 'upphafsefnunum')],
      en: SHIFT_EN,
      is: SHIFT_IS,
      chapterDir: 'ch13',
    });
    expect(ids(r)).toEqual(['a1']);
  });
  it.each([
    ['the negation hvergi (nowhere)', 'tengisvigrúma hvergi'],
    ['the ordinal tólfta (12th)', 'tólfta tengisvigrúma'],
    ['the fraction helmingi (half)', 'helmingi tengisvigrúma'],
  ])('refuses a term operation that inserts %s (barred-word)', (_label, replace) => {
    // An inserted word is also a word more than the one-word target, so term-op-too-wide
    // fires beside it; barred-word must still be named.
    const r = gate({
      ops: [term('b3', 'bonding-orbital', 'bindandi svigrúma', replace)],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect(r.rejected[0].reasons).toEqual(['barred-word', 'term-op-too-wide']);
  });
});

describe('a term operation is no wider than its target (term-op-too-wide)', () => {
  // REAL rulings from REAL_SET: `atom` → atóm (one word) and `electron-pair-geometry` →
  // rúmfræði rafeindapara (two words). The agreement rules hold only for ops LABELLED
  // agreement, so a change folded into a term op escaped them all: the first two cases below
  // were accepted before this rule existed.
  const atom = (find, replace, args = {}) =>
    gateReal({ ops: [term('w', 'atom', find, replace)], en: C2H2_EN, is: C2H2_IS, ...args });
  const geom = (find, replace) =>
    gateReal({
      ops: [term('w', 'electron-pair-geometry', find, replace)],
      en: GEOM_EN,
      is: GEOM_IS,
    });

  it('refuses an agreement folded into a term op (real ch07 alt)', () => {
    // As an agreement op, eintengd → eintengt is refused (agreement-word-changed).
    const r = atom(
      'Hvor kolefnisfrumeind er einnig eintengd',
      'Hvort kolefnisatóm er einnig eintengt'
    );
    expect(r.rejected[0]?.reasons).toEqual(['term-op-too-wide']);
  });
  it('refuses a style swap folded in as well (einnig → líka)', () => {
    const r = atom(
      'Hvor kolefnisfrumeind er einnig eintengd',
      'Hvort kolefnisatóm er líka eintengt'
    );
    expect(r.rejected[0]?.reasons).toEqual(['term-op-too-wide']);
  });
  it('refuses the smallest fold: one word more than a one-word target', () => {
    const r = atom('Hvor kolefnisfrumeind', 'Hvort kolefnisatóm');
    expect(r.rejected[0]?.reasons).toEqual(['term-op-too-wide']);
  });
  it('accepts the term alone on the same segment (control)', () => {
    expect(ids(atom('vetnisfrumeind', 'vetnisatóm'))).toEqual(['w']);
  });
  it('accepts a single-word head swap (control, real ch02 caption)', () => {
    const r = atom('Títanfrumeindirnar', 'Títanatómin', {
      en: TIO2_EN,
      is: TIO2_IS,
      chapterDir: 'ch02',
    });
    expect(ids(r)).toEqual(['w']);
  });
  it('accepts a find extended by an unchanged word AFTER the term (control)', () => {
    // `flúorfrumeind` alone occurs twice (also inside `flúorfrumeindir`), so the find must
    // carry a neighbour; the common trailing run strips it.
    const r = atom('flúorfrumeind hefur', 'flúoratóm hefur', { en: BF4_EN, is: BF4_IS });
    expect(ids(r)).toEqual(['w']);
  });
  it('accepts a find extended by unchanged words BEFORE the term (control)', () => {
    expect(ids(geom('muninn á rafeindapara-lögun', 'muninn á rúmfræði rafeindapara'))).toEqual([
      'w',
    ]);
  });
  it('accepts a multi-word target replacing one word whole (control)', () => {
    const r = geom('rafeindapara-lögun', 'rúmfræði rafeindapara');
    expect(r.after).toBe('Útskýrðu muninn á rúmfræði rafeindapara og sameindabyggingu.');
  });
  it('refuses one word more than a multi-word target (HYPOTHETICAL op on a real segment)', () => {
    const r = geom('rafeindapara-lögun', 'rúmfræði allra rafeindapara');
    expect(r.rejected[0]?.reasons).toEqual(['term-op-too-wide']);
  });
  it('counts a word kept on both sides once: the two runs never overlap (HYPOTHETICAL op)', () => {
    // find `X`, replace `X Y X`: the leading run takes X; a trailing run allowed to reuse
    // that same X of find would strip the last X of replace too and leave only Y.
    const r = atom('Títanfrumeindirnar', 'Títanfrumeindirnar Títanatómin Títanfrumeindirnar', {
      en: TIO2_EN,
      is: TIO2_IS,
      chapterDir: 'ch02',
    });
    expect(r.rejected[0]?.reasons).toEqual(['term-op-too-wide']);
  });
  it('leaves find unconstrained, so a compound collapse stays fixable (control)', () => {
    // The same op as the size-bounds control `z2`: a three-word find, a one-word replace.
    const r = gate({
      ops: [term('z2', 'valence-bond-theory', 'Kenning um gildistengi', 'Gildistengjakenning')],
      en: TITLE_EN,
      is: TITLE_IS,
    });
    expect(ids(r)).toEqual(['z2']);
  });
});

describe('a term operation beside a gendered quantifier (quantifier-agreement)', () => {
  // A gendered numeral or quantifier is BARRED, so no agreement op may follow the noun's new
  // gender; a term op beside one lands ungrammatical text. Before this rule every refusing
  // case below was accepted.
  const atom = (find, replace, args = {}) =>
    gateReal({ ops: [term('q', 'atom', find, replace)], en: C2H2_EN, is: C2H2_IS, ...args });

  it('refuses when the token before last is one, the last a part word glued to find (real ch07)', () => {
    // `og tvær O-frumeindir` → `tvær O-atóm`: a feminine numeral before a neuter noun.
    const r = atom('frumeindir', 'atóm', { en: HNO3_EN, is: HNO3_IS });
    expect(r.rejected[0]?.reasons).toEqual(['quantifier-agreement']);
  });
  it('refuses when the token right before find is one (real ch07 alt)', () => {
    expect(atom('kolefnisfrumeindir', 'kolefnisatóm').rejected[0]?.reasons).toEqual([
      'quantifier-agreement',
    ]);
  });
  it('refuses a feminine dative right before find (real ch07 alt: einni)', () => {
    const r = atom('köfnunarefnisfrumeind', 'köfnunarefnisatóm', {
      en: PYRIDINE_EN,
      is: PYRIDINE_IS,
    });
    expect(r.rejected[0]?.reasons).toEqual(['quantifier-agreement']);
  });
  it('refuses one in the common LEADING run of find and replace (real ch07 alt)', () => {
    expect(atom('tvær kolefnisfrumeindir', 'tvær kolefnisatóm').rejected[0]?.reasons).toEqual([
      'quantifier-agreement',
    ]);
  });
  it('refuses one in the common TRAILING run: a numeral after its noun (real ch15 alt)', () => {
    // `I-frumeindirnar tvær` → `I-atómin tvær`; the two tokens before find are `eintengjum.`
    // and the glued `I-`, so only the trailing run can see it.
    const r = atom('frumeindirnar tvær', 'atómin tvær', {
      en: I3_EN,
      is: I3_IS,
      chapterDir: 'ch15',
    });
    expect(r.rejected[0]?.reasons).toEqual(['quantifier-agreement']);
  });
  it('lowercases before looking a token up: a sentence-initial Ein (real ch07 para)', () => {
    const r = atom('súrefnisfrumeind verður', 'súrefnisatóm verður', { en: CO3_EN, is: CO3_IS });
    expect(r.rejected[0]?.reasons).toEqual(['quantifier-agreement']);
  });
  it('lowercases a run word as well: Ein kept at the very start of the segment (real ch07 para)', () => {
    // find starts the segment, so no token precedes it and only the leading run can see Ein.
    const r = atom('Ein súrefnisfrumeind verður', 'Ein súrefnisatóm verður', {
      en: CO3_EN,
      is: CO3_IS,
    });
    expect({
      atStart: CO3_IS.startsWith('Ein súrefnisfrumeind verður'),
      r: r.rejected[0]?.reasons,
    }).toEqual({
      atStart: true,
      r: ['quantifier-agreement'],
    });
  });
  it('strips edge punctuation from a token: (eina frumeind á þykkt) (real ch10 para)', () => {
    const r = atom('frumeind á þykkt', 'atóm á þykkt', {
      en: GRAPHENE_EN,
      is: GRAPHENE_IS,
      chapterDir: 'ch10',
    });
    expect(r.rejected[0]?.reasons).toEqual(['quantifier-agreement']);
  });
  it('accepts the same kind of op with no quantifier nearby (control)', () => {
    expect(ids(atom('vetnisfrumeind', 'vetnisatóm'))).toEqual(['q']);
  });
  it('does not look three tokens back (control)', () => {
    // The positive control is built in: the quantifier IS there, third from find.
    const before = BF4_IS.slice(0, BF4_IS.indexOf('flúorfrumeind hefur'));
    const lastThree = before.split(/\s+/u).filter(Boolean).slice(-3);
    const r = atom('flúorfrumeind hefur', 'flúoratóm hefur', { en: BF4_EN, is: BF4_IS });
    expect({ lastThree, accepted: ids(r) }).toEqual({
      lastThree: ['fjórar', 'flúorfrumeindir.', 'Hver'],
      accepted: ['q'],
    });
  });
  it.each([
    ['fimm', PYRIDINE_EN, PYRIDINE_IS],
    ['sex', BENZENE_EN, BENZENE_IS],
  ])('does not refuse beside the indeclinable cardinal %s (control)', (word, en, is) => {
    const r = atom('kolefnisfrumeindum', 'kolefnisatómum', { en, is });
    expect({ beside: is.includes(`${word} kolefnisfrumeindum`), accepted: ids(r) }).toEqual({
      beside: true,
      accepted: ['q'],
    });
  });
  it('documents the over-refusal: it fires where the gender does not change, too', () => {
    // straumur and rafstraumur are both masculine, so `enginn rafstraumur` agrees; the rule
    // cannot know the target's gender and refuses anyway. HYPOTHETICAL ruling, real segment.
    const r = gate({
      ops: [term('ov', 'current', 'enginn straumur', 'enginn rafstraumur')],
      en: CURRENT_EN,
      is: CURRENT_IS,
      chapterDir: 'ch17',
    });
    expect(r.rejected[0]?.reasons).toEqual(['quantifier-agreement']);
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
  it.each([
    ['add a trailing comma', 'þetta,'],
    ['add a leading quotation mark', '„þetta'],
  ])('do not %s, even to a closed-class word (agreement-word-changed)', (_label, replace) => {
    const r = at([T_SIM, agr('s9', 'simulator', 'þennan', replace)]);
    expect(reasonsOf(r, 's9')).toEqual(['agreement-word-changed']);
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
  // Each bound alone: the case above trips the find character bound first, so it says
  // nothing about the other three.
  it('refuses a replace over maxReplaceChars, find and word counts within bounds (op-too-large)', () => {
    const replace = 'tengisvigrúma rafeindaskýjanna hreyfiorkulögmálanna varmafræðilögmálanna nú';
    const r = gate({
      ops: [term('z3', 'bonding-orbital', 'bindandi svigrúma', replace)],
      en: BOND_EN,
      is: BOND_IS,
    });
    // Five replace words against a one-word target: term-op-too-wide fires beside it.
    expect({
      chars: [...replace].length > DEFAULT_LIMITS.maxReplaceChars,
      words: replace.split(' ').length <= DEFAULT_LIMITS.maxReplaceWords,
      reasons: r.rejected[0]?.reasons,
    }).toEqual({ chars: true, words: true, reasons: ['op-too-large', 'term-op-too-wide'] });
  });
  it('refuses a find over maxFindWords, within maxFindChars (op-too-large)', () => {
    const find = 'er kynnt til sögunnar til að útskýra rúmfræði bindandi svigrúma';
    const r = gate({
      ops: [term('z4', 'bonding-orbital', find, 'tengisvigrúma')],
      en: BOND_EN,
      is: BOND_IS,
    });
    expect({
      chars: [...find].length <= DEFAULT_LIMITS.maxFindChars,
      words: find.split(' ').length > DEFAULT_LIMITS.maxFindWords,
      reasons: r.rejected[0]?.reasons,
    }).toEqual({ chars: true, words: true, reasons: ['op-too-large'] });
  });
  it('refuses a replace over maxReplaceWords, within maxReplaceChars (op-too-large)', () => {
    const replace = 'tengisvigrúma sem eru mjög góð og afar vel til fundin';
    const r = gate({
      ops: [term('z5', 'bonding-orbital', 'bindandi svigrúma', replace)],
      en: BOND_EN,
      is: BOND_IS,
    });
    // Ten replace words against a one-word target: term-op-too-wide fires beside it.
    expect({
      chars: [...replace].length <= DEFAULT_LIMITS.maxReplaceChars,
      words: replace.split(' ').length > DEFAULT_LIMITS.maxReplaceWords,
      reasons: r.rejected[0]?.reasons,
    }).toEqual({ chars: true, words: true, reasons: ['op-too-large', 'term-op-too-wide'] });
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
    // fB wrote `sýrulögur` until review round 1; that holds sýra as a MODIFIER, which no
    // longer counts as carrying the target, so it now writes a compound whose head is sýra.
    const ops = [
      term('fA', 'acid', 'edik', 'ediksýra'),
      term('fB', 'acid', 'lögur', 'saltsýra'),
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
