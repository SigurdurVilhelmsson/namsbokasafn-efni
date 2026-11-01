// Final-text differences between two term-pass runs AFTER THE GATE, via the CLI's own dry apply
// (term-pass.js main(['apply', ...]) without --write: reads files, writes nothing).
// Usage: node final-text-diff.mjs <repoRoot> <runA> <runB> <outJson>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [repoRoot, runA, runB, outJson] = process.argv.slice(2);
const { main } = await import(pathToFileURL(path.join(repoRoot, 'tools/ai-review/term-pass.js')).href);

async function finals(runId) {
  const { result } = await main(['apply', '--chapter', 'ch10', '--run', runId], { stdout: () => {} });
  const map = new Map(); // `${stem}|${segmentId}|${occurrence}` → { before, after }
  for (const u of result.units) {
    for (const c of u.changes) {
      const k = `${u.stem}|${c.segmentId}|${c.occurrence}`;
      const prev = map.get(k);
      map.set(k, { before: prev ? prev.before : c.before, after: c.after });
    }
  }
  return { map, counts: result.counts };
}

const A = await finals(runA);
const B = await finals(runB);
const keys = [...new Set([...A.map.keys(), ...B.map.keys()])].sort();
const rows = [];
for (const k of keys) {
  const a = A.map.get(k);
  const b = B.map.get(k);
  const before = (a ?? b).before;
  const fa = a ? a.after : before;
  const fb = b ? b.after : before;
  if (fa !== fb) rows.push({ key: k, kind: !a ? 'only-xhigh' : !b ? 'only-high' : 'both-differ', before, high: fa, xhigh: fb });
}
const segOf = (k) => k.split('|').slice(0, 2).join('|');
const changedA = new Set([...A.map.keys()].map(segOf));
const changedB = new Set([...B.map.keys()].map(segOf));
const differSegs = new Set(rows.map((r) => segOf(r.key)));
const byKind = rows.reduce((m, r) => ((m[r.kind] = (m[r.kind] ?? 0) + 1), m), {});
console.log(`occurrences changed: high ${A.map.size}, xhigh ${B.map.size}; in both ${keys.filter((k) => A.map.has(k) && B.map.has(k)).length}`);
console.log(`segments changed: high ${changedA.size}, xhigh ${changedB.size}; union ${new Set([...changedA, ...changedB]).size}`);
console.log(`final text DIFFERS on ${rows.length} occurrences in ${differSegs.size} segments: ${JSON.stringify(byKind)}`);
fs.writeFileSync(outJson, JSON.stringify(rows, null, 1));
console.log(`wrote ${outJson}`);
