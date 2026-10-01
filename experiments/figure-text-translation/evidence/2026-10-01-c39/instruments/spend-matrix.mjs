// SPEND-SAFETY MATRIX for cb1ba9d6d (§C140 ㊴). Drives the REAL runFigures/summarise against
// throwaway books roots under this scratch dir, with a counting fake spawn. Nothing under the repo
// is written: booksRoot is here, and TMPDIR is pointed here so runFigures' mkdtemp lands here too.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';
const SCR = path.dirname(new URL(import.meta.url).pathname);
const TMP = path.join(SCR, 'tmp');
fs.mkdirSync(TMP, { recursive: true });
process.env.TMPDIR = TMP;

const require = createRequire(import.meta.url);
const { runFigures, summarise } = await import(path.join(REPO, 'tools/figure-run.js'));
const SC = require(path.join(REPO, 'tools/lib/figure-text-sidecar.cjs'));
const { writeSidecar, sidecarPath, computeRenderHash, COMPOSER_VERSION } = SC;

const SLUG = 'spendbook';
const ROOTS = path.join(SCR, 'roots');
fs.rmSync(ROOTS, { recursive: true, force: true });
fs.mkdirSync(ROOTS, { recursive: true });
let nRoot = 0;

const SIDECAR_STATES = ['none', 'unreadable', 'array', 'stale', 'current', 'empty', 'dir', 'dangling'];
const MAP_STATES = ['nomap', 'svg', 'png', 'escape'];
const CLASSES = ['translated', 'textlessVec', 'textlessRaster', 'photo', 'unreadable'];
const RESOLVE = ['ok', 'missing', 'refused'];

const B2 = { k0: 'IS k0', k1: 'IS k1' };
const made = (b, blocks, extra = {}) => ({
  version: 1, basename: b, renderHash: computeRenderHash(blocks, COMPOSER_VERSION),
  composerVersion: COMPOSER_VERSION, blocks, ...extra,
});
const current = (b, blocks) => {
  const h = computeRenderHash(blocks, COMPOSER_VERSION);
  return { version: 1, basename: b, renderHash: h, composedHash: h, composerVersion: COMPOSER_VERSION,
    composedVersion: COMPOSER_VERSION, blocks };
};

/** Per-figure spec. name encodes state so the fake spawn can recover it from the basename. */
function figureSpecs() {
  const specs = [];
  for (const S of SIDECAR_STATES)
    for (const M of MAP_STATES)
      for (const C of CLASSES)
        for (const R of RESOLVE) specs.push({ name: `F__${S}__${M}__${C}__${R}`, S, M, C, R, module: 'm00001' });
  // De-hashed: resolves only through its stripped stem. Mapping row + no sidecar + translated.
  specs.push({ name: 'H__none__svg__translated__dehash-ab12', S: 'none', M: 'svg', C: 'translated', R: 'dehash', module: 'm00002' });
  specs.push({ name: 'H__stale__svg__translated__dehash-cd34', S: 'stale', M: 'svg', C: 'translated', R: 'dehash', module: 'm00002' });
  // Contested pair (both hashed, same stem), mapping rows, no sidecar, translated.
  specs.push({ name: 'K__none__svg__translated__contest-1111', S: 'none', M: 'svg', C: 'translated', R: 'dehash', module: 'm00002' });
  specs.push({ name: 'K__none__svg__translated__contest-2222', S: 'none', M: 'svg', C: 'translated', R: 'dehash', module: 'm00003' });
  return specs;
}
const SPECS = figureSpecs();
const BY = new Map(SPECS.map((s) => [s.name, s]));

function makeBook() {
  const root = path.join(ROOTS, `r${nRoot++}`);
  const booksRoot = path.join(root, 'books');
  const bookDir = path.join(booksRoot, SLUG);
  const sourceDir = path.join(bookDir, '01-source', 'ch01');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(path.join(bookDir, 'media'), { recursive: true });
  const byModule = new Map();
  for (const s of SPECS) {
    if (!byModule.has(s.module)) byModule.set(s.module, []);
    byModule.get(s.module).push(s.name);
  }
  for (const [mod, names] of byModule) {
    const body = names
      .map((b, i) => `<figure id="${mod}f${i}"><media alt="m${i}"><image mime-type="application/pdf" src="../../media/${b}.pdf"/></media></figure>`)
      .join('\n');
    fs.writeFileSync(path.join(sourceDir, `${mod}.cnxml`), `<document>\n${body}\n</document>\n`);
  }
  const mapping = [
    // A legacy figure-id row (biology's shape), to be sure it neither selects nor crashes.
    { figureId: 'legacy-1', outputName: 'LEGACY_ONE.png' },
  ];
  for (const s of SPECS) {
    if (s.M === 'svg') mapping.push({ originalImage: s.name, outputName: `${s.name}_IS.svg`, extension: '.svg' });
    if (s.M === 'png') mapping.push({ originalImage: s.name, outputName: `${s.name}_IS.png`, extension: '.png' });
    if (s.M === 'escape') mapping.push({ originalImage: s.name, outputName: `../01-source/${s.name}_IS.svg`, extension: '.svg' });
  }
  fs.writeFileSync(path.join(bookDir, 'media', 'image-mapping.json'), `${JSON.stringify(mapping, null, 2)}\n`);
  for (const s of SPECS) {
    if (s.M === 'svg') fs.writeFileSync(path.join(bookDir, 'media', `${s.name}_IS.svg`), '<svg id="EARLIER"/>');
    const p = sidecarPath(bookDir, s.name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // A textless figure's sidecar would carry no blocks for k0/k1; give classification-matched keys
    const blocks = s.C === 'translated' ? B2 : { kC: 'IS kC' };
    switch (s.S) {
      case 'none': break;
      case 'unreadable': fs.writeFileSync(p, '{"version": 1, "blocks": {', 'utf-8'); break;
      case 'array': fs.writeFileSync(p, '[]', 'utf-8'); break;
      case 'stale': writeSidecar(bookDir, s.name, made(s.name, blocks)); break;
      case 'current': writeSidecar(bookDir, s.name, current(s.name, blocks)); break;
      case 'empty': writeSidecar(bookDir, s.name, made(s.name, {})); break;
      case 'dir': fs.mkdirSync(p, { recursive: true }); break;
      case 'dangling': fs.symlinkSync(path.join(root, 'does-not-exist.json'), p); break;
      default: throw new Error(s.S);
    }
  }
  return { root, booksRoot, bookDir };
}

function prepareFor(spec) {
  switch (spec.C) {
    case 'translated': return { sendable: 2 };
    case 'textlessVec': return { sendable: 0, imageXObjects: 0, paintOps: 9, __blocks: [{ key: 'kC', english: 'C', lines: ['C'], arc: false, send: false }] };
    case 'textlessRaster': return { sendable: 0, imageXObjects: 1, paintOps: 5, __blocks: [{ key: 'kC', english: 'C', lines: ['C'], arc: false, send: false }] };
    case 'photo': return { sendable: 0, imageXObjects: 1, paintOps: 0, chars: 0, __blocks: [] };
    case 'unreadable': return { sendable: 0, undecodedBlocks: 1, __blocks: [{ key: 'kU', english: '(cid:1)', lines: ['(cid:1)'], arc: false, send: false }] };
    default: throw new Error(spec.C);
  }
}

function fakeSpawn() {
  const calls = [];
  const fn = ({ stage, argv }) => {
    calls.push({ stage, argv });
    const outDir = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
    if (stage === 'resolve') {
      const names = argv.slice(argv.indexOf('--json') + 2);
      const out = {};
      for (const n of names) {
        const spec = BY.get(n);
        if (spec) {
          if (spec.R === 'ok') out[n] = { path: `/fake/artwork/${n}.pdf`, edition: 'first-edition' };
          else if (spec.R === 'refused') out[n] = { refused: 'superseded', reason: 'test refusal' };
          else out[n] = null; // missing, or a hashed name the first pass cannot find
        } else {
          // a stripped stem asked for in the de-hash pass
          out[n] = { path: `/fake/artwork/${n}.pdf`, edition: 'first-edition' };
        }
      }
      return { status: 0, stdout: JSON.stringify(out), stderr: '' };
    }
    if (stage === 'prepare') {
      const basename = argv[argv.indexOf('--basename') + 1];
      const spec = BY.get(basename);
      fs.mkdirSync(outDir, { recursive: true });
      const extra = prepareFor(spec);
      const sendable = extra.sendable;
      const blocks = extra.__blocks || Array.from({ length: sendable }, (_, i) => ({
        key: `k${i}`, english: `English ${i}`, lines: [`English ${i}`], arc: false, send: true }));
      fs.writeFileSync(path.join(outDir, 'blocks.json'), JSON.stringify(blocks));
      fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({ source: path.join(outDir, `${basename}.pdf`) }));
      fs.writeFileSync(path.join(outDir, 'artwork.svg'), '<svg/>');
      const rest = Object.fromEntries(Object.entries(extra).filter(([k]) => k !== '__blocks'));
      fs.writeFileSync(path.join(outDir, 'prepare.json'), JSON.stringify({
        basename, source: `/fake/artwork/${basename}.pdf`, blocks: blocks.length, sendable,
        undecodedBlocks: 0, verbatimBlocks: 0, missingFontBlocks: 0, chars: sendable * 10,
        artworkSvgPath: path.join(outDir, 'artwork.svg'), imageXObjects: 1, paintOps: 5, formTextXObjects: 0,
        warnings: [], ...rest,
      }));
      return { status: 0, stdout: '', stderr: '' };
    }
    if (stage === 'translate') {
      const blocks = JSON.parse(fs.readFileSync(path.join(outDir, 'blocks.json'), 'utf-8'));
      const payload = Object.fromEntries(blocks.filter((b) => b.send).map((b) => [b.key, [`IS ${b.key}`]]));
      fs.writeFileSync(path.join(outDir, 'translations-api.json'), JSON.stringify({ blocks: payload }));
      return { status: 0, stdout: '', stderr: '' };
    }
    if (stage === 'compose') {
      const basename = path.basename(outDir);
      fs.writeFileSync(path.join(outDir, 'translated.svg'), `<svg id="COMPOSED-${basename}"/>`);
      fs.writeFileSync(path.join(outDir, 'compose.json'), JSON.stringify({ outputPath: path.join(outDir, 'translated.svg') }));
      return { status: 0, stdout: '', stderr: '' };
    }
    if (stage === 'ring-gate') {
      return { status: 0, stderr: '', stdout: JSON.stringify([{ svg: 'artwork.svg', viewBox: [0, 0, 100, 100], candidates: [] }]) };
    }
    throw new Error(`unexpected stage ${stage}`);
  };
  fn.calls = calls;
  fn.countOf = (s) => calls.filter((c) => c.stage === s).length;
  fn.outDirsFor = (s) => calls.filter((c) => c.stage === s).map((c) => path.basename(c.argv[c.argv.indexOf('--out') + 1]));
  return fn;
}

const base = (over = {}) => ({ book: SLUG, chapter: '1', modules: null, figures: null, dryRun: false, stale: false, force: false, ...over });

function sidecarListing(bookDir) {
  const dir = path.join(bookDir, 'figure-text');
  try { return fs.readdirSync(dir).sort(); } catch { return []; }
}

const RESULTS = [];
async function runCase(label, over) {
  const book = makeBook();
  const before = sidecarListing(book.bookDir);
  const spawn = fakeSpawn();
  let result, report, err = null;
  try {
    result = await runFigures(base(over), { spawn, booksRoot: book.booksRoot });
    report = summarise(result);
  } catch (e) { err = e; }
  const after = sidecarListing(book.bookDir);
  const row = {
    label, over,
    error: err ? String(err.message).split('\n')[0] : null,
    translateSpawns: spawn.countOf('translate'),
    translateFor: spawn.outDirsFor('translate'),
    composeSpawns: spawn.countOf('compose'),
    prepareSpawns: spawn.countOf('prepare'),
    spentRecs: result ? result.figures.filter((f) => f.spent).map((f) => f.basename) : null,
    newSidecarFiles: after.filter((f) => !before.includes(f)),
    removedSidecarFiles: before.filter((f) => !after.includes(f)),
    tally: result ? Object.fromEntries(Object.entries(result.tally).filter(([, v]) => v > 0)) : null,
    selected: result ? result.figures.length : null,
    deselected: result ? result.deselected : null,
    verdictOk: result ? result.verdict.ok : null,
    // INVARIANT: under --stale no selected record reaches translated without a sidecar
    translatedNoSidecar: result ? result.figures.filter((f) => f.outcome === 'translated' && !f.sidecar).map((f) => f.basename) : null,
    skippedUnbought: result ? result.figures.filter((f) => f.outcome === 'skipped-unbought').map((f) => f.basename) : null,
  };
  RESULTS.push({ row, result, report });
  return { row, result, report, book };
}

const cases = [
  ['stale', { stale: true }],
  ['stale+force', { stale: true, force: true }],
  ['stale+dry', { stale: true, dryRun: true }],
  ['stale+force+dry', { stale: true, force: true, dryRun: true }],
  ['stale+module m00002', { stale: true, modules: ['m00002'] }],
  ['stale+force+module m00002', { stale: true, force: true, modules: ['m00002'] }],
  ['stale+figure', { stale: true, figures: [
    'F__none__svg__translated__ok', 'F__none__nomap__translated__ok', 'F__dangling__svg__translated__ok',
    'H__none__svg__translated__dehash-ab12', 'F__stale__svg__translated__ok'] }],
  ['stale+force+figure', { stale: true, force: true, figures: [
    'F__none__svg__translated__ok', 'F__dangling__svg__translated__ok', 'H__none__svg__translated__dehash-ab12'] }],
  ['CONTROL plain', {}],
  ['CONTROL force', { force: true }],
  ['CONTROL figure', { figures: ['F__none__svg__translated__ok'] }],
];

for (const [label, over] of cases) {
  const { row } = await runCase(label, over);
  console.log(JSON.stringify(row));
}

// Summary assertions
const staleRows = RESULTS.filter((r) => r.row.over.stale);
const controlRows = RESULTS.filter((r) => !r.row.over.stale);
const bad = staleRows.filter((r) => r.row.translateSpawns !== 0 || (r.row.spentRecs && r.row.spentRecs.length) || r.row.newSidecarFiles.length || (r.row.translatedNoSidecar && r.row.translatedNoSidecar.length));
console.log('\n=== STALE runs with ANY spend/new sidecar/translated-without-sidecar:', bad.length, bad.map((r) => r.row.label));
console.log('=== CONTROL runs translate spawns:', controlRows.map((r) => [r.row.label, r.row.translateSpawns]));
fs.writeFileSync(path.join(SCR, 'matrix-results.json'), JSON.stringify(RESULTS.map((r) => r.row), null, 1));
for (const r of RESULTS) fs.writeFileSync(path.join(SCR, `report-${r.row.label.replace(/[^a-z0-9]+/gi, '_')}.txt`), r.report || `ERROR: ${r.row.error}`);
fs.rmSync(ROOTS, { recursive: true, force: true });
console.log('DONE');
