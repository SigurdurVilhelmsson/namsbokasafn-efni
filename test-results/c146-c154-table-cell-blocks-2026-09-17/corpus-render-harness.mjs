#!/usr/bin/env node
/**
 * §C146 corpus render harness. Renders EVERY module of both kept books through the
 * EN round-trip and writes one file per module, so an old-vs-new run can be compared
 * BY NAME (set equality), never by count. Also reports raw `<para` inside the HTML
 * and any loud-seam records, per module.
 */
import fs from 'fs';
import path from 'path';
import { renderEnglishRoundTrip } from '/home/siggi/dev/repos/namsbokasafn-efni/tools/render-oracle-check.js';

const outDir = process.argv[2];
if (!outDir) { console.error('usage: c146-corpus-render.mjs <outDir>'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

const ROOT = '/home/siggi/dev/repos/namsbokasafn-efni';
const books = ['efnafraedi-2e', 'lifraen-efnafraedi'];
const summary = [];
let failed = 0;

for (const book of books) {
  const srcRoot = path.join(ROOT, 'books', book, '01-source');
  const stack = [srcRoot];
  const files = [];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith('.cnxml')) files.push(p);
    }
  }
  files.sort();
  for (const f of files) {
    const key = `${book}__${path.relative(srcRoot, f).replace(/\//g, '_')}`;
    let html = '', undisp = [], err = null;
    try {
      const r = renderEnglishRoundTrip(fs.readFileSync(f, 'utf8'), book);
      html = r.html; undisp = r.undispatched;
    } catch (e) { err = String(e && e.message || e); failed++; }
    fs.writeFileSync(path.join(outDir, key + '.html'), err ? `RENDER-ERROR: ${err}` : html);
    const rawPara = (html.match(/<para[\s>]/g) || []).length;
    summary.push({
      key,
      err,
      bytes: err ? 0 : html.length,
      rawPara,
      undispatched: undisp.map((u) => `${u.location || '?'}:${u.tag}`).sort(),
    });
  }
}
fs.writeFileSync(path.join(outDir, '_summary.json'), JSON.stringify(summary, null, 1));
const totalRaw = summary.reduce((a, s) => a + s.rawPara, 0);
console.log(`modules=${summary.length} renderErrors=${failed} rawParaTotal=${totalRaw}`);
console.log('modules with raw <para:');
for (const s of summary.filter((s) => s.rawPara > 0)) console.log(`  ${s.key}  ${s.rawPara}`);
console.log('DONE');
