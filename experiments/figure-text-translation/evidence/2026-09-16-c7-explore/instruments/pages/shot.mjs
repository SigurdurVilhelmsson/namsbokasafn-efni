import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
const pw = await import(pathToFileURL('/home/siggi/dev/repos/namsbokasafn-efni/server/node_modules/playwright/index.mjs').href);
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 650, height: 841 } });
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const src = args[i], out = args[i+1];
  const html = out.replace(/\.png$/, '.html');
  fs.writeFileSync(html, `<html><body style="margin:0;background:#fff"><img src="${pathToFileURL(src).href}" style="width:650px;display:block"></body></html>`);
  await p.goto(pathToFileURL(html).href);
  await p.waitForTimeout(800);
  const dims = await p.evaluate(() => { const i = document.images[0]; return [i.complete, i.naturalWidth, i.naturalHeight]; });
  console.log(src, dims);
  await p.screenshot({ path: out, fullPage: true });
}
await b.close();
