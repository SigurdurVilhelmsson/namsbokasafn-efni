// READ-ONLY: the effective Icelandic of the four periodic-table alt segments that still hold `neptún`.
// Send on stdin with cwd = server/scripts:  node - efnafraedi-2e
// Every better-sqlite3 handle opened in this process is forced readonly + fileMustExist.
process.exitCode = 1; // failure default
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

const book = process.argv[2];
const TARGETS = [
  'm68695:alt:fs-idm413728400-alt',
  'm68829:alt:fs-idp101665920-alt',
  'm68842:alt:fs-idm272821040-alt',
  'm68859:alt:fs-idp64991424-alt',
];
if (!book) {
  console.error('usage: node - <book>');
} else {
  const { listStudyUnits } = require(path.join(serverRoot, 'lib/studyUnits'));
  const segmentParser = require(path.join(serverRoot, 'services/segmentParser'));
  const ses = require(path.join(serverRoot, 'services/segmentEditorService'));
  const units = listStudyUnits({ book, booksDir: segmentParser.BOOKS_DIR });
  const out = [];
  for (const id of TARGETS) {
    const moduleId = id.split(':')[0];
    const u = units.find((x) => x.moduleId === moduleId);
    if (!u) {
      out.push({ segmentId: id, error: 'unit not found' });
      continue;
    }
    const seg = ses.buildEffectiveSegments(book, u.chapter, u.moduleId).find((s) => s.segmentId === id);
    out.push(
      seg
        ? { segmentId: id, chapter: u.chapter, moduleId, isContent: seg.isContent }
        : { segmentId: id, chapter: u.chapter, moduleId, error: 'segment not found' }
    );
  }
  const doc = { openedDbPaths: [...new Set(opened)].map((p) => p.replace(/^.*\/pipeline-output\//, '<repo>/pipeline-output/')), segments: out };
  process.stdout.write(JSON.stringify(doc) + '\nEND-OF-REPORT\n', () => {
    process.exitCode = out.every((s) => !s.error) ? 0 : 1;
  });
}
