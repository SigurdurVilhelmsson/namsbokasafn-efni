/**
 * The code gate's tokenizer (tools/ai-review/tokens.js): marker tokens, the marker multiset,
 * the editable spans an operation may touch, and the visible-prose projection the headword
 * check reads.
 *
 * Every fixture below is copied byte for byte from the committed chemistry corpus
 * (books/efnafraedi-2e/02-mt-output and 02-for-mt); the segment id is given beside each. An
 * "excerpt" is a verbatim substring of a longer segment. Retyped marker fixtures are how a
 * plan once carried ten silently non-parsing SEG markers, so none of these are retyped.
 */
import { describe, it, expect } from 'vitest';
import {
  tokenize,
  markerTokens,
  markerMultiset,
  editableSpans,
  visibleProse,
  EDITABLE_LABEL_TYPES,
} from '../ai-review/tokens.js';
import { usesHeadword } from '../lib/chapter-term-check.js';

// m68745:caption:CNX_Chem_08_02_sp3Geom-caption (ch08) — `sp3` is [[i:sp]][[sup:3]]
const SP3_IS =
  'Svigrúmablöndun eins [[i:s]]-svigrúms (blátt) og þriggja [[i:p]]-svigrúma (rauð) myndar fjögur jafngild [[i:sp]][[sup:3]]-blendingssvigrúm (gul) sem snúa með 109,5° horni hvert að öðru.';
// m68824:para:fs-idm242158160 (ch17) — the only "cell" is inside a sub payload
const ECELL_EN =
  'Combining a previously derived relation between ΔG° and K (see the chapter on thermodynamics) and the equation above relating ΔG° and [[i:E]]°[[sub:cell]] yields the following:';
// m68822:glossary-term:fs-idm153779040-term (ch17)
const CELLPOT_EN = 'cell potential ([[i:E]][[sub:cell]])';
const CELLPOT_IS = 'kerspenna ([[i:E]][[sub:ker]])';
// m68798:para:fs-idp17381824 (ch13) — literal concentration brackets around formulas
const CONC_IS =
  'Þegar 0,10 mól af NO[[sub:2]] er bætt í 1,0 L flösku við 25 °C breytist styrkurinn þannig að við jafnvægi er [NO[[sub:2]]] = 0,016 [[i:M]] og [N[[sub:2]]O[[sub:4]]] = 0,042 [[i:M]].';
// m68786:problem:fs-idm51132096 (ch12) — `[[[i:A]]]`: a literal bracket around a marker
const RATE_IS =
  '(b) Metið augnablikshraða eyðingar [[i:A]] við 15,0 s út frá grafi sem sýnir tíma á móti [[[i:A]]]. Hverjar eru einingar þessa hraða?';
// m68811:problem:fs-idp13178560 (ch15) — a link nested inside an i, closing as `]]]]`
const HANDBOOK_IS =
  '[[i:[[link:Handbook of Chemistry and Physics|http://openstax.org/l/16Handbook]]]] gefur upp leysni eftirfarandi efnasambanda í grömmum á 100 ml af vatni. Þar sem þessi efnasambönd eru aðeins örlítið leysanleg, gerðu ráð fyrir að rúmmálið breytist ekki við upplausn og reiknaðu leysnimargfeldið fyrir hvert þeirra.';
// m68863:entry:auto-104 (appendices) — markers nested inside a footnote payload
const PKW = 'pK[[sub:w]] [[fn:pK[[sub:w]] = –log[[sub:10]](K[[sub:w]])|fs-idm106976512]]';
// m68866:entry:auto-12 (appendices) — an em label holding a nested sub, with a tail
const EM = '[[em:H[[sub:3]]|emphasis-one]]AsO[[sub:4]]';
// m68674:para:fs-idm108028240 (ch01) — a link label, URL tail
const LINK_EN =
  'To learn more about the relationship between mass, volume, and density, use this [[link:interactive simulator|http://openstax.org/l/16phetmasvolden]] to explore the density of different materials.';
const LINK_IS =
  'Til að læra meira um sambandið milli massa, rúmmáls og eðlismassa skaltu nota þennan [[link:gagnvirka hermi|http://openstax.org/l/16phetmasvolden]] til að kanna eðlismassa mismunandi efna.';
// m68690:para:fs-idm262013360 (ch01) — a labelled docref, MATH used inline
const DOCREF_EN =
  'The leading zeros in this example are not significant. We could use exponential notation (as described in [[docref:Appendix B|m68860]]) and express the number as 8.32407 [[MATH:1]] 10[[sup:−3]]; then the number 8.32407 contains all of the significant figures, and 10[[sup:−3]] locates the decimal point.';
const DOCREF_IS =
  'Núllin á undan í þessu dæmi eru ekki markverð. Við gætum notað veldisvísanotkun (eins og lýst er í [[docref:viðauka B|m68860]]) og sett töluna fram sem 8,32407 [[MATH:1]] 10[[sup:−3]]; þá inniheldur talan 8,32407 alla markverðu stafina og 10[[sup:−3]] staðsetur kommuna.';
// m68683:problem:fs-idm103945312 (ch01) — an unlabelled docref: the payload is a target id
const DOCREF_BARE_IS =
  'Notaðu staðalform (veldisvísanotkun) til að tjá eftirfarandi magn með SI-grunneiningum í [[docref:m68674#fs-idm81346144]]:';
// m68667:para:fs-idm107801696 (ch01)
const XREF_IS =
  'Vatn samanstendur af frumefnunum vetni og súrefni í hlutfallinu 2 á móti 1. Hægt er að brjóta vatn niður í vetnis- og súrefnisgas með því að bæta við orku. Ein leið til þess er með rafhlöðu eða aflgjafa, eins og sýnt er á ([[xref:CNX_Chem_01_01_Electrolys]]).';
// m68685:item:fs-idp28280144-item-1 (ch02) — a term label with an id tail
const TERM_EN =
  'Matter is composed of exceedingly small particles called atoms. An [[term:atom|term-00002]] is the smallest unit of an element that can participate in a chemical change.';
const TERM_IS =
  'Efni er samsett úr afar smáum ögnum sem kallast atóm. [[term:Atóm|term-00002]] er minnsta eining frumefnis sem getur tekið þátt í efnabreytingu.';
// m68791:entry:auto-184 (ch12) and m68861:entry:auto-4 (appendices) — the bare markers
const SPACE_IS = '[[SPACE]]Núllta stig[[SPACE]]';
const BR_IS = '= 39,37 tommur (in.)[[BR]]= 1,094 stikur (yd)';
// m68860:para:fs-idp139858976 (appendices) — MATH inline, `×` between number and power
const MATH_IS = 'Leggið saman 5,00 [[MATH:1]] 10[[sup:−5]] og 3,00 [[MATH:2]] 10[[sup:−3]].';
// m68683:problem:fs-idm215457056 (ch01) — a fill-in blank
const BLANK_IS = '(a) 612 g = ________ mg';
// excerpts: legacy ~x~ / ^x^ (table summaries), MT-invented tags (alts)
const TILDE_IS =
  'Næst er ClF~3~-gas með gildin –158.99, –118.83 og 281.50. Næst er Cl~2~O-gas með gildin 80.3, 97.9 og 266.2.'; // m68865 summary, excerpt
const CARET_IS =
  'Co(OH)~3~ + e^-^ → Co(OH)~2~ + OH^-^ er rafskautsspennan plús 0,17. Fyrir hvarfhelminginn Cr^3+^ + 3e^-^ → Cr er rafskautsspennan mínus 0,744.'; // m68870 summary, excerpt
const TAG_IS =
  'Própan er sýnt sem einfaldlega CH<lágvísir>3</lágvísir>CH<lágvísir>2</lágvísir>CH<lágvísir>3</lágvísir>, þar sem tölurnar 1, 2 og 3 birtast fyrir ofan kolefnisatómin frá vinstri til hægri.'; // m68846 alt, excerpt
const SUBSCRIPT_TAG_IS = 'merkt „MnO<subscript>2</subscript> (bakskaut)“.'; // m68825 alt, excerpt

// m68685:caption:CNX_Chem_02_01_Dalton3-caption (ch02) — a bare URL in prose, no link marker
const URL_EN =
  'When the elements copper (a shiny, red-brown solid, shown here as brown spheres) and oxygen (a clear and colorless gas, shown here as red spheres) react, their atoms rearrange to form a compound containing copper and oxygen (a powdery, black solid). (credit copper: modification of work by http://images-of-elements.com/copper.php)';
const URL_IS =
  'Þegar frumefnin kopar (glansandi, rauðbrúnt fast efni, sýnt hér sem brúnar kúlur) og súrefni (tært og litlaust gas, sýnt hér sem rauðar kúlur) hvarfast, endurraðast atóm þeirra til að mynda efnasamband sem inniheldur kopar og súrefni (duftkennt, svart fast efni). (heimild kopar: breyting á verki eftir http://images-of-elements.com/copper.php)';
// The MT-invented marker shape quoted in unwrapInventedMarkers' docstring (tools/api-translate.js):
// a glossary lemma as the "type", the inflected form as the payload, markers nested inside.
const INVENTED = '[[sameind|C[[sub:4]]H[[sub:10]]]]';

const ALL = [
  SP3_IS,
  ECELL_EN,
  CELLPOT_EN,
  CELLPOT_IS,
  CONC_IS,
  RATE_IS,
  HANDBOOK_IS,
  PKW,
  EM,
  LINK_EN,
  LINK_IS,
  DOCREF_EN,
  DOCREF_IS,
  DOCREF_BARE_IS,
  XREF_IS,
  TERM_EN,
  TERM_IS,
  SPACE_IS,
  BR_IS,
  MATH_IS,
  BLANK_IS,
  TILDE_IS,
  CARET_IS,
  TAG_IS,
  SUBSCRIPT_TAG_IS,
  URL_EN,
  URL_IS,
  INVENTED,
];

const spanTexts = (text) => editableSpans(text).map((s) => s.text);

describe('tokenize', () => {
  it.each(ALL.map((t) => [t.slice(0, 40), t]))(
    'reassembles %j byte for byte from its top-level tokens',
    (_label, text) => {
      expect(
        tokenize(text)
          .nodes.map((n) => n.text)
          .join('')
      ).toBe(text);
    }
  );
  it.each(ALL.map((t) => [t.slice(0, 40), t]))('reports no problem on real text %j', (_l, text) => {
    expect(tokenize(text).problems).toEqual([]);
  });
  it('reports an unterminated marker as a problem', () => {
    expect(tokenize('fyrir [[i:abc og meira').problems.map((p) => p.code)).toEqual([
      'unterminated-marker',
    ]);
  });
  it('reports a stray closer as a problem', () => {
    expect(tokenize('fyrir abc]] og meira').problems.map((p) => p.code)).toEqual(['stray-closer']);
  });
  it('keeps the literal bracket of `[[[i:A]]]` as prose and the marker as one token', () => {
    const tail = tokenize(RATE_IS).nodes.slice(-3);
    expect(tail.map((n) => [n.kind, n.text])).toEqual([
      ['text', ' við 15,0 s út frá grafi sem sýnir tíma á móti ['],
      ['marker', '[[i:A]]'],
      ['text', ']. Hverjar eru einingar þessa hraða?'],
    ]);
  });
  it('closes two nesting levels at `]]]]`', () => {
    expect(tokenize(HANDBOOK_IS).nodes[0].text).toBe(
      '[[i:[[link:Handbook of Chemistry and Physics|http://openstax.org/l/16Handbook]]]]'
    );
  });
});

describe('markerTokens — every marker token, at every depth, in document order', () => {
  it('includes the bare [[SPACE]] markers', () => {
    expect(markerTokens(SPACE_IS)).toEqual(['[[SPACE]]', '[[SPACE]]']);
  });
  it('includes the bare [[BR]] marker', () => {
    expect(markerTokens(BR_IS)).toEqual(['[[BR]]']);
  });
  it('separates concentration brackets from the sub markers inside them', () => {
    expect(markerTokens(CONC_IS)).toEqual([
      '[[sub:2]]',
      '[[sub:2]]',
      '[[i:M]]',
      '[[sub:2]]',
      '[[sub:4]]',
      '[[i:M]]',
    ]);
  });
  it('lists a nested marker and the marker that holds it', () => {
    expect(markerTokens(PKW)).toEqual([
      '[[sub:w]]',
      '[[fn:pK[[sub:w]] = –log[[sub:10]](K[[sub:w]])|fs-idm106976512]]',
      '[[sub:w]]',
      '[[sub:10]]',
      '[[sub:w]]',
    ]);
  });
  it('walks into an MT-invented marker, so its nested markers are counted too', () => {
    expect(markerTokens(INVENTED)).toEqual([
      '[[sameind|C[[sub:4]]H[[sub:10]]]]',
      '[[sub:4]]',
      '[[sub:10]]',
    ]);
  });
  it('treats MATH placeholders as markers', () => {
    expect(markerTokens(MATH_IS)).toEqual(['[[MATH:1]]', '[[sup:−5]]', '[[MATH:2]]', '[[sup:−3]]']);
  });
});

describe('editableSpans — what an operation may touch', () => {
  it('pins the label types whose display text is editable', () => {
    expect(EDITABLE_LABEL_TYPES).toEqual(['i', 'b', 'u', 'em', 'term', 'fn', 'link', 'docref']);
  });
  it('offsets index into the original text', () => {
    expect(editableSpans(LINK_IS).every((s) => LINK_IS.slice(s.start, s.end) === s.text)).toBe(
      true
    );
  });
  it('exposes a link label', () => {
    expect(spanTexts(LINK_IS)).toContain('gagnvirka hermi');
  });
  it('protects the URL tail of a link', () => {
    expect(spanTexts(LINK_IS).some((t) => t.includes('openstax'))).toBe(false);
  });
  it('exposes a term label', () => {
    expect(spanTexts(TERM_IS)).toContain('Atóm');
  });
  it('protects a term id tail', () => {
    expect(spanTexts(TERM_IS).some((t) => t.includes('term-'))).toBe(false);
  });
  it('protects an i payload with no word of 4+ letters (the variable `sp`)', () => {
    expect(spanTexts(SP3_IS).some((t) => /\bsp\b|^s$|^p$/.test(t))).toBe(false);
  });
  it('protects a sup payload (`3` of sp3)', () => {
    expect(spanTexts(SP3_IS)).toContain(
      '-blendingssvigrúm (gul) sem snúa með 109,5° horni hvert að öðru.'
    );
  });
  it('protects a sub payload (`ker` of E_ker) while the prose `kerspenna` is editable', () => {
    expect(spanTexts(CELLPOT_IS)).toEqual(['kerspenna (', ')']);
  });
  it('exposes a labelled docref label', () => {
    expect(spanTexts(DOCREF_IS)).toContain('viðauka B');
  });
  it('protects an unlabelled docref, whose payload is a target id', () => {
    expect(spanTexts(DOCREF_BARE_IS).some((t) => t.includes('m68674'))).toBe(false);
  });
  it('protects the whole of an xref', () => {
    expect(spanTexts(XREF_IS).some((t) => t.includes('CNX'))).toBe(false);
  });
  it('protects MATH placeholders', () => {
    expect(spanTexts(MATH_IS).some((t) => t.includes('MATH'))).toBe(false);
  });
  it('exposes an em label (no variable exemption for em; the gate refuses `H` itself)', () => {
    expect(spanTexts(EM)).toEqual(['H', 'AsO']);
  });
  it('protects a link nested in an i whose own payload has no letters', () => {
    expect(spanTexts(HANDBOOK_IS).some((t) => t.includes('Handbook'))).toBe(false);
  });
  it('protects legacy ~x~ subscripts', () => {
    expect(spanTexts(TILDE_IS).some((t) => t.includes('~'))).toBe(false);
  });
  it('protects legacy ^x^ superscripts', () => {
    expect(spanTexts(CARET_IS).some((t) => t.includes('^'))).toBe(false);
  });
  it('protects MT-invented <lágvísir> tags', () => {
    expect(spanTexts(TAG_IS).some((t) => t.includes('lágvísir'))).toBe(false);
  });
  it('protects <subscript> tags', () => {
    expect(spanTexts(SUBSCRIPT_TAG_IS).some((t) => t.includes('subscript'))).toBe(false);
  });
  it('protects a bare URL in prose', () => {
    expect(spanTexts(URL_IS).some((t) => t.includes('images-of-elements'))).toBe(false);
  });
  it('protects all of an MT-invented marker', () => {
    expect(spanTexts(INVENTED)).toEqual([]);
  });
  it('protects a fill-in blank', () => {
    expect(spanTexts(BLANK_IS).some((t) => t.includes('_'))).toBe(false);
  });
  it('leaves ordinary prose editable (control)', () => {
    expect(spanTexts(TAG_IS).at(-1)).toBe(
      ', þar sem tölurnar 1, 2 og 3 birtast fyrir ofan kolefnisatómin frá vinstri til hægri.'
    );
  });
});

describe('markerMultiset — exact marker syntax, editable display text masked', () => {
  it('masks an editable label and keeps its tail exact', () => {
    expect(markerMultiset(LINK_IS)).toEqual(['[[link:…|http://openstax.org/l/16phetmasvolden]]']);
  });
  it('is unchanged by an edit inside a label', () => {
    const edited = LINK_IS.replace('gagnvirka hermi', 'gagnvirkt hermilíkan');
    expect(markerMultiset(edited)).toEqual(markerMultiset(LINK_IS));
  });
  it('changes when a tail changes', () => {
    const edited = LINK_IS.replace('16phetmasvolden', '16phetmass');
    expect(markerMultiset(edited)).not.toEqual(markerMultiset(LINK_IS));
  });
  it('changes when a protected payload changes (a renumbered MATH)', () => {
    expect(markerMultiset(MATH_IS.replace('[[MATH:2]]', '[[MATH:3]]'))).not.toEqual(
      markerMultiset(MATH_IS)
    );
  });
  it('changes when a marker is lost', () => {
    expect(markerMultiset(BR_IS.replace('[[BR]]', ' '))).not.toEqual(markerMultiset(BR_IS));
  });
  it('keeps a protected i payload exact', () => {
    expect(markerMultiset(SP3_IS)).toEqual(['[[i:p]]', '[[i:s]]', '[[i:sp]]', '[[sup:3]]']);
  });
});

describe('visibleProse — the projection headword checks read', () => {
  it('raw text fires usesHeadword inside a sub payload (the measured hazard)', () => {
    expect(usesHeadword('cell', ECELL_EN)).toBe(true);
  });
  it('the projection drops the sub payload, so the hazard is gone', () => {
    expect(usesHeadword('cell', visibleProse(ECELL_EN))).toBe(false);
  });
  it('a headword in prose survives the projection (control)', () => {
    expect(usesHeadword('cell', visibleProse(CELLPOT_EN))).toBe(true);
  });
  it('keeps a link label and drops its URL', () => {
    expect(visibleProse(LINK_EN)).toBe(
      'To learn more about the relationship between mass, volume, and density, use this interactive simulator to explore the density of different materials.'
    );
  });
  it('keeps a term label and drops its id', () => {
    expect(visibleProse(TERM_EN)).toBe(
      'Matter is composed of exceedingly small particles called atoms. An atom is the smallest unit of an element that can participate in a chemical change.'
    );
  });
  it('keeps a docref label, drops MATH and sup payloads', () => {
    expect(visibleProse(DOCREF_EN)).toBe(
      'The leading zeros in this example are not significant. We could use exponential notation (as described in Appendix B) and express the number as 8.32407 10; then the number 8.32407 contains all of the significant figures, and 10 locates the decimal point.'
    );
  });
  it('drops an unlabelled docref target and an xref id', () => {
    expect(visibleProse(DOCREF_BARE_IS) + visibleProse(XREF_IS)).not.toMatch(/m68674|CNX_Chem/);
  });
  it('drops a bare URL in prose', () => {
    expect(visibleProse(URL_EN)).toMatch(/\(credit copper: modification of work by$/);
  });
  it('turns the bare markers into spaces', () => {
    expect(visibleProse(SPACE_IS)).toBe('Núllta stig');
  });
});
