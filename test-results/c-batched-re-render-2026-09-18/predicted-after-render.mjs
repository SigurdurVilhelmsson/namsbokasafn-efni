import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '/home/siggi/dev/repos/namsbokasafn-efni/tools/cnxml-render.js';
const REPO='/home/siggi/dev/repos/namsbokasafn-efni';
const T=[['efnafraedi-2e','04',4],['efnafraedi-2e','10',10],['efnafraedi-2e','17',17],['lifraen-efnafraedi','03',3]];
const FIG_IN_P=/<p\b(?:(?!<\/p>)[\s\S])*?<figure/g;
const RAW_CAP_IN_FIG=/<figure\b(?:(?!<\/figure>)[\s\S])*?<caption\b/g;
const PARA_IN_CELL=/<t[dh]\b[^>]*>(?:(?!<\/t[dh]>)[\s\S])*?<para\b/g;
const RAW_OPENER=/\[\[/g;
const n=(s,re)=>(s.match(re)||[]).length;
console.log('PREDICTED post-re-render (rendering 03-translated with current main):');
console.log('chapter                        mods  figInP  rawCapInFig  paraInCell  raw[[');
const tot={f:0,c:0,p:0,m:0};
for(const [book,ch,chNum] of T){
  _loadBookConfigForTest(book);
  const d=path.join(REPO,'books',book,'03-translated','mt-preview','ch'+ch);
  if(!existsSync(d)){console.log(`${book} ch${ch}: MISSING`);continue;}
  const mods=readdirSync(d).filter(f=>f.endsWith('.cnxml'));
  let f=0,c=0,p=0,m=0,err=0;
  for(const fn of mods){
    const src=readFileSync(path.join(d,fn),'utf8');
    let html;
    try{ ({html}=renderCnxmlToHtml(src,{bookSlug:book,chapter:chNum,moduleId:fn.replace('.cnxml','')})); }
    catch(e){ err++; continue; }
    f+=n(html,FIG_IN_P); c+=n(html,RAW_CAP_IN_FIG); p+=n(html,PARA_IN_CELL); m+=n(html,RAW_OPENER);
  }
  tot.f+=f;tot.c+=c;tot.p+=p;tot.m+=m;
  console.log(`${(book+' ch'+ch).padEnd(30)} ${String(mods.length).padStart(4)} ${String(f).padStart(7)} ${String(c).padStart(12)} ${String(p).padStart(11)} ${String(m).padStart(6)}${err?'  ERRORS:'+err:''}`);
}
console.log(`${'TOTAL'.padEnd(30)} ${''.padStart(4)} ${String(tot.f).padStart(7)} ${String(tot.c).padStart(12)} ${String(tot.p).padStart(11)} ${String(tot.m).padStart(6)}`);
