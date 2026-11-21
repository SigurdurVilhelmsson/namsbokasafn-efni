// READ-ONLY census for register §C246: what a "word starts with the term" rule would do to the term check's
// CURRENT warnings in one book. Runs the real terminologyService twice: as installed (the control), and as a
// copy compiled from the same source with ONLY buildInflectionRegex changed, in three arms:
//   off  - unchanged behaviour (must equal the installed module over the whole corpus)
//   base - the term itself matches as the start of a word; stored inflected forms still only as whole words
//   all  - the term and every stored form match as the start of a word (§C246 design question 3)
// Every enabling word of a removed warning is classified with BÍN (read-only) and the concept model.
// Nothing is written: the database file is opened read-only. Send on stdin, cwd = server/scripts:
//   node - <book>
process.exitCode = 1;
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'production';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline');
const Module = require('module');
const { execFileSync } = require('child_process');
const serverRoot = path.resolve(process.cwd(), '..');
const repoRoot = path.resolve(serverRoot, '..');
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

const book = process.argv[2];
const statOf = (p) => {
  try {
    const s = fs.statSync(p);
    return { size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
};
const L = '(?<![\\p{L}\\p{N}_])';
const WORD = /[\p{L}\p{N}_]+/gu;
const lc = (s) => String(s).toLowerCase();

const ORIGINAL = `function buildInflectionRegex(icelandic, inflections) {
  return wholeWordRegex([icelandic, ...inflections]);
}`;
const PATCHED = `function buildInflectionRegex(icelandic, inflections) {
  const mode = globalThis.__C246_PREFIX_MODE || 'off';
  if (mode === 'off') return wholeWordRegex([icelandic, ...inflections]);
  const Lb = '(?<![\\\\p{L}\\\\p{N}_])';
  const Rb = '(?![\\\\p{L}\\\\p{N}_])';
  const alt = (xs) => xs.filter(Boolean).map(escapeRegex).sort((a, b) => b.length - a.length).join('|');
  const prefix = mode === 'all' ? [icelandic, ...inflections] : [icelandic];
  const whole = mode === 'all' ? [] : inflections;
  const parts = [];
  if (alt(prefix)) parts.push(Lb + '(?:' + alt(prefix) + ')');
  if (alt(whole)) parts.push(Lb + '(?:' + alt(whole) + ')' + Rb);
  return parts.length ? new RegExp(parts.join('|'), 'giu') : /(?!)/;
}`;

async function main() {
  if (!book) throw new Error('usage: node - <book>');
  const head = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD']).toString().trim();
  const dbPath = require(path.join(serverRoot, 'lib/dbPath'))();
  const before = { db: statOf(dbPath), wal: statOf(dbPath + '-wal') };
  const db = new ReadOnlyDatabase(dbPath);
  if (db.readonly !== true) throw new Error('the database handle is not read-only');

  const tsFile = path.join(serverRoot, 'services/terminologyService.js');
  const installed = require(tsFile);
  const src = fs.readFileSync(tsFile, 'utf8');
  if (src.split(ORIGINAL).length !== 2) throw new Error('the patch anchor must match exactly once');
  const patched = new Module(tsFile, module);
  patched.filename = tsFile;
  patched.paths = Module._nodeModulePaths(path.dirname(tsFile));
  patched._compile(src.replace(ORIGINAL, PATCHED), tsFile);
  const variant = patched.exports;
  if (variant === installed || typeof variant.findTermsInSegments !== 'function') throw new Error('patched copy did not load');

  const ses = require(path.join(serverRoot, 'services/segmentEditorService'));
  const segmentParser = require(path.join(serverRoot, 'services/segmentParser'));
  const { buildScope, resolve } = require(path.join(serverRoot, 'lib/conceptResolver'));
  installed._setTestDb(db);
  variant._setTestDb(db);
  ses._setTestDb(db);

  // ── the corpus: effective segments, as editors see them now ──
  const units = [];
  for (const chapter of segmentParser.listChapters(book))
    for (const { moduleId } of segmentParser.listChapterModules(book, chapter))
      units.push({ chapter, moduleId, segs: ses.buildEffectiveSegments(book, chapter, moduleId) });
  const segById = new Map();
  for (const u of units) for (const s of u.segs) segById.set(s.segmentId, { ...s, chapter: u.chapter, moduleId: u.moduleId });

  const runAll = (svc, mode) => {
    globalThis.__C246_PREFIX_MODE = mode;
    const issues = new Map(); // key -> issue
    const hash = crypto.createHash('sha256');
    for (const u of units) {
      const res = svc.findTermsInSegments(u.segs, book, u.chapter);
      for (const s of u.segs) {
        const r = res[s.segmentId] || { matches: [], issues: [] };
        hash.update(s.segmentId + '\u0000' + JSON.stringify(r) + '\n');
        for (const i of r.issues) issues.set(`${s.segmentId}\u0000${i.headwordId}`, { ...i, segmentId: s.segmentId, chapter: u.chapter });
      }
    }
    globalThis.__C246_PREFIX_MODE = 'off';
    return { issues, hash: hash.digest('hex') };
  };
  const t0 = Date.now();
  const V0 = runAll(installed, 'off');
  const C = runAll(variant, 'off');
  const B = runAll(variant, 'base');
  const A = runAll(variant, 'all');
  const seconds = Math.round((Date.now() - t0) / 1000);
  const controlEqual = V0.hash === C.hash;

  const diff = (arm) => {
    const removed = [];
    const toAlternative = [];
    const otherChange = [];
    for (const [k, i] of V0.issues) {
      const j = arm.issues.get(k);
      if (!j) removed.push(i);
      else if (j.type !== i.type) (i.type === 'missing' && j.type === 'alternative' ? toAlternative : otherChange).push({ from: i, to: j });
    }
    const added = [...arm.issues.keys()].filter((k) => !V0.issues.has(k)).length;
    return { removed, toAlternative, otherChange, added };
  };
  const dB = diff(B);
  const dA = diff(A);

  // ── the forms the check tested for each warning: the resolver's answer + its stored paradigm ──
  const scopes = new Map();
  const scopeFor = (ch) => {
    if (!scopes.has(ch)) scopes.set(ch, { scope: buildScope(db, book, ch), memo: new Map() });
    return scopes.get(ch);
  };
  const infl = db.prepare('SELECT inflections FROM concept_term WHERE id = ?');
  const termIdOf = db.prepare("SELECT id FROM concept_term WHERE concept_id = ? AND lang = 'is' AND text = ? ORDER BY rank, id LIMIT 1");
  const paradigm = (termId) => {
    if (termId == null) return [];
    const row = infl.get(termId);
    try {
      const v = row && row.inflections ? JSON.parse(row.inflections) : [];
      return Array.isArray(v) ? v.filter((f) => typeof f === 'string' && f) : [];
    } catch {
      return [];
    }
  };
  const candidatesFor = (issue) => {
    const { scope, memo } = scopeFor(issue.chapter);
    if (!memo.has(issue.english)) {
      const r = resolve(scope, issue.english);
      let cands = [];
      if (r.winner) cands = [{ text: r.winner.text, forms: paradigm(r.winner.termId) }];
      else if ((r.tied || []).length) cands = r.tied.map((t) => ({ text: t.text, forms: paradigm((termIdOf.get(t.conceptId, t.text) || {}).id) }));
      memo.set(issue.english, cands);
    }
    return memo.get(issue.english);
  };
  // Enabling words: spans of the segment that start with a tested form and run on to the end of its word, under
  // an arm. The same prefix regex as the patched check, one form at a time, so a hyphenated or multi-word term
  // (`Lewis-bygging` -> `Lewis-byggingu`) is seen exactly as the check sees it.
  const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const enabling = (issue, mode) => {
    const is = (segById.get(issue.segmentId) || {}).isContent || '';
    const out = [];
    for (const c of candidatesFor(issue)) {
      const prefixForms = mode === 'all' ? [c.text, ...c.forms] : [c.text];
      for (const f of prefixForms) {
        if (!f) continue;
        const re = new RegExp(L + escRe(f) + '([\\p{L}\\p{N}_]+)', 'giu');
        for (const m of is.matchAll(re)) out.push({ base: c.text, form: f, word: m[0], tail: lc(m[1]), multipart: /[\s-]/.test(f) });
      }
    }
    return out;
  };
  const lastPart = (x) => lc(x).split(/[\s-]/).pop();

  // attribution cross-check: removed -> >=1 enabling word; surviving -> none
  const attribution = {};
  for (const [name, arm, d] of [['base', B, dB], ['all', A, dA]]) {
    const missingWord = d.removed.filter((i) => enabling(i, name).length === 0).map((i) => `${i.segmentId}|${i.english}`);
    const survivingWithWord = [...arm.issues.values()].filter((i) => V0.issues.has(`${i.segmentId}\u0000${i.headwordId}`) && i.type === V0.issues.get(`${i.segmentId}\u0000${i.headwordId}`).type && enabling(i, name).length > 0).map((i) => `${i.segmentId}|${i.english}`);
    attribution[name] = { removedWithoutWord: missingWord.length, survivingWithWord: survivingWithWord.length, samples: [...missingWord.slice(0, 5), ...survivingWithWord.slice(0, 5)] };
  }

  // ── planted control: a term that resolves in chemistry, a nonsense tail and a real tail ──
  let planted = null;
  const pick = [...V0.issues.values()].filter((i) => !i.options && !/[\s-]/.test(i.expected) && [...i.expected].length >= 4).sort((a, b) => (a.segmentId < b.segmentId ? -1 : 1))[0];
  if (pick) {
    const en = pick.english;
    const t = pick.expected;
    const segs = [
      { segmentId: 'P-nonsense', enContent: `The ${en} is here.`, isContent: `${t}xqzv er hér.` },
      { segmentId: 'P-compound', enContent: `The ${en} is here.`, isContent: `${t}efni er hér.` },
    ];
    const r0 = installed.findTermsInSegments(segs, book, pick.chapter);
    globalThis.__C246_PREFIX_MODE = 'base';
    const r1 = variant.findTermsInSegments(segs, book, pick.chapter);
    globalThis.__C246_PREFIX_MODE = 'off';
    const own = (x) => x.english === en;
    planted = {
      english: en,
      term: t,
      warnsToday: segs.map((s) => Boolean(r0[s.segmentId].issues.find(own))),
      warnsUnderBase: segs.map((s) => Boolean(r1[s.segmentId].issues.find(own))),
      words: [
        { base: t, form: t, word: t + 'xqzv', tail: 'xqzv', multipart: false },
        { base: t, form: t, word: t + 'efni', tail: 'efni', multipart: false },
      ],
    };
  }
  // ── classification inputs: BÍN (one read-only pass) + the concept model's Icelandic terms ──
  const allEnabling = [];
  for (const [name, d] of [['base', dB], ['all', dA]]) for (const i of d.removed) for (const e of enabling(i, name)) allEnabling.push(e);
  if (planted) allEnabling.push(...planted.words);
  // Classification is by RULES, in order; the first that applies labels the word. For a hyphenated or multi-word
  // term, the word's last part is judged against the term's last part.
  const LINKS = ['', 's', 'a', 'u', 'ar', 'ur', 'na'];
  const ENDINGS = new Set(['s', 'i', 'a', 'u', 'ar', 'ir', 'ur', 'um', 'in', 'inn', 'ið', 'ins', 'inu', 'inum', 'ina', 'inni',
    'innar', 'n', 'nn', 'nu', 'num', 'na', 'nna', 'unum', 'anna', 'sins', 'ans', 'arinnar', 'arnir', 'irnir', 'urnar', 'unni',
    'una', 'ana', 'nir', 'nar', 'ni', 'nni', 'rnar', 'rinn', 'rnir', 'ra', 'rar', 'rir', 'rum', 'ð', 'ns']);
  const judged = (e) => (e.multipart ? { w: lastPart(e.word), b: lastPart(e.base) } : { w: lc(e.word), b: lc(e.base) });
  const words = new Set();
  const tails = new Set();
  for (const e of allEnabling) {
    const { w, b } = judged(e);
    words.add(w);
    words.add(b); // the term's own BÍN lemmas, for inflections whose lemma is not the term's spelling (gögn -> gagn)
    for (const k of LINKS) if (e.tail.startsWith(k) && e.tail.length - k.length >= 3) tails.add(e.tail.slice(k.length));
  }
  const conceptIs = new Set(db.prepare("SELECT DISTINCT lower(text) t FROM concept_term WHERE lang = 'is'").all().map((r) => r.t));
  const csv = process.env.BIN_CSV_REHEARSAL || path.join(repoRoot, 'tools/data/SHsnid.csv');
  const wordInfo = new Map(); // word -> [{lemma, cls}]
  const tailClasses = new Map(); // tail -> Set(classes)
  const rl = readline.createInterface({ input: fs.createReadStream(csv, { encoding: 'utf-8' }), crlfDelay: Infinity });
  let binRows = 0;
  for await (const line of rl) {
    if (!line) continue;
    binRows++;
    const row = line.split(';');
    const form = lc(row[4] || '').trim();
    const cls = (row[2] || '').trim();
    if (words.has(form)) {
      if (!wordInfo.has(form)) wordInfo.set(form, []);
      wordInfo.get(form).push({ lemma: lc(row[0]).trim(), cls });
    }
    if (tails.has(form)) {
      if (!tailClasses.has(form)) tailClasses.set(form, new Set());
      tailClasses.get(form).add(cls);
    }
  }
  const NOUN = new Set(['kk', 'kvk', 'hk']);
  const classify = (e) => {
    const { w, b } = judged(e);
    const info = wordInfo.get(w) || [];
    const baseLemmas = new Set([b, ...(wordInfo.get(b) || []).map((x) => x.lemma)]);
    if (info.some((x) => baseLemmas.has(x.lemma))) return 'inflection';
    for (const k of LINKS) {
      if (!e.tail.startsWith(k)) continue;
      const t = e.tail.slice(k.length);
      const tc = tailClasses.get(t);
      if (t.length >= 4 && (tc || conceptIs.has(t))) return 'compound';
      if (t.length === 3 && tc && [...tc].some((c) => NOUN.has(c))) return 'compound';
    }
    if (info.length) {
      const related = info.some((x) => x.lemma.startsWith(b) || b.startsWith(x.lemma) || [...baseLemmas].some((l) => x.lemma.startsWith(l)));
      if (!related) return 'false:unrelated-word';
      if (!info.some((x) => NOUN.has(x.cls))) return 'false:derived-non-noun';
      // a derived noun: BÍN's own lemma is the term plus a SHORT suffix that is not an ending (merki -> merking, klór -> klóríð)
      const nounLemmas = info.filter((x) => NOUN.has(x.cls) && x.lemma.startsWith(b) && x.lemma !== b);
      const short = (l) => l.slice(b.length).length <= 4 && !ENDINGS.has(l.slice(b.length));
      if (nounLemmas.length && nounLemmas.every((x) => short(x.lemma))) return 'false:derived-noun';
    }
    if (!info.length && ENDINGS.has(e.tail)) return 'inflection-by-ending';
    return 'undecided';
  };
  const RANK = { inflection: 0, 'inflection-by-ending': 1, compound: 2, undecided: 3, 'false:derived-noun': 4, 'false:derived-non-noun': 5, 'false:unrelated-word': 6 };
  const CLASSES = Object.keys(RANK);
  if (planted) planted.classes = planted.words.map((e) => `${e.word}:${classify(e)}`);
  const bucket = (f) => {
    if (/[\s-]/.test(f)) return 'multi-part';
    const n = [...f].length;
    return n <= 2 ? '1-2' : n === 3 ? '3' : n === 4 ? '4' : n === 5 ? '5' : n <= 7 ? '6-7' : n <= 10 ? '8-10' : '11+';
  };
  const BUCKETS = ['1-2', '3', '4', '5', '6-7', '8-10', '11+', 'multi-part'];

  const report = (name, d) => {
    const byBucket = Object.fromEntries(BUCKETS.map((b) => [b, { removed: 0, ...Object.fromEntries(CLASSES.map((c) => [c, 0])) }]));
    const pairs = new Map(); // form \0 word -> {form, word, tail, cls, count, terms:Set, samples:[]}
    const perTerm = new Map();
    const rows = [];
    for (const i of d.removed) {
      const es = enabling(i, name).map((e) => ({ ...e, cls: classify(e) }));
      if (!es.length) continue;
      const best = es.slice().sort((a, b) => RANK[a.cls] - RANK[b.cls] || [...a.form].length - [...b.form].length)[0];
      const bk = bucket(best.form);
      byBucket[bk].removed++;
      byBucket[bk][best.cls]++;
      for (const e of es) {
        const k = lc(e.form) + '\u0000' + lc(e.word);
        if (!pairs.has(k)) pairs.set(k, { form: e.form, word: lc(e.word), tail: e.tail, cls: e.cls, bucket: bucket(e.form), count: 0, terms: new Set(), samples: [] });
        const p = pairs.get(k);
        p.count++;
        p.terms.add(i.english);
        if (p.samples.length < 3) p.samples.push(i.segmentId);
      }
      const tk = `${i.english}\u0000${i.expected}`;
      if (!perTerm.has(tk)) perTerm.set(tk, { english: i.english, expected: i.expected, removed: 0, byClass: {} });
      const pt = perTerm.get(tk);
      pt.removed++;
      pt.byClass[best.cls] = (pt.byClass[best.cls] || 0) + 1;
      rows.push({ segmentId: i.segmentId, chapter: i.chapter, english: i.english, expected: i.expected, type: i.type, best: { form: best.form, word: best.word, cls: best.cls }, words: es.map((e) => `${e.word}:${e.cls}`) });
    }
    const pairClass = {};
    for (const p of pairs.values()) {
      pairClass[p.bucket] = pairClass[p.bucket] || {};
      pairClass[p.bucket][p.cls] = (pairClass[p.bucket][p.cls] || 0) + 1;
    }
    return {
      removed: d.removed.length,
      toAlternative: d.toAlternative.length,
      otherChange: d.otherChange.length,
      added: d.added,
      byBucket,
      distinctPairsByBucket: pairClass,
      pairs: [...pairs.values()].map((p) => ({ ...p, terms: [...p.terms].slice(0, 5), nTerms: p.terms.size })).sort((a, b) => b.count - a.count),
      perTerm: [...perTerm.values()].sort((a, b) => b.removed - a.removed),
      rows,
    };
  };

  // ── per-term current warnings (V0), for the "for every term" table ──
  const current = new Map();
  for (const i of V0.issues.values()) {
    const k = `${i.english}\u0000${i.expected}`;
    current.set(k, (current.get(k) || 0) + 1);
  }
  const v0Types = {};
  for (const i of V0.issues.values()) v0Types[i.type] = (v0Types[i.type] || 0) + 1;

  const after = { db: statOf(dbPath), wal: statOf(dbPath + '-wal') };
  const out = {
    head,
    book,
    dbPath,
    opened: [...new Set(opened)],
    fileUnchanged: JSON.stringify(before) === JSON.stringify(after),
    seconds,
    binRows,
    corpus: { units: units.length, segments: segById.size },
    current: { warnings: V0.issues.size, byType: v0Types, terms: current.size },
    controlEqual,
    hashes: { installed: V0.hash, off: C.hash, base: B.hash, all: A.hash },
    attribution,
    planted,
    base: report('base', dB),
    all: report('all', dA),
    currentPerTerm: [...current.entries()].map(([k, n]) => ({ english: k.split('\u0000')[0], expected: k.split('\u0000')[1], warnings: n })).sort((a, b) => b.warnings - a.warnings),
  };
  process.stdout.write(JSON.stringify(out) + '\nEND-OF-REPORT\n', () => {
    process.exitCode = 0;
  });
}

main().catch((err) => {
  process.stderr.write(String((err && err.stack) || err) + '\n');
  process.exitCode = 1;
});
