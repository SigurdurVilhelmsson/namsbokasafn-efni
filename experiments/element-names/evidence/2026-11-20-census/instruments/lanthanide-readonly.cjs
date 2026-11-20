// READ-ONLY census of the lanthanide words: segments whose English holds lanthanide(s) or
// lanthanoid(s) (whole word, any case), and every Icelandic word there starting with lant/lanþ.
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


const ENGLISH = ['lanthanide', 'lanthanides', 'lanthanoid', 'lanthanoids'];
const STEM = /(?<![\p{L}\p{N}])lan[tþ]\p{L}*/giu;
const kind = (w) => {
  const l = w.toLocaleLowerCase('is');
  if (/^lan[tþ]an(ó)?íð/.test(l)) return l.startsWith('lanþ') ? 'derived-official' : 'derived-old';
  if (/^lan[tþ]an/.test(l)) return 'element';
  return 'other';
};
const units = listStudyUnits({ book, booksDir: segmentParser.BOOKS_DIR });
const unreadable = [];
const items = [];
const misses = [];
const forms = {};
const englishForms = {};
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
    const hit = englishHit(en, ENGLISH);
    if (!hit) continue;
    for (const f of ENGLISH) {
      if (findWholeWord(en, [f], { exactCase: false })) englishForms[f] = (englishForms[f] || 0) + 1;
    }
    const is = s.isContent || '';
    const words = [...is.matchAll(STEM)].map((m) => ({ word: m[0], index: m.index }));
    if (!words.length) {
      misses.push({ chapter: u.chapter, moduleId: u.moduleId, segmentId: s.segmentId, en: en.slice(0, 200), is: is.slice(0, 200) });
      continue;
    }
    for (const w of words) {
      const k = kind(w.word);
      forms[w.word] = forms[w.word] || { count: 0, kind: k };
      forms[w.word].count += 1;
    }
    const first = words.find((w) => kind(w.word).startsWith('derived')) || words[0];
    items.push({
      chapter: u.chapter,
      moduleId: u.moduleId,
      segmentId: s.segmentId,
      english: hit,
      words: words.map((w) => w.word),
      kinds: [...new Set(words.map((w) => kind(w.word)))],
      excerpt: excerptOf(is, first.index, first.word.length),
    });
  }
}
const doc = {
  control: { registeredBooks: db.prepare('SELECT COUNT(*) n FROM registered_books').get().n, unitsListed: units.length, unreadable, openedDbPaths: [...new Set(opened)] },
  englishSegments: items.length + misses.length,
  englishForms,
  withStemWord: items.length,
  withDerivedOld: items.filter((i) => i.kinds.includes('derived-old')).length,
  withDerivedOfficial: items.filter((i) => i.kinds.includes('derived-official')).length,
  forms,
  items,
  misses,
};
process.stdout.write(JSON.stringify(doc) + '\nEND-OF-REPORT\n', () => { process.exitCode = unreadable.length ? 1 : 0; });
