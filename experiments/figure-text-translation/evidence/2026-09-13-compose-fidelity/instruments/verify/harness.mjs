// Verification harness for the sidecar-lifecycle claims (C1, C2, C6 + B' counterexample).
// Drives the REAL runFigures / publishFigureSvg / applyApprovedFigureEdits against throwaway
// books roots under this scratch dir. Fake spawn = copied shape of figure-run-paid.test.js's.
// Nothing under the repo is written.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';
const SCR = path.dirname(new URL(import.meta.url).pathname);
const PREP = path.join(SCR, '..', 'prep');
const require = createRequire(import.meta.url);

const FR = await import(path.join(REPO, 'tools/figure-run.js'));
const { runFigures, isStale } = FR;
const { publishFigureSvg } = await import(path.join(REPO, 'tools/publish-figure-svg.js'));
const SC = require(path.join(REPO, 'tools/lib/figure-text-sidecar.cjs'));
const { readSidecar, writeSidecar, computeRenderHash, editorialState, effectiveState, COMPOSER_VERSION } = SC;

const SLUG = 'vsl-book';
const ROOTS = path.join(SCR, 'roots');
fs.rmSync(ROOTS, { recursive: true, force: true });
fs.mkdirSync(ROOTS, { recursive: true });
let n = 0;

function makeBook({ figures, sidecars = {}, june = {} }) {
  const root = path.join(ROOTS, `r${n++}`);
  const booksRoot = path.join(root, 'books');
  const bookDir = path.join(booksRoot, SLUG);
  const sourceDir = path.join(bookDir, '01-source', 'ch01');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(path.join(bookDir, 'media'), { recursive: true });
  const body = figures
    .map((b, i) => `<figure id="fig${i}"><media alt="m${i}"><image mime-type="application/pdf" src="../../media/${b}.pdf"/></media></figure>`)
    .join('\n');
  fs.writeFileSync(path.join(sourceDir, 'm00001.cnxml'), `<document>\n${body}\n</document>\n`);
  const mapping = figures.map((b) => ({ originalImage: b, outputName: `${b}_IS.svg`, extension: '.svg' }));
  fs.writeFileSync(path.join(bookDir, 'media', 'image-mapping.json'), JSON.stringify(mapping, null, 2) + '\n');
  for (const [b, s] of Object.entries(sidecars)) writeSidecar(bookDir, b, s);
  for (const [b, bytes] of Object.entries(june)) fs.writeFileSync(path.join(bookDir, 'media', `${b}_IS.svg`), bytes);
  return { root, booksRoot, bookDir };
}

/** fake spawn. prepare writes blocks.json from `blocksFor(b)` (array) */
function fakeSpawn(blocksFor) {
  const calls = [];
  const fn = ({ stage, argv }) => {
    calls.push({ stage, argv });
    const outDir = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
    if (stage === 'resolve') {
      const names = argv.slice(argv.indexOf('--json') + 2);
      const out = {};
      for (const nm of names) out[nm] = { path: `/fake/artwork/${nm}.pdf`, edition: 'first-edition' };
      return { status: 0, stdout: JSON.stringify(out), stderr: '' };
    }
    if (stage === 'prepare') {
      const basename = argv[argv.indexOf('--basename') + 1];
      fs.mkdirSync(outDir, { recursive: true });
      const blocks = blocksFor(basename);
      const sendable = blocks.filter((b) => b.send).length;
      fs.writeFileSync(path.join(outDir, 'blocks.json'), JSON.stringify(blocks));
      fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({ source: path.join(outDir, `${basename}.pdf`) }));
      fs.writeFileSync(path.join(outDir, 'artwork.svg'), '<svg/>');
      fs.writeFileSync(path.join(outDir, 'prepare.json'), JSON.stringify({
        basename, source: `/fake/artwork/${basename}.pdf`, blocks: blocks.length, sendable,
        undecodedBlocks: 0, verbatimBlocks: 0, missingFontBlocks: 0, chars: sendable * 10,
        artworkSvgPath: path.join(outDir, 'artwork.svg'), imageXObjects: 1, paintOps: 5, formTextXObjects: 0, warnings: [],
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
    throw new Error(`unexpected stage ${stage}`);
  };
  fn.calls = calls;
  fn.countOf = (s) => calls.filter((c) => c.stage === s).length;
  return fn;
}
const live = (over = {}) => ({ book: SLUG, chapter: '1', modules: null, figures: null, dryRun: false, stale: false, force: false, ...over });
const recOf = (res, b) => res.figures.find((f) => f.basename === b);
const results = {};
const log = (k, v) => { results[k] = v; console.log(k, JSON.stringify(v)); };

// Two-key synthetic figure whose prepared blocks both send:true.
const synthBlocks = () => [
  { key: 'k0', english: 'English 0', lines: ['English 0'], arc: false, send: true },
  { key: 'k1', english: 'English 1', lines: ['English 1'], arc: false, send: true },
];
const IDENT = { k0: 'English 0', k1: 'English 1' }; // an all-identity purchase
const JUNE = '<svg id="JUNE-COWORK"/>';

// ── S1: C1 literal. renderHash, NO composedHash. ─────────────────────────────────────────────
{
  const sc = { version: 1, basename: 'FIG_A', renderHash: computeRenderHash(IDENT, COMPOSER_VERSION), composerVersion: COMPOSER_VERSION, blocks: IDENT };
  const { booksRoot, bookDir } = makeBook({ figures: ['FIG_A'], sidecars: { FIG_A: sc }, june: { FIG_A: JUNE } });
  log('S1.pre.isStale', isStale(readSidecar(bookDir, 'FIG_A')));
  const sp = fakeSpawn(synthBlocks);
  const r1 = await runFigures(live(), { spawn: sp, booksRoot });
  const after = readSidecar(bookDir, 'FIG_A');
  log('S1.run1', { outcome: recOf(r1, 'FIG_A').outcome, translate: sp.countOf('translate'), compose: sp.countOf('compose'), published: !!recOf(r1, 'FIG_A').published,
    media: fs.readFileSync(path.join(bookDir, 'media', 'FIG_A_IS.svg'), 'utf-8'), composedHashEqRender: after.composedHash === after.renderHash, isStaleAfter: isStale(after) });
  const sp2 = fakeSpawn(synthBlocks);
  const r2 = await runFigures(live(), { spawn: sp2, booksRoot });
  log('S1.run2', { outcome: recOf(r2, 'FIG_A').outcome, prepare: sp2.countOf('prepare'), compose: sp2.countOf('compose') });
}

// ── S2: B' — sidecar STAMPED at mint (composedHash=renderHash, composedVersion) with NO compose. ─
let s2 = null;
{
  const h = computeRenderHash(IDENT, COMPOSER_VERSION);
  const sc = { version: 1, basename: 'FIG_A', renderHash: h, composedHash: h, composedVersion: COMPOSER_VERSION, composerVersion: COMPOSER_VERSION, blocks: IDENT };
  s2 = makeBook({ figures: ['FIG_A'], sidecars: { FIG_A: sc }, june: { FIG_A: JUNE } });
  const { booksRoot, bookDir } = s2;
  for (const [label, over] of [['plain1', {}], ['plain2', {}], ['stale', { stale: true }]]) {
    const sp = fakeSpawn(synthBlocks);
    const r = await runFigures(live(over), { spawn: sp, booksRoot });
    log(`S2.${label}`, { outcome: recOf(r, 'FIG_A').outcome, prepare: sp.countOf('prepare'), translate: sp.countOf('translate'), compose: sp.countOf('compose'),
      media: fs.readFileSync(path.join(bookDir, 'media', 'FIG_A_IS.svg'), 'utf-8'), verdictOk: r.verdict.ok });
  }
}

// ── S2x: B' + REAL applyApprovedFigureEdits (approve unchanged; then edit+approve). Also C6. ─────
{
  process.env.SESSIONS_DB_PATH = path.join(SCR, 'unused.db'); // never opened: db injected
  const Database = require(path.join(REPO, 'server/node_modules/better-sqlite3'));
  const svc = require(path.join(REPO, 'server/services/figureReviewService.js'));
  const mig = require(path.join(REPO, 'server/migrations/050-figure-review.js'));
  const db = new Database(':memory:');
  log('S2x.foreign_keys', db.pragma('foreign_keys', { simple: true }));
  db.exec(`CREATE TABLE registered_books (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE)`);
  mig.up(db);
  const bookId = db.prepare(`INSERT INTO registered_books (slug) VALUES (?) RETURNING id`).get(SLUG).id;
  const { booksRoot, bookDir } = s2;

  const approve = (state = 'approved') => {
    const resolved = svc.resolveFigure(db, bookId, SLUG, 'FIG_A'); // NB bookDirFor uses segmentParser; bypass below
    return resolved;
  };
  // resolveFigure uses bookDirFor(slug) -> segmentParser.BOOKS_DIR; emulate the route with our bookDir.
  const routeLike = (state) => {
    const sidecar = readSidecar(bookDir, 'FIG_A');
    const mtBlocks = sidecar.blocks;
    svc.ensureFigureRow(db, { bookId, chapter: 1, moduleId: 'm00001', basename: 'FIG_A' });
    const fig0 = svc.getFigure(db, bookId, 'FIG_A', mtBlocks, sidecar.composedHash || null);
    svc.setState(db, { bookId, basename: 'FIG_A', state, flagKind: state === 'flagged' ? 'layout' : null, note: null, reviewedBy: 'u', blocks: fig0.blocks });
    return svc.applyApprovedFigureEdits(db, { bookDir, bookId, basename: 'FIG_A', mtBlocks });
  };

  routeLike('approved');
  let sc = readSidecar(bookDir, 'FIG_A');
  log('S2x.approveUnchanged.sidecar', { state: sc.state, composedHash: sc.composedHash, renderHash: sc.renderHash, composedVersion: sc.composedVersion,
    effective: effectiveState(sc, sc.blocks, COMPOSER_VERSION), isStale: isStale(sc) });
  {
    const sp = fakeSpawn(synthBlocks);
    const r = await runFigures(live(), { spawn: sp, booksRoot });
    log('S2x.approveUnchanged.run', { outcome: recOf(r, 'FIG_A').outcome, compose: sp.countOf('compose'), media: fs.readFileSync(path.join(bookDir, 'media', 'FIG_A_IS.svg'), 'utf-8') });
  }
  // editor edits k0, then approves
  svc.saveBlockEdit(db, { bookId, basename: 'FIG_A', blockKey: 'k0', isText: 'Enska 0', editedBy: 'u' });
  routeLike('approved');
  sc = readSidecar(bookDir, 'FIG_A');
  log('S2x.editApprove.sidecar', { state: sc.state, blocks: sc.blocks, composedHashEqRender: sc.composedHash === sc.renderHash, isStale: isStale(sc) });
  {
    const sp = fakeSpawn(synthBlocks);
    const r = await runFigures(live(), { spawn: sp, booksRoot });
    const after = readSidecar(bookDir, 'FIG_A');
    log('S2x.editApprove.run', { outcome: recOf(r, 'FIG_A').outcome, translate: sp.countOf('translate'), compose: sp.countOf('compose'),
      media: fs.readFileSync(path.join(bookDir, 'media', 'FIG_A_IS.svg'), 'utf-8'), effectiveAfter: effectiveState(after, after.blocks, COMPOSER_VERSION), isStaleAfter: isStale(after) });
  }

  // C6: a marker key on the sidecar; approve and flag via the real service; publisher control.
  for (const st of ['approved', 'flagged']) {
    const cur = readSidecar(bookDir, 'FIG_A');
    writeSidecar(bookDir, 'FIG_A', { ...cur, identityKeptHash: cur.renderHash });
    const before = Object.keys(readSidecar(bookDir, 'FIG_A'));
    routeLike(st);
    const aft = readSidecar(bookDir, 'FIG_A');
    log(`C6.${st}`, { keysBefore: before, keysAfter: Object.keys(aft), markerSurvived: 'identityKeptHash' in aft, state: aft.state });
  }
  // control: the publisher (withComposedStamp) with the same marker
  {
    const cur = readSidecar(bookDir, 'FIG_A');
    writeSidecar(bookDir, 'FIG_A', { ...cur, identityKeptHash: cur.renderHash, composedVersion: '0' });
    const outDir = path.join(SCR, 'roots', 'pubctl');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 't.svg'), '<svg id="pubctl"/>');
    fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({ source: '/x/FIG_A.pdf' }));
    const res = publishFigureSvg({ sidecarPath: path.join(bookDir, 'figure-text', 'FIG_A.is.json'), svgPath: path.join(outDir, 't.svg'), metaPath: path.join(outDir, 'meta.json') });
    const aft = readSidecar(bookDir, 'FIG_A');
    log('C6.publisherControl', { ok: res.ok, wroteStamp: aft.composedVersion === COMPOSER_VERSION, markerSurvived: 'identityKeptHash' in aft });
  }
  db.close();
}

// ── S3: bump simulation on a synthetic (existing test technique) + C2 on the REAL 34. ──────────
{
  const bought = fs.readFileSync(path.join(PREP, 'bought.txt'), 'utf-8').split('\n').map((s) => s.trim()).filter(Boolean);
  const realDir = path.join(REPO, 'books/efnafraedi-2e');
  const orig = Object.fromEntries(bought.map((b) => [b, fs.readFileSync(path.join(realDir, 'figure-text', `${b}.is.json`), 'utf-8')]));
  const parsed = Object.fromEntries(bought.map((b) => [b, JSON.parse(orig[b])]));
  log('C2.real.count', bought.length);
  log('C2.real.isStaleNow', bought.filter((b) => isStale(parsed[b])).length);
  log('C2.real.composedVersionEq1', bought.filter((b) => parsed[b].composedVersion === COMPOSER_VERSION).length);
  log('C2.real.composedHashEqRender', bought.filter((b) => parsed[b].composedHash === parsed[b].renderHash).length);
  log('C2.real.rehashUnderOwnVersionMatches', bought.filter((b) => computeRenderHash(parsed[b].blocks, parsed[b].composerVersion) === parsed[b].renderHash).length);
  log('C2.real.rehashUnderVersion2Matches', bought.filter((b) => computeRenderHash(parsed[b].blocks, '2') === parsed[b].renderHash).length);
  log('C2.real.withState', bought.filter((b) => 'state' in parsed[b]).length);

  // Simulated bump: composedVersion '0' ≠ current (structurally identical to COMPOSER_VERSION moving on)
  const bumped = Object.fromEntries(bought.map((b) => [b, { ...parsed[b], composedVersion: '0' }]));
  const { booksRoot, bookDir } = makeBook({ figures: bought, sidecars: bumped, june: Object.fromEntries(bought.map((b) => [b, JUNE])) });
  const realBlocks = (b) => JSON.parse(fs.readFileSync(path.join(PREP, b, 'blocks.json'), 'utf-8'));
  log('C2.bumped.isStale', bought.filter((b) => isStale(readSidecar(bookDir, b))).length);
  const sp = fakeSpawn(realBlocks);
  const r1 = await runFigures(live({ stale: true }), { spawn: sp, booksRoot });
  const outcomes = {};
  for (const f of r1.figures) outcomes[f.outcome] = (outcomes[f.outcome] || 0) + 1;
  const fails = r1.figures.filter((f) => f.outcome !== 'translated').map((f) => [f.basename, f.outcome, (f.reason || '').slice(0, 200)]);
  const after = Object.fromEntries(bought.map((b) => [b, readSidecar(bookDir, b)]));
  log('C2.run1', { selected: r1.enumerated, deselected: r1.deselected, outcomes, translate: sp.countOf('translate'), prepare: sp.countOf('prepare'), compose: sp.countOf('compose'), fails,
    staleAfter: bought.filter((b) => isStale(after[b])).length,
    renderHashUnchanged: bought.filter((b) => after[b].renderHash === parsed[b].renderHash).length,
    composerVersionUnchanged: bought.filter((b) => after[b].composerVersion === parsed[b].composerVersion).length,
    blocksUnchanged: bought.filter((b) => JSON.stringify(after[b].blocks) === JSON.stringify(parsed[b].blocks)).length,
    composedVersionNow: bought.filter((b) => after[b].composedVersion === COMPOSER_VERSION).length,
    mediaComposed: bought.filter((b) => fs.readFileSync(path.join(bookDir, 'media', `${b}_IS.svg`), 'utf-8').startsWith('<svg id="COMPOSED')).length,
    // byte identity with the committed sidecar (the stamp writes composedVersion back to '1')
    bytesEqualCommitted: bought.filter((b) => fs.readFileSync(path.join(bookDir, 'figure-text', `${b}.is.json`), 'utf-8') === orig[b]).length,
    verdictOk: r1.verdict.ok });
  const sp2 = fakeSpawn(realBlocks);
  const r2 = await runFigures(live({ stale: true }), { spawn: sp2, booksRoot });
  const o2 = {};
  for (const f of r2.figures) o2[f.outcome] = (o2[f.outcome] || 0) + 1;
  log('C2.run2', { outcomes: o2, prepare: sp2.countOf('prepare'), compose: sp2.countOf('compose'), translate: sp2.countOf('translate') });

  // Negative control on the drift guard: one figure's blocks.json drops a send:true key → must refuse.
  const { booksRoot: br3 } = makeBook({ figures: [bought[0]], sidecars: { [bought[0]]: bumped[bought[0]] } });
  const sp3 = fakeSpawn((b) => { const bl = realBlocks(b); const i = bl.findIndex((x) => x.send); bl.splice(i, 1); return bl; });
  const r3 = await runFigures(live({ stale: true }), { spawn: sp3, booksRoot: br3 });
  log('C2.driftControl', { figure: bought[0], outcome: r3.figures[0].outcome, compose: sp3.countOf('compose') });
}

fs.writeFileSync(path.join(SCR, 'harness-results.json'), JSON.stringify(results, null, 1));
console.log('HARNESS-DONE');
