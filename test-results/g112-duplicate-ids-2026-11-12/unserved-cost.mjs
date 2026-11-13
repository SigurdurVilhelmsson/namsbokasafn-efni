#!/usr/bin/env node
/**
 * G1.12, spec §6 item 2: what the 285 unserved Icelandic copies cost, on two bases.
 *
 *   node test-results/g112-duplicate-ids-2026-11-12/unserved-cost.mjs --base <ref>
 *
 * The Icelandic copies were bought from the English that `<ref>` (the last commit before G1.12)
 * still holds twice. For every entry of the frozen list `books/efnafraedi-2e/g112-unserved-copies.json`
 * this cuts the SECOND English block of that id out of `git show <ref>:` and measures it:
 *
 *   - a block runs from its SEG marker line to the next marker (or EOF), as in verify-cut.mjs, so
 *     it carries the marker line and the blank line after the text;
 *   - CEILING basis: the block's raw length. This is what `api-translate --dry-run` counts
 *     (`content.length` of the whole file, marker lines included, so JS string length, i.e.
 *     UTF-16 code units). UTF-8 bytes are printed alongside;
 *   - EXPECTATION basis (register §C91 ①): raw − marker lines − 1 newline per segment. Read here as
 *     raw − (the marker line, its own newline included) − 1, which leaves the text plus one newline;
 *   - both converted with `estimateIsk` from `tools/lib/malstadur-api.js` (the function
 *     `tools/api-translate.js` imports for its dry-run estimate).
 *
 * Controls: the cut must find exactly two English blocks per listed id at `<ref>` and one at HEAD;
 * the summed raw length must equal Σ(len(file at <ref>) − len(file at HEAD)) over the 83 files,
 * because each changed file equals the base file minus these blocks (verify-cut.txt).
 *
 * Read-only. The exit code is 1 until the result is printed.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { estimateIsk, ISK_PER_1000_CHARS } from '../../tools/lib/malstadur-api.js';

process.exitCode = 1;

const require = createRequire(import.meta.url);
const { SEG_MARKER } = require('../../tools/lib/seg-markers.cjs');

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOK_DIR = 'books/efnafraedi-2e';
const argv = process.argv.slice(2);
const base = argv[argv.indexOf('--base') + 1];
if (!argv.includes('--base') || !base || base.startsWith('--')) {
  console.error('usage: unserved-cost.mjs --base <ref>');
  process.exit(2); // nothing has been written to stdout yet
}

const git = (args) =>
  execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
const baseSha = git(['rev-parse', base]).trim();
const headSha = git(['rev-parse', 'HEAD']).trim();

function splitBlocks(text) {
  const matches = [...text.matchAll(new RegExp(SEG_MARKER.source, 'g'))];
  return matches.map((m, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    return { id: m[1], marker: m[0], text: text.slice(m.index, end) };
  });
}

const list = JSON.parse(
  readFileSync(join(REPO_ROOT, BOOK_DIR, 'g112-unserved-copies.json'), 'utf8')
);
const byFile = new Map();
for (const e of list.entries) {
  const f = `${BOOK_DIR}/02-for-mt/${e.chapterDir}/${e.moduleId}-segments.en.md`;
  if (!byFile.has(f)) byFile.set(f, []);
  byFile.get(f).push(e.segmentId);
}

const t = { blocks: 0, raw: 0, bytes: 0, marker: 0, expectation: 0, textTrim: 0, firstTextTrim: 0 };
let fileDelta = 0;
const problems = [];
for (const [f, ids] of byFile) {
  const baseText = git(['show', `${baseSha}:${f}`]);
  const headText = git(['show', `${headSha}:${f}`]);
  fileDelta += baseText.length - headText.length;
  const baseBlocks = splitBlocks(baseText);
  const headIds = splitBlocks(headText).map((b) => b.id);
  for (const id of ids) {
    const copies = baseBlocks.filter((b) => b.id === id);
    const headCount = headIds.filter((x) => x === id).length;
    if (copies.length !== 2 || headCount !== 1) {
      problems.push(`${f} ${id}: ${copies.length} base copies, ${headCount} at HEAD`);
      continue;
    }
    const second = copies[1];
    // The marker line, its own newline included.
    const nl = second.text.indexOf('\n');
    const markerLine = nl >= 0 ? nl + 1 : second.text.length;
    t.blocks += 1;
    t.raw += second.text.length;
    t.bytes += Buffer.byteLength(second.text, 'utf8');
    t.marker += markerLine;
    t.expectation += second.text.length - markerLine - 1;
    t.textTrim += second.text.slice(markerLine).trim().length;
    t.firstTextTrim += copies[0].text.slice(copies[0].text.indexOf('\n') + 1).trim().length;
  }
}

const isk = (n) => estimateIsk(n).toFixed(2);
const out = [
  'G1.12 unserved-copies cost (spec §6 item 2)',
  `base ${base} = ${baseSha}; HEAD = ${headSha}`,
  `list: ${list.entries.length} entries in ${byFile.size} files; rate ISK_PER_1000_CHARS = ${ISK_PER_1000_CHARS}`,
  '',
  `blocks cut (second English copy of each listed id at base): ${t.blocks}`,
  `control: Σ(len at base − len at HEAD) over the ${byFile.size} files = ${fileDelta}; Σ raw block length = ${t.raw}; equal: ${fileDelta === t.raw}`,
  `problems: ${problems.length}`,
  ...problems.map((p) => `  ${p}`),
  '',
  `CEILING (raw block, marker line included; --dry-run's unit, JS string length): ${t.raw} chars = ${isk(t.raw)} ISK`,
  `  the same blocks in UTF-8 bytes: ${t.bytes}`,
  `EXPECTATION (§C91 ①: raw − marker lines incl. their newline − 1 newline per segment): ${t.expectation} chars = ${isk(t.expectation)} ISK`,
  `  marker lines removed: ${t.marker} chars over ${t.blocks} blocks`,
  `text only, trimmed (second copies): ${t.textTrim} chars; first copies: ${t.firstTextTrim} chars`,
];
process.stdout.write(out.join('\n') + '\n');
process.exitCode =
  problems.length === 0 && fileDelta === t.raw && t.blocks === list.entries.length ? 0 : 1;
