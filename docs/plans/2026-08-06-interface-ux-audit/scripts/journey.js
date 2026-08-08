/**
 * Phase 2 — Journey B: "I have 45 minutes." Login → first saved edit, as an
 * ordinary editor (a teacher), counting every decision the UI demands.
 *
 * Nothing is assumed about what the teacher already knows: at each step we
 * record the choices actually presented, so the cost of the journey is
 * measured rather than estimated.
 */
const path = require('path');
const fs = require('fs');
const SERVER = '/home/user/namsbokasafn-efni/server';
const { chromium } = require(path.join(SERVER, 'node_modules/playwright-core'));
const jwt = require(path.join(SERVER, 'node_modules/jsonwebtoken'));

const SP = __dirname;
const BASE = 'http://localhost:3789';
const OUT = path.join(SP, 'journey');

const token = jwt.sign(
  { sub: 99997, username: 'test-editor', name: 'Test Editor', avatar: '', role: 'editor', books: [] },
  'test-secret-for-e2e-not-production',
  { issuer: 'namsbokasafn-pipeline', expiresIn: '2h' }
);

const steps = [];
let stepNo = 0;
async function step(page, label, note) {
  stepNo++;
  const file = `${String(stepNo).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-')}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  steps.push({ n: stepNo, label, note });
  console.log(`  ${String(stepNo).padStart(2)}. ${label}${note ? ' — ' + note : ''}`);
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-proxy-server', '--disable-background-networking', '--no-first-run'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([
    { name: 'auth_token', value: token, domain: 'localhost', path: '/', httpOnly: true },
  ]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));

  const settle = async () => {
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(400);
  };

  console.log('JOURNEY B — login → first saved edit (role: editor)\n');

  // 1. Land on home.
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await settle();
  const homeActions = await page.evaluate(() =>
    [...document.querySelectorAll('.page-main a, .page-main button')]
      .filter((e) => e.getClientRects().length)
      .map((e) => (e.textContent || '').trim())
      .filter(Boolean)
  );
  await step(page, 'home', `actionable elements in page body: ${JSON.stringify(homeActions)}`);

  // 2. The only work-shaped nav item.
  await page.goto(BASE + '/editor', { waitUntil: 'domcontentloaded' });
  await settle();
  const books = await page.evaluate(() =>
    [...document.querySelectorAll('#book-select option')].map((o) => o.textContent.trim())
  );
  await step(page, 'editor-empty', `book choices: ${books.length} → ${JSON.stringify(books)}`);

  // 3. Choose a book — the teacher must already know which one is theirs.
  await page.selectOption('#book-select', { label: 'Efnafræði 2e' }).catch(async () => {
    const v = await page.evaluate(() => {
      const o = [...document.querySelectorAll('#book-select option')].find((x) =>
        /Efnafr/.test(x.textContent)
      );
      return o && o.value;
    });
    if (v) await page.selectOption('#book-select', v);
  });
  await settle();
  const chapters = await page.evaluate(() =>
    [...document.querySelectorAll('#chapter-select option')].map((o) => o.textContent.trim())
  );
  await step(page, 'book-chosen', `chapter choices: ${chapters.length}`);

  // 4. Choose a chapter.
  const chVal = await page.evaluate(() => {
    const o = [...document.querySelectorAll('#chapter-select option')].filter((x) => x.value)[0];
    return o && o.value;
  });
  if (chVal) await page.selectOption('#chapter-select', chVal);
  await settle();
  const mods = await page.evaluate(() =>
    [...document.querySelectorAll('select')]
      .filter((s) => s.getClientRects().length) // visible only — #role-preview-select is hidden
      .map((s) => ({
        id: s.id,
        n: s.options.length,
        opts: [...s.options].slice(0, 4).map((o) => o.textContent.trim()),
      }))
  );
  await step(page, 'chapter-chosen', `selects now on page: ${JSON.stringify(mods)}`);

  // 5. Choose a module/section if a third selector appeared.
  const modSel = mods.find((s) => s.id && !['book-select', 'chapter-select'].includes(s.id) && s.n > 1);
  if (modSel) {
    const v = await page.evaluate((id) => {
      const o = [...document.querySelectorAll(`#${id} option`)].filter((x) => x.value)[0];
      return o && o.value;
    }, modSel.id);
    if (v) await page.selectOption(`#${modSel.id}`, v);
    await settle();
    await step(page, 'module-chosen', `via #${modSel.id}`);
  }

  // 6. What does the teacher now see? Count editable segments.
  const editor = await page.evaluate(() => {
    const areas = [...document.querySelectorAll('textarea')].filter((e) => e.getClientRects().length);
    const body = document.querySelector('.page-main');
    return {
      textareas: areas.length,
      firstValue: areas[0] ? areas[0].value.slice(0, 120) : null,
      visibleChars: body ? body.innerText.replace(/\s+/g, ' ').trim().length : 0,
      buttons: [
        ...new Set(
          [...document.querySelectorAll('button')]
            .filter((e) => e.getClientRects().length)
            .map((e) => e.textContent.trim())
            .filter(Boolean)
        ),
      ],
    };
  });
  await step(page, 'segments-loaded', JSON.stringify(editor).slice(0, 400));

  fs.writeFileSync(
    path.join(OUT, 'journey.json'),
    JSON.stringify({ steps, editor, errors: [...new Set(errors)] }, null, 2)
  );
  console.log('\nconsole errors:', [...new Set(errors)].filter((e) => !/CERT/.test(e)));
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
