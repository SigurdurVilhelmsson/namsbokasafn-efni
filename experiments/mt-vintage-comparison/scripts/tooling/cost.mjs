// Read-only: computes re-MT cost from 02-for-mt at a ref, using api-translate's own rules
// (discoverChapters: ^ch\d+$ | appendices; discoverModules: ^m\d+-segments\.en\.md$;
//  + chapter-metadata-segments.en.md + exercises-segments.en.md; cost = chars*10/1000,
//  chars = JS string length of the whole file, as the dry run computes it).
import { execFileSync } from 'node:child_process';
const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';
const REF = process.argv[2] || '98a5fe2ff';
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1 << 30 });
const files = git('ls-tree', '-r', '--name-only', REF, '--', 'books/efnafraedi-2e/02-for-mt').split('\n').filter(Boolean);
const per = {};
let total = 0, totalNoMarkers = 0, nFiles = 0;
const excluded = [];
for (const f of files) {
  const parts = f.split('/');
  const dir = parts[3], name = parts[4];
  if (!(/^ch\d+$/.test(dir) || dir === 'appendices')) { excluded.push(f); continue; }
  const ok = /^m\d+-segments\.en\.md$/.test(name) || name === 'chapter-metadata-segments.en.md' || name === 'exercises-segments.en.md';
  if (!ok) { excluded.push(f); continue; }
  const txt = git('show', `${REF}:${f}`);
  const len = txt.length;
  const noMarkers = txt.replace(/<!--\s*SEG:[^\s]+?\s*-->\n?/g, '').length;
  per[dir] ??= { files: 0, chars: 0, charsNoMarkers: 0 };
  per[dir].files++; per[dir].chars += len; per[dir].charsNoMarkers += noMarkers;
  total += len; totalNoMarkers += noMarkers; nFiles++;
}
const isk = (c) => (c * 10) / 1000;
const rows = Object.entries(per).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
for (const [d, v] of rows) console.log(d.padEnd(11), String(v.files).padStart(3), String(v.chars).padStart(9), String(Math.round(isk(v.chars))).padStart(7), 'ISK', '| text-only', v.charsNoMarkers);
console.log('TOTAL files', nFiles, 'chars', total, 'ISK', isk(total).toFixed(0), '| text-only chars', totalNoMarkers, 'ISK', isk(totalNoMarkers).toFixed(0));
const exclCounts = {};
for (const f of excluded) { const n = f.split('/')[4] || ''; const k = /\(b\)|\(c\)|\(d\)/.test(n) ? 'split (b)/(c) parts' : n.endsWith('-links.json') ? 'links.json' : n; exclCounts[k] = (exclCounts[k] || 0) + 1; }
console.log('excluded (not discovered by api-translate):', JSON.stringify(exclCounts));
