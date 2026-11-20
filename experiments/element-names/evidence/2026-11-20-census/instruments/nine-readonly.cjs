// READ-ONLY dry worklist for element names: EN name x the old Icelandic form chemistry resolves to,
// using the worklist's own matcher (matchSegment: whole word, old form + stored inflections, skip
// segments already holding the official name). Send on stdin, cwd = server/scripts:  node - <book>
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

// english -> official Icelandic (Vísindavefur 89909)
const PAIRS = [
  ['germanium', 'germaníum'],
  ['zirconium', 'sirkoníum'],
  ['ruthenium', 'rúþeníum'],
  ['lanthanum', 'lanþan'],
  ['praseodymium', 'praseódýmíum'],
  ['neodymium', 'neódýmíum'],
  ['polonium', 'póloníum'],
  ['astatine', 'astatín'],
  ['plutonium', 'plútóníum'],
];

const book = process.argv[2];
const resolveDbPath = require(path.join(serverRoot, 'lib/dbPath'));
const db = new ReadOnlyDatabase(resolveDbPath());
const { buildScope, resolve } = require(path.join(serverRoot, 'lib/conceptResolver'));
const { listStudyUnits } = require(path.join(serverRoot, 'lib/studyUnits'));
const { matchSegment, englishHit, findWholeWord, excerptOf } = require(path.join(serverRoot, 'lib/worklistMatch'));
const segmentParser = require(path.join(serverRoot, 'services/segmentParser'));
const ses = require(path.join(serverRoot, 'services/segmentEditorService'));

const scope = buildScope(db, book, 0);
const termStmt = db.prepare('SELECT id, text, inflections FROM concept_term WHERE id = ?');
const parseInfl = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return null;
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a : null;
  } catch {
    return null;
  }
};

const specs = PAIRS.map(([en, official]) => {
  const r = resolve(scope, en);
  const w = r.winner;
  const term = w ? termStmt.get(w.termId) : null;
  const infl = term ? parseInfl(term.inflections) : null;
  const old = w ? w.text : null;
  const oldForms = old ? [...new Set([old, ...(infl || [])])].filter((f) => f && f.toLocaleLowerCase('is') !== official.toLocaleLowerCase('is')) : [];
  return {
    english: en,
    official,
    resolvesTo: old,
    domain: w ? w.domain : null,
    reason: r.reason,
    conceptId: w ? w.conceptId : null,
    termId: w ? w.termId : null,
    inflectionsKnown: Array.isArray(infl),
    termTextMatches: term ? term.text === old : false,
    oldForms,
    stem: old,
    enSegments: 0,
    alreadyOfficial: 0,
    items: [],
    stemCensus: {},
  };
});

const units = listStudyUnits({ book, booksDir: segmentParser.BOOKS_DIR });
const unreadable = [];
for (const u of units) {
  let segs;
  try {
    segs = ses.buildEffectiveSegments(book, u.chapter, u.moduleId);
  } catch (e) {
    unreadable.push({ unit: u.unit, err: String(e && e.message) });
    continue;
  }
  for (const s of segs) {
    const en = s.enContent || '';
    const is = s.isContent || '';
    for (const sp of specs) {
      if (!sp.resolvesTo) continue;
      if (!englishHit(en, [sp.english])) continue;
      sp.enSegments += 1;
      if (findWholeWord(is, [sp.official], { exactCase: false })) sp.alreadyOfficial += 1;
      // diagnostic census: every word starting with the old stem, in EN-hit segments
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${sp.stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\p{L}*`, 'giu');
      for (const m of is.matchAll(re)) sp.stemCensus[m[0]] = (sp.stemCensus[m[0]] || 0) + 1;
      const hit = matchSegment(
        { enContent: en, isContent: is },
        { english: [sp.english], oldForms: sp.oldForms, newIcelandic: sp.official }
      );
      if (!hit) continue;
      sp.items.push({
        chapter: u.chapter,
        moduleId: u.moduleId,
        segmentId: s.segmentId,
        form: is.slice(hit.index, hit.index + hit.length),
        excerpt: excerptOf(is, hit.index, hit.length),
      });
    }
  }
}

const distinct = new Set(specs.flatMap((sp) => sp.items.map((i) => i.segmentId)));
const doc = {
  control: {
    registeredBooks: db.prepare('SELECT COUNT(*) n FROM registered_books').get().n,
    unitsListed: units.length,
    unreadable,
    openedDbPaths: [...new Set(opened)],
  },
  totals: { listings: specs.reduce((a, sp) => a + sp.items.length, 0), distinctSegments: distinct.size },
  specs,
};
process.stdout.write(JSON.stringify(doc) + '\nEND-OF-REPORT\n', () => {
  process.exitCode = unreadable.length ? 1 : 0;
});
