import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { createHash } from 'node:crypto';

const ROOT = '/home/siggi/dev/repos/namsbokasafn-efni';
const BOOK = join(ROOT, 'books/lifraen-efnafraedi/01-source');

function* cnxml(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* cnxml(p);
    else if (e.endsWith('.cnxml')) yield p;
  }
}
const anc = (n) => { const o=[]; let c=n.parentNode; while(c&&c.nodeName){o.push(c.nodeName);c=c.parentNode;} return o; };

// sanitiser candidates
const basenameOf = (s) => String(s).split('/').pop();
const slugify = (s) => basenameOf(s).replace(/[^\w-]+/g, '_');
const hashOf   = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 8);

const perModule = new Map();
let total = 0;
const hazards = { whitespace: 0, gt: 0, nonAscii: 0, empty: 0 };

for (const f of cnxml(BOOK)) {
  const mod = f.split('/').pop().replace('.cnxml', '');
  const doc = new DOMParser({ onError: () => {} }).parseFromString(readFileSync(f, 'utf8'), 'text/xml');
  for (const m of Array.from(doc.getElementsByTagName('media'))) {
    const a = anc(m);
    if (a[0] !== 'entry') continue;            // direct-parent predicate (the 245)
    if (a.includes('figure')) continue;
    if (m.getAttribute('id')) continue;         // guarded == id-less
    const alt = m.getAttribute('alt') || '';
    if (!alt) continue;
    const img = Array.from(m.getElementsByTagName('image'))[0];
    const src = img ? img.getAttribute('src') || '' : '';
    total++;
    if (!src) hazards.empty++;
    if (/\s/.test(src)) hazards.whitespace++;
    if (src.includes('>')) hazards.gt++;
    if (/[^\x20-\x7e]/.test(src)) hazards.nonAscii++;
    if (!perModule.has(mod)) perModule.set(mod, []);
    perModule.get(mod).push(src);
  }
}

console.log(`population: ${total} across ${perModule.size} modules`);
console.log('src hazards:', JSON.stringify(hazards));

for (const [name, fn] of [['basename', basenameOf], ['slug [\\w-]', slugify], ['sha1-8', hashOf]]) {
  let collide = 0, parseFail = 0, maxLen = 0;
  const CANON = /^[\w-]+$/;
  for (const [mod, srcs] of perModule) {
    const keys = srcs.map((s) => `${fn(s)}-alt`);
    collide += keys.length - new Set(keys).size;
    for (const k of keys) { if (!CANON.test(k)) parseFail++; maxLen = Math.max(maxLen, k.length); }
  }
  console.log(`${name.padEnd(12)} in-module collisions: ${String(collide).padEnd(4)} canonical-parse FAILURES: ${String(parseFail).padEnd(4)} maxKeyLen: ${maxLen}`);
}
