// Browser text-length census (copy of /home/siggi/dev/scratch-c140/fix2/integrated/census/cb2.mjs; only this header added).
//   node cb.mjs <scales comma-list> <default|gp> <out.json> <jobs.json>
// jobs.json: [{fig, svg, n}] — each SVG is inlined in a Playwright Chromium page; for every <text> at every scale
// (px per pt, applied as svg width/height = viewBox * s) it records [length, length without trailing space,
// length without leading space] via getComputedTextLength. Mode gp adds `text{text-rendering:geometricPrecision}`.
// Throws if an SVG's <text> count != job.n. Last stdout line: `done <N> DONE-MARKER`. Driven by census.py.
import { chromium } from '/home/siggi/dev/repos/namsbokasafn-efni/server/node_modules/playwright/index.mjs';
import fs from 'fs';
const jobs=JSON.parse(fs.readFileSync(process.argv[5],'utf8'));
const scales=process.argv[2].split(',').map(Number); const mode=process.argv[3]||'default'; const outf=process.argv[4];
const b=await chromium.launch(); const out={};
const pg=await b.newPage({viewport:{width:1600,height:1200}});
for (const j of jobs){
  let svg=fs.readFileSync(j.svg,'utf8').replace(/^<\?xml[^>]*>/,'');
  const css= mode==='gp'?'text{text-rendering:geometricPrecision}':'';
  await pg.setContent(`<!doctype html><style>body{margin:0}${css}</style>${svg}`);
  await pg.evaluate(()=>document.fonts.ready); await pg.waitForTimeout(150);
  out[j.fig]={};
  for (const s of scales){
    const r=await pg.evaluate(s=>{const e=document.querySelector('svg');const vb=e.viewBox.baseVal;e.setAttribute('width',vb.width*s);e.setAttribute('height',vb.height*s);
      const T=[...e.querySelectorAll('text')];
      const meas=(t,str)=>{t.textContent=str;return str.length?t.getComputedTextLength():0};
      return T.map(t=>{const o=t.textContent;const L=meas(t,o),R=meas(t,o.replace(/\s+$/,'')),Lf=meas(t,o.replace(/^\s+/,''));t.textContent=o;return [L,R,Lf]});},s);
    if (r.length!==j.n) throw new Error('count '+j.fig);
    out[j.fig][s]=r;
  }
}
await b.close(); fs.writeFileSync(outf,JSON.stringify(out)); console.log('done',Object.keys(out).length, 'DONE-MARKER');
