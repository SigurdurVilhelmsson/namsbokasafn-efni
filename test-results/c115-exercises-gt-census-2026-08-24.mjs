/**
 * §C115 — is `tools/lib/exercise-html.js:88`'s `[^>]*` reachable?
 * It walks the EXERCISES corpus (books/<slug>/01-source/exercises/), which the .cnxml
 * census does not cover. Measure rather than hedge.
 */
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const BOOKS = path.join(ROOT, 'books');

/** True if a raw `>` sits inside a quoted attribute value of an open tag. */
function hasRawGtInAttr(s) {
  const hits = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '<') continue;
    if (!/[a-zA-Z]/.test(s[i + 1] || '')) continue;
    let j = i + 1, q = null, sawGt = false;
    for (; j < s.length; j++) {
      const c = s[j];
      if (q) { if (c === q) q = null; else if (c === '>') sawGt = true; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '>') break;
    }
    if (j < s.length && sawGt) hits.push(s.slice(i, Math.min(j + 1, i + 90)));
  }
  return hits;
}

let files = 0, fields = 0, hits = 0, planted = 0;
for (const book of fs.readdirSync(BOOKS)) {
  const dir = path.join(BOOKS, book, '01-source', 'exercises');
  if (!fs.existsSync(dir)) continue;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(json|xhtml|html|xml)$/.test(e.name)) continue;
      files++;
      const s = fs.readFileSync(p, 'utf8');
      fields += (s.match(/</g) || []).length;
      const h = hasRawGtInAttr(s);
      if (h.length) { hits += h.length; console.log(`  HIT ${book}/${e.name}: ${h[0]}`); }
    }
  };
  walk(dir);
}
// 🔴 CONTROL: the detector must fire on a planted instance, or `hits: 0` is meaningless.
planted = hasRawGtInAttr('<img src="x.png" alt="a > b"/>').length;
console.log(`exercise files scanned: ${files} | '<' occurrences: ${fields} | raw-> in attr: ${hits}`);
console.log(`CONTROL (planted instance detected): ${planted === 1 ? 'YES' : 'NO — detector is broken'}`);
