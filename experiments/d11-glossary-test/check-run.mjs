#!/usr/bin/env node
/**
 * D11: check ONE bought run (read-only, free).
 *
 *   node experiments/d11-glossary-test/check-run.mjs <tree-dir>
 *
 * The arm comes from <tree-dir>/ARM, written by prepare-run.sh. For each module it checks:
 * the sidecar's tool, glossary arm, wire, term count and content hash against the arm's
 * expected values; the chunk counts (every chunk carried the glossary for M and S, none did
 * for no glossary: a truncation retry drops the glossary, DESIGN §7); and that the MT file
 * carries the same SEG id SET as the English (a set, never a count: the MT can rewrite an
 * id's digits). It prints the billed units and writes <tree-dir>/check.json.
 *
 * Exit 0 only when every check passes. The exit code starts as a failure and only a
 * reached verdict clears it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { parseSegmentsMap } = require('../../tools/lib/seg-markers.cjs');

process.exitCode = 1;

/** Expected sidecar values per arm. The hashes are glossaryContentHash() of each wire's glossary. */
export const EXPECT = {
  M: {
    arm: 'glossary',
    wire: 'june',
    termCount: 617,
    contentHash: 'f15401b2f551d4d89a9f6d8f3ea1e2a20e6a92772ed6c90d07ebe9ae6669735c',
    glossaryInEveryChunk: true,
  },
  S: {
    arm: 'glossary',
    wire: 'today',
    termCount: 590,
    contentHash: '9071d8529bccf06bff8b94067e3d27854c0102dd665bcdadbd2c77afaded7252',
    glossaryInEveryChunk: true,
  },
  none: {
    arm: 'no-glossary',
    wire: null,
    termCount: null,
    contentHash: null,
    glossaryInEveryChunk: false,
  },
};

export const MODULES = [
  { id: 'm68781', ch: 'ch11', chunks: 1 },
  { id: 'm68667', ch: 'ch01', chunks: 2 },
];

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const show = (v) => JSON.stringify(v);

/** All checks for one module of one tree, as {name, ok, got, want}. */
export function checkModule(tree, arm, mod) {
  const want = EXPECT[arm];
  const book = path.join(tree, 'books', 'efnafraedi-2e');
  const sidecarPath = path.join(book, '02-mt-output', mod.ch, `${mod.id}-provenance.json`);
  const isPath = path.join(book, '02-mt-output', mod.ch, `${mod.id}-segments.is.md`);
  const enPath = path.join(book, '02-for-mt', mod.ch, `${mod.id}-segments.en.md`);
  const checks = [];
  const check = (name, got, expected) =>
    checks.push({ name, ok: show(got) === show(expected), got, want: expected });

  for (const p of [sidecarPath, isPath, enPath]) {
    if (!fs.existsSync(p)) {
      checks.push({
        name: `exists ${path.relative(tree, p)}`,
        ok: false,
        got: 'missing',
        want: 'present',
      });
    }
  }
  if (checks.length > 0) return { checks, usage: null, estimatedIsk: null };

  const sidecar = readJson(sidecarPath);
  const g = sidecar.run?.glossary ?? {};
  check('tool', sidecar.tool, 'api-translate');
  check('glossary.arm', g.arm, want.arm);
  // A missing key means "not recorded" (a tool older than 2026-10-25), never null.
  check('glossary.wire key present', Object.hasOwn(g, 'wire'), true);
  check('glossary.wire', g.wire, want.wire);
  check('glossary.termCount', g.termCount, want.termCount);
  check('glossary.contentHash', g.contentHash, want.contentHash);
  check('glossary.chunksTotal', g.chunksTotal, mod.chunks);
  check(
    'glossary.chunksWithGlossary',
    g.chunksWithGlossary,
    want.glossaryInEveryChunk ? g.chunksTotal : 0
  );

  const enIds = new Set(parseSegmentsMap(fs.readFileSync(enPath, 'utf8')).keys());
  const isIds = new Set(parseSegmentsMap(fs.readFileSync(isPath, 'utf8')).keys());
  const missing = [...enIds].filter((id) => !isIds.has(id));
  const extra = [...isIds].filter((id) => !enIds.has(id));
  checks.push({
    name: 'SEG id set (MT = English)',
    ok: enIds.size > 0 && missing.length === 0 && extra.length === 0,
    got: { en: enIds.size, is: isIds.size, missing: missing.slice(0, 5), extra: extra.slice(0, 5) },
    want: 'the same ids',
  });

  return {
    checks,
    usage: sidecar.run?.usage ?? null,
    estimatedIsk: sidecar.run?.estimatedIsk ?? null,
  };
}

function main() {
  const tree = process.argv[2];
  if (!tree) {
    console.error('usage: node check-run.mjs <tree-dir>');
    return;
  }
  const armFile = path.join(tree, 'ARM');
  if (!fs.existsSync(armFile)) {
    console.error(`FAIL: ${armFile} is missing. Was the tree made by prepare-run.sh?`);
    return;
  }
  const arm = fs.readFileSync(armFile, 'utf8').trim();
  if (!EXPECT[arm]) {
    console.error(`FAIL: ${armFile} says '${arm}', which is not M, S or none.`);
    return;
  }

  const modules = MODULES.map((mod) => ({ module: mod.id, ...checkModule(tree, arm, mod) }));
  const pass = modules.every((m) => m.checks.every((c) => c.ok));

  console.log(`${path.basename(path.resolve(tree))} (arm ${arm})`);
  for (const m of modules) {
    for (const c of m.checks) {
      const detail = c.ok ? show(c.got) : `got ${show(c.got)}, want ${show(c.want)}`;
      console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${m.module} ${c.name}: ${detail}`);
    }
    console.log(
      `       ${m.module} billed units: ${show(m.usage)} (estimate ${show(m.estimatedIsk)} ISK)`
    );
  }
  console.log(pass ? 'PASS' : 'FAIL');

  fs.writeFileSync(
    path.join(tree, 'check.json'),
    JSON.stringify(
      { tree: path.resolve(tree), arm, checkedAt: new Date().toISOString(), pass, modules },
      null,
      2
    ) + '\n'
  );
  process.exitCode = pass ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
