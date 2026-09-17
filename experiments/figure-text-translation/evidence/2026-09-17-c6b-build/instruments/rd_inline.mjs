// §C140 ⑥b R-d — inline-DOM half of rd_form_probe.py: for each planted variant V0..V4, the SVG is
// inlined into a Playwright Chromium page (as evidence/2026-09-15-t23-review-fixes/instruments/census/cb.mjs
// does) and every <text id="L*"> is measured with getComputedTextLength (user units = pt).
//   node rd_inline.mjs <scratch>     -> <scratch>/rd_inline.json ; last stdout line `RD-INLINE-DONE`
// Playwright is resolved the way render-check.mjs resolves it (repo root, then server/node_modules).
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..', '..');
async function loadChromium() {
  for (const c of [path.join(REPO_ROOT, 'node_modules', 'playwright', 'index.mjs'),
                   path.join(REPO_ROOT, 'server', 'node_modules', 'playwright', 'index.mjs')]) {
    if (fs.existsSync(c)) return (await import(pathToFileURL(c).href)).chromium;
  }
  throw new Error('playwright not found under ' + REPO_ROOT);
}

process.exitCode = 1; // failure default: overwritten only when a result is written
const out = process.argv[2];
const chromium = await loadChromium();
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1400, height: 700 } });
const res = {};
for (const v of ['V0', 'V1', 'V2', 'V3', 'V4']) {
  const svg = fs.readFileSync(path.join(out, `${v}.svg`), 'utf8').replace(/^<\?xml[^>]*>/, '');
  await pg.setContent(`<!doctype html><style>body{margin:0}</style>${svg}`);
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(200);
  res[v] = await pg.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll('text')].map((t) => [t.id, t.getComputedTextLength()]))
  );
}
await b.close();
fs.writeFileSync(path.join(out, 'rd_inline.json'), JSON.stringify(res, null, 1));
console.log(JSON.stringify(res));
console.log('RD-INLINE-DONE');
process.exitCode = 0;
