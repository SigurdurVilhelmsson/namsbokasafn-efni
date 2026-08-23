/**
 * §C115 — RENDER-SIDE corpus byte-identity.
 *
 * The extract-side check (segments+structure hashing) says NOTHING about the render
 * path, and the reader-visible half of §C115 is exactly there: `<img alt>` in the
 * published HTML. This is its analogue.
 *
 * ⚠️ IN-PROCESS, NEVER THE CLI. `cnxml-render.js --output-dir` shares the idiom
 * §C83 measured on cnxml-extract: accepted, listed in --help, IGNORED, and the run
 * writes into the real tracked books/ tree while exiting 0.
 *
 * Usage: node test-results/c115-render-byte-identity-2026-08-24.mjs <out.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '..');
const { renderCnxmlToHtml } = await import(path.join(ROOT, 'tools/cnxml-render.js'));

const out = {};
let rendered = 0, failed = 0, totalBytes = 0;
for (const book of ['efnafraedi-2e', 'lifraen-efnafraedi']) {
  const root = path.join(ROOT, 'books', book, '01-source');
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      e.isDirectory() ? walk(p) : e.name.endsWith('.cnxml') && files.push(p);
    }
  };
  walk(root);
  for (const f of files) {
    const key = `${book}/${path.basename(f, '.cnxml')}`;
    try {
      const html = renderCnxmlToHtml(fs.readFileSync(f, 'utf8'), { bookSlug: book });
      const s = typeof html === 'string' ? html : JSON.stringify(html);
      totalBytes += s.length;
      rendered++;
      out[key] = crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
    } catch (e) {
      failed++;
      out[key] = `ERR:${String(e.message).slice(0, 60)}`;
    }
  }
}
fs.writeFileSync(process.argv[2], JSON.stringify(out));
// 🔴 CONTROL: an all-identical diff is indistinguishable from a harness that
// rendered nothing. Print the volume so the comparison means something.
console.log(`rendered=${rendered} failed=${failed} totalHtmlBytes=${totalBytes} modules=${Object.keys(out).length}`);
