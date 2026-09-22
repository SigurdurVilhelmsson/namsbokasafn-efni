/**
 * Does T2 (the FREE English round-trip) predict the fidelity manifest's
 * discrepancies (which only exist AFTER a paid buy + inject)?
 *
 * If it does, the T2 census is a pre-purchase predictor of the allowlist workload.
 * Compared as SETS of "module tag:diff", both directions, never by count.
 */
import fs from 'fs';

const [book, t2dir] = process.argv.slice(2);

// --- T2 side: parse tagCountDeltas out of the captured --verbose logs ---
const t2 = new Map(); // "module tag" -> diff
for (const f of fs.readdirSync(t2dir).filter((x) => x.endsWith('.log'))) {
  for (const line of fs.readFileSync(`${t2dir}/${f}`, 'utf8').split('\n')) {
    const m = line.match(/^🔴\s+(\S+)\s.*(\{.*\})\s*$/);
    if (!m) continue;
    let deltas;
    try { deltas = JSON.parse(m[2]); } catch { continue; }
    for (const [tag, v] of Object.entries(deltas)) {
      const mm = String(v).match(/^(\d+)->(\d+)$/);
      if (!mm) continue;
      t2.set(`${m[1]} ${tag}`, Number(mm[2]) - Number(mm[1]));
    }
  }
}

// --- fidelity side ---
const j = JSON.parse(fs.readFileSync(`books/${book}/translation-errors.json`, 'utf8'));
const track = j.tracks['mt-preview'];
const fid = new Map();
for (const m of track.modules || []) {
  for (const d of m.discrepancies || []) fid.set(`${m.moduleId} ${d.tag}`, d.diff);
}

// --- CONTROL: both instruments must have produced something ---
console.log(`book: ${book}`);
console.log(`T2 tag-delta module-pairs:        ${t2.size}`);
console.log(`fidelity discrepancy pairs:       ${fid.size}   (checked ${track.summary.totalChecked} of ${track.summary.totalSourceModules} modules)`);
if (t2.size === 0 || fid.size === 0) {
  console.log('⚠️ one instrument produced NOTHING — the comparison below is meaningless');
}

const inBoth = [...t2.keys()].filter((k) => fid.has(k));
const agree = inBoth.filter((k) => t2.get(k) === fid.get(k));
const disagree = inBoth.filter((k) => t2.get(k) !== fid.get(k));
const t2Only = [...t2.keys()].filter((k) => !fid.has(k));
const fidOnly = [...fid.keys()].filter((k) => !t2.has(k));

console.log(`\nIN BOTH:        ${inBoth.length}   (same diff: ${agree.length}, different diff: ${disagree.length})`);
disagree.forEach((k) => console.log(`   ≠ ${k}  T2=${t2.get(k)} fidelity=${fid.get(k)}`));
console.log(`\nT2 ONLY (pipeline-code loss the manifest has not seen): ${t2Only.length}`);
t2Only.forEach((k) => console.log(`   ${k}  ${t2.get(k)}`));
console.log(`\nFIDELITY ONLY (MT-side loss T2 structurally cannot see): ${fidOnly.length}`);
fidOnly.forEach((k) => console.log(`   ${k}  ${fid.get(k)}`));
