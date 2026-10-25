/**
 * D11's free oracle (test 5 of the build brief): on the two D11 modules, the June-wire mode puts on
 * the wire exactly what `experiments/d11-glossary-test/wire-compare.mjs` measured offline on
 * 2026-10-24 (`results/2026-10-24/wire-compare.json`), and today's mode does too.
 *
 * WHY THROUGH translateModule. The offline script called the two June functions directly. This test
 * goes through the path a paid run takes (the loader, `translateModule`, `translateSegmentText`,
 * `translateChunk`), with a stub client that echoes the text and records each request's glossary.
 * So it checks the wiring between the flag's pieces, not just the pieces.
 *
 * UNIT: distinct `sourceWord → targetWord` pairs per API call (one call per chunk), the unit the
 * oracle counted (`new Set`). The oracle stores each wire's count and the two set differences; with
 * `today − june = ∅` and `june − today = onlyJune` exactly, June's whole list is pinned.
 *
 * ⚠️ TIED TO THE ENGLISH AT `1c61e9c42`. The oracle measured `books/efnafraedi-2e/02-for-mt` as last
 * changed there (2026-09-28). The first test pins each chunk's length to the oracle's, so a
 * re-extraction that changes these modules turns this file red for a legitimate reason: regenerate
 * the oracle with wire-compare.mjs, then re-check. D11's own re-extraction happens in a scratch tree.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGlossary, splitAtSegBoundaries, translateModule } from '../api-translate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const MARCH_DIR = path.join(HERE, 'fixtures', 'd11-march-glossary-5db701c92');
const ORACLE = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'experiments/d11-glossary-test/results/2026-10-24/wire-compare.json'),
    'utf8'
  )
);
// wire-compare.mjs split at 25000, the tool's default chunk size; pass it explicitly so a change
// to the default cannot silently move this test off the oracle.
const MAX_CHUNK = 25000;
const enPath = (rel) => path.join(REPO, 'books/efnafraedi-2e/02-for-mt', `${rel}-segments.en.md`);
const pair = (t) => `${t.sourceWord} → ${t.targetWord}`;

/** Run one module through translateModule and return the pairs sent, per API call. */
async function wirePairs(rel, wire) {
  const glossary = loadGlossary(MARCH_DIR, 'chemistry', { wire });
  const sent = [];
  const client = {
    translateAuto: async (text, opts) => {
      sent.push(new Set((opts.glossaries?.[0]?.terms ?? []).map(pair)));
      return { text, usage: { units: text.length, cost: 0 } };
    },
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd11-oracle-'));
  try {
    const out = path.join(dir, `${path.basename(rel)}-segments.is.md`);
    await translateModule(client, enPath(rel), out, glossary, false, MAX_CHUNK, {
      glossaryArm: 'glossary',
      glossaryWire: wire,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return sent;
}

const minus = (a, b) => [...a].filter((x) => !b.has(x)).sort();

describe.each(ORACLE.modules)('the wire on $module matches the 2026-10-24 oracle', (mod) => {
  it('reads the English the oracle measured (chunk count and lengths)', () => {
    const chunks = splitAtSegBoundaries(fs.readFileSync(enPath(mod.module), 'utf8'), MAX_CHUNK);
    expect(chunks.map((c) => c.length)).toEqual(mod.perChunk.map((c) => c.chars));
  });

  it("today's wire sends the oracle's today count per chunk", async () => {
    const today = await wirePairs(mod.module, 'today');
    expect(today.map((s) => s.size)).toEqual(mod.perChunk.map((c) => c.today));
  });

  it("June's wire sends the oracle's June count per chunk", async () => {
    const june = await wirePairs(mod.module, 'june');
    expect(june.map((s) => s.size)).toEqual(mod.perChunk.map((c) => c.june));
  });

  it("June's wire sends exactly the oracle's June-only pairs, and today's sends nothing June's does not", async () => {
    const today = await wirePairs(mod.module, 'today');
    const june = await wirePairs(mod.module, 'june');
    expect(june.map((s, i) => minus(s, today[i]))).toEqual(
      mod.perChunk.map((c) => [...c.onlyJune].sort())
    );
    expect(today.map((s, i) => minus(s, june[i]))).toEqual(
      mod.perChunk.map((c) => [...c.onlyToday].sort())
    );
  });
});
