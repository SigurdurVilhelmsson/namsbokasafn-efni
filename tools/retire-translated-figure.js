#!/usr/bin/env node

/**
 * Retire a figure's translated copy, then prune published copies nothing references (§C140 ㊵).
 *
 * A retirement is a ruling recorded in the figure config's `retiredFigures` table. This tool only
 * carries it out, in two steps, because pages must not change before the whole-book re-render
 * (② — design docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md, D14):
 *
 *   --retire <names>  removes each figure's image-mapping row and its translated copy at the top
 *                     of the book's media folder. It never touches 03-translated or 05-publication,
 *                     so every page keeps its image until it is re-injected and re-rendered. It
 *                     reports every page and CNXML file that still references the copy; run it
 *                     again later as a dry run, and once nothing references a figure it says so.
 *   --prune           after that re-render: deletes each published translated copy that no
 *                     mapping row names and nothing references.
 *
 * Both are DRY RUNS unless --apply is given. Every file deleted is one git tracks unmodified, so
 * git is the backup; a failure part-way restores the mapping and every file already deleted.
 *
 * Usage:
 *   node tools/retire-translated-figure.js --book <slug> --retire <name>[,<name>…] [--apply]
 *   node tools/retire-translated-figure.js --book <slug> --prune [--apply]
 *
 * Exit: 0 done, or the plan printed with nothing refused · 1 refused, or failed and restored ·
 * 2 usage.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_SUFFIX, indexBookSourceBasenames } from './generate-image-mapping.js';
import { escapesMediaDir } from './publish-figure-svg.js';
import { loadRetiredFigures } from './lib/figure-text-config.js';
import {
  runGit,
  readMappingOrRefuse,
  topLevelTranslatedCopies,
  publishedCopies,
  referenceNeedle,
  findReferences,
  cleanTrackedSet,
  locate,
  writeAtomically,
  restoreFromHead,
} from './lib/translated-figure-refs.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every flag this tool accepts. An argv token outside it is a typo, not a no-op. */
const KNOWN_FLAGS = new Set(['--book', '--retire', '--prune', '--apply', '--help', '-h']);
const VALUED_FLAGS = new Set(['--book', '--retire']);

const USAGE = `Usage:
  node tools/retire-translated-figure.js --book <slug> --retire <name>[,<name>…] [--apply]
  node tools/retire-translated-figure.js --book <slug> --prune [--apply]
A dry run unless --apply is given.
Design: docs/superpowers/specs/2026-10-01-c140-c40-retire-and-pins-design.md`;

/** A usage refusal. Exit 2. */
export class CliError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliError';
    this.code = 2;
  }
}

/**
 * Parse argv, REFUSING anything unrecognised: tools/lib/parseArgs.js silently drops unknown
 * flags, which would turn a typo such as `--dryrun` into a real run.
 * @returns {{book:string|null, retire:string[]|null, prune:boolean, apply:boolean, help:boolean}}
 */
export function parseCli(argv) {
  const args = { book: null, retire: null, prune: false, apply: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!KNOWN_FLAGS.has(token)) {
      throw new CliError(`Unknown argument: ${token}\nKnown: ${[...KNOWN_FLAGS].sort().join(' ')}`);
    }
    if (!VALUED_FLAGS.has(token)) {
      if (token === '--prune') args.prune = true;
      else if (token === '--apply') args.apply = true;
      else args.help = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new CliError(
        `${token} needs a value, and got ${value === undefined ? 'nothing' : JSON.stringify(value)}`
      );
    }
    i += 1;
    if (token === '--book') args.book = value;
    else
      args.retire = [
        ...(args.retire ?? []),
        ...value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ];
  }
  if (args.help) return args;
  if (!args.book) throw new CliError('--book is required');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(args.book)) {
    throw new CliError(`--book ${JSON.stringify(args.book)} is not a book slug`);
  }
  if (Boolean(args.retire) === args.prune)
    throw new CliError('give exactly one of --retire <names> or --prune');
  if (args.retire && args.retire.length === 0)
    throw new CliError('--retire needs at least one name');
  return args;
}

/**
 * Everything a retire would do, and every reason it must not. Reads only; writes nothing.
 * Batch semantics: any refusal for any name means nothing is written for any name.
 */
export function planRetire({
  repoRoot,
  booksRoot,
  book,
  names,
  retired,
  git = runGit,
  suffix = DEFAULT_SUFFIX,
}) {
  const bookDir = path.join(booksRoot, book);
  if (!fs.existsSync(bookDir)) return { refusals: [`no book directory at ${bookDir}`] };
  const mappingPath = path.join(bookDir, 'media', 'image-mapping.json');
  let rows;
  try {
    rows = readMappingOrRefuse(mappingPath, { allowMissing: true });
  } catch (err) {
    return { refusals: [err.message] };
  }
  const sourceBasenames = indexBookSourceBasenames(bookDir);
  const refusals = [];
  const removeNames = new Set();
  const deletions = new Set();
  const perName = [];
  for (const name of names) {
    if (!retired.has(name)) {
      refusals.push(
        `${name}: no retiredFigures entry — record the ruling in the figure config first`
      );
      continue;
    }
    if (!sourceBasenames.has(name)) {
      refusals.push(`${name}: no image of that name in ${book}'s source CNXML — wrong --book?`);
      continue;
    }
    if (fs.existsSync(path.join(bookDir, 'figure-text', `${name}.is.json`))) {
      refusals.push(
        `${name}: has a sidecar, i.e. a current paid translation — retiring that is a different decision`
      );
      continue;
    }
    const mine = rows.filter((r) => r.originalImage === name);
    const files = [];
    let bad = false;
    for (const r of mine) {
      const out = r.outputName;
      const ext = typeof out === 'string' ? path.extname(out) : '';
      if (
        typeof out !== 'string' ||
        ext === '' ||
        out !== `${name}${suffix}${ext}` ||
        escapesMediaDir(bookDir, out)
      ) {
        refusals.push(
          `${name}: its mapping row names ${JSON.stringify(out)}, which is not ${name}${suffix}.<ext> inside media/`
        );
        bad = true;
        continue;
      }
      if (fs.existsSync(path.join(bookDir, 'media', out))) files.push(out);
    }
    if (bad) continue;
    if (mine.length) removeNames.add(name);
    // A half-done retire leaves the copy without its row: the name rule finds it, so a re-run finishes.
    for (const f of topLevelTranslatedCopies(bookDir, name, suffix))
      if (!files.includes(f)) files.push(f);
    for (const f of files) deletions.add(path.relative(repoRoot, path.join(bookDir, 'media', f)));
    perName.push({ name, rows: mine.length, files });
  }
  const deletionList = [...deletions];
  const clean = cleanTrackedSet(repoRoot, deletionList, git);
  for (const rel of deletionList) {
    if (!clean.has(rel))
      refusals.push(
        `${rel}: not tracked by git, or modified — git is the backup a deletion relies on`
      );
  }
  return { refusals, mappingPath, rows, removeNames, deletions: deletionList, perName };
}

/** Carry out a retire plan. On any failure, restore the mapping bytes and every deleted file. */
export function applyRetire(plan, { repoRoot, git = runGit, unlink = fs.unlinkSync }) {
  const done = [];
  const deleted = [];
  const before = fs.existsSync(plan.mappingPath) ? fs.readFileSync(plan.mappingPath) : null;
  let mappingWritten = false;
  try {
    if (plan.removeNames.size > 0) {
      const kept = plan.rows.filter((r) => !plan.removeNames.has(r.originalImage));
      writeAtomically(plan.mappingPath, JSON.stringify(kept, null, 2) + '\n');
      mappingWritten = true;
      done.push(
        `removed ${plan.rows.length - kept.length} row(s) from ${path.relative(repoRoot, plan.mappingPath)}`
      );
    }
    for (const rel of plan.deletions) {
      unlink(path.join(repoRoot, rel));
      deleted.push(rel);
      done.push(`deleted ${rel}`);
    }
    return { ok: true, done };
  } catch (err) {
    // Each undo is attempted on its OWN: if restoring the mapping fails, the deleted files must
    // still be restored — and the reverse — rather than the first failure ending the rollback.
    const problems = [];
    try {
      if (mappingWritten && before !== null) writeAtomically(plan.mappingPath, before);
    } catch (e) {
      problems.push(e.message);
    }
    try {
      restoreFromHead(repoRoot, deleted, git);
    } catch (e) {
      problems.push(e.message);
    }
    const restoreError = problems.length ? problems.join('; ') : undefined;
    return { ok: false, done, error: err.message, restoreError };
  }
}

function where(rel, bookRel) {
  const l = locate(rel, bookRel);
  return l.track && l.chapter
    ? `${l.area} · ${l.track} · ${l.chapter} · ${path.basename(rel)}`
    : rel;
}

function failed(result, err, restored) {
  err(
    `FAILED part-way (${result.error}); ` +
      (result.restoreError
        ? `RESTORE ALSO FAILED: ${result.restoreError} — restore by hand from git`
        : `${restored} restored`)
  );
  return 1;
}

function runRetire(args, { repoRoot, booksRoot, git, retired, unlink, out, err }) {
  const plan = planRetire({
    repoRoot,
    booksRoot,
    book: args.book,
    names: args.retire,
    retired,
    git,
  });
  if (plan.refusals.length) {
    err('REFUSED — nothing was written:');
    for (const r of plan.refusals) err(`  ${r}`);
    return 1;
  }
  const bookRel = path.relative(repoRoot, path.join(booksRoot, args.book));
  const needle = (n) => `${n}${DEFAULT_SUFFIX}.`;
  const refs = findReferences({
    repoRoot,
    bookRel,
    needles: new Set(args.retire.map(needle)),
    suffix: DEFAULT_SUFFIX,
    git,
  });
  for (const p of plan.perName) {
    out(p.name);
    if (p.rows || p.files.length) {
      const copies = p.files.length
        ? p.files.map((f) => `media/${f}`).join(', ')
        : 'no translated copy';
      out(`  ${args.apply ? 'removing' : 'would remove'}: ${p.rows} mapping row(s); ${copies}`);
    } else {
      out('  nothing to retire: no mapping row, no translated copy');
    }
    const by = refs.get(needle(p.name)) || [];
    if (by.length === 0) {
      out('  no page or CNXML file references it');
    } else {
      out(
        `  still referenced by ${by.length} file(s) — pages change only in the whole-book re-inject and re-render (②):`
      );
      for (const rel of by) out(`    ${where(rel, bookRel)}`);
    }
  }
  if (!args.apply) {
    out('\nDry run — nothing was written. Add --apply to retire.');
    return 0;
  }
  const result = applyRetire(plan, { repoRoot, git, unlink });
  for (const d of result.done) out(`  ${d}`);
  if (!result.ok) return failed(result, err, 'the mapping and every file already deleted were');
  out(
    `\nDone. After the whole-book re-inject and re-render (②), run:\n  node tools/retire-translated-figure.js --book ${args.book} --prune`
  );
  return 0;
}

/** A name a page can reference only in plain form; any other name might be URL-encoded there. */
const PLAIN_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * Which published copies to delete, and why every other one is kept. Reads only.
 * A copy is deleted only when NO mapping row names it, NOTHING references it (spec D13), its name
 * is plain, and git tracks it unmodified. The run is REFUSED, before any copy is judged, when the
 * mapping cannot be read — a missing one included, whenever at least one published copy exists.
 */
export function planPrune({ repoRoot, booksRoot, book, git = runGit, suffix = DEFAULT_SUFFIX }) {
  const bookDir = path.join(booksRoot, book);
  if (!fs.existsSync(bookDir)) return { refusals: [`no book directory at ${bookDir}`] };
  const bookRel = path.relative(repoRoot, bookDir);
  const copies = publishedCopies(repoRoot, bookRel, suffix);
  let rows;
  try {
    // A translated copy reaches 05-publication only through a mapping row, so with any copy to judge a
    // missing mapping is an inconsistent checkout, and reading it as "no rows" would make every copy
    // look unmapped (and, once the pages are re-rendered, unreferenced too): refuse. With no copy there
    // is nothing to judge, so the plan is simply empty. Settled before any deletion is considered.
    rows = readMappingOrRefuse(path.join(bookDir, 'media', 'image-mapping.json'), {
      allowMissing: copies.length === 0,
    });
  } catch (err) {
    return { refusals: [err.message] };
  }
  const mapped = new Set(
    rows.filter((r) => typeof r.outputName === 'string').map((r) => r.outputName)
  );
  const needles = new Set(copies.map((c) => referenceNeedle(path.basename(c))));
  const refs = findReferences({ repoRoot, bookRel, needles, suffix, git });
  const clean = cleanTrackedSet(repoRoot, copies, git);
  const del = [];
  const keep = [];
  for (const rel of copies) {
    const name = path.basename(rel);
    const by = refs.get(referenceNeedle(name)) || [];
    if (mapped.has(name)) {
      keep.push({ rel, kind: 'mapped', why: 'a mapping row still names it' });
    } else if (by.length) {
      keep.push({
        rel,
        kind: 'referenced',
        why: `still referenced by ${by[0]}${by.length > 1 ? ` and ${by.length - 1} more` : ''}`,
      });
    } else if (!PLAIN_NAME.test(name)) {
      keep.push({
        rel,
        kind: 'encoded',
        why: 'its name could be URL-encoded where a page references it — check by hand',
      });
    } else if (!clean.has(rel)) {
      keep.push({
        rel,
        kind: 'git',
        why: 'not tracked by git, or modified — git is the backup a deletion relies on',
      });
    } else {
      del.push(rel);
    }
  }
  return { refusals: [], del, keep };
}

/** Delete the planned copies. On any failure, restore every copy already deleted. */
export function applyPrune(plan, { repoRoot, git = runGit, unlink = fs.unlinkSync }) {
  const deleted = [];
  try {
    for (const rel of plan.del) {
      unlink(path.join(repoRoot, rel));
      deleted.push(rel);
    }
    return { ok: true, done: deleted.map((r) => `deleted ${r}`) };
  } catch (err) {
    let restoreError;
    try {
      restoreFromHead(repoRoot, deleted, git);
    } catch (e) {
      restoreError = e.message;
    }
    return {
      ok: false,
      done: deleted.map((r) => `deleted ${r}`),
      error: err.message,
      restoreError,
    };
  }
}

function runPrune(args, { repoRoot, booksRoot, git, unlink, out, err }) {
  const plan = planPrune({ repoRoot, booksRoot, book: args.book, git });
  if (plan.refusals.length) {
    err('REFUSED — nothing was deleted:');
    for (const r of plan.refusals) err(`  ${r}`);
    return 1;
  }
  const mappedCount = plan.keep.filter((k) => k.kind === 'mapped').length;
  out(
    `${plan.del.length + plan.keep.length} published translated copies: ${plan.del.length} to delete, ` +
      `${plan.keep.length} kept (${mappedCount} still mapped).`
  );
  for (const k of plan.keep) if (k.kind !== 'mapped') out(`  keep ${k.rel} — ${k.why}`);
  for (const rel of plan.del) out(`  ${args.apply ? 'delete' : 'would delete'} ${rel}`);
  if (!args.apply) {
    out('\nDry run — nothing was deleted. Add --apply to prune.');
    return 0;
  }
  const result = applyPrune(plan, { repoRoot, git, unlink });
  if (!result.ok) return failed(result, err, 'every file already deleted was');
  out(`\nDone: ${result.done.length} deleted.`);
  return 0;
}

/**
 * The whole CLI as a function, with every side channel injectable.
 * @returns {number} the exit code
 */
export function run(
  argv,
  {
    repoRoot = REPO_ROOT,
    booksRoot = path.join(REPO_ROOT, 'books'),
    git = runGit,
    retired,
    unlink = fs.unlinkSync,
    out = console.log,
    err = console.error,
  } = {}
) {
  let args;
  try {
    args = parseCli(argv);
  } catch (e) {
    if (!(e instanceof CliError)) throw e;
    err(e.message);
    err(USAGE);
    return 2;
  }
  if (args.help) {
    out(USAGE);
    return 0;
  }
  if (args.retire) {
    return runRetire(args, {
      repoRoot,
      booksRoot,
      git,
      retired: retired ?? loadRetiredFigures(),
      unlink,
      out,
      err,
    });
  }
  return runPrune(args, { repoRoot, booksRoot, git, unlink, out, err });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = 1; // a failure default, overwritten only when a verdict is reached
  process.exitCode = run(process.argv.slice(2));
}
