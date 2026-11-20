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

const TARGETS = [{"set": "never-official", "chapter": 1, "moduleId": "m68667", "segmentId": "m68667:para:fs-idm49120320"}, {"set": "never-official", "chapter": 1, "moduleId": "m68667", "segmentId": "m68667:alt:fs-idm54034640-alt"}, {"set": "never-official", "chapter": 2, "moduleId": "m68692", "segmentId": "m68692:table-summary:fs-idm87646592-summary"}, {"set": "never-official", "chapter": 2, "moduleId": "m68692", "segmentId": "m68692:entry:auto-161"}, {"set": "never-official", "chapter": 2, "moduleId": "m68692", "segmentId": "m68692:problem:fs-idm56609680"}, {"set": "never-official", "chapter": 2, "moduleId": "m68692", "segmentId": "m68692:solution:fs-idm134038192"}, {"set": "never-official", "chapter": 2, "moduleId": "m68692", "segmentId": "m68692:problem:fs-idm130368688"}, {"set": "never-official", "chapter": 2, "moduleId": "m68695", "segmentId": "m68695:para:fs-idm392133488"}, {"set": "never-official", "chapter": 2, "moduleId": "m68695", "segmentId": "m68695:alt:fs-idm413728400-alt"}, {"set": "never-official", "chapter": 2, "moduleId": "m68695", "segmentId": "m68695:para:fs-idm147211136"}, {"set": "never-official", "chapter": 2, "moduleId": "m68695", "segmentId": "m68695:problem:fs-idm447823856"}, {"set": "never-official", "chapter": 2, "moduleId": "m68695", "segmentId": "m68695:problem:fs-idm203188176"}, {"set": "never-official", "chapter": 2, "moduleId": "m68696", "segmentId": "m68696:para:fs-idp187565648"}, {"set": "never-official", "chapter": 2, "moduleId": "m68696", "segmentId": "m68696:para:fs-idp214730704"}, {"set": "never-official", "chapter": 2, "moduleId": "m68696", "segmentId": "m68696:para:fs-idp187587072"}, {"set": "never-official", "chapter": 2, "moduleId": "m68698", "segmentId": "m68698:table-summary:fs-idp282234816-summary"}, {"set": "never-official", "chapter": 2, "moduleId": "m68698", "segmentId": "m68698:entry:auto-18"}, {"set": "never-official", "chapter": 2, "moduleId": "m68698", "segmentId": "m68698:problem:fs-idp279466208"}, {"set": "never-official", "chapter": 4, "moduleId": "m68710", "segmentId": "m68710:para:fs-idm5793440"}, {"set": "never-official", "chapter": 4, "moduleId": "m68710", "segmentId": "m68710:problem:fs-idp89419440"}, {"set": "never-official", "chapter": 4, "moduleId": "m68714", "segmentId": "m68714:problem:fs-idp47839312"}, {"set": "never-official", "chapter": 6, "moduleId": "m68729", "segmentId": "m68729:problem:fs-idm1476208"}, {"set": "never-official", "chapter": 6, "moduleId": "m68734", "segmentId": "m68734:para:fs-idp29682592"}, {"set": "never-official", "chapter": 6, "moduleId": "m68734", "segmentId": "m68734:para:fs-idp28826352"}, {"set": "never-official", "chapter": 6, "moduleId": "m68734", "segmentId": "m68734:para:fs-idm8891728"}, {"set": "never-official", "chapter": 6, "moduleId": "m68734", "segmentId": "m68734:para:fs-idp77726784"}, {"set": "never-official", "chapter": 8, "moduleId": "m68747", "segmentId": "m68747:para:fs-idm113916160"}, {"set": "never-official", "chapter": 8, "moduleId": "m68747", "segmentId": "m68747:problem:fs-idm111685776"}, {"set": "never-official", "chapter": 10, "moduleId": "m68773", "segmentId": "m68773:para:fs-idp135414368"}, {"set": "never-official", "chapter": 10, "moduleId": "m68773", "segmentId": "m68773:para:fs-idp187605664"}, {"set": "never-official", "chapter": 10, "moduleId": "m68773", "segmentId": "m68773:problem:fs-idp109499216"}, {"set": "never-official", "chapter": 14, "moduleId": "m68805", "segmentId": "m68805:alt:fs-idp3283088-alt"}, {"set": "never-official", "chapter": 17, "moduleId": "m68825", "segmentId": "m68825:para:fs-idm181217728"}, {"set": "never-official", "chapter": 17, "moduleId": "m68825", "segmentId": "m68825:para:fs-idm162456704"}, {"set": "never-official", "chapter": 17, "moduleId": "m68825", "segmentId": "m68825:caption:CNX_Chem_17_05_LiIon-caption"}, {"set": "never-official", "chapter": 17, "moduleId": "m68825", "segmentId": "m68825:alt:fs-idm137917328-alt"}, {"set": "never-official", "chapter": 17, "moduleId": "m68825", "segmentId": "m68825:para:fs-idm171820144"}, {"set": "never-official", "chapter": 17, "moduleId": "m68825", "segmentId": "m68825:glossary-term:fs-idm118911936-term"}, {"set": "never-official", "chapter": 17, "moduleId": "m68825", "segmentId": "m68825:glossary-def:fs-idm118911936-def"}, {"set": "never-official", "chapter": 17, "moduleId": "m68825", "segmentId": "m68825:glossary-def:fs-idm206318304-def"}, {"set": "never-official", "chapter": 17, "moduleId": "m68826", "segmentId": "m68826:problem:fs-idp71069984"}, {"set": "never-official", "chapter": 17, "moduleId": "m68826", "segmentId": "m68826:solution:fs-idm142282624"}, {"set": "never-official", "chapter": 18, "moduleId": "m68829", "segmentId": "m68829:alt:fs-idp101665920-alt"}, {"set": "never-official", "chapter": 18, "moduleId": "m68829", "segmentId": "m68829:para:fs-idm8683616"}, {"set": "never-official", "chapter": 18, "moduleId": "m68829", "segmentId": "m68829:para:fs-idp103075664"}, {"set": "never-official", "chapter": 18, "moduleId": "m68829", "segmentId": "m68829:para:fs-idp66398992"}, {"set": "never-official", "chapter": 18, "moduleId": "m68829", "segmentId": "m68829:caption:CNX_Chem_18_01_LithiumRx-caption"}, {"set": "never-official", "chapter": 18, "moduleId": "m68829", "segmentId": "m68829:para:fs-idp151382672"}, {"set": "never-official", "chapter": 18, "moduleId": "m68829", "segmentId": "m68829:para:fs-idp44141360"}, {"set": "never-official", "chapter": 18, "moduleId": "m68829", "segmentId": "m68829:problem:fs-idm16110016"}, {"set": "never-official", "chapter": 18, "moduleId": "m68830", "segmentId": "m68830:para:fs-idp233041184"}, {"set": "never-official", "chapter": 18, "moduleId": "m68830", "segmentId": "m68830:problem:fs-idp111274816"}, {"set": "never-official", "chapter": 18, "moduleId": "m68835", "segmentId": "m68835:para:fs-idp20917824"}, {"set": "never-official", "chapter": 19, "moduleId": "m68842", "segmentId": "m68842:alt:fs-idm272821040-alt"}, {"set": "never-official", "chapter": 21, "moduleId": "m68856", "segmentId": "m68856:para:fs-idm24991392"}, {"set": "never-official", "chapter": -1, "moduleId": "m68859", "segmentId": "m68859:alt:fs-idp64991424-alt"}, {"set": "never-official", "chapter": -1, "moduleId": "m68865", "segmentId": "m68865:table-summary:fs-idp78188768-summary"}, {"set": "never-official", "chapter": -1, "moduleId": "m68865", "segmentId": "m68865:entry:auto-803"}, {"set": "never-official", "chapter": 2, "moduleId": "m68695", "segmentId": "m68695:para:fs-idm382436640"}, {"set": "never-official", "chapter": 6, "moduleId": "m68734", "segmentId": "m68734:para:fs-idp203409520"}, {"set": "never-official", "chapter": 21, "moduleId": "m68856", "segmentId": "m68856:table-summary:fs-idm128006320-summary"}, {"set": "never-official", "chapter": 21, "moduleId": "m68856", "segmentId": "m68856:entry:auto-33"}, {"set": "never-official", "chapter": 21, "moduleId": "m68856", "segmentId": "m68856:problem:fs-idm202190128"}, {"set": "never-official", "chapter": 21, "moduleId": "m68856", "segmentId": "m68856:problem:fs-idm32448240"}, {"set": "never-official", "chapter": 21, "moduleId": "m68856", "segmentId": "m68856:problem:fs-idm30976288"}];

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
