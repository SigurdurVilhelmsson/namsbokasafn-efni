// READ-ONLY census for the ㊴ design: which chemistry figures each --stale predicate would select.
const path = require('path');
const fs = require('fs');
const REPO = process.argv[2];
const { enumerateChapterImages } = require(path.join(REPO, 'tools/lib/figure-enumerate.cjs'));
const { loadImageBasenameMap } = require(path.join(REPO, 'tools/lib/image-basename-map.cjs'));
const { sidecarPath } = require(path.join(REPO, 'tools/lib/figure-text-sidecar.cjs'));
// The chapter DIRECTORY names are read straight from 01-source, so no chapter-label conversion
// is needed, and nothing is imported from the AGPL server tree (root LICENSE lists those edges).
const bookDir = path.join(REPO, 'books', 'efnafraedi-2e');
const mapped = new Map(loadImageBasenameMap(bookDir).map((e) => [e.originalImage, e]));
const chapters = fs.readdirSync(path.join(bookDir, '01-source')).filter((d) => /^ch\d+$|^appendices$/.test(d)).sort();
const tot = { all: 0, sidecar: 0, svgRowNoSidecar: 0, otherRowNoSidecar: 0, noRowNoSidecar: 0 };
const seen = new Set(); let dupes = 0;
for (const dir of chapters) {
  const { figures } = enumerateChapterImages({ bookDir, chapterDir: dir });
  const t = { all: 0, sidecar: 0, svgRowNoSidecar: 0, otherRowNoSidecar: 0, noRowNoSidecar: 0 };
  for (const f of figures) {
    if (seen.has(f.basename)) dupes++; seen.add(f.basename);
    t.all++;
    const hasFile = fs.existsSync(sidecarPath(bookDir, f.basename));
    const row = mapped.get(f.basename);
    if (hasFile) t.sidecar++;
    else if (row && path.extname(row.outputName || '') === '.svg') t.svgRowNoSidecar++;
    else if (row) t.otherRowNoSidecar++;
    else t.noRowNoSidecar++;
  }
  for (const k of Object.keys(tot)) tot[k] += t[k];
  console.log(dir.padEnd(11), JSON.stringify(t));
}
console.log('TOTAL      ', JSON.stringify(tot), 'basenames enumerated in >1 chapter:', dupes);
console.log('sidecar files on disk:', fs.readdirSync(path.join(bookDir, 'figure-text')).filter((f) => f.endsWith('.is.json')).length,
  '| mapping rows:', mapped.size, '| .svg rows:', [...mapped.values()].filter((e) => path.extname(e.outputName || '') === '.svg').length);
