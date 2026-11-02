// The short look's sample (2026-10-28 record, decision 4): 20 accepted operations per category,
// across segment types, from the full run's layer 2. Read-only. Deterministic: the seed below was
// fixed before the first draw; selection ranks by sha256(seed|opId) within each stratum.
//
// Allocation per category: one per segment type present, then the remaining slots proportional to
// each type's count (largest remainder; ties by type name; capped at what the type has). This
// over-weights rare types on purpose (a screen to stop a bad category), so the sample is NOT an
// unbiased estimate of the category's error rate.
//
// Writes: sample.json (the KEY: category per item, not for the page) and items.json (blind: no
// category, ruling, reason, chapter or module).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseLayerFile } from '/home/siggi/dev/repos/namsbokasafn-efni/tools/lib/mt-layers.js';

const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';
const BOOK = path.join(REPO, 'books/efnafraedi-2e');
const OUT = path.dirname(new URL(import.meta.url).pathname);
const SEED = 'short-look-2026-11-02';
const PER_CATEGORY = 20;

const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim();
const commit = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain', '--', 'books/efnafraedi-2e/ai-review', 'books/efnafraedi-2e/02-mt-revised', 'books/efnafraedi-2e/02-for-mt');
if (dirty) throw new Error(`inputs are not clean at HEAD:\n${dirty}`);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ── Population ──────────────────────────────────────────────────────────────────────────
const applied = path.join(BOOK, 'ai-review/applied');
const chapters = fs.readdirSync(applied).sort();
if (chapters.includes('ch10')) throw new Error('the pilot chapter must not be in the population');
const pop = [];
for (const ch of chapters) {
  for (const line of fs.readFileSync(path.join(applied, ch, 'gate.jsonl'), 'utf8').trim().split('\n')) {
    const g = JSON.parse(line);
    if (g.kind !== 'op' || g.verdict !== 'accepted') continue;
    pop.push({ chapter: ch, opId: g.opId, segmentId: g.segmentId, segmentType: g.segmentId.split(':')[1], category: g.op.category });
  }
}

// ── Allocation and draw ─────────────────────────────────────────────────────────────────
function allocate(counts, n) {
  const types = Object.keys(counts).sort();
  if (types.length > n) throw new Error('more types than slots');
  const alloc = Object.fromEntries(types.map((t) => [t, 1]));
  let left = n - types.length;
  const total = types.reduce((s, t) => s + counts[t], 0);
  while (left > 0) {
    const room = types.filter((t) => alloc[t] < counts[t]);
    const roomTotal = room.reduce((s, t) => s + counts[t], 0);
    const shares = room.map((t) => ({ t, q: (left * counts[t]) / roomTotal }));
    let given = 0;
    for (const { t, q } of shares) {
      const k = Math.min(Math.floor(q), counts[t] - alloc[t]);
      alloc[t] += k;
      given += k;
    }
    left -= given;
    const byRem = shares
      .filter(({ t }) => alloc[t] < counts[t])
      .sort((a, b) => (b.q - Math.floor(b.q)) - (a.q - Math.floor(a.q)) || a.t.localeCompare(b.t));
    for (const { t } of byRem) {
      if (left === 0) break;
      alloc[t] += 1;
      left -= 1;
    }
    if (given === 0 && byRem.length === 0) throw new Error('cannot fill the allocation');
  }
  void total;
  return alloc;
}
const categories = [...new Set(pop.map((p) => p.category))].sort();
const allocation = {};
const drawn = [];
for (const cat of categories) {
  const rows = pop.filter((p) => p.category === cat);
  const counts = {};
  for (const r of rows) counts[r.segmentType] = (counts[r.segmentType] || 0) + 1;
  const alloc = allocate(counts, PER_CATEGORY);
  allocation[cat] = { population: rows.length, byType: counts, drawn: alloc };
  for (const [t, k] of Object.entries(alloc)) {
    const ranked = rows.filter((r) => r.segmentType === t).sort((a, b) => sha(`${SEED}|${a.opId}`).localeCompare(sha(`${SEED}|${b.opId}`)));
    drawn.push(...ranked.slice(0, k));
  }
}

// ── Items: EN, MT (layer 1), the suggestion (final layer 2), spans ──────────────────────
const changesCache = new Map();
function changesOf(ch, module) {
  const k = `${ch}/${module}`;
  if (!changesCache.has(k)) {
    const f = path.join(BOOK, '02-mt-revised', ch, `${module}-changes.jsonl`);
    changesCache.set(k, fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
  }
  return changesCache.get(k);
}
const enCache = new Map();
function enOf(ch, module, key) {
  const k = `${ch}/${module}`;
  if (!enCache.has(k)) {
    const p = parseLayerFile(fs.readFileSync(path.join(BOOK, '02-for-mt', ch, `${module}-segments.en.md`), 'utf8'));
    enCache.set(k, new Map(p.records.map((r) => [r.key, r.body])));
  }
  return enCache.get(k).get(key);
}
// The changed span between two strings, widened to whole words (letters and digits only, so an
// inline marker next to a word is not swallowed).
function span(a, b) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  while (p > 0 && /[\p{L}\p{N}]/u.test(a[p - 1])) p--;
  while (s > 0 && /[\p{L}\p{N}]/u.test(a[a.length - s])) s--;
  return { start: p, oldEnd: a.length - s, newEnd: b.length - s };
}
const problems = [];
const items = drawn.map((d) => {
  const module = d.segmentId.split(':')[0];
  const recs = changesOf(d.chapter, module);
  const mine = recs.filter((r) => r.opId === d.opId);
  if (mine.length === 0) throw new Error(`${d.opId}: accepted but no change record`);
  const occ = Math.min(...mine.map((r) => r.occurrence));
  const chain = recs.filter((r) => r.segmentId === d.segmentId && r.occurrence === occ);
  const j = chain.findIndex((r) => r.opId === d.opId);
  const spans = chain.map((r) => span(r.before, r.after));
  // Map record i's new span forward to final coordinates; its old span back to layer-1 coordinates.
  const toFinal = (i) => {
    let a = spans[i].start, b = spans[i].newEnd;
    for (let k = i + 1; k < chain.length; k++) {
      const { start, oldEnd, newEnd } = spans[k];
      if (oldEnd <= a) { a += newEnd - oldEnd; b += newEnd - oldEnd; }
      else if (start >= b) { /* after: unchanged */ }
      else return null;
    }
    return [a, b];
  };
  const toLayer1 = (i) => {
    let a = spans[i].start, b = spans[i].oldEnd;
    for (let k = i - 1; k >= 0; k--) {
      const { start, oldEnd, newEnd } = spans[k];
      if (newEnd <= a) { a += oldEnd - newEnd; b += oldEnd - newEnd; }
      else if (start >= b) { /* after */ }
      else return null;
    }
    return [a, b];
  };
  const layer1 = chain[0].before;
  const final = chain[chain.length - 1].after;
  const judged = { mt: toLayer1(j), suggestion: toFinal(j) };
  const context = chain.map((_, i) => i).filter((i) => i !== j).map((i) => ({ mt: toLayer1(i), suggestion: toFinal(i), find: chain[i].find, replace: chain[i].replace }));
  if (!judged.mt || !judged.suggestion || context.some((c) => !c.mt || !c.suggestion)) problems.push(`${d.opId}: overlapping spans`);
  const en = enOf(d.chapter, module, occ === 0 ? d.segmentId : `${d.segmentId}#${occ}`);
  if (en == null) problems.push(`${d.opId}: no English`);
  return { opId: d.opId, segmentType: d.segmentType, en, mt: layer1, suggestion: final, judged, context, find: chain[j].find, replace: chain[j].replace };
});

// Blind order: shuffled across categories by sha256(seed|order|opId).
const order = [...items].sort((a, b) => sha(`${SEED}|order|${a.opId}`).localeCompare(sha(`${SEED}|order|${b.opId}`)));
const blind = order.map((it, i) => ({ id: `i${String(i + 1).padStart(2, '0')}`, ...it, opId: undefined }));
const key = order.map((it, i) => {
  const d = drawn.find((x) => x.opId === it.opId);
  return { id: `i${String(i + 1).padStart(2, '0')}`, opId: d.opId, chapter: d.chapter, segmentId: d.segmentId, segmentType: d.segmentType, category: d.category };
});

const chaptersPer = Object.fromEntries(categories.map((c) => [c, [...new Set(drawn.filter((d) => d.category === c).map((d) => d.chapter))].length]));
fs.writeFileSync(path.join(OUT, 'sample.json'), `${JSON.stringify({ commit, seed: SEED, perCategory: PER_CATEGORY, method: 'one per segment type present, the rest proportional by largest remainder; within a stratum the lowest sha256(seed|opId)', populationTotal: pop.length, allocation, chaptersPerCategory: chaptersPer, problems, key }, null, 2)}\n`);
fs.writeFileSync(path.join(OUT, 'items.json'), `${JSON.stringify(blind, null, 2)}\n`);
console.log(JSON.stringify({ commit: commit.slice(0, 9), population: pop.length, items: items.length, chaptersPer, problems, drawnByType: Object.fromEntries(categories.map((c) => [c, allocation[c].drawn])) }, null, 1));
