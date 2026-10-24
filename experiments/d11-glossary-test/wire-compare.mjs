#!/usr/bin/env node
// D11, offline and free: what each glossary arm would put on the wire, chunk by chunk, for the
// two candidate modules (see DESIGN.md). Today's functions are imported from the repo (main()
// is guarded, so importing runs nothing paid); June's are copied verbatim from 7658de896.
// The March glossary is read from git at 5db701c92: unchanged through every March buy.
//   node experiments/d11-glossary-test/wire-compare.mjs   (writes results/<today>/wire-compare.json)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const at = await import(path.join(repo, 'tools/api-translate.js'));
const { formatGlossary } = await import(path.join(repo, 'tools/lib/malstadur-api.js'));

// ── verbatim from 7658de896:tools/lib/malstadur-api.js ──
function formatGlossaryJune(terms, { domain = 'chemistry', approvedOnly = true } = {}) {
  const filtered = approvedOnly ? terms.filter((t) => t.status === 'approved') : terms;
  return {
    domain,
    sourceLanguage: 'en',
    targetLanguage: 'is',
    terms: filtered.map((t) => ({ sourceWord: t.english, targetWord: t.icelandic })),
  };
}
// ── verbatim from 7658de896:tools/api-translate.js ──
function filterGlossaryForTextJune(glossary, text) {
  if (!glossary) return null;
  const lowerText = text.toLowerCase();
  const filtered = glossary.terms.filter((t) => lowerText.includes(t.sourceWord.toLowerCase()));
  if (filtered.length === 0) return null;
  return { ...glossary, terms: filtered };
}

const march = JSON.parse(
  execFileSync('git', ['show', '5db701c92:books/efnafraedi-2e/glossary/glossary-unified.json'], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  })
);
const terms = march.terms || [];
const approved = terms.filter((t) => t.status === 'approved');
const byEn = new Map();
for (const t of approved) {
  const k = String(t.english).trim().toLowerCase();
  byEn.set(k, new Set([...(byEn.get(k) || []), String(t.icelandic).trim()]));
}
const competing = [...byEn].filter(([, v]) => v.size > 1);
const today = formatGlossary(terms, { domain: 'chemistry', approvedOnly: true });
const june = formatGlossaryJune(terms, { domain: 'chemistry', approvedOnly: true });
const key = (t) => `${t.sourceWord} → ${t.targetWord}`;

const out = {
  marchFile: {
    terms: terms.length,
    approved: approved.length,
    competingHeadwords: competing.length,
    competingSample: competing.slice(0, 13).map(([k, v]) => `${k}: ${[...v].join(' / ')}`),
  },
  wholeGlossary: { today: today.terms.length, june: june.terms.length },
  modules: [],
};
for (const rel of ['ch11/m68781', 'ch01/m68667']) {
  const text = fs.readFileSync(
    path.join(repo, `books/efnafraedi-2e/02-for-mt/${rel}-segments.en.md`),
    'utf8'
  );
  const chunks = at.splitAtSegBoundaries(text, 25000);
  const mod = { module: rel, chunks: chunks.length, perChunk: [] };
  for (const [i, c] of chunks.entries()) {
    const t = new Set((at.filterGlossaryForText(today, c)?.terms || []).map(key));
    const j = new Set((june ? filterGlossaryForTextJune(june, c)?.terms || [] : []).map(key));
    mod.perChunk.push({
      chunk: i + 1,
      chars: c.length,
      today: t.size,
      june: j.size,
      onlyJune: [...j].filter((x) => !t.has(x)),
      onlyToday: [...t].filter((x) => !j.has(x)),
    });
  }
  out.modules.push(mod);
}
const outDir = path.join(here, 'results', new Date().toISOString().slice(0, 10));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'wire-compare.json'), JSON.stringify(out, null, 1) + '\n');
console.log(
  JSON.stringify({ marchFile: out.marchFile, wholeGlossary: out.wholeGlossary }, null, 1)
);
for (const m of out.modules) {
  console.log(`${m.module}: ${m.chunks} chunk(s)`);
  for (const c of m.perChunk) {
    console.log(
      `  chunk ${c.chunk} (${c.chars} chars): today ${c.today} terms, June ${c.june}; only June ${c.onlyJune.length}, only today ${c.onlyToday.length}`
    );
    console.log(`    only June: ${c.onlyJune.join(' | ')}`);
    if (c.onlyToday.length) console.log(`    only today: ${c.onlyToday.join(' | ')}`);
  }
}
