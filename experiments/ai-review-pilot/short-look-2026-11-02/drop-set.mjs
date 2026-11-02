// The short look's drop set (2026-11-02), computed from layer 2's change logs. ¤0, no network.
//
// [USER] ruled (2026-11-02): the short look's verdicts stand, so the agreement category is
// dropped, and with it every term or term-sense change an agreement change follows, so that
// no editor is shown a term change whose ending is left broken.
//
// The unit dropped: each agreement change records the ruling it agrees with (`rulingId`). The
// unit is the apply gate's own: a ruling's operations in one segment, over all its occurrences,
// stand or fall together (term-pass-apply.js `gateWithGroups`, "all or nothing per ruling";
// GROUP_INCOMPLETE). Layer 2 never holds part of a ruling's group, so the drop removes every
// change under that ruling in that segment, never one term change out of it. (A ruling can make
// several term changes in one segment; the before/after texts could be read to guess which one
// an agreement change follows, but that would be a heuristic the tool itself does not use.)
//
// Two narrower links are counted for comparison: the LAST same-ruling term-type change before
// the agreement change, and the nearest earlier term-type change of any ruling (the count the
// first report to [USER] used, 91; it attaches 14 chains' agreement to the wrong ruling).
//
// The replay: with the dropped changes removed, every kept change in an affected chain is
// applied in order to the chain's first `before` text under the apply tool's rule (its `find`
// occurs exactly once, tools/ai-review/term-pass-apply.js `chainChanges`). A kept change
// that no longer applies is listed.
//
// Usage: node drop-set.mjs <repo> <out.json>
import fs from 'node:fs';
import path from 'node:path';

const [repo, outPath] = process.argv.slice(2);
const root = path.join(repo, 'books/efnafraedi-2e/02-mt-revised');
const ops = [];
for (const ch of fs.readdirSync(root).sort()) {
  const dir = path.join(root, ch);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('-changes.jsonl')) continue;
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (line.trim()) ops.push({ chapter: ch, ...JSON.parse(line) });
    }
  }
}

const chains = new Map();
for (const o of ops) {
  const k = `${o.module} ${o.segmentId} ${o.occurrence}`;
  if (!chains.has(k)) chains.set(k, []);
  chains.get(k).push(o);
}
for (const [k, list] of chains) {
  for (let i = 1; i < list.length; i++) {
    if (list[i].beforeSha256 !== list[i - 1].afterSha256) throw new Error(`${k}: not one chain`);
  }
}

const isTermType = (o) => o.category === 'term' || o.category === 'term-sense';
const groups = new Set();
const byRuling = new Set();
const byPosition = new Set();
const unlinked = [];
const affected = new Set();
for (const [k, list] of chains) {
  list.forEach((o, i) => {
    if (o.category !== 'agreement') return;
    affected.add(k);
    groups.add(`${o.module} ${o.segmentId} ${o.rulingId}`);
    const earlier = list.slice(0, i).filter(isTermType);
    const same = earlier.filter((t) => t.rulingId === o.rulingId);
    if (same.length) byRuling.add(same[same.length - 1].opId + ' ' + k);
    else unlinked.push({ opId: o.opId, rulingId: o.rulingId, chain: k });
    if (earlier.length) byPosition.add(earlier[earlier.length - 1].opId + ' ' + k);
  });
}

const dropKey = (o) => `${o.opId} ${o.module} ${o.segmentId} ${o.occurrence}`;
const groupOf = (o) => `${o.module} ${o.segmentId} ${o.rulingId}`;
const dropped = new Set(ops.filter((o) => groups.has(groupOf(o))).map(dropKey));

const notApplying = [];
for (const k of affected) {
  const list = chains.get(k);
  let text = list[0].before;
  for (const o of list) {
    if (dropped.has(dropKey(o))) continue;
    const at = text.indexOf(o.find);
    if (at < 0 || text.indexOf(o.find, at + 1) !== -1) {
      notApplying.push({ opId: o.opId, category: o.category, chain: k });
      continue;
    }
    text = text.slice(0, at) + o.replace + text.slice(at + o.find.length);
  }
}

const count = (pred) => ops.filter(pred).length;
const droppedOps = ops.filter((o) => dropped.has(dropKey(o)));
const tally = (list) =>
  list.reduce((m, o) => ((m[o.category] = (m[o.category] ?? 0) + 1), m), {});
const out = {
  date: '2026-11-02',
  rule: 'drop every change in each (module, segmentId, rulingId) group, over all occurrences, that holds an agreement change',
  totals: {
    changes: ops.length,
    byCategory: tally(ops),
    chains: chains.size,
    chainsWithAgreement: affected.size,
  },
  groupsDropped: groups.size,
  unlinkedAgreement: unlinked,
  narrowerLinks: {
    lastSameRulingTermType: byRuling.size,
    nearestTermTypeAnyRuling: byPosition.size,
    agree: byRuling.size === byPosition.size && [...byRuling].every((x) => byPosition.has(x)),
  },
  dropped: { count: droppedOps.length, byCategory: tally(droppedOps) },
  kept: { count: ops.length - droppedOps.length, byCategory: tally(ops.filter((o) => !dropped.has(dropKey(o)))) },
  termTypeShareDropped: +((droppedOps.length - count((o) => o.category === 'agreement')) / count(isTermType)).toFixed(4),
  replay: { chainsReplayed: affected.size, keptChangesNotApplying: notApplying },
  droppedChanges: droppedOps.map((o) => ({
    chapter: o.chapter,
    module: o.module,
    segmentId: o.segmentId,
    occurrence: o.occurrence,
    opId: o.opId,
    category: o.category,
    rulingId: o.rulingId,
  })),
};
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 1)}\n`);
const { droppedChanges, ...summary } = out;
console.log(JSON.stringify(summary, null, 1));
