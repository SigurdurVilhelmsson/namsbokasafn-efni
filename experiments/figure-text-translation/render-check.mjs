/**
 * Rasterise a figure in a REAL browser, inside <img>, and screenshot it.
 *
 * `<img src=...>` is how cnxml-render publishes every figure, and it is the
 * strictest case: an SVG loaded that way is sandboxed and cannot fetch a
 * stylesheet or a webfont. Rendering the file any other way — a viewer, an
 * inline <svg>, a converter — tests something no reader will ever do.
 *
 *   node render-check.mjs <file.svg|png|jpg> <out.png> [w] [h] [dsf]
 *
 * ⚠️ This is on the DRIVER path since §C140 ⑩ (ruling Q2): `figure-run.js` renders a
 * figure's artwork twice to decide whether a soft-mask ring is visible. It therefore has
 * to run somewhere other than one developer's laptop, which is what the three changes
 * below are about.
 */
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(HERE, '..', '..');

/**
 * 🔴 RESOLVE PLAYWRIGHT, NEVER HARD-CODE IT. This import used to be the absolute string
 * `/home/siggi/dev/repos/namsbokasafn-efni/server/node_modules/playwright/index.mjs`, so the
 * tool ran on exactly one machine and died with ERR_MODULE_NOT_FOUND everywhere else —
 * including CI and a fresh clone. Harmless while nothing but a human ran it; not harmless
 * now that the driver does.
 *
 * ⚠️ Node resolves from the FILE's location, so a bare `import 'playwright'` finds the ROOT
 * `node_modules` and never `server/node_modules` — which is where this project actually
 * installs it. Both are tried, in that order, and the error names both.
 */
async function loadChromium() {
  const candidates = [
    path.join(REPO_ROOT, 'node_modules', 'playwright', 'index.mjs'),
    path.join(REPO_ROOT, 'server', 'node_modules', 'playwright', 'index.mjs'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return (await import(pathToFileURL(c).href)).chromium;
  }
  try {
    return (await import('playwright')).chromium;
  } catch {
    throw new Error(
      `playwright is not installed. Looked for:\n  ${candidates.join('\n  ')}\n` +
        `and on the module path. Install it in server/ (npm ci in server/), or set ` +
        `PLAYWRIGHT_CHROMIUM_EXECUTABLE if a browser is provisioned outside playwright.`
    );
  }
}

const [src, dst, W = '1300', H = '766', DSF = '1'] = process.argv.slice(2);
if (!src || !dst) {
  console.error('usage: render-check.mjs <src> <out.png> [w] [h] [dsf]');
  process.exitCode = 2;
} else {
  const w = Number(W);
  const h = Number(H);
  const srcUrl = pathToFileURL(path.resolve(src)).href;

  const host = path.resolve(dst).replace(/\.png$/, '.host.html');
  // ⚠️ The <img> keeps the FRACTIONAL height while the viewport is ceil()ed. A viewport must
  // be an integer, but rounding the IMAGE too rescales it: 484 against a 483.33 natural height
  // is a 0.14 % vertical stretch, which walks a measurement keyed on the SVG's own user units
  // off its target by half a pixel near the bottom of the page.
  fs.writeFileSync(
    host,
    `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fff}
img{display:block;width:${w}px;height:${h}px}</style>
<img src="${srcUrl}">`
  );

  const chromium = await loadChromium();
  const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const b = await chromium.launch(exe ? { executablePath: exe } : {});
  const pg = await b.newPage({
    viewport: { width: Math.ceil(w), height: Math.ceil(h) },
    deviceScaleFactor: Number(DSF),
  });
  // A composed figure can be tens of MB with thousands of masks; the default 30 s is not a
  // useful deadline for one. Measured: the 24.9 MB exocytosis artwork loads in ~2 s once
  // §C140 ⑫'s blend collapse is applied and never at all without it, so a generous timeout
  // distinguishes "slow" from "never" instead of turning both into the same failure.
  await pg.goto(pathToFileURL(host).href, { timeout: 300000 });
  await pg.waitForTimeout(500); // let the embedded font decode
  await pg.screenshot({
    path: path.resolve(dst),
    clip: { x: 0, y: 0, width: Math.ceil(w), height: Math.ceil(h) },
    timeout: 300000,
  });
  await b.close();
  console.log(`  rendered ${path.basename(src)} -> ${path.basename(dst)}`);
}
