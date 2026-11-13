#!/usr/bin/env node
/**
 * G1.12: the census of the duplicated chemistry segment ids, and the byte-identity proof of the
 * re-extract (design docs/superpowers/specs/2026-11-12-g112-duplicate-segment-ids-design.md,
 * §3, §5.5, §7 items 1 and 2).
 *
 *   node test-results/g112-duplicate-ids-2026-11-12/verify-cut.mjs --base <ref> [--list]
 *
 * `--list` prints one `<chNN> <module>` line per module that holds a repeated id at <ref>.
 * Without it, the script prints the census on <ref>, compares the working tree with <ref>, and
 * ends with `RESULT: PASS` or `RESULT: FAIL`. The exit code is the verdict (0 = PASS).
 *
 * Read-only: the base side is read with `git show <ref>:<path>`, the working side from disk.
 * Nothing is written. CNXML shape is censused by parsing (xmldom), never by regex.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { DOMParser } from '@xmldom/xmldom';

process.exitCode = 1; // a verdict overwrites this; anything that stops short of one stays a failure

const require = createRequire(import.meta.url);
const { SEG_MARKER, parseSegmentRecords } = require('../../tools/lib/seg-markers.cjs');

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOK = 'efnafraedi-2e';
const BOOK_DIR = `books/${BOOK}`;
const SEGMENT_FILE = new RegExp(`^${BOOK_DIR}/02-for-mt/([^/]+)/(m\\d+)-segments\\.en\\.md$`);

// Spec §3 and §6 item 3: the measured population and the six wording-different Icelandic pairs.
const EXPECTED_IDS = 285;
const EXPECTED_MODULES = 83;
const EXPECTED_IS_DIFFER = [
  'ch03 m68700 fs-idp14642528',
  'ch08 m68747 fs-idm99049568',
  'ch12 m68795 fs-idm239441760',
  'ch14 m68808 fs-idm119337184',
  'ch16 m68817 fs-idm140480768',
  'ch20 m68846 fs-idp53499344',
];

const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: REPO_ROOT, maxBuffer: 512 * 1024 * 1024, ...opts });
const gitText = (args) => git(args, { encoding: 'utf8' });
const show = (sha, file) => git(['show', `${sha}:${file}`]); // a Buffer
const lsTree = (sha, dir) =>
  gitText(['ls-tree', '-r', '--name-only', sha, '--', dir]).split('\n').filter(Boolean);

/**
 * Split a segment file into its blocks on the raw text: a block runs from one SEG marker up to the
 * next (or EOF). `prefix` is whatever precedes the first marker.
 * @returns {{prefix: string, blocks: Array<{id: string, text: string}>}}
 */
function splitBlocks(text) {
  const re = new RegExp(SEG_MARKER.source, 'g');
  const matches = [...text.matchAll(re)];
  const prefix = matches.length ? text.slice(0, matches[0].index) : text;
  const blocks = matches.map((m, i) => ({
    id: m[1],
    text: text.slice(m.index, i + 1 < matches.length ? matches[i + 1].index : text.length),
  }));
  return { prefix, blocks };
}

/** Ids occurring more than once in the records, in first-seen order, with their occurrence count. */
function repeated(records) {
  const counts = new Map();
  for (const r of records) counts.set(r.segmentId, (counts.get(r.segmentId) || 0) + 1);
  return [...counts].filter(([, n]) => n > 1);
}

/** Keep the first occurrence of each value, order otherwise unchanged. */
const keepFirst = (list) => list.filter((v, i) => list.indexOf(v) === i);

/** Every element of a parsed document whose `id` attribute is `id` (a full walk, no getElementById). */
function elementsWithId(doc, id) {
  const found = [];
  const walk = (node) => {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType !== 1) continue;
      if (c.getAttribute('id') === id) found.push(c);
      walk(c);
    }
  };
  walk(doc);
  return found;
}

const decode = (buf, label) => {
  const text = buf.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(buf)) throw new Error(`${label}: not valid UTF-8`);
  return text;
};

function parseArgs(argv) {
  const i = argv.indexOf('--base');
  if (i < 0 || !argv[i + 1] || argv[i + 1].startsWith('--')) {
    throw new Error('usage: verify-cut.mjs --base <ref> [--list]');
  }
  return { base: argv[i + 1], list: argv.includes('--list') };
}

/** The affected modules at `sha`: Map<'chNN/module', {chDir, module, ids: Array<[id, count]>}>. */
function affectedAt(sha) {
  const affected = new Map();
  for (const file of lsTree(sha, `${BOOK_DIR}/02-for-mt`)) {
    const m = SEGMENT_FILE.exec(file);
    if (!m) continue;
    const [, chDir, module] = m;
    const ids = repeated(parseSegmentRecords(decode(show(sha, file), file)));
    if (ids.length) affected.set(`${chDir}/${module}`, { chDir, module, ids });
  }
  return new Map([...affected].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function main() {
  const { base, list } = parseArgs(process.argv.slice(2));
  const sha = gitText(['rev-parse', '--verify', `${base}^{commit}`]).trim();
  const affected = affectedAt(sha);

  if (list) {
    process.stdout.write([...affected.values()].map((a) => `${a.chDir} ${a.module}\n`).join(''));
    process.exitCode = 0;
    return;
  }

  const failures = [];
  const check = (ok, line) => {
    process.stdout.write(`${ok ? 'ok  ' : 'FAIL'}  ${line}\n`);
    if (!ok) failures.push(line);
  };
  const say = (line) => process.stdout.write(`      ${line}\n`);

  process.stdout.write(`G1.12 verify-cut\nbase: ${base} = ${sha}\n\n`);

  // ── Census on base (spec §7 item 1) ──────────────────────────────────────────────────────
  process.stdout.write(`== Census on base (${BOOK} 02-for-mt/*/m*-segments.en.md) ==\n`);
  const allIds = [...affected.values()].flatMap((a) => a.ids.map(([id, n]) => ({ a, id, n })));
  const occurrences = allIds.reduce((s, x) => s + x.n, 0);
  check(
    allIds.length === EXPECTED_IDS && affected.size === EXPECTED_MODULES,
    `duplicated ids: ${allIds.length} ids in ${affected.size} modules (expected ${EXPECTED_IDS} in ${EXPECTED_MODULES})`
  );
  check(
    allIds.every((x) => x.n === 2),
    `occurrences: ${occurrences} (every duplicated id occurs exactly twice: ${allIds.every((x) => x.n === 2)})`
  );
  const inAppendices = [...affected.values()].filter((a) => a.chDir === 'appendices').length;
  check(inAppendices === 0, `affected modules in appendices: ${inAppendices}`);
  const segmentTypes = new Map();
  for (const x of allIds) {
    const type = x.id.split(':')[1];
    segmentTypes.set(type, (segmentTypes.get(type) || 0) + 1);
  }
  check(
    segmentTypes.size === 1 && segmentTypes.get('para') === allIds.length,
    `segment type: ${JSON.stringify(Object.fromEntries(segmentTypes))}`
  );

  // Shape in 01-source.
  const docs = new Map();
  const sourceDoc = (a) => {
    const key = `${a.chDir}/${a.module}`;
    if (!docs.has(key)) {
      const file = `${BOOK_DIR}/01-source/${a.chDir}/${a.module}.cnxml`;
      docs.set(key, new DOMParser().parseFromString(decode(show(sha, file), file), 'text/xml'));
    }
    return docs.get(key);
  };
  let shapeOk = 0;
  const shapeBad = [];
  const exampleParents = new Map();
  for (const x of allIds) {
    const elementId = x.id.split(':').slice(2).join(':');
    const found = elementsWithId(sourceDoc(x.a), elementId);
    const el = found[0];
    const parent = el?.parentNode;
    const grand = parent?.parentNode;
    if (
      found.length === 1 &&
      el.localName === 'para' &&
      parent?.localName === 'note' &&
      grand?.localName === 'example'
    ) {
      shapeOk++;
      // A CNXML subsection is a section nested in a section.
      const up = grand.parentNode;
      const where =
        up?.localName === 'section' && up.parentNode?.localName === 'section'
          ? 'subsection'
          : (up?.localName ?? '(none)');
      exampleParents.set(where, (exampleParents.get(where) || 0) + 1);
    } else {
      shapeBad.push(
        `${x.a.chDir} ${x.a.module} ${elementId}: ${found.length} element(s), ` +
          `${el?.localName ?? '-'} < ${parent?.localName ?? '-'} < ${grand?.localName ?? '-'}`
      );
    }
  }
  check(
    shapeOk === allIds.length && shapeBad.length === 0,
    `01-source shape: ${shapeOk} of ${allIds.length} occur once, as a para whose parent is a note whose parent is an example`
  );
  say(
    `where the example sits: ${JSON.stringify(Object.fromEntries([...exampleParents].sort()))} (spec §3: 203 section, 61 directly in content, 21 subsection)`
  );
  for (const line of shapeBad.slice(0, 20)) say(`  ${line}`);

  // English copies, after normalising the placeholder numbers.
  const normEn = (s) => s.replace(/\[\[(MATH|MEDIA|TABLE):\d+\]\]/g, '[[$1]]');
  const normIs = (s) => s.replace(/\[\[(MATH):\d+\]\]/g, '[[$1]]');
  const copiesOf = (records, id) => records.filter((r) => r.segmentId === id).map((r) => r.content);
  let enRawDiffer = 0;
  const enNormDiffer = [];
  let isRawDiffer = 0;
  const isNormDiffer = [];
  const isCountBad = [];
  for (const a of affected.values()) {
    const en = parseSegmentRecords(
      decode(show(sha, `${BOOK_DIR}/02-for-mt/${a.chDir}/${a.module}-segments.en.md`), 'en')
    );
    const isFile = `${BOOK_DIR}/02-mt-output/${a.chDir}/${a.module}-segments.is.md`;
    const is = parseSegmentRecords(decode(show(sha, isFile), isFile));
    for (const [id] of a.ids) {
      const label = `${a.chDir} ${a.module} ${id.split(':').slice(2).join(':')}`;
      const e = copiesOf(en, id);
      if (new Set(e).size > 1) enRawDiffer++;
      if (new Set(e.map(normEn)).size > 1) enNormDiffer.push(label);
      const i = copiesOf(is, id);
      if (i.length !== e.length) isCountBad.push(`${label}: ${e.length} EN, ${i.length} IS`);
      if (new Set(i).size > 1) isRawDiffer++;
      if (new Set(i.map(normIs)).size > 1) isNormDiffer.push(label);
    }
  }
  check(
    enNormDiffer.length === 0,
    `English copies that differ: ${enRawDiffer} raw, ${enNormDiffer.length} after normalising [[MATH|MEDIA|TABLE:n]]`
  );
  for (const line of enNormDiffer.slice(0, 20)) say(`  ${line}`);
  check(
    isCountBad.length === 0,
    `Icelandic copies in 02-mt-output: every duplicated id has as many IS copies as EN copies (${isCountBad.length} not)`
  );
  for (const line of isCountBad.slice(0, 20)) say(`  ${line}`);
  check(
    isDeepStrictEqual(isNormDiffer, EXPECTED_IS_DIFFER),
    `Icelandic copies that differ: ${isRawDiffer} raw, ${isNormDiffer.length} after normalising [[MATH:n]] (expected the spec §6 item 3 six)`
  );
  for (const line of isNormDiffer) say(`  ${line}`);

  // ── Changed set ─────────────────────────────────────────────────────────────────────────
  process.stdout.write(`\n== Changed set (working tree against base, books/) ==\n`);
  const expected = new Set();
  for (const a of affected.values()) {
    expected.add(`${BOOK_DIR}/02-for-mt/${a.chDir}/${a.module}-segments.en.md`);
    expected.add(`${BOOK_DIR}/02-structure/${a.chDir}/${a.module}-manifest.json`);
  }
  const changed = new Set(
    gitText(['diff', '--name-only', sha, '--', 'books/']).split('\n').filter(Boolean)
  );
  const untracked = gitText(['ls-files', '--others', '--exclude-standard', '--', 'books/'])
    .split('\n')
    .filter(Boolean);
  const unexpected = [...changed].filter((f) => !expected.has(f)).sort();
  const missing = [...expected].filter((f) => !changed.has(f)).sort();
  check(
    unexpected.length === 0 && missing.length === 0,
    `git diff --name-only: ${changed.size} files; expected ${expected.size} (${affected.size} segment files + ${affected.size} manifests); unexpected ${unexpected.length}, missing ${missing.length}`
  );
  for (const f of unexpected.slice(0, 20)) say(`  unexpected: ${f}`);
  for (const f of missing.slice(0, 20)) say(`  missing: ${f}`);
  check(untracked.length === 0, `untracked files under books/: ${untracked.length}`);
  for (const f of untracked.slice(0, 20)) say(`  untracked: ${f}`);

  // ── Segment files ───────────────────────────────────────────────────────────────────────
  process.stdout.write(
    `\n== Segment files (each = base with every later block of a repeated id removed) ==\n`
  );
  const removedBy = new Map();
  let segOk = 0;
  const segBad = [];
  for (const a of affected.values()) {
    const file = `${BOOK_DIR}/02-for-mt/${a.chDir}/${a.module}-segments.en.md`;
    const { prefix, blocks } = splitBlocks(decode(show(sha, file), file));
    const seen = new Set();
    let removed = 0;
    let want = prefix;
    for (const b of blocks) {
      if (seen.has(b.id)) {
        removed++;
        continue;
      }
      seen.add(b.id);
      want += b.text;
    }
    removedBy.set(`${a.chDir}/${a.module}`, removed);
    const disk = join(REPO_ROOT, file);
    const have = existsSync(disk) ? readFileSync(disk) : null;
    const sameBytes = have !== null && have.equals(Buffer.from(want, 'utf8'));
    const stillRepeated = have === null ? -1 : repeated(parseSegmentRecords(decode(have, file)));
    const expectedRemoved = a.ids.reduce((s, [, n]) => s + n - 1, 0);
    if (sameBytes && stillRepeated.length === 0 && removed === expectedRemoved) segOk++;
    else {
      segBad.push(
        `${a.chDir}/${a.module}: bytes ${sameBytes ? 'equal' : 'DIFFER'}, ` +
          `repeated ids left ${stillRepeated === -1 ? 'file missing' : stillRepeated.length}, removed ${removed} of ${expectedRemoved}`
      );
    }
  }
  const totalRemoved = [...removedBy.values()].reduce((s, n) => s + n, 0);
  check(
    segOk === affected.size,
    `${segOk} of ${affected.size} segment files equal base minus the later blocks, byte for byte, with no repeated id (${totalRemoved} blocks removed)`
  );
  for (const line of segBad.slice(0, 20)) say(`  ${line}`);

  // ── Manifests ───────────────────────────────────────────────────────────────────────────
  process.stdout.write(
    `\n== Manifests (only extractedAt, segmentCount and segmentIds change) ==\n`
  );
  let manOk = 0;
  const manBad = [];
  const FREE = new Set(['extractedAt', 'segmentCount', 'segmentIds']);
  for (const a of affected.values()) {
    const file = `${BOOK_DIR}/02-structure/${a.chDir}/${a.module}-manifest.json`;
    const before = JSON.parse(decode(show(sha, file), file));
    const disk = join(REPO_ROOT, file);
    if (!existsSync(disk)) {
      manBad.push(`${a.chDir}/${a.module}: manifest missing`);
      continue;
    }
    const after = JSON.parse(readFileSync(disk, 'utf8'));
    const removed = removedBy.get(`${a.chDir}/${a.module}`);
    const problems = [];
    const keysBefore = Object.keys(before).sort();
    const keysAfter = Object.keys(after).sort();
    if (!isDeepStrictEqual(keysBefore, keysAfter)) problems.push('key set differs');
    for (const k of keysBefore) {
      if (!FREE.has(k) && !isDeepStrictEqual(before[k], after[k])) problems.push(`${k} differs`);
    }
    if (after.segmentCount !== before.segmentCount - removed) {
      problems.push(
        `segmentCount ${before.segmentCount} -> ${after.segmentCount}, removed ${removed}`
      );
    }
    if (!isDeepStrictEqual(after.segmentIds, keepFirst(before.segmentIds))) {
      problems.push('segmentIds is not base with later repeats removed');
    }
    if (before.segmentIds.length - keepFirst(before.segmentIds).length !== removed) {
      problems.push('base segmentIds repeats do not match the removed blocks');
    }
    const segFile = join(REPO_ROOT, `${BOOK_DIR}/02-for-mt/${a.chDir}/${a.module}-segments.en.md`);
    const segIds = existsSync(segFile)
      ? parseSegmentRecords(readFileSync(segFile, 'utf8')).map((r) => r.segmentId)
      : null;
    if (!isDeepStrictEqual(segIds, after.segmentIds)) {
      problems.push('segmentIds differs from the segment file it describes');
    }
    if (problems.length === 0) manOk++;
    else manBad.push(`${a.chDir}/${a.module}: ${problems.join('; ')}`);
  }
  check(
    manOk === affected.size,
    `${manOk} of ${affected.size} manifests differ from base only in extractedAt, segmentCount (base minus removed blocks) and segmentIds (later repeats removed, order kept, = the segment file's ids)`
  );
  for (const line of manBad.slice(0, 20)) say(`  ${line}`);

  // ── Everything else ─────────────────────────────────────────────────────────────────────
  process.stdout.write(`\n== Everything else in ${BOOK_DIR}/02-structure and 02-for-mt ==\n`);
  for (const dir of ['02-structure', '02-for-mt']) {
    const files = lsTree(sha, `${BOOK_DIR}/${dir}`).filter((f) => !expected.has(f));
    let same = 0;
    const differ = [];
    for (const f of files) {
      const disk = join(REPO_ROOT, f);
      if (existsSync(disk) && readFileSync(disk).equals(show(sha, f))) same++;
      else differ.push(f);
    }
    check(
      differ.length === 0,
      `${dir}: ${same} of ${files.length} other files byte-identical to base`
    );
    for (const f of differ.slice(0, 20)) say(`  differs: ${f}`);
  }

  process.stdout.write(`\nRESULT: ${failures.length === 0 ? 'PASS' : 'FAIL'}\n`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

try {
  main();
} catch (err) {
  process.stderr.write(`${err.stack || err}\n`);
}
