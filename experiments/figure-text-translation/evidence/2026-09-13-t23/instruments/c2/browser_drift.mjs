// c2: measure, in Chromium, how far each drawn <text> segment's BROWSER advance differs from
// the x-offset the composer gave the NEXT segment on the same line.
//   node browser_drift.mjs <out.json> <dir>...     (dir holds translated.svg + items-c2.json)
import { chromium } from '/home/siggi/dev/repos/namsbokasafn-efni/server/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const [outPath, ...dirs] = process.argv.slice(2);
const results = [];
const browser = await chromium.launch();
for (const dsf of [1.3333, 2.0, 2.7778, 4.0]) {   // CSS px per pt (the svg is scaled to this); DSF fixed at 1
  const page = await browser.newPage({ viewport: { width: 2400, height: 1600 }, deviceScaleFactor: 1 });
  for (const dir of dirs) {
    const svg = fs.readFileSync(path.join(dir, 'translated.svg'), 'utf8').replace(/^<\?xml[^>]*>/, '');
    const items = JSON.parse(fs.readFileSync(path.join(dir, 'items-c2.json'), 'utf8'));
    await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0">${svg}</body>`);
    await page.evaluate((k) => { const s = document.querySelector('svg'); const vb = s.viewBox.baseVal; s.style.width = (vb.width * k) + 'px'; s.style.height = (vb.height * k) + 'px'; }, dsf);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const els = await page.evaluate(() => [...document.querySelectorAll('svg text')].map((t) => ({
      text: t.textContent, x: +t.getAttribute('x'), y: +t.getAttribute('y'),
      size: +t.getAttribute('font-size'), len: t.getComputedTextLength(),
      family: getComputedStyle(t).fontFamily,
      fontsLoaded: [...document.fonts].filter((f) => f.status === 'loaded').length,
    })));
    if (els.length !== items.length) {
      results.push({ dir, dsf, error: `els ${els.length} != items ${items.length}` });
      continue;
    }
    els.forEach((e, i) => { if (e.text !== items[i].text) results.push({ dir, dsf, error: `text mismatch at ${i}` }); });
    for (let i = 0; i + 1 < items.length; i++) {
      const a = items[i], b = items[i + 1];
      if (!a.c2line || a.c2line !== b.c2line || Math.abs(a.rot) > 1e-6) continue;
      const composerAdv = b.x - a.x;          // where the composer put the NEXT segment
      results.push({
        dir: path.basename(path.dirname(dir)), dsf, kind: a.c2line.slice(0, 2), line: a.c2line,
        a: a.text, b: b.text, aSize: a.size, composerAdv: +composerAdv.toFixed(4),
        srcOrCairoAdv: a.c2adv, browserAdv: +els[i].len.toFixed(4),
        drift: +(els[i].len - composerAdv).toFixed(4), fontsLoaded: els[i].fontsLoaded,
      });
    }
  }
  await page.close();
}
await browser.close();
fs.writeFileSync(outPath, JSON.stringify(results, null, 1));
console.log(`pairs ${results.length}`);
