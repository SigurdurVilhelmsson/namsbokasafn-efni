// Independent sentinel test: does a TRANSLATED alt actually reach injected output?
// Method: extract a module, replace every :alt: segment's TEXT with a unique token,
// run the real buildCnxml, and count how many tokens appear in the output.
// Positive control is built in: in-para and standalone positions should score 100%.
import fs from 'node:fs';
import path from 'node:path';
import { extractSegments, formatSegmentsMarkdown } from '/home/siggi/dev/repos/namsbokasafn-efni/tools/cnxml-extract.js';
import { buildCnxml, parseSegments } from '/home/siggi/dev/repos/namsbokasafn-efni/tools/cnxml-inject.js';

const ROOT = '/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/01-source';
const walk = (d, o = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, e.name); if (e.isDirectory()) walk(p, o); else if (e.name.endsWith('.cnxml')) o.push(p);} return o; };

let emitted = 0, reached = 0;
const missModules = [];
for (const f of walk(ROOT)) {
  const src = fs.readFileSync(f, 'utf8');
  const { segments, structure, equations, inlineAttrs } = extractSegments(src);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  // Overwrite every alt segment's value with a unique sentinel
  let n = 0;
  const sent = new Map();
  for (const [k] of parsed) {
    if (String(k).split(':')[1] !== 'alt') continue;
    const tok = `ZQXALT${n}ZQX`;
    parsed.set(k, tok); sent.set(k, tok); n++;
  }
  if (!n) continue;
  emitted += n;
  const out = buildCnxml(structure, parsed, equations, src, {}, inlineAttrs).cnxml;
  let hit = 0;
  for (const tok of sent.values()) if (out.includes(tok)) hit++;
  reached += hit;
  if (hit < n) missModules.push(`${path.basename(f, '.cnxml')} ${hit}/${n}`);
}
console.log(`chemistry alt segments emitted : ${emitted}`);
console.log(`translations REACHING output   : ${reached}`);
console.log(`DROPPED                        : ${emitted - reached}  (${(((emitted-reached)/emitted)*100).toFixed(1)}%)`);
console.log(`\nmodules with any drop: ${missModules.length}`);
console.log(missModules.slice(0, 8).join(' · '));
