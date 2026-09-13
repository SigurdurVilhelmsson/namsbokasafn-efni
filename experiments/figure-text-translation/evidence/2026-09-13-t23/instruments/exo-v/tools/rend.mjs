// exo-v verifier render harness (own code). <img> host page = reader path.
// node rend.mjs <src> <dst.png> <cssW> <cssH> <budgetMs>   env DSF
import { chromium } from '/home/siggi/dev/repos/namsbokasafn-efni/server/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
process.exitCode = 9; // failure default
const [src, dst, W, H, B] = process.argv.slice(2);
const dstAbs = path.resolve(dst);
if (!dstAbs.startsWith('/home/siggi/dev/scratch-c140/exo-v/')) { console.error('dst must be under exo-v'); process.exit(2); }
const w = Number(W), h = Number(H), budget = Number(B || 60000), dsf = Number(process.env.DSF || 1);
const host = dstAbs.replace(/\.png$/, '.host.html');
fs.writeFileSync(host, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}img{display:block;width:${w}px;height:${h}px}</style><img id="im" src="${pathToFileURL(path.resolve(src)).href}">`);
const res = { src: path.basename(src), bytes: fs.statSync(src).size, dsf, loadMs: null, naturalW: null, shotMs: null, err: null };
const browser = await chromium.launch();
const t0 = Date.now();
try {
  const page = await browser.newPage({ viewport: { width: w, height: Math.ceil(h) }, deviceScaleFactor: dsf });
  await page.goto(pathToFileURL(host).href, { waitUntil: 'commit', timeout: budget });
  const tl = Date.now();
  try {
    await page.waitForFunction(() => { const e = document.getElementById('im'); return e && e.complete; }, null, { timeout: budget, polling: 200 });
    res.loadMs = Date.now() - tl;
    res.naturalW = await page.evaluate(() => document.getElementById('im').naturalWidth);
    const ts = Date.now();
    await page.screenshot({ path: dstAbs, clip: { x: 0, y: 0, width: w, height: Math.ceil(h) }, timeout: budget });
    res.shotMs = Date.now() - ts;
    process.exitCode = 0;
  } catch (e) { res.err = String(e.message).split('\n')[0]; process.exitCode = 1; }
} catch (e) { res.err = 'outer: ' + String(e.message).split('\n')[0]; process.exitCode = 1; }
res.totalMs = Date.now() - t0;
console.log(JSON.stringify(res));
await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
