// READ-ONLY fetch of the current effective Icelandic (what the segment editor shows) and any live edit
// for a fixed list of segments. Send on stdin, cwd = server/scripts:  node - <book>
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

const TARGETS = [{"set": "inner", "chapter": 7, "moduleId": "m68742", "segmentId": "m68742:para:fs-idp122770240"}];

const out = [];
const byUnit = new Map();
for (const t of TARGETS) {
  const k = t.chapter + '|' + t.moduleId;
  if (!byUnit.has(k)) byUnit.set(k, []);
  byUnit.get(k).push(t);
}
for (const [k, ts] of byUnit) {
  const [chapter, moduleId] = [Number(k.split('|')[0]), k.split('|')[1]];
  const segs = ses.buildEffectiveSegments(book, chapter, moduleId);
  const edits = db.prepare("SELECT segment_id, status, created_at FROM segment_edits WHERE book = ? AND module_id = ? AND status NOT IN ('rejected','superseded')").all(book, moduleId);
  for (const t of ts) {
    const s = segs.find((x) => x.segmentId === t.segmentId);
    out.push({ ...t, found: !!s, current: s ? s.isContent : null, liveEdits: edits.filter((e) => e.segment_id === t.segmentId) });
  }
}
process.stdout.write(JSON.stringify({ openedDbPaths: [...new Set(opened)], registeredBooks: db.prepare('SELECT COUNT(*) n FROM registered_books').get().n, n: out.length, segments: out }) + '\nEND-OF-REPORT\n', () => { process.exitCode = 0; });
