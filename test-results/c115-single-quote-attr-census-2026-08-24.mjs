/** Census: single-quoted attributes in 01-source, by attribute name and element. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const ROOT='/home/siggi/dev/repos/namsbokasafn-efni/books';
function* f(d){for(const e of readdirSync(d)){const p=join(d,e);if(statSync(p).isDirectory())yield* f(p);else if(e.endsWith('.cnxml'))yield p;}}
const SPAN=`(?:"[^"]*"|'[^']*'|[^>'"])*`;
const books=['efnafraedi-2e','lifraen-efnafraedi','edlisfraedi-2e','liffraedi-2e','orverufraedi'];
const KEPT=new Set(['efnafraedi-2e','lifraen-efnafraedi']);
for(const b of books){
  const dir=join(ROOT,b,'01-source'); let files=[]; try{files=[...f(dir)];}catch{continue;}
  const byAttr=new Map(); let tags=0;
  const openRe=new RegExp(`<([a-zA-Z][\\w:.-]*)${SPAN}>`,'g');
  for(const p of files){
    const s=readFileSync(p,'utf8'); let m;
    openRe.lastIndex=0;
    while((m=openRe.exec(s))!==null){
      tags++;
      // find single-quoted attribute pairs inside this open tag
      const sq=m[0].match(/[\w:-]+='[^']*'/g)||[];
      for(const pair of sq){
        const name=pair.split('=')[0];
        const k=`${m[1]}@${name}`;
        byAttr.set(k,(byAttr.get(k)||0)+1);
      }
    }
  }
  const rows=[...byAttr.entries()].sort((a,b)=>b[1]-a[1]);
  console.log(`${b.padEnd(20)} ${KEPT.has(b)?'KEPT     ':'withdrawn'} tags=${tags}  single-quoted attrs: ${rows.reduce((a,[,n])=>a+n,0)}`);
  for(const [k,n] of rows.slice(0,10)) console.log(`      ${k} = ${n}`);
}
