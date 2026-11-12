#!/usr/bin/env node
/**
 * G1.12 Task 3b: the per-check x per-unit verdicts of the §C82 battery, as the sweep runs them.
 *
 *   node test-results/g112-duplicate-ids-2026-11-12/battery-verdicts.mjs --root <repo> --book <slug> --out <file>
 *   node test-results/g112-duplicate-ids-2026-11-12/battery-verdicts.mjs --compare <before> <after>
 *
 * `tools/remt-sweep.js` prints only per-check aggregates (text and `--json`), so it cannot say
 * WHICH module changed verdict. This walks the sweep's own `TIER_SPECS` (its unit lists and its
 * ctx builders) and calls `runCheck` once per (check, unit), exactly as `sweep()` does with no
 * spawns, and writes one JSON object per line.
 *
 * `--root` names the checkout whose `tools/` and `books/` are measured, so the same script can
 * read the branch start from another worktree. `remt-sweep.js` and `lib/remt-battery.js` are both
 * imported from that root: a second module instance would carry its own, empty REGISTRY.
 *
 * `--compare` reads two dumps and prints every (check, unit) whose verdict differs, then the
 * per-check message and `examined` differences. It also prints each dump's per-check verdict
 * tallies, which must equal the sweep CLI's rows on the same side (the control that this walk
 * is the sweep's walk).
 *
 * Read-only on the measured tree. The exit code is 1 until the dump or the comparison is written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.exitCode = 1;

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

function unitKey(tier, u) {
  if (tier === 0) return u.book;
  if (tier === 1 || tier === 2) return `${u.ch ?? '-'}/${u.module}`;
  if (tier === 3) return `${u.track}/${u.ch}/${u.module}`;
  return `${u.track}/${u.chapter}`;
}

async function dump(root, book, out) {
  const absRoot = path.resolve(root);
  const sweepMod = await import(pathToFileURL(path.join(absRoot, 'tools', 'remt-sweep.js')).href);
  const batteryMod = await import(
    pathToFileURL(path.join(absRoot, 'tools', 'lib', 'remt-battery.js')).href
  );
  const { TIER_SPECS, UNMEASURABLE } = sweepMod;
  const { REGISTRY, runCheck } = batteryMod;
  if (REGISTRY.size === 0) throw new Error('empty REGISTRY: the tier modules did not load');
  const lines = [];
  for (const spec of TIER_SPECS) {
    const checks = [...REGISTRY.values()].filter((c) => c.tier === spec.tier && !UNMEASURABLE[c.id]);
    for (const unit of spec.units(book)) {
      const key = unitKey(spec.tier, unit);
      let ctx;
      try {
        ctx = spec.ctx(unit, { spawns: undefined });
      } catch (e) {
        for (const c of checks)
          lines.push({ tier: spec.tier, check: c.id, unit: key, verdict: 'CTX-FAILED', message: e.message });
        continue;
      }
      for (const c of checks) {
        const r = await runCheck(c, ctx);
        lines.push({
          tier: spec.tier,
          check: c.id,
          unit: key,
          verdict: r.verdict,
          examined: r.examined,
          kinds: [...new Set((r.findings || []).map((f) => f.kind))].sort(),
          findings: (r.findings || []).length,
          // Normalised so the same message from two checkouts compares equal.
          message: String(r.message || '').split(absRoot).join('<root>'),
        });
      }
    }
  }
  fs.writeFileSync(out, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  process.stdout.write(`wrote ${lines.length} verdicts to ${out}\n`);
  process.exitCode = 0;
}

const load = (p) =>
  fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

function tallies(rows) {
  const t = new Map();
  for (const r of rows) {
    if (!t.has(r.check)) t.set(r.check, { tier: r.tier, PASS: 0, FAIL: 0, WARN: 0, SKIPPED: 0, other: 0 });
    const a = t.get(r.check);
    if (r.verdict in a && r.verdict !== 'tier') a[r.verdict]++;
    else a.other++;
  }
  return [...t].sort((x, y) => x[1].tier - y[1].tier || (x[0] < y[0] ? -1 : 1));
}

function compare(beforePath, afterPath) {
  const before = load(beforePath);
  const after = load(afterPath);
  const k = (r) => `${r.check}\t${r.unit}`;
  const a = new Map(before.map((r) => [k(r), r]));
  const b = new Map(after.map((r) => [k(r), r]));
  const out = [];
  out.push(`before: ${beforePath} (${before.length} verdicts)`);
  out.push(`after:  ${afterPath} (${after.length} verdicts)`);
  const onlyA = [...a.keys()].filter((x) => !b.has(x));
  const onlyB = [...b.keys()].filter((x) => !a.has(x));
  out.push(`(check, unit) keys only before: ${onlyA.length}; only after: ${onlyB.length}`);
  for (const x of onlyA) out.push(`  only before: ${x}`);
  for (const x of onlyB) out.push(`  only after:  ${x}`);

  out.push('', '== per-check verdict tallies (before | after) ==');
  const ta = new Map(tallies(before));
  const tb = new Map(tallies(after));
  for (const [id, t] of tallies([...before, ...after])) {
    const f = (m) => {
      const v = m.get(id);
      return v ? `PASS ${v.PASS} FAIL ${v.FAIL} WARN ${v.WARN} SKIP ${v.SKIPPED}` : '(absent)';
    };
    out.push(`  T${t.tier} ${id.padEnd(4)} ${f(ta).padEnd(36)} | ${f(tb)}`);
  }

  const verdictDiffs = [];
  const msgDiffs = new Map();
  const examinedDiffs = new Map();
  const kindDiffs = new Map();
  for (const [key, ra] of a) {
    const rb = b.get(key);
    if (!rb) continue;
    if (ra.verdict !== rb.verdict) verdictDiffs.push(`${ra.check}\t${ra.unit}\t${ra.verdict} -> ${rb.verdict}`);
    const bump = (m, item) => {
      if (!m.has(ra.check)) m.set(ra.check, []);
      m.get(ra.check).push(item);
    };
    if (ra.message !== rb.message) bump(msgDiffs, `${ra.unit}\n      before: ${ra.message}\n      after:  ${rb.message}`);
    if (ra.examined !== rb.examined) bump(examinedDiffs, `${ra.unit} ${ra.examined} -> ${rb.examined}`);
    if (JSON.stringify(ra.kinds) !== JSON.stringify(rb.kinds) || ra.findings !== rb.findings)
      bump(kindDiffs, `${ra.unit} [${ra.kinds}] x${ra.findings} -> [${rb.kinds}] x${rb.findings}`);
  }
  out.push('', `== (check, unit) verdicts that differ: ${verdictDiffs.length} ==`);
  const byCheck = new Map();
  for (const d of verdictDiffs) {
    const id = d.split('\t')[0];
    byCheck.set(id, (byCheck.get(id) || 0) + 1);
  }
  out.push(`  by check: ${[...byCheck].map(([id, n]) => `${id} ${n}`).join(', ') || '(none)'}`);
  for (const d of verdictDiffs) out.push(`  ${d}`);

  out.push('', '== findings (kinds / count) that differ, by check ==');
  for (const [id, items] of [...kindDiffs].sort()) {
    out.push(`  ${id}: ${items.length} unit(s)`);
    for (const it of items) out.push(`    ${it}`);
  }
  out.push('', '== examined counts that differ, by check ==');
  for (const [id, items] of [...examinedDiffs].sort()) {
    out.push(`  ${id}: ${items.length} unit(s)`);
    for (const it of items) out.push(`    ${it}`);
  }
  out.push('', '== messages that differ, by check ==');
  for (const [id, items] of [...msgDiffs].sort()) {
    out.push(`  ${id}: ${items.length} unit(s)`);
    for (const it of items) out.push(`    ${it}`);
  }
  process.stdout.write(out.join('\n') + '\n');
  process.exitCode = 0;
}

async function main() {
  const cmp = argv.indexOf('--compare');
  if (cmp >= 0) {
    const [x, y] = [argv[cmp + 1], argv[cmp + 2]];
    if (!x || !y) throw new Error('usage: --compare <before> <after>');
    return compare(x, y);
  }
  const root = flag('--root');
  const book = flag('--book');
  const out = flag('--out');
  if (!root || !book || !out) throw new Error('usage: --root <repo> --book <slug> --out <file>');
  return dump(root, book, out);
}

main().catch((e) => {
  process.stderr.write(`${e.stack || e.message}\n`);
  process.exitCode = 1;
});
