// §C140 ⑥b — browser length census of composed figure SVGs (inline DOM). 0 ISK.
//   node kern_census.mjs <jobs.json> <scales comma-list> <out.json>
// jobs.json: [{fig, svg, n}]. Each SVG is inlined into a Playwright Chromium page — as
// evidence/2026-09-15-t23-review-fixes/instruments/census/cb.mjs does, with NO extra page CSS (the SVG's own
// <g text-rendering="geometricPrecision"> is what a reader gets) — and for every <text>, at every scale
// (px per pt, applied as svg width/height = viewBox × s), getComputedTextLength (user units = pt).
// Also recorded per figure, so a length can never be read without knowing what font drew it:
//   fonts:    every FontFace in document.fonts as [family, weight, style, status] after document.fonts.ready
//   kerning:  getComputedStyle(text).fontKerning for every <text>, in order
// Throws if an SVG's <text> count != job.n. Failure-default exit code; last stdout line `KERN-CENSUS-DONE <n>`.
// Playwright is resolved as render-check.mjs resolves it.
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

process.exitCode = 1;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..', '..');
async function loadChromium() {
  for (const c of [path.join(REPO_ROOT, 'node_modules', 'playwright', 'index.mjs'),
                   path.join(REPO_ROOT, 'server', 'node_modules', 'playwright', 'index.mjs')]) {
    if (fs.existsSync(c)) return (await import(pathToFileURL(c).href)).chromium;
  }
  throw new Error('playwright not found under ' + REPO_ROOT);
}

const [jobsFile, scalesArg, outFile] = process.argv.slice(2);
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
const scales = scalesArg.split(',');
const chromium = await loadChromium();
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1600, height: 1200 } });
const out = {};
for (const j of jobs) {
  const svg = fs.readFileSync(j.svg, 'utf8').replace(/^<\?xml[^>]*>/, '');
  await pg.setContent(`<!doctype html><style>body{margin:0}</style>${svg}`, { timeout: 300000 });
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(150);
  const rec = { fonts: await pg.evaluate(() => [...document.fonts].map((f) => [f.family, f.weight, f.style, f.status])) };
  rec.kerning = await pg.evaluate(() => [...document.querySelectorAll('svg text')].map((t) => getComputedStyle(t).fontKerning));
  if (rec.kerning.length !== j.n) throw new Error(`count ${j.fig}: ${rec.kerning.length} != ${j.n}`);
  rec.len = {};
  for (const s of scales) {
    rec.len[s] = await pg.evaluate((s) => {
      const e = document.querySelector('svg');
      const vb = e.viewBox.baseVal;
      e.setAttribute('width', vb.width * s);
      e.setAttribute('height', vb.height * s);
      return [...e.querySelectorAll('text')].map((t) => t.getComputedTextLength());
    }, Number(s));
  }
  out[j.fig] = rec;
  console.log(`${j.fig} n=${j.n}`);
}
await b.close();
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(`KERN-CENSUS-DONE ${Object.keys(out).length}`);
process.exitCode = 0;
