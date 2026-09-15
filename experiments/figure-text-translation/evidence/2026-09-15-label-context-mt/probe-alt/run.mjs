// Experiment: does the figure's alt text, sent in the same request, change how
// Málstaður (Erlendur) translates the figure's short labels?
// Bare requests (no glossary), exactly like translate-blocks.mjs's production leg.
import fs from 'node:fs';
import path from 'node:path';

const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';
const OUT = path.dirname(new URL(import.meta.url).pathname);
const { loadEnvFile } = await import(path.join(REPO, 'tools/api-translate.js'));
for (const [k, v] of Object.entries(loadEnvFile(path.join(REPO, '.env')))) {
  if (!process.env[k]) process.env[k] = v;
}
const api = await import(path.join(REPO, 'tools/lib/malstadur-api.js'));

const sidecar = JSON.parse(
  fs.readFileSync(path.join(REPO, 'books/efnafraedi-2e/figure-text/CNX_Chem_04_04_limiting.is.json'), 'utf8')
);
const labels = Object.keys(sidecar.blocks); // the English block keys, in figure order
const committed = Object.fromEntries(Object.entries(sidecar.blocks).map(([k, v]) => [k, [].concat(v).join(' ')]));

const cnxml = fs.readFileSync(path.join(REPO, 'books/efnafraedi-2e/01-source/ch04/m68714.cnxml'), 'utf8');
const fig = cnxml.slice(cnxml.indexOf('<figure id="CNX_Chem_04_04_limiting">'));
const alt = fig.match(/<media [^>]*?alt="([^"]*)"/)[1];

const joined = labels.join('\n');
const arms = [
  ...labels.map((l) => ({ arm: 'A-per-label (production shape)', text: l })),
  { arm: 'B-labels-joined (no alt)', text: joined },
  { arm: 'C-alt+labels run 1', text: `${alt}\n\n${joined}` },
  { arm: 'C-alt+labels run 2', text: `${alt}\n\n${joined}` },
];
const chars = arms.reduce((n, a) => n + a.text.length, 0);
const isk = api.estimateIsk ? api.estimateIsk(chars) : chars / 100;
console.log(`labels: ${JSON.stringify(labels)}`);
console.log(`committed: ${JSON.stringify(committed)}`);
console.log(`${arms.length} requests, ${chars} chars, est ${Number(isk).toFixed(2)} ISK`);
if (process.argv.includes('--dry-run')) process.exit(0);

const client = api.createClient();
const results = [];
for (const a of arms) {
  const r = await client.translate(a.text, { targetLanguage: 'is' });
  results.push({ ...a, is: r.text });
  console.log(`\n=== ${a.arm}\n${r.text}`);
}
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ labels, committed, alt, results }, null, 1));
console.log('\nusage:', JSON.stringify(client.getUsage ? client.getUsage() : client.usage));
console.log('DONE');
