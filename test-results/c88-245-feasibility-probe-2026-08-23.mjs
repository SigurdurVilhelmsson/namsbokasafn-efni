/**
 * §C88 — feasibility measurements for bringing organic's 245 `entry-not-in-figure`
 * alts into the pipeline. Frozen evidence, 2026-08-23. DECISION INPUT, not a ruling.
 *
 * READ-ONLY: pure-function imports only, never the CLI. Resolves every books/ path
 * against import.meta.url, so it runs from any cwd (CLAUDE.md's durable rule).
 *
 * Answers five questions the estimate turns on:
 *   1. Which processTable branch does each of the 245 land in?
 *   2. Does its alt live on the <media> or only on a child <image>?
 *   3. What stable keys exist — table @id, entry @id, image @id, image src?
 *   4. Does any cell hold more than one alt-bearing id-less media?
 *   5. Is positional cell indexing trustworthy — does extraction's recorded cell
 *      count ever disagree with the source's <entry> count? (the m68863 gap class)
 *
 * The `guarded` predicate is §C88 Task 10's, verbatim; see
 * c88-scope-retake-probe-2026-08-23.mjs for the population it selects.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseModuleDoc } from '../tools/lib/extraction-coverage.js';
import { extractSegments } from '../tools/cnxml-extract.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOK = 'lifraen-efnafraedi';
const GUARDED_PARENTS = new Set(['example', 'problem', 'solution', 'note', 'entry']);

const mediaAlt = (m) => {
  const own = m.getAttribute('alt');
  if (own && own.trim()) return { value: own, on: 'media' };
  for (let i = 0; i < m.childNodes.length; i++) {
    const c = m.childNodes[i];
    if (c.nodeType === 1 && c.localName === 'image') {
      const a = c.getAttribute('alt');
      if (a && a.trim()) return { value: a, on: 'image' };
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
const chain = (el) => {
  const out = [];
  let p = el.parentNode;
  while (p && p.nodeType === 1 && p.localName !== 'content') { out.push(p.localName); p = p.parentNode; }
  return out;
};
/** Text of an <entry> EXCLUDING <media> subtrees — approximates extractInlineText,
 *  which strips a bare <media> when called without an inlineMediaMap. */
const textOutsideMedia = (el) => {
  let s = '';
  (function walk(n) {
    for (let i = 0; i < n.childNodes.length; i++) {
      const c = n.childNodes[i];
      if (c.nodeType === 3) { s += c.nodeValue; continue; }
      if (c.nodeType !== 1 || c.localName === 'media') continue;
      walk(c);
    }
  })(el);
  return s.replace(/\s+/g, ' ').trim();
};
const modules = () => {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.cnxml')) out.push(p);
    }
  })(path.join(REPO, 'books', BOOK, '01-source'));
  return out.sort();
};
const structTables = (structure) => {
  const out = [];
  (function walk(els) {
    for (const el of els || []) {
      if (el.type === 'table') out.push(el);
      if (el.content) walk(el.content);
      if (el.type === 'exercise') { walk(el.problem?.content); walk(el.solution?.content); }
    }
  })(structure.content);
  return out;
};

const files = modules();
const R = {
  n: 0, altOnMedia: 0, altOnImage: 0,
  tableId: 0, tableNoId: 0, entryId: 0, entryNoId: 0, imageId: 0, imageNoId: 0,
  b1: 0, b2: 0, b3: 0, b1examples: [],
  chains: {}, hostTables: new Set(), srcs: new Map(), perCell: new Map(), mods: new Set(),
};

for (const f of files) {
  const { content } = parseModuleDoc(fs.readFileSync(f, 'utf-8'));
  if (!content) continue;
  const mid = path.basename(f, '.cnxml');
  const ms = content.getElementsByTagName('media');
  for (let i = 0; i < ms.length; i++) {
    const el = ms[i];
    const alt = mediaAlt(el);
    if (!alt) continue;
    const id = el.getAttribute('id');
    if (id && id.trim()) continue;              // id-less only
    if (ancestor(el, 'figure')) continue;        // no <figure> ancestor
    const parent = el.parentNode;
    const pn = parent && parent.nodeType === 1 ? parent.localName : null;
    if (!(pn && GUARDED_PARENTS.has(pn))) continue;

    R.n++; R.mods.add(mid);
    alt.on === 'media' ? R.altOnMedia++ : R.altOnImage++;

    const entry = ancestor(el, 'entry');
    const table = ancestor(el, 'table');
    const tid = table && table.getAttribute('id');
    tid && tid.trim() ? R.tableId++ : R.tableNoId++;
    if (tid && tid.trim()) R.hostTables.add(`${mid}:${tid}`);
    const eid = entry && entry.getAttribute('id');
    eid && eid.trim() ? R.entryId++ : R.entryNoId++;

    let imgId = null, src = null;
    for (let j = 0; j < el.childNodes.length; j++) {
      const c = el.childNodes[j];
      if (c.nodeType === 1 && c.localName === 'image') { imgId = c.getAttribute('id'); src = c.getAttribute('src'); break; }
    }
    imgId && imgId.trim() ? R.imageId++ : R.imageNoId++;
    if (src) R.srcs.set(`${mid}|${src}`, (R.srcs.get(`${mid}|${src}`) || 0) + 1);

    if (entry) R.perCell.set(entry, (R.perCell.get(entry) || 0) + 1);
    const c = chain(el).join('>');
    R.chains[c] = (R.chains[c] || 0) + 1;

    // processTable branch classification
    if (entry) {
      const paras = entry.getElementsByTagName('para').length;
      const txt = textOutsideMedia(entry);
      if (paras >= 1) { R.b1++; R.b1examples.push(`${mid} paras=${paras} text="${txt.slice(0, 50)}"`); }
      else if (txt) R.b2++;
      else R.b3++;
    }
  }
}

// Q5 — positional-index reliability: recorded cells vs source <entry> per row.
let tablesCompared = 0, rowsCompared = 0, mismatch = 0, hostRows = 0, hostMismatch = 0;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf-8');
  const mid = path.basename(f, '.cnxml');
  const { content } = parseModuleDoc(text);
  if (!content) continue;
  const byId = new Map();
  for (const t of structTables(extractSegments(text).structure)) if (t.id) byId.set(t.id, t);
  const domTables = content.getElementsByTagName('table');
  for (let i = 0; i < domTables.length; i++) {
    const dt = domTables[i];
    const tid = dt.getAttribute('id');
    if (!tid) continue;
    const st = byId.get(tid);
    if (!st || !Array.isArray(st.rows)) continue;
    tablesCompared++;
    const isHost = R.hostTables.has(`${mid}:${tid}`);
    const domRows = dt.getElementsByTagName('row');
    for (let r = 0; r < domRows.length; r++) {
      const entries = domRows[r].getElementsByTagName('entry').length;
      const recorded = st.rows[r] && Array.isArray(st.rows[r].cells) ? st.rows[r].cells.length : -1;
      rowsCompared++; if (isHost) hostRows++;
      if (recorded !== entries) { mismatch++; if (isHost) hostMismatch++; }
    }
  }
}

const multi = [...R.perCell.values()].filter((v) => v > 1);
console.log(`population (the 245): ${R.n} across ${R.mods.size} modules`);
console.log('\n1 · processTable BRANCH');
console.log(`  B1 cellParas>=1        (emitter NOT wired): ${R.b1}`);
R.b1examples.forEach((x) => console.log(`       ${x}`));
console.log(`  B2 single-content, text non-empty (NOT wired): ${R.b2}`);
console.log(`  B3 single-content, text EMPTY (§C88 emitter, guarded on media.id): ${R.b3}`);
console.log('\n2 · WHERE THE ALT LIVES');
console.log(`  on <media>: ${R.altOnMedia}   only on child <image>: ${R.altOnImage}`);
console.log('\n3 · KEYS AVAILABLE');
console.log(`  enclosing <table> @id: ${R.tableId} / no id: ${R.tableNoId}   distinct host tables: ${R.hostTables.size}`);
console.log(`  enclosing <entry> @id: ${R.entryId} / no id: ${R.entryNoId}`);
console.log(`  child <image>     @id: ${R.imageId} / no id: ${R.imageNoId}`);
console.log(`  duplicate (module,src) pairs: ${[...R.srcs.values()].filter((v) => v > 1).length} of ${R.srcs.size} distinct`);
console.log('\n4 · MULTIPLICITY');
console.log(`  cells holding >1 alt-bearing id-less media: ${multi.length}   max per cell: ${Math.max(0, ...R.perCell.values())}`);
console.log('\n5 · POSITIONAL-INDEX RELIABILITY (the m68863 cell-gap class)');
console.log(`  tables compared: ${tablesCompared}   rows compared: ${rowsCompared}`);
console.log(`  rows where recorded cells != source <entry> count: ${mismatch}`);
console.log(`  of those, in tables hosting one of the 245: ${hostMismatch}  (host rows checked: ${hostRows})`);
console.log('\nANCESTOR CHAINS (media -> ...)');
for (const [k, v] of Object.entries(R.chains).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
