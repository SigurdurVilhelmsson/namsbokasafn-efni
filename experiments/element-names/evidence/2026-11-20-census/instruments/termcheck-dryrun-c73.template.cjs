// READ-ONLY dry run of the segment editor's term check for the 59 book entries of the §C73 ruling,
// entered together as in one sitting. Every entry is added to an IN-MEMORY copy of the database
// (file opened read-only -> serialize -> new Database(buffer)), never to the file; nothing goes
// through the route, so no inflection lookup is scheduled against the real database.
// Send on stdin, cwd = server/scripts:   node - <book>
process.exitCode = 1;
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'production';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const serverRoot = path.resolve(process.cwd(), '..');
const repoRoot = path.resolve(serverRoot, '..');
const realPath = require.resolve('better-sqlite3', { paths: [serverRoot] });
const Real = require(realPath);
const opened = [];
class ReadOnlyDatabase extends Real {
  constructor(file, opts = {}) {
    if (Buffer.isBuffer(file)) {
      super(file, opts); // an in-memory copy from a serialized buffer: never a path
    } else {
      opened.push(path.resolve(String(file)));
      super(file, { ...opts, readonly: true, fileMustExist: true });
    }
  }
}
require.cache[realPath].exports = ReadOnlyDatabase;

const DRAFTS = __DRAFTS__;
const ENTRIES = __ENTRIES__; // [{english, forms, icelandic, nonOfficial: [bases]}]
const INFLECTION_SUFFIXES = new Set(['s', 'i', 'ið', 'inu', 'sins']); // neuter -íum nouns
const WORD = /[\p{L}\p{N}_]+/gu;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const book = process.argv[2];
const statOf = (p) => {
  try {
    const s = fs.statSync(p);
    return { size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
};

async function main() {
  if (!book) throw new Error('usage: node - <book>');
  if (ENTRIES.length !== 59) throw new Error(`expected 59 entries, got ${ENTRIES.length}`);
  const head = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD']).toString().trim();
  const dbPath = require(path.join(serverRoot, 'lib/dbPath'))();
  const before = { db: statOf(dbPath), wal: statOf(dbPath + '-wal') };

  const fileDb = new ReadOnlyDatabase(dbPath);
  if (fileDb.readonly !== true) throw new Error('file handle is not read-only');
  const buf = fileDb.serialize();
  const walHeader = [buf[18], buf[19]];
  if (buf[18] === 2) buf[18] = 1;
  if (buf[19] === 2) buf[19] = 1;
  fileDb.close();
  const mem = new ReadOnlyDatabase(buf);
  if (!(mem.memory === true && mem.readonly === false))
    throw new Error('the copy is not a writable in-memory database');
  mem.prepare('SELECT COUNT(*) n FROM concept_term').get();

  const terminologyService = require(path.join(serverRoot, 'services/terminologyService'));
  const ses = require(path.join(serverRoot, 'services/segmentEditorService'));
  const segmentParser = require(path.join(serverRoot, 'services/segmentParser'));
  const { buildScope, resolve } = require(path.join(serverRoot, 'lib/conceptResolver'));
  const layer = require(path.join(serverRoot, 'lib/bookGlossaryLayer'));
  const bin = require(path.join(serverRoot, 'lib/binInflections'));
  terminologyService._setTestDb(mem);
  ses._setTestDb(mem);

  // english form (lowercase) -> entry
  const entryOf = new Map();
  for (const e of ENTRIES) for (const f of e.forms) entryOf.set(f.toLowerCase(), e);
  const enRe = new RegExp(`\\b(?:${[...entryOf.keys()].map(esc).join('|')})\\b`, 'i');
  const enReOf = (e) => new RegExp(`\\b(?:${e.forms.map(esc).join('|')})\\b`, 'i');
  const entryForIssue = (english) => entryOf.get(String(english).toLowerCase()) || null;

  // ── drafts ──
  const draftById = new Map();
  const draftConflicts = [];
  for (const d of DRAFTS) {
    const o = draftById.get(d.segmentId);
    if (o && (o.current !== d.current || o.proposed !== d.proposed)) draftConflicts.push(d.segmentId);
    if (!o) draftById.set(d.segmentId, d);
  }

  // ── effective segments ──
  const units = [];
  const effective = new Map();
  let totalSegments = 0;
  for (const chapter of segmentParser.listChapters(book)) {
    for (const { moduleId } of segmentParser.listChapterModules(book, chapter)) {
      const segs = ses.buildEffectiveSegments(book, chapter, moduleId);
      totalSegments += segs.length;
      for (const s of segs) if (draftById.has(s.segmentId)) effective.set(s.segmentId, s.isContent);
      const hit = segs.filter((s) => s.enContent && enRe.test(s.enContent));
      if (hit.length) units.push({ chapter, moduleId, segs: hit });
    }
  }
  const drift = { same: 0, drifted: [], missing: [] };
  for (const [id, d] of draftById) {
    if (!effective.has(id)) drift.missing.push(id);
    else if (effective.get(id) === d.current) drift.same++;
    else drift.drifted.push(id);
  }
  const fixedOf = (s) => {
    const d = draftById.get(s.segmentId);
    return d && s.isContent === d.current ? d.proposed : s.isContent;
  };

  const run = (text) => {
    const out = new Map();
    for (const u of units) {
      const segs = u.segs.map((s) => ({
        segmentId: s.segmentId,
        enContent: s.enContent,
        isContent: text === 'fixed' ? fixedOf(s) : s.isContent,
      }));
      const res = terminologyService.findTermsInSegments(segs, book, u.chapter);
      for (const s of segs)
        out.set(s.segmentId, { chapter: u.chapter, moduleId: u.moduleId, en: s.enContent, is: s.isContent, ...res[s.segmentId] });
    }
    return out;
  };

  const excerpt = (text, re, width = 80) => {
    const m = re.exec(text);
    if (!m) return text.slice(0, 2 * width);
    const a = Math.max(0, m.index - width);
    const b = m.index + m[0].length + width;
    return (a > 0 ? '…' : '') + text.slice(a, b) + (b < text.length ? '…' : '');
  };

  // ── classification of one (segment, entry) warning, by token ──
  const paradigmOf = new Map(); // icelandic -> stored forms (state B)
  const classify = (is, e, paradigm) => {
    const O = e.icelandic.toLowerCase();
    const accepted = new Set([O, ...paradigm.map((f) => f.toLowerCase())]);
    const kinds = new Set();
    const tokens = [];
    for (const t of is.match(WORD) || []) {
      const l = t.toLowerCase();
      let k = null;
      if (accepted.has(l)) k = 'accepted';
      else if (l.startsWith(O) && INFLECTION_SUFFIXES.has(l.slice(O.length))) k = 'inflected-not-in-paradigm';
      else if (l.startsWith(O)) k = 'closed-compound';
      else if (e.nonOfficial.some((b) => l.startsWith(b.toLowerCase()))) k = 'non-official';
      else if (l.includes(O) && !ENTRIES.some((x) => x !== e && l.includes(x.icelandic.toLowerCase()))) k = 'inner-compound';
      if (k) {
        kinds.add(k);
        tokens.push(t);
      }
    }
    let cls;
    if (kinds.has('non-official')) cls = 'non-official';
    else if (kinds.has('inflected-not-in-paradigm')) cls = kinds.has('closed-compound') ? 'compound+inflection' : 'inflection-only';
    else if (kinds.has('closed-compound') || kinds.has('inner-compound')) cls = 'compound-only';
    else cls = 'no-name-token';
    const untranslated = e.forms.some((f) => new RegExp(`\\b${esc(f)}\\b`, 'i').test(is));
    return { cls, kinds: [...kinds], tokens, untranslatedEnglish: untranslated };
  };

  const summarise = (res, withParadigm) => {
    const per = new Map(ENTRIES.map((e) => [e.english, { enSegments: 0, matched: 0, passed: 0, warned: [], unclaimed: [] }]));
    const otherIssues = new Map();
    for (const [id, r] of res) {
      const others = (r.issues || []).filter((x) => !entryForIssue(x.english)).map((x) => `${x.type}:${x.english}->${x.expected}`).sort();
      otherIssues.set(id, others.join(' | '));
      for (const e of ENTRIES) {
        const re = enReOf(e);
        if (!re.test(r.en)) continue;
        const p = per.get(e.english);
        p.enSegments++;
        const own = (x) => entryForIssue(x.english) === e;
        const m = (r.matches || []).find(own);
        const issue = (r.issues || []).find(own);
        if (!m) {
          const idx = r.en.search(re);
          const claimer = (r.matches || []).find((x) => x.position <= idx && idx < x.position + x.english.length);
          p.unclaimed.push({
            segmentId: id,
            claimer: claimer ? { english: claimer.english, icelandic: claimer.icelandic, isFallback: claimer.isFallback } : null,
          });
          continue;
        }
        p.matched++;
        if (!issue) {
          p.passed++;
          continue;
        }
        const c = classify(r.is, e, withParadigm ? paradigmOf.get(e.icelandic) || [] : []);
        p.warned.push({
          segmentId: id,
          chapter: r.chapter,
          type: issue.type,
          ...c,
          is: excerpt(r.is, new RegExp(c.tokens.length ? esc(c.tokens[0]) : esc(e.icelandic.slice(0, 5)), 'iu')),
          en: excerpt(r.en, re, 60),
        });
      }
    }
    return { per, otherIssues };
  };
  const counts = (s) =>
    Object.fromEntries(
      [...s.per].map(([k, p]) => {
        const by = {};
        for (const w of p.warned) by[w.cls] = (by[w.cls] || 0) + 1;
        return [k, { enSegments: p.enSegments, matched: p.matched, passed: p.passed, warned: p.warned.length, byClass: by, unclaimed: p.unclaimed.length }];
      })
    );

  // ── BÍN: the forms the page's automatic lookup would write (computed now, written for state B) ──
  const csv = process.env.BIN_CSV_REHEARSAL || path.join(repoRoot, 'tools/data/SHsnid.csv');
  const keys = new Set(ENTRIES.map((e) => e.icelandic.toLowerCase().trim()));
  const byLemma = await bin.loadBinEntries(csv, keys);
  const binResult = {};
  for (const e of ENTRIES) {
    const key = e.icelandic.toLowerCase().trim();
    const all = byLemma.get(key) || [];
    let outcome = 'not-in-bin';
    let forms = null;
    if (all.length > 0) {
      const { entry, outcome: o } = bin.chooseEntry(bin.preferExactCase(all, e.icelandic));
      outcome = o;
      forms = entry ? bin.inflectionsFor(entry, key) : null;
      if (entry && forms === null) outcome = 'base-form-only';
    }
    binResult[e.english] = { outcome, forms };
  }

  // ── synthetic controls, per name ──
  const synthSegs = ENTRIES.flatMap((e) => {
    const f = e.forms[0];
    const O = e.icelandic;
    const Cap = O[0].toUpperCase() + O.slice(1);
    return [
      { segmentId: `${e.english}|pass`, enContent: `${f[0].toUpperCase() + f.slice(1)} is an element.`, isContent: `${Cap} er frumefni.` },
      { segmentId: `${e.english}|compound`, enContent: `The ${f} ion is small.`, isContent: `${Cap}jónin er lítil.` },
    ];
  });
  const synth = () => {
    const res = terminologyService.findTermsInSegments(synthSegs, book, 0);
    const out = { passOk: 0, compoundWarns: 0, notMatched: [], anomalies: [] };
    for (const e of ENTRIES) {
      for (const kind of ['pass', 'compound']) {
        const r = res[`${e.english}|${kind}`];
        const own = (x) => entryForIssue(x.english) === e;
        const m = r.matches.find(own);
        const issue = r.issues.find(own);
        if (!m) out.notMatched.push(`${e.english}|${kind}`);
        else if (kind === 'pass' && !issue && !m.isFallback) out.passOk++;
        else if (kind === 'compound' && issue) out.compoundWarns++;
        else out.anomalies.push({ id: `${e.english}|${kind}`, isFallback: m.isFallback, issue: issue ? issue.type : null });
      }
    }
    return out;
  };

  // ── state 0: no entries ──
  const synth0 = synth();
  const base = summarise(run('fixed'), false);

  // ── add all 59, as in one sitting ──
  const added = {};
  const refusals = [];
  for (const e of ENTRIES) {
    try {
      const r = layer.addEntry(mem, {
        book,
        english: e.forms,
        icelandic: e.icelandic,
        reason: 'dry run (in-memory copy)',
        source: 'dry run',
        by: 'dry-run',
      });
      added[e.english] = r.conceptId;
    } catch (err) {
      refusals.push({ english: e.english, refusal: err.refusal || String(err.message) });
    }
  }
  const scope = buildScope(mem, book, 0);
  const resolveCheck = ENTRIES.flatMap((e) =>
    e.forms
      .map((f) => {
        const r = resolve(scope, f);
        return r.winner && r.winner.conceptId === added[e.english] && r.winner.text === e.icelandic ? null : { form: f, winner: r.winner, reason: r.reason };
      })
      .filter(Boolean)
  );

  // ── state A: entries, no paradigm ──
  const storedBefore = mem.prepare(`SELECT COUNT(*) n FROM concept_term WHERE lang = 'is' AND inflections IS NOT NULL AND concept_id IN (${Object.values(added).join(',') || 0})`).get().n;
  if (storedBefore !== 0) throw new Error('state A must have no stored paradigm');
  const synthA = synth();
  const A = summarise(run('fixed'), false);

  // ── state B: the paradigms written ──
  const upd = mem.prepare("UPDATE concept_term SET inflections = ? WHERE concept_id = ? AND lang = 'is'");
  for (const e of ENTRIES) {
    const f = binResult[e.english].forms;
    if (f && added[e.english]) {
      upd.run(bin.formatInflectionsJson(f), added[e.english]);
      paradigmOf.set(e.icelandic, f);
    }
  }
  const synthB = synth();
  const Bnow = summarise(run('now'), true);
  const B = summarise(run('fixed'), true);

  const otherChanges = [...base.otherIssues].filter(([id, v]) => B.otherIssues.get(id) !== v).map(([id, v]) => ({ segmentId: id, before: v, after: B.otherIssues.get(id) }));
  const after = { db: statOf(dbPath), wal: statOf(dbPath + '-wal') };
  const report = {
    head,
    book,
    dbPath,
    opened: [...new Set(opened)],
    walHeader,
    fileUnchanged: JSON.stringify(before) === JSON.stringify(after),
    before,
    after,
    totals: { segments: totalSegments, candidateSegments: units.reduce((n, u) => n + u.segs.length, 0), units: units.length },
    drafts: { unique: draftById.size, conflicts: draftConflicts, same: drift.same, drifted: drift.drifted, missing: drift.missing },
    added: Object.keys(added).length,
    refusals,
    resolveCheck,
    bin: Object.fromEntries(Object.entries(binResult).map(([k, v]) => [k, { outcome: v.outcome, nForms: v.forms ? v.forms.length : 0 }])),
    synthetic: { before: synth0, A: synthA, B: synthB },
    counts: { 'base.fixed': counts(base), 'A.fixed': counts(A), 'B.now': counts(Bnow), 'B.fixed': counts(B) },
    warnedB: Object.fromEntries([...B.per].map(([k, p]) => [k, p.warned])),
    warnedBnowIds: Object.fromEntries([...Bnow.per].map(([k, p]) => [k, p.warned.map((w) => w.segmentId)])),
    warnedAIds: Object.fromEntries([...A.per].map(([k, p]) => [k, p.warned.map((w) => w.segmentId)])),
    unclaimedB: Object.fromEntries([...B.per].map(([k, p]) => [k, p.unclaimed])),
    otherIssueChanges: otherChanges,
  };
  process.stdout.write(JSON.stringify(report) + '\nEND-OF-REPORT\n', () => {
    process.exitCode = 0;
  });
}

main().catch((err) => {
  process.stderr.write(String((err && err.stack) || err) + '\n');
  process.exitCode = 1;
});
