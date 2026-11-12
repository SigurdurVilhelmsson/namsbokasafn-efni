#!/usr/bin/env node
/**
 * Independent reference numbers for G1.23's checks 1 (the drop set) and 2 (chain integrity).
 *
 * This script must NOT load the view's own code: it is the oracle the view is later checked
 * against, so it re-implements the one-match rule and hard-codes the dropped category. It lives
 * under server/ because the integrity half uses the editor's loader (segmentParser), and the
 * MIT -> AGPL edge rule keeps that out of experiments/.
 *
 * Usage: node server/scripts/suggestion-view-references.js --out <dir> --date <YYYY-MM-DD>
 *
 * BOTH FLAGS ARE REQUIRED. A run missing either refuses before it reads the logs or writes
 * anything. A reference artifact is never written with an implicit date or into an implicit
 * directory: the integrity half reads the editor loader's served text from the CURRENT tree, so on
 * any tree after the one a reference was cut from, a run differs from that frozen reference. Until
 * G1.12 (2026-11-12) the flags were optional and defaulted to the frozen 2026-11-09 directory and
 * date, so a bare run after the re-extract would have overwritten that frozen file with post-G1.12
 * data, labelled 2026-11-09.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { sha256Text } = require('../lib/servedText');
const { loadModuleForEditing } = require('../services/segmentParser');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BOOK = 'efnafraedi-2e';
const DROPPED_CATEGORY = 'agreement';
const RULE =
  'drop every change in each (module, segmentId, rulingId) group, over all occurrences, that holds an agreement change';

/** Apply find -> replace only when find occurs exactly once; otherwise return null. */
function applyOnce(text, find, replace) {
  const at = text.indexOf(find);
  if (at < 0 || text.indexOf(find, at + 1) !== -1) return null;
  return text.slice(0, at) + replace + text.slice(at + find.length);
}

function chapterOfDir(name) {
  if (name === 'appendices') return -1;
  const m = /^ch(\d+)$/.exec(name);
  return m ? Number(m[1]) : null;
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

const USAGE =
  'usage: node server/scripts/suggestion-view-references.js --out <dir> --date <YYYY-MM-DD>';

/** A usage error: the CLI prints its message (no stack) and exits non-zero. */
function usageError(message) {
  const err = new Error(`${message}\n${USAGE}`);
  err.code = 'USAGE';
  return err;
}

/**
 * The value of `--date`. Refuses a missing flag, a flag with no value, and anything that is not a
 * real calendar date written YYYY-MM-DD.
 * @param {string[]} argv
 * @returns {string}
 */
function parseDateArg(argv) {
  const i = argv.indexOf('--date');
  if (i < 0) throw usageError('missing --date <YYYY-MM-DD> (required)');
  const value = argv[i + 1];
  const ok =
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!ok) throw usageError(`--date must be a calendar date written YYYY-MM-DD, got ${value}`);
  return value;
}

/**
 * The value of `--out`, resolved. Refuses a missing flag and a flag with no value.
 * @param {string[]} argv
 * @returns {string}
 */
function parseOutArg(argv) {
  const i = argv.indexOf('--out');
  if (i < 0) throw usageError('missing --out <dir> (required)');
  const value = argv[i + 1];
  if (typeof value !== 'string' || value === '' || value.startsWith('--')) {
    throw usageError(`--out needs a directory, got ${value}`);
  }
  return path.resolve(value);
}

/**
 * @param {object} opts
 * @param {string} opts.booksRoot books directory; logs are read from <booksRoot>/<book>/02-mt-revised
 * @param {string} opts.book
 * @param {function(string, number, string): {segments: Array}} [opts.load] served-text loader
 * @param {string|null} [opts.layer2Commit]
 * @param {string|null} [opts.date] the build date recorded in the output (the CLI requires one)
 */
function buildReferences({
  booksRoot,
  book,
  load = loadModuleForEditing,
  layer2Commit = null,
  date = null,
}) {
  const root = path.join(booksRoot, book, '02-mt-revised');
  const records = [];
  let logs = 0;
  let emptyLogs = 0;
  for (const dirName of fs.readdirSync(root).sort()) {
    const dir = path.join(root, dirName);
    if (!fs.statSync(dir).isDirectory()) continue;
    const chapter = chapterOfDir(dirName);
    if (chapter === null) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith('-changes.jsonl')) continue;
      const moduleId = f.slice(0, -'-changes.jsonl'.length);
      logs++;
      const lines = fs
        .readFileSync(path.join(dir, f), 'utf8')
        .split('\n')
        .filter((l) => l.trim());
      if (lines.length === 0) emptyLogs++;
      for (const line of lines) records.push({ chapter, moduleId, ...JSON.parse(line) });
    }
  }

  // Chains per module on (segmentId, occurrence), in file order.
  const chains = new Map();
  for (const r of records) {
    const k = `${r.chapter}\u0000${r.moduleId}\u0000${r.segmentId}\u0000${r.occurrence}`;
    if (!chains.has(k)) chains.set(k, []);
    chains.get(k).push(r);
  }

  // Integrity: first record of each chain against the served text, before any drop.
  const servedCache = new Map();
  const served = (chapter, moduleId) => {
    const k = `${chapter}\u0000${moduleId}`;
    if (!servedCache.has(k)) {
      const byId = new Map();
      for (const s of load(book, chapter, moduleId).segments) {
        if (!byId.has(s.segmentId)) byId.set(s.segmentId, []);
        byId.get(s.segmentId).push(s.is);
      }
      servedCache.set(k, byId);
    }
    return servedCache.get(k);
  };
  const integrityFailures = [];
  for (const list of chains.values()) {
    const first = list[0];
    const texts = served(first.chapter, first.moduleId).get(first.segmentId);
    const text = texts ? texts[first.occurrence] : undefined;
    if (typeof text !== 'string' || sha256Text(text) !== first.beforeSha256) {
      integrityFailures.push({
        chapter: first.chapter,
        module: first.moduleId,
        segmentId: first.segmentId,
        occurrence: first.occurrence,
      });
    }
  }
  integrityFailures.sort(
    (a, b) =>
      a.chapter - b.chapter ||
      cmp(a.module, b.module) ||
      cmp(a.segmentId, b.segmentId) ||
      a.occurrence - b.occurrence
  );

  // The drop rule.
  const groupOf = (r) => `${r.chapter}\u0000${r.moduleId}\u0000${r.segmentId}\u0000${r.rulingId}`;
  const droppedGroups = new Set(
    records.filter((r) => r.category === DROPPED_CATEGORY).map(groupOf)
  );
  const droppedRecs = records.filter((r) => droppedGroups.has(groupOf(r)));
  const keptRecs = records.filter((r) => !droppedGroups.has(groupOf(r)));
  const byCategory = {};
  for (const r of droppedRecs) byCategory[r.category] = (byCategory[r.category] || 0) + 1;

  const droppedChanges = droppedRecs
    .map((r) => ({
      chapter: r.chapter,
      module: r.moduleId,
      segmentId: r.segmentId,
      occurrence: r.occurrence,
      opId: r.opId,
      category: r.category,
      rulingId: r.rulingId,
    }))
    .sort((a, b) => cmp(a.opId, b.opId));

  // Cross-group dependence: a kept record whose find does not match exactly once after only the
  // earlier kept records of its own ruling were applied to the chain's first `before`.
  const crossGroupDependent = [];
  for (const list of chains.values()) {
    list.forEach((r, i) => {
      if (droppedGroups.has(groupOf(r))) return;
      let text = list[0].before;
      for (const e of list.slice(0, i)) {
        if (e.rulingId !== r.rulingId || droppedGroups.has(groupOf(e))) continue;
        const next = applyOnce(text, e.find, e.replace);
        if (next !== null) text = next;
      }
      if (applyOnce(text, r.find, r.replace) === null) crossGroupDependent.push(r.opId);
    });
  }
  crossGroupDependent.sort();

  return {
    date,
    layer2Commit,
    rule: RULE,
    totals: { records: records.length, logs, emptyLogs, chains: chains.size },
    dropped: { groups: droppedGroups.size, changes: droppedRecs.length, byCategory },
    droppedChanges,
    kept: {
      changes: keptRecs.length,
      changesWithoutChapterMetadata: keptRecs.filter((r) => r.moduleId !== 'chapter-metadata')
        .length,
    },
    integrityFailures,
    crossGroupDependent,
  };
}

function main(argv) {
  // Both flags are checked before anything is read or written (see the header).
  const outDir = parseOutArg(argv);
  const date = parseDateArg(argv);
  const layer2Commit = execFileSync(
    'git',
    ['log', '-1', '--format=%H', '--', `books/${BOOK}/02-mt-revised`],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  ).trim();
  const out = buildReferences({
    booksRoot: path.resolve(__dirname, '../../books'),
    book: BOOK,
    layer2Commit,
    date,
  });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'references.json'), JSON.stringify(out, null, 2) + '\n');
  process.stdout.write(
    JSON.stringify({
      totals: out.totals,
      dropped: out.dropped,
      kept: out.kept,
      integrityFailures: out.integrityFailures,
      crossGroupDependent: out.crossGroupDependent,
    }) + '\n'
  );
}

if (require.main === module) {
  process.exitCode = 1;
  try {
    main(process.argv.slice(2));
    process.exitCode = 0;
  } catch (err) {
    process.stderr.write(`${err.code === 'USAGE' ? err.message : err.stack || err}\n`);
  }
}

module.exports = { buildReferences, applyOnce, parseDateArg, parseOutArg };
