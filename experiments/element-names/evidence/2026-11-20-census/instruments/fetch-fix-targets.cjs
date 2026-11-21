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

const TARGETS = [{"set": "ruthenium", "chapter": 2, "moduleId": "m68695", "segmentId": "m68695:alt:fs-idm413728400-alt"}, {"set": "ruthenium", "chapter": 2, "moduleId": "m68695", "segmentId": "m68695:para:eip-630"}, {"set": "ruthenium", "chapter": 18, "moduleId": "m68829", "segmentId": "m68829:alt:fs-idp101665920-alt"}, {"set": "ruthenium", "chapter": 18, "moduleId": "m68832", "segmentId": "m68832:para:fs-idm162489136"}, {"set": "ruthenium", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:alt:fs-idm272821040-alt"}, {"set": "ruthenium", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:para:fs-idm66167072"}, {"set": "ruthenium", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:glossary-def:fs-idm194011232-def"}, {"set": "ruthenium", "chapter": -1, "moduleId": "m68859", "segmentId": "m68859:alt:fs-idp64991424-alt"}, {"set": "lanthanide", "chapter": 2, "moduleId": "m68695", "segmentId": "m68695:para:fs-idm177301632"}, {"set": "lanthanide", "chapter": 2, "moduleId": "m68695", "segmentId": "m68695:alt:fs-idm201007936-alt"}, {"set": "lanthanide", "chapter": 2, "moduleId": "m68695", "segmentId": "m68695:glossary-def:fs-idm376829360-def"}, {"set": "lanthanide", "chapter": 2, "moduleId": "m68695", "segmentId": "m68695:glossary-term:fs-idm380448704-term"}, {"set": "lanthanide", "chapter": 6, "moduleId": "m68734", "segmentId": "m68734:caption:CNX_Chem_06_04_Econtable-caption"}, {"set": "lanthanide", "chapter": 6, "moduleId": "m68734", "segmentId": "m68734:item:fs-idp203626048-item-1"}, {"set": "lanthanide", "chapter": 18, "moduleId": "m68831", "segmentId": "m68831:para:fs-idp421952"}, {"set": "lanthanide", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:para:fs-idm9696240"}, {"set": "lanthanide", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:para:fs-idm126025504"}, {"set": "lanthanide", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:note-title:fs-idm229057952-title"}, {"set": "lanthanide", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:para:fs-idm24167088"}, {"set": "lanthanide", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:para:fs-idm256905072"}, {"set": "lanthanide", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:para:fs-idm272757680"}, {"set": "lanthanide", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:para:fs-idm265281664"}, {"set": "lanthanide", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:problem:fs-idm214633312"}, {"set": "lanthanide", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:glossary-term:fs-idm108395328-term"}, {"set": "lanthanide", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:glossary-def:fs-idm108395328-def"}, {"set": "lanthanide", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:glossary-def:fs-idm42041824-def"}];

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
