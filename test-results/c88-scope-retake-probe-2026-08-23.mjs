/**
 * §C88 scope re-take (runbook Phase 1.2) — re-measurement probe.
 * Frozen evidence, 2026-08-23. READ-ONLY: pure-function imports only, never the
 * CLI (CLAUDE.md records that cnxml-extract's --output-dir is accepted, ignored,
 * and writes into the real tree).
 *
 * Runnable from ANY cwd: every books/ path is resolved against import.meta.url,
 * per CLAUDE.md's durable rule against resolving resource paths on process.cwd()
 * (that exact bug shipped three times in tools/lib).
 *
 * DETECTORS, stated so a later reader need not reconstruct them:
 *  reachable — tools/lib/extraction-coverage.js altReachability(content): every
 *              alt-bearing <media> inside <content>. ALT_BLIND_DIRECT_PARENTS is
 *              empty post-§C88, so `unreachable` is 0 by construction.
 *  emitted   — extractSegments(text).segments.filter(s => s.type === 'alt').length
 *  guarded   — §C88 Task 10's predicate, verbatim: alt-bearing <media>, NO @id,
 *              NO <figure> ancestor, DIRECT parent in
 *              {example, problem, solution, note, entry}.
 *  alt       — replicates mediaAlt(): @alt on the <media>, else on a child <image>.
 *              NEVER a child <iframe> — no capture path reads it, so counting it
 *              would manufacture a false reachable.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseModuleDoc, altReachability } from '../tools/lib/extraction-coverage.js';
import { extractSegments } from '../tools/cnxml-extract.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const books = (...p) => path.join(REPO, 'books', ...p);

const BOOKS = ['efnafraedi-2e', 'lifraen-efnafraedi', 'edlisfraedi-2e', 'liffraedi-2e', 'orverufraedi'];
const GUARDED_PARENTS = new Set(['example', 'problem', 'solution', 'note', 'entry']);

const mediaAlt = (m) => {
  const own = m.getAttribute('alt');
  if (own && own.trim()) return own;
  for (let i = 0; i < m.childNodes.length; i++) {
    const c = m.childNodes[i];
    if (c.nodeType === 1 && c.localName === 'image') {
      const a = c.getAttribute('alt');
      if (a && a.trim()) return a;
    }
  }
  return null;
};
const ancestor = (el, name) => {
  let p = el.parentNode;
  while (p && p.nodeType === 1 && p.localName !== 'content') {
    if (p.localName === name) return p;
    p = p.parentNode;
  }
  return null;
};
const modules = (book) => {
  const root = books(book, '01-source');
  if (!fs.existsSync(root)) return [];
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.cnxml')) out.push(p);
    }
  })(root);
  return out.sort();
};

const pad = (s, n) => String(s).padEnd(n);
const lp = (s, n) => String(s).padStart(n);
const rows = [];

for (const book of BOOKS) {
  const files = modules(book);
  const r = {
    book, files: files.length, reachable: 0, unreachable: 0, guarded: 0,
    byParent: {}, guardedModules: new Set(), emitted: 0,
    mediaElems: 0, mediaWithId: 0, filesWithMedia: 0, filesWithIdMedia: 0,
    figures: 0, figuresWithId: 0,
    entryDirectId: 0, entryDirectNoId: 0, entryAnyId: 0, entryAnyNoId: 0,
  };
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf-8');
    const { doc, content } = parseModuleDoc(text);
    const ar = altReachability(content);
    r.reachable += ar.reachable;
    r.unreachable += ar.unreachable;

    const all = doc.getElementsByTagName('media');
    let hasMedia = false, hasIdMedia = false;
    for (let i = 0; i < all.length; i++) {
      hasMedia = true;
      const id = all[i].getAttribute('id');
      if (id && id.trim()) hasIdMedia = true;
    }
    if (hasMedia) r.filesWithMedia++;
    if (hasIdMedia) r.filesWithIdMedia++;

    if (content) {
      const figs = content.getElementsByTagName('figure');
      for (let i = 0; i < figs.length; i++) {
        r.figures++;
        const id = figs[i].getAttribute('id');
        if (id && id.trim()) r.figuresWithId++;
      }
      const ms = content.getElementsByTagName('media');
      for (let i = 0; i < ms.length; i++) {
        const el = ms[i];
        r.mediaElems++;
        const id = el.getAttribute('id');
        const hasId = !!(id && id.trim());
        if (hasId) r.mediaWithId++;
        if (!mediaAlt(el)) continue;
        const inFigure = !!ancestor(el, 'figure');
        const parent = el.parentNode;
        const pn = parent && parent.nodeType === 1 ? parent.localName : null;
        if (!inFigure && !hasId && pn && GUARDED_PARENTS.has(pn)) {
          r.guarded++;
          r.byParent[pn] = (r.byParent[pn] || 0) + 1;
          r.guardedModules.add(path.basename(f, '.cnxml'));
        }
        if (!inFigure && pn === 'entry') hasId ? r.entryDirectId++ : r.entryDirectNoId++;
        if (ancestor(el, 'entry')) hasId ? r.entryAnyId++ : r.entryAnyNoId++;
      }
    }
    r.emitted += extractSegments(text).segments.filter((s) => s.type === 'alt').length;
  }
  r.modCount = r.guardedModules.size;
  r.predicted = r.reachable - r.guarded;
  r.residual = r.emitted - r.predicted;
  rows.push(r);
}

console.log('=== A · THE 245 — unit: ALT-BEARING <media> ELEMENTS ===');
console.log(pad('book', 20), lp('files', 6), lp('reach', 6), lp('guard', 6), lp('mods', 5), lp('pred', 6), lp('emit', 6), lp('resid', 6), ' guardedByParent');
for (const r of rows) console.log(pad(r.book, 20), lp(r.files, 6), lp(r.reachable, 6), lp(r.guarded, 6), lp(r.modCount, 5), lp(r.predicted, 6), lp(r.emitted, 6), lp((r.residual > 0 ? '+' : '') + r.residual, 6), ' ', JSON.stringify(r.byParent));

console.log('\n=== B · THE ZERO — both units reported, because the source claim mixes them ===');
console.log(pad('book', 20), lp('mediaElems', 11), lp('withId', 7), lp('filesWithMedia', 15), lp('filesWithIdMedia', 17), lp('figures', 8), lp('figsWithId', 11));
for (const r of rows) console.log(pad(r.book, 20), lp(r.mediaElems, 11), lp(r.mediaWithId, 7), lp(r.filesWithMedia, 15), lp(r.filesWithIdMedia, 17), lp(r.figures, 8), lp(r.figuresWithId, 11));

console.log('\n=== C · THIRD-SOURCE CROSS-CHECK vs cnxml-extract.js:1557ff ("37 = 29 chem + 8 physics") ===');
console.log(pad('book', 20), lp('entryDirect:id', 15), lp('noId', 6), lp('entryAnyDepth:id', 17), lp('noId', 6));
for (const r of rows) console.log(pad(r.book, 20), lp(r.entryDirectId, 15), lp(r.entryDirectNoId, 6), lp(r.entryAnyId, 17), lp(r.entryAnyNoId, 6));

// D · the 213/32 split, against the BOUGHT set derived from disk (not typed from prose)
const mtRoot = books('lifraen-efnafraedi', '02-mt-output');
const bought = new Set(
  fs.readdirSync(mtRoot, { withFileTypes: true }).filter((d) => d.isDirectory())
    .flatMap((d) => fs.readdirSync(path.join(mtRoot, d.name)))
    .filter((f) => /^m\d+-segments\.is\.md$/.test(f))
    .map((f) => f.replace(/-segments\.is\.md$/, ''))
);
const organic = rows.find((r) => r.book === 'lifraen-efnafraedi');
const per = {};
for (const f of modules('lifraen-efnafraedi')) {
  const { content } = parseModuleDoc(fs.readFileSync(f, 'utf-8'));
  if (!content) continue;
  const ms = content.getElementsByTagName('media');
  for (let i = 0; i < ms.length; i++) {
    const el = ms[i];
    if (!mediaAlt(el)) continue;
    const id = el.getAttribute('id');
    if (id && id.trim()) continue;
    if (ancestor(el, 'figure')) continue;
    const p = el.parentNode;
    const pn = p && p.nodeType === 1 ? p.localName : null;
    if (pn && GUARDED_PARENTS.has(pn)) {
      const m = path.basename(f, '.cnxml');
      per[m] = (per[m] || 0) + 1;
    }
  }
}
let inN = 0, outN = 0, inM = 0, outM = 0;
for (const [m, n] of Object.entries(per)) (bought.has(m) ? ((inN += n), inM++) : ((outN += n), outM++));
console.log(`\n=== D · THE VOIDED PREMISE ("213 sit in modules §C80 is not buying") ===`);
console.log(`bought preview set, derived from books/lifraen-efnafraedi/02-mt-output: ${bought.size} modules`);
console.log(`  INSIDE  the preview: ${inN} alts across ${inM} module(s)  [${Object.keys(per).filter((m) => bought.has(m)).join(', ')}]`);
console.log(`  OUTSIDE the preview: ${outN} alts across ${outM} modules`);
console.log(`  TOTAL: ${inN + outN} across ${inM + outM} modules (organic guarded = ${organic.guarded})`);
