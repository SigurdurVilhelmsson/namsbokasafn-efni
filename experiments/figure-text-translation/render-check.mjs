/**
 * Rasterise a figure in a REAL browser, inside <img>, and screenshot it.
 *
 * `<img src=...>` is how cnxml-render publishes every figure, and it is the
 * strictest case: an SVG loaded that way is sandboxed and cannot fetch a
 * stylesheet or a webfont. Rendering the file any other way — a viewer, an
 * inline <svg>, a converter — tests something no reader will ever do.
 *
 *   node render-check.mjs <file.svg|png|jpg> <out.png> [w] [h]
 */
import { chromium } from '/home/siggi/dev/repos/namsbokasafn-efni/server/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const [src, dst, W = '1300', H = '766', DSF = '1'] = process.argv.slice(2);
if (!src || !dst) { console.error('usage: render-check.mjs <src> <out.png> [w] [h]'); process.exit(2); }
const w = Number(W), h = Number(H);
const srcUrl = pathToFileURL(path.resolve(src)).href;

const host = path.resolve(dst).replace(/\.png$/, '.host.html');
fs.writeFileSync(host, `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fff}
img{display:block;width:${w}px;height:${h}px}</style>
<img src="${srcUrl}">`);

const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: Number(DSF) });
await pg.goto(pathToFileURL(host).href);
await pg.waitForTimeout(500);              // let the embedded font decode
await pg.screenshot({ path: path.resolve(dst), clip: { x: 0, y: 0, width: w, height: h } });
await b.close();
console.log(`  rendered ${path.basename(src)} -> ${path.basename(dst)}`);
