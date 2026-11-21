// READ-ONLY census of the two OPEN §C246 questions, with [USER]'s rulings of 2026-11-21 applied (base rule:
// the term may start a word, stored forms whole-word; a 4-letter minimum; the form `merki` excluded):
//   T1/T2/T3 - which of the check's three uses of a form take the prefix rule: winner + tie options + alternatives
//              (T1), winner + tie options (T2), winner only (T3); multi-word and hyphenated terms whole-phrase.
//   M1/M2    - multi-word and hyphenated terms: prefix on the whole phrase (M1), or only when the last word has 4+
//              letters (M2); both with T1's roles.
// Original header of the census this derives from:
// what a "word starts with the term" rule would do to the term check's CURRENT warnings in one book. Runs the real terminologyService twice: as installed (the control), and as a
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

const PATCHES = [
  ['const matchesForm = (term) => {', "const matchesForm = (term, role = 'winner') => {"],
  ['const re = buildInflectionRegex(term.text, paradigm);', 'const re = buildInflectionRegex(term.text, paradigm, role);'],
  ['if (hit.tied.some(matchesForm)) continue;', "if (hit.tied.some((t) => matchesForm(t, 'tie'))) continue;"],
  ['if (matchesForm(winner)) continue;', "if (matchesForm(winner, 'winner')) continue;"],
  ['alts.find(matchesForm) ||', "alts.find((t) => matchesForm(t, 'alt')) ||"],
  ['isTermsFor(winner.conceptId).find((t) => t.termId !== winner.termId && matchesForm(t));', "isTermsFor(winner.conceptId).find((t) => t.termId !== winner.termId && matchesForm(t, 'alt'));"],
  [`function buildInflectionRegex(icelandic, inflections) {
  return wholeWordRegex([icelandic, ...inflections]);
}`, `function buildInflectionRegex(icelandic, inflections, role) {
  const cfg = globalThis.__C246_CFG;
  if (!cfg || !cfg.roles.includes(role || 'winner') || !__c246PrefixOk(cfg, icelandic)) return wholeWordRegex([icelandic, ...inflections]);
  const Lb = '(?<![\\\\p{L}\\\\p{N}_])';
  const Rb = '(?![\\\\p{L}\\\\p{N}_])';
  const alt = (xs) => xs.filter(Boolean).map(escapeRegex).sort((a, b) => b.length - a.length).join('|');
  const parts = [Lb + '(?:' + alt([icelandic]) + ')'];
  if (alt(inflections)) parts.push(Lb + '(?:' + alt(inflections) + ')' + Rb);
  return new RegExp(parts.join('|'), 'giu');
}
function __c246PrefixOk(cfg, icelandic) {
  const text = String(icelandic || '');
  if (!text || cfg.exclude.includes(text.toLowerCase())) return false;
  if (/[\\s-]/.test(text)) {
    if (cfg.multipart === 'off') return false;
    if (cfg.multipart === 'phrase') return true;
    return [...text.split(/[\\s-]/).pop()].length >= cfg.minLen;
  }
  return [...text].length >= cfg.minLen;
}`],
];
const RULED = { minLen: 4, exclude: ['merki'] };
const ARMS = {
  T1: { ...RULED, roles: ['winner', 'tie', 'alt'], multipart: 'off' },
  T2: { ...RULED, roles: ['winner', 'tie'], multipart: 'off' },
  T3: { ...RULED, roles: ['winner'], multipart: 'off' },
  M1: { ...RULED, roles: ['winner', 'tie', 'alt'], multipart: 'phrase' },
  M2: { ...RULED, roles: ['winner', 'tie', 'alt'], multipart: 'last4' },
};
const prefixOk = (cfg, icelandic) => {
  const text = String(icelandic || '');
  if (!text || cfg.exclude.includes(text.toLowerCase())) return false;
  if (/[\s-]/.test(text)) {
    if (cfg.multipart === 'off') return false;
    if (cfg.multipart === 'phrase') return true;
    return [...text.split(/[\s-]/).pop()].length >= cfg.minLen;
  }
  return [...text].length >= cfg.minLen;
};

async function main() {
  if (!book) throw new Error('usage: node - <book>');
  const head = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD']).toString().trim();
  const dbPath = require(path.join(serverRoot, 'lib/dbPath'))();
  const before = { db: statOf(dbPath), wal: statOf(dbPath + '-wal') };
  const db = new ReadOnlyDatabase(dbPath);
  if (db.readonly !== true) throw new Error('the database handle is not read-only');

  const tsFile = path.join(serverRoot, 'services/terminologyService.js');
  const installed = require(tsFile);
  let src = fs.readFileSync(tsFile, 'utf8');
  for (const [a, b] of PATCHES) {
    if (src.split(a).length !== 2) throw new Error('a patch anchor must match exactly once: ' + a.slice(0, 60));
    src = src.replace(a, b);
  }
  const patched = new Module(tsFile, module);
  patched.filename = tsFile;
  patched.paths = Module._nodeModulePaths(path.dirname(tsFile));
  patched._compile(src, tsFile);
  const variant = patched.exports;
  if (variant === installed || typeof variant.findTermsInSegments !== 'function') throw new Error('patched copy did not load');

  const ses = require(path.join(serverRoot, 'services/segmentEditorService'));
  const segmentParser = require(path.join(serverRoot, 'services/segmentParser'));
  const { buildScope, resolve } = require(path.join(serverRoot, 'lib/conceptResolver'));
  installed._setTestDb(db);
  variant._setTestDb(db);
  ses._setTestDb(db);

  const units = [];
  for (const chapter of segmentParser.listChapters(book))
    for (const { moduleId } of segmentParser.listChapterModules(book, chapter))
      units.push({ chapter, moduleId, segs: ses.buildEffectiveSegments(book, chapter, moduleId) });
  const segById = new Map();
  for (const u of units) for (const s of u.segs) segById.set(s.segmentId, { ...s, chapter: u.chapter, moduleId: u.moduleId });

  const runAll = (svc, cfg) => {
    globalThis.__C246_CFG = cfg;
    const issues = new Map();
    const hash = crypto.createHash('sha256');
    for (const u of units) {
      const res = svc.findTermsInSegments(u.segs, book, u.chapter);
      for (const s of u.segs) {
        const r = res[s.segmentId] || { matches: [], issues: [] };
        hash.update(s.segmentId + '\u0000' + JSON.stringify(r) + '\n');
        for (const i of r.issues) issues.set(`${s.segmentId}\u0000${i.headwordId}`, { ...i, segmentId: s.segmentId, chapter: u.chapter });
      }
    }
    globalThis.__C246_CFG = null;
    return { issues, hash: hash.digest('hex') };
  };
  const t0 = Date.now();
  const V0 = runAll(installed, null);
  const OFF = runAll(variant, null);
  const RUNS = Object.fromEntries(Object.entries(ARMS).map(([k, cfg]) => [k, runAll(variant, cfg)]));
  const seconds = Math.round((Date.now() - t0) / 1000);
  const controlEqual = V0.hash === OFF.hash;

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
  const D = Object.fromEntries(Object.entries(RUNS).map(([k, run]) => [k, diff(run)]));

  const scopes = new Map();
  const scopeFor = (ch) => {
    if (!scopes.has(ch)) scopes.set(ch, { scope: buildScope(db, book, ch), memo: new Map() });
    return scopes.get(ch);
  };
  const termIdOf = db.prepare("SELECT id FROM concept_term WHERE concept_id = ? AND lang = 'is' AND text = ? ORDER BY rank, id LIMIT 1");
  const candidatesFor = (issue) => {
    const { scope, memo } = scopeFor(issue.chapter);
    if (!memo.has(issue.english)) {
      const r = resolve(scope, issue.english);
      let cands = [];
      if (r.winner) cands = [{ text: r.winner.text, role: 'winner' }];
      else if ((r.tied || []).length) cands = r.tied.map((t) => ({ text: t.text, role: 'tie' }));
      memo.set(issue.english, cands);
    }
    return memo.get(issue.english);
  };
  const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Enabling words under an arm: spans that start with a winner or tie candidate the arm lets match as a prefix.
  const enabling = (issue, cfg) => {
    const is = (segById.get(issue.segmentId) || {}).isContent || '';
    const out = [];
    for (const c of candidatesFor(issue)) {
      if (!cfg.roles.includes(c.role) || !prefixOk(cfg, c.text)) continue;
      const re = new RegExp(L + escRe(c.text) + '([\\p{L}\\p{N}_]+)', 'giu');
      for (const m of is.matchAll(re)) out.push({ base: c.text, form: c.text, role: c.role, word: m[0], tail: lc(m[1]), multipart: /[\s-]/.test(c.text) });
    }
    return out;
  };
  const lastPart = (x) => lc(x).split(/[\s-]/).pop();
  const attribution = {};
  for (const [k, cfg] of Object.entries(ARMS)) {
    const d = D[k];
    const removedWithoutWord = d.removed.filter((i) => enabling(i, cfg).length === 0).length;
    const survivingWithWord = [...RUNS[k].issues.values()].filter((i) => {
      const v = V0.issues.get(`${i.segmentId}\u0000${i.headwordId}`);
      return v && v.type === i.type && enabling(i, cfg).length > 0;
    }).length;
    attribution[k] = { removedWithoutWord, survivingWithWord };
  }

  const allEnabling = [];
  for (const [k, cfg] of Object.entries(ARMS)) for (const i of D[k].removed) for (const e of enabling(i, cfg)) allEnabling.push(e);
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
  const TRUE = new Set(['inflection', 'inflection-by-ending', 'compound']);
  const grp = (c) => (c.startsWith('false') ? 'false' : TRUE.has(c) ? 'true' : 'undecided');
  const bucket = (f) => {
    if (/-/.test(f) && !/\s/.test(f)) return 'hyphenated';
    if (/\s/.test(f)) return 'multi-word';
    const n = [...f].length;
    return n === 4 ? '4' : n === 5 ? '5' : n <= 7 ? '6-7' : n <= 10 ? '8-10' : '11+';
  };
  const report = (k) => {
    const cfg = ARMS[k];
    const d = D[k];
    const byBucket = {};
    const rows = [];
    let tieRemoved = 0;
    let altTypeRemoved = 0;
    for (const i of d.removed) {
      const es = enabling(i, cfg).map((e) => ({ ...e, cls: classify(e) }));
      const best = es.slice().sort((a, b) => RANK[a.cls] - RANK[b.cls])[0];
      const g = best ? grp(best.cls) : 'unattributed';
      const b = best ? bucket(best.form) : 'unattributed';
      byBucket[b] = byBucket[b] || { removed: 0, true: 0, undecided: 0, false: 0, unattributed: 0 };
      byBucket[b].removed++;
      byBucket[b][g]++;
      if (i.options) tieRemoved++;
      if (i.type === 'alternative') altTypeRemoved++;
      rows.push({ segmentId: i.segmentId, english: i.english, expected: i.expected, tie: Boolean(i.options), v0type: i.type, best: best ? { form: best.form, role: best.role, word: best.word, cls: best.cls } : null });
    }
    const transitions = {};
    for (const t of d.toAlternative) {
      const key = `${t.from.english}\u0000${t.from.expected}\u0000${t.to.used}`;
      transitions[key] = (transitions[key] || 0) + 1;
    }
    return {
      cfg,
      removed: d.removed.length,
      tieRemoved,
      altTypeRemoved,
      toAlternative: d.toAlternative.length,
      otherChange: d.otherChange.length,
      added: d.added,
      byBucket,
      transitions: Object.entries(transitions).map(([key, n]) => { const [english, expected, used] = key.split('\u0000'); return { english, expected, used, n }; }).sort((a, b) => b.n - a.n),
      rows,
    };
  };
  const after = { db: statOf(dbPath), wal: statOf(dbPath + '-wal') };
  const out = {
    head,
    book,
    dbPath,
    opened: [...new Set(opened)],
    fileUnchanged: JSON.stringify(before) === JSON.stringify(after),
    seconds,
    binRows,
    current: { warnings: V0.issues.size, ties: [...V0.issues.values()].filter((i) => i.options).length },
    controlEqual,
    hashes: Object.fromEntries([['installed', V0.hash], ['off', OFF.hash], ...Object.entries(RUNS).map(([k, r]) => [k, r.hash])]),
    attribution,
    arms: Object.fromEntries(Object.keys(ARMS).map((k) => [k, report(k)])),
  };
  process.stdout.write(JSON.stringify(out) + '\nEND-OF-REPORT\n', () => {
    process.exitCode = 0;
  });
}

main().catch((err) => {
  process.stderr.write(String((err && err.stack) || err) + '\n');
  process.exitCode = 1;
});
