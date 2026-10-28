import fs from 'node:fs';
import { detectResidue } from '/home/siggi/dev/repos/namsbokasafn-efni/tools/lib/residue-check.js';
const S = process.argv[2];
const pairs = JSON.parse(fs.readFileSync(`${S}/pairs_for_node.json`, 'utf8'));
for (const [v, af] of [['June', 'allow-J.json'], ['New', 'allow-N.json']]) {
  const allow = JSON.parse(fs.readFileSync(`${S}/${af}`, 'utf8'));
  const entries = allow.entries || allow.allow || allow.segments || [];
  const aset = new Set((Array.isArray(entries) ? entries : []).map((e) => `${e.moduleId}|${e.segmentId}`));
  let exact = 0, exactAfter = 0, warn = 0; const mods = {};
  for (const p of pairs[v]) {
    const r = detectResidue(p.en, p.is);
    if (r.exact) { exact++; const segId = p.sid; if (!aset.has(`${p.mod}|${segId}`) && !aset.has(`${p.mod}|${segId.split(':').slice(1).join(':')}`)) { exactAfter++; mods[p.mod] = (mods[p.mod] || 0) + 1; } }
    if (r.warn) warn++;
  }
  console.log(v, 'allowlist keys', Object.keys(allow), 'entries', aset.size, 'exact', exact, 'exact after allowlist', exactAfter, 'warn', warn, JSON.stringify(mods));
}
