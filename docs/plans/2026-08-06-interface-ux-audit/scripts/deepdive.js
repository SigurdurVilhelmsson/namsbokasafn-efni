/**
 * Second audit pass — the editing surface itself, plus mobile and accessibility.
 *
 * Phase 1 stopped at the module list. This opens a real module as an ordinary
 * editor and audits what a teacher actually spends their 45 minutes inside:
 * the segment editor, its controls, and the save path. Then re-checks key
 * pages at phone width, and runs axe-core for measured a11y findings.
 */
const path = require('path');
const fs = require('fs');
const SERVER = '/home/user/namsbokasafn-efni/server';
const { chromium } = require(path.join(SERVER, 'node_modules/playwright-core'));
const jwt = require(path.join(SERVER, 'node_modules/jsonwebtoken'));
const AXE = fs.readFileSync(path.join(__dirname, 'node_modules/axe-core/axe.min.js'), 'utf8');

const SP = __dirname;
const BASE = 'http://localhost:3789';
const OUT = path.join(SP, 'deep');
const results = { editor: {}, mobile: [], axe: [] };

const token = (role, id) =>
  jwt.sign(
    { sub: id, username: `test-${role}`, name: `Test ${role}`, avatar: '', role, books: [] },
    'test-secret-for-e2e-not-production',
    { issuer: 'namsbokasafn-pipeline', expiresIn: '2h' }
  );

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function axeScan(page, label) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, {
      resultTypes: ['violations'],
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return res.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      n: v.nodes.length,
      help: v.help,
      sample: v.nodes[0] && v.nodes[0].html.slice(0, 110),
    }));
  });
  results.axe.push({ page: label, violations: r });
  console.log(`  axe ${label}: ${r.length} violation types, ${r.reduce((a, v) => a + v.n, 0)} nodes`);
  return r;
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-proxy-server', '--disable-background-networking', '--no-first-run'],
  });

  // ── A. The editing surface, desktop, as an ordinary editor ──────────
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([
    { name: 'auth_token', value: token('editor', 99997), domain: 'localhost', path: '/', httpOnly: true },
  ]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 200)));

  // Deep-link straight to a module that has a faithful translation (m68664 = 1.1).
  await page.goto(BASE + '/editor?book=efnafraedi-2e&chapter=1&module=m68664', {
    waitUntil: 'domcontentloaded',
  });
  await settle(page);
  await page.screenshot({ path: path.join(OUT, 'A1-deeplink.png'), fullPage: true });

  // If the deep link didn't open the module, drive the UI instead.
  let opened = await page.evaluate(() => document.querySelectorAll('textarea').length > 0);
  if (!opened) {
    await page.selectOption('#book-select', { label: 'Efnafræði 2e' }).catch(() => {});
    await settle(page);
    await page.selectOption('#chapter-select', { index: 1 }).catch(() => {});
    await settle(page);
    const clicked = await page.evaluate(() => {
      const row = [...document.querySelectorAll('*')].find(
        (e) => /Chemistry in Context/.test(e.textContent || '') && e.children.length < 6
      );
      if (row) {
        const btn = row.querySelector('button, a') || row;
        btn.click();
        return true;
      }
      return false;
    });
    await settle(page);
    await page.waitForTimeout(1200);
    opened = await page.evaluate(() => document.querySelectorAll('textarea').length > 0);
    console.log('  drove UI to module, clicked:', clicked, '| textareas:', opened);
  }
  await page.screenshot({ path: path.join(OUT, 'A2-module-open.png'), fullPage: true });

  results.editor = await page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const areas = [...document.querySelectorAll('textarea')].filter(vis);
    const btns = [...document.querySelectorAll('button')].filter(vis);
    return {
      textareas: areas.length,
      firstSegment: areas[0] ? areas[0].value.slice(0, 200) : null,
      buttons: [...new Set(btns.map((b) => b.textContent.trim()).filter(Boolean))],
      iconOnlyButtons: btns.filter((b) => !b.textContent.trim()).length,
      tooltips: [
        ...new Set(
          [...document.querySelectorAll('[title]')].filter(vis).map((e) => e.getAttribute('title'))
        ),
      ],
      labels: [...new Set([...document.querySelectorAll('label')].filter(vis).map((l) => l.textContent.trim()))].slice(0, 20),
      headings: [...document.querySelectorAll('h1,h2,h3')].filter(vis).map((h) => h.textContent.trim()).slice(0, 15),
      legendPresent: /vélþýðing|frumtext|enska/i.test(document.body.innerText),
      visibleChars: document.querySelector('.page-main')?.innerText.replace(/\s+/g, ' ').trim().length,
    };
  });
  console.log('\nEDITING SURFACE:', JSON.stringify(results.editor, null, 1).slice(0, 1200));

  await axeScan(page, 'editor (module open)');
  await page.close();

  // ── B. Accessibility on the pages a teacher lives in ────────────────
  for (const route of ['/', '/terminology', '/progress']) {
    const p = await ctx.newPage();
    await p.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await settle(p);
    await axeScan(p, route);
    await p.close();
  }
  await ctx.close();

  // ── C. Phone width — an iPhone-ish viewport ─────────────────────────
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await mctx.addCookies([
    { name: 'auth_token', value: token('editor', 99997), domain: 'localhost', path: '/', httpOnly: true },
  ]);
  for (const route of ['/', '/editor', '/terminology']) {
    const p = await mctx.newPage();
    await p.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await settle(p);
    const m = await p.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      sidebarVisible: !!document.querySelector('.sidebar')?.getClientRects().length,
      hamburgerVisible: !!document.getElementById('hamburger-btn')?.getClientRects().length,
      // hover-only affordances are unreachable on touch
      titleOnlyElements: [...document.querySelectorAll('[title]')].filter((e) => e.getClientRects().length).length,
    }));
    results.mobile.push({ route, ...m });
    console.log(`  mobile ${route}:`, JSON.stringify(m));
    await p.screenshot({ path: path.join(OUT, 'C-mobile' + route.replace(/\W+/g, '-') + '.png'), fullPage: true });
    await p.close();
  }
  await mctx.close();

  results.consoleErrors = [...new Set(errs)].filter((e) => !/CERT/.test(e));
  fs.writeFileSync(path.join(OUT, 'deep.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log('\nDONE');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
