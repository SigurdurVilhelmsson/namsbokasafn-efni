/**
 * Scratch variant of render-check2.mjs (same <img> host page = the reader's path),
 * with separate, bounded budgets for (1) the <img> load and (2) the screenshot (paint),
 * and timings for each. Never give a repo path as dst (writes <dst>.host.html).
 *   node render-exo.mjs <src> <dst.png> <w> <h> <budgetMs>
 * Prints one JSON line: {src, loadMs|null, complete, naturalW, shotMs|null, error}
 */
import { chromium } from '/home/siggi/dev/repos/namsbokasafn-efni/server/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
const [src, dst, W, H, B] = process.argv.slice(2);
const w = Number(W), h = Number(H), budget = Number(B || 60000);
if (path.resolve(dst).startsWith('/home/siggi/dev/repos/')) { console.error('refusing repo dst'); process.exit(2); }
const host = path.resolve(dst).replace(/\.png$/, '.host.html');
fs.writeFileSync(host, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}
img{display:block;width:${w}px;height:${h}px}</style><img id="i" src="${pathToFileURL(path.resolve(src)).href}">`);
const out = { src: path.basename(src), bytes: fs.statSync(src).size, loadMs: null, complete: false, naturalW: 0, shotMs: null, error: null };
const t0 = Date.now();
const b = await chromium.launch();
try {
  const pg = await b.newPage({ viewport: { width: w, height: Math.ceil(h) }, deviceScaleFactor: Number(process.env.DSF || 1) });
  const tNav = Date.now();
  await pg.goto(pathToFileURL(host).href, { waitUntil: 'commit', timeout: budget });
  try {
    await pg.waitForFunction(() => { const i = document.getElementById('i'); return i && i.complete; }, null, { timeout: budget, polling: 100 });
    out.loadMs = Date.now() - tNav;
    const r = await pg.evaluate(() => { const i = document.getElementById('i'); return { c: i.complete, nw: i.naturalWidth }; });
    out.complete = r.c; out.naturalW = r.nw;
  } catch (e) { out.error = 'load: ' + e.message.split('\n')[0]; }
  if (out.loadMs !== null) {
    const tS = Date.now();
    try {
      await pg.waitForTimeout(500);
      await pg.screenshot({ path: path.resolve(dst), clip: { x: 0, y: 0, width: w, height: Math.ceil(h) }, timeout: Math.max(1000, budget - (Date.now() - t0)) });
      out.shotMs = Date.now() - tS;
    } catch (e) { out.error = 'shot: ' + e.message.split('\n')[0]; }
  }
} catch (e) { out.error = (out.error ? out.error + ' | ' : '') + e.message.split('\n')[0]; }
out.totalMs = Date.now() - t0;
console.log(JSON.stringify(out));
await Promise.race([b.close(), new Promise(r => setTimeout(r, 5000))]);
process.exitCode = 0;
