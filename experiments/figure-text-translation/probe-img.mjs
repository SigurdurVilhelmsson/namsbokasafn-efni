// Does an SVG published via <img> keep selectable/searchable text?
// And does the embedded @font-face do the work, or a system fallback?
import { chromium } from '/home/siggi/dev/repos/namsbokasafn-efni/server/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
const svg = pathToFileURL(path.resolve('out/control.svg')).href;
const host = path.resolve('out/probe.html');
fs.writeFileSync(host, `<!doctype html><meta charset="utf-8">
<img id="asimg" src="${svg}" width="1300" height="766">
<div id="inline"></div>`);
const b = await chromium.launch();
const pg = await b.newPage({ viewport:{width:1300,height:900} });
await pg.goto(pathToFileURL(host).href);
await pg.waitForTimeout(400);
const r = await pg.evaluate(() => {
  const img = document.getElementById('asimg');
  return {
    imgTextInDom: document.body.innerText.trim().length,
    imgHasShadowText: !!(img.contentDocument),   // null for <img>
    bodyTextSample: document.body.innerText.trim().slice(0,60),
  };
});
console.log('  <img> case:');
console.log(`    text present in the page DOM        : ${r.imgTextInDom} chars`);
console.log(`    can script reach the SVG's document : ${r.imgHasShadowText}`);
console.log(`    -> text selectable / Ctrl-F findable: ${r.imgTextInDom>0 ? 'YES':'NO'}`);
await b.close();
