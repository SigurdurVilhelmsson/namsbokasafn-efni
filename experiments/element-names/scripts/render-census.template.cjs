// READ-ONLY census: how chemistry's segments render element names that have no chemistry
// glossary row. Send on stdin, cwd = server/scripts:  node - <book>
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

const ELEMENTS = /*ELEMENTS_JSON*/ [];

const book = process.argv[2];
const resolveDbPath = require(path.join(serverRoot, 'lib/dbPath'));
const db = new ReadOnlyDatabase(resolveDbPath());
const { listStudyUnits } = require(path.join(serverRoot, 'lib/studyUnits'));
const { englishHit } = require(path.join(serverRoot, 'lib/worklistMatch'));
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

const targets = ELEMENTS.filter((e) => e.target).map((e) => ({
  e,
  enSegments: 0,
  withCandidate: 0,
  noCandidate: [],
  bases: {},
  compounds: {},
  ambiguous: {},
  weak: {},
  unshaped: {},
}));

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
      let found = 0;
      for (const m of is.matchAll(WORD)) {
        const c = classify(m[0], t.e, en);
        if (!c) continue;
        if (c.tier === 'ambiguous' || c.tier === 'unshaped' || c.tier === 'weak') {
          const bag = t[c.tier];
          bag[c.word] = (bag[c.word] || 0) + 1;
          found += 1;
          continue;
        }
        found += 1;
        const b = (t.bases[c.base] = t.bases[c.base] || { standalone: 0, compound: 0, segments: new Set() });
        b[c.kind] += 1;
        b.segments.add(s.segmentId);
        if (c.kind === 'compound') t.compounds[c.word] = (t.compounds[c.word] || 0) + 1;
      }
      if (found) t.withCandidate += 1;
      else if (t.noCandidate.length < 3) t.noCandidate.push({ chapter: u.chapter, segmentId: s.segmentId, is: is.slice(0, 160) });
      else t.noCandidate.push({ segmentId: s.segmentId });
    }
  }
}

const rows = targets.map((t) => ({
  n: t.e.n,
  symbol: t.e.symbol,
  english: t.e.searchEnglish,
  official: t.e.official,
  note: t.e.note,
  enSegments: t.enSegments,
  withCandidate: t.withCandidate,
  noCandidateCount: t.noCandidate.length,
  noCandidateSamples: t.noCandidate.slice(0, 3),
  bases: Object.fromEntries(
    Object.entries(t.bases)
      .sort((a, b) => b[1].standalone + b[1].compound - (a[1].standalone + a[1].compound))
      .map(([k, v]) => [
        k,
        {
          standalone: v.standalone,
          compound: v.compound,
          segments: v.segments.size,
          official: t.e.official.some((o) => k === o.toLocaleLowerCase('is')),
        },
      ])
  ),
  topCompounds: Object.entries(t.compounds).sort((a, b) => b[1] - a[1]).slice(0, 6),
  ambiguous: t.ambiguous,
  weak: t.weak,
  unshaped: t.unshaped,
}));

const doc = {
  control: {
    registeredBooks: db.prepare('SELECT COUNT(*) n FROM registered_books').get().n,
    unitsListed: units.length,
    unreadable,
    openedDbPaths: [...new Set(opened)],
    targets: targets.length,
  },
  rows,
};
process.stdout.write(JSON.stringify(doc) + '\nEND-OF-REPORT\n', () => {
  process.exitCode = unreadable.length ? 1 : 0;
});
