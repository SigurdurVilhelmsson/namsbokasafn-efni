// The leftover-form check (tools/ai-review/leftover-forms.js) over the ch10 pilot's three
// dry-apply reports, compared with the off-repo prototype's (segment, ruling) pairs.
// 2026-10-30. ¤0, no network.
//
// Inputs: the Markdown reports `apply --report` wrote for the three pilot runs, from a commit
// before prompt v2 (apply checks the current prompt), and the pilot's ruling set
// (experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json). The
// reports are off-repo; the runs they come from are committed in books/efnafraedi-2e/ai-review/runs/.
// The prototype's pairs are recorded in the output as data; the prototype itself is off-repo.
//
// Usage: node leftover-check-vs-prototype.mjs <repo> <rulingSet.json> <prototypePairs.json> <out.json> <report.md>...
import fs from 'node:fs';
import path from 'node:path';

const [repo, rsPath, protoPath, outPath, ...reports] = process.argv.slice(2);
const { leftoverForms } = await import(path.join(repo, 'tools/ai-review/leftover-forms.js'));
const rs = JSON.parse(fs.readFileSync(rsPath, 'utf8'));
const byId = new Map(rs.rulings.map((r) => [r.id, r]));
const proto = JSON.parse(fs.readFileSync(protoPath, 'utf8'));
const runs = {};
for (const rep of reports) {
  const name = path.basename(rep);
  const hits = [];
  for (const block of fs.readFileSync(rep, 'utf8').split(/^## /m).slice(1)) {
    const segmentId = block.slice(0, block.indexOf('\n')).trim();
    const after = /\*\*IS after\*\*\n((?:> .*\n?)+)/.exec(block);
    if (!after) continue;
    const text = after[1]
      .split('\n')
      .map((l) => l.slice(2))
      .join(' ');
    const accepted = [
      ...block.matchAll(/^- ✔ — (term|agreement) `([^`]+)`: `([^`]+)` → `([^`]+)`/gm),
    ].map((m) => ({ category: m[1], rulingId: m[2], find: m[3] }));
    for (const h of leftoverForms({ after: text, accepted, rulingsById: byId }))
      hits.push({ segmentId, ...h });
  }
  const pairs = new Set(hits.map((h) => `${h.segmentId} ${h.rulingId}`));
  const protoPairs = new Set(proto[name] ?? []);
  runs[name] = {
    hits,
    pairs: pairs.size,
    prototypePairs: protoPairs.size,
    onlyNew: [...pairs].filter((p) => !protoPairs.has(p)),
    onlyPrototype: [...protoPairs].filter((p) => !pairs.has(p)),
  };
  console.log(`${name}: ${pairs.size} pairs (prototype ${protoPairs.size})`);
}
fs.writeFileSync(
  outPath,
  `${JSON.stringify({ date: '2026-10-30', rulingSet: path.basename(rsPath), runs }, null, 1)}\n`
);
