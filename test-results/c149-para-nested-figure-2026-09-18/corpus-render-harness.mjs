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
    // §C149: a <figure> inside a <p> — invalid HTML; browsers close the <p> early.
    const figInP = (html.match(/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?<figure/g) || []).length;
    // ⚠️ NOT a bare <caption count: <table><caption> is VALID HTML and renderTable
    // emits it for every table label (161 corpus-wide). Only a <caption> inside a
    // <figure> is the CNXML leak, so key it on the parent.
    const rawCaption = (html.match(/<figure\b[^>]*>(?:(?!<\/figure>)[\s\S])*?<caption/g) || []).length;
    const emptyP = (html.match(/<p\b[^>]*>\s*<\/p>/g) || []).length;
    summary.push({
      key,
      err,
      bytes: err ? 0 : html.length,
      rawPara,
      figInP,
      rawCaption,
      emptyP,
      undispatched: undisp.map((u) => `${u.location || '?'}:${u.tag}`).sort(),
    });
  }
}
fs.writeFileSync(path.join(outDir, '_summary.json'), JSON.stringify(summary, null, 1));
const sum = (k) => summary.reduce((a, s) => a + s[k], 0);
console.log(`modules=${summary.length} renderErrors=${failed} rawPara=${sum('rawPara')} figInP=${sum('figInP')} rawCaption=${sum('rawCaption')} emptyP=${sum('emptyP')}`);
console.log('modules with <figure> inside <p>:');
for (const s of summary.filter((s) => s.figInP > 0)) console.log(`  ${s.key}  figInP=${s.figInP} rawCaption=${s.rawCaption}`);
console.log('DONE');
