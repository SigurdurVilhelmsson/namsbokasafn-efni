/**
 * PREDICTED NUMBER: for each organic module with an <emphasis> tagCountDelta,
 * does the loss equal its count of effect values the extractor has NO case for?
 *
 * cnxml-extract.js:445-451 handles italics/bold/underline and falls through to
 * `return inner` for anything else. So the prediction is:
 *     |delta|  ==  (count of emphasis whose effect is not in the handled set)
 *                + (emphasis lost to different-effect NESTING)
 *
 * A count that matches exactly is evidence the mechanism is the whole story for
 * that module. A residual is a module with a mechanism nobody has named yet.
 */
import fs from 'fs';
import path from 'path';
import { DOMParser } from '@xmldom/xmldom';

const HANDLED = new Set(['italics', 'bold', 'underline']);
const ROOT = 'books/lifraen-efnafraedi/01-source';
const t2dir = process.argv[2];

// --- read the T2 emphasis deltas ---
const deltas = new Map();
for (const f of fs.readdirSync(t2dir).filter((x) => x.endsWith('.log'))) {
  for (const line of fs.readFileSync(`${t2dir}/${f}`, 'utf8').split('\n')) {
    const m = line.match(/^🔴\s+(\S+)\s.*(\{.*\})\s*$/);
    if (!m) continue;
    let d;
    try { d = JSON.parse(m[2]); } catch { continue; }
    if (!d.emphasis) continue;
    const mm = String(d.emphasis).match(/^(\d+)->(\d+)$/);
    if (mm) deltas.set(m[1], Number(mm[1]) - Number(mm[2]));
  }
}

// --- locate each module's source and census it ---
const loc = new Map();
for (const d of fs.readdirSync(ROOT)) {
  const p = path.join(ROOT, d);
  if (!fs.statSync(p).isDirectory()) continue;
  for (const f of fs.readdirSync(p).filter((x) => x.endsWith('.cnxml'))) {
    loc.set(f.replace('.cnxml', ''), path.join(p, f));
  }
}

let exact = 0, over = 0, under = 0, totalLost = 0, clearedByFix = 0;
const rows = [];
for (const [mod, lost] of [...deltas].sort()) {
  const file = loc.get(mod);
  if (!file) { rows.push(`${mod}  NO SOURCE FILE FOUND`); continue; }
  const doc = new DOMParser({ onError() {} }).parseFromString(fs.readFileSync(file, 'utf8'), 'text/xml');
  const em = doc.getElementsByTagName('emphasis');
  let unhandled = 0, nestedDiff = 0;
  for (let i = 0; i < em.length; i++) {
    const e = em[i];
    const eff = e.getAttribute('effect');
    if (eff && !HANDLED.has(eff)) unhandled++;
    let a = e.parentNode, outer = null;
    while (a && a.nodeName) { if (a.nodeName === 'emphasis') { outer = a; break; } a = a.parentNode; }
    if (outer && (outer.getAttribute('effect') || '') !== (eff || '')) nestedDiff++;
  }
  const predicted = unhandled + nestedDiff;
  const verdict = predicted === lost ? 'EXACT' : predicted > lost ? `over by ${predicted - lost}` : `UNDER by ${lost - predicted}`;
  if (predicted === lost) { exact++; clearedByFix += lost; }
  else if (predicted > lost) over++;
  else under++;
  totalLost += lost;
  rows.push(`${mod.padEnd(9)} lost=${String(lost).padStart(3)}  unhandled-effect=${String(unhandled).padStart(3)}  nested-diff-effect=${String(nestedDiff).padStart(2)}  => ${verdict}`);
}

console.log(`organic modules with an <emphasis> tagCountDelta: ${deltas.size}`);
console.log(`total emphasis elements lost:                      ${totalLost}`);
console.log('');
rows.forEach((r) => console.log('  ' + r));
console.log('');
console.log(`EXACT (mechanism fully explains the module): ${exact}`);
console.log(`prediction OVER  (some construct survives):  ${over}`);
console.log(`prediction UNDER (a mechanism is missing):   ${under}`);
console.log(`emphasis elements in the EXACT modules:      ${clearedByFix} of ${totalLost}`);
