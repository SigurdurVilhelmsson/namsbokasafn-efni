/**
 * Send a figure's prose blocks to Málstaður and record the result.
 *
 * One request per BLOCK, not one joined request: a block is the semantic unit
 * (a label, not a line), and a joined payload would have to be split back out of
 * the response — which §C118 measured the model restructuring. Per-block costs
 * the same in characters, since billing is by character.
 *
 *   node translate-blocks.mjs [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const { createClient, estimateIsk } = await import(path.join(REPO, 'tools/lib/malstadur-api.js'));

// .env is not auto-loaded by node
for (const line of fs.readFileSync(path.join(REPO, '.env'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const blocks = JSON.parse(fs.readFileSync(path.join(HERE, 'out/blocks.json'), 'utf-8'));
const send = blocks.filter((b) => b.send);
const chars = send.reduce((n, b) => n + b.english.length, 0);
const DRY = process.argv.includes('--dry-run');

console.log(`  ${send.length} blocks, ${chars} chars, est ${estimateIsk(chars).toFixed(2)} ISK`);
if (DRY) { console.log('  --dry-run: nothing sent.'); process.exit(0); }

const client = createClient();
const out = {};
const log = [];
for (const b of send) {
  const t0 = Date.now();
  const r = await client.translate(b.english, { targetLanguage: 'is' });
  const got = (r.text || '').trim();
  log.push({ key: b.key, en: b.english, is: got, ms: Date.now() - t0 });
  out[b.key] = b.arc ? got : [got];        // composer wraps lines itself
  console.log(`    ${JSON.stringify(b.english).padEnd(28)} -> ${JSON.stringify(got)}`);
}
const usage = client.getUsage ? client.getUsage() : client.usage;
fs.writeFileSync(path.join(HERE, 'out/api-run.json'),
  JSON.stringify({ figure: 'CNX_Chem_01_06_TempScales', when: new Date().toISOString(),
                   glossary: null, blocks: log, usage }, null, 1));
fs.writeFileSync(path.join(HERE, 'out/translations-api.json'),
  JSON.stringify({ _source: 'Málstaður /v1/translate, no glossary', blocks: out }, null, 1));
console.log('\n  usage:', JSON.stringify(usage));
