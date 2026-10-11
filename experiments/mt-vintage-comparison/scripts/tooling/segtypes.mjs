import { execFileSync } from 'node:child_process';
const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';
const REF = process.argv[2] || '98a5fe2ff';
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1 << 30 });
const files = git('ls-tree', '-r', '--name-only', REF, '--', 'books/efnafraedi-2e/02-for-mt').split('\n').filter(Boolean)
  .filter((f) => { const p = f.split('/'); return (/^ch\d+$/.test(p[3]) || p[3] === 'appendices') && (/^m\d+-segments\.en\.md$/.test(p[4]) || p[4] === 'chapter-metadata-segments.en.md' || p[4] === 'exercises-segments.en.md'); });
const types = {};
const re = /<!--\s*SEG:([^\s]+?)\s*-->/g;
for (const f of files) {
  const txt = git('show', `${REF}:${f}`);
  const marks = [...txt.matchAll(re)];
  for (let i = 0; i < marks.length; i++) {
    const id = marks[i][1];
    const parts = id.split(':');
    const type = parts[1];
    const start = marks[i].index; const end = i + 1 < marks.length ? marks[i + 1].index : txt.length;
    const segWithMarker = txt.slice(start, end);
    const body = txt.slice(marks[i].index + marks[i][0].length, end).trim();
    types[type] ??= { n: 0, chars: 0, bodyChars: 0, ex: id };
    types[type].n++; types[type].chars += segWithMarker.length; types[type].bodyChars += body.length;
  }
}
const rows = Object.entries(types).sort((a, b) => b[1].chars - a[1].chars);
for (const [t, v] of rows) console.log(t.padEnd(26), String(v.n).padStart(6), String(v.chars).padStart(9), String(v.bodyChars).padStart(9), v.ex);
