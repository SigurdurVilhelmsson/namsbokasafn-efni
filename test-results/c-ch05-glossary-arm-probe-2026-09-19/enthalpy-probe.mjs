// Per-segment: English segments mentioning enthalpy -> does the IS say verm- or varm-?
import fs from 'node:fs';
const [en, is] = process.argv.slice(2);
const parse = (t) => { const m = new Map(); const re = /<!--\s*SEG:([^\s]+?)\s*-->/g; let prev = null, idx = 0, x;
  while ((x = re.exec(t))) { if (prev) m.set(prev, t.slice(idx, x.index)); prev = x[1]; idx = re.lastIndex; }
  if (prev) m.set(prev, t.slice(idx)); return m; };
const E = parse(fs.readFileSync(en, 'utf8')), I = parse(fs.readFileSync(is, 'utf8'));
let n = 0, verm = 0, varmOnly = 0, neither = 0, missing = 0; const bad = [];
for (const [id, t] of E) { if (!/enthalp/i.test(t)) continue; n++; const s = I.get(id);
  if (s === undefined) { missing++; continue; }
  const hasVerm = /verm/i.test(s), hasVarm = /varm/i.test(s);
  if (hasVerm) verm++; else if (hasVarm) { varmOnly++; bad.push(id); } else { neither++; bad.push(id + ' (neither)'); } }
console.log(JSON.stringify({ enthalpySegments: n, isHasVerm: verm, isVarmOnly: varmOnly, neither, missing }));
for (const b of bad.slice(0, 15)) console.log('  ' + b);
