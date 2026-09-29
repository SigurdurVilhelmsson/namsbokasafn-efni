const pw = require('/home/siggi/dev/repos/namsbokasafn-efni/server/node_modules/playwright');
const fs = require('fs'); const http = require('http'); const path = require('path');
const dir = process.argv[2];
const srv = http.createServer((q, r) => { const f = path.join(dir, q.url.slice(1)); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'content-type': f.endsWith('.svg') ? 'image/svg+xml' : 'text/html'}); r.end(fs.readFileSync(f)); });
srv.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  for (const v of ['withfont', 'nofont']) fs.writeFileSync(path.join(dir, v + '.html'), `<!doctype html><style>body{margin:0}</style><img src="${v}.svg" style="display:block;width:420px;height:80px">`);
  for (const e of ['chromium', 'firefox']) { const b = await pw[e].launch(); const p = await b.newPage({viewport:{width:420,height:80}});
    for (const v of ['withfont', 'nofont']) { await p.goto(`${base}/${v}.html`, {waitUntil:'load'}); await p.waitForTimeout(400);
      await p.screenshot({path: path.join(dir, `${e}-${v}.png`)}); } await b.close(); }
  srv.close(); console.log('ok');
});
