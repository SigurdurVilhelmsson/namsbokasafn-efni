// READ-ONLY dry lists: for each element name whose MT forms are partly official, the segments
// holding a non-official form (a segment that also holds the official name is kept). Built by build-never-official.py from render-census.cjs (same header,
// element table and classifier). Send on stdin, cwd = server/scripts:  node - <book>
process.exitCode = 1;
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'production';

const path = require('path');
const serverRoot = path.resolve(process.cwd(), '..');
const realPath = require.resolve('better-sqlite3', { paths: [serverRoot] });
const Real = require(realPath);
const opened = [];
class ReadOnlyDatabase extends Real {
  constructor(file, opts = {}) {
    opened.push(path.resolve(String(file)));
    super(file, { ...opts, readonly: true, fileMustExist: true });
  }
}
require.cache[realPath].exports = ReadOnlyDatabase;

const ELEMENTS = [{"n": 1, "symbol": "H", "english": ["hydrogen"], "official": ["vetni"], "target": false, "note": null, "searchEnglish": ["hydrogen"]}, {"n": 2, "symbol": "He", "english": ["helium"], "official": ["helíum"], "target": true, "note": null, "searchEnglish": ["helium"]}, {"n": 3, "symbol": "Li", "english": ["lithium"], "official": ["liþíum"], "target": true, "note": null, "searchEnglish": ["lithium"]}, {"n": 4, "symbol": "Be", "english": ["beryllium"], "official": ["beryllíum"], "target": true, "note": null, "searchEnglish": ["beryllium"]}, {"n": 5, "symbol": "B", "english": ["boron"], "official": ["bór"], "target": false, "note": null, "searchEnglish": ["boron"]}, {"n": 6, "symbol": "C", "english": ["carbon"], "official": ["kolefni"], "target": false, "note": null, "searchEnglish": ["carbon"]}, {"n": 7, "symbol": "N", "english": ["nitrogen"], "official": ["köfnunarefni", "nitur"], "target": false, "note": null, "searchEnglish": ["nitrogen"]}, {"n": 8, "symbol": "O", "english": ["oxygen"], "official": ["súrefni"], "target": false, "note": null, "searchEnglish": ["oxygen"]}, {"n": 9, "symbol": "F", "english": ["fluorine"], "official": ["flúor"], "target": false, "note": null, "searchEnglish": ["fluorine"]}, {"n": 10, "symbol": "Ne", "english": ["neon"], "official": ["neon"], "target": false, "note": null, "searchEnglish": ["neon"]}, {"n": 11, "symbol": "Na", "english": ["sodium", "natrium"], "official": ["natríum"], "target": true, "note": null, "searchEnglish": ["sodium", "natrium"]}, {"n": 12, "symbol": "Mg", "english": ["magnesium"], "official": ["magnesíum"], "target": true, "note": null, "searchEnglish": ["magnesium"]}, {"n": 13, "symbol": "Al", "english": ["aluminium", "aluminum"], "official": ["ál"], "target": true, "note": "aluminum (US) only; aluminium resolves to ál", "searchEnglish": ["aluminum"]}, {"n": 14, "symbol": "Si", "english": ["silicon"], "official": ["kísill"], "target": false, "note": null, "searchEnglish": ["silicon"]}, {"n": 15, "symbol": "P", "english": ["phosphorus"], "official": ["fosfór"], "target": false, "note": null, "searchEnglish": ["phosphorus"]}, {"n": 16, "symbol": "S", "english": ["sulfur"], "official": ["brennisteinn"], "target": false, "note": null, "searchEnglish": ["sulfur"]}, {"n": 17, "symbol": "Cl", "english": ["chlorine"], "official": ["klór"], "target": false, "note": null, "searchEnglish": ["chlorine"]}, {"n": 18, "symbol": "Ar", "english": ["argon"], "official": ["argon"], "target": false, "note": null, "searchEnglish": ["argon"]}, {"n": 19, "symbol": "K", "english": ["potassium", "kalium"], "official": ["kalíum"], "target": true, "note": null, "searchEnglish": ["potassium", "kalium"]}, {"n": 20, "symbol": "Ca", "english": ["calcium"], "official": ["kalsíum"], "target": true, "note": null, "searchEnglish": ["calcium"]}, {"n": 21, "symbol": "Sc", "english": ["scandium"], "official": ["skandíum"], "target": true, "note": null, "searchEnglish": ["scandium"]}, {"n": 22, "symbol": "Ti", "english": ["titanium"], "official": ["títan"], "target": false, "note": null, "searchEnglish": ["titanium"]}, {"n": 23, "symbol": "V", "english": ["vanadium"], "official": ["vanadíum"], "target": true, "note": null, "searchEnglish": ["vanadium"]}, {"n": 24, "symbol": "Cr", "english": ["chromium"], "official": ["króm"], "target": false, "note": null, "searchEnglish": ["chromium"]}, {"n": 25, "symbol": "Mn", "english": ["manganese"], "official": ["mangan"], "target": false, "note": null, "searchEnglish": ["manganese"]}, {"n": 26, "symbol": "Fe", "english": ["iron", "ferrum"], "official": ["járn"], "target": false, "note": null, "searchEnglish": ["iron", "ferrum"]}, {"n": 27, "symbol": "Co", "english": ["cobalt"], "official": ["kóbalt"], "target": false, "note": null, "searchEnglish": ["cobalt"]}, {"n": 28, "symbol": "Ni", "english": ["nickel"], "official": ["nikkel"], "target": false, "note": null, "searchEnglish": ["nickel"]}, {"n": 29, "symbol": "Cu", "english": ["copper", "cuprum"], "official": ["kopar"], "target": false, "note": null, "searchEnglish": ["copper", "cuprum"]}, {"n": 30, "symbol": "Zn", "english": ["zinc"], "official": ["sink"], "target": false, "note": null, "searchEnglish": ["zinc"]}, {"n": 31, "symbol": "Ga", "english": ["gallium"], "official": ["gallíum"], "target": true, "note": null, "searchEnglish": ["gallium"]}, {"n": 32, "symbol": "Ge", "english": ["germanium"], "official": ["germaníum"], "target": false, "note": null, "searchEnglish": ["germanium"]}, {"n": 33, "symbol": "As", "english": ["arsenic"], "official": ["arsen"], "target": false, "note": null, "searchEnglish": ["arsenic"]}, {"n": 34, "symbol": "Se", "english": ["selenium"], "official": ["selen"], "target": false, "note": null, "searchEnglish": ["selenium"]}, {"n": 35, "symbol": "Br", "english": ["bromine"], "official": ["bróm"], "target": false, "note": null, "searchEnglish": ["bromine"]}, {"n": 36, "symbol": "Kr", "english": ["krypton"], "official": ["krypton"], "target": false, "note": null, "searchEnglish": ["krypton"]}, {"n": 37, "symbol": "Rb", "english": ["rubidium"], "official": ["rúbidíum"], "target": true, "note": null, "searchEnglish": ["rubidium"]}, {"n": 38, "symbol": "Sr", "english": ["strontium"], "official": ["strontíum"], "target": true, "note": null, "searchEnglish": ["strontium"]}, {"n": 39, "symbol": "Y", "english": ["yttrium"], "official": ["yttríum"], "target": true, "note": null, "searchEnglish": ["yttrium"]}, {"n": 40, "symbol": "Zr", "english": ["zirconium"], "official": ["sirkoníum"], "target": false, "note": null, "searchEnglish": ["zirconium"]}, {"n": 41, "symbol": "Nb", "english": ["niobium"], "official": ["níóbíum"], "target": true, "note": null, "searchEnglish": ["niobium"]}, {"n": 42, "symbol": "Mo", "english": ["molybdenum"], "official": ["mólýbden"], "target": false, "note": null, "searchEnglish": ["molybdenum"]}, {"n": 43, "symbol": "Tc", "english": ["technetium"], "official": ["teknetíum"], "target": true, "note": null, "searchEnglish": ["technetium"]}, {"n": 44, "symbol": "Ru", "english": ["ruthenium"], "official": ["rúþeníum"], "target": false, "note": null, "searchEnglish": ["ruthenium"]}, {"n": 45, "symbol": "Rh", "english": ["rhodium"], "official": ["ródíum"], "target": true, "note": null, "searchEnglish": ["rhodium"]}, {"n": 46, "symbol": "Pd", "english": ["palladium"], "official": ["palladíum"], "target": true, "note": null, "searchEnglish": ["palladium"]}, {"n": 47, "symbol": "Ag", "english": ["silver", "argentum"], "official": ["silfur"], "target": false, "note": null, "searchEnglish": ["silver", "argentum"]}, {"n": 48, "symbol": "Cd", "english": ["cadmium"], "official": ["kadmíum"], "target": true, "note": null, "searchEnglish": ["cadmium"]}, {"n": 49, "symbol": "In", "english": ["indium"], "official": ["indíum"], "target": true, "note": null, "searchEnglish": ["indium"]}, {"n": 50, "symbol": "Sn", "english": ["tin", "stannum"], "official": ["tin"], "target": false, "note": null, "searchEnglish": ["tin", "stannum"]}, {"n": 51, "symbol": "Sb", "english": ["antimony", "stibium"], "official": ["antímon"], "target": false, "note": null, "searchEnglish": ["antimony", "stibium"]}, {"n": 52, "symbol": "Te", "english": ["tellurium"], "official": ["tellúr"], "target": false, "note": null, "searchEnglish": ["tellurium"]}, {"n": 53, "symbol": "I", "english": ["iodine"], "official": ["joð"], "target": false, "note": null, "searchEnglish": ["iodine"]}, {"n": 54, "symbol": "Xe", "english": ["xenon"], "official": ["xenon"], "target": false, "note": null, "searchEnglish": ["xenon"]}, {"n": 55, "symbol": "Cs", "english": ["caesium", "cesium"], "official": ["sesíum"], "target": true, "note": null, "searchEnglish": ["caesium", "cesium"]}, {"n": 56, "symbol": "Ba", "english": ["barium"], "official": ["baríum"], "target": true, "note": null, "searchEnglish": ["barium"]}, {"n": 57, "symbol": "La", "english": ["lanthanum"], "official": ["lanþan"], "target": false, "note": null, "searchEnglish": ["lanthanum"]}, {"n": 58, "symbol": "Ce", "english": ["cerium"], "official": ["seríum"], "target": true, "note": null, "searchEnglish": ["cerium"]}, {"n": 59, "symbol": "Pr", "english": ["praseodymium"], "official": ["praseódýmíum"], "target": false, "note": null, "searchEnglish": ["praseodymium"]}, {"n": 60, "symbol": "Nd", "english": ["neodymium"], "official": ["neódýmíum"], "target": false, "note": null, "searchEnglish": ["neodymium"]}, {"n": 61, "symbol": "Pm", "english": ["promethium"], "official": ["prómeþíum"], "target": true, "note": null, "searchEnglish": ["promethium"]}, {"n": 62, "symbol": "Sm", "english": ["samarium"], "official": ["samaríum"], "target": true, "note": null, "searchEnglish": ["samarium"]}, {"n": 63, "symbol": "Eu", "english": ["europium"], "official": ["evrópíum"], "target": true, "note": null, "searchEnglish": ["europium"]}, {"n": 64, "symbol": "Gd", "english": ["gadolinium"], "official": ["gadólíníum"], "target": true, "note": null, "searchEnglish": ["gadolinium"]}, {"n": 65, "symbol": "Tb", "english": ["terbium"], "official": ["terbíum"], "target": true, "note": null, "searchEnglish": ["terbium"]}, {"n": 66, "symbol": "Dy", "english": ["dysprosium"], "official": ["dysprósíum"], "target": true, "note": null, "searchEnglish": ["dysprosium"]}, {"n": 67, "symbol": "Ho", "english": ["holmium"], "official": ["hólmíum"], "target": true, "note": null, "searchEnglish": ["holmium"]}, {"n": 68, "symbol": "Er", "english": ["erbium"], "official": ["erbíum"], "target": true, "note": null, "searchEnglish": ["erbium"]}, {"n": 69, "symbol": "Tm", "english": ["thulium"], "official": ["túlíum"], "target": true, "note": null, "searchEnglish": ["thulium"]}, {"n": 70, "symbol": "Yb", "english": ["ytterbium"], "official": ["ytterbíum"], "target": true, "note": null, "searchEnglish": ["ytterbium"]}, {"n": 71, "symbol": "Lu", "english": ["lutetium"], "official": ["lútetíum"], "target": true, "note": null, "searchEnglish": ["lutetium"]}, {"n": 72, "symbol": "Hf", "english": ["hafnium"], "official": ["hafníum"], "target": true, "note": null, "searchEnglish": ["hafnium"]}, {"n": 73, "symbol": "Ta", "english": ["tantalum"], "official": ["tantal"], "target": false, "note": null, "searchEnglish": ["tantalum"]}, {"n": 74, "symbol": "W", "english": ["tungsten"], "official": ["wolfram", "tungsten"], "target": false, "note": null, "searchEnglish": ["tungsten"]}, {"n": 75, "symbol": "Re", "english": ["rhenium"], "official": ["reníum"], "target": true, "note": null, "searchEnglish": ["rhenium"]}, {"n": 76, "symbol": "Os", "english": ["osmium"], "official": ["osmíum"], "target": true, "note": null, "searchEnglish": ["osmium"]}, {"n": 77, "symbol": "Ir", "english": ["iridium"], "official": ["iridíum"], "target": true, "note": null, "searchEnglish": ["iridium"]}, {"n": 78, "symbol": "Pt", "english": ["platinum"], "official": ["platína"], "target": false, "note": null, "searchEnglish": ["platinum"]}, {"n": 79, "symbol": "Au", "english": ["gold", "aurum"], "official": ["gull"], "target": false, "note": null, "searchEnglish": ["gold", "aurum"]}, {"n": 80, "symbol": "Hg", "english": ["mercury", "hydrargyrum"], "official": ["kvikasilfur"], "target": false, "note": null, "searchEnglish": ["mercury", "hydrargyrum"]}, {"n": 81, "symbol": "Tl", "english": ["thallium"], "official": ["þallíum"], "target": true, "note": null, "searchEnglish": ["thallium"]}, {"n": 82, "symbol": "Pb", "english": ["lead", "plumbum"], "official": ["blý"], "target": true, "note": null, "searchEnglish": ["lead", "plumbum"]}, {"n": 83, "symbol": "Bi", "english": ["bismuth"], "official": ["bismút"], "target": false, "note": null, "searchEnglish": ["bismuth"]}, {"n": 84, "symbol": "Po", "english": ["polonium"], "official": ["póloníum"], "target": false, "note": null, "searchEnglish": ["polonium"]}, {"n": 85, "symbol": "At", "english": ["astatine"], "official": ["astatín"], "target": false, "note": null, "searchEnglish": ["astatine"]}, {"n": 86, "symbol": "Rn", "english": ["radon"], "official": ["radon"], "target": false, "note": null, "searchEnglish": ["radon"]}, {"n": 87, "symbol": "Fr", "english": ["francium"], "official": ["fransíum"], "target": true, "note": null, "searchEnglish": ["francium"]}, {"n": 88, "symbol": "Ra", "english": ["radium"], "official": ["radíum"], "target": true, "note": null, "searchEnglish": ["radium"]}, {"n": 89, "symbol": "Ac", "english": ["actinium"], "official": ["aktíníum"], "target": true, "note": null, "searchEnglish": ["actinium"]}, {"n": 90, "symbol": "Th", "english": ["thorium"], "official": ["þóríum"], "target": true, "note": null, "searchEnglish": ["thorium"]}, {"n": 91, "symbol": "Pa", "english": ["protactinium"], "official": ["prótaktíníum"], "target": true, "note": null, "searchEnglish": ["protactinium"]}, {"n": 92, "symbol": "U", "english": ["uranium"], "official": ["úran"], "target": false, "note": null, "searchEnglish": ["uranium"]}, {"n": 93, "symbol": "Np", "english": ["neptunium"], "official": ["neptúníum"], "target": false, "note": null, "searchEnglish": ["neptunium"]}, {"n": 94, "symbol": "Pu", "english": ["plutonium"], "official": ["plútóníum"], "target": false, "note": null, "searchEnglish": ["plutonium"]}, {"n": 95, "symbol": "Am", "english": ["americium"], "official": ["ameríkíum"], "target": true, "note": null, "searchEnglish": ["americium"]}, {"n": 96, "symbol": "Cm", "english": ["curium"], "official": ["curíum"], "target": true, "note": null, "searchEnglish": ["curium"]}, {"n": 97, "symbol": "Bk", "english": ["berkelium"], "official": ["berkelíum"], "target": true, "note": null, "searchEnglish": ["berkelium"]}, {"n": 98, "symbol": "Cf", "english": ["californium"], "official": ["kaliforníum"], "target": true, "note": null, "searchEnglish": ["californium"]}, {"n": 99, "symbol": "Es", "english": ["einsteinium"], "official": ["einsteiníum"], "target": true, "note": null, "searchEnglish": ["einsteinium"]}, {"n": 100, "symbol": "Fm", "english": ["fermium"], "official": ["fermíum"], "target": true, "note": null, "searchEnglish": ["fermium"]}, {"n": 101, "symbol": "Md", "english": ["mendelevium"], "official": ["mendelevíum"], "target": true, "note": null, "searchEnglish": ["mendelevium"]}, {"n": 102, "symbol": "No", "english": ["nobelium"], "official": ["nóbelíum"], "target": true, "note": null, "searchEnglish": ["nobelium"]}, {"n": 103, "symbol": "Lr", "english": ["lawrencium"], "official": ["lawrensíum"], "target": true, "note": null, "searchEnglish": ["lawrencium"]}, {"n": 104, "symbol": "Rf", "english": ["rutherfordium"], "official": ["rutherfordíum"], "target": true, "note": null, "searchEnglish": ["rutherfordium"]}, {"n": 105, "symbol": "Db", "english": ["dubnium"], "official": ["dubníum"], "target": true, "note": null, "searchEnglish": ["dubnium"]}, {"n": 106, "symbol": "Sg", "english": ["seaborgium"], "official": ["seaborgíum"], "target": true, "note": null, "searchEnglish": ["seaborgium"]}, {"n": 107, "symbol": "Bh", "english": ["bohrium"], "official": ["bohríum"], "target": true, "note": null, "searchEnglish": ["bohrium"]}, {"n": 108, "symbol": "Hs", "english": ["hassium"], "official": ["hassíum"], "target": true, "note": null, "searchEnglish": ["hassium"]}, {"n": 109, "symbol": "Mt", "english": ["meitnerium"], "official": ["meitneríum"], "target": true, "note": null, "searchEnglish": ["meitnerium"]}, {"n": 110, "symbol": "Ds", "english": ["darmstadtium"], "official": ["darmstadtíum"], "target": true, "note": null, "searchEnglish": ["darmstadtium"]}, {"n": 111, "symbol": "Rg", "english": ["roentgenium"], "official": ["röntgeníum"], "target": true, "note": null, "searchEnglish": ["roentgenium"]}, {"n": 112, "symbol": "Cn", "english": ["copernicium"], "official": ["kópernikíum"], "target": true, "note": null, "searchEnglish": ["copernicium"]}, {"n": 113, "symbol": "Nh", "english": ["nihonium"], "official": ["níhoníum"], "target": true, "note": null, "searchEnglish": ["nihonium"]}, {"n": 114, "symbol": "Fl", "english": ["flerovium"], "official": ["fleróvíum"], "target": true, "note": null, "searchEnglish": ["flerovium"]}, {"n": 115, "symbol": "Mc", "english": ["moscovium"], "official": ["moskóvíum"], "target": true, "note": null, "searchEnglish": ["moscovium"]}, {"n": 116, "symbol": "Lv", "english": ["livermorium"], "official": ["livermoríum"], "target": true, "note": null, "searchEnglish": ["livermorium"]}, {"n": 117, "symbol": "Ts", "english": ["tennessine"], "official": ["tennessín"], "target": true, "note": null, "searchEnglish": ["tennessine"]}, {"n": 118, "symbol": "Og", "english": ["oganesson"], "official": ["oganesson"], "target": true, "note": null, "searchEnglish": ["oganesson"]}];

const book = process.argv[2];
const resolveDbPath = require(path.join(serverRoot, 'lib/dbPath'));
const db = new ReadOnlyDatabase(resolveDbPath());
const { listStudyUnits } = require(path.join(serverRoot, 'lib/studyUnits'));
const { englishHit, findWholeWord, excerptOf } = require(path.join(serverRoot, 'lib/worklistMatch'));
const segmentParser = require(path.join(serverRoot, 'services/segmentParser'));
const ses = require(path.join(serverRoot, 'services/segmentEditorService'));

// 1:1 character folding (so indices in the folded word index the original word).
const FOLD = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ý: 'y', þ: 't', ð: 'd', æ: 'a', ö: 'o', c: 'k' };
const fold = (w) => [...w.toLocaleLowerCase('is')].map((ch) => FOLD[ch] || ch).join('');
const foldEn = (w) =>
  w.toLowerCase().replace(/th/g, 't').replace(/ph/g, 'f').replace(/rh/g, 'r').replace(/c/g, 'k').replace(/[^a-z]/g, '');
const stemLen = (k) => k.replace(/(ium|ine|in|um)$/, '').length;
const lcp = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

// Keys every element competes with: folded official names + folded English names.
const keys = ELEMENTS.map((e) => {
  const ks = [...e.official.map(fold), ...e.english.map(foldEn)];
  return { e, ks: [...new Set(ks)].map((k) => ({ k, strong: Math.min(4, Math.max(3, stemLen(k))) })) };
});
const scoreOf = (fw, ks) => ks.reduce((s, { k }) => Math.max(s, lcp(fw, k)), 0);
/** Elements with the longest prefix match (>= 3). */
function winner(fw) {
  let best = 0;
  let who = [];
  for (const { e, ks } of keys) {
    const s = scoreOf(fw, ks);
    if (s < 3) continue;
    if (s > best) {
      best = s;
      who = [e];
    } else if (s === best) who.push(e);
  }
  return { best, who };
}
const INFL_RE = /^(s|i|id|inu|sins)?$/;
/** Shortest split ending in ium|in (base >= 3 chars) whose remainder is an inflection or >= 3 letters. */
function split(fw, minP = 3) {
  for (let p = Math.max(3, minP); p <= fw.length; p++) {
    const head = fw.slice(0, p);
    if (!/(ium|in)$/.test(head)) continue;
    const rem = fw.slice(p);
    if (INFL_RE.test(rem)) return { p, kind: 'standalone' };
    if (rem.length >= 3) return { p, kind: 'compound' };
  }
  return null;
}
const PLAIN = (e) => e.official.every((o) => !/(íum|ín)$/.test(o)); // ál, blý, oganesson

/** @returns {null|{tier:'strong'|'weak'|'unshaped'|'ambiguous', base?, kind?, word}} */
function classify(word, e, enText) {
  const lw = word.toLocaleLowerCase('is');
  const fw = fold(word);
  if (PLAIN(e)) {
    const o = e.official.map((x) => x.toLocaleLowerCase('is')).find((x) => lw.startsWith(x));
    if (o) return { tier: 'strong', base: o, kind: INFL_RE.test(fold(lw.slice(o.length))) ? 'standalone' : 'compound', word };
  }
  const w = winner(fw);
  if (!w.who.includes(e)) return null;
  if (w.who.length > 1) {
    // Tie: give it to the tied element the segment's English names, if exactly one is named.
    const named = w.who.filter((x) => englishHit(enText, x.searchEnglish || x.english));
    if (!(named.length === 1 && named[0] === e)) return { tier: 'ambiguous', word };
  }
  const own = keys.find((x) => x.e === e).ks;
  const l = scoreOf(fw, own);
  const strongMin = Math.min(...own.map((x) => x.strong));
  const sp = split(fw, l); // a base never ends inside the matched prefix
  if (!sp) return l >= 4 ? { tier: 'unshaped', word } : null;
  return { tier: l >= strongMin ? 'strong' : 'weak', base: lw.slice(0, sp.p), kind: sp.kind, word };
}

const TARGETS = ["helium", "beryllium", "sodium", "magnesium", "aluminum", "potassium", "calcium", "scandium", "vanadium", "gallium", "rubidium", "strontium", "yttrium", "niobium", "technetium", "rhodium", "palladium", "cadmium", "indium", "caesium", "barium", "cerium", "europium", "terbium", "dysprosium", "holmium", "thulium", "lutetium", "rhenium", "osmium", "iridium", "thallium", "francium", "radium", "actinium", "thorium", "americium", "californium", "einsteinium", "mendelevium", "nobelium", "lawrencium", "rutherfordium", "seaborgium", "meitnerium", "roentgenium", "copernicium", "flerovium", "livermorium"];
const tset = new Set(TARGETS);
const targets = ELEMENTS.filter((e) => tset.has(e.searchEnglish[0])).map((e) => ({ e, enSegments: 0, alreadyOfficial: 0, items: [], misses: [] }));
if (targets.length !== TARGETS.length) throw new Error('not every target name is in the element table');
const isOfficial = (e, base) => e.official.some((o) => base === o.toLocaleLowerCase('is'));

const units = listStudyUnits({ book, booksDir: segmentParser.BOOKS_DIR });
const unreadable = [];
const WORD = /[\p{L}]+/gu;
for (const u of units) {
  let segs;
  try {
    segs = ses.buildEffectiveSegments(book, u.chapter, u.moduleId);
  } catch (err) {
    unreadable.push({ unit: u.unit, err: String(err && err.message) });
    continue;
  }
  for (const s of segs) {
    const en = s.enContent || '';
    const is = s.isContent || '';
    for (const t of targets) {
      if (!englishHit(en, t.e.searchEnglish)) continue;
      t.enSegments += 1;
      // Kept even when it also holds the official name: the editor fixes the non-official form there too.
      const alsoOfficial = !!findWholeWord(is, t.e.official, { exactCase: false });
      if (alsoOfficial) t.alreadyOfficial += 1;
      const strong = [];
      const near = [];
      for (const m of is.matchAll(WORD)) {
        const c = classify(m[0], t.e, en);
        if (!c) continue;
        if (c.tier === 'strong' && !isOfficial(t.e, c.base)) strong.push({ word: m[0], base: c.base, index: m.index });
        else if (c.tier === 'weak' || c.tier === 'unshaped') near.push({ word: m[0], tier: c.tier, index: m.index });
      }
      if (!strong.length && !near.length) {
        t.misses.push({ chapter: u.chapter, segmentId: s.segmentId, is: is.slice(0, 160) });
        continue;
      }
      const first = strong[0] || near[0];
      t.items.push({
        chapter: u.chapter,
        moduleId: u.moduleId,
        segmentId: s.segmentId,
        forms: strong.map((x) => x.word),
        bases: [...new Set(strong.map((x) => x.base))],
        near: near.map((x) => `${x.word} (${x.tier})`),
        excerpt: excerptOf(is, first.index, first.word.length),
        alsoOfficial,
      });
    }
  }
}

const doc = {
  control: {
    registeredBooks: db.prepare('SELECT COUNT(*) n FROM registered_books').get().n,
    unitsListed: units.length,
    unreadable,
    openedDbPaths: [...new Set(opened)],
    targets: TARGETS,
  },
  rows: targets.map((t) => ({
    n: t.e.n,
    english: t.e.searchEnglish,
    official: t.e.official,
    enSegments: t.enSegments,
    alreadyOfficial: t.alreadyOfficial,
    listed: t.items.length,
    listedStrong: t.items.filter((i) => i.forms.length).length,
    items: t.items,
    misses: t.misses,
  })),
};
process.stdout.write(JSON.stringify(doc) + '\nEND-OF-REPORT\n', () => {
  process.exitCode = unreadable.length ? 1 : 0;
});
