import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Resolved against import.meta.url, never process.cwd() or a hardcoded path:
// CLAUDE.md § durable — a books/-relative path resolved against cwd silently points at
// the wrong tree, and this script must run from anywhere in a fresh clone.
const REPO = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const T=[['efnafraedi-2e','mt-preview','04'],['efnafraedi-2e','mt-preview','10'],
         ['efnafraedi-2e','mt-preview','17'],['lifraen-efnafraedi','mt-preview','03']];
// NON-GREEDY: a greedy /<p[^>]*>[\s\S]*<figure/ matches a figure emitted AFTER </p>
// and reports a false RED on correctly-fixed output (§C149 ①'s own instrument failure).
const FIG_IN_P=/<p\b(?:(?!<\/p>)[\s\S])*?<figure/g;
// A bare `<caption` count over rendered HTML is MEANINGLESS -- <table><caption> is VALID
// HTML that renderTable emits for every table label. Key it on a <figure> parent.
const RAW_CAP_IN_FIG=/<figure\b(?:(?!<\/figure>)[\s\S])*?<caption\b/g;
const PARA_IN_CELL=/<t[dh]\b[^>]*>(?:(?!<\/t[dh]>)[\s\S])*?<para\b/g;
const RAW_OPENER=/\[\[/g;
const n=(s,re)=>(s.match(re)||[]).length;
console.log('chapter                        html  figInP  rawCapInFig  paraInCell  raw[[');
const tot={f:0,c:0,p:0,m:0};
for(const [book,track,ch] of T){
  const d=path.join(REPO,'books',book,'05-publication',track,'chapters',ch);
  if(!existsSync(d)){console.log(`${book} ch${ch}: DIR MISSING`);continue;}
  const files=readdirSync(d).filter(f=>f.endsWith('.html'));
  let f=0,c=0,p=0,m=0;
  for(const fn of files){const s=readFileSync(path.join(d,fn),'utf8');
    f+=n(s,FIG_IN_P); c+=n(s,RAW_CAP_IN_FIG); p+=n(s,PARA_IN_CELL); m+=n(s,RAW_OPENER);}
  tot.f+=f;tot.c+=c;tot.p+=p;tot.m+=m;
  console.log(`${(book+' ch'+ch).padEnd(30)} ${String(files.length).padStart(4)} ${String(f).padStart(7)} ${String(c).padStart(12)} ${String(p).padStart(11)} ${String(m).padStart(6)}`);
}
console.log(`${'TOTAL'.padEnd(30)} ${''.padStart(4)} ${String(tot.f).padStart(7)} ${String(tot.c).padStart(12)} ${String(tot.p).padStart(11)} ${String(tot.m).padStart(6)}`);
