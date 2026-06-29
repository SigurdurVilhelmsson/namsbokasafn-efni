/**
 * d7-species-probe.mjs — measure whether Latin binomials survive Erlendur MT.
 * See docs/plans/2026-06-29-d7-species-mt-protection-design.md for the findings.
 *
 * ⚠️ PAID: makes live Málstaður API calls. Cost model 5 ISK/1000 chars; the
 * default 45-segment cap keeps a run ~50-170 ISK. Dry-run/estimate before
 * re-running. Reads the book tree read-only; writes ONLY to ./probe-out next to
 * this file. Resolves the repo root relative to its own location (docs/audit/ →
 * repo root), so run it from a normal checkout:
 *
 *   node docs/audit/d7-species-probe.mjs
 *
 * Method: pull REAL biology <para> text containing italic binomials, run each
 * through the production extractInlineText() so the API sees the exact
 * `[[i:Genus species]]` form, then translate each segment in TWO conditions:
 *   (A) baseline — no glossary
 *   (B) glossary — binomial→binomial identity entries (domain 'biology')
 * For every binomial, record whether it appears VERBATIM in the IS output (and
 * whether still inside an [[i:]] marker). Writes results.json to ./probe-out.
 *
 * NOTE (2026-06-29 run): baseline 46/48 verbatim — the 2 misses were the
 * detector's false positives (translatable English phrases), so real binomials
 * survived ~100% with no protection. Decision: no protection mechanism. This
 * harness exists to re-measure if the API ever drifts.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const OUT = path.join(HERE, 'probe-out');
fs.mkdirSync(OUT, { recursive: true });

const { loadEnvFile } = await import(path.join(REPO, 'tools/api-translate.js'));
const { extractInlineText } = await import(path.join(REPO, 'tools/cnxml-extract.js'));
const { createClient } = await import(path.join(REPO, 'tools/lib/malstadur-api.js'));

if (!process.env.MALSTADUR_API_KEY) {
  const env = loadEnvFile(path.join(REPO, '.env'));
  if (env.MALSTADUR_API_KEY) process.env.MALSTADUR_API_KEY = env.MALSTADUR_API_KEY;
}
const client = createClient();

// ── binomial detector (also used to exclude obvious book-title false positives) ──
const NON_SPECIES_FIRST = new Set(['Origin', 'On', 'The', 'In', 'Of', 'And', 'A', 'An', 'Transactions']);
function binomialsIn(text) {
  const out = [];
  const re = /\[\[i:([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const c = m[1].trim();
    if (/^[A-Z][a-z]+ [a-z]{2,}([ a-z]+)?$/.test(c) && !NON_SPECIES_FIRST.has(c.split(' ')[0])) out.push(c);
    else if (/^[A-Z]\. [a-z]{2,}$/.test(c)) out.push(c); // abbreviated E. coli
  }
  return [...new Set(out)];
}

const SRC = path.join(REPO, 'books/liffraedi-2e/01-source');
function walk(dir, acc = []) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (n.endsWith('.cnxml')) acc.push(p);
  }
  return acc;
}

const MAX_SEGMENTS = Number(process.env.D7_MAX_SEGMENTS || 45); // cost cap
const segments = [];
const seenBinomials = new Set();
outer: for (const file of walk(SRC)) {
  const xml = fs.readFileSync(file, 'utf8');
  const paraRe = /<para\b[^>]*>([\s\S]*?)<\/para>/g;
  let pm;
  while ((pm = paraRe.exec(xml)) !== null) {
    const raw = pm[1];
    if (!/<emphasis effect="italics">[A-Z][a-z]+ [a-z]{2,}/.test(raw)) continue;
    const enText = extractInlineText(raw, new Map(), { math: 0, media: 0 }).trim();
    if (enText.length < 30 || enText.length > 600) continue; // small + sync-safe
    const bins = binomialsIn(enText);
    if (!bins.length) continue;
    const fresh = bins.filter((b) => !seenBinomials.has(b));
    if (!fresh.length && segments.length > 15) continue; // prefer diversity
    bins.forEach((b) => seenBinomials.add(b));
    segments.push({ file: path.relative(REPO, file), enText, binomials: bins });
    if (segments.length >= MAX_SEGMENTS) break outer;
  }
}

const allBinomials = [...new Set(segments.flatMap((s) => s.binomials))];
const totalChars = segments.reduce((a, s) => a + s.enText.length, 0);
console.log(`Selected ${segments.length} segments covering ${allBinomials.length} distinct binomials.`);
console.log(`~${totalChars} chars/condition × 2 ≈ ${Math.round((totalChars * 2 * 5) / 1000)} ISK est.`);

const glossary = {
  domain: 'biology',
  sourceLanguage: 'en',
  targetLanguage: 'is',
  terms: allBinomials.map((b) => ({ sourceWord: b, targetWord: b })),
};

function survival(isText, binomials) {
  return binomials.map((b) => {
    const verbatim = isText.includes(b);
    const inMarker = new RegExp(
      `\\[\\[i:[^\\]]*${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\]]*\\]\\]`
    ).test(isText);
    return { binomial: b, verbatim, inMarker };
  });
}

const results = [];
for (let i = 0; i < segments.length; i++) {
  const seg = segments[i];
  try {
    const base = await client.translate(seg.enText, {});
    const gloss = await client.translate(seg.enText, { glossaries: [glossary] });
    results.push({
      i, file: seg.file, en: seg.enText, baseIs: base.text, glossIs: gloss.text,
      baseSurvival: survival(base.text, seg.binomials),
      glossSurvival: survival(gloss.text, seg.binomials),
    });
    process.stdout.write(`  [${i + 1}/${segments.length}] ${seg.binomials.join(', ').slice(0, 50)}\n`);
  } catch (e) {
    results.push({ i, file: seg.file, en: seg.enText, error: String(e) });
    console.error(`  [${i + 1}] ERROR: ${e}`);
  }
}

function rate(key) {
  let total = 0, verbatim = 0, inMarker = 0;
  for (const r of results) for (const s of r[key] || []) {
    total++; if (s.verbatim) verbatim++; if (s.inMarker) inMarker++;
  }
  return {
    total, verbatim, inMarker,
    verbatimPct: total ? ((verbatim / total) * 100).toFixed(1) : 'n/a',
    inMarkerPct: total ? ((inMarker / total) * 100).toFixed(1) : 'n/a',
  };
}
const summary = {
  segments: segments.length, distinctBinomials: allBinomials.length,
  baseline: rate('baseSurvival'), withGlossary: rate('glossSurvival'),
};
console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));

const mangled = [];
for (const r of results) {
  if (!r.baseSurvival) continue;
  r.baseSurvival.forEach((b, k) => {
    if (!b.verbatim) mangled.push({ binomial: b.binomial, glossaryRescued: r.glossSurvival[k]?.verbatim || false, file: r.file });
  });
}
console.log('\n=== BASELINE-MANGLED (inspect for detector false positives) ===');
for (const m of mangled) console.log(`  ${m.binomial}  →  glossary-rescued: ${m.glossaryRescued}  (${m.file})`);

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ summary, mangled, results }, null, 2));
console.log(`\nWrote ${path.join(OUT, 'results.json')}`);
