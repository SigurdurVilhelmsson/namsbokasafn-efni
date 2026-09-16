const fs = require('fs'); const path = require('path');
const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';
const { enumerateChapterImages } = require(REPO + '/tools/lib/figure-enumerate.cjs');
const bookDir = path.join(REPO, 'books', 'efnafraedi-2e');
const dirs = fs.readdirSync(path.join(bookDir, '01-source')).filter(d => /^ch\d+$/.test(d) || d === 'appendices').sort();
const out = []; const warn = [];
for (const d of dirs) {
  const r = enumerateChapterImages({ bookDir, chapterDir: d });
  for (const f of r.figures) out.push({ chapter: d, moduleId: f.moduleId, basename: f.basename, src: f.src });
  for (const w of r.warnings) warn.push({ chapter: d, ...w });
}
fs.writeFileSync('population.json', JSON.stringify({ dirs, figures: out, warnings: warn }, null, 1));
const uniq = new Set(out.map(f => f.basename));
console.log(`chapters=${dirs.length} chapter-figure records=${out.length} distinct basenames=${uniq.size} warnings=${warn.length}`);
