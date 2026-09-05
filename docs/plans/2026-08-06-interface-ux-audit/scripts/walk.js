/**
 * Phase 1 — role-by-role walk of the editorial UI.
 *
 * For every (role, path) pair: navigate, wait for the layout shell + auth
 * fetch to settle, then record what a user of that role can actually SEE —
 * sidebar links, headings, visible buttons, empty-state text — plus any
 * console/page/network errors, and a full-page screenshot.
 *
 * Output: shots/<role>/<slug>.png  +  walk-results.json
 */
const path = require('path');
const fs = require('fs');

const SERVER = '/home/user/namsbokasafn-efni/server';
const { chromium } = require(path.join(SERVER, 'node_modules/playwright-core'));
const jwt = require(path.join(SERVER, 'node_modules/jsonwebtoken'));

const SP = __dirname;
const BASE = 'http://localhost:3789';
const SHOTS = path.join(SP, 'shots');

const JWT_SECRET = 'test-secret-for-e2e-not-production';
const JWT_ISSUER = 'namsbokasafn-pipeline';

// Mirrors server/e2e/helpers/auth.js. 'new-editor' is the cold-start actor:
// a real editor row with zero assignments, zero activity, zero drafts.
const ROLES = [
  { key: 'anon', role: null },
  { key: 'viewer', role: 'viewer', id: 99995 },
  { key: 'editor', role: 'editor', id: 99997 },
  { key: 'new-editor', role: 'editor', id: 99990, name: 'Nýr Kennari' },
  { key: 'head-editor', role: 'head-editor', id: 99998 },
  { key: 'admin', role: 'admin', id: 99999 },
];

// Every page route in server/routes/views.js that serves HTML.
const PRIMARY = [
  '/',
  '/login',
  '/editor',
  '/editor?view=reviews',
  '/progress',
  '/terminology',
  '/localization',
  '/library',
  '/admin',
  '/assignments',
  '/profile',
  '/feedback',
  '/this-page-does-not-exist',
];

// Legacy redirects — target only, no screenshot.
const REDIRECTS = [
  '/my-work',
  '/segment-editor',
  '/status',
  '/reviews',
  '/review-queue',
  '/localization-editor',
  '/localization-review',
  '/books',
  '/books/efnafraedi',
  '/books/efnafraedi-2e',
  '/chapter',
  '/images',
  '/admin/users',
  '/admin/books',
  '/admin/feedback',
  '/analytics',
  '/workflow',
  '/dashboard',
  '/pipeline',
  '/issues',
  '/for-teachers',
];

function tokenFor(spec) {
  return jwt.sign(
    {
      sub: spec.id,
      username: `test-${spec.role}`,
      name: spec.name || `Test ${spec.role}`,
      avatar: '',
      role: spec.role,
      books: spec.role === 'head-editor' ? ['efnafraedi-2e', '__e2e-fixture__'] : [],
    },
    JWT_SECRET,
    { issuer: JWT_ISSUER, expiresIn: '2h' }
  );
}

const slugify = (p) => (p === '/' ? 'home' : p.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''));

async function main() {
  fs.rmSync(SHOTS, { recursive: true, force: true });
  // --no-proxy-server is essential: this container exports HTTP(S)_PROXY, and
  // Chromium otherwise routes even http://localhost through the agent proxy,
  // turning a 5ms request into a ~14s stall (measured). The browser only ever
  // talks to the local audit server.
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-proxy-server', '--disable-background-networking', '--no-first-run'],
  });
  const results = [];

  for (const spec of ROLES) {
    const dir = path.join(SHOTS, spec.key);
    fs.mkdirSync(dir, { recursive: true });

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    if (spec.role) {
      await context.addCookies([
        {
          name: 'auth_token',
          value: tokenFor(spec),
          domain: 'localhost',
          path: '/',
          httpOnly: true,
        },
      ]);
    }

    for (const route of PRIMARY) {
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      const badResponses = [];
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
      });
      page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
      page.on('response', (r) => {
        if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().replace(BASE, '')}`);
      });

      const rec = { role: spec.key, route };
      try {
        const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 });
        rec.httpStatus = resp ? resp.status() : null;
        // Let layout.js inject the shell and /api/auth/me settle.
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(400);

        rec.finalUrl = page.url().replace(BASE, '') || '/';
        rec.redirected = rec.finalUrl.split('?')[0] !== route.split('?')[0];
        rec.title = await page.title();

        // One synchronous DOM pass. Playwright locators default to a 30s
        // timeout when an element is absent (e.g. #topbar-title on /login),
        // which stalls the whole walk; evaluate() just returns null instead.
        const dom = await page.evaluate(() => {
          const vis = (e) => !!(e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
          const texts = (sel, n) =>
            [...new Set([...document.querySelectorAll(sel)].filter(vis).map((e) => (e.textContent || '').trim()).filter(Boolean))].slice(0, n);
          const main = document.querySelector('.page-main') || document.querySelector('main') || document.body;
          const mainText = (main.innerText || '').replace(/\s+/g, ' ').trim();
          const t = document.querySelector('#topbar-title');
          return {
            topbarTitle: t ? t.textContent.trim() : null,
            navLinks: [...document.querySelectorAll('.sidebar .nav-link')]
              .filter(vis)
              .map((e) => `${e.textContent.trim()} → ${e.getAttribute('href')}`),
            navSections: texts('.sidebar-section-label', 10),
            headings: texts('h1, h2', 12),
            buttons: texts('button, .btn', 25),
            // title= is a hover-only affordance — invisible on touch devices.
            tooltips: [
              ...new Set(
                [...document.querySelectorAll('[title]')]
                  .filter(vis)
                  .map((e) => `${(e.textContent || '').trim().slice(0, 30)}|${e.getAttribute('title')}`)
              ),
            ].slice(0, 20),
            selects: [...document.querySelectorAll('select')].filter(vis).map((e) => e.id || e.name || '?'),
            visibleTextLen: mainText.length,
            textSample: mainText.slice(0, 400),
          };
        });
        Object.assign(rec, dom);

        await page.screenshot({ path: path.join(dir, slugify(route) + '.png'), fullPage: true });
      } catch (err) {
        rec.error = String(err).slice(0, 300);
      }
      rec.consoleErrors = [...new Set(consoleErrors)];
      rec.pageErrors = [...new Set(pageErrors)];
      rec.badResponses = [...new Set(badResponses)];
      results.push(rec);
      await page.close();
      process.stdout.write(
        `${spec.key.padEnd(12)} ${route.padEnd(28)} ${rec.finalUrl || rec.error || '?'}\n`
      );
    }

    // Redirect map — only needs checking once per auth state (anon vs authed),
    // but it is cheap and role-dependent gates could differ.
    if (spec.key === 'anon' || spec.key === 'editor' || spec.key === 'admin') {
      for (const route of REDIRECTS) {
        const page = await context.newPage();
        const rec = { role: spec.key, route, kind: 'redirect' };
        try {
          const resp = await page.goto(BASE + route, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          });
          rec.httpStatus = resp ? resp.status() : null;
          rec.finalUrl = page.url().replace(BASE, '') || '/';
        } catch (err) {
          rec.error = String(err).slice(0, 200);
        }
        results.push(rec);
        await page.close();
      }
    }

    await context.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(SP, 'walk-results.json'), JSON.stringify(results, null, 2));
  console.log('\nWROTE walk-results.json —', results.length, 'records');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
