// Per-label vs joined MT of figure labels, over the 34 bought ch03/ch04 figures.
//
// Arms (all bare /v1/translate, targetLanguage 'is', no glossary — the production figure leg):
//   P   one request per distinct send block (translate-blocks.mjs's production shape)
//   J1  one request per multi-label figure, labels newline-joined in emit order
//   J2  J1 repeated, to measure the joined arm's own run-to-run variation
// Inputs are the prepared blocks.json of the 34 (send:true, deduped by key, `english`),
// the exact text production sent. Resumable: every answer is appended to results.jsonl
// and a (fig, arm, idx) already recorded without error is never re-bought.
//
//   node run.mjs --dry-run
//   node run.mjs --budget-seconds 480      (repeat until it prints ALL-DONE)
import fs from 'node:fs';
import path from 'node:path';

const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';
const PREP = '/home/siggi/dev/scratch-c140/prep/figs';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const RESULTS = path.join(HERE, 'results.jsonl');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const budgetIdx = argv.indexOf('--budget-seconds');
const budgetMs = budgetIdx >= 0 ? Number(argv[budgetIdx + 1]) * 1000 : Infinity;
process.exitCode = 1; // a verdict must be reached to clear this

const figs = fs
  .readdirSync(path.join(REPO, 'books/efnafraedi-2e/figure-text'))
  .filter((f) => f.endsWith('.is.json'))
  .map((f) => f.slice(0, -'.is.json'.length))
  .sort();

const jobs = [];
for (const fig of figs) {
  const blocks = JSON.parse(fs.readFileSync(path.join(PREP, fig, 'blocks.json'), 'utf8'));
  const byKey = new Map();
  for (const b of blocks.filter((x) => x.send)) byKey.set(b.key, b); // dedupeSendBlocks
  const labels = [...byKey.values()].map((b) => ({ key: b.key, english: b.english }));
  labels.forEach((l, i) => jobs.push({ fig, arm: 'P', idx: i, key: l.key, text: l.english }));
  if (labels.length > 1) {
    const joined = labels.map((l) => l.english).join('\n');
    for (const arm of ['J1', 'J2']) jobs.push({ fig, arm, idx: -1, keys: labels.map((l) => l.key), text: joined });
  }
}
if (new Set(jobs.map((j) => `${j.fig}\t${j.arm}\t${j.idx}`)).size !== jobs.length) throw new Error('job id collision');

const done = new Set();
if (fs.existsSync(RESULTS)) {
  for (const line of fs.readFileSync(RESULTS, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    if (!r.error) done.add(`${r.fig}\t${r.arm}\t${r.idx}`);
  }
}
const todo = jobs.filter((j) => !done.has(`${j.fig}\t${j.arm}\t${j.idx}`));
const chars = (list) => list.reduce((n, j) => n + j.text.length, 0);
const byArm = (arm) => jobs.filter((j) => j.arm === arm);
console.log(
  `figures ${figs.length} · jobs ${jobs.length} (P ${byArm('P').length}, J1 ${byArm('J1').length}, J2 ${byArm('J2').length})` +
    ` · chars P ${chars(byArm('P'))} J1 ${chars(byArm('J1'))} J2 ${chars(byArm('J2'))} · total ${chars(jobs)}`
);
console.log(`already done ${done.size} · to send ${todo.length} (${chars(todo)} chars, est ${(chars(todo) / 100).toFixed(2)} ISK)`);
if (dryRun) {
  process.exitCode = 0;
} else {
  for (const [k, v] of Object.entries((await import(path.join(REPO, 'tools/api-translate.js'))).loadEnvFile(path.join(REPO, '.env')))) {
    if (!process.env[k]) process.env[k] = v;
  }
  const api = await import(path.join(REPO, 'tools/lib/malstadur-api.js'));
  const client = api.createClient();
  const t0 = Date.now();
  let sent = 0;
  for (const j of todo) {
    if (Date.now() - t0 > budgetMs) break;
    const rec = { fig: j.fig, arm: j.arm, idx: j.idx, key: j.key, keys: j.keys, en: j.text, at: new Date().toISOString() };
    try {
      const r = await client.translate(j.text, { targetLanguage: 'is' });
      rec.is = r.text;
      rec.usage = r.usage;
    } catch (err) {
      rec.error = String(err && err.message ? err.message : err);
    }
    fs.appendFileSync(RESULTS, JSON.stringify(rec) + '\n');
    sent += 1;
    console.log(`${j.fig} ${j.arm} ${j.idx} ${rec.error ? 'ERROR ' + rec.error : JSON.stringify(rec.is).slice(0, 90)}`);
  }
  const usage = client.getUsage ? client.getUsage() : client.usage;
  const remaining = jobs.length - done.size - sent;
  console.log(`sent ${sent} · usage ${JSON.stringify(usage)}`);
  console.log(remaining === 0 ? 'ALL-DONE (re-run once to confirm 0 to send)' : `PARTIAL — ${remaining} left, run again`);
  process.exitCode = 0;
}
