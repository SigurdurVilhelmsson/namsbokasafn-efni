/**
 * Does the proposed src-slug alt key collide with segment ids that ALREADY exist
 * in the same module? A collision would silently merge two segments.
 * Pure: calls extractSegments() in-process. Writes nothing.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { extractSegments } from '../tools/cnxml-extract.js';

const BOOK='/home/siggi/dev/repos/namsbokasafn-efni/books/lifraen-efnafraedi/01-source';
function* f(d){for(const e of readdirSync(d)){const p=join(d,e);if(statSync(p).isDirectory())yield* f(p);else if(e.endsWith('.cnxml'))yield p;}}
const anc=(n)=>{const o=[];let c=n.parentNode;while(c&&c.nodeName){o.push(c.nodeName);c=c.parentNode;}return o;};
const slug=(s)=>String(s).split('/').pop().replace(/[^\w-]+/g,'_');

let pop=0, collisions=[], modsTouched=0, dupWithin=0;
for(const p of [...f(BOOK)]){
  const src=readFileSync(p,'utf8');
  const doc=new DOMParser({onError:()=>{}}).parseFromString(src,'text/xml');
  const keys=[];
  for(const m of Array.from(doc.getElementsByTagName('media'))){
    const a=anc(m);
    if(a[0]!=='entry') continue;
    if(a.includes('figure')) continue;
    if(m.getAttribute('id')) continue;
    if(!m.getAttribute('alt')) continue;
    const img=Array.from(m.getElementsByTagName('image'))[0];
    const s=img?img.getAttribute('src')||'':'';
    keys.push(`${slug(s)}-alt`);
  }
  if(!keys.length) continue;
  modsTouched++; pop+=keys.length;
  dupWithin += keys.length - new Set(keys).size;
  // existing segment ids emitted TODAY for this module
  const existing=new Set(extractSegments(src).segments.map(s=>s.id));
  const mod=p.split('/').pop().replace('.cnxml','');
  for(const k of new Set(keys)){
    const full=`${mod}:alt:${k}`;
    if(existing.has(full)) collisions.push(full);
  }
}
console.log(`population ${pop} across ${modsTouched} modules`);
console.log(`in-module duplicate keys : ${dupWithin}`);
console.log(`collisions with EXISTING segment ids: ${collisions.length}`);
for(const c of collisions.slice(0,10)) console.log('   ', c);
