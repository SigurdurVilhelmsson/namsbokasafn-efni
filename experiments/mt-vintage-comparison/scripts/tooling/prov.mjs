import { execFileSync } from 'node:child_process';
const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';
const REF = process.argv[2] || '98a5fe2ff';
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1 << 30 });
const files = git('ls-tree', '-r', '--name-only', REF, '--', 'books/efnafraedi-2e/02-mt-output').split('\n').filter((f) => f.endsWith('-provenance.json'));
let chars = 0, usage = 0, isk = 0, n = 0, topUpCount = 0, topUpChars = 0, topUpUsage = 0, topUpIsk = 0;
const arms = {}, months = {}, tools = {}, keys = {}, runKeys = {}, termCounts = {};
let missingRun = 0;
for (const f of files) {
  let j; try { j = JSON.parse(git('show', `${REF}:${f}`)); } catch (e) { console.log('BAD', f); continue; }
  n++;
  for (const k of Object.keys(j)) keys[k] = (keys[k] || 0) + 1;
  tools[j.tool] = (tools[j.tool] || 0) + 1;
  const m = (j.generatedAt || 'none').slice(0, 7); months[m] = (months[m] || 0) + 1;
  const r = j.run;
  if (!r) { missingRun++; continue; }
  for (const k of Object.keys(r)) runKeys[k] = (runKeys[k] || 0) + 1;
  chars += r.chars || 0; usage += (typeof r.usage === 'number' ? r.usage : 0); isk += r.estimatedIsk || 0;
  const arm = r.glossary?.arm ?? 'none'; arms[arm] = (arms[arm] || 0) + 1;
  if (r.glossary?.termCount != null) termCounts[r.glossary.termCount] = (termCounts[r.glossary.termCount] || 0) + 1;
  for (const t of j.topUps || []) { topUpCount++; const tr = t.run || t; topUpChars += tr.chars || 0; topUpUsage += (typeof tr.usage === 'number' ? tr.usage : 0); topUpIsk += tr.estimatedIsk || 0; }
}
console.log(JSON.stringify({ REF, sidecars: n, missingRun, tools, months, arms, keys, runKeys, chars, usage, estimatedIsk: Math.round(isk), topUpCount, topUpChars, topUpUsage, topUpIsk: Math.round(topUpIsk) }, null, 1));
