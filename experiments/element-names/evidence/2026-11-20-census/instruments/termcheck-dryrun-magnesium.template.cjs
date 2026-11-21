// READ-ONLY dry run of the segment editor's term check for a magnesium -> magnesíum book entry.
// The entry is added to an IN-MEMORY copy of the database (file opened read-only -> serialize ->
// new Database(buffer)), never to the file; nothing goes through the route, so no inflection
// lookup is scheduled against the real database. Send on stdin, cwd = server/scripts:
//   node - <book>
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
const EN = 'magnesium';
const IS = 'magnesíum';
const TOKEN = /[\p{L}\p{N}_]*magnes[\p{L}\p{N}_]*/giu;

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
  mem.prepare('SELECT COUNT(*) n FROM concept_term').get(); // first read: fails here if the copy cannot open

  const terminologyService = require(path.join(serverRoot, 'services/terminologyService'));
  const ses = require(path.join(serverRoot, 'services/segmentEditorService'));
  const segmentParser = require(path.join(serverRoot, 'services/segmentParser'));
  const { buildScope, resolve } = require(path.join(serverRoot, 'lib/conceptResolver'));
  const layer = require(path.join(serverRoot, 'lib/bookGlossaryLayer'));
  const bin = require(path.join(serverRoot, 'lib/binInflections'));
  terminologyService._setTestDb(mem);
  ses._setTestDb(mem);

  // ── the drafts: deduplicated, conflicts recorded ──
  const draftById = new Map();
  const draftConflicts = [];
  for (const d of DRAFTS) {
    const o = draftById.get(d.segmentId);
    if (o && (o.current !== d.current || o.proposed !== d.proposed)) draftConflicts.push(d.segmentId);
    if (!o) draftById.set(d.segmentId, d);
  }

  // ── effective segments (what the editor shows, pending edits included) ──
  const units = [];
  const effective = new Map();
  let totalSegments = 0;
  for (const chapter of segmentParser.listChapters(book)) {
    for (const { moduleId } of segmentParser.listChapterModules(book, chapter)) {
      const segs = ses.buildEffectiveSegments(book, chapter, moduleId);
      totalSegments += segs.length;
      for (const s of segs) if (draftById.has(s.segmentId)) effective.set(s.segmentId, s.isContent);
      const mg = segs.filter((s) => s.enContent && /magnesium/i.test(s.enContent));
      if (mg.length) units.push({ chapter, moduleId, segs: mg });
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
  const mgIds = new Set(units.flatMap((u) => u.segs.map((s) => s.segmentId)));
  const mgDrafts = [...draftById.keys()].filter((id) => mgIds.has(id)).length;

  const isMg = (english) => String(english).toLowerCase() === EN;
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

  const excerpt = (text, re, width = 90) => {
    const m = re.exec(text);
    re.lastIndex = 0;
    if (!m) return text.slice(0, 2 * width);
    const a = Math.max(0, m.index - width);
    return (a > 0 ? '…' : '') + text.slice(a, m.index + m[0].length + width) + (m.index + m[0].length + width < text.length ? '…' : '');
  };

  let binForms = []; // filled before the classification is read
  const classify = (is, paradigm) => {
    const accepted = new Set([IS, ...paradigm].map((f) => f.toLowerCase()));
    const binSet = new Set(binForms.map((f) => f.toLowerCase()));
    const tokens = is.match(TOKEN) || [];
    const kinds = tokens.map((t) => {
      const l = t.toLowerCase();
      if (accepted.has(l)) return 'accepted';
      if (binSet.has(l)) return 'inflected-not-in-paradigm';
      if (l.startsWith(IS)) return 'closed-compound';
      if (l.startsWith('magnesín')) return 'non-official-magnesín';
      if (!l.startsWith('magnes')) return 'inner-compound';
      return 'other-magnes';
    });
    return { tokens, kinds: [...new Set(kinds)] };
  };

  const summarise = (res, paradigm) => {
    const s = { segments: res.size, matchedMagnesium: 0, passed: 0, issues: [], unclaimed: [], otherIssues: new Map() };
    for (const [id, r] of res) {
      const m = (r.matches || []).find((x) => isMg(x.english));
      const issue = (r.issues || []).find((x) => isMg(x.english));
      const others = (r.issues || []).filter((x) => !isMg(x.english)).map((x) => `${x.type}:${x.english}->${x.expected}`).sort();
      s.otherIssues.set(id, others.join(' | '));
      if (m) {
        s.matchedMagnesium++;
        if (!issue) s.passed++;
      } else {
        const idx = r.en.search(/magnesium/i);
        const claimer = (r.matches || []).find((x) => x.position <= idx && idx < x.position + x.english.length);
        s.unclaimed.push({
          segmentId: id,
          claimer: claimer
            ? { english: claimer.english, icelandic: claimer.icelandic, isFallback: claimer.isFallback, isTied: claimer.isTied }
            : null,
          en: excerpt(r.en, /magnesium/i, 60),
        });
      }
      if (issue) {
        const c = classify(r.is, paradigm);
        s.issues.push({
          segmentId: id,
          chapter: r.chapter,
          moduleId: r.moduleId,
          type: issue.type,
          used: issue.used || null,
          kinds: c.kinds,
          tokens: c.tokens,
          hasMgSymbol: /(^|[^\p{L}])Mg([^\p{L}]|$)/u.test(r.is),
          is: excerpt(r.is, /[\p{L}\p{N}_]*magnes[\p{L}\p{N}_]*/iu),
          en: excerpt(r.en, /magnesium/i, 60),
        });
      }
    }
    return s;
  };
  const diffOthers = (a, b) => [...a.otherIssues].filter(([id, v]) => b.otherIssues.get(id) !== v).map(([id, v]) => ({ segmentId: id, before: v, after: b.otherIssues.get(id) }));
  const pack = (s) => ({ ...s, otherIssues: undefined, issueCount: s.issues.length, unclaimedCount: s.unclaimed.length });

  // ── synthetic controls ──
  const synthChapter = (units.find((u) => u.chapter === 18) || units[0] || { chapter: 0 }).chapter;
  const SYN = [
    ['S1-standalone', 'Magnesium burns in air.', 'Magnesíum brennur í lofti.'],
    ['S2-genitive', 'The mass of magnesium is small.', 'Massi magnesíums er lítill.'],
    ['S3-closed-compound', 'The magnesium ion is small.', 'Magnesíumjónin er lítil.'],
    ['S4-hyphenated', 'The magnesium ion is small.', 'Magnesíum-jónin er lítil.'],
    ['S5-symbol-only', 'Magnesium is a metal.', 'Mg er málmur.'],
    ['S6-non-official', 'Magnesium is a metal.', 'Magnesín er málmur.'],
    ['S7-chloride', 'Add magnesium chloride.', 'Bætið við magnesíumklóríði.'],
  ];
  const synth = () => {
    const segs = SYN.map(([id, en, is]) => ({ segmentId: id, enContent: en, isContent: is }));
    const res = terminologyService.findTermsInSegments(segs, book, synthChapter);
    return Object.fromEntries(
      SYN.map(([id]) => {
        const r = res[id];
        const m = r.matches.find((x) => isMg(x.english));
        const i = r.issues.find((x) => isMg(x.english));
        return [id, { matched: m ? { icelandic: m.icelandic, isFallback: m.isFallback } : null, issue: i ? i.type : null, allMatches: r.matches.map((x) => x.english) }];
      })
    );
  };
  const resolveFacts = (chapter) => {
    const r = resolve(buildScope(mem, book, chapter), EN);
    return {
      chapter,
      winner: r.winner ? { conceptId: r.winner.conceptId, text: r.winner.text, domain: r.winner.domain } : null,
      reason: r.reason ?? null,
      tied: (r.tied || []).map((t) => t.text),
      outOfScope: (r.outOfScope || []).map((t) => `${t.text} (${t.domain})`),
    };
  };
  const enRows = mem.prepare("SELECT ct.id, c.domain FROM concept_term ct JOIN concept c ON c.id = ct.concept_id WHERE ct.lang = 'en' AND ct.text = ?").all(EN);

  // ── the paradigm the page's automatic BÍN lookup would write: computed now, written only for state B ──
  const csv = process.env.BIN_CSV_REHEARSAL || path.join(repoRoot, 'tools/data/SHsnid.csv');
  const key = IS.toLowerCase().trim();
  const byLemma = await bin.loadBinEntries(csv, new Set([key]));
  const all = byLemma.get(key) || [];
  let binOutcome = 'not-in-bin';
  let forms = null;
  if (all.length > 0) {
    const { entry, outcome } = bin.chooseEntry(bin.preferExactCase(all, IS));
    binOutcome = outcome;
    forms = entry ? bin.inflectionsFor(entry, key) : null;
    if (entry && forms === null) binOutcome = 'base-form-only';
  }
  binForms = forms || [];

  // ── state 0: no entry ──
  const r0 = { resolve: resolveFacts(synthChapter), synthetic: synth() };
  const base = { now: summarise(run('now'), []), fixed: summarise(run('fixed'), []) };

  // ── state A: the entry, no paradigm yet ──
  const added = layer.addEntry(mem, {
    book,
    english: [EN],
    icelandic: IS,
    reason: 'dry run (in-memory copy)',
    source: 'dry run',
    by: 'dry-run',
  });
  const isTerm = mem.prepare("SELECT id, text, inflections FROM concept_term WHERE concept_id = ? AND lang = 'is'").get(added.conceptId);
  if (isTerm.inflections != null) throw new Error('state A must have no stored paradigm');
  const rA = { resolve: resolveFacts(synthChapter), synthetic: synth() };
  const A = { now: summarise(run('now'), []), fixed: summarise(run('fixed'), []) };

  // ── state B: the paradigm written, as after the page's automatic lookup ──
  if (forms) mem.prepare("UPDATE concept_term SET inflections = ? WHERE id = ?").run(bin.formatInflectionsJson(forms), isTerm.id);
  const rB = { resolve: resolveFacts(synthChapter), synthetic: synth() };
  const B = { now: summarise(run('now'), binForms), fixed: summarise(run('fixed'), binForms) };

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
    totals: { segments: totalSegments, magnesiumSegments: mgIds.size, units: units.length },
    enRowsBefore: enRows,
    entry: { status: added.status, conceptId: added.conceptId, isTerm: { text: isTerm.text, inflections: isTerm.inflections } },
    bin: { outcome: binOutcome, forms },
    drafts: { unique: draftById.size, conflicts: draftConflicts, same: drift.same, drifted: drift.drifted, missing: drift.missing, inMagnesiumSegments: mgDrafts },
    resolve: { before: r0.resolve, afterA: rA.resolve, afterB: rB.resolve },
    synthetic: { chapter: synthChapter, before: r0.synthetic, A: rA.synthetic, B: rB.synthetic },
    variants: {
      'base.now': pack(base.now),
      'base.fixed': pack(base.fixed),
      'A.now': pack(A.now),
      'A.fixed': pack(A.fixed),
      'B.now': pack(B.now),
      'B.fixed': pack(B.fixed),
    },
    otherIssueChanges: { now: diffOthers(base.now, B.now), fixed: diffOthers(base.fixed, B.fixed) },
  };
  process.stdout.write(JSON.stringify(report) + '\nEND-OF-REPORT\n', () => {
    process.exitCode = 0;
  });
}

main().catch((err) => {
  process.stderr.write(String((err && err.stack) || err) + '\n');
  process.exitCode = 1;
});
