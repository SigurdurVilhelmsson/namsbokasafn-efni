// READ-ONLY dry worklist for ruthenium using the forms the MT actually wrote (rúþen, rúþens,
// rúþeni, Rúþen), via the worklist's own matcher; skips segments already holding rúþeníum.
// Built from nine-readonly.cjs's read-only header. Send on stdin, cwd = server/scripts:  node - <book>
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


const ENGLISH = ['ruthenium'];
const OLD_FORMS = ['rúþen', 'rúþens', 'rúþeni', 'Rúþen'];
const OFFICIAL = 'rúþeníum';
const units = listStudyUnits({ book, booksDir: segmentParser.BOOKS_DIR });
const unreadable = [];
const items = [];
const census = {};
let enSegments = 0;
let alreadyOfficial = 0;
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
    if (!englishHit(en, ENGLISH)) continue;
    enSegments += 1;
    if (findWholeWord(is, [OFFICIAL], { exactCase: false })) alreadyOfficial += 1;
    for (const m of is.matchAll(/(?<![\p{L}\p{N}])rúþen\p{L}*/giu)) census[m[0]] = (census[m[0]] || 0) + 1;
    const hit = matchSegment({ enContent: en, isContent: is }, { english: ENGLISH, oldForms: OLD_FORMS, newIcelandic: OFFICIAL });
    if (!hit) continue;
    const forms = [...is.matchAll(/(?<![\p{L}\p{N}])rúþen\p{L}*/giu)].map((m) => m[0]).filter((w) => OLD_FORMS.some((f) => f.toLocaleLowerCase('is') === w.toLocaleLowerCase('is')));
    items.push({ chapter: u.chapter, moduleId: u.moduleId, segmentId: s.segmentId, form: is.slice(hit.index, hit.index + hit.length), occurrences: forms.length, excerpt: excerptOf(is, hit.index, hit.length) });
  }
}
const doc = {
  control: { registeredBooks: db.prepare('SELECT COUNT(*) n FROM registered_books').get().n, unitsListed: units.length, unreadable, openedDbPaths: [...new Set(opened)] },
  enSegments, alreadyOfficial, listed: items.length, census, items,
};
process.stdout.write(JSON.stringify(doc) + '\nEND-OF-REPORT\n', () => { process.exitCode = unreadable.length ? 1 : 0; });
