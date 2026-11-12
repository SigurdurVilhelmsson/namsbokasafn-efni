#!/usr/bin/env node
/**
 * G1.12 Task 3b: generate `books/efnafraedi-2e/g112-unserved-copies.json`, the FROZEN list of the
 * Icelandic copies the re-MT battery must expect to be unserved (design
 * docs/superpowers/specs/2026-11-12-g112-duplicate-segment-ids-design.md §3, §5.2-§5.3; ledger
 * Ruling 10).
 *
 *   node test-results/g112-duplicate-ids-2026-11-12/make-unserved-list.mjs
 *
 * Candidates: every id that occurs more than once in a chemistry `02-for-mt/<ch>/m*-segments.en.md`
 * at the branch start (`git show 69cc289c9:<path>`). Kept: the candidates whose CURRENT committed
 * English count (`git show HEAD:<path>`) is 1 and whose committed Icelandic count
 * (`02-mt-output/<ch>/<m>-segments.is.md`) is 2. Every dropped candidate is printed, and the run
 * fails if any is dropped, if the totals are not 285 entries in 83 modules, or if the file read
 * back is not byte-identical to what was meant to be written.
 *
 * Deterministic: entries sorted by chapterDir, moduleId, segmentId; 2-space indent; trailing
 * newline. Writes nothing else. The exit code is the verdict (1 until the file is written and
 * verified).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

process.exitCode = 1;

const require = createRequire(import.meta.url);
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { parseSegmentRecords } = require(path.join(REPO_ROOT, 'tools', 'lib', 'seg-markers.cjs'));

const BASE = '69cc289c9';
const BOOK_DIR = 'books/efnafraedi-2e';
const OUT = path.join(REPO_ROOT, BOOK_DIR, 'g112-unserved-copies.json');
const SEGMENT_FILE = new RegExp(`^${BOOK_DIR}/02-for-mt/([^/]+)/(m\\d+)-segments\\.en\\.md$`);
// Spec §3: the measured population.
const EXPECTED_ENTRIES = 285;
const EXPECTED_MODULES = 83;
const WHY =
  'G1.12 (docs/superpowers/specs/2026-11-12-g112-duplicate-segment-ids-design.md §3): after the ' +
  're-extract each nested-note paragraph is emitted once in English while the bought MT keeps ' +
  'both Icelandic copies, so the second copy is unserved and the re-MT battery (A2b, A3) must ' +
  'expect exactly these.';

const git = (args) =>
  execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });

/** id -> occurrence count. */
function counts(text) {
  const m = new Map();
  for (const r of parseSegmentRecords(text)) m.set(r.segmentId, (m.get(r.segmentId) || 0) + 1);
  return m;
}

function main() {
  const head = git(['rev-parse', 'HEAD']).trim();
  const base = git(['rev-parse', '--verify', `${BASE}^{commit}`]).trim();
  const files = git(['ls-tree', '-r', '--name-only', base, '--', `${BOOK_DIR}/02-for-mt`])
    .split('\n')
    .filter((f) => SEGMENT_FILE.test(f));

  const entries = [];
  const dropped = [];
  let candidates = 0;
  for (const f of files) {
    const [, chapterDir, moduleId] = SEGMENT_FILE.exec(f);
    const repeated = [...counts(git(['show', `${base}:${f}`]))].filter(([, n]) => n > 1);
    if (repeated.length === 0) continue;
    const enNow = counts(git(['show', `HEAD:${f}`]));
    const isPath = `${BOOK_DIR}/02-mt-output/${chapterDir}/${moduleId}-segments.is.md`;
    const isNow = counts(git(['show', `HEAD:${isPath}`]));
    for (const [segmentId, baseCount] of repeated) {
      candidates++;
      const en = enNow.get(segmentId) || 0;
      const is = isNow.get(segmentId) || 0;
      if (en === 1 && is === 2) entries.push({ chapterDir, moduleId, segmentId });
      else dropped.push(`${chapterDir} ${segmentId}: base EN ${baseCount}, HEAD EN ${en}, IS ${is}`);
    }
  }

  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  entries.sort(
    (a, b) =>
      cmp(a.chapterDir, b.chapterDir) || cmp(a.moduleId, b.moduleId) || cmp(a.segmentId, b.segmentId)
  );
  const doc = { schema: 1, baseCommit: BASE, why: WHY, entries };
  const text = JSON.stringify(doc, null, 2) + '\n';
  fs.writeFileSync(OUT, text);

  // ── verify what was written ──────────────────────────────────────────────────────────────
  const problems = [];
  const back = fs.readFileSync(OUT, 'utf8');
  if (back !== text) problems.push('the file read back differs from what was written');
  const parsed = JSON.parse(back);
  const modules = new Set(parsed.entries.map((e) => e.moduleId));
  const keys = new Set(parsed.entries.map((e) => `${e.moduleId}\t${e.segmentId}`));
  if (parsed.entries.length !== EXPECTED_ENTRIES)
    problems.push(`${parsed.entries.length} entries, expected ${EXPECTED_ENTRIES}`);
  if (modules.size !== EXPECTED_MODULES)
    problems.push(`${modules.size} modules, expected ${EXPECTED_MODULES}`);
  if (keys.size !== parsed.entries.length) problems.push('duplicate (moduleId, segmentId) entries');
  if (dropped.length) problems.push(`${dropped.length} candidate(s) dropped`);
  if (candidates !== entries.length + dropped.length) problems.push('candidate arithmetic');
  for (const e of parsed.entries)
    if (!e.segmentId.startsWith(`${e.moduleId}:`)) problems.push(`${e.segmentId} not in ${e.moduleId}`);

  const lines = [
    'G1.12 make-unserved-list',
    `base: ${BASE} = ${base}`,
    `head: ${head}`,
    `base EN segment files: ${files.length}; candidates (ids repeated at base): ${candidates}`,
    `kept (HEAD EN 1, IS 2): ${entries.length} in ${modules.size} modules; dropped: ${dropped.length}`,
    ...dropped.map((d) => `  dropped ${d}`),
    `wrote ${path.relative(REPO_ROOT, OUT)} (${Buffer.byteLength(text)} bytes)`,
    ...problems.map((p) => `PROBLEM: ${p}`),
    `RESULT: ${problems.length ? 'FAIL' : 'PASS'}`,
  ];
  process.stdout.write(lines.join('\n') + '\n');
  process.exitCode = problems.length ? 1 : 0;
}

main();
