import fs from 'node:fs';
import path from 'node:path';
const repo = '/home/siggi/dev/repos/namsbokasafn-efni';
const { verifyRevision } = await import(path.join(repo, 'tools/lib/mt-layers.js'));
const bookDir = path.join(repo, 'books/efnafraedi-2e');
const dir = path.join(bookDir, '02-mt-revised', 'ch10');
const stems = fs.readdirSync(dir).filter((f) => f.endsWith('-revision.json')).map((f) => f.replace(/-revision\.json$/, ''));
const good = { rulingSetSha256: '0aa33690ca829be4baa4da2b34fbea1455517d426e939c3544b3a86b3049c3bd', promptSha256: '7f9b1b3518bb6454d799a03d3a53b490376f37d2e25a6c4a89e42f6c299e559b', model: 'claude-opus-5-5' };
const bad = { ...good, rulingSetSha256: '0'.repeat(64) };
let clean = 0; const dirty = [];
for (const stem of stems) {
  const m = verifyRevision({ bookDir, chapterDir: 'ch10', stem, current: good });
  if (m.length === 0) clean++; else dirty.push([stem, m.map((x) => x.field)]);
}
const controlHits = stems.filter((stem) => verifyRevision({ bookDir, chapterDir: 'ch10', stem, current: bad }).length > 0).length;
console.log(`units: ${stems.length}, clean: ${clean}, mismatched: ${dirty.length}`, dirty.slice(0, 5));
console.log(`control (wrong ruling-set hash): ${controlHits} of ${stems.length} units flagged`);
