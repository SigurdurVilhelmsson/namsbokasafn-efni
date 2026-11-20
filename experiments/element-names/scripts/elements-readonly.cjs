// READ-ONLY: how chemistry's resolver renders every element name, at the book default and at
// every chapter scope, plus the export file's row. Send on stdin, cwd = server/scripts:
//   node - <book>
process.exitCode = 1;
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'production';

const path = require('path');
const fs = require('fs');
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

const ELEMENTS = `hydrogen helium lithium beryllium boron carbon nitrogen oxygen fluorine neon sodium magnesium
aluminum aluminium silicon phosphorus sulfur sulphur chlorine argon potassium calcium scandium titanium
vanadium chromium manganese iron cobalt nickel copper zinc gallium germanium arsenic selenium bromine
krypton rubidium strontium yttrium zirconium niobium molybdenum technetium ruthenium rhodium palladium
silver cadmium indium tin antimony tellurium iodine xenon cesium caesium barium lanthanum cerium
praseodymium neodymium promethium samarium europium gadolinium terbium dysprosium holmium erbium thulium
ytterbium lutetium hafnium tantalum tungsten rhenium osmium iridium platinum gold mercury thallium lead
bismuth polonium astatine radon francium radium actinium thorium protactinium uranium neptunium plutonium
americium curium berkelium californium einsteinium fermium mendelevium nobelium lawrencium rutherfordium
dubnium seaborgium bohrium hassium meitnerium darmstadtium roentgenium copernicium nihonium flerovium
moscovium livermorium tennessine oganesson`
  .split(/\s+/)
  .filter(Boolean);

const book = process.argv[2];
const resolveDbPath = require(path.join(serverRoot, 'lib/dbPath'));
const db = new ReadOnlyDatabase(resolveDbPath());
const { buildScope, resolve } = require(path.join(serverRoot, 'lib/conceptResolver'));
const { listStudyUnits } = require(path.join(serverRoot, 'lib/studyUnits'));
const segmentParser = require(path.join(serverRoot, 'services/segmentParser'));

const chapters = [
  ...new Set(listStudyUnits({ book, booksDir: segmentParser.BOOKS_DIR }).map((u) => u.chapter)),
].sort((a, b) => a - b);
const scopes = new Map([[0, buildScope(db, book, 0)], ...chapters.map((c) => [c, buildScope(db, book, c)])]);

const gfile = path.join(serverRoot, '..', 'books', book, 'glossary', 'glossary-unified.json');
const g = JSON.parse(fs.readFileSync(gfile, 'utf-8'));
const terms = Array.isArray(g) ? g : g.terms || [];
const exportBy = new Map();
for (const t of terms) {
  const k = String(t.english || '').toLowerCase();
  if (!exportBy.has(k)) exportBy.set(k, []);
  exportBy.get(k).push(t);
}

const alt = (list) => (list || []).map((a) => `${a.text}@${a.domain}`);
const rows = [];
for (const en of ELEMENTS) {
  const r0 = resolve(scopes.get(0), en);
  const w = r0.winner;
  const deviations = [];
  for (const c of chapters) {
    const rc = resolve(scopes.get(c), en);
    const a = rc.winner ? `${rc.winner.text}@${rc.winner.domain}/${rc.reason}` : null;
    const b = w ? `${w.text}@${w.domain}/${r0.reason}` : null;
    if (a !== b) deviations.push({ chapter: c, resolves: a });
  }
  const ex = (exportBy.get(en) || []).map((t) => ({ icelandic: t.icelandic, domain: t.domain, reason: t.reason }));
  rows.push({
    english: en,
    icelandic: w ? w.text : null,
    domain: w ? w.domain : null,
    position: w ? w.position : null,
    conceptId: w ? w.conceptId : null,
    reason: r0.reason,
    alsoInScope: alt(r0.alsoInScope),
    tied: alt(r0.tied),
    outOfScope: alt(r0.outOfScope),
    integrity: r0.integrity,
    chapterDeviations: deviations,
    exportRows: ex,
    exportAgrees: w ? ex.length === 1 && ex[0].icelandic === w.text : ex.length === 0,
  });
}

const doc = {
  control: {
    registeredBooks: db.prepare('SELECT COUNT(*) n FROM registered_books').get().n,
    openedDbPaths: [...new Set(opened)],
    chapterScopes: chapters,
    exportProducer: g.producer || null,
    exportTerms: terms.length,
    exportMtime: fs.statSync(gfile).mtime,
    namesChecked: ELEMENTS.length,
  },
  rows,
};
process.stdout.write(JSON.stringify(doc) + '\nEND-OF-REPORT\n', () => {
  process.exitCode = 0;
});
