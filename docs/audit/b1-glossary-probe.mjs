/**
 * b1-glossary-probe.mjs — reference harness for the B1 glossary-aware Erlendur
 * validation (see 2026-06-28-b1-glossary-validation-findings.md).
 *
 * ⚠️ PAID: makes live Málstaður API calls (≈600–1,150 ISK for the ch5 run).
 * Dry-run/estimate before re-running. Writes ONLY to ./probe-out next to this
 * file; reads the book tree read-only. Resolves the repo root relative to its
 * own location (docs/audit/ → repo root), so run it from a normal checkout:
 *
 *   node docs/audit/b1-glossary-probe.mjs
 *
 * Part A: marker-survival matrix, glossary ON vs OFF (all marker families).
 * Part B: full efnafraedi-2e ch5 re-translate WITH glossary via the production
 *         chunking flow; records per-chunk whether the glossary-truncation-retry
 *         fires (the "glossary counts toward char budget" question) and
 *         end-to-end per-type marker integrity.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const OUT = path.join(HERE, 'probe-out');
fs.mkdirSync(OUT, { recursive: true });

const {
  loadEnvFile,
  loadGlossary,
  bookToDomain,
  filterGlossaryForText,
  splitAtSegBoundaries,
  validateMarkers,
  normalizeUnicode,
  repairSegTags,
  assertNoControlChars,
} = await import(path.join(REPO, 'tools/api-translate.js'));
const { createClient } = await import(path.join(REPO, 'tools/lib/malstadur-api.js'));

if (!process.env.MALSTADUR_API_KEY) {
  const env = loadEnvFile(path.join(REPO, '.env'));
  if (env.MALSTADUR_API_KEY) process.env.MALSTADUR_API_KEY = env.MALSTADUR_API_KEY;
}
const client = createClient();
const glossary = loadGlossary(
  path.join(REPO, 'books/efnafraedi-2e/glossary'),
  bookToDomain('efnafraedi-2e')
);
console.log(`Glossary loaded: ${glossary ? glossary.terms.length : 0} terms\n`);

const ISK = (chars) => ((chars * 5) / 1000).toFixed(0);

const TYPES = {
  SEG: /<!-- SEG:/g,
  i: /\[\[i:/g,
  b: /\[\[b:/g,
  sub: /\[\[sub:/g,
  sup: /\[\[sup:/g,
  link: /\[\[link:/g,
  xref: /\[\[xref:/g,
  docref: /\[\[docref:/g,
  MATH: /\[\[MATH:/g,
  MEDIA: /\[\[MEDIA:/g,
  BR: /\[\[BR\]\]/g,
  term: /\{\{term\}\}/g,
  fn: /\{\{fn\}\}/g,
};
function countByType(text) {
  const c = {};
  for (const [k, re] of Object.entries(TYPES)) c[k] = (text.match(re) || []).length;
  return c;
}
function diffTypes(inp, out) {
  const a = countByType(inp);
  const b = countByType(out);
  const d = {};
  for (const k of Object.keys(TYPES)) if (a[k] !== b[k]) d[k] = `${a[k]}->${b[k]}`;
  return d;
}

const report = { glossaryTerms: glossary?.terms.length || 0, partA: {}, partB: {}, totals: {} };

const matrix = [
  '<!-- SEG:m1:title:t -->',
  'Water [[i:solid]] and [[b:important]] H[[sub:2]]O and Ca[[sup:2+]] ions.',
  '<!-- SEG:m1:para:p1 -->',
  'See [[link:the periodic table|https://example.com/pt]] and [[xref:Figure 5.2|CNX_Chem_05_02]] plus [[xref:CNX_Chem_05_03]].',
  '<!-- SEG:m1:para:p2 -->',
  'Reference [[docref:m68674#fs-id123]] with math [[MATH:1]] and image [[MEDIA:2]] line break [[BR]] here.',
  '<!-- SEG:m1:para:p3 -->',
  'A {{term}}chemical bond{{/term}} and a {{fn}}footnote text{{/fn}} in context.',
].join('\n');

async function runMatrix(label, withGlossary) {
  const filtered = withGlossary ? filterGlossaryForText(glossary, matrix) : null;
  const opts = { targetLanguage: 'is' };
  if (filtered) opts.glossaries = [filtered];
  const res = await client.translateAuto(matrix, opts);
  const out = res.text;
  const d = diffTypes(matrix, out);
  report.partA[label] = {
    filteredGlossaryTerms: filtered ? filtered.terms.length : 0,
    markerDiffs: Object.keys(d).length ? d : 'ALL PRESERVED',
    segOk: validateMarkers(matrix, out),
    usage: res.usage,
  };
  fs.writeFileSync(path.join(OUT, `partA-${label}.is.txt`), out);
  console.log(
    `  Part A [${label}]: markers ${Object.keys(d).length ? JSON.stringify(d) : 'ALL PRESERVED'} | usage ${JSON.stringify(res.usage)}`
  );
}

const CH5 = path.join(REPO, 'books/efnafraedi-2e/02-for-mt/ch05');
const isCanonical = (f) => /-segments\.en\.md$/.test(f) && !/\([b-z]\)\.en\.md$/.test(f);
const MAX_CHUNK = 25000;

async function translateChunkProbe(chunkText) {
  const filtered = filterGlossaryForText(glossary, chunkText);
  const opts = { targetLanguage: 'is' };
  if (filtered) opts.glossaries = [filtered];
  const filteredTerms = filtered ? filtered.terms.length : 0;
  const filteredBytes = filtered ? Buffer.byteLength(JSON.stringify(filtered), 'utf8') : 0;

  let res = await client.translateAuto(chunkText, opts);
  let out = repairSegTags(chunkText, normalizeUnicode(res.text));
  let glossaryRetryFired = false;
  let usage = res.usage || 0;

  if (!validateMarkers(chunkText, out) && filtered) {
    glossaryRetryFired = true;
    res = await client.translateAuto(chunkText, { targetLanguage: 'is' });
    out = repairSegTags(chunkText, normalizeUnicode(res.text));
    usage += res.usage || 0;
  }
  let controlChars = false;
  try {
    assertNoControlChars(out, 'probe');
  } catch {
    controlChars = true;
  }
  return {
    out,
    filteredTerms,
    filteredBytes,
    glossaryRetryFired,
    controlChars,
    usage,
    chunkChars: chunkText.length,
    segOk: validateMarkers(chunkText, out),
  };
}

async function runPartB() {
  const files = fs.readdirSync(CH5).filter(isCanonical).sort();
  let totalUsage = 0;
  for (const f of files) {
    const input = fs.readFileSync(path.join(CH5, f), 'utf8');
    if (!input.includes('<!-- SEG:')) continue;
    const chunks = splitAtSegBoundaries(input, MAX_CHUNK);
    const parts = [];
    const chunkInfo = [];
    for (const ch of chunks) {
      const r = await translateChunkProbe(ch);
      parts.push(r.out);
      totalUsage += typeof r.usage === 'object' ? r.usage.units || 0 : r.usage;
      chunkInfo.push({
        chunkChars: r.chunkChars,
        filteredTerms: r.filteredTerms,
        filteredBytes: r.filteredBytes,
        glossaryRetryFired: r.glossaryRetryFired,
        controlChars: r.controlChars,
        segOk: r.segOk,
      });
      console.log(
        `    ${f} chunk ${chunkInfo.length}/${chunks.length}: ${r.chunkChars} chars +${r.filteredTerms} gloss-terms (${r.filteredBytes}b) | segOk=${r.segOk} retry=${r.glossaryRetryFired} ctrl=${r.controlChars}`
      );
    }
    const output = parts.join('');
    fs.writeFileSync(path.join(OUT, f.replace('.en.md', '.is.md')), output);
    const d = diffTypes(input, output);
    report.partB[f] = {
      inputChars: input.length,
      chunks: chunks.length,
      chunkInfo,
      segIn: (input.match(/<!-- SEG:/g) || []).length,
      segOut: (output.match(/<!-- SEG:/g) || []).length,
      markerDiffs: Object.keys(d).length ? d : 'ALL PRESERVED',
    };
  }
  report.totals.partBUsage = totalUsage;
  report.totals.partBISK = ISK(totalUsage);
}

console.log('=== Part A: marker matrix (glossary ON vs OFF) ===');
await runMatrix('glossary-off', false);
await runMatrix('glossary-on', true);
console.log('\n=== Part B: full ch5 re-translate WITH glossary ===');
await runPartB();

const stats = client.getUsage();
report.totals.clientUsage = stats;
report.totals.estimatedISK = ISK(stats.totalChars || 0);
fs.writeFileSync(path.join(OUT, 'b1-report.json'), JSON.stringify(report, null, 2));
console.log('\n=== DONE ===');
console.log('client usage:', JSON.stringify(stats));
console.log('report → docs/audit/probe-out/b1-report.json');
