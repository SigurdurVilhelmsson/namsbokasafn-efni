// §C140 ㉟ before/after instrument — read-only over the repo, writes only under its own out dir.
// usage: node snapshot.mjs <label>   (run from the efni repo root)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = process.cwd();
const B = 'books/efnafraedi-2e';
const label = process.argv[2];
if (!label) throw new Error('label required');
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), label);
fs.mkdirSync(OUT, { recursive: true });

const sidecarLib = require(path.join(REPO, 'tools/lib/figure-text-sidecar.cjs'));
const mapping = JSON.parse(fs.readFileSync(`${B}/media/image-mapping.json`, 'utf8'));
const reverse = new Map(mapping.map((e) => [e.outputName, e.originalImage]));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const DIRS = ['faithful/chapters/03', 'mt-preview/chapters/03', 'mt-preview/chapters/04'];
const TOKENS = ['tilbrigði', 'sjálfkvæm', 'ílend', 'álagn', 'hreint efni', 'mól'];
// §C96: MathJax per-render id counters are the known non-reproducible part.
const normalise = (html) => html.replace(/MJX-\d+-TEX-[A-Za-z0-9-]+/g, 'MJX-N').replace(/MJX-\d+/g, 'MJX-N');
const count = (s, needle) => s.split(needle).length - 1;

const report = { label, dirs: {} };
for (const d of DIRS) {
  const abs = `${B}/05-publication/${d}`;
  const pages = fs.readdirSync(abs).filter((f) => f.endsWith('.html')).sort();
  const media = `${abs}/images/media`;
  const gate = { total: 0, differ: 0, notInMedia: 0, notInMediaIdenticalToSource: 0, differList: [] };
  for (const f of fs.readdirSync(media).sort()) {
    gate.total++;
    const m = `${B}/media/${f}`;
    if (!fs.existsSync(m)) {
      gate.notInMedia++;
      const src = `${B}/01-source/media/${f}`;
      if (fs.existsSync(src) && sha(src) === sha(`${media}/${f}`)) gate.notInMediaIdenticalToSource++;
    } else if (sha(m) !== sha(`${media}/${f}`)) {
      gate.differ++;
      gate.differList.push(f);
    }
  }
  const perPage = {};
  for (const p of pages) {
    const html = fs.readFileSync(`${abs}/${p}`, 'utf8');
    fs.mkdirSync(`${OUT}/norm/${d}`, { recursive: true });
    fs.writeFileSync(`${OUT}/norm/${d}/${p}`, normalise(html));
    // predicted badges: <figure> blocks whose first <img> resolves to an English basename with a sidecar
    let figures = 0, sidecarFigures = 0, badgedMtPreview = 0, badgedAny = 0;
    for (const m of html.matchAll(/<figure\b([^>]*)>([\s\S]*?)<\/figure>/g)) {
      figures++;
      if (/data-figure-review=/.test(m[1])) badgedAny++;
      if (/data-figure-review="mt-preview"/.test(m[1])) badgedMtPreview++;
      const img = m[2].match(/<img\b[^>]*\bsrc="([^"]+)"/);
      if (!img) continue;
      const file = img[1].split('/').pop();
      const eng = reverse.get(file) || file.replace(/\.[^.]+$/, '');
      if (sidecarLib.readSidecar(B, eng)) sidecarFigures++;
    }
    const tokens = Object.fromEntries(TOKENS.map((t) => [t, count(html, t)]));
    perPage[p] = {
      bytes: Buffer.byteLength(html),
      figures, sidecarFigures, badgedMtPreview, badgedAny,
      imgIS: (html.match(/<img\b[^>]*_IS\.svg/g) || []).length,
      dataEn: count(html, 'data-en='),
      eParen: count(html, '(e. '),
      tokens,
    };
  }
  report.dirs[d] = { pages, gate, perPage };
}
const slugPath = `${B}/05-publication/mt-preview/slug-map.mt-preview.json`;
report.slugMap = JSON.parse(fs.readFileSync(slugPath, 'utf8')).renames;
report.faithfulSlugMapExists = fs.existsSync(`${B}/05-publication/faithful/slug-map.faithful.json`);
report.indexSha = sha(`${B}/05-publication/mt-preview/index.json`);
fs.copyFileSync(`${B}/05-publication/mt-preview/index.json`, `${OUT}/index.json`);
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

for (const [d, r] of Object.entries(report.dirs)) {
  const sum = (k) => Object.values(r.perPage).reduce((a, p) => a + p[k], 0);
  const tok = (t) => Object.values(r.perPage).reduce((a, p) => a + p.tokens[t], 0);
  console.log(
    `${d}: pages=${r.pages.length} gate differ=${r.gate.differ}/${r.gate.total - r.gate.notInMedia} ` +
      `(notInMedia ${r.gate.notInMedia}, identical-to-source ${r.gate.notInMediaIdenticalToSource}) ` +
      `figures=${sum('figures')} sidecarFigures=${sum('sidecarFigures')} badged=${sum('badgedAny')} ` +
      `imgIS=${sum('imgIS')} dataEn=${sum('dataEn')} eParen=${sum('eParen')} | ` +
      TOKENS.map((t) => `${t}=${tok(t)}`).join(' ')
  );
}
console.log('slug-map rows:', Object.keys(report.slugMap).length, '| faithful slug-map exists:', report.faithfulSlugMapExists);
console.log('SNAPSHOT-COMPLETE', label);
